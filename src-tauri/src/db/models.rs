use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedPhoto {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub modified_ms: u64,
    pub date_taken_ms: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub gps_lat: Option<f64>,
    pub gps_lng: Option<f64>,
    pub is_video: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilters {
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub has_gps: Option<bool>,
    pub is_video: Option<bool>,
    pub query: Option<String>,
}
