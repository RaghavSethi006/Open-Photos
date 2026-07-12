import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
      };
      document.addEventListener('keydown', handler);
      confirmRef.current?.focus();
      return () => document.removeEventListener('keydown', handler);
    }
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
          >
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-full shrink-0 ${danger ? 'bg-red-500/10 text-red-400' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'}`}>
                <AlertTriangle size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{message}</p>
              </div>
              <button onClick={onCancel} className="p-1 text-[var(--color-text-muted)] hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--color-text-muted)] hover:text-white border border-white/10 hover:bg-white/5 transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmRef}
                onClick={onConfirm}
                className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors ${
                  danger
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
