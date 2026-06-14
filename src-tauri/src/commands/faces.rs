use crate::ai::analyzer::FaceAnalyzerManager;
use crate::ai::clustering::{self, FaceEmbedding};
use crate::ai::index;
use std::sync::LazyLock;
use tauri::{command, AppHandle, Emitter};

static ANALYZER: LazyLock<FaceAnalyzerManager> = LazyLock::new(|| FaceAnalyzerManager::new());

fn is_image_ext(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".png")
        || lower.ends_with(".webp")
        || lower.ends_with(".heic")
        || lower.ends_with(".bmp")
        || lower.ends_with(".tiff")
        || lower.ends_with(".tif")
}

#[command]
pub async fn check_face_models(app_handle: AppHandle) -> Result<bool, String> {
    if ANALYZER.is_ready() {
        return Ok(true);
    }
    ANALYZER
        .ensure_initialized(Some(&app_handle), crate::ai::analyzer::ModelSize::Small)
        .await?;
    Ok(true)
}

#[command]
pub async fn scan_faces(
    paths: Vec<String>,
    use_large_model: bool,
    app_handle: AppHandle,
) -> Result<Vec<String>, String> {
    let model_size = if use_large_model {
        crate::ai::analyzer::ModelSize::Large
    } else {
        crate::ai::analyzer::ModelSize::Small
    };

    ANALYZER
        .ensure_initialized(Some(&app_handle), model_size)
        .await?;

    let analyzer_guard = ANALYZER.get_analyzer()?;
    let analyzer = analyzer_guard
        .as_ref()
        .ok_or_else(|| "Face analyzer not initialized.".to_string())?;

    let total = paths.len();
    let mut all_embeddings: Vec<FaceEmbedding> = Vec::new();
    let mut processed_photos: Vec<String> = Vec::new();

    for (idx, path) in paths.iter().enumerate() {
        if !is_image_ext(path) {
            continue;
        }

        let img = match image::open(path) {
            Ok(img) => img,
            Err(_) => continue,
        };

        let faces = match analyzer.analyze(&img) {
            Ok(f) => f,
            Err(_) => continue,
        };

        if faces.is_empty() {
            continue;
        }

        let model_type = if use_large_model { "buffalo_l" } else { "buffalo_s" };
        let mut face_embeddings = Vec::new();

        for (fi, face) in faces.iter().enumerate() {
            if face.embedding.is_empty() {
                continue;
            }
            let emb = FaceEmbedding {
                photo_path: path.clone(),
                face_index: fi,
                embedding: face.embedding.clone(),
                bbox: face.detection.bbox,
                landmarks: face.detection.landmarks,
                confidence: face.detection.score,
            };
            face_embeddings.push(emb);
        }

        if !face_embeddings.is_empty() {
            let _ = index::add_faces(path, &face_embeddings, model_type, 0.6);
            all_embeddings.extend(face_embeddings);
            processed_photos.push(path.clone());
        }

        let _ = app_handle.emit(
            "face:progress",
            serde_json::json!({
                "scanned": idx + 1,
                "total": total,
                "photosWithFaces": processed_photos.len(),
                "facesFound": all_embeddings.len(),
                "currentFile": path,
            }),
        );
    }

    let _ = app_handle.emit(
        "face:complete",
        serde_json::json!({
            "scanned": total,
            "photosWithFaces": processed_photos.len(),
            "facesFound": all_embeddings.len(),
        }),
    );

    Ok(processed_photos)
}

