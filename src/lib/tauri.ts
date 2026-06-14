import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useProgressStore } from '../store/useStore';

export interface ScanProgress {
  scanned: number;
  found: number;
  indexed: number;
  thumbnails_done: number;
  current_dir: string;
  elapsed_ms: number;
  estimated_remaining_ms: number | null;
  phase: string;
  copied?: number;
  moved?: number;
  skipped?: number;
  renamed_duplicates?: number;
}

export interface OrganizeOptions {
  source: string;
  destination: string;
  moveFiles: boolean;
  fallbackDate: string;
  allowedExtensions: string[];
  useExif: boolean;
}

export interface OrganizeSummary {
  scanned: number;
  matched: number;
  copied: number;
  moved: number;
  skipped: number;
  renamedDuplicates: number;
  errors: string[];
  elapsedMs: number;
}

export async function runMediaOrganizer(options: OrganizeOptions): Promise<OrganizeSummary> {
  return invoke('run_media_organizer', { options });
}

export async function setupTauriListeners() {
  if (!isTauriRuntime()) {
    return () => {};
  }

  const unlistenProgress = await listen<ScanProgress>('scan:progress', (event) => {
    useProgressStore.getState().setScanning(true);
    useProgressStore.getState().updateProgress(normalizeProgress(event.payload));
  });

  const unlistenComplete = await listen<ScanProgress>('scan:complete', (event) => {
    useProgressStore.getState().updateProgress(normalizeProgress(event.payload));

    setTimeout(() => {
      useProgressStore.getState().setScanning(false);
    }, 3000); // Keep HUD open for 3 seconds after complete
  });

  return () => {
    unlistenProgress();
    unlistenComplete();
  };
}

function normalizeProgress(progress: ScanProgress) {
  return {
    ...progress,
    copied: progress.copied ?? 0,
    moved: progress.moved ?? 0,
    skipped: progress.skipped ?? 0,
    renamedDuplicates: progress.renamed_duplicates ?? 0,
  };
}

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface DuplicateScanOptions {
  source: string;
  allowedExtensions: string[];
}

export interface DuplicateFile {
  path: string;
  name: string;
  size: number;
  modified: number;
}

export interface DuplicateSet {
  hash: string;
  original: DuplicateFile;
  duplicates: DuplicateFile[];
}

export interface DuplicateScanProgress {
  scanned: number;
  duplicatesFound: number;
  currentFile: string;
  elapsedMs: number;
  phase: string;
}

export interface DuplicateResolveItem {
  path: string;
  hash: string;
  isOriginal: boolean;
}

export interface DuplicateResolveOptions {
  items: DuplicateResolveItem[];
  deleteDuplicates: boolean;
  moveDuplicatesTo?: string;
}

export interface DuplicateResolveSummary {
  resolvedCount: number;
  deletedCount: number;
  movedCount: number;
  savedBytes: number;
  errors: string[];
  elapsedMs: number;
}

export async function scanDuplicates(options: DuplicateScanOptions): Promise<DuplicateSet[]> {
  return invoke('scan_duplicates', { options });
}

export async function resolveDuplicates(options: DuplicateResolveOptions): Promise<DuplicateResolveSummary> {
  return invoke('resolve_duplicates', { options });
}

// ─── Trash ───────────────────────────────────────────────────────────────────

export interface TrashEntry {
  path: string;
  name: string;
  originalPath: string;
  movedAt: number;
  size: number;
}

export interface TrashCleanupSummary {
  deletedCount: number;
  savedBytes: number;
  errors: string[];
}

export async function moveFilesToTrash(paths: string[], trashFolder: string): Promise<TrashEntry[]> {
  return invoke('move_files_to_trash', { paths, trashFolder });
}

export async function cleanupTrashFolder(trashFolder: string, retentionDays: number): Promise<TrashCleanupSummary> {
  return invoke('cleanup_trash_folder', { trashFolder, retentionDays });
}

export async function listTrashFolder(trashFolder: string): Promise<TrashEntry[]> {
  return invoke('list_trash_folder', { trashFolder });
}

export async function restoreFilesFromTrash(paths: string[], trashFolder: string): Promise<string[]> {
  return invoke('restore_files_from_trash', { paths, trashFolder });
}

// ─── Albums ──────────────────────────────────────────────────────────────────

export interface Album {
  id: string;
  name: string;
  description: string;
  coverPath: string;
  createdAt: number;
  photoPaths: string[];
}

export async function createAlbum(name: string, description: string, photoPaths: string[]): Promise<Album> {
  return invoke('create_album', { name, description, photoPaths });
}

export async function listAlbums(): Promise<Album[]> {
  return invoke('list_albums');
}

export async function getAlbum(id: string): Promise<Album | null> {
  return invoke('get_album', { id });
}

export async function deleteAlbum(id: string): Promise<void> {
  return invoke('delete_album', { id });
}

export async function renameAlbum(id: string, name: string): Promise<Album> {
  return invoke('rename_album', { id, name });
}

export async function addPhotosToAlbum(id: string, photoPaths: string[]): Promise<Album> {
  return invoke('add_photos_to_album', { id, photoPaths });
}

export async function removePhotosFromAlbum(id: string, photoPaths: string[]): Promise<Album> {
  return invoke('remove_photos_from_album', { id, photoPaths });
}

// Update PhotoEntry to include is_folder
export interface PhotoEntry {
  path: string;
  name: string;
  sizeBytes: number;
  modifiedMs: number;
  isVideo: boolean;
  isFolder?: boolean;
}

export async function listPhotos(folder: string): Promise<PhotoEntry[]> {
  return invoke('list_photos', { folder });
}
