use crate::scanner::albums::{
    add_photos_to_album as add_photos_impl, create_album as create_album_impl,
    delete_album as delete_album_impl, get_album as get_album_impl,
    list_albums as list_albums_impl, remove_photos_from_album as remove_photos_impl,
    rename_album as rename_album_impl, Album,
};
use tauri::command;

#[command]
pub fn create_album(
    name: String,
    description: String,
    photo_paths: Vec<String>,
) -> Result<Album, String> {
    create_album_impl(name, description, photo_paths)
}

#[command]
pub fn list_albums() -> Result<Vec<Album>, String> {
    list_albums_impl()
}

#[command]
pub fn get_album(id: String) -> Result<Option<Album>, String> {
    get_album_impl(id)
}

#[command]
pub fn delete_album(id: String) -> Result<(), String> {
    delete_album_impl(id)
}

#[command]
pub fn rename_album(id: String, name: String) -> Result<Album, String> {
    rename_album_impl(id, name)
}

#[command]
pub fn add_photos_to_album(id: String, photo_paths: Vec<String>) -> Result<Album, String> {
    add_photos_impl(id, photo_paths)
}

#[command]
pub fn remove_photos_from_album(id: String, photo_paths: Vec<String>) -> Result<Album, String> {
    remove_photos_impl(id, photo_paths)
}
