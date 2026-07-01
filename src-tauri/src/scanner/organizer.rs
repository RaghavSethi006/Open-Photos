use crate::metadata::exif::extract_exif;
use chrono::{DateTime, Local, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime};
use tauri::{AppHandle, Emitter};
use tracing::warn;
use walkdir::WalkDir;

const DEFAULT_EXTENSIONS: &[&str] = &[
    ".jpg", ".jpeg", ".png", ".heic", ".webp", ".tiff", ".bmp", ".mp4", ".mov", ".mkv", ".avi",
    ".wmv", ".flv", ".m4v", ".gif", ".avif", ".webm",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeOptions {
    pub source: String,
    pub destination: String,
    pub move_files: bool,
    pub fallback_date: String,
    pub allowed_extensions: Vec<String>,
    pub use_exif: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeSummary {
    pub scanned: u64,
    pub matched: u64,
    pub copied: u64,
    pub moved: u64,
    pub skipped: u64,
    pub renamed_duplicates: u64,
    pub errors: Vec<String>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct OrganizeProgress {
    pub scanned: u64,
    pub found: u64,
    pub indexed: u64,
    pub thumbnails_done: u64,
    pub current_dir: String,
    pub elapsed_ms: u64,
    pub estimated_remaining_ms: Option<u64>,
    pub phase: String,
    pub copied: u64,
    pub moved: u64,
    pub skipped: u64,
    pub renamed_duplicates: u64,
}

pub fn organize_media(
    options: OrganizeOptions,
    app_handle: AppHandle,
) -> Result<OrganizeSummary, String> {
    let source = PathBuf::from(options.source.trim());
    let destination = PathBuf::from(options.destination.trim());

    if !source.is_dir() {
        return Err("Source folder does not exist or is not a folder.".into());
    }

    if source == destination {
        return Err("Source and destination must be different folders.".into());
    }

    fs::create_dir_all(&destination).map_err(|e| e.to_string())?;

    let source_canonical = source.canonicalize().map_err(|e| e.to_string())?;
    let destination_canonical = destination.canonicalize().map_err(|e| e.to_string())?;
    let destination_inside_source = destination_canonical.starts_with(&source_canonical);
    let fallback_date = parse_fallback_date(&options.fallback_date)?;
    let allowed_extensions = normalize_extensions(&options.allowed_extensions);
    let start = Instant::now();

    let mut summary = OrganizeSummary {
        scanned: 0,
        matched: 0,
        copied: 0,
        moved: 0,
        skipped: 0,
        renamed_duplicates: 0,
        errors: Vec::new(),
        elapsed_ms: 0,
    };

    emit_progress(&app_handle, &summary, "", start, "Scanning");

    for entry in WalkDir::new(&source).follow_links(false).into_iter() {
        let entry = match entry {
            Ok(entry) => entry,
            Err(e) => {
                summary.skipped += 1;
                summary.errors.push(e.to_string());
                continue;
            }
        };

        if !entry.file_type().is_file() {
            continue;
        }

        summary.scanned += 1;
        let path = entry.path();

        if destination_inside_source && is_inside_destination(path, &destination_canonical) {
            summary.skipped += 1;
            continue;
        }

        if !is_allowed_media(path, &allowed_extensions) {
            continue;
        }

        summary.matched += 1;

        match organize_one_file(
            path,
            &destination_canonical,
            fallback_date,
            options.use_exif,
            options.move_files,
        ) {
            Ok(renamed_duplicate) => {
                if options.move_files {
                    summary.moved += 1;
                } else {
                    summary.copied += 1;
                }
                if renamed_duplicate {
                    summary.renamed_duplicates += 1;
                }
            }
            Err(e) => {
                summary.skipped += 1;
                summary.errors.push(format!("{}: {}", path.display(), e));
                warn!("Media organizer skipped {}: {}", path.display(), e);
            }
        }

        if summary.scanned % 50 == 0 {
            let current_dir = path
                .parent()
                .unwrap_or_else(|| Path::new(""))
                .to_string_lossy()
                .into_owned();
            emit_progress(&app_handle, &summary, &current_dir, start, "Organizing");
        }
    }

    summary.elapsed_ms = start.elapsed().as_millis() as u64;
    emit_progress(&app_handle, &summary, "", start, "Done");
    let _ = app_handle.emit("scan:complete", progress_from_summary(&summary, "", start, "Done"));

    Ok(summary)
}

fn organize_one_file(
    path: &Path,
    destination: &Path,
    fallback_date: DateTime<Local>,
    use_exif: bool,
    move_file: bool,
) -> Result<bool, String> {
    let chosen_date = best_media_date(path, fallback_date, use_exif);
    let target_folder = destination
        .join(chosen_date.format("%Y").to_string())
        .join(chosen_date.format("%m-%B").to_string())
        .join(chosen_date.format("%d").to_string());

    fs::create_dir_all(&target_folder).map_err(|e| e.to_string())?;

    let filename = path
        .file_name()
        .ok_or_else(|| "Missing filename.".to_string())?;
    let (target_file, renamed_duplicate) = unique_target_path(&target_folder, filename)?;

    if move_file {
        move_or_copy_file(path, &target_file, true)?;
    } else {
        move_or_copy_file(path, &target_file, false)?;
    }

    Ok(renamed_duplicate)
}

fn is_inside_destination(path: &Path, destination_canonical: &Path) -> bool {
    path.canonicalize()
        .map(|canonical| canonical.starts_with(destination_canonical))
        .unwrap_or(false)
}

fn move_or_copy_file(source: &Path, destination: &Path, move_file: bool) -> Result<(), String> {
    if !move_file {
        fs::copy(source, destination).map_err(|e| e.to_string())?;
        return Ok(());
    }

    match fs::rename(source, destination) {
        Ok(_) => Ok(()),
        Err(_) => {
            fs::copy(source, destination).map_err(|e| e.to_string())?;
            fs::remove_file(source).map_err(|e| e.to_string())
        }
    }
}

fn best_media_date(path: &Path, fallback_date: DateTime<Local>, use_exif: bool) -> DateTime<Local> {
    let mut dates = Vec::with_capacity(3);

    if let Ok(metadata) = fs::metadata(path) {
        if let Ok(created) = metadata.created() {
            dates.push(system_time_to_local(created));
        }
        if let Ok(modified) = metadata.modified() {
            dates.push(system_time_to_local(modified));
        }
    }

    if use_exif {
        if let Some(timestamp) = extract_exif(path).date_taken {
            if let Some(utc) = Utc.timestamp_opt(timestamp, 0).single() {
                dates.push(utc.with_timezone(&Local));
            }
        }
    }

    dates.into_iter().min().unwrap_or(fallback_date)
}

fn unique_target_path(folder: &Path, filename: &std::ffi::OsStr) -> Result<(PathBuf, bool), String> {
    let original = folder.join(filename);
    if !original.exists() {
        return Ok((original, false));
    }

    let path = Path::new(filename);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid filename.".to_string())?;
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");

    for counter in 1.. {
        let candidate_name = if extension.is_empty() {
            format!("{stem}_{counter}")
        } else {
            format!("{stem}_{counter}.{extension}")
        };
        let candidate = folder.join(candidate_name);
        if !candidate.exists() {
            return Ok((candidate, true));
        }
    }

    unreachable!()
}

fn is_allowed_media(path: &Path, allowed_extensions: &HashSet<String>) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| allowed_extensions.contains(&format!(".{}", ext.to_lowercase())))
        .unwrap_or(false)
}

fn normalize_extensions(extensions: &[String]) -> HashSet<String> {
    let source = if extensions.is_empty() {
        DEFAULT_EXTENSIONS.iter().map(|ext| ext.to_string()).collect()
    } else {
        extensions.to_vec()
    };

    source
        .into_iter()
        .map(|ext| {
            let lower = ext.trim().to_lowercase();
            if lower.starts_with('.') {
                lower
            } else {
                format!(".{lower}")
            }
        })
        .collect()
}

fn parse_fallback_date(value: &str) -> Result<DateTime<Local>, String> {
    let date = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| "Fallback date must use YYYY-MM-DD.".to_string())?;
    let datetime = date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| "Fallback date is invalid.".to_string())?;
    Local
        .from_local_datetime(&datetime)
        .single()
        .ok_or_else(|| "Fallback date could not be resolved in the local timezone.".to_string())
}

