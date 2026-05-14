use crossbeam_channel::Sender;
use jwalk::WalkDir;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

pub fn walk_directory_jwalk(start_path: &Path, tx: Sender<PathBuf>) {
    info!("Starting jwalk scanner on {:?}", start_path);
    for entry in WalkDir::new(start_path)
        .parallelism(jwalk::Parallelism::RayonNewPool(num_cpus::get()))
        .skip_hidden(true)
    {
        match entry {
            Ok(dir_entry) => {
                if dir_entry.file_type().is_file() {
                    let _ = tx.send(dir_entry.path());
                }
            }
            Err(e) => {
                warn!("Error reading directory entry: {}", e);
            }
        }
    }
}

#[cfg(all(windows, feature = "mft_walker"))]
pub fn walk_directory_mft(start_path: &Path, tx: Sender<PathBuf>) {
    // Implementation of raw MFT walking would go here.
    // It requires admin privileges to open \\.\C:
    // Falling back to jwalk for now
    warn!("MFT walker requested but not fully implemented, falling back to jwalk.");
    walk_directory_jwalk(start_path, tx);
}

#[cfg(all(target_os = "macos", feature = "getattrlistbulk_walker"))]
pub fn walk_directory_macos(start_path: &Path, tx: Sender<PathBuf>) {
    // Implementation of getattrlistbulk would go here.
    warn!("getattrlistbulk walker requested but not fully implemented, falling back to jwalk.");
    walk_directory_jwalk(start_path, tx);
}

pub fn walk_directory(start_path: &Path, tx: Sender<PathBuf>) {
    #[cfg(all(windows, feature = "mft_walker"))]
    {
        walk_directory_mft(start_path, tx);
        return;
    }

    #[cfg(all(target_os = "macos", feature = "getattrlistbulk_walker"))]
    {
        walk_directory_macos(start_path, tx);
        return;
    }

    // Default cross-platform baseline
    walk_directory_jwalk(start_path, tx);
}
