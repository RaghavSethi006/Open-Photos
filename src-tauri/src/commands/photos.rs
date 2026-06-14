use serde::Serialize;
use std::path::PathBuf;
use std::fs;
use tauri::command;
use walkdir::WalkDir;

const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "heic", "webp", "tiff", "tif", "bmp", "gif", "avif",
];

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "mkv", "avi", "wmv", "flv", "m4v", "webm"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoEntry {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub modified_ms: u64,
    pub is_video: bool,
    #[serde(default)]
    pub is_folder: bool,
}

#[command]
pub fn list_photos(folder: String) -> Result<Vec<PhotoEntry>, String> {
    let root = PathBuf::from(folder.trim());

    if !root.is_dir() {
        return Err(format!(
            "Folder does not exist or is not a directory: {}",
            root.display()
        ));
    }

    let mut entries: Vec<PhotoEntry> = Vec::new();

    // Collect immediate subdirectories as folder entries
    let read_dir = fs::read_dir(&root).map_err(|e| e.to_string())?;
    for entry in read_dir.flatten() {
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            let path = entry.path();
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            // Skip hidden folders
            if name.starts_with('.') {
                continue;
            }
            entries.push(PhotoEntry {
                path: path.to_string_lossy().into_owned(),
                name,
                size_bytes: 0,
                modified_ms: 0,
                is_video: false,
                is_folder: true,
            });
        }
    }

    // Collect all media files recursively from all subdirectories
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        let is_image = IMAGE_EXTENSIONS.contains(&ext.as_str());
        let is_video = VIDEO_EXTENSIONS.contains(&ext.as_str());

        if !is_image && !is_video {
            continue;
        }

        let metadata = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        entries.push(PhotoEntry {
            path: path.to_string_lossy().into_owned(),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            size_bytes: metadata.len(),
            modified_ms,
            is_video,
            is_folder: false,
        });
    }

    // Sort: folders first (by name), then files (newest first)
    entries.sort_by(|a, b| {
        if a.is_folder != b.is_folder {
            return if a.is_folder { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater };
        }
        if a.is_folder {
            return a.name.to_lowercase().cmp(&b.name.to_lowercase());
        }
        b.modified_ms.cmp(&a.modified_ms)
    });

    Ok(entries)
}
