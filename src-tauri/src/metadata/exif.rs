use std::path::Path;
use std::fs::File;

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
    let exifreader = kamadak_exif::Reader::new();
    
    if let Ok(exif) = exifreader.read_from_container(&mut bufreader) {
        // Try to get date taken
        if let Some(field) = exif.get_field(kamadak_exif::Tag::DateTimeOriginal, kamadak_exif::In::PRIMARY) {
            if let kamadak_exif::Value::Ascii(ref vec) = field.value {
                if let Some(b) = vec.first() {
                    let s = String::from_utf8_lossy(b);
                    // Format: "YYYY:MM:DD HH:MM:SS"
                    if s.len() >= 19 {
                        let formatted = format!("{}-{}-{} {}", &s[0..4], &s[5..7], &s[8..10], &s[11..19]);
                        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&formatted, "%Y-%m-%d %H:%M:%S") {
                            data.date_taken = Some(dt.and_utc().timestamp());
                        }
                    }
                }
            }
        }
        
        // Try to get dimensions
        if let Some(w) = exif.get_field(kamadak_exif::Tag::PixelXDimension, kamadak_exif::In::PRIMARY) {
            data.width = w.value.get_uint(0).map(|v| v as i64);
        }
        if let Some(h) = exif.get_field(kamadak_exif::Tag::PixelYDimension, kamadak_exif::In::PRIMARY) {
            data.height = h.value.get_uint(0).map(|v| v as i64);
        }
    }

    data
}
