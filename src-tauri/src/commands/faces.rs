use crate::ai::analyzer::{get_analyzer_manager, ModelSize};
use crate::ai::clustering::FaceEmbedding;
use crate::ai::index::{self, FaceRecord};
use crate::db::get_connection;
use base64::Engine;
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{command, AppHandle, Emitter};

fn thumb_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn crop_face_to_data_url(photo_path: &str, bbox: &[f32; 4]) -> Result<String, String> {
    let img = image::open(photo_path).map_err(|e| format!("Failed to open image: {}", e))?;
    let (w, h) = (img.width() as f32, img.height() as f32);

    let mut x1 = (bbox[0] * w).max(0.0);
    let mut y1 = (bbox[1] * h).max(0.0);
    let mut x2 = (bbox[2] * w).min(w - 1.0);
    let mut y2 = (bbox[3] * h).min(h - 1.0);

    let margin_x = (x2 - x1) * 0.3;
    let margin_y = (y2 - y1) * 0.3;
    x1 = (x1 - margin_x).max(0.0);
    y1 = (y1 - margin_y).max(0.0);
    x2 = (x2 + margin_x).min(w - 1.0);
    y2 = (y2 + margin_y).min(h - 1.0);

    let crop_x = x1 as u32;
    let crop_y = y1 as u32;
    let crop_w = (x2 - x1) as u32;
    let crop_h = (y2 - y1) as u32;

    if crop_w == 0 || crop_h == 0 {
        return Err("Face bounding box has zero area.".to_string());
    }

    let face = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
    let face = face.resize_exact(120, 120, image::imageops::FilterType::CatmullRom);

    let mut buf = std::io::Cursor::new(Vec::new());
    face.write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode thumbnail: {}", e))?;

    let bytes = buf.into_inner();
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

fn cached_face_thumbnail(face_id: &str, photo_path: &str, bbox: &[f32; 4]) -> Option<String> {
    if let Ok(cache) = thumb_cache().lock() {
        if let Some(url) = cache.get(face_id) {
            return Some(url.clone());
        }
    }
    let url = crop_face_to_data_url(photo_path, bbox).ok()?;
    if let Ok(mut cache) = thumb_cache().lock() {
        cache.insert(face_id.to_string(), url.clone());
    }
    Some(url)
}

fn face_thumb_dir() -> Result<std::path::PathBuf, String> {
    let mut path =
        dirs_next::data_dir().ok_or_else(|| "Could not find app data directory.".to_string())?;
    path.push("com.localphotos.app");
    path.push("face_thumbs");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Save a face thumbnail to disk using the already-decoded image.
/// Returns the file path on success.
fn save_face_thumbnail(face_id: &str, img: &image::DynamicImage, bbox: &[f32; 4]) -> Result<std::path::PathBuf, String> {
    let (w, h) = (img.width() as f32, img.height() as f32);

    let mut x1 = (bbox[0] * w).max(0.0);
    let mut y1 = (bbox[1] * h).max(0.0);
    let mut x2 = (bbox[2] * w).min(w - 1.0);
    let mut y2 = (bbox[3] * h).min(h - 1.0);

    let margin_x = (x2 - x1) * 0.3;
    let margin_y = (y2 - y1) * 0.3;
    x1 = (x1 - margin_x).max(0.0);
    y1 = (y1 - margin_y).max(0.0);
    x2 = (x2 + margin_x).min(w - 1.0);
    y2 = (y2 + margin_y).min(h - 1.0);

    let crop_x = x1 as u32;
    let crop_y = y1 as u32;
    let crop_w = (x2 - x1) as u32;
    let crop_h = (y2 - y1) as u32;

    if crop_w == 0 || crop_h == 0 {
        return Err("Face bounding box has zero area.".to_string());
    }

    let face = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
    let face = face.resize_exact(120, 120, image::imageops::FilterType::CatmullRom);

    let dir = face_thumb_dir()?;
    let dest = dir.join(format!("{}.webp", face_id));
    let file = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    face.write_to(&mut std::io::BufWriter::new(file), image::ImageFormat::WebP)
        .map_err(|e| format!("Failed to write face thumbnail: {}", e))?;
    Ok(dest)
}

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

fn landmarks_to_array(landmarks: &Option<Vec<(f32, f32)>>) -> [[f32; 2]; 5] {
    let mut result = [[0.0_f32; 2]; 5];
    if let Some(pts) = landmarks {
        for (i, &(x, y)) in pts.iter().enumerate().take(5) {
            result[i] = [x, y];
        }
    }
    result
}

#[command]
pub async fn check_face_models(
    app_handle: AppHandle,
    model_size: Option<String>,
) -> Result<bool, String> {
    let size = match model_size.as_deref() {
        Some("large") => ModelSize::Large,
        _ => ModelSize::Small,
    };
    let mgr = get_analyzer_manager();
    if mgr.is_ready() {
        if let Ok(current_size) = mgr.get_model_size() {
            if current_size == size {
                return Ok(true);
            }
        }
    }
    mgr.ensure_initialized(Some(&app_handle), size).await?;
    Ok(true)
}

const CHECKPOINT_EVERY: usize = 25;

/// Maximum image dimension before downscaling for face detection.
/// Faces are still detectable at 1200px; this speeds up decode+analysis significantly.
const FACE_DETECT_MAX_DIM: u32 = 1200;

/// Downscale an image so its longest edge is at most `max_dim` pixels.
fn downscale_for_detection(img: image::DynamicImage, max_dim: u32) -> image::DynamicImage {
    let (w, h) = (img.width(), img.height());
    if w <= max_dim && h <= max_dim {
        return img;
    }
    if w >= h {
        img.resize(max_dim, (max_dim as f64 * h as f64 / w as f64) as u32, image::imageops::FilterType::Lanczos3)
    } else {
        img.resize((max_dim as f64 * w as f64 / h as f64) as u32, max_dim, image::imageops::FilterType::Lanczos3)
    }
}

struct LoadedImage {
    path: String,
    img: Option<image::DynamicImage>,
}

#[command]
pub async fn scan_faces(
    paths: Vec<String>,
    use_large_model: bool,
    threshold: Option<f32>,
    app_handle: AppHandle,
) -> Result<Vec<String>, String> {
    let model_size = if use_large_model {
        ModelSize::Large
    } else {
        ModelSize::Small
    };
    let similarity_threshold = threshold.unwrap_or(0.55);

    let mgr = get_analyzer_manager();
    mgr.ensure_initialized(Some(&app_handle), model_size).await?;

    // Step 0: filter out photos already face-scanned since last modification
    // (must complete before acquiring the analyzer guard, which is !Send)
    let total_requested = paths.len();
    let paths = if paths.is_empty() {
        paths
    } else {
        let scanned: HashSet<String> = {
            let conn = get_connection().await?;
            let placeholders: Vec<String> = (0..paths.len()).map(|i| format!("?{}", i + 1)).collect();
            let sql = format!(
                "SELECT path FROM photo_index WHERE path IN ({}) AND face_scanned_ms >= modified_ms",
                placeholders.join(",")
            );
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let params: Vec<&dyn rusqlite::types::ToSql> =
                paths.iter().map(|p| p as &dyn rusqlite::types::ToSql).collect();
            let result: HashSet<String> = stmt
                .query_map(params.as_slice(), |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            result
        };
        if scanned.len() == paths.len() {
            let _ = app_handle.emit(
                "face:complete",
                serde_json::json!({
                    "scanned": total_requested,
                    "photosWithFaces": 0,
                    "facesFound": 0,
                }),
            );
            return Ok(vec![]);
        }
        paths.into_iter().filter(|p| !scanned.contains(p)).collect()
    };

    let total = paths.len();
    let model_type = if use_large_model { "buffalo_l" } else { "buffalo_s" };

    // Phase 1+2 are scoped so the !Send analyzer guard is dropped before any .await
    let (processed_photos, total_faces_found) = {
        let analyzer_guard = mgr.get_analyzer()?;
        let analyzer = analyzer_guard
            .as_ref()
            .ok_or_else(|| "Face analyzer not initialized.".to_string())?;

        let mut index = index::read_index()?;
        index.model_type = model_type.to_string();
        index.similarity_threshold = similarity_threshold;

        // Phase 1: load and downscale images in parallel (I/O + decode bound)
        let loaded: Vec<LoadedImage> = paths
            .par_iter()
            .filter(|p| is_image_ext(p))
            .map(|path| {
                let img = image::open(path)
                    .ok()
                    .map(|i| downscale_for_detection(i, FACE_DETECT_MAX_DIM));
                LoadedImage {
                    path: path.clone(),
                    img,
                }
            })
            .collect();

        // Phase 2: run face detection sequentially (analyzer is behind a Mutex)
        let mut processed_photos: Vec<String> = Vec::new();
        let mut total_faces_found: usize = 0;
        for (idx, entry) in loaded.iter().enumerate() {
            let path = &entry.path;
            let Some(ref img) = entry.img else {
                continue;
            };

            let faces = match analyzer.analyze(img) {
                Ok(f) => f,
                Err(_) => continue,
            };

            if faces.is_empty() {
                continue;
            }

            let mut face_embeddings = Vec::new();
            for (fi, face) in faces.iter().enumerate() {
                if face.embedding.is_empty() {
                    continue;
                }
                let bbox = &face.detection.bbox;
                let emb = FaceEmbedding {
                    photo_path: path.clone(),
                    face_index: fi,
                    embedding: face.embedding.clone(),
                    bbox: [bbox.x1, bbox.y1, bbox.x2, bbox.y2],
                    landmarks: landmarks_to_array(&face.detection.landmarks),
                    confidence: face.detection.score,
                };
                face_embeddings.push(emb);
            }

            if !face_embeddings.is_empty() {
                total_faces_found +=
                    index::upsert_faces_in_memory(&mut index, path, &face_embeddings, similarity_threshold);
                processed_photos.push(path.clone());

                // Save face thumbnails to disk (from the already-decoded image)
                for emb in &face_embeddings {
                    if let Some(record) = index.faces.iter()
                        .filter(|f| f.photo_path == emb.photo_path && f.face_index == emb.face_index)
                        .next_back()
                    {
                        let _ = save_face_thumbnail(&record.id, img, &emb.bbox);
                    }
                }
            }

            // Incremental checkpoint: only centroid-match (no O(n²) pairwise)
            if idx > 0 && idx % CHECKPOINT_EVERY == 0 {
                index::centroid_match_unassigned(&mut index);
                let _ = index::write_index(&index);
            }

            let _ = app_handle.emit(
                "face:progress",
                serde_json::json!({
                    "scanned": idx + 1,
                    "total": total,
                    "photosWithFaces": processed_photos.len(),
                    "facesFound": total_faces_found,
                    "currentFile": path,
                }),
            );
        }

        // Final full cluster + write (still inside the scope, analyzer guard is live)
        index::cluster_index(&mut index);
        index::write_index(&index)?;
        (processed_photos, total_faces_found)
    };
    // analyzer_guard + analyzer dropped here — safe to .await again

    // Mark processed photos as face-scanned in the SQLite index.
    // Failure here must NOT prevent face:complete from being emitted.
    if !processed_photos.is_empty() {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        if let Ok(conn) = get_connection().await {
            for path in &processed_photos {
                let _ = conn.execute(
                    "UPDATE photo_index SET face_scanned_ms = ?1 WHERE path = ?2",
                    rusqlite::params![now_ms, path],
                );
            }
        }
    }

    let _ = app_handle.emit(
        "face:complete",
        serde_json::json!({
            "scanned": total_requested,
            "photosWithFaces": processed_photos.len(),
            "facesFound": total_faces_found,
        }),
    );

    Ok(processed_photos)
}

#[command]
pub fn cluster_faces(threshold: f32) -> Result<Vec<serde_json::Value>, String> {
    let mut idx = index::read_index()?;
    idx.similarity_threshold = threshold;
    index::cluster_index(&mut idx);
    index::write_index(&idx)?;
    let mut result = Vec::new();

    for person in &idx.people {
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
pub fn recluster_faces() -> Result<(), String> {
    index::auto_cluster()
}

#[command]
pub fn list_people(show_hidden: Option<bool>) -> Result<Vec<serde_json::Value>, String> {
    let show_hidden = show_hidden.unwrap_or(false);
    let idx = index::read_index()?;
    let unassigned_count = idx
        .faces
        .iter()
        .filter(|f| f.person_id.is_none() && !f.rejected)
        .count();

    let thumb_dir = face_thumb_dir().ok();

    let mut people: Vec<serde_json::Value> = idx
        .people
        .iter()
        .filter(|p| show_hidden || !p.hidden)
        .map(|p| {
            let best_face = idx
                .faces
                .iter()
                .filter(|f| f.person_id.as_deref() == Some(&p.id) && !f.rejected)
                .max_by(|a, b| {
                    a.confidence
                        .partial_cmp(&b.confidence)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });

            // Prefer on-disk thumbnail; fall back to generating data URL from original photo
            let (thumbnail_path, thumbnail_data_url) = if let Some(best) = best_face {
                let disk_path = thumb_dir.as_ref().map(|d| d.join(format!("{}.webp", best.id)));
                if let Some(ref path) = disk_path {
                    if path.exists() {
                        (Some(path.to_string_lossy().into_owned()), None)
                    } else {
                        (None, cached_face_thumbnail(&best.id, &best.photo_path, &best.bbox))
                    }
                } else {
                    (None, cached_face_thumbnail(&best.id, &best.photo_path, &best.bbox))
                }
            } else {
                (None, None)
            };

            serde_json::json!({
                "id": p.id,
                "name": p.name,
                "faceCount": p.face_count,
                "thumbnailPath": thumbnail_path,
                "thumbnailDataUrl": thumbnail_data_url,
                "hidden": p.hidden,
            })
        })
        .collect();

    people.push(serde_json::json!({
        "id": "__unassigned__",
        "name": "Unnamed",
        "faceCount": unassigned_count,
        "thumbnailPath": "",
        "thumbnailDataUrl": null,
    }));

    Ok(people)
}

#[command]
pub fn name_person(
    face_ids: Vec<String>,
    name: String,
    person_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let person = index::assign_person(&face_ids, person_id.as_deref(), &name)?;
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
pub fn merge_people(
    person_ids: Vec<String>,
    target_name: String,
) -> Result<Vec<serde_json::Value>, String> {
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
pub fn hide_person(person_id: String) -> Result<(), String> {
    index::hide_person(&person_id)
}

#[command]
pub fn unhide_person(person_id: String) -> Result<(), String> {
    index::unhide_person(&person_id)
}

#[command]
pub fn reject_faces(face_ids: Vec<String>) -> Result<(), String> {
    index::reject_faces(&face_ids)
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