fn system_time_to_local(time: SystemTime) -> DateTime<Local> {
    DateTime::<Utc>::from(time).with_timezone(&Local)
}

fn emit_progress(
    app_handle: &AppHandle,
    summary: &OrganizeSummary,
    current_dir: &str,
    start: Instant,
    phase: &str,
) {
    let _ = app_handle.emit(
        "scan:progress",
        progress_from_summary(summary, current_dir, start, phase),
    );
}

fn progress_from_summary(
    summary: &OrganizeSummary,
    current_dir: &str,
    start: Instant,
    phase: &str,
) -> OrganizeProgress {
    OrganizeProgress {
        scanned: summary.scanned,
        found: summary.matched,
        indexed: summary.copied + summary.moved,
        thumbnails_done: 0,
        current_dir: current_dir.to_string(),
        elapsed_ms: start.elapsed().as_millis() as u64,
        estimated_remaining_ms: None,
        phase: phase.to_string(),
        copied: summary.copied,
        moved: summary.moved,
        skipped: summary.skipped,
        renamed_duplicates: summary.renamed_duplicates,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!(
            "lgp_organizer_test_{}_{}",
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
    fn destination_child_is_detected_after_canonicalization() {
        let root = unique_temp_dir("dest_child");
        let destination = root.join("library");
        let nested = destination.join("2026").join("photo.jpg");
        fs::create_dir_all(nested.parent().unwrap()).unwrap();
        fs::write(&nested, b"photo").unwrap();

        let destination_canonical = destination.canonicalize().unwrap();

        assert!(is_inside_destination(&nested, &destination_canonical));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn move_file_removes_source_and_creates_destination() {
        let root = unique_temp_dir("move_file");
        let source = root.join("source.jpg");
        let destination = root.join("dest.jpg");
        fs::write(&source, b"photo").unwrap();

        move_or_copy_file(&source, &destination, true).unwrap();

        assert!(!source.exists());
        assert_eq!(fs::read(&destination).unwrap(), b"photo");

        let _ = fs::remove_dir_all(root);
    }
}
