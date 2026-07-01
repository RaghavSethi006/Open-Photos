import { useState, useEffect, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  FolderInput,
  ScanLine,
  Trash2,
  CheckCircle,
  Layers,
  RotateCcw,
  Check,
  AlertCircle,
  Play,
  Film,
  Bookmark,
} from 'lucide-react';
import {
  scanDuplicates,
  moveFilesToTrash,
  DuplicateSet,
  DuplicateScanProgress,
} from '../lib/tauri';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSavedPathsStore } from '../store/useSavedPathsStore';

const DEFAULT_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp',
  '.gif', '.avif', '.mp4', '.mov', '.mkv', '.avi', '.wmv', '.flv', '.m4v', '.webm',
];

export function DuplicatesPage() {
  const { trashFolder } = useSettingsStore();
  const { paths: savedPaths } = useSavedPathsStore();

  const [source, setSource] = useState('');
  const [showPathDropdown, setShowPathDropdown] = useState(false);
  const [allowedExtensions, setAllowedExtensions] = useState<string[]>(DEFAULT_EXTENSIONS);

  const [scanning, setScanning] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [scanProgress, setScanProgress] = useState<DuplicateScanProgress | null>(null);
  const [duplicateSets, setDuplicateSets] = useState<DuplicateSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolveResult, setResolveResult] = useState<{
    resolvedCount: number;
    savedBytes: number;
    errors: string[];
    elapsedMs: number;
  } | null>(null);

  const [keepFiles, setKeepFiles] = useState<Record<string, string>>({});
  const [excludedPaths, setExcludedPaths] = useState<Record<string, boolean>>({});

  // Close dropdown on outside click
  useEffect(() => {
    if (!showPathDropdown) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.dups-path-dropdown')) {
        setShowPathDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPathDropdown]);

  // Listen to scan progress events
  useEffect(() => {
    let unlistenProg: (() => void) | undefined;
    let unlistenComp: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        unlistenProg = await listen<DuplicateScanProgress>('duplicate:progress', (event) => {
          setScanProgress(event.payload);
        });
        unlistenComp = await listen<DuplicateScanProgress>('duplicate:complete', (event) => {
          setScanProgress(event.payload);
        });
      } catch (err) {
        console.error('Error setting up Tauri listeners:', err);
      }
    };

    setupListeners();

    return () => {
      if (unlistenProg) unlistenProg();
      if (unlistenComp) unlistenComp();
    };
  }, []);

  // Initialize keepFiles mapping when duplicateSets are loaded
  useEffect(() => {
    if (duplicateSets) {
      const initialKeeps: Record<string, string> = {};
      duplicateSets.forEach((set) => {
        initialKeeps[set.hash] = set.original.path;
      });
      setKeepFiles(initialKeeps);
      setExcludedPaths({});
    }
  }, [duplicateSets]);

  const browse = async (setter: (value: string) => void) => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setter(selected);
        setShowPathDropdown(false);
      }
    } catch (err) {
      console.error('Tauri open dialog error:', err);
    }
  };

  const toggleExtension = (ext: string) => {
    setAllowedExtensions((prev) =>
      prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext],
    );
  };

  const handleScan = async () => {
    if (!source.trim()) {
      setError('Please select a source folder.');
      return;
    }
    if (!trashFolder.trim()) {
      setError('Please set a Trash folder in Settings before scanning.');
      return;
    }
    setError(null);
    setDuplicateSets(null);
    setResolveResult(null);
    setScanning(true);
    setScanProgress({
      scanned: 0,
      duplicatesFound: 0,
      currentFile: '',
      elapsedMs: 0,
      phase: 'Scanning',
    });

    try {
      const results = await scanDuplicates({ source, allowedExtensions });
      setDuplicateSets(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  };

  const handleResolve = async () => {
    if (!duplicateSets || duplicateSets.length === 0) return;

    setError(null);
    setResolving(true);

    // Collect paths of all files NOT marked as keep (and not excluded)
    const pathsToTrash: string[] = [];

    duplicateSets.forEach((set) => {
      const keepPath = keepFiles[set.hash];

      if (set.original.path !== keepPath && !excludedPaths[set.original.path]) {
        pathsToTrash.push(set.original.path);
      }

      set.duplicates.forEach((dup) => {
        if (dup.path !== keepPath && !excludedPaths[dup.path]) {
          pathsToTrash.push(dup.path);
        }
      });
    });

    if (pathsToTrash.length === 0) {
      setError('No files selected to move to trash.');
      setResolving(false);
      return;
    }

    try {
      const start = Date.now();
      const trashResult = await moveFilesToTrash(pathsToTrash, trashFolder);
      const elapsedMs = Date.now() - start;

      const savedBytes = trashResult.reduce((sum, e) => sum + e.size, 0);

      setResolveResult({
        resolvedCount: trashResult.length,
        savedBytes,
        errors: [],
        elapsedMs,
      });
      setDuplicateSets(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResolving(false);
    }
  };

  const handleReset = () => {
    setDuplicateSets(null);
    setResolveResult(null);
    setError(null);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const metrics = useMemo(() => {
    if (!duplicateSets) return { totalGroups: 0, totalFiles: 0, selectedCount: 0, reclaimableBytes: 0 };

    let totalGroups = duplicateSets.length;
    let totalFiles = 0;
    let selectedCount = 0;
    let reclaimableBytes = 0;

    duplicateSets.forEach((set) => {
      totalFiles += 1 + set.duplicates.length;

      const keepPath = keepFiles[set.hash];

      if (set.original.path !== keepPath && !excludedPaths[set.original.path]) {
        selectedCount++;
        reclaimableBytes += set.original.size;
      }

      set.duplicates.forEach((dup) => {
        if (dup.path !== keepPath && !excludedPaths[dup.path]) {
          selectedCount++;
          reclaimableBytes += dup.size;
        }
      });
    });

    return { totalGroups, totalFiles, selectedCount, reclaimableBytes };
  }, [duplicateSets, keepFiles, excludedPaths]);

  const canRun = source.trim().length > 0 && allowedExtensions.length > 0 && !scanning && !resolving && trashFolder.trim().length > 0;

  return (
    <div className="h-full overflow-y-auto px-8 pb-10 pt-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">

        {/* Banner/Title */}
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal text-white">Delete Duplicates</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                Scan your photo library for duplicate files using SHA-256 binary matching, then move the duplicates to the Trash folder.
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--color-primary)]/12 p-3 text-[var(--color-primary)]">
              <Layers size={24} />
            </div>
          </div>
        </div>

        {/* Configurations */}
        {!duplicateSets && !resolveResult && (
          <section className="grid grid-cols-[minmax(0,1fr)_320px] gap-6 max-xl:grid-cols-1">
            <div className="glass-panel rounded-2xl p-6 flex flex-col gap-6">
              <h3 className="text-lg font-semibold text-white">Folders</h3>

              <div className="dups-path-dropdown relative">
                <label className="block text-xs font-medium text-[var(--color-text-muted)]">
                  Scan source folder
                  <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <FolderInput size={17} className="shrink-0 text-[var(--color-text-muted)]" />
                    <input
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-white shadow-none outline-none"
                      placeholder="Select a folder to scan"
                    />
                    {savedPaths.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowPathDropdown(!showPathDropdown)}
                        className="rounded-lg bg-white/8 px-2 py-1.5 text-[var(--color-text-muted)] hover:text-white hover:bg-white/12"
                        title="Saved paths"
                      >
                        <Bookmark size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => browse(setSource)}
                      className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/12"
                    >
                      Browse
                    </button>
                  </div>
                </label>
                {showPathDropdown && savedPaths.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-full glass-panel rounded-xl p-1.5 z-50 shadow-2xl border-white/10 max-h-48 overflow-y-auto">
                    {savedPaths.map((sp) => (
                      <button
                        key={sp.id}
                        onClick={() => {
                          setSource(sp.path);
                          setShowPathDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                      >
                        <Bookmark size={13} className="shrink-0 text-[var(--color-text-muted)]" />
                        <div className="min-w-0">
                          <div className="truncate">{sp.name}</div>
                          <div className="truncate text-[10px] text-[var(--color-text-muted)] font-mono">{sp.path}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center gap-3">
                  <Trash2 size={16} className="text-[var(--color-text-muted)]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white">Trash folder</div>
                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono truncate mt-0.5">
                      {trashFolder || <span className="text-red-400/70">Not set — configure in Settings</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Extension chips */}
              <div className="pt-2">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">Supported file extensions</h4>
                  <button
                    onClick={() => setAllowedExtensions(DEFAULT_EXTENSIONS)}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:border-white/20 hover:text-white transition-all"
                  >
                    <RotateCcw size={12} />
                    Reset
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-2 max-lg:grid-cols-4 max-sm:grid-cols-2">
                  {DEFAULT_EXTENSIONS.map((ext) => {
                    const active = allowedExtensions.includes(ext);
                    return (
                      <button
                        key={ext}
                        onClick={() => toggleExtension(ext)}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold shadow-none transition-all ${
                          active
                            ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/15 text-white'
                            : 'border-white/10 bg-white/[0.03] text-[var(--color-text-muted)] hover:text-white'
                        }`}
                      >
                        {ext}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Run card */}
            <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="mb-5 flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <h3 className="text-sm font-semibold text-white">Safe by Design</h3>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  Duplicate files are moved to the Trash folder — nothing is permanently deleted.
                  You can review and restore them from the Trash view later, and expired files are
                  auto-cleaned based on your retention settings.
                </p>
              </div>

              <button
                disabled={!canRun}
                onClick={handleScan}
                className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[var(--color-primary)]/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ScanLine size={18} />
                Scan for Duplicates
              </button>
            </div>
          </section>
        )}

        {/* Scanning progress */}
        {scanning && scanProgress && (
          <div className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4 py-16">
            <div className="h-12 w-12 rounded-full border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] animate-spin mb-2" />
            <h3 className="text-xl font-semibold text-white">Scanning Media Folder...</h3>
            <p className="text-sm text-[var(--color-text-muted)] max-w-md">
              Currently hashing files to identify matching binary duplicates.
            </p>

            <div className="w-full max-w-lg bg-black/40 h-2 rounded-full overflow-hidden mt-2 relative">
              <div className="h-full bg-[var(--color-primary)] animate-pulse" style={{ width: '85%' }} />
            </div>

            <div className="flex flex-col gap-2 mt-4 text-xs text-[var(--color-text-muted)] font-mono">
              <div>Phase: {scanProgress.phase}</div>
              <div>Files Scanned: {scanProgress.scanned.toLocaleString()}</div>
              <div>Duplicates Found: {scanProgress.duplicatesFound.toLocaleString()}</div>
              {scanProgress.currentFile && (
                <div className="max-w-xl truncate text-[10px] text-white/50 bg-black/20 px-2 py-1 rounded">
                  {scanProgress.currentFile}
                </div>
              )}
              <div>Elapsed Time: {(scanProgress.elapsedMs / 1000).toFixed(1)}s</div>
            </div>
          </div>
        )}

        {/* Error alert (hidden when duplicate review is visible; shown contextually near footer) */}
        {error && !duplicateSets && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200 flex items-center gap-3">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Resolve Result */}
        {resolveResult && (
          <div className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4 py-12">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-2">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-xl font-semibold text-white">Clean Up Complete</h3>
            <p className="text-sm text-[var(--color-text-muted)] max-w-md">
              Duplicate files have been moved to the Trash folder.
            </p>

            <div className="grid grid-cols-2 gap-6 max-w-md w-full mt-4">
              <div className="bg-black/30 border border-white/5 p-4 rounded-xl">
                <div className="text-xs text-[var(--color-text-muted)]">Files Moved to Trash</div>
                <div className="text-2xl font-bold text-white mt-1">{resolveResult.resolvedCount}</div>
              </div>
              <div className="bg-black/30 border border-white/5 p-4 rounded-xl">
                <div className="text-xs text-[var(--color-text-muted)]">Space Reclaimed</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">{formatBytes(resolveResult.savedBytes)}</div>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="mt-6 px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              Start New Scan
            </button>
          </div>
        )}

        {/* Duplicate Review List */}
        {duplicateSets && duplicateSets.length > 0 && !resolving && (
          <div className="flex flex-col gap-6">

            {/* Error alert (contextual, near footer) */}
            {error && (
              <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200 flex items-center gap-3">
                <AlertCircle size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Summary banner */}
            <div className="glass-panel rounded-2xl p-6 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent border-l-4 border-l-[var(--color-primary)] flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
              <div>
                <h3 className="text-lg font-semibold text-white">Review Duplicates</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Found <strong className="text-white">{metrics.totalGroups}</strong> duplicate groups with{' '}
                  <strong className="text-white">{metrics.totalFiles - metrics.totalGroups}</strong> redundant files.
                  Selecting <strong className="text-emerald-400">{formatBytes(metrics.reclaimableBytes)}</strong> to move to Trash.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 border border-white/10 hover:border-white/20 hover:bg-white/5 text-white font-semibold text-sm rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* List of sets */}
            <div className="flex flex-col gap-4">
              {duplicateSets.map((set, setIdx) => {
                const allFiles = [set.original, ...set.duplicates];
                const keepPath = keepFiles[set.hash];

                return (
                  <div key={set.hash} className="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col gap-4">

                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2.5 py-1 rounded-full">
                          Group {setIdx + 1}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)] font-mono truncate max-w-sm hidden md:inline">
                          Hash: {set.hash.substring(0, 16)}...
                        </span>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        File Size: <strong>{formatBytes(set.original.size)}</strong>
                      </div>
                    </div>

                    {/* Files */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {allFiles.map((file) => {
                        const isKeep = file.path === keepPath;
                        const isExcluded = excludedPaths[file.path] === true;
                        const isPhoto = /\.(jpe?g|png|webp|bmp)$/i.test(file.name);
                        const isVideo = /\.(mp4|mov|mkv|avi|wmv|flv|m4v)$/i.test(file.name);
                        const assetUrl = (isPhoto || isVideo) ? convertFileSrc(file.path) : null;

                        return (
                          <div
                            key={file.path}
                            onClick={() => {
                              setKeepFiles((prev) => ({ ...prev, [set.hash]: file.path }));
                              if (excludedPaths[file.path]) {
                                setExcludedPaths((prev) => ({ ...prev, [file.path]: false }));
                              }
                            }}
                            className={`group relative rounded-xl border p-4 cursor-pointer transition-all flex gap-4 ${
                              isKeep
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-white'
                                : 'border-white/10 bg-black/20 text-[var(--color-text-muted)] hover:border-white/25 hover:text-white'
                            }`}
                          >
                            {/* Selector indicator */}
                            <div className="absolute top-3 left-3 z-10">
                              <div className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                                isKeep
                                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                                  : 'border-white/20 bg-black/40 group-hover:border-white/40'
                              }`}>
                                {isKeep && <Check size={12} strokeWidth={3} />}
                              </div>
                            </div>

                            {/* Thumbnail */}
                            <div className="w-24 h-24 shrink-0 rounded-lg overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center relative select-none">
                              {assetUrl ? (
                                isPhoto ? (
                                  <img src={assetUrl} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                  <div className="relative w-full h-full flex items-center justify-center">
                                    <video src={assetUrl} className="w-full h-full object-cover" preload="metadata" />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                      <Play size={18} className="text-white drop-shadow" />
                                    </div>
                                  </div>
                                )
                              ) : (
                                <Film size={24} className="text-white/20" />
                              )}
                            </div>

                            {/* Meta info */}
                            <div className="flex-1 flex flex-col justify-between min-w-0 pr-8">
                              <div>
                                <h4 className="text-sm font-semibold truncate text-white" title={file.name}>{file.name}</h4>
                                <p className="text-xs text-[var(--color-text-muted)] truncate mt-1" title={file.path}>
                                  {file.path.substring(0, file.path.length - file.name.length)}
                                </p>
                              </div>
                              <div className="flex flex-col gap-1 text-[10px] text-[var(--color-text-muted)] mt-2 font-mono">
                                <div>Modified: {new Date(file.modified).toLocaleDateString()}</div>
                                <div>Size: {formatBytes(file.size)}</div>
                              </div>
                            </div>

                            {/* Badge */}
                            <div className="absolute top-3 right-3 flex items-center gap-1.5">
                              {isKeep ? (
                                <span className="text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded uppercase tracking-wider">
                                  Keep
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-[var(--color-text-muted)] font-medium">
                                    <input
                                      type="checkbox"
                                      checked={!isExcluded}
                                      onChange={(e) => {
                                        setExcludedPaths((prev) => ({ ...prev, [file.path]: !e.target.checked }));
                                      }}
                                      className="h-3.5 w-3.5 accent-[var(--color-primary)] bg-black border-white/10 rounded cursor-pointer"
                                    />
                                    Skip
                                  </label>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sticky Footer */}
            <div className="sticky bottom-4 z-10 glass-panel rounded-2xl p-5 border border-white/10 shadow-2xl flex items-center justify-between gap-6 max-md:flex-col max-md:items-stretch bg-black/60 backdrop-blur-md">
              <div className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wider font-semibold text-[var(--color-text-muted)]">Ready for Action</span>
                <span className="text-sm text-white">
                  Will move <strong className="text-white">{metrics.selectedCount}</strong> files to Trash,
                  reclaiming <strong className="text-emerald-400">{formatBytes(metrics.reclaimableBytes)}</strong> of storage space.
                </span>
              </div>

              <button
                disabled={metrics.selectedCount === 0 || resolving}
                onClick={handleResolve}
                className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-sm font-semibold text-white transition-colors shadow-lg hover:bg-[var(--color-primary)]/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={16} />
                {resolving ? 'Moving to Trash...' : 'Move to Trash'}
              </button>
            </div>
          </div>
        )}

        {/* No duplicates found */}
        {duplicateSets && duplicateSets.length === 0 && !scanning && (
          <div className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4 py-16">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-2">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-xl font-semibold text-white">No Duplicates Found</h3>
            <p className="text-sm text-[var(--color-text-muted)] max-w-sm">
              Great news! No duplicate files were found in this folder.
            </p>
            <button
              onClick={handleReset}
              className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              Go Back
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
