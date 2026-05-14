pub mod ai;
pub mod db;
pub mod metadata;
pub mod scanner;
pub mod thumbs;

use std::fs;
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::init_db(&handle).await.expect("failed to init db");
                handle.manage(pool);
            });
            Ok(())
        })
        .register_uri_scheme_protocol("thumb", |app, request| {
            let url = request.uri().path();
            let id_str = url.trim_start_matches('/');
            let id: i64 = id_str.parse().unwrap_or(0);

            let thumb_path = thumbs::get_thumb_path(app.app_handle(), id);

            if thumb_path.exists() {
                let data = fs::read(thumb_path).unwrap_or_default();
                tauri::http::Response::builder()
                    .header("Content-Type", "image/jpeg")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(data)
                    .unwrap()
            } else {
                tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap()
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            scanner::scan_directory,
            scanner::scan_ntfs,
            db::get_photos,
            db::get_timeline,
            db::save_face,
            db::get_people
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
