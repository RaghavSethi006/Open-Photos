use std::path::{Path, PathBuf};
use std::time::Instant;
use std::sync::Arc;
use tauri::{Emitter, Manager};
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

    let start_time = Instant::now();
    let app_clone = app_handle.clone();

    // Use a tokio channel for the DB writer so we can await receives without blocking
    let (db_tx, mut db_rx) = tokio::sync::mpsc::channel::<Image>(5000);

    // Spawn the scanning + processing work on a blocking thread pool
    let scan_app = app_handle.clone();
    let scan_handle = tokio::task::spawn_blocking(move || {
        // Phase 1: Walk and classify
        let (path_tx, path_rx) = crossbeam_channel::bounded::<PathBuf>(10000);
        
        let walker_path = start_path.clone();
        std::thread::spawn(move || {
            walk_directory(&walker_path, path_tx);
        });

        // Collect classified files
        let mut classified_files = Vec::new();
        let mut scanned: u64 = 0;
        
        for path in path_rx {
            scanned += 1;
            let current_dir = path.parent().unwrap_or_else(|| Path::new("")).to_string_lossy().to_string();
            
            if let Some(classified) = classify_file(&path, &existing_hashes) {
                classified_files.push(classified);
            }

            // Emit progress every 100 files for responsiveness
            if scanned % 100 == 0 {
                let _ = scan_app.emit("scan:progress", ScanProgress {
                    scanned,
                    found: classified_files.len() as u64,
                    indexed: 0,
                    thumbnails_done: 0,
                    current_dir,
                    elapsed_ms: start_time.elapsed().as_millis() as u64,
                    estimated_remaining_ms: None,
                    phase: "Walking".into(),
                });
            }
        }

        info!("Walk complete. Scanned {} files, found {} images.", scanned, classified_files.len());

        // Emit walking done
        let _ = scan_app.emit("scan:progress", ScanProgress {
            scanned,
            found: classified_files.len() as u64,
            indexed: 0,
            thumbnails_done: 0,
            current_dir: "".into(),
            elapsed_ms: start_time.elapsed().as_millis() as u64,
            estimated_remaining_ms: None,
            phase: "Processing".into(),
        });

        // Phase 2: Process files with rayon (EXIF + thumbnails) and send to DB channel
        let total_files = classified_files.len();
        let processed = std::sync::atomic::AtomicU64::new(0);
        let scan_app2 = scan_app.clone();
        
        rayon::scope(|s| {
            for (path, filename, ext, path_hash) in classified_files {
                let db_tx = db_tx.clone();
                let base_thumb_dir = base_thumb_dir.clone();
                let processed = &processed;
                let scan_app2 = &scan_app2;
                let start_time = &start_time;
                
                s.spawn(move |_| {
                    let exif_data = extract_exif(&path);
                    let size_bytes = std::fs::metadata(&path).map(|m| m.len() as i64).ok();
                    
                    let (thumb_256, thumb_480) = match generate_thumbnails(&path, &base_thumb_dir, path_hash) {
                        Ok((t256, t480)) => (Some(t256), Some(t480)),
                        Err(e) => {
                            error!("Error generating thumb for {:?}: {}", path, e);
                            (None, None)
                        }
                    };

                    let image = Image {
                        id: 0,
                        path: path.to_string_lossy().into_owned(),
                        path_hash: path_hash as i64,
                        filename,
                        ext,
                        size_bytes,
                        date_taken: exif_data.date_taken,
                        year: None,
                        month: None,
                        width: exif_data.width,
                        height: exif_data.height,
                        thumb_256,
                        thumb_480,
                        created_at: None,
                    };

                    let _ = db_tx.blocking_send(image);
                    
                    let done = processed.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                    if done % 20 == 0 {
                        let _ = scan_app2.emit("scan:progress", ScanProgress {
                            scanned,
                            found: total_files as u64,
                            indexed: done,
                            thumbnails_done: done,
                            current_dir: "".into(),
                            elapsed_ms: start_time.elapsed().as_millis() as u64,
                            estimated_remaining_ms: if done > 0 {
                                let rate = start_time.elapsed().as_millis() as f64 / done as f64;
                                Some(((total_files as u64 - done) as f64 * rate) as u64)
                            } else {
                                None
                            },
                            phase: "Processing".into(),
                        });
                    }
                });
            }
        });
        // db_tx is dropped here when rayon scope ends, closing the channel
    });

    // Batch DB Writer — runs on the async runtime, receives from tokio channel
    let mut batch = Vec::with_capacity(100);
    let mut total_inserted: usize = 0;

    while let Some(image) = db_rx.recv().await {
        batch.push(image);
        if batch.len() >= 100 {
            insert_batch(&pool, &batch).await?;
            total_inserted += batch.len();
            batch.clear();
            
            // Emit progress for DB writes
            let _ = app_clone.emit("scan:progress", ScanProgress {
                scanned: 0,
                found: total_inserted as u64,
                indexed: total_inserted as u64,
                thumbnails_done: total_inserted as u64,
                current_dir: "".into(),
                elapsed_ms: start_time.elapsed().as_millis() as u64,
                estimated_remaining_ms: None,
                phase: "Indexing".into(),
            });
        }
    }
    
    if !batch.is_empty() {
        insert_batch(&pool, &batch).await?;
        total_inserted += batch.len();
    }

    // Wait for scan threads to finish
    let _ = scan_handle.await;

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
