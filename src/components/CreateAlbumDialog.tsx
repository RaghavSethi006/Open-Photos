import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Loader2 } from 'lucide-react';
import { useAlbumsStore } from '../store/useAlbumsStore';

interface Props {
  open: boolean;
  onClose: () => void;
  selectedPaths: string[];
  onCreated: (albumId: string) => void;
}

export function CreateAlbumDialog({ open, onClose, selectedPaths, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { createAlbum } = useAlbumsStore();

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const album = await createAlbum(name.trim(), description.trim(), selectedPaths);
      onCreated(album.id);
      setName('');
      setDescription('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (!creating) {
      setName('');
      setDescription('');
      setError(null);
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
                  <Image size={18} />
                </div>
                <h2 className="text-lg font-semibold text-white">Create Album</h2>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-[var(--color-text-muted)] mb-5">
              {selectedPaths.length} photo(s) selected
            </p>

            <div className="flex flex-col gap-4">
              <label className="block text-xs font-medium text-[var(--color-text-muted)]">
                Album name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Vacation 2025"
                  className="mt-2 block w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[var(--color-primary)] transition-colors"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') handleClose();
                  }}
                />
              </label>

              <label className="block text-xs font-medium text-[var(--color-text-muted)]">
                Description (optional)
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description..."
                  rows={3}
                  className="mt-2 block w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white outline-none resize-none focus:border-[var(--color-primary)] transition-colors"
                />
              </label>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={handleClose}
                disabled={creating}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-[var(--color-text-muted)] hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || creating}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary)]/90 disabled:opacity-50"
              >
                {creating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Album'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
