import { useProgressStore } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2 } from 'lucide-react';

export function ScanProgressHUD() {
  const { isScanning, scanned, found, phase, estimated_remaining_ms } = useProgressStore();

  const formatTime = (ms: number | null) => {
    if (ms === null) return 'Estimating...';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s left`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s left`;
  };

  return (
    <AnimatePresence>
      {isScanning && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-6 right-6 z-50 glass-panel rounded-2xl p-4 w-72 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {phase === 'Done' ? (
                <CheckCircle2 size={18} className="text-emerald-400" />
              ) : (
                <Loader2 size={18} className="text-[var(--color-primary)] animate-spin" />
              )}
              <span className="font-semibold text-sm">
                {phase === 'Done' ? 'Scan Complete' : 'Scanning Library'}
              </span>
            </div>
            {phase !== 'Done' && (
              <span className="text-xs text-[var(--color-text-muted)] font-medium">
                {formatTime(estimated_remaining_ms)}
              </span>
            )}
          </div>
          
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>Scanned: {scanned.toLocaleString()}</span>
              <span>Found: {found.toLocaleString()}</span>
            </div>
            
            {phase !== 'Done' && (
              <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden mt-1 relative">
                <motion.div 
                  className="absolute top-0 left-0 bottom-0 bg-[var(--color-primary)] rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ 
                    width: scanned > 0 ? `${Math.min((found / Math.max(scanned, 1)) * 100, 100)}%` : "0%",
                  }}
                  transition={{ ease: "linear", duration: 0.5 }}
                  // In a real scenario we'd base this on total files if known, 
                  // but for a raw walk we use an indeterminate or ratio progress
                />
              </div>
            )}
            <span className="text-[10px] text-[var(--color-text-muted)]/60 text-right mt-1">
              Phase: {phase}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
