use std::fs::File;
use std::path::Path;

pub fn extract_date_taken(path: &str) -> Option<String> {
    let file = File::open(Path::new(path)).ok()?;
    let mut bufreader = std::io::BufReader::new(&file);

    let exifreader = exif::Reader::new();
    let exif = match exifreader.read_from_container(&mut bufreader) {
        Ok(exif) => exif,
        Err(e) => {
            println!("EXIF read error for {}: {}", path, e);
            return None;
        }
    };

    // Try DateTimeOriginal first (when photo was taken), then DateTime (when edited/saved)
    if let Some(field) = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            if let Some(datetime) = vec.first() {
                if let Some(parsed) = parse_exif_datetime(datetime) {
                    println!("Extracted DateTimeOriginal from {}: {}", path, parsed);
                    return Some(parsed);
                }
            }
        }
    }

    if let Some(field) = exif.get_field(exif::Tag::DateTime, exif::In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            if let Some(datetime) = vec.first() {
                if let Some(parsed) = parse_exif_datetime(datetime) {
                    println!("Extracted DateTime from {}: {}", path, parsed);
                    return Some(parsed);
                }
            }
        }
    }

    println!("No EXIF date found for: {}", path);
    None
}

fn parse_exif_datetime(bytes: &[u8]) -> Option<String> {
    let s = String::from_utf8_lossy(bytes);
    // EXIF format: "YYYY:MM:DD HH:MM:SS"
    let datetime_str = s.trim_end_matches('\0');

    // Convert to ISO 8601 format for SQLite
    let parts: Vec<&str> = datetime_str.split(' ').collect();
    if parts.len() == 2 {
        let date = parts[0].replace(':', "-");
        let time = parts[1];
        Some(format!("{} {}", date, time))
    } else {
        None
    }
}
