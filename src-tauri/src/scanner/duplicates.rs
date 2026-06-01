use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use walkdir::WalkDir;
use tauri::{AppHandle, Emitter};

const DEFAULT_EXTENSIONS: &[&str] = &[
    ".jpg", ".jpeg", ".png", ".heic", ".webp", ".tiff", ".bmp", ".mp4", ".mov", ".mkv", ".avi",
    ".wmv", ".flv", ".m4v",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateScanOptions {
    pub source: String,
    pub allowed_extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: u64, // millisecond timestamp
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateSet {
    pub hash: String,
    pub original: DuplicateFile,
    pub duplicates: Vec<DuplicateFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateScanProgress {
    pub scanned: u64,
    pub duplicates_found: u64,
    pub current_file: String,
    pub elapsed_ms: u64,
    pub phase: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateResolveItem {
    pub path: String,
    pub hash: String,
    pub is_original: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateResolveOptions {
    pub items: Vec<DuplicateResolveItem>,
    pub delete_duplicates: bool,
    pub move_duplicates_to: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateResolveSummary {
    pub resolved_count: u64,
    pub deleted_count: u64,
    pub moved_count: u64,
    pub saved_bytes: u64,
    pub errors: Vec<String>,
    pub elapsed_ms: u64,
}

fn get_file_hash_sha256(path: &Path) -> Result<String, std::io::Error> {
    use std::io::Read;
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let hash = hasher.finalize();
    Ok(hash.iter().map(|b| format!("{:02x}", b)).collect())
}

pub fn scan_duplicates(
    options: DuplicateScanOptions,
    app_handle: AppHandle,
) -> Result<Vec<DuplicateSet>, String> {
    let source = PathBuf::from(options.source.trim());
    if !source.is_dir() {
        return Err("Source folder does not exist or is not a folder.".into());
    }

    let allowed_exts = if options.allowed_extensions.is_empty() {
        DEFAULT_EXTENSIONS.iter().map(|s| s.to_string()).collect::<std::collections::HashSet<_>>()
    } else {
        options.allowed_extensions.iter().map(|ext| {
            let lower = ext.trim().to_lowercase();
            if lower.starts_with('.') { lower } else { format!(".{}", lower) }
        }).collect::<std::collections::HashSet<_>>()
    };

    let start = Instant::now();
    let mut hash_map: HashMap<String, (DuplicateFile, Vec<DuplicateFile>)> = HashMap::new();
    let mut scanned_count = 0;
    let mut duplicates_count = 0;

    for entry in WalkDir::new(&source).follow_links(false).into_iter() {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e.to_lowercase()))
            .unwrap_or_default();

        if !allowed_exts.contains(&ext) {
            continue;
        }

        scanned_count += 1;

        if scanned_count % 50 == 0 {
            let current_file = path.to_string_lossy().into_owned();
            let _ = app_handle.emit("duplicate:progress", DuplicateScanProgress {
                scanned: scanned_count,
                duplicates_found: duplicates_count,
                current_file,
                elapsed_ms: start.elapsed().as_millis() as u64,
                phase: "Scanning & Hashing".to_string(),
            });
        }

        let hash = match get_file_hash_sha256(path) {
            Ok(h) => h,
            Err(_) => continue,
        };

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let file_size = metadata.len();
        let modified = metadata.modified()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let dup_file = DuplicateFile {
            path: path.to_string_lossy().into_owned(),
            name: path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
            size: file_size,
            modified,
        };

        if let Some(entry_set) = hash_map.get_mut(&hash) {
            entry_set.1.push(dup_file);
            duplicates_count += 1;
        } else {
            hash_map.insert(hash, (dup_file, Vec::new()));
        }
    }

    // Filter only groups containing duplicate files
    let result: Vec<DuplicateSet> = hash_map.into_iter()
        .filter(|(_, (_, dups))| !dups.is_empty())
        .map(|(hash, (original, duplicates))| DuplicateSet {
            hash,
            original,
            duplicates,
        })
        .collect();

    let _ = app_handle.emit("duplicate:complete", DuplicateScanProgress {
        scanned: scanned_count,
        duplicates_found: duplicates_count,
        current_file: "".to_string(),
        elapsed_ms: start.elapsed().as_millis() as u64,
        phase: "Done".to_string(),
    });

    Ok(result)
}

pub fn resolve_duplicates(
    options: DuplicateResolveOptions,
    _app_handle: AppHandle,
) -> Result<DuplicateResolveSummary, String> {
    let start = Instant::now();
    let mut summary = DuplicateResolveSummary {
        resolved_count: 0,
        deleted_count: 0,
        moved_count: 0,
        saved_bytes: 0,
        errors: Vec::new(),
        elapsed_ms: 0,
    };

    if !options.delete_duplicates && options.move_duplicates_to.is_none() {
        return Err("Must specify either delete_duplicates as true or move_duplicates_to path.".into());
    }

    if let Some(ref move_dir_str) = options.move_duplicates_to {
        let move_dir = PathBuf::from(move_dir_str.trim());
        if !move_dir.exists() {
            fs::create_dir_all(&move_dir).map_err(|e| e.to_string())?;
        }
    }

    for item in options.items {
        if item.is_original {
            continue;
        }

        let path = PathBuf::from(&item.path);
        if !path.exists() {
            summary.errors.push(format!("File does not exist: {}", item.path));
            continue;
        }

        let file_size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

        if options.delete_duplicates {
            match fs::remove_file(&path) {
                Ok(_) => {
                    summary.resolved_count += 1;
                    summary.deleted_count += 1;
                    summary.saved_bytes += file_size;
                }
                Err(e) => {
                    summary.errors.push(format!("Failed to delete {}: {}", item.path, e));
                }
            }
        } else if let Some(ref move_dir_str) = options.move_duplicates_to {
            let move_dir = PathBuf::from(move_dir_str.trim());
            let filename = match path.file_name() {
                Some(f) => f,
                None => {
                    summary.errors.push(format!("Invalid filename for path: {}", item.path));
                    continue;
                }
            };

            let mut dest_path = move_dir.join(filename);
            let mut counter = 1;

            while dest_path.exists() {
                let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                let name = if ext.is_empty() {
                    format!("{}_{}", stem, counter)
                } else {
                    format!("{}_{}.{}", stem, counter, ext)
                };
                dest_path = move_dir.join(name);
                counter += 1;
            }

            match fs::rename(&path, &dest_path) {
                Ok(_) => {
                    summary.resolved_count += 1;
                    summary.moved_count += 1;
                    summary.saved_bytes += file_size;
                }
                Err(e) => {
                    // Try copy + delete if rename fails (cross-filesystem moves)
                    match fs::copy(&path, &dest_path) {
                        Ok(_) => {
                            let _ = fs::remove_file(&path);
                            summary.resolved_count += 1;
                            summary.moved_count += 1;
                            summary.saved_bytes += file_size;
                        }
                        Err(copy_err) => {
                            summary.errors.push(format!(
                                "Failed to move {} to {}: {} (Copy error: {})",
                                item.path, dest_path.display(), e, copy_err
                            ));
                        }
                    }
                }
            }
        }
    }

    summary.elapsed_ms = start.elapsed().as_millis() as u64;
    Ok(summary)
}
