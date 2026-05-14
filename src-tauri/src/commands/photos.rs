use tauri::{State, command};
use serde::{Deserialize, Serialize};
use crate::db::{DbPool, photos::Image};
use sqlx::Row;

#[derive(Serialize)]
pub struct PaginatedPhotos {
    pub items: Vec<Image>,
    pub next_cursor: Option<i64>,
}

#[derive(Deserialize)]
pub struct PhotoFilters {
    pub year: Option<i64>,
    pub month: Option<i64>,
    pub search: Option<String>,
}

#[command]
pub async fn get_photos_page(
    cursor: Option<i64>,
    limit: i64,
    filters: Option<PhotoFilters>,
    pool: State<'_, DbPool>,
) -> Result<PaginatedPhotos, String> {
    let has_search = filters.as_ref()
        .and_then(|f| f.search.as_ref())
        .map_or(false, |s| !s.is_empty());

    let items: Vec<Image> = if has_search {
        let search_term = format!("{}*", filters.as_ref().unwrap().search.as_ref().unwrap());
        
        if let Some(c) = cursor {
            sqlx::query_as::<_, Image>(
                "SELECT i.* FROM images i JOIN images_fts f ON i.id = f.rowid WHERE f.images_fts MATCH ? AND i.id < ? ORDER BY i.id DESC LIMIT ?"
            )
            .bind(&search_term)
            .bind(c)
            .bind(limit)
            .fetch_all(pool.inner())
            .await
            .map_err(|e| e.to_string())?
        } else {
            sqlx::query_as::<_, Image>(
                "SELECT i.* FROM images i JOIN images_fts f ON i.id = f.rowid WHERE f.images_fts MATCH ? ORDER BY i.id DESC LIMIT ?"
            )
            .bind(&search_term)
            .bind(limit)
            .fetch_all(pool.inner())
            .await
            .map_err(|e| e.to_string())?
        }
    } else {
        let year_filter = filters.as_ref().and_then(|f| f.year);
        let month_filter = filters.as_ref().and_then(|f| f.month);

        match (cursor, year_filter, month_filter) {
            (Some(c), Some(y), Some(m)) => {
                sqlx::query_as::<_, Image>(
                    "SELECT * FROM images WHERE id < ? AND year = ? AND month = ? ORDER BY COALESCE(date_taken, created_at) DESC, id DESC LIMIT ?"
                ).bind(c).bind(y).bind(m).bind(limit)
                .fetch_all(pool.inner()).await.map_err(|e| e.to_string())?
            }
            (Some(c), Some(y), None) => {
                sqlx::query_as::<_, Image>(
                    "SELECT * FROM images WHERE id < ? AND year = ? ORDER BY COALESCE(date_taken, created_at) DESC, id DESC LIMIT ?"
                ).bind(c).bind(y).bind(limit)
                .fetch_all(pool.inner()).await.map_err(|e| e.to_string())?
            }
            (Some(c), None, None) => {
                sqlx::query_as::<_, Image>(
                    "SELECT * FROM images WHERE id < ? ORDER BY COALESCE(date_taken, created_at) DESC, id DESC LIMIT ?"
                ).bind(c).bind(limit)
                .fetch_all(pool.inner()).await.map_err(|e| e.to_string())?
            }
            (None, Some(y), Some(m)) => {
                sqlx::query_as::<_, Image>(
                    "SELECT * FROM images WHERE year = ? AND month = ? ORDER BY COALESCE(date_taken, created_at) DESC, id DESC LIMIT ?"
                ).bind(y).bind(m).bind(limit)
                .fetch_all(pool.inner()).await.map_err(|e| e.to_string())?
            }
            (None, Some(y), None) => {
                sqlx::query_as::<_, Image>(
                    "SELECT * FROM images WHERE year = ? ORDER BY COALESCE(date_taken, created_at) DESC, id DESC LIMIT ?"
                ).bind(y).bind(limit)
                .fetch_all(pool.inner()).await.map_err(|e| e.to_string())?
            }
            _ => {
                sqlx::query_as::<_, Image>(
                    "SELECT * FROM images ORDER BY COALESCE(date_taken, created_at) DESC, id DESC LIMIT ?"
                ).bind(limit)
                .fetch_all(pool.inner()).await.map_err(|e| e.to_string())?
            }
        }
    };

    let next_cursor = if items.len() as i64 == limit {
        items.last().map(|img| img.id)
    } else {
        None
    };

    Ok(PaginatedPhotos { items, next_cursor })
}

#[derive(Serialize)]
pub struct TimelineGroup {
    pub year: i64,
    pub month: i64,
    pub count: i64,
}

#[command]
pub async fn get_timeline_groups(
    pool: State<'_, DbPool>,
) -> Result<Vec<TimelineGroup>, String> {
    let rows = sqlx::query(
        "SELECT year, month, COUNT(*) as count FROM images WHERE year IS NOT NULL AND month IS NOT NULL GROUP BY year, month ORDER BY year DESC, month DESC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let mut groups = Vec::with_capacity(rows.len());
    for row in rows {
        groups.push(TimelineGroup {
            year: row.try_get("year").map_err(|e: sqlx::Error| e.to_string())?,
            month: row.try_get("month").map_err(|e: sqlx::Error| e.to_string())?,
            count: row.try_get("count").map_err(|e: sqlx::Error| e.to_string())?,
        });
    }

    Ok(groups)
}
