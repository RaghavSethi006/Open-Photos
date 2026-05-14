use crate::ai::FaceDetector;
use crate::db::DbPool;
use crate::metadata;
use crate::thumbs;
use std::path::Path;
use tauri::{AppHandle, State};
use walkdir::WalkDir;

pub mod ntfs;

#[tauri::command]
pub async fn scan_ntfs(
    app: AppHandle,
    drive: String,
    pool: State<'_, DbPool>,
) -> Result<usize, String> {
    println!("Starting NTFS scan on {}", drive);

    // 1. Run MFT Scan
    let files = match ntfs::scan_ntfs_volume(&drive) {
        Ok(f) => f,
        Err(e) => {
            println!("MFT Scan failed: {}. Falling back to standard scan.", e);
            return scan_directory(app, format!("{}:\\", drive), pool).await;
        }
    };

    println!(
        "MFT Indexing complete. Found {} candidates. Enqueueing in DB...",
        files.len()
    );

    // 2. Enqueue (Insert into DB)
    // We use a transaction for speed
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let mut count = 0;

    for (path, _size) in files {
        let filename = Path::new(&path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let res = sqlx::query("INSERT OR IGNORE INTO images (path, filename) VALUES (?, ?)")
            .bind(&path)
            .bind(&filename)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        if res.rows_affected() > 0 {
            count += 1;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    println!("Database update complete. Added {} new files.", count);

    // 3. Trigger Async Processing (Optional / TODO)
    // In a real app, we would fire an event here or spawn a background thread to:
    // - Extract metadata
    // - Generate thumbs
    // - Run AI
    // For now, we match the prompt's request to "Output Vec for enqueueing".
    // The DB insert acts as the queue.

    Ok(count)
}

#[tauri::command]
pub async fn scan_directory(
    app: AppHandle,
    path: String,
    pool: State<'_, DbPool>,
) -> Result<usize, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err("Directory does not exist".to_string());
    }

    // Initialize face detector (will gracefully handle missing model)
    let mut face_detector = FaceDetector::new(&app);
    let has_ai = face_detector.is_available();

    if has_ai {
        println!("Face detection enabled for this scan");
    } else {
        println!("Face detection disabled (model not found)");
    }

    let mut count = 0;
    // Use into_iter() to walk recursively
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if ["jpg", "jpeg", "png", "webp", "heic", "gif"].contains(&ext_str.as_str()) {
                    let path_str = path.to_string_lossy().to_string();
                    let filename = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();

                    // Extract metadata
                    let date_taken = metadata::extract_date_taken(&path_str);

                    let res = sqlx::query(
                        "INSERT OR IGNORE INTO images (path, filename, date_taken) VALUES (?, ?, ?)",
                    )
                    .bind(&path_str)
                    .bind(&filename)
                    .bind(&date_taken)
                    .execute(pool.inner())
                    .await
                    .map_err(|e| e.to_string())?;

                    if res.rows_affected() > 0 {
                        // Get the ID of the inserted row
                        let id: i64 = sqlx::query_scalar("SELECT id FROM images WHERE path = ?")
                            .bind(&path_str)
                            .fetch_one(pool.inner())
                            .await
                            .map_err(|e| e.to_string())?;

                        // OPTIMIZATION: Load image once and reuse it
                        if let Ok(img) = image::open(&path_str) {
                            // Generate thumbnail from loaded image
                            let _ = thumbs::generate_thumbnail_from_image(&app, id, &img);

                            // Run face detection if available (reuse same image)
                            if has_ai {
                                if let Ok(faces) = face_detector.detect_faces(&img) {
                                    for face in faces {
                                        let _ = sqlx::query(
                                            "INSERT INTO faces (image_id, bbox_x, bbox_y, bbox_width, bbox_height, confidence) VALUES (?, ?, ?, ?, ?, ?)"
                                        )
                                        .bind(id)
                                        .bind(face.x)
                                        .bind(face.y)
                                        .bind(face.width)
                                        .bind(face.height)
                                        .bind(face.confidence)
                                        .execute(pool.inner())
                                        .await;
                                    }
                                }
                            }
                        } else {
                            // Fallback: if image loading fails, still try to generate thumbnail
                            let _ = thumbs::generate_thumbnail(&app, id, &path_str);
                        }

                        count += 1;

                        // Log progress every 10 images
                        if count % 10 == 0 {
                            println!("Scanned {} images...", count);
                        }
                    }
                }
            }
        }
    }

    println!("Scan complete: {} new images added", count);
    Ok(count)
}
