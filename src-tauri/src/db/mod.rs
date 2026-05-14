use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::fs;
use tauri::Manager;

pub mod photos;

pub type DbPool = Pool<Sqlite>;

pub async fn init_db(app_handle: &tauri::AppHandle) -> Result<DbPool, Box<dyn std::error::Error>> {
    let app_dir = app_handle.path().app_data_dir()?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)?;
    }
    // We are starting fresh for this rewrite, using photos_v2.db
    let db_path = app_dir.join("photos_v2.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    if !db_path.exists() {
        fs::File::create(&db_path)?;
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect(&db_url)
        .await?;

    // Optimize SQLite for performance
    sqlx::query("PRAGMA journal_mode = WAL;").execute(&pool).await?;
    sqlx::query("PRAGMA synchronous = NORMAL;").execute(&pool).await?;
    sqlx::query("PRAGMA cache_size = -64000;").execute(&pool).await?;
    sqlx::query("PRAGMA temp_store = MEMORY;").execute(&pool).await?;

    // Apply schema
    sqlx::query(include_str!("schema.sql"))
        .execute(&pool)
        .await?;

    Ok(pool)
}
