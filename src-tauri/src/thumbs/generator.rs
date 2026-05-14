use std::path::{Path, PathBuf};
use image::{imageops::FilterType, ImageReader};
use std::fs;
use memmap2::Mmap;

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

    // Memory map the file for faster reading
    let file = fs::File::open(source_path).map_err(|e| e.to_string())?;
    let mmap = unsafe { Mmap::map(&file).map_err(|e| e.to_string())? };
    
    let reader = ImageReader::new(std::io::Cursor::new(&mmap[..]))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
        
    let img = reader.decode().map_err(|e| e.to_string())?;
    
    if !thumb_256_path.exists() {
        let thumb_256 = img.resize(256, 256, FilterType::Nearest);
        thumb_256.save_with_format(&thumb_256_path, image::ImageFormat::WebP).map_err(|e| e.to_string())?;
    }
    
    if !thumb_480_path.exists() {
        let thumb_480 = img.resize(480, 480, FilterType::Lanczos3);
        thumb_480.save_with_format(&thumb_480_path, image::ImageFormat::WebP).map_err(|e| e.to_string())?;
    }

    Ok((
        thumb_256_path.to_string_lossy().to_string(),
        thumb_480_path.to_string_lossy().to_string()
    ))
}
