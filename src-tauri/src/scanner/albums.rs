use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const ALBUMS_FILE: &str = "albums.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub name: String,
    pub description: String,
    pub cover_path: String,
    pub created_at: u64,
    pub photo_paths: Vec<String>,
}

fn albums_path() -> Result<PathBuf, String> {
    let mut path = dirs_next::data_dir()
        .ok_or_else(|| "Could not find app data directory.".to_string())?;
    path.push("com.localphotos.app");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push(ALBUMS_FILE);
    Ok(path)
}

fn read_albums() -> Result<Vec<Album>, String> {
    let path = albums_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_albums(albums: &[Album]) -> Result<(), String> {
    let path = albums_path()?;
    let content = serde_json::to_string_pretty(albums).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

pub fn create_album(name: String, description: String, photo_paths: Vec<String>) -> Result<Album, String> {
    let mut albums = read_albums()?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let cover_path = photo_paths.first().cloned().unwrap_or_default();

    let album = Album {
        id: Uuid::new_v4().to_string(),
        name,
        description,
        cover_path,
        created_at: now,
        photo_paths,
    };

    albums.push(album.clone());
    write_albums(&albums)?;
    Ok(album)
}

pub fn list_albums() -> Result<Vec<Album>, String> {
    read_albums()
}

pub fn get_album(id: String) -> Result<Option<Album>, String> {
    let albums = read_albums()?;
    Ok(albums.into_iter().find(|a| a.id == id))
}

pub fn delete_album(id: String) -> Result<(), String> {
    let mut albums = read_albums()?;
    albums.retain(|a| a.id != id);
    write_albums(&albums)
}

pub fn rename_album(id: String, new_name: String) -> Result<Album, String> {
    let mut albums = read_albums()?;
    let album = albums
        .iter_mut()
        .find(|a| a.id == id)
        .ok_or_else(|| "Album not found.".to_string())?;
    album.name = new_name.clone();
    let result = album.clone();
    write_albums(&albums)?;
    Ok(result)
}

pub fn add_photos_to_album(id: String, photo_paths: Vec<String>) -> Result<Album, String> {
    let mut albums = read_albums()?;
    let album = albums
        .iter_mut()
        .find(|a| a.id == id)
        .ok_or_else(|| "Album not found.".to_string())?;

    for path in photo_paths {
        if !album.photo_paths.contains(&path) {
            album.photo_paths.push(path);
        }
    }

    if album.cover_path.is_empty() {
        if let Some(first) = album.photo_paths.first() {
            album.cover_path = first.clone();
        }
    }

    let result = album.clone();
    write_albums(&albums)?;
    Ok(result)
}

pub fn remove_photos_from_album(id: String, photo_paths: Vec<String>) -> Result<Album, String> {
    let mut albums = read_albums()?;
    let album = albums
        .iter_mut()
        .find(|a| a.id == id)
        .ok_or_else(|| "Album not found.".to_string())?;

    album.photo_paths.retain(|p| !photo_paths.contains(p));

    // Update cover if it was removed
    if !album.photo_paths.contains(&album.cover_path) {
        album.cover_path = album.photo_paths.first().cloned().unwrap_or_default();
    }

    let result = album.clone();
    write_albums(&albums)?;
    Ok(result)
}
