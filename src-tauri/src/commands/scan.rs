use tauri::{AppHandle, State, command};
use std::path::PathBuf;
use crate::db::DbPool;
use crate::scanner::pipeline::run_scan_pipeline;

#[command]
pub async fn start_scan(
    path: String,
    app_handle: AppHandle,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    let pool_clone = pool.inner().clone();
    
    // Run the pipeline asynchronously so we don't block the Tauri command handler
    tokio::spawn(async move {
        let _ = run_scan_pipeline(PathBuf::from(path), app_handle, pool_clone).await;
    });

    Ok(())
}
