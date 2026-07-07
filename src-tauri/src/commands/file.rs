use std::path::Path;
use tauri::command;

#[command]
pub fn move_file(source: String, dest_dir: String) -> Result<String, String> {
    let source_path = Path::new(&source);
    let file_name = source_path
        .file_name()
        .ok_or_else(|| "Invalid source path".to_string())?;
    let dest_path = Path::new(&dest_dir).join(file_name);

    if !source_path.exists() {
        return Err(format!("Source file does not exist: {}", source));
    }

    if dest_path.exists() {
        return Err(format!(
            "Destination already exists: {}",
            dest_path.display()
        ));
    }

    std::fs::rename(source_path, &dest_path)
        .map_err(|e| format!("Failed to move file: {}", e))?;

    Ok(dest_path.to_string_lossy().into_owned())
}
