use chrono::{Local, NaiveDateTime};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MANIFEST_FILE: &str = "manifest.json";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    pub path: String,
    pub name: String,
    pub original_path: String,
    pub moved_at: u64,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Manifest {
    #[serde(rename = "files")]
    files: HashMap<String, String>, // trash_filename -> original_path
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashCleanupSummary {
    pub deleted_count: u64,
    pub saved_bytes: u64,
    pub errors: Vec<String>,
}

fn manifest_path(trash: &Path) -> PathBuf {
    trash.join(MANIFEST_FILE)
}

fn read_manifest(trash: &Path) -> Manifest {
    let path = manifest_path(trash);
    if !path.exists() {
        return Manifest {
            files: HashMap::new(),
        };
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Manifest {
            files: HashMap::new(),
        })
}

fn write_manifest(trash: &Path, manifest: &Manifest) -> Result<(), String> {
    let path = manifest_path(trash);
    let json = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    atomic_write_string(&path, &json)
}

fn atomic_write_string(path: &Path, content: &str) -> Result<(), String> {
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, content).map_err(|e| e.to_string())?;

    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    fs::rename(&temp_path, path).map_err(|e| e.to_string())
}

fn timestamp_prefix() -> String {
    Local::now().format("%Y-%m-%d_%H%M%S").to_string()
}

fn parse_timestamp_from_name(name: &str) -> Option<i64> {
    let ts_part = name.get(..17)?;
    NaiveDateTime::parse_from_str(ts_part, "%Y-%m-%d_%H%M%S")
        .ok()
        .map(|dt| dt.and_utc().timestamp())
}

fn strip_trash_prefix(name: &str) -> &str {
    if parse_timestamp_from_name(name).is_none() {
        return name;
    }

    let Some(mut rest) = name.get(18..) else {
        return name;
    };

    if let Some((maybe_counter, after_counter)) = rest.split_once('_') {
        if !maybe_counter.is_empty() && maybe_counter.chars().all(|c| c.is_ascii_digit()) {
            rest = after_counter;
        }
    }

    if rest.is_empty() {
        name
    } else {
        rest
    }
}

pub fn move_to_trash(paths: Vec<String>, trash_folder: String) -> Result<Vec<TrashEntry>, String> {
    let trash = PathBuf::from(trash_folder.trim());
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;

    let mut manifest = read_manifest(&trash);
    let mut entries = Vec::new();

    for path_str in &paths {
        let src = PathBuf::from(path_str);
        if !src.exists() {
            continue;
        }

        let filename = src
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let prefix = timestamp_prefix();
        let trash_name = format!("{}_{}", prefix, filename);
        let dest = trash.join(&trash_name);
        let mut counter = 1;

        let final_name = if dest.exists() {
            loop {
                let alt_name = format!("{}_{}_{}", prefix, counter, filename);
                let alt_dest = trash.join(&alt_name);
                if !alt_dest.exists() {
                    break alt_name;
                }
                counter += 1;
            }
        } else {
            trash_name
        };

        let final_dest = trash.join(&final_name);
        let size = fs::metadata(&src).map(|m| m.len()).unwrap_or(0);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let moved = match fs::rename(&src, &final_dest) {
            Ok(_) => true,
            Err(_) => match fs::copy(&src, &final_dest) {
                Ok(_) => {
                    let _ = fs::remove_file(&src);
                    true
                }
                Err(e) => {
                    return Err(format!("Failed to move {} to trash: {}", path_str, e));
                }
            },
        };

        if moved {
            manifest.files.insert(final_name.clone(), path_str.clone());
            entries.push(TrashEntry {
                path: final_dest.to_string_lossy().into_owned(),
                name: final_name,
                original_path: path_str.clone(),
                moved_at: now,
                size,
            });
        }
    }

    write_manifest(&trash, &manifest)?;
    Ok(entries)
}

pub fn cleanup_trash(
    trash_folder: String,
    retention_days: u64,
) -> Result<TrashCleanupSummary, String> {
    let trash = PathBuf::from(trash_folder.trim());
    if !trash.is_dir() {
        return Ok(TrashCleanupSummary {
            deleted_count: 0,
            saved_bytes: 0,
            errors: Vec::new(),
        });
    }

    let mut manifest = read_manifest(&trash);
    let cutoff_secs = (retention_days as i64) * 86400;
    let now = Local::now().timestamp();
    let mut summary = TrashCleanupSummary {
        deleted_count: 0,
        saved_bytes: 0,
        errors: Vec::new(),
    };

    let read_dir = match fs::read_dir(&trash) {
        Ok(d) => d,
        Err(e) => return Err(e.to_string()),
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(f) => f.to_string(),
            None => continue,
        };

        if file_name == MANIFEST_FILE {
            continue;
        }

        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }

        if let Some(ts) = parse_timestamp_from_name(&file_name) {
            if now - ts > cutoff_secs {
                let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                match fs::remove_file(&path) {
                    Ok(_) => {
                        manifest.files.remove(&file_name);
                        summary.deleted_count += 1;
                        summary.saved_bytes += size;
                    }
                    Err(e) => {
                        summary
                            .errors
                            .push(format!("Failed to delete {}: {}", file_name, e));
                    }
                }
            }
        }
    }

    let _ = write_manifest(&trash, &manifest);
    Ok(summary)
}

