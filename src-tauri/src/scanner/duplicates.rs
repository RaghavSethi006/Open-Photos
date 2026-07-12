use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

const DEFAULT_EXTENSIONS: &[&str] = &[
    ".jpg", ".jpeg", ".png", ".heic", ".webp", ".tiff", ".bmp", ".mp4", ".mov", ".mkv", ".avi",
    ".wmv", ".flv", ".m4v", ".gif", ".avif", ".webm",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateScanOptions {
    pub source: String,
    pub allowed_extensions: Vec<String>,
    #[serde(default = "default_skip_hidden_files")]
    pub skip_hidden_files: bool,
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

fn default_skip_hidden_files() -> bool {
    true
}

fn is_hidden_path(path: &Path, root: &Path) -> bool {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .any(|component| {
            component
                .as_os_str()
                .to_str()
                .map(|part| part.starts_with('.') && part.len() > 1)
                .unwrap_or(false)
        })
}

fn duplicate_file_from_path(path: &Path) -> Result<DuplicateFile, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .and_then(|t| {
            t.duration_since(SystemTime::UNIX_EPOCH)
                .map_err(|e| std::io::Error::other(e.to_string()))
        })
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(DuplicateFile {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string(),
        size: metadata.len(),
        modified,
    })
}

fn collect_hash_candidates(
    source: &Path,
    allowed_exts: &std::collections::HashSet<String>,
    skip_hidden_files: bool,
) -> Result<Vec<PathBuf>, String> {
    let mut by_size: HashMap<u64, Vec<PathBuf>> = HashMap::new();

    for entry in WalkDir::new(source).follow_links(false).into_iter() {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        if skip_hidden_files && is_hidden_path(path, source) {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e.to_lowercase()))
            .unwrap_or_default();

        if !allowed_exts.contains(&ext) {
            continue;
        }

        let size = match entry.metadata() {
            Ok(metadata) => metadata.len(),
            Err(_) => continue,
        };
        by_size.entry(size).or_default().push(path.to_path_buf());
    }

    Ok(by_size
        .into_values()
        .filter(|paths| paths.len() > 1)
        .flatten()
        .collect())
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
        DEFAULT_EXTENSIONS
            .iter()
            .map(|s| s.to_string())
            .collect::<std::collections::HashSet<_>>()
    } else {
        options
            .allowed_extensions
            .iter()
            .map(|ext| {
                let lower = ext.trim().to_lowercase();
                if lower.starts_with('.') {
                    lower
                } else {
                    format!(".{}", lower)
                }
            })
            .collect::<std::collections::HashSet<_>>()
    };

    let start = Instant::now();
    let mut hash_map: HashMap<String, (DuplicateFile, Vec<DuplicateFile>)> = HashMap::new();
    let mut scanned_count = 0;
    let mut duplicates_count = 0;

    let candidates = collect_hash_candidates(&source, &allowed_exts, options.skip_hidden_files)?;

    for path in candidates {
        scanned_count += 1;

        if scanned_count % 50 == 0 {
            let current_file = path.to_string_lossy().into_owned();
            let _ = app_handle.emit(
                "duplicate:progress",
                DuplicateScanProgress {
                    scanned: scanned_count,
                    duplicates_found: duplicates_count,
                    current_file,
                    elapsed_ms: start.elapsed().as_millis() as u64,
                    phase: "Scanning & Hashing".to_string(),
                },
            );
        }

        let hash = match get_file_hash_sha256(&path) {
            Ok(h) => h,
            Err(_) => continue,
        };

        let dup_file = match duplicate_file_from_path(&path) {
            Ok(file) => file,
            Err(_) => continue,
        };

        if let Some(entry_set) = hash_map.get_mut(&hash) {
            entry_set.1.push(dup_file);
            duplicates_count += 1;
        } else {
            hash_map.insert(hash, (dup_file, Vec::new()));
        }
    }

    // Filter only groups containing duplicate files
    let result: Vec<DuplicateSet> = hash_map
        .into_iter()
        .filter(|(_, (_, dups))| !dups.is_empty())
        .map(|(hash, (original, duplicates))| DuplicateSet {
            hash,
            original,
            duplicates,
        })
        .collect();

    let _ = app_handle.emit(
        "duplicate:complete",
        DuplicateScanProgress {
            scanned: scanned_count,
            duplicates_found: duplicates_count,
            current_file: "".to_string(),
            elapsed_ms: start.elapsed().as_millis() as u64,
            phase: "Done".to_string(),
        },
    );

    Ok(result)
}

fn unique_destination_path(move_dir: &Path, path: &Path) -> Result<PathBuf, String> {
    let filename = path
        .file_name()
        .ok_or_else(|| format!("Invalid filename for path: {}", path.display()))?;

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

    Ok(dest_path)
}

