import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Loader2 } from 'lucide-react';
import { mergePeople, type PersonInfo } from '../lib/tauri';

interface Props {
  open: boolean;
  onClose: () => void;
  selectedPeople: PersonInfo[];
  onMerged: () => void;
}

export function MergePeopleDialog({ open, onClose, selectedPeople, onMerged }: Props) {
  const [name, setName] = useState('');
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    // Pre-populate with the name of the person who has the most faces, or just the first person
    if (selectedPeople.length > 0) {
      const sorted = [...selectedPeople].sort((a, b) => b.faceCount - a.faceCount);
      setName(sorted[0].name);
    } else {
      setName('');
    }
  }, [open, selectedPeople]);

  const handleMerge = async () => {
    const targetName = name.trim();
    if (!targetName || selectedPeople.length < 2) return;
    setMerging(true);
    setError(null);
    try {
      const ids = selectedPeople.map((p) => p.id);
      await mergePeople(ids, targetName);
      onMerged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMerging(false);
    }
  };

  const handleClose = () => {
    if (!merging) {
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
                  <Users size={18} />
                </div>
                <h2 className="text-lg font-semibold text-white">Merge People</h2>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-[var(--color-text-muted)] mb-5">
              You are merging {selectedPeople.length} people into a single profile.
            </p>

            <div className="flex flex-col gap-4">
              <label className="block text-xs font-medium text-[var(--color-text-muted)]">
                Target profile name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alice"
                  className="mt-2 block w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[var(--color-primary)] transition-colors"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleMerge();
                    if (e.key === 'Escape') handleClose();
                  }}
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
                disabled={merging}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-[var(--color-text-muted)] hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={!name.trim() || merging || selectedPeople.length < 2}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary)]/90 disabled:opacity-50"
              >
                {merging ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Merging...
                  </>
                ) : (
                  'Merge'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
