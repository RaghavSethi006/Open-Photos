import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useProgressStore, useFaceScanStore } from '../store/useStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useToastStore } from '../store/useToastStore';

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
  skipHiddenFiles?: boolean;
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
  return invoke('run_media_organizer', {
    options: {
      ...options,
      skipHiddenFiles: options.skipHiddenFiles ?? useSettingsStore.getState().skipHiddenFiles,
    },
  });
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
    }, 3000);
  });

  const unlistenFaceProgress = await listen<FaceProgress>('face:progress', (event) => {
    useFaceScanStore.getState().setScanning(true);
    useFaceScanStore.getState().updateProgress(event.payload);
  });

  const unlistenFaceComplete = await listen<FaceScanResult>('face:complete', (event) => {
    useFaceScanStore.getState().updateProgress({
      scanned: event.payload.scanned,
      total: event.payload.scanned,
      photosWithFaces: event.payload.photosWithFaces,
      facesFound: event.payload.facesFound,
      currentFile: '',
    });

    setTimeout(() => {
      useFaceScanStore.getState().setScanning(false);
    }, 3000);
  });

  const unlistenModelDownloadStart = await listen('face:model-download-start', () => {
    useFaceScanStore.getState().setScanning(true);
    useToastStore.getState().addToast({
      message: 'Downloading face AI models...',
      type: 'info',
    });
  });

  const unlistenModelDownloadComplete = await listen('face:model-download-complete', () => {
    useToastStore.getState().addToast({
      message: 'Face AI models ready',
      type: 'success',
    });
  });

  return () => {
    unlistenProgress();
    unlistenComplete();
    unlistenFaceProgress();
    unlistenFaceComplete();
    unlistenModelDownloadStart();
    unlistenModelDownloadComplete();
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
  skipHiddenFiles?: boolean;
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
  return invoke('scan_duplicates', {
    options: {
      ...options,
      skipHiddenFiles: options.skipHiddenFiles ?? useSettingsStore.getState().skipHiddenFiles,
    },
  });
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

export async function listPhotos(folder: string, skipHiddenFiles = useSettingsStore.getState().skipHiddenFiles): Promise<PhotoEntry[]> {
  return invoke('list_photos', { folder, skipHiddenFiles });
}

// ─── Database Index ──────────────────────────────────────────────────────────

export interface IndexedPhoto {
  path: string;
  name: string;
  sizeBytes: number;
  modifiedMs: number;
  dateTakenMs: number | null;
  width: number | null;
  height: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  isVideo: boolean;
}

export interface SearchFilters {
  cameraMake?: string;
  cameraModel?: string;
  dateFrom?: number;
  dateTo?: number;
  hasGps?: boolean;
  isVideo?: boolean;
  query?: string;
}

/// Walk a folder and index all photos/videos into the SQLite database.
export async function indexFolder(folder: string): Promise<number> {
  return invoke('index_folder', { folder });
}

/// Browse photos from an indexed folder.
export async function browseFolder(folder: string): Promise<IndexedPhoto[]> {
  return invoke('browse_folder', { folder });
}

/// Search indexed photos with optional filters.
export async function searchPhotos(filters: SearchFilters): Promise<IndexedPhoto[]> {
  return invoke('search_photos', {
    query: filters.query ?? null,
    cameraMake: filters.cameraMake ?? null,
    cameraModel: filters.cameraModel ?? null,
    dateFrom: filters.dateFrom ?? null,
    dateTo: filters.dateTo ?? null,
    hasGps: filters.hasGps ?? null,
    isVideo: filters.isVideo ?? null,
  });
}

// ─── Photo Metadata ──────────────────────────────────────────────────────────

export interface PhotoMetadata {
  dateTaken: number | null;
  width: number | null;
  height: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  aperture: string | null;
  shutterSpeed: string | null;
  iso: number | null;
  focalLength: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsLatRef: string | null;
  gpsLngRef: string | null;
  orientation: number | null;
}

export async function getPhotoMetadata(path: string): Promise<PhotoMetadata> {
  return invoke('get_photo_metadata', { path });
}

// ─── Favorites ───────────────────────────────────────────────────────────────

export async function addFavorite(path: string): Promise<void> {
  return invoke('add_favorite', { path });
}

export async function removeFavorite(path: string): Promise<void> {
  return invoke('remove_favorite', { path });
}

export async function listFavorites(): Promise<string[]> {
  return invoke('list_favorites');
}

// ─── Thumbnails ────────────────────────────────────────────────────────────────

/// Returns the filesystem path to a cached thumbnail for the given photo.
/// Pass the result to `convertFileSrc()` for use in an `<img>` tag.
/// Thumbnails are generated on first access and cached indefinitely.
const thumbnailUrlCache = new Map<string, string>();
const pendingThumbnails = new Map<string, Promise<string>>();

export async function getThumbnailPath(path: string, maxDimension?: number): Promise<string> {
  const key = `${path}@${maxDimension ?? 320}`;
  const cached = thumbnailUrlCache.get(key);
  if (cached) return cached;
  const existing = pendingThumbnails.get(key);
  if (existing) return existing;
  const promise = invoke<string>('get_thumbnail_path', { path, maxDimension }).then((result) => {
    thumbnailUrlCache.set(key, result);
    pendingThumbnails.delete(key);
    return result;
  }).catch((err) => {
    pendingThumbnails.delete(key);
    throw err;
  });
  pendingThumbnails.set(key, promise);
  return promise;
}

/// Batch-generate thumbnails for many photos at once (avoids N concurrent IPC calls).
/// Returns the thumbnail paths in the same order as input paths.
export async function ensureThumbnails(paths: string[], maxDimension?: number): Promise<string[]> {
  const uncached: string[] = [];
  const resultMap = new Map<string, string>();
  for (const path of paths) {
    const key = `${path}@${maxDimension ?? 320}`;
    const cached = thumbnailUrlCache.get(key);
    if (cached) {
      resultMap.set(path, cached);
    } else {
      uncached.push(path);
    }
  }
  if (uncached.length > 0) {
    const results: string[] = await invoke('ensure_thumbnails', { paths: uncached, maxDimension });
    for (let i = 0; i < uncached.length; i++) {
      const key = `${uncached[i]}@${maxDimension ?? 320}`;
      thumbnailUrlCache.set(key, results[i]);
      resultMap.set(uncached[i], results[i]);
    }
  }
  return paths.map((p) => resultMap.get(p)!);
}

export function clearThumbnailCache() {
  thumbnailUrlCache.clear();
  pendingThumbnails.clear();
}

// ─── File Operations ────────────────────────────────────────────────────────────

export async function moveFile(source: string, destDir: string): Promise<string> {
  return invoke('move_file', { source, destDir });
}

// ─── Face AI ──────────────────────────────────────────────────────────────────

export interface FaceProgress {
  scanned: number;
  total: number;
  photosWithFaces: number;
  facesFound: number;
  currentFile: string;
}

export interface FaceScanResult {
  scanned: number;
  photosWithFaces: number;
  facesFound: number;
}

export interface PersonInfo {
  id: string;
  name: string;
  faceCount: number;
  thumbnailPath: string;
  thumbnailDataUrl?: string | null;
  hidden?: boolean;
}

export interface PhotoFaceInfo {
  id: string;
  bbox: [number, number, number, number];
  confidence: number;
  personId: string | null;
  personName: string;
}

export async function checkFaceModels(modelSize?: string): Promise<boolean> {
  return invoke('check_face_models', { modelSize: modelSize ?? 'small' });
}

export async function scanFaces(paths: string[], useLargeModel: boolean, threshold?: number): Promise<string[]> {
  return invoke('scan_faces', { paths, useLargeModel, threshold });
}

export async function clusterFaces(threshold: number): Promise<any[]> {
  return invoke('cluster_faces', { threshold });
}

export async function listPeople(showHidden?: boolean): Promise<PersonInfo[]> {
  return invoke('list_people', { showHidden: showHidden ?? false });
}

export async function namePerson(faceIds: string[], name: string, personId?: string): Promise<PersonInfo> {
  return invoke('name_person', { faceIds, name, personId });
}

export async function renamePerson(personId: string, name: string): Promise<void> {
  return invoke('rename_person', { personId, name });
}

export async function mergePeople(personIds: string[], targetName: string): Promise<PersonInfo[]> {
  return invoke('merge_people', { personIds, targetName });
}

export async function deletePerson(personId: string): Promise<void> {
  return invoke('delete_person', { personId });
}

export async function hidePerson(personId: string): Promise<void> {
  return invoke('hide_person', { personId });
}

export async function unhidePerson(personId: string): Promise<void> {
  return invoke('unhide_person', { personId });
}

export async function rejectFaces(faceIds: string[]): Promise<void> {
  return invoke('reject_faces', { faceIds });
}

export async function reclusterFaces(): Promise<void> {
  return invoke('recluster_faces');
}

export async function getPersonPhotos(personId: string): Promise<string[]> {
  return invoke('get_person_photos', { personId });
}

export async function getPhotoFaces(photoPath: string): Promise<PhotoFaceInfo[]> {
  return invoke('get_photo_faces', { photoPath });
}
