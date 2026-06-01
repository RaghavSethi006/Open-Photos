import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Play,
  ImageOff,
  Loader2,
} from 'lucide-react';
import { listPhotos, PhotoEntry, isTauriRuntime } from '../lib/tauri';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LayoutPhoto extends PhotoEntry {
  src: string;
  displayWidth: number;
  displayHeight: number;
}

interface DateGroup {
  label: string;
  dateKey: string;
  photos: LayoutPhoto[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_ROW_HEIGHT = 240;
const GRID_GAP = 4;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateLabel(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ext(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

/** Very naive aspect-ratio map so we can lay out before images load */
function guessAspect(name: string): number {
  const e = ext(name);
  if (['mp4', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'm4v', 'webm'].includes(e)) return 16 / 9;
  return 4 / 3;
}

/** Compute a justified row layout (like Google Photos).
 *  Returns each photo with its rendered width and height. */
function justifyRow(
  photos: LayoutPhoto[],
  containerWidth: number,
  targetHeight: number,
  gap: number,
): LayoutPhoto[] {
  if (photos.length === 0) return photos;

  const totalAspect = photos.reduce((sum, p) => sum + p.displayWidth / p.displayHeight, 0);
  const totalGaps = gap * (photos.length - 1);
  const rowHeight = Math.min((containerWidth - totalGaps) / totalAspect, targetHeight * 1.5);

  return photos.map((p) => ({
    ...p,
    displayWidth: Math.floor((p.displayWidth / p.displayHeight) * rowHeight),
    displayHeight: Math.floor(rowHeight),
  }));
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  photos,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  photos: LayoutPhoto[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const photo = photos[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  if (!photo) return null;

  return (
    <motion.div
      key="lightbox"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <X size={20} />
      </button>

      {/* Caption */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-6 py-4 bg-gradient-to-t from-black/70 to-transparent">
        <p className="text-white font-medium text-sm truncate">{photo.name}</p>
        <p className="text-white/50 text-xs mt-0.5">
          {formatFileSize(photo.sizeBytes)} · {new Date(photo.modifiedMs).toLocaleString()}
        </p>
      </div>

      {/* Prev */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Next */}
      {index < photos.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* Media */}
      <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh]">
        {photo.isVideo ? (
          <video
            src={photo.src}
            controls
            autoPlay
            className="max-w-[90vw] max-h-[85vh] rounded-lg"
            style={{ objectFit: 'contain' }}
          />
        ) : (
          <img
            src={photo.src}
            alt={photo.name}
            className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain select-none"
            draggable={false}
          />
        )}
      </div>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 text-white/70 text-xs px-3 py-1.5 rounded-full">
        {index + 1} / {photos.length}
      </div>
    </motion.div>
  );
}

// ─── Photo Tile ───────────────────────────────────────────────────────────────

function PhotoTile({
  photo,
  onClick,
}: {
  photo: LayoutPhoto;
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <motion.div
      className="relative shrink-0 overflow-hidden rounded-sm cursor-pointer group bg-white/5"
      style={{ width: photo.displayWidth, height: photo.displayHeight }}
      onClick={onClick}
    >
      {!loaded && !errored && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 size={20} className="text-white/20 animate-spin" />
        </div>
      )}

      {errored ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/20">
          <ImageOff size={20} />
          <span className="text-[10px]">error</span>
        </div>
      ) : photo.isVideo ? (
        <div className="relative w-full h-full">
          <video
            src={photo.src}
            className="w-full h-full object-cover"
            muted
            preload="metadata"
            onLoadedMetadata={() => setLoaded(true)}
            onError={() => setErrored(true)}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
              <Play size={18} className="text-white ml-0.5" fill="white" />
            </div>
          </div>
        </div>
      ) : (
        <img
          src={photo.src}
          alt={photo.name}
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          draggable={false}
        />
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-150" />

      {/* Zoom icon on hover */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <div className="w-7 h-7 rounded-full bg-black/40 flex items-center justify-center">
          <ZoomIn size={13} className="text-white" />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Justified Row ────────────────────────────────────────────────────────────

function PhotoRow({
  photos,
  containerWidth,
  globalOffset,
  onOpen,
}: {
  photos: LayoutPhoto[];
  containerWidth: number;
  globalOffset: number;
  onOpen: (index: number) => void;
}) {
  const justified = justifyRow(photos, containerWidth, TARGET_ROW_HEIGHT, GRID_GAP);

  return (
    <div className="flex" style={{ gap: GRID_GAP }}>
      {justified.map((photo, i) => (
        <PhotoTile
          key={photo.path}
          photo={photo}
          onClick={() => onOpen(globalOffset + i)}
        />
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PhotosPage() {
  const [folder, setFolder] = useState<string>('');
  const [photos, setPhotos] = useState<LayoutPhoto[]>([]);
  const [groups, setGroups] = useState<DateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);

  // Observe container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const buildLayout = useCallback((entries: PhotoEntry[]): LayoutPhoto[] => {
    return entries.map((e) => {
      const aspect = guessAspect(e.name);
      return {
        ...e,
        src: isTauriRuntime() ? convertFileSrc(e.path) : e.path,
        displayWidth: Math.round(TARGET_ROW_HEIGHT * aspect),
        displayHeight: TARGET_ROW_HEIGHT,
      };
    });
  }, []);

  const groupByDate = useCallback((layoutPhotos: LayoutPhoto[]): DateGroup[] => {
    const map = new Map<string, DateGroup>();
    for (const p of layoutPhotos) {
      const key = dateKey(p.modifiedMs);
      if (!map.has(key)) {
        map.set(key, { dateKey: key, label: formatDateLabel(p.modifiedMs), photos: [] });
      }
      map.get(key)!.photos.push(p);
    }
    return Array.from(map.values());
  }, []);

  const handleBrowse = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setFolder(selected);
        await loadPhotos(selected);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const loadPhotos = async (dir: string) => {
    setLoading(true);
    setError(null);
    setPhotos([]);
    setGroups([]);
    try {
      const entries = await listPhotos(dir);
      const layout = buildLayout(entries);
      setPhotos(layout);
      setGroups(groupByDate(layout));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReload = () => {
    if (folder) loadPhotos(folder);
  };

  // Build flat array for lightbox navigation
  const allPhotosFlat: LayoutPhoto[] = groups.flatMap((g) => g.photos);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.06] shrink-0">
        <button
          onClick={handleBrowse}
          className="flex items-center gap-2 bg-[var(--color-primary)] hover:bg-indigo-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-lg shadow-[var(--color-primary)]/20"
        >
          <FolderOpen size={16} />
          Choose Folder
        </button>

        {folder && (
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <span className="text-[var(--color-text-muted)] text-sm truncate min-w-0 flex-1">
              {folder}
            </span>
            <button
              onClick={handleReload}
              className="shrink-0 text-xs text-[var(--color-text-muted)] hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>
        )}

        {photos.length > 0 && (
          <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
            {photos.length.toLocaleString()} items
          </span>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto" ref={containerRef}>
        {/* Empty / no folder selected */}
        {!folder && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-5"
            >
              <div className="w-24 h-24 rounded-3xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                <FolderOpen size={44} strokeWidth={1.3} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Open a Photo Folder</h2>
                <p className="mt-2 text-[var(--color-text-muted)] max-w-xs leading-relaxed">
                  Choose any folder on your computer to browse your photos in a Google Photos-style layout.
                </p>
              </div>
              <button
                onClick={handleBrowse}
                className="bg-[var(--color-primary)] hover:bg-indigo-400 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-[var(--color-primary)]/20"
              >
                Choose Folder
              </button>
            </motion.div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--color-text-muted)]">
            <Loader2 size={36} className="animate-spin text-[var(--color-primary)]" />
            <p className="text-sm">Scanning folder…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="m-6 rounded-xl border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* No photos found */}
        {!loading && folder && photos.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--color-text-muted)]">
            <ImageOff size={40} strokeWidth={1.3} />
            <p className="text-sm">No images or videos found in this folder.</p>
          </div>
        )}

        {/* ── Gallery ── */}
        {!loading && groups.length > 0 && (
          <div className="px-4 py-4 space-y-8">
            {groups.map((group) => {
              // Build a justified multi-row layout for this group
              const rows: LayoutPhoto[][] = [];
              let currentRow: LayoutPhoto[] = [];
              let rowWidth = 0;
              const gap = GRID_GAP;

              for (const photo of group.photos) {
                const photoW = (photo.displayWidth / photo.displayHeight) * TARGET_ROW_HEIGHT;
                if (rowWidth + photoW + gap > containerWidth && currentRow.length > 0) {
                  rows.push(currentRow);
                  currentRow = [photo];
                  rowWidth = photoW + gap;
                } else {
                  currentRow.push(photo);
                  rowWidth += photoW + gap;
                }
              }
              if (currentRow.length > 0) rows.push(currentRow);

              // Compute global offset for this group's photos within allPhotosFlat
              const groupStart = allPhotosFlat.indexOf(group.photos[0]);

              return (
                <div key={group.dateKey}>
                  {/* Date header */}
                  <h3 className="text-white font-semibold text-base mb-3 sticky top-0 z-10 py-1 bg-[var(--color-base)]/80 backdrop-blur-sm">
                    {group.label}
                  </h3>

                  {/* Rows */}
                  <div className="flex flex-col" style={{ gap: GRID_GAP }}>
                    {rows.map((row, rowIdx) => {
                      const rowOffset = groupStart + rows.slice(0, rowIdx).reduce((s, r) => s + r.length, 0);
                      return (
                        <PhotoRow
                          key={rowIdx}
                          photos={row}
                          containerWidth={containerWidth - 32}
                          globalOffset={rowOffset}
                          onOpen={(idx) => setLightboxIndex(idx)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            photos={allPhotosFlat}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onPrev={() => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
            onNext={() =>
              setLightboxIndex((i) =>
                i !== null && i < allPhotosFlat.length - 1 ? i + 1 : i,
              )
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}
