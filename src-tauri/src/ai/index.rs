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
    let content = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
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

    index.faces.retain(|f| f.photo_path != photo_path);

    let mut new_faces = Vec::new();
    for emb in embeddings {
        let record = FaceRecord {
            id: Uuid::new_v4().to_string(),
            photo_path: photo_path.to_string(),
            face_index: emb.face_index,
            bbox: emb.bbox,
            landmarks: emb.landmarks,
            confidence: emb.confidence,
            person_id: None,
            rejected: false,
        };
        new_faces.push(record);
    }

    index.faces.extend(new_faces.clone());
    write_index(&index)?;
    Ok(new_faces)
}

pub fn assign_person(face_ids: &[String], person_name: &str) -> Result<Person, String> {
    let mut index = read_index()?;

    let existing = index.people.iter().find(|p| p.name == person_name);
    let person_id = match existing {
        Some(p) => p.id.clone(),
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
            face.person_id = Some(person_id.clone());
            face.rejected = false;
        }
    }

    update_person_counts(&mut index);
    write_index(&index)?;
    Ok(index.people.iter().find(|p| p.name == person_name).unwrap().clone())
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

    let merged = index.people.clone();
    Ok(merged)
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
        person.thumbnail_path = entry.map(|(_, p)| p).unwrap_or_default();
    }
}
