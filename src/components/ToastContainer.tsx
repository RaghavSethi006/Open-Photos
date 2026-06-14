import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore } from '../store/useToastStore';

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const colors = {
  success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  error: 'border-red-400/20 bg-red-400/10 text-red-200',
  info: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 80, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-md ${colors[toast.type]}`}
            >
              <Icon size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">{toast.message}</span>
              {toast.action && (
                <button
                  onClick={toast.action.onClick}
                  className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 transition-colors"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
