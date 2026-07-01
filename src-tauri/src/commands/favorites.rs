use crate::scanner::favorites::{
    add_favorite as add_favorite_impl, list_favorites as list_favorites_impl,
    remove_favorite as remove_favorite_impl,
};
use tauri::command;

#[command]
pub fn add_favorite(path: String) -> Result<(), String> {
    add_favorite_impl(path)
}

#[command]
pub fn remove_favorite(path: String) -> Result<(), String> {
    remove_favorite_impl(path)
}

#[command]
pub fn list_favorites() -> Result<Vec<String>, String> {
    list_favorites_impl()
}