fn move_file_with_fallback(path: &Path, dest_path: &Path) -> Result<(), String> {
    match fs::rename(path, dest_path) {
        Ok(_) => Ok(()),
        Err(rename_err) => match fs::copy(path, dest_path) {
            Ok(_) => {
                fs::remove_file(path).map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(copy_err) => Err(format!("{} (Copy error: {})", rename_err, copy_err)),
        },
    }
}

fn resolve_duplicate_path(
    path: &Path,
    delete_duplicates: bool,
    move_dir: Option<&Path>,
    summary: &mut DuplicateResolveSummary,
) -> Result<(), String> {
    let file_size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    if let Some(move_dir) = move_dir {
        fs::create_dir_all(move_dir).map_err(|e| e.to_string())?;
        let dest_path = unique_destination_path(move_dir, path)?;
        move_file_with_fallback(path, &dest_path)?;
        summary.resolved_count += 1;
        summary.moved_count += 1;
        summary.saved_bytes += file_size;
        return Ok(());
    }

    if delete_duplicates {
        fs::remove_file(path).map_err(|e| e.to_string())?;
        summary.resolved_count += 1;
        summary.deleted_count += 1;
        summary.saved_bytes += file_size;
    }

    Ok(())
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
        return Err(
            "Must specify either delete_duplicates as true or move_duplicates_to path.".into(),
        );
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
            summary
                .errors
                .push(format!("File does not exist: {}", item.path));
            continue;
        }

        let move_dir = options
            .move_duplicates_to
            .as_ref()
            .map(|value| PathBuf::from(value.trim()));

        if let Err(e) = resolve_duplicate_path(
            &path,
            options.delete_duplicates,
            move_dir.as_deref(),
            &mut summary,
        ) {
            summary
                .errors
                .push(format!("Failed to resolve {}: {}", item.path, e));
        }
    }

    summary.elapsed_ms = start.elapsed().as_millis() as u64;
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!(
            "lgp_dups_test_{}_{}",
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
    fn default_extensions_include_gallery_media_types() {
        assert!(DEFAULT_EXTENSIONS.contains(&".gif"));
        assert!(DEFAULT_EXTENSIONS.contains(&".avif"));
        assert!(DEFAULT_EXTENSIONS.contains(&".webm"));
    }

    #[test]
    fn hash_candidates_only_include_size_groups_with_multiple_files() {
        let dir = unique_temp_dir("sizes");
        let unique = dir.join("unique.jpg");
        let dup_a = dir.join("dup_a.jpg");
        let dup_b = dir.join("dup_b.jpg");
        fs::write(&unique, b"unique").unwrap();
        fs::write(&dup_a, b"same").unwrap();
        fs::write(&dup_b, b"same").unwrap();

        let allowed = DEFAULT_EXTENSIONS
            .iter()
            .map(|s| s.to_string())
            .collect::<std::collections::HashSet<_>>();
        let candidates = collect_hash_candidates(&dir, &allowed, true).unwrap();

        assert_eq!(candidates.len(), 2);
        assert!(candidates
            .iter()
            .all(|p| p.file_name().unwrap() != "unique.jpg"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn hash_candidates_skip_hidden_paths_when_enabled() {
        let dir = unique_temp_dir("hidden");
        let hidden_dir = dir.join(".hidden");
        fs::create_dir_all(&hidden_dir).unwrap();
        fs::write(hidden_dir.join("dup_a.jpg"), b"same").unwrap();
        fs::write(hidden_dir.join("dup_b.jpg"), b"same").unwrap();

        let allowed = DEFAULT_EXTENSIONS
            .iter()
            .map(|s| s.to_string())
            .collect::<std::collections::HashSet<_>>();
        let candidates = collect_hash_candidates(&dir, &allowed, true).unwrap();

        assert!(candidates.is_empty());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn delete_resolution_moves_to_destination_when_supplied() {
        let dir = unique_temp_dir("resolve");
        let trash = dir.join("trash");
        let photo = dir.join("photo.jpg");
        fs::write(&photo, b"duplicate").unwrap();

        let mut summary = DuplicateResolveSummary {
            resolved_count: 0,
            deleted_count: 0,
            moved_count: 0,
            saved_bytes: 0,
            errors: Vec::new(),
            elapsed_ms: 0,
        };

        resolve_duplicate_path(&photo, true, Some(&trash), &mut summary).unwrap();

        assert!(!photo.exists());
        assert!(trash.join("photo.jpg").exists());
        assert_eq!(summary.deleted_count, 0);
        assert_eq!(summary.moved_count, 1);

        let _ = fs::remove_dir_all(dir);
    }
}
