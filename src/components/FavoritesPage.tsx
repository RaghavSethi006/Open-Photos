import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FolderOpen, Loader2, Star, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { listPhotos, isTauriRuntime, type PhotoEntry } from '../lib/tauri';
import { useSettingsStore } from '../store/useSettingsStore';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { PhotoTile, type LayoutPhoto } from './PhotoTile';

const TARGET_ROW_HEIGHT = 240;
const GRID_GAP = 4;

function justifyRow(photos: LayoutPhoto[], containerWidth: number, targetHeight: number, gap: number): LayoutPhoto[] {
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

function guessAspect(name: string): number {
  const e = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'm4v', 'webm'].includes(e)) return 16 / 9;
  return 4 / 3;
}

function Lightbox({ photos, index, onClose, onPrev, onNext }: {
  photos: LayoutPhoto[]; index: number; onClose: () => void; onPrev: () => void; onNext: () => void;
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
    <motion.div key="lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-sm"
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"><X size={20} /></button>
      <div className="absolute bottom-0 left-0 right-0 z-10 px-6 py-4 bg-gradient-to-t from-black/70 to-transparent">
        <p className="text-white font-medium text-sm truncate">{photo.name}</p>
        <p className="text-white/50 text-xs mt-0.5">{formatFileSize(photo.sizeBytes)} · {new Date(photo.modifiedMs).toLocaleString()}</p>
      </div>
      {index > 0 && <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="absolute left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"><ChevronLeft size={24} /></button>}
      {index < photos.length - 1 && <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="absolute right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"><ChevronRight size={24} /></button>}
      <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh]">
        {photo.isVideo ? (
          <video src={photo.src} controls autoPlay className="max-w-[90vw] max-h-[85vh] rounded-lg" style={{ objectFit: 'contain' }} />
        ) : (
          <img src={photo.src} alt={photo.name} className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain select-none" draggable={false} />
        )}
      </div>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 text-white/70 text-xs px-3 py-1.5 rounded-full">{index + 1} / {photos.length}</div>
    </motion.div>
  );
}

