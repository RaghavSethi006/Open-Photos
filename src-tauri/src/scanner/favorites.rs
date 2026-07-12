use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

const FAVORITES_FILE: &str = "favorites.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Favorites {
    pub paths: Vec<String>,
}

fn favorites_path() -> Result<PathBuf, String> {
    let mut path =
        dirs_next::data_dir().ok_or_else(|| "Could not find app data directory.".to_string())?;
    path.push("com.localphotos.app");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push(FAVORITES_FILE);
    Ok(path)
}

fn read_favorites() -> Result<HashSet<String>, String> {
    let path = favorites_path()?;
    if !path.exists() {
        return Ok(HashSet::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let favs: Favorites = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(favs.paths.into_iter().collect())
}

fn write_favorites(paths: &HashSet<String>) -> Result<(), String> {
    let path = favorites_path()?;
    let mut sorted: Vec<String> = paths.iter().cloned().collect();
    sorted.sort();
    let favs = Favorites { paths: sorted };
    let content = serde_json::to_string_pretty(&favs).map_err(|e| e.to_string())?;
    crate::scanner::atomic_write_string(&path, &content)
}

pub fn add_favorite(path: String) -> Result<(), String> {
    let mut favorites = read_favorites()?;
    favorites.insert(path);
    write_favorites(&favorites)
}

pub fn remove_favorite(path: String) -> Result<(), String> {
    let mut favorites = read_favorites()?;
    favorites.remove(&path);
    write_favorites(&favorites)
}

pub fn list_favorites() -> Result<Vec<String>, String> {
    let favorites = read_favorites()?;
    let mut result: Vec<String> = favorites.into_iter().collect();
    result.sort();
    Ok(result)
}

pub fn is_favorite(path: &str) -> Result<bool, String> {
    let favorites = read_favorites()?;
    Ok(favorites.contains(path))
}
