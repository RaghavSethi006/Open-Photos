import { useEffect, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Image,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  ImageOff,
  FolderHeart,
  Folder,
  AlertCircle,
} from 'lucide-react';
import { useAlbumsStore } from '../store/useAlbumsStore';
import { useStore } from '../store/useStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauriRuntime, listPhotos } from '../lib/tauri';

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface TempAlbum {
  path: string;
  name: string;
  photoCount: number;
}

export function AlbumsPage() {
  const { albums, loading, error, loadAlbums, deleteAlbum, renameAlbum } = useAlbumsStore();
  const { setCurrentView, setPendingFolder, setSelectedAlbumId } = useStore();
  const { defaultFolder } = useSettingsStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [tempAlbums, setTempAlbums] = useState<TempAlbum[]>([]);
  const [loadingTemp, setLoadingTemp] = useState(false);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  // Load subfolders from default folder as temp albums
  const loadTempAlbums = useCallback(async () => {
    if (!defaultFolder) return;
    setLoadingTemp(true);
    try {
      const entries = await listPhotos(defaultFolder);
      const folderEntries = entries.filter((e) => e.isFolder);
      const temp: TempAlbum[] = await Promise.all(
        folderEntries.map(async (f) => {
          let photoCount = 0;
          try {
            const children = await listPhotos(f.path);
            photoCount = children.filter((c) => !c.isFolder).length;
          } catch {}
          return { path: f.path, name: f.name, photoCount };
        }),
      );
      setTempAlbums(temp);
    } catch {
      // silently fail — temp albums are optional
    } finally {
      setLoadingTemp(false);
    }
  }, [defaultFolder]);

  useEffect(() => {
    loadTempAlbums();
  }, [loadTempAlbums]);

  const handleOpenTempAlbum = (path: string) => {
    setPendingFolder(path);
    setCurrentView('timeline');
  };

  const handleOpenAlbum = (id: string) => {
    setSelectedAlbumId(id);
    setCurrentView('album-detail');
  };

  const startRename = (id: string, current: string) => {
    setEditingId(id);
    setEditingName(current);
  };

  const saveRename = async (id: string) => {
    if (editingName.trim()) {
      await renameAlbum(id, editingName.trim());
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteAlbum(id);
    setDeletingId(null);
  };

  return (
    <div className="h-full overflow-y-auto px-8 pb-10 pt-4">
      <div className="mx-auto max-w-6xl flex flex-col gap-6">
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal text-white">Albums</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                Your curated photo collections. Select photos from any folder and save them as albums.
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--color-primary)]/12 p-3 text-[var(--color-primary)]">
              <FolderHeart size={24} />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200 flex items-center gap-3">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Temp albums from subfolders ── */}
        {defaultFolder && tempAlbums.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 px-1">
              From your folders
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {tempAlbums.map((ta) => (
                <motion.div
                  key={ta.path}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-panel rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all cursor-pointer group"
                  onClick={() => handleOpenTempAlbum(ta.path)}
                >
                  <div className="aspect-[4/3] bg-black/40 relative overflow-hidden flex items-center justify-center">
                    <Folder size={48} className="text-white/20" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-lg">
                      <Image size={12} className="text-white/70" />
                      <span className="text-[10px] font-medium text-white/90">
                        {ta.photoCount}
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-white truncate" title={ta.name}>
                      {ta.name}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Folder</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {loadingTemp && tempAlbums.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />
          </div>
        )}

        {/* ── User-created albums ── */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-[var(--color-primary)]" />
          </div>
        )}

        {!loading && albums.length === 0 && tempAlbums.length === 0 && (
          <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="h-16 w-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--color-text-muted)]">
              <FolderHeart size={32} />
            </div>
            <h3 className="text-lg font-semibold text-white">No albums yet</h3>
            <p className="text-sm text-[var(--color-text-muted)] max-w-sm">
              Open a photo folder, select photos, and save them as an album to see them here.
            </p>
          </div>
        )}

        {albums.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 px-1">
              Your albums
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {albums.map((album) => {
                const coverSrc = album.coverPath && isTauriRuntime()
                  ? convertFileSrc(album.coverPath)
                  : album.coverPath;

                return (
                  <motion.div
                    key={album.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all cursor-pointer group relative"
                  >
                    <div
                      className="aspect-[4/3] bg-black/40 relative overflow-hidden"
                      onClick={() => handleOpenAlbum(album.id)}
                    >
                      {coverSrc ? (
                        <img
                          src={coverSrc}
                          alt={album.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageOff size={32} className="text-white/20" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-lg">
                        <Image size={12} className="text-white/70" />
                        <span className="text-[10px] font-medium text-white/90">
                          {album.photoPaths.length}
                        </span>
                      </div>
                    </div>

                    <div className="p-3">
                      {editingId === album.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(album.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button onClick={() => saveRename(album.id)} className="p-1 text-[var(--color-primary)]">
                            <Check size={12} />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-[var(--color-text-muted)]">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-sm font-medium text-white truncate cursor-pointer"
                              onClick={() => handleOpenAlbum(album.id)}
                              title={album.name}
                            >
                              {album.name}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                              {formatDate(album.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startRename(album.id, album.name)}
                              className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-white hover:bg-white/10"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => setDeletingId(album.id)}
                              className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-red-400 hover:bg-white/10"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {deletingId === album.id && (
                      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10 rounded-2xl">
                        <p className="text-sm text-white font-medium">Delete "{album.name}"?</p>
                        <p className="text-xs text-[var(--color-text-muted)]">Photos won't be deleted, only the album.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeletingId(null)}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white hover:bg-white/10"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDelete(album.id)}
                            className="px-3 py-1.5 rounded-lg bg-red-500 text-xs text-white hover:bg-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
