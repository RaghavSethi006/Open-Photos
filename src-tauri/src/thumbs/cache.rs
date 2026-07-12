use sha1::{Digest, Sha1};
use std::fs;
use std::path::PathBuf;

const THUMB_SUBDIR: &str = "thumbs";

fn app_data_dir() -> Result<PathBuf, String> {
    let mut path =
        dirs_next::data_dir().ok_or_else(|| "Could not find app data directory.".to_string())?;
    path.push("com.localphotos.app");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

fn thumb_cache_dir() -> Result<PathBuf, String> {
    let mut path = app_data_dir()?;
    path.push(THUMB_SUBDIR);
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Compute a cache key from path + modified timestamp + requested dimension.
/// Example key: "a1b2c3d4_320.webp"
fn cache_filename(path: &str, modified_ms: u64, max_dim: u32) -> String {
    let mut hasher = Sha1::new();
    hasher.update(path.as_bytes());
    hasher.update(modified_ms.to_le_bytes());
    hasher.update(max_dim.to_le_bytes());
    let hash = hasher.finalize();
    let hex = hash.iter().take(8).map(|b| format!("{:02x}", b)).collect::<String>();
    format!("{}_{}.webp", hex, max_dim)
}

/// Full path to a cached thumbnail, if it exists.
pub fn get_cached(path: &str, modified_ms: u64, max_dim: u32) -> Option<PathBuf> {
    let dir = thumb_cache_dir().ok()?;
    let name = cache_filename(path, modified_ms, max_dim);
    let cached = dir.join(&name);
    if cached.exists() { Some(cached) } else { None }
}

/// Write thumbnail bytes to the cache and return the path.
pub fn store_thumbnail(path: &str, modified_ms: u64, max_dim: u32, data: &[u8]) -> Result<PathBuf, String> {
    let dir = thumb_cache_dir()?;
    let name = cache_filename(path, modified_ms, max_dim);
    let dest = dir.join(&name);
    fs::write(&dest, data).map_err(|e| e.to_string())?;
    Ok(dest)
}
