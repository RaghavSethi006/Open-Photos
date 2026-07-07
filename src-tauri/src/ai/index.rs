use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

const FACE_INDEX_FILE: &str = "face_index.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub id: String,
    pub name: String,
    pub face_count: u32,
    pub thumbnail_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaceRecord {
    pub id: String,
    pub photo_path: String,
    pub face_index: usize,
    pub embedding: Vec<f32>,
    pub bbox: [f32; 4],
    pub landmarks: [[f32; 2]; 5],
    pub confidence: f32,
    pub person_id: Option<String>,
    pub rejected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaceIndex {
    pub version: u32,
    pub model_type: String,
    pub similarity_threshold: f32,
    pub people: Vec<Person>,
    pub faces: Vec<FaceRecord>,
}

impl FaceIndex {
    pub fn new(model_type: String, similarity_threshold: f32) -> Self {
        Self {
            version: 1,
            model_type,
            similarity_threshold,
            people: vec![],
            faces: vec![],
        }
    }
}

fn index_path() -> Result<PathBuf, String> {
    let mut path =
        dirs_next::data_dir().ok_or_else(|| "Could not find app data directory.".to_string())?;
    path.push("com.localphotos.app");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push(FACE_INDEX_FILE);
    Ok(path)
}

pub fn read_index() -> Result<FaceIndex, String> {
    let path = index_path()?;
    if !path.exists() {
        return Ok(FaceIndex::new("buffalo_s".to_string(), 0.55));
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub fn write_index(index: &FaceIndex) -> Result<(), String> {
    let path = index_path()?;
    let content = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &path).map_err(|e| e.to_string())
}

pub fn add_faces(
    photo_path: &str,
    embeddings: &[crate::ai::clustering::FaceEmbedding],
    model_type: &str,
    threshold: f32,
) -> Result<Vec<FaceRecord>, String> {
    let mut index = read_index()?;
    index.model_type = model_type.to_string();
    index.similarity_threshold = threshold;
    upsert_faces_in_memory(&mut index, photo_path, embeddings, threshold);
    write_index(&index)?;
    Ok(index
        .faces
        .iter()
        .filter(|f| f.photo_path == photo_path)
        .cloned()
        .collect())
}

pub fn upsert_faces_in_memory(
    index: &mut FaceIndex,
    photo_path: &str,
    embeddings: &[crate::ai::clustering::FaceEmbedding],
    threshold: f32,
) -> usize {
    let previous_faces: Vec<FaceRecord> = index
        .faces
        .iter()
        .filter(|f| f.photo_path == photo_path)
        .cloned()
        .collect();
    index.faces.retain(|f| f.photo_path != photo_path);

    let mut count = 0;
    for emb in suppress_overlapping_detections(embeddings) {
        let previous_match = previous_faces.iter().find(|old| {
            old.face_index == emb.face_index
                || (bbox_iou(&old.bbox, &emb.bbox) >= 0.5
                    && cosine_sim(&old.embedding, &emb.embedding) >= threshold)
        });
        index.faces.push(FaceRecord {
            id: Uuid::new_v4().to_string(),
            photo_path: photo_path.to_string(),
            face_index: emb.face_index,
            embedding: emb.embedding.clone(),
            bbox: emb.bbox,
            landmarks: emb.landmarks,
            confidence: emb.confidence,
            person_id: previous_match.and_then(|face| face.person_id.clone()),
            rejected: previous_match.map(|face| face.rejected).unwrap_or(false),
        });
        count += 1;
    }
    count
}

pub fn auto_cluster() -> Result<(), String> {
    let mut index = read_index()?;
    cluster_index(&mut index);
    write_index(&index)
}

pub fn cluster_index(index: &mut FaceIndex) {
    let threshold = index.similarity_threshold;
    let merge_threshold = (threshold - 0.12).max(0.30); // more lenient, centroid-vs-centroid

    // Step 1: attach unassigned faces to existing people via centroid matching
    let centroids = compute_person_centroids(index);
    if !centroids.is_empty() {
        for face in index.faces.iter_mut() {
            if face.person_id.is_some() || face.rejected {
                continue;
            }
            if let Some(person_id) =
                find_best_centroid_match(&face.embedding, &centroids, merge_threshold)
            {
                face.person_id = Some(person_id);
            }
        }
    }

    // Step 2: pairwise-cluster remaining unassigned faces into new people
    let unassigned_indices: Vec<usize> = index
        .faces
        .iter()
        .enumerate()
        .filter(|(_, f)| f.person_id.is_none() && !f.rejected)
        .map(|(i, _)| i)
        .collect();

    let n = unassigned_indices.len();
    if n >= 2 {
        let unassigned_embs: Vec<Vec<f32>> = unassigned_indices
            .iter()
            .map(|&i| index.faces[i].embedding.clone())
            .collect();

        let mut adjacency: Vec<Vec<usize>> = vec![vec![]; n];
        for i in 0..n {
            for j in (i + 1)..n {
                if cosine_sim(&unassigned_embs[i], &unassigned_embs[j]) >= threshold {
                    adjacency[i].push(j);
                    adjacency[j].push(i);
                }
            }
        }

        let mut visited = vec![false; n];
        for i in 0..n {
            if visited[i] {
                continue;
            }
            let mut cluster = vec![];
            let mut stack = vec![i];
            while let Some(node) = stack.pop() {
                if visited[node] {
                    continue;
                }
                visited[node] = true;
                cluster.push(node);
                for &nb in &adjacency[node] {
                    if !visited[nb] {
                        stack.push(nb);
                    }
                }
            }
            if cluster.len() >= 2 {
                let person_id = Uuid::new_v4().to_string();
                let person_name = format!("Person {}", index.people.len() + 1);
                let first_idx = unassigned_indices[cluster[0]];
                let thumbnail_path = index.faces[first_idx].photo_path.clone();

                for &ci in &cluster {
                    index.faces[unassigned_indices[ci]].person_id = Some(person_id.clone());
                }

                index.people.push(Person {
                    id: person_id,
                    name: person_name,
                    face_count: cluster.len() as u32,
                    thumbnail_path,
                });
            }
        }
    }

    // Step 3: merge any people whose centroids are near-duplicates
    merge_similar_people(index, merge_threshold);
    update_person_counts(index);
}

fn compute_person_centroids(index: &FaceIndex) -> Vec<(String, Vec<f32>)> {
    let mut sums: HashMap<String, (Vec<f32>, u32)> = HashMap::new();
    for face in &index.faces {
        if face.rejected {
            continue;
        }
        let Some(person_id) = face.person_id.as_ref() else {
            continue;
        };
        if face.embedding.is_empty() {
            continue;
        }
        let entry = sums
            .entry(person_id.clone())
            .or_insert_with(|| (vec![0.0; face.embedding.len()], 0));
        for (sum, value) in entry.0.iter_mut().zip(face.embedding.iter()) {
            *sum += *value;
        }
        entry.1 += 1;
    }

    sums.into_iter()
        .filter_map(|(person_id, (mut sum, count))| {
            if count == 0 {
                return None;
            }
            for value in &mut sum {
                *value /= count as f32;
            }
            Some((person_id, sum))
        })
        .collect()
}

fn find_best_centroid_match(
    embedding: &[f32],
    centroids: &[(String, Vec<f32>)],
    threshold: f32,
) -> Option<String> {
    centroids
        .iter()
        .map(|(id, centroid)| (id, cosine_sim(embedding, centroid)))
        .filter(|(_, sim)| *sim >= threshold)
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(id, _)| id.clone())
}

fn merge_similar_people(index: &mut FaceIndex, threshold: f32) {
    loop {
        let centroids = compute_person_centroids(index);
        let mut merge_pair: Option<(String, String)> = None;
        'outer: for i in 0..centroids.len() {
            for j in (i + 1)..centroids.len() {
                if cosine_sim(&centroids[i].1, &centroids[j].1) >= threshold {
                    let (keep, drop) = choose_merge_order(&centroids[i].0, &centroids[j].0, index);
                    merge_pair = Some((keep, drop));
                    break 'outer;
                }
            }
        }
        let Some((keep, drop)) = merge_pair else {
            break;
        };
        for face in index.faces.iter_mut() {
            if face.person_id.as_deref() == Some(drop.as_str()) {
                face.person_id = Some(keep.clone());
            }
        }
        index.people.retain(|p| p.id != drop);
    }
}

