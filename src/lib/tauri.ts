import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useProgressStore } from '../store/useStore';
import { queryClient } from '../main';

export interface Image {
  id: number;
  path: string;
  path_hash: number;
  filename: string;
  ext: string;
  size_bytes: number | null;
  date_taken: number | null;
  year: number | null;
  month: number | null;
  width: number | null;
  height: number | null;
  thumb_256: string | null;
  thumb_480: string | null;
  created_at: number | null;
}

export interface PaginatedPhotos {
  items: Image[];
  next_cursor: number | null;
}

export interface PhotoFilters {
  year?: number;
  month?: number;
  search?: string;
}

export interface TimelineGroup {
  year: number;
  month: number;
  count: number;
}

export interface ScanProgress {
  scanned: number;
  found: number;
  indexed: number;
  thumbnails_done: number;
  current_dir: string;
  elapsed_ms: number;
  estimated_remaining_ms: number | null;
  phase: string;
}

export async function startScan(path: string): Promise<void> {
  return invoke('start_scan', { path });
}

export async function getPhotosPage(
  cursor: number | null,
  limit: number,
  filters?: PhotoFilters
): Promise<PaginatedPhotos> {
  return invoke('get_photos_page', { cursor, limit, filters });
}

export async function getTimelineGroups(): Promise<TimelineGroup[]> {
  return invoke('get_timeline_groups');
}

// Setup listeners
export async function setupTauriListeners() {
  const unlistenProgress = await listen<ScanProgress>('scan:progress', (event) => {
    useProgressStore.getState().setScanning(true);
    useProgressStore.getState().updateProgress(event.payload);
    
    // Periodically invalidate photos so they appear during the scan
    if (event.payload.found > 0 && event.payload.found % 50 === 0) {
      queryClient.invalidateQueries({ queryKey: ['photos'] });
      queryClient.invalidateQueries({ queryKey: ['timeline-groups'] });
    }
  });

  const unlistenComplete = await listen<ScanProgress>('scan:complete', (event) => {
    useProgressStore.getState().updateProgress(event.payload);
    
    // Invalidate React Query cache so photos appear immediately
    queryClient.invalidateQueries({ queryKey: ['photos'] });
    queryClient.invalidateQueries({ queryKey: ['timeline-groups'] });
    
    setTimeout(() => {
      useProgressStore.getState().setScanning(false);
    }, 3000); // Keep HUD open for 3 seconds after complete
  });

  return () => {
    unlistenProgress();
    unlistenComplete();
  };
}
