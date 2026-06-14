import { open } from '@tauri-apps/plugin-dialog';
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  FolderInput,
  FolderOutput,
  MoveRight,
  RotateCcw,
  ScanLine,
  Settings2,
  Bookmark,
} from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { runMediaOrganizer, OrganizeSummary } from '../lib/tauri';
import { useProgressStore } from '../store/useStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSavedPathsStore } from '../store/useSavedPathsStore';

const DEFAULT_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.heic',
  '.webp',
  '.tiff',
  '.bmp',
  '.mp4',
  '.mov',
  '.mkv',
  '.avi',
  '.wmv',
  '.flv',
  '.m4v',
];

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp']);

export function ScanPage() {
  const settings = useSettingsStore();
  const { paths: savedPaths } = useSavedPathsStore();

  const [source, setSource] = useState('');
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [destination, setDestination] = useState('');
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const [moveFiles, setMoveFiles] = useState(settings.defaultScanMode === 'move');
  const [fallbackDate, setFallbackDate] = useState(settings.defaultFallbackDate);
  const [useExif, setUseExif] = useState(settings.defaultUseExif);
  const [selectedExtensions, setSelectedExtensions] = useState<string[]>(settings.defaultExtensions);
  const [summary, setSummary] = useState<OrganizeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isScanning, scanned, found, copied, moved, skipped, renamedDuplicates, phase } = useProgressStore();

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showSourceDropdown && !showDestDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.source-dropdown') && !target.closest('.dest-dropdown')) {
        setShowSourceDropdown(false);
        setShowDestDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSourceDropdown, showDestDropdown]);

  const selectedCount = selectedExtensions.length;
  const actionLabel = moveFiles ? 'Move' : 'Copy';
  const canRun = source.trim().length > 0 && destination.trim().length > 0 && selectedCount > 0 && !isScanning;

  const imageCount = useMemo(
    () => selectedExtensions.filter((ext) => IMAGE_EXTENSIONS.has(ext)).length,
    [selectedExtensions],
  );

  const browse = async (setter: (value: string) => void) => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setter(selected);
    }
  };

  const selectSavedPath = (path: string, setter: (v: string) => void) => {
    setter(path);
    setShowSourceDropdown(false);
    setShowDestDropdown(false);
  };

  const toggleExtension = (extension: string) => {
    setSelectedExtensions((current) =>
      current.includes(extension)
        ? current.filter((item) => item !== extension)
        : [...current, extension],
    );
  };

  const handleRun = async () => {
    setError(null);
    setSummary(null);

    try {
      const result = await runMediaOrganizer({
        source,
        destination,
        moveFiles,
        fallbackDate,
        allowedExtensions: selectedExtensions,
        useExif,
      });
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="h-full overflow-y-auto px-8 pb-10 pt-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="grid grid-cols-[minmax(0,1fr)_320px] gap-6 max-xl:grid-cols-1">
          <div className="glass-panel rounded-2xl p-6">
            <div className="mb-6 flex items-start justify-between gap-6">
              <div>
                <h2 className="text-2xl font-semibold tracking-normal text-white">Media organizer</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                  Sort photos and videos into year, month, and day folders without building a database.
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--color-primary)]/12 p-3 text-[var(--color-primary)]">
                <ScanLine size={24} />
              </div>
            </div>

            <div className="grid gap-4">
              <div className="source-dropdown relative">
                <FolderField
                  icon={FolderInput}
                  label="Source folder"
                  value={source}
                  onChange={setSource}
                  onBrowse={() => browse(setSource)}
                  onSavedPathsClick={() => {
                    setShowDestDropdown(false);
                    setShowSourceDropdown(!showSourceDropdown);
                  }}
                />
                {showSourceDropdown && savedPaths.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-full glass-panel rounded-xl p-1.5 z-50 shadow-2xl border-white/10 max-h-48 overflow-y-auto">
                    {savedPaths.map((sp) => (
                      <button
                        key={sp.id}
                        onClick={() => selectSavedPath(sp.path, setSource)}
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
              <div className="dest-dropdown relative">
                <FolderField
                  icon={FolderOutput}
                  label="Destination folder"
                  value={destination}
                  onChange={setDestination}
                  onBrowse={() => browse(setDestination)}
                  onSavedPathsClick={() => {
                    setShowSourceDropdown(false);
                    setShowDestDropdown(!showDestDropdown);
                  }}
                />
                {showDestDropdown && savedPaths.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-full glass-panel rounded-xl p-1.5 z-50 shadow-2xl border-white/10 max-h-48 overflow-y-auto">
                    {savedPaths.map((sp) => (
                      <button
                        key={sp.id}
                        onClick={() => selectSavedPath(sp.path, setDestination)}
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
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <div className="mb-5 flex items-center gap-3">
              <Settings2 size={18} className="text-[var(--color-primary)]" />
              <h3 className="text-sm font-semibold text-white">Run mode</h3>
            </div>

            <div className="grid gap-3">
              <SegmentedButton
                active={!moveFiles}
                icon={Copy}
                label="Copy"
                onClick={() => setMoveFiles(false)}
              />
              <SegmentedButton
                active={moveFiles}
                icon={MoveRight}
                label="Move"
                onClick={() => setMoveFiles(true)}
              />
            </div>

            <label className="mt-5 block text-xs font-medium text-[var(--color-text-muted)]">
              Fallback date
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <CalendarDays size={16} className="text-[var(--color-text-muted)]" />
                <input
                  type="date"
                  value={fallbackDate}
                  onChange={(event) => setFallbackDate(event.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-white shadow-none outline-none"
                />
              </div>
            </label>

            <label className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="text-sm font-medium text-white">Read image EXIF dates</span>
              <input
                type="checkbox"
                checked={useExif}
                onChange={(event) => setUseExif(event.target.checked)}
                className="h-5 w-5 accent-[var(--color-primary)]"
              />
            </label>
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Media types</h3>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {selectedCount} extensions selected, {imageCount} with EXIF support
              </p>
            </div>
            <button
              onClick={() => setSelectedExtensions(DEFAULT_EXTENSIONS)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] shadow-none hover:border-white/20 hover:text-white"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 max-lg:grid-cols-4 max-sm:grid-cols-2">
            {DEFAULT_EXTENSIONS.map((extension) => {
              const active = selectedExtensions.includes(extension);
              return (
                <button
                  key={extension}
                  onClick={() => toggleExtension(extension)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold shadow-none transition-colors ${
                    active
                      ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-[var(--color-text-muted)] hover:text-white'
                  }`}
                >
                  {extension}
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-[minmax(0,1fr)_280px] gap-6 max-xl:grid-cols-1">
          <div className="glass-panel rounded-2xl p-6">
            <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
              <Metric label="Scanned" value={scanned} />
              <Metric label="Matched" value={found} />
              <Metric label={moveFiles ? 'Moved' : 'Copied'} value={moveFiles ? moved : copied} />
              <Metric label="Renamed" value={renamedDuplicates} />
            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
                style={{ width: phase === 'Done' ? '100%' : found > 0 ? '68%' : '8%' }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
              <span>Phase: {phase}</span>
              <span>Skipped: {skipped.toLocaleString()}</span>
            </div>

            {summary && (
              <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                <CheckCircle2 size={18} />
                {summary.copied + summary.moved} files organized in {(summary.elapsedMs / 1000).toFixed(1)}s
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>

          <div className="glass-panel flex flex-col justify-between rounded-2xl p-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Target pattern
              </p>
              <p className="mt-3 break-words text-sm leading-6 text-white">
                {destination || 'Destination'}\YYYY\MM-Month\DD
              </p>
            </div>

            <button
              disabled={!canRun}
              onClick={handleRun}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white shadow-none transition-colors hover:bg-[var(--color-primary)]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ScanLine size={17} />
              {isScanning ? 'Running' : `${actionLabel} media`}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function FolderField({
  icon: Icon,
  label,
  value,
  onChange,
  onBrowse,
  onSavedPathsClick,
}: {
  icon: typeof FolderInput;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBrowse: () => void;
  onSavedPathsClick?: () => void;
}) {
  return (
    <label className="block text-xs font-medium text-[var(--color-text-muted)]">
      {label}
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
        <Icon size={17} className="shrink-0 text-[var(--color-text-muted)]" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-white shadow-none outline-none"
        />
        {onSavedPathsClick && (
          <button
            type="button"
            onClick={onSavedPathsClick}
            className="rounded-lg bg-white/8 px-2 py-1.5 text-[var(--color-text-muted)] hover:text-white hover:bg-white/12"
            title="Saved paths"
          >
            <Bookmark size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={onBrowse}
          className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white shadow-none hover:bg-white/12"
        >
          Browse
        </button>
      </div>
    </label>
  );
}

function SegmentedButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Copy;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold shadow-none ${
        active
          ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/15 text-white'
          : 'border-white/10 bg-white/[0.03] text-[var(--color-text-muted)] hover:text-white'
      }`}
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  );
}