fn choose_merge_order(a: &str, b: &str, index: &FaceIndex) -> (String, String) {
    let a_is_auto = is_auto_person(a, index);
    let b_is_auto = is_auto_person(b, index);
    if a_is_auto && !b_is_auto {
        return (b.to_string(), a.to_string());
    }
    if b_is_auto && !a_is_auto {
        return (a.to_string(), b.to_string());
    }
    let a_count = index
        .faces
        .iter()
        .filter(|f| f.person_id.as_deref() == Some(a))
        .count();
    let b_count = index
        .faces
        .iter()
        .filter(|f| f.person_id.as_deref() == Some(b))
        .count();
    if a_count >= b_count {
        (a.to_string(), b.to_string())
    } else {
        (b.to_string(), a.to_string())
    }
}

fn is_auto_person(person_id: &str, index: &FaceIndex) -> bool {
    index
        .people
        .iter()
        .find(|p| p.id == person_id)
        .map(|p| {
            p.name
                .strip_prefix("Person ")
                .map(|suffix| !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()))
                .unwrap_or(false)
        })
        .unwrap_or(false)
}

fn suppress_overlapping_detections(
    embeddings: &[crate::ai::clustering::FaceEmbedding],
) -> Vec<crate::ai::clustering::FaceEmbedding> {
    let mut sorted = embeddings.to_vec();
    sorted.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut kept: Vec<crate::ai::clustering::FaceEmbedding> = Vec::new();
    for emb in sorted {
        if kept.iter().all(|kept_emb| bbox_iou(&kept_emb.bbox, &emb.bbox) < 0.75) {
            kept.push(emb);
        }
    }

    kept.sort_by_key(|emb| emb.face_index);
    kept
}

