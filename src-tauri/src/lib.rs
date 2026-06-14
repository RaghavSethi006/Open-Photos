pub mod commands;
pub mod metadata;
pub mod scanner;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::scan::run_media_organizer,
            commands::duplicates::scan_duplicates,
            commands::duplicates::resolve_duplicates,
            commands::photos::list_photos,
            commands::trash::move_files_to_trash,
            commands::trash::cleanup_trash_folder,
            commands::trash::list_trash_folder,
            commands::trash::restore_files_from_trash,
            commands::albums::create_album,
            commands::albums::list_albums,
            commands::albums::get_album,
            commands::albums::delete_album,
            commands::albums::rename_album,
            commands::albums::add_photos_to_album,
            commands::albums::remove_photos_from_album,
            commands::favorites::add_favorite,
            commands::favorites::remove_favorite,
            commands::favorites::list_favorites,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
