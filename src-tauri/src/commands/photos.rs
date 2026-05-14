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
    let mut query = String::from(
        "SELECT * FROM images WHERE 1=1"
    );
    let mut args = sqlx::sqlite::SqliteArguments::default();

    if let Some(c) = cursor {
        query.push_str(" AND date_taken < ?");
        sqlx::Arguments::add(&mut args, c);
    }

    if let Some(f) = filters {
        if let Some(search) = f.search {
            if !search.is_empty() {
                // If FTS5 search is used, we'd join with FTS table
                query = String::from(
                    "SELECT i.* FROM images i JOIN images_fts f ON i.id = f.rowid WHERE f.images_fts MATCH ?"
                );
                if let Some(c) = cursor {
                    query.push_str(" AND i.date_taken < ?");
                }
                sqlx::Arguments::add(&mut args, search + "*");
                if let Some(c) = cursor {
                    sqlx::Arguments::add(&mut args, c);
                }
            }
        } else {
            if let Some(y) = f.year {
                query.push_str(" AND year = ?");
                sqlx::Arguments::add(&mut args, y);
            }
            if let Some(m) = f.month {
                query.push_str(" AND month = ?");
                sqlx::Arguments::add(&mut args, m);
            }
        }
    }

    query.push_str(" ORDER BY date_taken DESC LIMIT ?");
    sqlx::Arguments::add(&mut args, limit);

    let items: Vec<Image> = sqlx::query_as_with(&query, args)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let next_cursor = items.last().and_then(|img| img.date_taken);

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
    let query = r#"
        SELECT year, month, COUNT(*) as count 
        FROM images 
        WHERE year IS NOT NULL AND month IS NOT NULL
        GROUP BY year, month 
        ORDER BY year DESC, month DESC
    "#;

    let rows = sqlx::query(query)
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
