use anyhow::{anyhow, Context, Result};
use mft::attribute::header::ResidentialHeader;
use mft::attribute::MftAttributeContent;
use mft::MftParser;
use rayon::prelude::*;
use std::collections::HashMap;
use std::ffi::CString;
use std::fs::File;
use std::io::BufReader;
use std::os::windows::io::FromRawHandle;
use std::path::Path;
use winapi::um::fileapi::{CreateFileA, OPEN_EXISTING};
use winapi::um::handleapi::INVALID_HANDLE_VALUE;
use winapi::um::winnt::{FILE_SHARE_READ, FILE_SHARE_WRITE, GENERIC_READ};

const PHOTO_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "heic", "raw", "cr2", "nef", "orf", "sr2", "tif", "tiff", "webp", "bmp",
    "gif",
];

// Helper to open volume
fn open_volume(path: &str) -> Result<File> {
    let path_c = CString::new(path)?;
    let handle = unsafe {
        CreateFileA(
            path_c.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null_mut(),
            OPEN_EXISTING,
            0,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        Err(anyhow!("Cannot open volume {}", path))
    } else {
        Ok(unsafe { File::from_raw_handle(handle as std::os::windows::io::RawHandle) })
    }
}

pub fn scan_ntfs_volume(volume_letter: &str) -> Result<Vec<(String, u64)>> {
    let volume_path = format!(
        r"\\.\{}:",
        volume_letter.trim_end_matches(|c| c == ':' || c == '\\')
    );

    // We open the volume handle
    let file = open_volume(&volume_path).context("Ensure you are running as Administrator")?;
    let reader = BufReader::new(file);

    // Initialize MFT Parser
    let mut parser =
        MftParser::from_read_seek(reader, None).context("Failed to initialize MFT parser")?;

    let mut dirs: HashMap<u64, (u64, String)> = HashMap::new();
    let mut photos: Vec<(u64, String, u64, u64)> = Vec::new();

    // Iterate all entries
    for entry_result in parser.iter_entries() {
        if let Ok(entry) = entry_result {
            if entry.header.record_number == 0 {
                continue;
            }
            if !entry
                .header
                .flags
                .contains(mft::entry::EntryFlags::ALLOCATED)
            {
                continue;
            }

            let frn = entry.header.record_number;
            let is_dir = entry.is_dir();

            let mut name = String::new();
            let mut parent_ref = 0u64;
            let mut has_name = false;
            let mut size = 0u64;

            for attr in entry.iter_attributes() {
                match attr {
                    Ok(a) => {
                        match a.data {
                            MftAttributeContent::AttrX30(fn_attr) => {
                                name = fn_attr.name;
                                parent_ref = fn_attr.parent.entry;
                                has_name = true;
                            }
                            MftAttributeContent::AttrX80(_) => {
                                // Check header for size
                                if a.header.name.is_empty() {
                                    size = match a.header.residential_header {
                                        ResidentialHeader::Resident(ref r) => r.data_size as u64,
                                        ResidentialHeader::NonResident(ref n) => n.file_size,
                                    };
                                }
                            }
                            _ => {}
                        }
                    }
                    _ => {}
                }
            }

            if !has_name {
                continue;
            }

            if is_dir {
                dirs.insert(frn, (parent_ref, name));
            } else {
                let ext = Path::new(&name)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if PHOTO_EXTENSIONS.contains(&ext.as_str()) {
                    photos.push((frn, name, parent_ref, size));
                }
            }
        }
    }

    // Reconstruct paths
    let result: Vec<(String, u64)> = photos
        .par_iter()
        .map(|(_frn, name, parent, size)| {
            let mut full_path = name.clone();
            let mut curr = *parent;
            let mut depth = 0;

            while let Some((p_ref, p_name)) = dirs.get(&curr) {
                if *p_ref == curr || curr == 5 {
                    break;
                }
                if curr == *p_ref {
                    break;
                }

                full_path = format!("{}\\{}", p_name, full_path);
                curr = *p_ref;
                depth += 1;
                if depth > 256 {
                    break;
                }
            }

            // Final Path
            let final_path = format!(
                r"{}:\{}",
                volume_letter.trim_end_matches(|c| c == ':' || c == '\\'),
                full_path
            );
            (final_path, *size)
        })
        .collect();

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn test_scan_c_drive() {
        match scan_ntfs_volume("C") {
            Ok(results) => {
                println!("Found {} photos on C:", results.len());
                for (path, size) in results.iter().take(5) {
                    println!("{} ({} bytes)", path, size);
                }
                assert!(!results.is_empty());
            }
            Err(e) => {
                println!("Scan failed (expected if not Admin): {}", e);
            }
        }
    }
}
