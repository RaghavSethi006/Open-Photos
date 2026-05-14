use std::path::Path;
use std::fs::File;
use chrono::NaiveDateTime;

#[derive(Debug)]
pub struct ExifData {
    pub date_taken: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
}

pub fn extract_exif(path: &Path) -> ExifData {
    let mut data = ExifData {
        date_taken: None,
        width: None,
        height: None,
    };

    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return data,
    };
    
    let mut bufreader = std::io::BufReader::new(&file);
    let exifreader = exif::Reader::new();
    
    let exif = match exifreader.read_from_container(&mut bufreader) {
        Ok(e) => e,
        Err(_) => return data,
    };

    if let Some(field) = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            if let Some(s) = vec.first() {
                if let Ok(s) = std::str::from_utf8(s) {
                    // EXIF dates format: "YYYY:MM:DD HH:MM:SS"
                    let clean = s.trim_matches('\0').trim();
                    if let Ok(naive) = NaiveDateTime::parse_from_str(clean, "%Y:%m:%d %H:%M:%S") {
                        data.date_taken = Some(naive.and_utc().timestamp());
                    }
                }
            }
        }
    }
    
    // Try to get dimensions
    if let Some(w) = exif.get_field(exif::Tag::PixelXDimension, exif::In::PRIMARY) {
        data.width = w.value.get_uint(0).map(|v| v as i64);
    }
    if let Some(h) = exif.get_field(exif::Tag::PixelYDimension, exif::In::PRIMARY) {
        data.height = h.value.get_uint(0).map(|v| v as i64);
    }

    data
}
