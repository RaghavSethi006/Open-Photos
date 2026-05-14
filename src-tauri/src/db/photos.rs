use sqlx::Row;
use super::DbPool;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Image {
    pub id: i64,
    pub path: String,
    pub path_hash: i64,
    pub filename: String,
    pub ext: String,
    pub size_bytes: Option<i64>,
    pub date_taken: Option<i64>,
    pub year: Option<i64>,
    pub month: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub thumb_256: Option<String>,
    pub thumb_480: Option<String>,
    pub created_at: Option<i64>,
}

pub async fn load_existing_hashes(pool: &DbPool) -> Result<HashSet<u64>, sqlx::Error> {
    let rows = sqlx::query("SELECT path_hash FROM images")
        .fetch_all(pool)
        .await?;
    
    let mut hashes = HashSet::with_capacity(rows.len());
    for row in rows {
        let hash: i64 = row.try_get("path_hash")?;
        hashes.insert(hash as u64);
    }
    
    Ok(hashes)
}
