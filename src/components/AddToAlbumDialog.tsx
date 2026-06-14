import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Check, Folder, CheckSquare } from 'lucide-react';
import { useAlbumsStore } from '../store/useAlbumsStore';
import { useToastStore } from '../store/useToastStore';

interface Props {
  open: boolean;
  onClose: () => void;
  selectedPaths: string[];
}

export function AddToAlbumDialog({ open, onClose, selectedPaths }: Props) {
  const { albums, loading, loadAlbums, addPhotos } = useAlbumsStore();
  const addToast = useToastStore((s) => s.addToast);
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedAlbumIds(new Set());
      loadAlbums();
    }
  }, [open, loadAlbums]);

  const toggleAlbum = (id: string) => {
    setSelectedAlbumIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedAlbumIds.size === 0 || submitting) return;
    setSubmitting(true);
    let successCount = 0;
    let errorCount = 0;
    for (const albumId of selectedAlbumIds) {
      try {
        await addPhotos(albumId, selectedPaths);
        successCount++;
      } catch {
        errorCount++;
      }
    }
    setSubmitting(false);
    if (successCount > 0) {
      addToast({ message: `Added ${selectedPaths.length} photo(s) to ${successCount} album(s)`, type: 'success' });
    }
    if (errorCount > 0) {
      addToast({ message: `Failed to add to ${errorCount} album(s)`, type: 'error' });
    }
    onClose();
  };

  const handleClose = () => {
    if (!submitting) {
      setSelectedAlbumIds(new Set());
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel rounded-2xl p-6 w-full max-w-md mx-4"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[var(--color-primary)]/12 p-2 text-[var(--color-primary)]">
                  <Folder size={18} />
                </div>
                <h2 className="text-lg font-semibold text-white">Add to Album</h2>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-[var(--color-text-muted)] mb-5">
              {selectedPaths.length} photo(s) selected — choose one or more albums
            </p>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
              </div>
            ) : albums.length === 0 ? (
              <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                No albums yet. Create one first using "Save as Album".
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto flex flex-col gap-1.5">
                {albums.map((album) => {
                  const isSelected = selectedAlbumIds.has(album.id);
                  return (
                    <button
                      key={album.id}
                      onClick={() => toggleAlbum(album.id)}
                      className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10 text-white'
                          : 'border-white/10 bg-white/[0.03] text-[var(--color-text-muted)] hover:text-white hover:border-white/20'
                      }`}
                    >
                      <div className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                          : 'border-white/20 bg-black/30'
                      }`}>
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{album.name}</div>
                        {album.description && (
                          <div className="text-[10px] text-[var(--color-text-muted)] truncate">{album.description}</div>
                        )}
                      </div>
                      <span className="text-[10px] text-[var(--color-text-muted)] font-mono shrink-0">
                        {album.photoPaths.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={handleClose}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-[var(--color-text-muted)] hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={selectedAlbumIds.size === 0 || submitting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary)]/90 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <CheckSquare size={16} />
                    Add to {selectedAlbumIds.size} album(s)
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
