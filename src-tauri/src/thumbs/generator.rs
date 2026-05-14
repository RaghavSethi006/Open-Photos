use std::path::Path;
use image::{imageops::FilterType, io::Reader as ImageReader};
use std::fs;

pub fn generate_thumbnails(source_path: &Path, base_thumb_dir: &Path, path_hash: u64) -> Result<(String, String), String> {
    let thumb_256_path = base_thumb_dir.join("256").join(format!("{}.webp", path_hash));
    let thumb_480_path = base_thumb_dir.join("480").join(format!("{}.webp", path_hash));

    // Ensure directories exist
    if let Some(p) = thumb_256_path.parent() {
        let _ = fs::create_dir_all(p);
    }
    if let Some(p) = thumb_480_path.parent() {
        let _ = fs::create_dir_all(p);
    }

    // Skip if both already exist
    if thumb_256_path.exists() && thumb_480_path.exists() {
        return Ok((
            thumb_256_path.to_string_lossy().to_string(),
            thumb_480_path.to_string_lossy().to_string()
        ));
    }

    // Open with format guessing from both extension and magic bytes
    let reader = ImageReader::open(source_path)
        .map_err(|e| format!("Failed to open: {}", e))?
        .with_guessed_format()
        .map_err(|e| format!("Failed to guess format: {}", e))?;
        
    let img = reader.decode().map_err(|e| format!("Failed to decode: {}", e))?;
    
    if !thumb_256_path.exists() {
        let thumb_256 = img.resize(256, 256, FilterType::Nearest);
        thumb_256.save_with_format(&thumb_256_path, image::ImageFormat::WebP)
            .map_err(|e| format!("Failed to save 256px thumb: {}", e))?;
    }
    
    if !thumb_480_path.exists() {
        let thumb_480 = img.resize(480, 480, FilterType::Lanczos3);
        thumb_480.save_with_format(&thumb_480_path, image::ImageFormat::WebP)
            .map_err(|e| format!("Failed to save 480px thumb: {}", e))?;
    }

    Ok((
        thumb_256_path.to_string_lossy().to_string(),
        thumb_480_path.to_string_lossy().to_string()
    ))
}
