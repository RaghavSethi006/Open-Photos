use image::imageops::FilterType;
use image::DynamicImage;
use std::fs;
use tauri::AppHandle;
use tauri::Manager;

pub fn get_thumb_path(app: &AppHandle, id: i64) -> std::path::PathBuf {
    let app_dir = app.path().app_data_dir().unwrap();
    app_dir.join("thumbs").join(format!("{}.jpg", id))
}

pub fn generate_thumbnail(app: &AppHandle, id: i64, original_path: &str) -> Result<(), String> {
    let thumb_path = get_thumb_path(app, id);

    // If thumb exists, return early
    if thumb_path.exists() {
        return Ok(());
    }

    // Ensure thumbs dir exists
    if let Some(parent) = thumb_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Open and resize
    let img = image::open(original_path).map_err(|e| e.to_string())?;
    let thumb = img.resize(300, 300, FilterType::Lanczos3);

    // Save as JPG
    thumb.save(thumb_path).map_err(|e| e.to_string())?;

    Ok(())
}

// Generate thumbnail from already-loaded image (performance optimization)
pub fn generate_thumbnail_from_image(
    app: &AppHandle,
    id: i64,
    img: &DynamicImage,
) -> Result<(), String> {
    let thumb_path = get_thumb_path(app, id);

    // If thumb exists, return early
    if thumb_path.exists() {
        return Ok(());
    }

    // Ensure thumbs dir exists
    if let Some(parent) = thumb_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Resize and save
    let thumb = img.resize(300, 300, FilterType::Lanczos3);
    thumb.save(thumb_path).map_err(|e| e.to_string())?;

    Ok(())
}
