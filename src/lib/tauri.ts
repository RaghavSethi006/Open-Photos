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
