use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::fs;
use tauri::Manager;

pub type DbPool = Pool<Sqlite>;

pub async fn init_db(app_handle: &tauri::AppHandle) -> Result<DbPool, Box<dyn std::error::Error>> {
    let app_dir = app_handle.path().app_data_dir()?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)?;
    }
    let db_path = app_dir.join("photos.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    if !db_path.exists() {
        fs::File::create(&db_path)?;
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    sqlx::query(include_str!("schema.sql"))
        .execute(&pool)
        .await?;

    Ok(pool)
}

use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Image {
    pub id: i64,
    pub path: String,
    pub filename: String,
}

#[tauri::command]
pub async fn get_photos(
    limit: i64,
    offset: i64,
    pool: State<'_, DbPool>,
) -> Result<Vec<Image>, String> {
    sqlx::query_as::<_, Image>(
        "SELECT id, path, filename FROM images ORDER BY id DESC LIMIT ? OFFSET ?",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimelineGroup {
    pub year: i32,
    pub month: i32,
    pub count: i64,
    pub photos: Vec<Image>,
}

#[tauri::command]
pub async fn get_timeline(pool: State<'_, DbPool>) -> Result<Vec<TimelineGroup>, String> {
    // Single query to get everything needed
    let rows = sqlx::query_as::<_, (i64, String, String, Option<String>)>(
        "SELECT id, path, filename, date_taken FROM images WHERE date_taken IS NOT NULL ORDER BY date_taken DESC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let mut groups: std::collections::HashMap<(i32, i32), Vec<Image>> =
        std::collections::HashMap::new();

    for (id, path, filename, date_taken) in rows {
        if let Some(dt_str) = date_taken {
            // Parse year/month from string "YYYY-MM-DD HH:MM:SS"
            if dt_str.len() >= 7 {
                if let (Ok(year), Ok(month)) =
                    (dt_str[0..4].parse::<i32>(), dt_str[5..7].parse::<i32>())
                {
                    groups
                        .entry((year, month))
                        .or_insert_with(Vec::new)
                        .push(Image { id, path, filename });
                }
            }
        }
    }

    // Convert to timeline groups
    let mut timeline: Vec<TimelineGroup> = groups
        .into_iter()
        .map(|((year, month), photos)| {
            let count = photos.len() as i64;
            TimelineGroup {
                year,
                month,
                count,
                photos,
            }
        })
        .collect();

    // Sort by year/month descending
    timeline.sort_by(|a, b| b.year.cmp(&a.year).then(b.month.cmp(&a.month)));

    Ok(timeline)
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct Face {
    pub id: i64,
    pub image_id: i64,
    pub bbox_x: i32,
    pub bbox_y: i32,
    pub bbox_width: i32,
    pub bbox_height: i32,
    pub confidence: f32,
}

#[tauri::command]
pub async fn save_face(
    image_id: i64,
    bbox_x: i32,
    bbox_y: i32,
    bbox_width: i32,
    bbox_height: i32,
    confidence: f32,
    pool: State<'_, DbPool>,
) -> Result<i64, String> {
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO faces (image_id, bbox_x, bbox_y, bbox_width, bbox_height, confidence) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
    )
    .bind(image_id)
    .bind(bbox_x)
    .bind(bbox_y)
    .bind(bbox_width)
    .bind(bbox_height)
    .bind(confidence)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub async fn get_people(pool: State<'_, DbPool>) -> Result<Vec<(i64, String, i64)>, String> {
    // Returns (person_id, name, face_count)
    let people: Vec<(i64, Option<String>, i64)> = sqlx::query_as(
        "SELECT p.id, p.name, COUNT(f.id) as count FROM people p LEFT JOIN faces f ON p.id = f.person_id GROUP BY p.id ORDER BY count DESC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(people
        .into_iter()
        .map(|(id, name, count)| (id, name.unwrap_or_else(|| format!("Person {}", id)), count))
        .collect())
}
