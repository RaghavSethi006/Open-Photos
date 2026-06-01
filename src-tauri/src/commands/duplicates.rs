use crate::scanner::duplicates::{
    scan_duplicates as scan_duplicates_impl,
    resolve_duplicates as resolve_duplicates_impl,
    DuplicateScanOptions, DuplicateSet,
    DuplicateResolveOptions, DuplicateResolveSummary,
};
use tauri::{command, AppHandle};

#[command]
pub async fn scan_duplicates(
    options: DuplicateScanOptions,
    app_handle: AppHandle,
) -> Result<Vec<DuplicateSet>, String> {
    tokio::task::spawn_blocking(move || scan_duplicates_impl(options, app_handle))
        .await
        .map_err(|e| e.to_string())?
}

#[command]
pub async fn resolve_duplicates(
    options: DuplicateResolveOptions,
    app_handle: AppHandle,
) -> Result<DuplicateResolveSummary, String> {
    tokio::task::spawn_blocking(move || resolve_duplicates_impl(options, app_handle))
        .await
        .map_err(|e| e.to_string())?
}
