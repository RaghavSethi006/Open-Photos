import { useEffect, useState, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { open } from '@tauri-apps/plugin-dialog';
import {
  ArrowLeft,
  Trash2,
  Plus,
  Loader2,
  ImageOff,
  Play,
  X,
  AlertCircle,
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauriRuntime, listPhotos } from '../lib/tauri';
import { useAlbumsStore } from '../store/useAlbumsStore';
import { useStore } from '../store/useStore';
import { useToastStore } from '../store/useToastStore';
import { Lightbox } from './Lightbox';

const ZERO_GAP = 0;
const TARGET_ROW_HEIGHT = 240;

interface AlbumPhoto {
  path: string;
  name: string;
  src: string;
  isVideo: boolean;
  missing: boolean;
  width: number;
  height: number;
}

function guessAspect(name: string): number {
  const e = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'm4v', 'webm'].includes(e)) return 16 / 9;
  return 4 / 3;
}

function justifyRow(photos: AlbumPhoto[], containerWidth: number, targetHeight: number): AlbumPhoto[] {
  if (photos.length === 0) return photos;
  const totalAspect = photos.reduce((sum, p) => sum + p.width / p.height, 0);
  const rowHeight = Math.min(containerWidth / totalAspect, targetHeight * 1.5);
  return photos.map((p) => ({
    ...p,
    width: Math.floor((p.width / p.height) * rowHeight),
    height: Math.floor(rowHeight),
  }));
}