fn bbox_iou(a: &[f32; 4], b: &[f32; 4]) -> f32 {
    let x1 = a[0].max(b[0]);
    let y1 = a[1].max(b[1]);
    let x2 = a[2].min(b[2]);
    let y2 = a[3].min(b[3]);
    let intersection_w = (x2 - x1).max(0.0);
    let intersection_h = (y2 - y1).max(0.0);
    let intersection = intersection_w * intersection_h;

    let area_a = ((a[2] - a[0]).max(0.0)) * ((a[3] - a[1]).max(0.0));
    let area_b = ((b[2] - b[0]).max(0.0)) * ((b[3] - b[1]).max(0.0));
    let union = area_a + area_b - intersection;

    if union <= 0.0 {
        0.0
    } else {
        intersection / union
    }
}

fn cosine_sim(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

pub fn assign_person(
    face_ids: &[String],
    person_id_hint: Option<&str>,
    person_name: &str,
) -> Result<Person, String> {
    let mut index = read_index()?;

    let existing_id = person_id_hint
        .filter(|id| index.people.iter().any(|p| p.id == *id))
        .map(|id| id.to_string())
        .or_else(|| {
            index
                .people
                .iter()
                .find(|p| p.name == person_name)
                .map(|p| p.id.clone())
        });

    let target_id = match existing_id {
        Some(id) => id,
        None => {
            let id = Uuid::new_v4().to_string();
            index.people.push(Person {
                id: id.clone(),
                name: person_name.to_string(),
                face_count: 0,
                thumbnail_path: String::new(),
            });
            id
        }
    };

    for face in &mut index.faces {
        if face_ids.contains(&face.id) {
            face.person_id = Some(target_id.clone());
            face.rejected = false;
        }
    }

    update_person_counts(&mut index);
    write_index(&index)?;
    Ok(index
        .people
        .iter()
        .find(|p| p.id == target_id)
        .cloned()
        .ok_or_else(|| "Person not found after assignment.".to_string())?)
}

pub fn assign_person_to_index(
    index: &mut FaceIndex,
    face_ids: &[String],
    person_id: Option<&str>,
    person_name: &str,
) -> Result<Person, String> {
    let target_id = match person_id {
        Some(id) => {
            if !index.people.iter().any(|p| p.id == id) {
                return Err("Person not found.".to_string());
            }
            id.to_string()
        }
        None => {
            let id = Uuid::new_v4().to_string();
            index.people.push(Person {
                id: id.clone(),
                name: person_name.to_string(),
                face_count: 0,
                thumbnail_path: String::new(),
            });
            id
        }
    };

    for face in &mut index.faces {
        if face_ids.contains(&face.id) {
            face.person_id = Some(target_id.clone());
            face.rejected = false;
        }
    }

    update_person_counts(index);
    index
        .people
        .iter()
        .find(|p| p.id == target_id)
        .cloned()
        .ok_or_else(|| "Person not found after assignment.".to_string())
}

pub fn merge_people(person_ids: &[String], target_name: &str) -> Result<Vec<Person>, String> {
    let mut index = read_index()?;

    let target_id = Uuid::new_v4().to_string();
    index.people.push(Person {
        id: target_id.clone(),
        name: target_name.to_string(),
        face_count: 0,
        thumbnail_path: String::new(),
    });

    for face in &mut index.faces {
        if let Some(ref pid) = face.person_id {
            if person_ids.contains(pid) {
                face.person_id = Some(target_id.clone());
            }
        }
    }

    index.people.retain(|p| !person_ids.contains(&p.id));
    update_person_counts(&mut index);
    write_index(&index)?;

    Ok(index.people)
}

pub fn delete_person(person_id: &str) -> Result<(), String> {
    let mut index = read_index()?;
    for face in &mut index.faces {
        if face.person_id.as_deref() == Some(person_id) {
            face.person_id = None;
        }
    }
    index.people.retain(|p| p.id != person_id);
    write_index(&index)
}

pub fn reject_faces(face_ids: &[String]) -> Result<(), String> {
    let mut index = read_index()?;
    for face in &mut index.faces {
        if face_ids.contains(&face.id) {
            face.rejected = true;
            face.person_id = None;
        }
    }
    write_index(&index)
}

pub fn get_faces_for_photo(photo_path: &str) -> Result<Vec<FaceRecord>, String> {
    let index = read_index()?;
    Ok(index
        .faces
        .into_iter()
        .filter(|f| f.photo_path == photo_path && !f.rejected)
        .collect())
}

pub fn get_faces_for_person(person_id: &str) -> Result<Vec<FaceRecord>, String> {
    let index = read_index()?;
    Ok(index
        .faces
        .into_iter()
        .filter(|f| f.person_id.as_deref() == Some(person_id) && !f.rejected)
        .collect())
}

pub fn get_all_people_with_counts() -> Result<Vec<Person>, String> {
    let index = read_index()?;
    Ok(index.people)
}

fn update_person_counts(index: &mut FaceIndex) {
    let mut counts: HashMap<String, (u32, String)> = HashMap::new();
    for face in &index.faces {
        if let Some(ref pid) = face.person_id {
            if face.rejected {
                continue;
            }
            let entry = counts.entry(pid.clone()).or_insert((0, String::new()));
            entry.0 += 1;
            if entry.1.is_empty() {
                entry.1 = face.photo_path.clone();
            }
        }
    }
    for person in &mut index.people {
        let entry = counts.get(&person.id);
        person.face_count = entry.map(|(c, _)| *c).unwrap_or(0);
        person.thumbnail_path = entry.map(|(_, p)| p.clone()).unwrap_or_default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_file(name: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "lgp_face_index_test_{}_{}.json",
            name,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        path
    }

    fn embedding(face_index: usize, photo_path: &str) -> crate::ai::clustering::FaceEmbedding {
        embedding_with(face_index, photo_path, vec![1.0, 0.0, 0.0], [0.1, 0.1, 0.2, 0.2], 0.9)
    }

    fn embedding_with(
        face_index: usize,
        photo_path: &str,
        values: Vec<f32>,
        bbox: [f32; 4],
        confidence: f32,
    ) -> crate::ai::clustering::FaceEmbedding {
        crate::ai::clustering::FaceEmbedding {
            photo_path: photo_path.to_string(),
            face_index,
            embedding: values,
            bbox,
            landmarks: [[0.0, 0.0]; 5],
            confidence,
        }
    }

    #[test]
    fn write_index_is_atomic() {
        let path = unique_temp_file("atomic");
        let index = FaceIndex::new("buffalo_s".to_string(), 0.6);

        let content = serde_json::to_string_pretty(&index).unwrap();
        let tmp_path = path.with_extension("json.tmp");
        fs::write(&tmp_path, &content).unwrap();
        fs::rename(&tmp_path, &path).unwrap();

        let readback = fs::read_to_string(&path).unwrap();
        let parsed: FaceIndex = serde_json::from_str(&readback).unwrap();
        assert_eq!(parsed.model_type, "buffalo_s");
        assert!(!path.with_extension("json.tmp").exists());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn upsert_faces_in_memory_replaces_old_faces_for_same_photo() {
        let mut index = FaceIndex::new("buffalo_s".to_string(), 0.6);
        let first = vec![embedding_with(0, "a.jpg", vec![1.0, 0.0, 0.0], [0.1, 0.1, 0.2, 0.2], 0.9)];
        let second = vec![
            embedding_with(0, "a.jpg", vec![1.0, 0.0, 0.0], [0.1, 0.1, 0.2, 0.2], 0.9),
            embedding_with(1, "a.jpg", vec![1.0, 0.0, 0.0], [0.3, 0.3, 0.4, 0.4], 0.9),
        ];

        upsert_faces_in_memory(&mut index, "a.jpg", &first, 0.6);
        upsert_faces_in_memory(&mut index, "a.jpg", &second, 0.6);

        assert_eq!(index.faces.len(), 2);
        assert!(index.faces.iter().all(|face| face.photo_path == "a.jpg"));
    }

    #[test]
    fn upsert_preserves_person_id_when_rescanning_same_face() {
        let mut index = FaceIndex::new("buffalo_s".to_string(), 0.6);
        index.people.push(Person {
            id: "person-1".to_string(),
            name: "Person 1".to_string(),
            face_count: 0,
            thumbnail_path: String::new(),
        });
        upsert_faces_in_memory(
            &mut index,
            "a.jpg",
            &[embedding_with(0, "a.jpg", vec![1.0, 0.0, 0.0], [0.1, 0.1, 0.2, 0.2], 0.8)],
            0.6,
        );
        index.faces[0].person_id = Some("person-1".to_string());
        update_person_counts(&mut index);

        upsert_faces_in_memory(
            &mut index,
            "a.jpg",
            &[embedding_with(0, "a.jpg", vec![0.99, 0.01, 0.0], [0.105, 0.1, 0.205, 0.2], 0.9)],
            0.6,
        );

        assert_eq!(index.faces[0].person_id.as_deref(), Some("person-1"));
    }

    #[test]
    fn upsert_suppresses_overlapping_duplicate_detections() {
        let mut index = FaceIndex::new("buffalo_s".to_string(), 0.6);
        let count = upsert_faces_in_memory(
            &mut index,
            "a.jpg",
            &[
                embedding_with(0, "a.jpg", vec![1.0, 0.0, 0.0], [0.1, 0.1, 0.4, 0.4], 0.7),
                embedding_with(1, "a.jpg", vec![1.0, 0.0, 0.0], [0.11, 0.11, 0.41, 0.41], 0.95),
            ],
            0.6,
        );

        assert_eq!(count, 1);
        assert_eq!(index.faces[0].confidence, 0.95);
    }

    #[test]
    fn cluster_attaches_unassigned_face_to_existing_person() {
        let mut index = FaceIndex::new("buffalo_s".to_string(), 0.6);
        index.people.push(Person {
            id: "person-1".to_string(),
            name: "Person 1".to_string(),
            face_count: 0,
            thumbnail_path: String::new(),
        });
        upsert_faces_in_memory(&mut index, "a.jpg", &[embedding(0, "a.jpg")], 0.6);
        index.faces[0].person_id = Some("person-1".to_string());
        upsert_faces_in_memory(
            &mut index,
            "b.jpg",
            &[embedding_with(0, "b.jpg", vec![0.99, 0.01, 0.0], [0.1, 0.1, 0.2, 0.2], 0.9)],
            0.6,
        );

        cluster_index(&mut index);

        assert_eq!(index.people.len(), 1);
        assert_eq!(index.faces[1].person_id.as_deref(), Some("person-1"));
        assert_eq!(index.people[0].face_count, 2);
    }

    #[test]
    fn cluster_merges_similar_people() {
        let mut index = FaceIndex::new("buffalo_s".to_string(), 0.6);
        index.people.push(Person {
            id: "person-1".to_string(),
            name: "Person 1".to_string(),
            face_count: 0,
            thumbnail_path: String::new(),
        });
        index.people.push(Person {
            id: "person-2".to_string(),
            name: "Person 2".to_string(),
            face_count: 0,
            thumbnail_path: String::new(),
        });
        upsert_faces_in_memory(&mut index, "a.jpg", &[embedding(0, "a.jpg")], 0.6);
        index.faces[0].person_id = Some("person-1".to_string());
        upsert_faces_in_memory(
            &mut index,
            "b.jpg",
            &[embedding_with(0, "b.jpg", vec![0.99, 0.01, 0.0], [0.1, 0.1, 0.2, 0.2], 0.9)],
            0.6,
        );
        index.faces[1].person_id = Some("person-2".to_string());

        cluster_index(&mut index);

        assert_eq!(index.people.len(), 1);
        assert_eq!(index.people[0].face_count, 2);
        assert_eq!(index.faces[0].person_id, index.faces[1].person_id);
    }

    #[test]
    fn assign_person_respects_person_id_parameter() {
        let mut index = FaceIndex::new("buffalo_s".to_string(), 0.6);
        index.people.push(Person {
            id: "alex-1".to_string(),
            name: "Alex".to_string(),
            face_count: 0,
            thumbnail_path: String::new(),
        });
        index.people.push(Person {
            id: "alex-2".to_string(),
            name: "Alex".to_string(),
            face_count: 0,
            thumbnail_path: String::new(),
        });
        upsert_faces_in_memory(&mut index, "a.jpg", &[embedding(0, "a.jpg")], 0.6);
        let face_id = index.faces[0].id.clone();

        let assigned = assign_person_to_index(
            &mut index,
            &[face_id],
            Some("alex-2"),
            "Alex",
        )
        .unwrap();

        assert_eq!(assigned.id, "alex-2");
        assert_eq!(index.faces[0].person_id.as_deref(), Some("alex-2"));
        assert_eq!(index.people[0].face_count, 0);
        assert_eq!(index.people[1].face_count, 1);
    }
}
