use std::path::{Path, PathBuf};
use std::collections::HashSet;
use xxhash_rust::xxh64::xxh64;

pub fn is_supported_image(ext: &str) -> bool {
    let lower = ext.to_lowercase();
    matches!(lower.as_str(), "jpg" | "jpeg" | "png" | "webp" | "heic" | "tiff")
}

pub fn compute_path_hash(path: &Path) -> u64 {
    xxh64(path.to_string_lossy().as_bytes(), 0)
}

pub fn classify_file(path: &Path, existing_hashes: &HashSet<u64>) -> Option<(PathBuf, String, String, u64)> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    if !is_supported_image(&ext) {
        return None;
    }

    let hash = compute_path_hash(path);
    if existing_hashes.contains(&hash) {
        return None; // Already in DB
    }

    let filename = path.file_name()?.to_string_lossy().into_owned();
    Some((path.to_path_buf(), filename, ext, hash))
}