export function FavoritesPage() {
  const { defaultFolder } = useSettingsStore();
  const { paths: favPaths, loadFavorites, loaded } = useFavoritesStore();
  const [folder, setFolder] = useState('');
  const [allEntries, setAllEntries] = useState<PhotoEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);

  useEffect(() => { loadFavorites(); }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (defaultFolder && !folder) {
      setFolder(defaultFolder);
      loadPhotos(defaultFolder);
    }
  }, [defaultFolder]);

  const loadPhotos = async (dir: string) => {
    setLoading(true);
    setError(null);
    setAllEntries([]);
    try {
      const entries = await listPhotos(dir);
      setAllEntries(entries.filter((e) => !e.isFolder));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

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

  const buildLayout = useCallback((entries: PhotoEntry[]): LayoutPhoto[] => {
    return entries.map((e) => ({
      ...e,
      src: isTauriRuntime() ? convertFileSrc(e.path) : e.path,
      displayWidth: Math.round(TARGET_ROW_HEIGHT * guessAspect(e.name)),
      displayHeight: TARGET_ROW_HEIGHT,
    }));
  }, []);

  const groupByDate = useCallback((layoutPhotos: LayoutPhoto[]) => {
    const map = new Map<string, { label: string; dateKey: string; photos: LayoutPhoto[] }>();
    for (const p of layoutPhotos) {
      const key = dateKey(p.modifiedMs);
      if (!map.has(key)) map.set(key, { dateKey: key, label: formatDateLabel(p.modifiedMs), photos: [] });
      map.get(key)!.photos.push(p);
    }
    return Array.from(map.values());
  }, []);

  const favoriteEntries = useMemo(() => {
    if (!loaded) return [];
    return allEntries.filter((e) => favPaths.has(e.path));
  }, [allEntries, favPaths, loaded]);

  const groups = useMemo(() => {
    const layout = buildLayout(favoriteEntries);
    return groupByDate(layout);
  }, [favoriteEntries]);

  const allPhotosFlat: LayoutPhoto[] = groups.flatMap((g) => g.photos);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.06] shrink-0">
        <button onClick={handleBrowse} className="flex items-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-lg shadow-[var(--color-primary)]/20">
          <FolderOpen size={16} />
          Choose Folder
        </button>
        {folder && <span className="text-[var(--color-text-muted)] text-sm truncate min-w-0 flex-1">{folder}</span>}
        {allPhotosFlat.length > 0 && <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{favoriteEntries.length} favorited</span>}
      </div>

      <div className="flex-1 overflow-y-auto" ref={containerRef}>
        {!folder && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5">
              <div className="w-24 h-24 rounded-3xl bg-amber-400/10 flex items-center justify-center text-amber-400">
                <Star size={44} strokeWidth={1.3} />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Your Favorites</h2>
              <p className="mt-2 text-[var(--color-text-muted)] max-w-xs leading-relaxed">
                Star photos to save them as favorites. Open a folder to see your starred photos here.
              </p>
              <button onClick={handleBrowse} className="bg-[var(--color-primary)] hover:bg-indigo-400 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-[var(--color-primary)]/20">
                Choose Folder
              </button>
            </motion.div>
          </div>
        )}

        {loading && <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--color-text-muted)]"><Loader2 size={36} className="animate-spin text-[var(--color-primary)]" /><p className="text-sm">Loading…</p></div>}

        {error && <div className="m-6 rounded-xl border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm text-red-200">{error}</div>}

        {!loading && folder && favoriteEntries.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--color-text-muted)]">
            <Star size={40} strokeWidth={1.3} />
            <p className="text-sm">No favorited photos in this folder.</p>
            <p className="text-xs text-[var(--color-text-muted)]/60">Star photos in the Photos view to see them here.</p>
          </div>
        )}

        {!loading && groups.length > 0 && (
          <div className="px-4 py-4 space-y-8">
            {groups.map((group) => {
              const rows: LayoutPhoto[][] = [];
              let currentRow: LayoutPhoto[] = [];
              let rowWidth = 0;
              for (const photo of group.photos) {
                const photoW = (photo.displayWidth / photo.displayHeight) * TARGET_ROW_HEIGHT;
                if (rowWidth + photoW + GRID_GAP > containerWidth && currentRow.length > 0) {
                  rows.push(currentRow);
                  currentRow = [photo];
                  rowWidth = photoW + GRID_GAP;
                } else {
                  currentRow.push(photo);
                  rowWidth += photoW + GRID_GAP;
                }
              }
              if (currentRow.length > 0) rows.push(currentRow);
              const groupStart = allPhotosFlat.indexOf(group.photos[0]);
              return (
                <div key={group.dateKey}>
                  <h3 className="text-white font-semibold text-base mb-3 sticky top-0 z-10 py-1 bg-[var(--color-base)]/80 backdrop-blur-sm">{group.label}</h3>
                  <div className="flex flex-col" style={{ gap: GRID_GAP }}>
                    {rows.map((row, rowIdx) => {
                      const justified = justifyRow(row, containerWidth, TARGET_ROW_HEIGHT, GRID_GAP);
                      const rowOffset = groupStart + rows.slice(0, rowIdx).reduce((s, r) => s + r.length, 0);
                      return (
                        <div key={rowIdx} className="flex" style={{ gap: GRID_GAP }}>
                          {justified.map((photo, i) => (
                            <PhotoTile key={photo.path} photo={photo} isSelected={false} selectionMode={false}
                              onOpen={() => setLightboxIndex(rowOffset + i)} onToggleSelect={() => {}} onSelectClick={() => {}}
                              gap={GRID_GAP} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox photos={allPhotosFlat} index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onPrev={() => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
            onNext={() => setLightboxIndex((i) => (i !== null && i < allPhotosFlat.length - 1 ? i + 1 : i))} />
        )}
      </AnimatePresence>
    </div>
  );
}
