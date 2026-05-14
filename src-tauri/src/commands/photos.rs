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
    let has_search = filters.as_ref().map_or(false, |f| f.search.as_ref().map_or(false, |s| !s.is_empty()));
    
    let mut query_parts: Vec<String> = Vec::new();
    let mut bind_values: Vec<BindValue> = Vec::new();

    if has_search {
        let search = filters.as_ref().unwrap().search.as_ref().unwrap().clone();
        query_parts.push("SELECT i.* FROM images i JOIN images_fts f ON i.id = f.rowid WHERE f.images_fts MATCH ?1".into());
        bind_values.push(BindValue::Str(format!("{}*", search)));
        
        if let Some(c) = cursor {
            query_parts.push(format!(" AND i.id < ?{}", bind_values.len() + 1));
            bind_values.push(BindValue::Int(c));
        }
        query_parts.push(format!(" ORDER BY i.id DESC LIMIT ?{}", bind_values.len() + 1));
        bind_values.push(BindValue::Int(limit));
    } else {
        query_parts.push("SELECT * FROM images WHERE 1=1".into());
        
        if let Some(ref f) = filters {
            if let Some(y) = f.year {
                query_parts.push(format!(" AND year = ?{}", bind_values.len() + 1));
                bind_values.push(BindValue::Int(y));
            }
            if let Some(m) = f.month {
                query_parts.push(format!(" AND month = ?{}", bind_values.len() + 1));
                bind_values.push(BindValue::Int(m));
            }
        }

        if let Some(c) = cursor {
            query_parts.push(format!(" AND id < ?{}", bind_values.len() + 1));
            bind_values.push(BindValue::Int(c));
        }
        
        // Use id DESC so images without date_taken still show up
        query_parts.push(format!(" ORDER BY COALESCE(date_taken, created_at) DESC, id DESC LIMIT ?{}", bind_values.len() + 1));
        bind_values.push(BindValue::Int(limit));
    }

    let full_query = query_parts.join("");
    
    // Build and execute the query
    let mut q = sqlx::query_as::<_, Image>(&full_query);
    for v in &bind_values {
        match v {
            BindValue::Int(i) => q = q.bind(*i),
            BindValue::Str(s) => q = q.bind(s.as_str()),
        }
    }

    let items: Vec<Image> = q.fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // Use id as cursor since date_taken can be NULL
    let next_cursor = if items.len() as i64 == limit {
        items.last().map(|img| img.id)
    } else {
        None
    };

    Ok(PaginatedPhotos { items, next_cursor })
}

enum BindValue {
    Int(i64),
    Str(String),
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