export function AlbumDetailPage() {
  const { selectedAlbumId, setCurrentView } = useStore();
  const { albums, loadAlbums, removePhotos, deleteAlbum, renameAlbum, addPhotos } = useAlbumsStore();

  const [album, setAlbum] = useState<typeof albums[0] | null>(null);
  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhoto[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  // Load album data
  useEffect(() => {
    const fetchAlbum = async () => {
      if (!selectedAlbumId) return;
      setLoading(true);
      await loadAlbums();
      const found = albums.find((a) => a.id === selectedAlbumId);
      if (found) {
        setAlbum(found);
        buildAlbumPhotos(found);
      }
      setLoading(false);
    };
    fetchAlbum();
  }, [selectedAlbumId]);

  // Update album when albums store changes
  useEffect(() => {
    if (!selectedAlbumId) return;
    const found = albums.find((a) => a.id === selectedAlbumId);
    if (found) {
      setAlbum(found);
      buildAlbumPhotos(found);
    }
  }, [albums]);

  // Observe container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const buildAlbumPhotos = useCallback((album: typeof albums[0]) => {
    const photos: AlbumPhoto[] = album.photoPaths.map((path) => {
      const name = path.split(/[\\/]/).pop() || 'Unknown';
      return {
        path,
        name,
        src: isTauriRuntime() ? convertFileSrc(path) : path,
        isVideo: /\.(mp4|mov|mkv|avi|wmv|flv|m4v)$/i.test(name),
        missing: false,
        width: Math.round(TARGET_ROW_HEIGHT * guessAspect(name)),
        height: TARGET_ROW_HEIGHT,
      };
    });
    setAlbumPhotos(photos);
  }, []);

  // Add photos to album
  const handleAddPhotos = async () => {
    if (!album) return;
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected || typeof selected !== 'string') return;
      const entries = await listPhotos(selected);
      const photoPaths = entries.filter((e) => !e.isFolder).map((e) => e.path);
      if (photoPaths.length === 0) {
        addToast({ type: 'info', message: 'No photos found in that folder.' });
        return;
      }
      await addPhotos(album.id, photoPaths);
      addToast({ type: 'success', message: `Added ${photoPaths.length} photo(s) from folder.` });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  // Remove photo from album
  const handleRemovePhoto = async (path: string) => {
    if (!album) return;
    try {
      await removePhotos(album.id, [path]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRename = async () => {
    if (!album || !newName.trim()) return;
    try {
      await renameAlbum(album.id, newName.trim());
      setRenaming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async () => {
    if (!album) return;
    await deleteAlbum(album.id);
    setCurrentView('albums');
  };

  // Build justified rows with zero gap
  const rows: AlbumPhoto[][] = [];
  if (albumPhotos.length > 0 && containerWidth > 0) {
    let currentRow: AlbumPhoto[] = [];
    let rowWidth = 0;

    for (const photo of albumPhotos) {
      const photoW = (photo.width / photo.height) * TARGET_ROW_HEIGHT;
      if (rowWidth + photoW > containerWidth && currentRow.length > 0) {
        // Justify current row
        const justified = justifyRow(currentRow, containerWidth, TARGET_ROW_HEIGHT);
        rows.push(justified);
        currentRow = [photo];
        rowWidth = photoW;
      } else {
        currentRow.push(photo);
        rowWidth += photoW;
      }
    }
    if (currentRow.length > 0) {
      // Last row: left-aligned (not stretched)
      rows.push(currentRow);
    }
  }

  const missingCount = albumPhotos.filter((p) => p.missing).length;
  const allPhotosFlat = rows.flat();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.06] shrink-0">
        <button
          onClick={() => setCurrentView('albums')}
          className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Albums
        </button>

        {album && (
          <div className="flex-1 flex items-center gap-3 min-w-0">
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') setRenaming(false);
                  }}
                />
                <button onClick={handleRename} className="text-xs text-[var(--color-primary)] font-semibold hover:underline">
                  Save
                </button>
                <button onClick={() => setRenaming(false)} className="text-xs text-[var(--color-text-muted)] hover:underline">
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <h1
                  className="text-sm font-semibold text-white truncate cursor-pointer hover:underline"
                  onClick={() => {
                    setRenaming(true);
                    setNewName(album.name);
                  }}
                  title="Click to rename"
                >
                  {album.name}
                </h1>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {album.photoPaths.length} photo(s)
                  {missingCount > 0 && (
                    <span className="text-red-400 ml-1">
                      ({missingCount} missing)
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
        )}

        {album && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddPhotos}
              className="flex items-center gap-2 text-xs text-white border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Plus size={14} />
              Add
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 border border-red-400/20 px-3 py-1.5 rounded-lg transition-colors"
              title="Delete album"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto" ref={containerRef}>
        {error && (
          <div className="m-6 rounded-xl border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm text-red-200 flex items-center gap-3">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={32} className="animate-spin text-[var(--color-primary)]" />
          </div>
        )}

        {!loading && albumPhotos.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[var(--color-text-muted)]">
              <ImageOff size={36} />
            </div>
            <h3 className="text-lg font-semibold text-white">No photos in this album</h3>
            <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
              Add photos by selecting them in the Photos view and saving to this album.
            </p>
          </div>
        )}

        {/* Zero-gap justified collage */}
        {!loading && rows.length > 0 && (
          <div className="p-0">
            {rows.map((row, rowIdx) => {
              const globalOffset = rows.slice(0, rowIdx).reduce((s, r) => s + r.length, 0);
              return (
                <div key={rowIdx} className="flex" style={{ gap: ZERO_GAP }}>
                  {row.map((photo, i) => (
                    <AlbumTile
                      key={photo.path + '-' + i}
                      photo={photo}
                      onOpen={() => !photo.missing && setLightboxIndex(globalOffset + i)}
                      onRemove={() => handleRemovePhoto(photo.path)}
                    />
                  ))}
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
            onNext={() => setLightboxIndex((i) => (i !== null && i < allPhotosFlat.length - 1 ? i + 1 : i))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AlbumTile({ photo, onOpen, onRemove }: {
  photo: AlbumPhoto;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (photo.missing) {
    return (
      <div
        className="relative shrink-0 overflow-hidden bg-red-900/20 border border-red-500/20 flex items-center justify-center"
        style={{ width: photo.width, height: photo.height }}
      >
        <div className="flex flex-col items-center gap-1 text-red-400/60">
          <AlertCircle size={20} />
          <span className="text-[9px] font-medium px-1 text-center leading-tight">File not found</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 overflow-hidden cursor-pointer group bg-white/5"
      style={{ width: photo.width, height: photo.height }}
      onClick={onOpen}
    >
      {!loaded && !errored && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Loader2 size={18} className="text-white/20 animate-spin" />
        </div>
      )}

      {errored ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/20 bg-red-900/10">
          <AlertCircle size={18} />
          <span className="text-[9px]">File not found</span>
        </div>
      ) : photo.isVideo ? (
        <div className="relative w-full h-full">
          <video src={photo.src} className="w-full h-full object-cover" muted preload="metadata"
            onLoadedMetadata={() => setLoaded(true)} onError={() => setErrored(true)} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
              <Play size={16} className="text-white ml-0.5" fill="white" />
            </div>
          </div>
        </div>
      ) : (
        <img src={photo.src} alt={photo.name} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy" onLoad={() => setLoaded(true)} onError={() => setErrored(true)} draggable={false} />
      )}

      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
      >
        <X size={11} className="text-white" />
      </button>

    </div>
  );
}