#[command]
pub async fn cluster_faces(threshold: f32) -> Result<Vec<serde_json::Value>, String> {
    let idx = index::read_index()?;
    let faces: Vec<FaceEmbedding> = idx
        .faces
        .iter()
        .filter(|f| !f.rejected)
        .map(|f| FaceEmbedding {
            photo_path: f.photo_path.clone(),
            face_index: f.face_index,
            embedding: vec![], // We don't store embeddings in the index
            bbox: f.bbox,
            landmarks: f.landmarks,
            confidence: f.confidence,
        })
        .collect();

    if faces.is_empty() {
        return Ok(vec![]);
    }

    let mut people = idx.people;
    let mut result = Vec::new();

    for person in &people {
        let person_faces: Vec<&FaceRecord> = idx
            .faces
            .iter()
            .filter(|f| f.person_id.as_deref() == Some(&person.id) && !f.rejected)
            .collect();

        result.push(serde_json::json!({
            "id": person.id,
            "name": person.name,
            "faceCount": person.face_count,
            "thumbnailPath": person.thumbnail_path,
            "faces": person_faces,
        }));
    }

    Ok(result)
}

#[command]
pub fn list_people() -> Result<Vec<serde_json::Value>, String> {
    let idx = index::read_index()?;
    let unassigned_count = idx
        .faces
        .iter()
        .filter(|f| f.person_id.is_none() && !f.rejected)
        .count();

    let mut people: Vec<serde_json::Value> = idx
        .people
        .iter()
        .map(|p| {
            let person_faces: Vec<&index::FaceRecord> = idx
                .faces
                .iter()
                .filter(|f| f.person_id.as_deref() == Some(&p.id) && !f.rejected)
                .collect();

            serde_json::json!({
                "id": p.id,
                "name": p.name,
                "faceCount": p.face_count,
                "thumbnailPath": p.thumbnail_path,
            })
        })
        .collect();

    people.push(serde_json::json!({
        "id": "__unassigned__",
        "name": "Unnamed",
        "faceCount": unassigned_count,
        "thumbnailPath": "",
    }));

    Ok(people)
}

#[command]
pub fn name_person(face_ids: Vec<String>, name: String) -> Result<serde_json::Value, String> {
    let person = index::assign_person(&face_ids, &name)?;
    Ok(serde_json::json!({
        "id": person.id,
        "name": person.name,
        "faceCount": person.face_count,
        "thumbnailPath": person.thumbnail_path,
    }))
}

#[command]
pub fn rename_person(person_id: String, name: String) -> Result<(), String> {
    let mut idx = index::read_index()?;
    if let Some(person) = idx.people.iter_mut().find(|p| p.id == person_id) {
        person.name = name;
        index::write_index(&idx)
    } else {
        Err("Person not found.".to_string())
    }
}

#[command]
pub fn merge_people(person_ids: Vec<String>, target_name: String) -> Result<Vec<serde_json::Value>, String> {
    let people = index::merge_people(&person_ids, &target_name)?;
    Ok(people
        .into_iter()
        .map(|p| {
            serde_json::json!({
                "id": p.id,
                "name": p.name,
                "faceCount": p.face_count,
                "thumbnailPath": p.thumbnail_path,
            })
        })
        .collect())
}

#[command]
pub fn delete_person(person_id: String) -> Result<(), String> {
    index::delete_person(&person_id)
}

#[command]
pub fn get_person_photos(person_id: String) -> Result<Vec<String>, String> {
    let faces = index::get_faces_for_person(&person_id)?;
    let mut paths: Vec<String> = faces.into_iter().map(|f| f.photo_path).collect();
    paths.sort();
    paths.dedup();
    Ok(paths)
}

#[command]
pub fn get_photo_faces(photo_path: String) -> Result<Vec<serde_json::Value>, String> {
    let idx = index::read_index()?;
    let faces: Vec<serde_json::Value> = idx
        .faces
        .iter()
        .filter(|f| f.photo_path == photo_path && !f.rejected)
        .map(|f| {
            let person_name = f
                .person_id
                .as_ref()
                .and_then(|pid| idx.people.iter().find(|p| p.id == *pid))
                .map(|p| p.name.as_str())
                .unwrap_or("Unknown");

            serde_json::json!({
                "id": f.id,
                "bbox": f.bbox,
                "confidence": f.confidence,
                "personId": f.person_id,
                "personName": person_name,
            })
        })
        .collect();

    Ok(faces)
}

use index::FaceRecord;
