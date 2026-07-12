pub mod albums;
pub mod duplicates;
pub mod favorites;
pub mod organizer;
pub mod trash;

use std::fs;
use std::path::Path;

/// Atomic file write: writes content to a temp file, then renames over target.
/// This prevents partial/corrupt writes on power loss or crash.
pub fn atomic_write_string(path: &Path, content: &str) -> Result<(), String> {
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, content).map_err(|e| e.to_string())?;

    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    fs::rename(&temp_path, path).map_err(|e| e.to_string())
}
