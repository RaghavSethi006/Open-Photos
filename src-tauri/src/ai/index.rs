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
        return Ok(FaceIndex::new("buffalo_s".to_string(), 0.6));
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub fn write_index(index: &FaceIndex) -> Result<(), String> {
    let path = index_path()?;
    write_index_to_path(&path, index)
}

fn write_index_to_path(path: &PathBuf, index: &FaceIndex) -> Result<(), String> {
    let content = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    atomic_write_string(path, &content)
}

fn atomic_write_string(path: &PathBuf, content: &str) -> Result<(), String> {
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, content).map_err(|e| e.to_string())?;

    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    fs::rename(&temp_path, path).map_err(|e| e.to_string())
}

pub fn add_faces(
    photo_path: &str,
    embeddings: &[crate::ai::clustering::FaceEmbedding],
    model_type: &str,
    threshold: f32,
) -> Result<Vec<FaceRecord>, String> {
    let mut index = read_index()?;
    let new_faces = add_faces_to_index(&mut index, photo_path, embeddings, model_type, threshold);
    write_index(&index)?;
    Ok(new_faces)
}

pub fn add_faces_to_index(
    index: &mut FaceIndex,
    photo_path: &str,
    embeddings: &[crate::ai::clustering::FaceEmbedding],
    model_type: &str,
    threshold: f32,
) -> Vec<FaceRecord> {
    index.model_type = model_type.to_string();
    index.similarity_threshold = threshold;

    index.faces.retain(|f| f.photo_path != photo_path);

    let mut new_faces = Vec::new();
    for emb in embeddings {
        let record = FaceRecord {
            id: Uuid::new_v4().to_string(),
            photo_path: photo_path.to_string(),
            face_index: emb.face_index,
            embedding: emb.embedding.clone(),
            bbox: emb.bbox,
            landmarks: emb.landmarks,
            confidence: emb.confidence,
            person_id: None,
            rejected: false,
        };
        new_faces.push(record);
    }

    index.faces.extend(new_faces.clone());
    new_faces
}

pub fn auto_cluster() -> Result<(), String> {
    let mut index = read_index()?;
    auto_cluster_index(&mut index);
    write_index(&index)
}

pub fn auto_cluster_index(index: &mut FaceIndex) {
    let threshold = index.similarity_threshold;

    let face_count = index.faces.len();

    struct FaceInfo {
        embedding: Vec<f32>,
    }

    let unassigned: Vec<(usize, FaceInfo)> = index
        .faces
        .iter()
        .enumerate()
        .filter(|(_, f)| f.person_id.is_none() && !f.rejected)
        .map(|(i, f)| {
            (i, FaceInfo {
                embedding: f.embedding.clone(),
            })
        })
        .collect();

    if unassigned.is_empty() {
        return;
    }

    let n = unassigned.len();
    let unassigned_indices: Vec<usize> = unassigned.iter().map(|(i, _)| *i).collect();

    let mut adjacency: Vec<Vec<usize>> = vec![vec![]; n];
    for i in 0..n {
        for j in (i + 1)..n {
            let sim = cosine_sim(&unassigned[i].1.embedding, &unassigned[j].1.embedding);
            if sim >= threshold {
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
        let mut cluster_indices = vec![];
        let mut stack = vec![i];
        while let Some(node) = stack.pop() {
            if visited[node] {
                continue;
            }
            visited[node] = true;
            cluster_indices.push(node);
            for &neighbor in &adjacency[node] {
                if !visited[neighbor] {
                    stack.push(neighbor);
                }
            }
        }
        if cluster_indices.len() >= 2 {
            let person_id = Uuid::new_v4().to_string();
            let person_name = format!("Person {}", index.people.len() + 1);
            let first_face_idx = unassigned_indices[cluster_indices[0]];
            let thumbnail_path = if first_face_idx < face_count {
                index.faces[first_face_idx].photo_path.clone()
            } else {
                String::new()
            };
            for &ci in &cluster_indices {
                let face_idx = unassigned_indices[ci];
                if face_idx < face_count {
                    index.faces[face_idx].person_id = Some(person_id.clone());
                }
            }
            index.people.push(Person {
                id: person_id,
                name: person_name,
                face_count: cluster_indices.len() as u32,
                thumbnail_path,
            });
        }
    }

    update_person_counts(index);
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
    person_id: Option<&str>,
    person_name: &str,
) -> Result<Person, String> {
    let mut index = read_index()?;
    let person = assign_person_to_index(&mut index, face_ids, person_id, person_name)?;
    write_index(&index)?;
    Ok(person)
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

    #[test]
    fn write_index_to_path_leaves_parseable_json_without_temp_file() {
        let path = unique_temp_file("atomic");
        let index = FaceIndex::new("buffalo_s".to_string(), 0.6);

        write_index_to_path(&path, &index).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let parsed: FaceIndex = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed.model_type, "buffalo_s");
        assert!(!path.with_extension("json.tmp").exists());

        let _ = fs::remove_file(path);
    }

    fn embedding(face_index: usize, photo_path: &str) -> crate::ai::clustering::FaceEmbedding {
        crate::ai::clustering::FaceEmbedding {
            photo_path: photo_path.to_string(),
            face_index,
            embedding: vec![1.0, 0.0, 0.0],
            bbox: [0.1, 0.1, 0.2, 0.2],
            landmarks: [[0.0, 0.0]; 5],
            confidence: 0.9,
        }
    }

    #[test]
    fn add_faces_to_index_replaces_photo_faces_without_disk_roundtrip() {
        let mut index = FaceIndex::new("buffalo_s".to_string(), 0.6);
        let first = vec![embedding(0, "a.jpg")];
        let second = vec![embedding(0, "a.jpg"), embedding(1, "a.jpg")];

        add_faces_to_index(&mut index, "a.jpg", &first, "buffalo_s", 0.6);
        add_faces_to_index(&mut index, "a.jpg", &second, "buffalo_s", 0.6);

        assert_eq!(index.faces.len(), 2);
        assert!(index.faces.iter().all(|face| face.photo_path == "a.jpg"));
    }

    #[test]
    fn assign_person_to_index_uses_person_id_before_name() {
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
        let faces = add_faces_to_index(
            &mut index,
            "a.jpg",
            &[embedding(0, "a.jpg")],
            "buffalo_s",
            0.6,
        );

        let assigned = assign_person_to_index(
            &mut index,
            &[faces[0].id.clone()],
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
