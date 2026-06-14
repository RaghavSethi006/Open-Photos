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

fn rational_to_f64(num: i64, den: i64) -> f64 {
    if den == 0 { 0.0 } else { num as f64 / den as f64 }
}

fn parse_rational(value: &exif::Value) -> Option<f64> {
    let val = value.get_rat(0)?;
    Some(rational_to_f64(val.0 as i64, val.1 as i64))
}

fn format_rational(value: &exif::Value) -> Option<String> {
    let val = value.get_rat(0)?;
    if val.1 == 1 {
        Some(val.0.to_string())
    } else {
        Some(format!("{}/{}", val.0, val.1))
    }
}

fn parse_gps_coordinate(tag: exif::Tag, exif: &exif::Exif) -> Option<f64> {
    let field = exif.get_field(tag, exif::In::PRIMARY)?;
    let val = &field.value;
    match val {
        exif::Value::Rational(rationals) if rationals.len() >= 3 => {
            let deg = rational_to_f64(rationals[0].0 as i64, rationals[0].1 as i64);
            let min = rational_to_f64(rationals[1].0 as i64, rationals[1].1 as i64);
            let sec = rational_to_f64(rationals[2].0 as i64, rationals[2].1 as i64);
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
