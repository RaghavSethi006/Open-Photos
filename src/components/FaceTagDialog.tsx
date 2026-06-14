import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Check, Loader2 } from 'lucide-react';
import { namePerson, listPeople, type PersonInfo, isTauriRuntime } from '../lib/tauri';

interface Props {
  open: boolean;
  onClose: () => void;
  faceIds: string[];
  onNamed: () => void;
}

export function FaceTagDialog({ open, onClose, faceIds, onNamed }: Props) {
  const [name, setName] = useState('');
  const [existingPeople, setExistingPeople] = useState<PersonInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setError(null);
    if (isTauriRuntime()) {
      listPeople().then(setExistingPeople).catch(() => {});
    }
  }, [open]);

  const handleSave = async (personName: string) => {
    const finalName = personName.trim();
    if (!finalName) return;
    setSaving(true);
    setError(null);
    try {
      await namePerson(faceIds, finalName);
      onNamed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setName('');
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
                  <User size={18} />
                </div>
                <h2 className="text-lg font-semibold text-white">Name This Person</h2>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-[var(--color-text-muted)] mb-5">
              Tagging {faceIds.length} face{faceIds.length !== 1 ? 's' : ''}
            </p>

            <div className="flex flex-col gap-4">
              <label className="block text-xs font-medium text-[var(--color-text-muted)]">
                Person's name
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alice"
                    className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[var(--color-primary)] transition-colors"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave(name);
                      if (e.key === 'Escape') handleClose();
                    }}
                  />
                  <button
                    onClick={() => handleSave(name)}
                    disabled={!name.trim() || saving}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-50 transition-colors"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Check size={16} />
                    )}
                    Save
                  </button>
                </div>
              </label>

              {existingPeople.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
                    Or select existing person:
                  </p>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {existingPeople.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleSave(p.name)}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:border-white/20 hover:text-white transition-colors disabled:opacity-50"
                      >
                        <User size={12} />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-sm text-red-200">
                {error}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
