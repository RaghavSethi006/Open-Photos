pub mod cache;
pub mod generator;

use generator::DEFAULT_THUMB_SIZE;
use rayon::prelude::*;
use tauri::command;

/// Returns the filesystem path to a thumbnail for the given photo.
///
/// The thumbnail is generated on first access, cached to
/// `{app_data}/com.localphotos.app/thumbs/`, and served via Tauri's
/// `convertFileSrc` on the frontend. Subsequent calls return the cached
/// version immediately (keyed by path + mtime + dimension).
///
/// `max_dimension` controls the longest edge in pixels (default 320).
#[command]
pub fn get_thumbnail_path(path: String, max_dimension: Option<u32>) -> Result<String, String> {
    let max_dim = max_dimension.unwrap_or(DEFAULT_THUMB_SIZE);
    let cached = generator::generate_thumbnail(&path, max_dim)?;
    Ok(cached.to_string_lossy().into_owned())
}

/// Batch-generate thumbnails for many photos in parallel using rayon.
/// Returns paths in the same order as the input.
/// Uses `tokio::task::spawn_blocking` to avoid tying up Tauri's
/// blocking thread pool for the duration of the batch.
#[command]
pub async fn ensure_thumbnails(paths: Vec<String>, max_dimension: Option<u32>) -> Result<Vec<String>, String> {
    let max_dim = max_dimension.unwrap_or(DEFAULT_THUMB_SIZE);
    tokio::task::spawn_blocking(move || {
        let results: Vec<Result<String, String>> = paths
            .par_iter()
            .map(|path| {
                generator::generate_thumbnail(path, max_dim)
                    .map(|p| p.to_string_lossy().into_owned())
            })
            .collect();

        // Return paths in order; errors become empty strings (frontend falls back to full-res)
        Ok(results.into_iter().map(|r| r.unwrap_or_default()).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}
