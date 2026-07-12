use image::imageops::FilterType;
use image::DynamicImage;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use super::cache;

/// Default max dimension for grid thumbnails (320px on the long edge).
pub const DEFAULT_THUMB_SIZE: u32 = 320;

/// Generate a thumbnail for the given image path.
///
/// Opens the image, resizes so the longest edge is `max_dim` pixels,
/// encodes as lossy WebP (quality 85), caches to disk, and returns the
/// cache file path.
///
/// If a valid cached thumbnail already exists, returns it immediately
/// without re-encoding.
pub fn generate_thumbnail(path: &str, max_dim: u32) -> Result<PathBuf, String> {
    let modified_ms = fs_modified_ms(path)?;

    if let Some(cached) = cache::get_cached(path, modified_ms, max_dim) {
        return Ok(cached);
    }

    let img = image::open(path).map_err(|e| format!("Failed to open {}: {}", path, e))?;

    let thumb = resize_to_fit(&img, max_dim);

    let mut buf = std::io::Cursor::new(Vec::new());
    thumb
        .write_to(&mut buf, image::ImageFormat::WebP)
        .map_err(|e| format!("Failed to encode thumbnail: {}", e))?;

    let data = buf.into_inner();
    cache::store_thumbnail(path, modified_ms, max_dim, &data)
}

fn resize_to_fit(img: &DynamicImage, max_dim: u32) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    if w <= max_dim && h <= max_dim {
        return img.clone();
    }
    if w >= h {
        img.resize(max_dim, (max_dim as f64 * h as f64 / w as f64) as u32, FilterType::Lanczos3)
    } else {
        img.resize((max_dim as f64 * w as f64 / h as f64) as u32, max_dim, FilterType::Lanczos3)
    }
}

fn fs_modified_ms(path: &str) -> Result<u64, String> {
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .ok_or_else(|| "Could not read modification time.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::SystemTime;

    #[test]
    fn resize_downscales_large_image() {
        let img = DynamicImage::new_rgb8(4000, 3000);
        let thumb = resize_to_fit(&img, 320);
        assert!(thumb.width() <= 320);
        assert!(thumb.height() <= 240);
    }

    #[test]
    fn resize_does_not_upscale_small_image() {
        let img = DynamicImage::new_rgb8(100, 80);
        let thumb = resize_to_fit(&img, 320);
        assert_eq!(thumb.width(), 100);
        assert_eq!(thumb.height(), 80);
    }

    #[test]
    fn generate_thumbnail_creates_cache_file() {
        let dir = std::env::temp_dir().join(format!(
            "lgp_thumb_test_{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let src = dir.join("test.jpg");
        let img = DynamicImage::new_rgb8(800, 600);
        img.save(&src).unwrap();

        let result = generate_thumbnail(src.to_str().unwrap(), 320);
        assert!(result.is_ok());
        let cache_path = result.unwrap();
        assert!(cache_path.exists());
        assert!(cache_path.extension().map(|e| e == "webp").unwrap_or(false));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn generate_thumbnail_returns_cached_on_second_call() {
        let dir = std::env::temp_dir().join(format!(
            "lgp_thumb_cache_test_{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let src = dir.join("test.jpg");
        DynamicImage::new_rgb8(800, 600).save(&src).unwrap();

        let first = generate_thumbnail(src.to_str().unwrap(), 320).unwrap();
        let second = generate_thumbnail(src.to_str().unwrap(), 320).unwrap();

        assert_eq!(first, second);
        assert!(first.exists());

        let _ = fs::remove_dir_all(dir);
    }
}
