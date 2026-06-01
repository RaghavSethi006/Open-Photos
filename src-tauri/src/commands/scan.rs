use crate::scanner::organizer::{organize_media, OrganizeOptions, OrganizeSummary};
use tauri::{command, AppHandle};

#[command]
pub async fn run_media_organizer(
    options: OrganizeOptions,
    app_handle: AppHandle,
) -> Result<OrganizeSummary, String> {
    tokio::task::spawn_blocking(move || organize_media(options, app_handle))
        .await
        .map_err(|e| e.to_string())?
}
