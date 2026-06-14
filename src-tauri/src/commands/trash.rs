use crate::scanner::trash::{
    move_to_trash as move_to_trash_impl,
    cleanup_trash as cleanup_trash_impl,
    list_trash as list_trash_impl,
    restore_from_trash as restore_from_trash_impl,
    TrashEntry, TrashCleanupSummary,
};
use tauri::command;

#[command]
pub fn move_files_to_trash(
    paths: Vec<String>,
    trash_folder: String,
) -> Result<Vec<TrashEntry>, String> {
    move_to_trash_impl(paths, trash_folder)
}

#[command]
pub fn cleanup_trash_folder(
    trash_folder: String,
    retention_days: u64,
) -> Result<TrashCleanupSummary, String> {
    cleanup_trash_impl(trash_folder, retention_days)
}

#[command]
pub fn list_trash_folder(
    trash_folder: String,
) -> Result<Vec<TrashEntry>, String> {
    list_trash_impl(trash_folder)
}

#[command]
pub fn restore_files_from_trash(
    paths: Vec<String>,
    trash_folder: String,
) -> Result<Vec<String>, String> {
    restore_from_trash_impl(paths, trash_folder)
}
