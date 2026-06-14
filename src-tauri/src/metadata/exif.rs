use std::path::Path;
use std::fs::File;
use chrono::NaiveDateTime;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifData {
    pub date_taken: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub aperture: Option<String>,
    pub shutter_speed: Option<String>,
    pub iso: Option<i64>,
    pub focal_length: Option<String>,
    pub gps_lat: Option<f64>,
    pub gps_lng: Option<f64>,
    pub gps_lat_ref: Option<String>,
    pub gps_lng_ref: Option<String>,
    pub orientation: Option<i64>,
}

fn get_first_rational(value: &exif::Value) -> Option<(i64, i64)> {
    match value {
        exif::Value::Rational(rationals) => {
            let r = rationals.first()?;
            Some((r.num as i64, r.denom as i64))
        }
        _ => None,
    }
}

fn parse_rational(value: &exif::Value) -> Option<f64> {
    let (num, den) = get_first_rational(value)?;
    if den == 0 { None } else { Some(num as f64 / den as f64) }
}

fn format_rational(value: &exif::Value) -> Option<String> {
    let (num, den) = get_first_rational(value)?;
    if den == 1 {
        Some(num.to_string())
    } else {
        Some(format!("{}/{}", num, den))
    }
}

fn parse_gps_coordinate(tag: exif::Tag, exif: &exif::Exif) -> Option<f64> {
    let field = exif.get_field(tag, exif::In::PRIMARY)?;
    match &field.value {
        exif::Value::Rational(rationals) if rationals.len() >= 3 => {
            let deg = rationals[0].num as f64 / rationals[0].denom as f64;
            let min = rationals[1].num as f64 / rationals[1].denom as f64;
            let sec = rationals[2].num as f64 / rationals[2].denom as f64;
            Some(deg + min / 60.0 + sec / 3600.0)
        }
        _ => None,
    }
}

pub fn extract_exif(path: &Path) -> ExifData {
    let mut data = ExifData {
        date_taken: None,
        width: None,
        height: None,
        camera_make: None,
        camera_model: None,
        aperture: None,
        shutter_speed: None,
        iso: None,
        focal_length: None,
        gps_lat: None,
        gps_lng: None,
        gps_lat_ref: None,
        gps_lng_ref: None,
        orientation: None,
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

    // Date
    if let Some(field) = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            if let Some(s) = vec.first() {
                if let Ok(s) = std::str::from_utf8(s) {
                    let clean = s.trim_matches('\0').trim();
                    if let Ok(naive) = NaiveDateTime::parse_from_str(clean, "%Y:%m:%d %H:%M:%S") {
                        data.date_taken = Some(naive.and_utc().timestamp());
                    }
                }
            }
        }
    }
    
    // Dimensions
    if let Some(w) = exif.get_field(exif::Tag::PixelXDimension, exif::In::PRIMARY) {
        data.width = w.value.get_uint(0).map(|v| v as i64);
    }
    if let Some(h) = exif.get_field(exif::Tag::PixelYDimension, exif::In::PRIMARY) {
        data.height = h.value.get_uint(0).map(|v| v as i64);
    }

    // Camera
    if let Some(field) = exif.get_field(exif::Tag::Make, exif::In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            data.camera_make = vec.first().and_then(|s| std::str::from_utf8(s).ok()).map(|s| s.trim_matches('\0').to_string());
        }
    }
    if let Some(field) = exif.get_field(exif::Tag::Model, exif::In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            data.camera_model = vec.first().and_then(|s| std::str::from_utf8(s).ok()).map(|s| s.trim_matches('\0').to_string());
        }
    }

    // Aperture (F-Number)
    if let Some(field) = exif.get_field(exif::Tag::FNumber, exif::In::PRIMARY) {
        data.aperture = parse_rational(&field.value).map(|v| format!("f/{:.1}", v));
    }

    // Shutter speed
    if let Some(field) = exif.get_field(exif::Tag::ExposureTime, exif::In::PRIMARY) {
        data.shutter_speed = format_rational(&field.value);
    }

    // ISO
    if let Some(field) = exif.get_field(exif::Tag::PhotographicSensitivity, exif::In::PRIMARY) {
        data.iso = field.value.get_uint(0).map(|v| v as i64);
    }

    // Focal length
    if let Some(field) = exif.get_field(exif::Tag::FocalLength, exif::In::PRIMARY) {
        data.focal_length = parse_rational(&field.value).map(|v| format!("{:.1} mm", v));
    }

    // GPS
    let lat = parse_gps_coordinate(exif::Tag::GPSLatitude, &exif);
    let lng = parse_gps_coordinate(exif::Tag::GPSLongitude, &exif);
    data.gps_lat = lat;
    data.gps_lng = lng;
    if let Some(field) = exif.get_field(exif::Tag::GPSLatitudeRef, exif::In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            data.gps_lat_ref = vec.first().and_then(|s| std::str::from_utf8(s).ok()).map(|s| s.trim_matches('\0').to_string());
        }
    }
    if let Some(field) = exif.get_field(exif::Tag::GPSLongitudeRef, exif::In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            data.gps_lng_ref = vec.first().and_then(|s| std::str::from_utf8(s).ok()).map(|s| s.trim_matches('\0').to_string());
        }
    }

    // Orientation
    if let Some(field) = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY) {
        data.orientation = field.value.get_uint(0).map(|v| v as i64);
    }

    data
}
