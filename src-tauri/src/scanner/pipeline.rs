use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::time::Instant;
use std::sync::Arc;
use crossbeam_channel::{bounded, Sender, Receiver};
use tauri::Emitter;
use tracing::{info, error};

use crate::db::{DbPool, photos::{Image, load_existing_hashes}};
use super::walker::walk_directory;
use super::classifier::classify_file;
use crate::thumbs::generator::generate_thumbnails;
use crate::metadata::exif::extract_exif;

#[derive(Clone, serde::Serialize)]
pub struct ScanProgress {
    pub scanned: u64,
    pub found: u64,
    pub indexed: u64,
    pub thumbnails_done: u64,
    pub current_dir: String,
    pub elapsed_ms: u64,
    pub estimated_remaining_ms: Option<u64>,
    pub phase: String,
}

pub async fn run_scan_pipeline(
    start_path: PathBuf,
    app_handle: tauri::AppHandle,
    pool: DbPool,
) -> Result<(), String> {
    info!("Starting scan pipeline for {:?}", start_path);
    
    // Load existing hashes
    let existing_hashes = load_existing_hashes(&pool).await.map_err(|e| e.to_string())?;
    let existing_hashes = Arc::new(existing_hashes);
    
    let base_thumb_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");

    // Channels
    let (path_tx, path_rx) = bounded::<PathBuf>(10000);
    let (worker_tx, worker_rx) = bounded::<(PathBuf, String, String, u64)>(5000);
    let (db_tx, db_rx) = bounded::<Image>(5000);
    let (progress_tx, progress_rx) = bounded::<ScanProgress>(100);

    let start_time = Instant::now();
    let app_handle_clone = app_handle.clone();

    // Spawn Walker
    let walker_path = start_path.clone();
    std::thread::spawn(move || {
        walk_directory(&walker_path, path_tx);
    });

    // Spawn Classifier
    let classifier_hashes = existing_hashes.clone();
    let classifier_progress_tx = progress_tx.clone();
    std::thread::spawn(move || {
        let mut scanned = 0;
        let mut found = 0;
        for path in path_rx {
            scanned += 1;
            let current_dir = path.parent().unwrap_or_else(|| Path::new("")).to_string_lossy().to_string();
            
            if let Some(classified) = classify_file(&path, &classifier_hashes) {
                found += 1;
                let _ = worker_tx.send(classified);
            }

            if scanned % 500 == 0 {
                let _ = classifier_progress_tx.send(ScanProgress {
                    scanned,
                    found,
                    indexed: 0, // updated later
                    thumbnails_done: 0, // updated later
                    current_dir,
                    elapsed_ms: start_time.elapsed().as_millis() as u64,
                    estimated_remaining_ms: None,
                    phase: "Walking".into(),
                });
            }
        }
    });

    // Spawn Worker Pool (Rayon)
    let worker_progress_tx = progress_tx.clone();
    std::thread::spawn(move || {
        let mut indexed = 0;
        let mut thumbnails_done = 0;

        // Use standard rayon global pool
        rayon::scope(|s| {
            for (path, filename, ext, path_hash) in worker_rx {
                let db_tx_clone = db_tx.clone();
                let base_thumb_dir_clone = base_thumb_dir.clone();
                
                s.spawn(move |_| {
                    let exif_data = extract_exif(&path);
                    
                    let size_bytes = std::fs::metadata(&path).map(|m| m.len() as i64).ok();
                    
                    let (thumb_256, thumb_480) = match generate_thumbnails(&path, &base_thumb_dir_clone, path_hash) {
                        Ok((t256, t480)) => (Some(t256), Some(t480)),
                        Err(e) => {
                            error!("Error generating thumb for {:?}: {}", path, e);
                            (None, None)
                        }
                    };

                    let image = Image {
                        id: 0, // Set by DB
                        path: path.to_string_lossy().into_owned(),
                        path_hash: path_hash as i64,
                        filename,
                        ext,
                        size_bytes,
                        date_taken: exif_data.date_taken,
                        year: None,  // GENERATED ALWAYS
                        month: None, // GENERATED ALWAYS
                        width: exif_data.width,
                        height: exif_data.height,
                        thumb_256,
                        thumb_480,
                        created_at: None,
                    };

                    let _ = db_tx_clone.send(image);
                });
            }
        });
    });

    // Spawn Progress Emitter
    tokio::spawn(async move {
        for progress in progress_rx {
            let _ = app_handle_clone.emit("scan:progress", progress);
        }
    });

    // Batch DB Writer (Runs in current async context)
    let mut batch = Vec::with_capacity(500);
    let mut total_inserted = 0;

    for image in db_rx {
        batch.push(image);
        if batch.len() >= 500 {
            insert_batch(&pool, &batch).await?;
            total_inserted += batch.len();
            batch.clear();
        }
    }
    
    if !batch.is_empty() {
        insert_batch(&pool, &batch).await?;
        total_inserted += batch.len();
    }

    // Final completion event
    let _ = app_handle.emit("scan:complete", ScanProgress {
        scanned: 0,
        found: total_inserted as u64,
        indexed: total_inserted as u64,
        thumbnails_done: total_inserted as u64,
        current_dir: "".into(),
        elapsed_ms: start_time.elapsed().as_millis() as u64,
        estimated_remaining_ms: Some(0),
        phase: "Done".into(),
    });

    info!("Scan complete! Inserted {} images.", total_inserted);
    Ok(())
}

async fn insert_batch(pool: &DbPool, batch: &[Image]) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for img in batch {
        sqlx::query(
            r#"
            INSERT OR IGNORE INTO images (
                path, path_hash, filename, ext, size_bytes, date_taken, width, height, thumb_256, thumb_480
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&img.path)
        .bind(img.path_hash)
        .bind(&img.filename)
        .bind(&img.ext)
        .bind(img.size_bytes)
        .bind(img.date_taken)
        .bind(img.width)
        .bind(img.height)
        .bind(&img.thumb_256)
        .bind(&img.thumb_480)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
