use crate::db::models::{IndexedPhoto, SearchFilters};
use crate::db::queries;
use tauri::command;

/// Walk a folder and index all photos/videos into the SQLite database.
/// Returns the number of files indexed.
#[command]
pub async fn index_folder(folder: String) -> Result<usize, String> {
    queries::index_folder(&folder).await
}

/// Browse photos from an indexed folder.
#[command]
pub async fn browse_folder(folder: String) -> Result<Vec<IndexedPhoto>, String> {
    queries::browse_indexed(&folder).await
}

/// Search indexed photos with optional filters.
#[command]
pub async fn search_photos(
    query: Option<String>,
    camera_make: Option<String>,
    camera_model: Option<String>,
    date_from: Option<i64>,
    date_to: Option<i64>,
    has_gps: Option<bool>,
    is_video: Option<bool>,
) -> Result<Vec<IndexedPhoto>, String> {
    let filters = SearchFilters {
        camera_make,
        camera_model,
        date_from,
        date_to,
        has_gps,
        is_video,
        query,
    };
    queries::search_photos(&filters).await
}
