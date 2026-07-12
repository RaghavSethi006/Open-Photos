pub mod models;
pub mod queries;

use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use tokio::sync::Mutex;

static DB_INSTANCE: std::sync::OnceLock<Mutex<Connection>> = std::sync::OnceLock::new();

fn db_path() -> Result<PathBuf, String> {
    let mut path =
        dirs_next::data_dir().ok_or_else(|| "Could not find app data directory.".to_string())?;
    path.push("com.localphotos.app");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push("photo_index.db");
    Ok(path)
}

pub async fn get_connection() -> Result<tokio::sync::MutexGuard<'static, Connection>, String> {
    let conn = DB_INSTANCE.get_or_init(|| {
        let path = db_path().expect("Failed to resolve db path");
        let conn = Connection::open(&path).expect("Failed to open SQLite database");
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .expect("Failed to set pragmas");
        run_migrations(&conn).expect("Failed to run migrations");
        Mutex::new(conn)
    });
    Ok(conn.lock().await)
}

fn run_migrations(conn: &Connection) -> Result<(), String> {
    let version: i32 = conn
        .query_row(
            "SELECT COALESCE((SELECT version FROM schema_version ORDER BY version DESC LIMIT 1), 0)",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if version < 1 {
        conn.execute_batch(SCHEMA_V1).map_err(|e| e.to_string())?;
        conn.execute("INSERT INTO schema_version (version) VALUES (1)", [])
            .map_err(|e| e.to_string())?;
    }

    if version < 2 {
        conn.execute_batch("ALTER TABLE photo_index ADD COLUMN face_scanned_ms INTEGER;")
            .map_err(|e| e.to_string())?;
        conn.execute("INSERT INTO schema_version (version) VALUES (2)", [])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

const SCHEMA_V1: &str = "
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photo_index (
    path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    modified_ms INTEGER NOT NULL DEFAULT 0,
    date_taken_ms INTEGER,
    width INTEGER,
    height INTEGER,
    camera_make TEXT,
    camera_model TEXT,
    aperture TEXT,
    shutter_speed TEXT,
    iso INTEGER,
    focal_length TEXT,
    gps_lat REAL,
    gps_lng REAL,
    gps_lat_ref TEXT,
    gps_lng_ref TEXT,
    orientation INTEGER,
    is_video INTEGER NOT NULL DEFAULT 0,
    file_hash TEXT,
    indexed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS watched_folders (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    last_scanned_ms INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_photo_index_date_taken ON photo_index(date_taken_ms);
CREATE INDEX IF NOT EXISTS idx_photo_index_modified ON photo_index(modified_ms);
CREATE INDEX IF NOT EXISTS idx_photo_index_camera ON photo_index(camera_make, camera_model);
CREATE INDEX IF NOT EXISTS idx_photo_index_gps ON photo_index(gps_lat, gps_lng);
CREATE INDEX IF NOT EXISTS idx_photo_index_video ON photo_index(is_video);
";

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_conn() -> Connection {
        let path = std::env::temp_dir().join(format!(
            "lgp_db_test_{}.db",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn migrations_run_successfully() {
        let conn = test_conn();
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM photo_index", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);

        let version: i32 = conn
            .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);
    }

    #[test]
    fn insert_and_query_photo() {
        let conn = test_conn();
        conn.execute(
            "INSERT INTO photo_index (path, name, size_bytes, modified_ms, is_video)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params!["/test/photo.jpg", "photo.jpg", 12345, 1000, 0],
        )
        .unwrap();

        let (name, size): (String, i64) = conn
            .query_row(
                "SELECT name, size_bytes FROM photo_index WHERE path = ?1",
                ["/test/photo.jpg"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(name, "photo.jpg");
        assert_eq!(size, 12345);
    }
}
