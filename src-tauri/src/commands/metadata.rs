use crate::metadata::exif::{extract_exif, ExifData};
use std::path::PathBuf;
use tauri::command;

#[command]
pub fn get_photo_metadata(path: String) -> Result<ExifData, String> {
    let path = PathBuf::from(path.trim());
    if !path.exists() {
        return Err("File does not exist.".into());
    }
    Ok(extract_exif(&path))
}
