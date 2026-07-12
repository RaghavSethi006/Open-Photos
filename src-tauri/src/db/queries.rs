use super::get_connection;
use super::models::{IndexedPhoto, SearchFilters};
use rusqlite::params;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

/// Index all photos in a folder (recursive). Returns the number indexed.
/// Acquires the DB connection per-INSERT so other operations are not
/// blocked by a long filesystem walk.
pub async fn index_folder(folder: &str) -> Result<usize, String> {
    let allowed_exts = [
        "jpg", "jpeg", "png", "heic", "webp", "tiff", "tif", "bmp", "gif", "avif",
        "mp4", "mov", "mkv", "avi", "wmv", "flv", "m4v", "webm",
    ];

    let mut count = 0;
    for entry in WalkDir::new(folder).follow_links(false).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        if !allowed_exts.contains(&ext.as_str()) {
            continue;
        }

        let metadata = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let is_video = matches!(ext.as_str(), "mp4" | "mov" | "mkv" | "avi" | "wmv" | "flv" | "m4v" | "webm");

        let conn = get_connection().await?;
        conn.execute(
            "INSERT OR REPLACE INTO photo_index (path, name, size_bytes, modified_ms, is_video, indexed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%s','now'))",
            params![
                path.to_string_lossy().into_owned(),
                path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
                metadata.len() as i64,
                modified_ms as i64,
                is_video as i32,
            ],
        ).map_err(|e| e.to_string())?;
        drop(conn);

        count += 1;
    }

    let conn = get_connection().await?;
    conn.execute(
        "INSERT INTO watched_folders (id, path, name, last_scanned_ms)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(path) DO UPDATE SET last_scanned_ms = ?4",
        params![
            uuid::Uuid::new_v4().to_string(),
            folder,
            folder.split('/').next_back().unwrap_or(folder),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(count)
}

/// Browse photos from a folder that has been indexed.
pub async fn browse_indexed(folder: &str) -> Result<Vec<IndexedPhoto>, String> {
    let conn = get_connection().await?;
    let prefix = format!("{}%", folder.trim_end_matches('/').trim_end_matches('\\'));

    let mut stmt = conn
        .prepare(
            "SELECT path, name, size_bytes, modified_ms, date_taken_ms,
                    width, height, camera_make, camera_model,
                    gps_lat, gps_lng, is_video
             FROM photo_index
             WHERE path LIKE ?1
             ORDER BY is_video ASC, modified_ms DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![prefix], |row| {
            Ok(IndexedPhoto {
                path: row.get(0)?,
                name: row.get(1)?,
                size_bytes: row.get::<_, i64>(2)? as u64,
                modified_ms: row.get::<_, i64>(3)? as u64,
                date_taken_ms: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                camera_make: row.get(7)?,
                camera_model: row.get(8)?,
                gps_lat: row.get(9)?,
                gps_lng: row.get(10)?,
                is_video: row.get::<_, i32>(11)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

/// Search indexed photos with filters.
pub async fn search_photos(filters: &SearchFilters) -> Result<Vec<IndexedPhoto>, String> {
    let conn = get_connection().await?;
    let mut sql = String::from(
        "SELECT path, name, size_bytes, modified_ms, date_taken_ms,
                width, height, camera_make, camera_model,
                gps_lat, gps_lng, is_video
         FROM photo_index WHERE 1=1",
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref q) = filters.query {
        if !q.is_empty() {
            sql.push_str(" AND name LIKE ?");
            param_values.push(Box::new(format!("%{}%", q)));
        }
    }

    if let Some(ref make) = filters.camera_make {
        sql.push_str(" AND camera_make = ?");
        param_values.push(Box::new(make.clone()));
    }

    if let Some(ref model) = filters.camera_model {
        sql.push_str(" AND camera_model = ?");
        param_values.push(Box::new(model.clone()));
    }

    if let Some(from) = filters.date_from {
        sql.push_str(" AND (date_taken_ms >= ? OR (date_taken_ms IS NULL AND modified_ms >= ?))");
        param_values.push(Box::new(from));
        param_values.push(Box::new(from));
    }

    if let Some(to) = filters.date_to {
        sql.push_str(" AND (date_taken_ms <= ? OR (date_taken_ms IS NULL AND modified_ms <= ?))");
        param_values.push(Box::new(to));
        param_values.push(Box::new(to));
    }

    if let Some(has_gps) = filters.has_gps {
        if has_gps {
            sql.push_str(" AND gps_lat IS NOT NULL AND gps_lng IS NOT NULL");
        } else {
            sql.push_str(" AND gps_lat IS NULL");
        }
    }

    if let Some(is_video) = filters.is_video {
        sql.push_str(if is_video { " AND is_video = 1" } else { " AND is_video = 0" });
    }

    sql.push_str(" ORDER BY modified_ms DESC LIMIT 1000");

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(IndexedPhoto {
                path: row.get(0)?,
                name: row.get(1)?,
                size_bytes: row.get::<_, i64>(2)? as u64,
                modified_ms: row.get::<_, i64>(3)? as u64,
                date_taken_ms: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                camera_make: row.get(7)?,
                camera_model: row.get(8)?,
                gps_lat: row.get(9)?,
                gps_lng: row.get(10)?,
                is_video: row.get::<_, i32>(11)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}
