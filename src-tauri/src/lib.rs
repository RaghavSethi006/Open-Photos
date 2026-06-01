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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
