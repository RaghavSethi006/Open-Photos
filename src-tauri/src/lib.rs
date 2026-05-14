pub mod commands;
pub mod db;
pub mod metadata;
pub mod scanner;
pub mod thumbs;

use tauri::Manager;
use db::init_db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Setup tracing
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Initialize database asynchronously using block_on
            let pool = tauri::async_runtime::block_on(init_db(app.handle()))
                .expect("Failed to initialize database");
            
            // Manage state
            app.manage(pool);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan::start_scan,
            commands::photos::get_photos_page,
            commands::photos::get_timeline_groups,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
