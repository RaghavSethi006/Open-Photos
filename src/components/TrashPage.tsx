import { useState, useEffect, useCallback } from 'react';
import {
  Trash2,
  RotateCcw,
  AlertCircle,
  Check,
  CheckCircle,
  File,
  Trash as TrashIcon,
} from 'lucide-react';
import {
  listTrashFolder,
  restoreFilesFromTrash,
  cleanupTrashFolder,
  TrashEntry,
} from '../lib/tauri';
import { useSettingsStore } from '../store/useSettingsStore';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function TrashPage() {
  const { trashFolder, trashRetentionDays } = useSettingsStore();

  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const loadTrash = useCallback(async () => {
    if (!trashFolder.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listTrashFolder(trashFolder);
      setEntries(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [trashFolder]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const toggleSelect = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedPaths.size === entries.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(entries.map((e) => e.path)));
    }
  };

  const handleRestore = async () => {
    if (selectedPaths.size === 0 || !trashFolder.trim()) return;
    setRestoring(true);
    setError(null);
    setMessage(null);
    try {
      const restored = await restoreFilesFromTrash(
        Array.from(selectedPaths),
        trashFolder,
      );
      setMessage(`Restored ${restored.length} file(s) from trash.`);
      setSelectedPaths(new Set());
      loadTrash();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRestoring(false);
    }
  };

  const handleCleanup = async () => {
    if (!trashFolder.trim()) return;
    if (!confirm('Permanently delete all files in the trash?')) return;
    setCleaning(true);
    setError(null);
    setMessage(null);
    try {
      const result = await cleanupTrashFolder(trashFolder, 0);
      setMessage(
        `Permanently deleted ${result.deletedCount} file(s) (${formatBytes(result.savedBytes)}).`,
      );
      setSelectedPaths(new Set());
      loadTrash();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCleaning(false);
    }
  };

  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);

  if (!trashFolder.trim()) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="glass-panel rounded-2xl p-8 max-w-md text-center">
          <div className="rounded-2xl bg-[var(--color-primary)]/12 p-3 text-[var(--color-primary)] inline-flex mb-4">
            <Trash2 size={24} />
          </div>
          <h2 className="text-xl font-semibold text-white">Trash folder not set</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Go to Settings and configure a Trash folder to use this feature.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 pb-10 pt-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {/* Header */}
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal text-white">Trash</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                Files moved here from duplicate cleanup are kept for {trashRetentionDays} days before being
                automatically deleted. You can restore them before then.
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--color-primary)]/12 p-3 text-[var(--color-primary)]">
              <Trash2 size={24} />
            </div>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] hover:border-white/20 hover:text-white transition-all"
            >
              {selectedPaths.size === entries.length && entries.length > 0
                ? 'Deselect All'
                : 'Select All'}
            </button>
            {selectedPaths.size > 0 && (
              <button
                disabled={restoring}
                onClick={handleRestore}
                className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-primary)]/90 disabled:opacity-50"
              >
                <RotateCcw size={14} />
                Restore ({selectedPaths.size})
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-muted)]">
              {entries.length} item(s), {formatBytes(totalSize)}
            </span>
            {entries.length > 0 && (
              <button
                disabled={cleaning}
                onClick={handleCleanup}
                className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-400/20 transition-all disabled:opacity-50"
              >
                <TrashIcon size={14} />
                Empty Trash
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-3">
            <CheckCircle size={18} className="shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200 flex items-center gap-3">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-3">
            <div className="h-8 w-8 rounded-full border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] animate-spin" />
            <p className="text-sm text-[var(--color-text-muted)]">Loading trash...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && entries.length === 0 && (
          <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="h-14 w-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--color-text-muted)]">
              <Trash2 size={28} />
            </div>
            <h3 className="text-lg font-semibold text-white">Trash is empty</h3>
            <p className="text-sm text-[var(--color-text-muted)] max-w-sm">
              Files moved here from the Duplicate Cleaner will appear in this view.
            </p>
          </div>
        )}

        {/* File list */}
        {!loading && entries.length > 0 && (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => {
              const isSelected = selectedPaths.has(entry.path);
              return (
                <div
                  key={entry.path}
                  onClick={() => toggleSelect(entry.path)}
                  className={`glass-panel rounded-xl p-4 flex items-center gap-4 cursor-pointer transition-all border ${
                    isSelected
                      ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/5'
                      : 'border-white/5 hover:border-white/20'
                  }`}
                >
                  <div
                    className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                        : 'border-white/20 bg-black/30'
                    }`}
                  >
                    {isSelected && <Check size={12} strokeWidth={3} className="text-white" />}
                  </div>

                  <div className="rounded-lg bg-black/30 border border-white/5 p-2 shrink-0">
                    <File size={18} className="text-[var(--color-text-muted)]" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate" title={entry.name}>
                      {entry.name}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono truncate mt-0.5">
                      {entry.path}
                    </div>
                  </div>

                  <div className="text-xs text-[var(--color-text-muted)] shrink-0 text-right">
                    <div>{formatBytes(entry.size)}</div>
                    <div className="text-[10px]">
                      {new Date(entry.movedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