pub fn list_trash(trash_folder: String) -> Result<Vec<TrashEntry>, String> {
    let trash = PathBuf::from(trash_folder.trim());
    if !trash.is_dir() {
        return Ok(Vec::new());
    }

    let manifest = read_manifest(&trash);
    let mut entries = Vec::new();
    let read_dir = match fs::read_dir(&trash) {
        Ok(d) => d,
        Err(e) => return Err(e.to_string()),
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(f) => f.to_string(),
            None => continue,
        };

        if file_name == MANIFEST_FILE {
            continue;
        }

        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }

        let metadata = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        entries.push(TrashEntry {
            path: path.to_string_lossy().into_owned(),
            name: file_name.clone(),
            original_path: manifest
                .files
                .get(&file_name)
                .cloned()
                .unwrap_or_default(),
            moved_at: modified,
            size: metadata.len(),
        });
    }

    Ok(entries)
}

pub fn restore_from_trash(
    paths: Vec<String>,
    trash_folder: String,
) -> Result<Vec<String>, String> {
    let trash = PathBuf::from(trash_folder.trim());
    let mut manifest = read_manifest(&trash);
    let mut restored = Vec::new();

    for path_str in &paths {
        let src = PathBuf::from(path_str);
        if !src.exists() {
            continue;
        }

        let file_name = match src.file_name().and_then(|n| n.to_str()) {
            Some(f) => f.to_string(),
            None => continue,
        };

        // Try to restore to original location
        let original_path = manifest.files.get(&file_name);
        let dest = if let Some(orig) = original_path {
            let orig_path = PathBuf::from(orig);
            let parent = orig_path.parent().unwrap_or(&trash);

            // Check if original location still exists
            if parent.exists() {
                // Handle filename collision at original location
                let orig_name = orig_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&file_name);
                let candidate = parent.join(orig_name);
                if !candidate.exists() {
                    candidate
                } else {
                    // Add suffix to avoid overwrite
                    let stem = Path::new(orig_name)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("file");
                    let ext = Path::new(orig_name)
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or("");
                    let mut counter = 1;
                    loop {
                        let name = if ext.is_empty() {
                            format!("{}_{}", stem, counter)
                        } else {
                            format!("{}_{}.{}", stem, counter, ext)
                        };
                        let candidate = parent.join(&name);
                        if !candidate.exists() {
                            break candidate;
                        }
                        counter += 1;
                    }
                }
            } else {
                // Original parent doesn't exist, restore to trash parent
                let trash_parent = trash.parent().unwrap_or(&trash);
                fs::create_dir_all(trash_parent).map_err(|e| e.to_string())?;
                trash_parent.join(strip_trash_prefix(&file_name))
            }
        } else {
            // No manifest entry, just strip timestamp prefix
            let trash_parent = trash.parent().unwrap_or(&trash);
            fs::create_dir_all(trash_parent).map_err(|e| e.to_string())?;
            let restored_name = strip_trash_prefix(&file_name);
            trash_parent.join(if restored_name.is_empty() {
                file_name.as_str()
            } else {
                restored_name
            })
        };

        match fs::rename(&src, &dest) {
            Ok(_) => {
                manifest.files.remove(&file_name);
                restored.push(dest.to_string_lossy().into_owned());
            }
            Err(_) => match fs::copy(&src, &dest) {
                Ok(_) => {
                    let _ = fs::remove_file(&src);
                    manifest.files.remove(&file_name);
                    restored.push(dest.to_string_lossy().into_owned());
                }
                Err(e) => {
                    return Err(format!("Failed to restore {}: {}", file_name, e));
                }
            },
        }
    }

    let _ = write_manifest(&trash, &manifest);
    Ok(restored)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!(
            "lgp_trash_test_{}_{}",
            name,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn parses_full_timestamp_prefix() {
        let timestamp = parse_timestamp_from_name("2026-07-01_153045_photo.jpg").unwrap();
        let expected = NaiveDateTime::parse_from_str("2026-07-01_153045", "%Y-%m-%d_%H%M%S")
            .unwrap()
            .and_utc()
            .timestamp();

        assert_eq!(timestamp, expected);
    }

    #[test]
    fn strips_timestamp_prefix_without_collision_counter() {
        assert_eq!(
            strip_trash_prefix("2026-07-01_153045_photo.jpg"),
            "photo.jpg"
        );
    }

    #[test]
    fn strips_timestamp_prefix_with_collision_counter() {
        assert_eq!(
            strip_trash_prefix("2026-07-01_153045_1_photo.jpg"),
            "photo.jpg"
        );
    }

    #[test]
    fn manifest_write_leaves_no_temp_file_after_success() {
        let dir = unique_temp_dir("manifest");
        let manifest = Manifest {
            files: HashMap::from([("trash.jpg".to_string(), "original.jpg".to_string())]),
        };

        write_manifest(&dir, &manifest).unwrap();

        assert!(manifest_path(&dir).exists());
        assert!(!dir.join("manifest.json.tmp").exists());

        let _ = fs::remove_dir_all(dir);
    }
}
