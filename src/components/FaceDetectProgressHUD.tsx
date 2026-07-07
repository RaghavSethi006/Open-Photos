import { useFaceScanStore } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2 } from 'lucide-react';

export function FaceDetectProgressHUD() {
  const { isScanning, scanned, total, photosWithFaces, facesFound, currentFile } = useFaceScanStore();

  const isFinished = total > 0 && scanned >= total;

  return (
    <AnimatePresence>
      {isScanning && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-[7.5rem] right-6 z-50 glass-panel rounded-2xl p-4 w-80 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isFinished ? (
                <CheckCircle2 size={18} className="text-emerald-400" />
              ) : (
                <Loader2 size={18} className="text-[var(--color-primary)] animate-spin" />
              )}
              <span className="font-semibold text-sm">
                {isFinished ? 'Face Scan Complete' : 'Scanning Faces'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>Scanned: {scanned.toLocaleString()}</span>
              <span>Faces: {facesFound.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>Photos with faces: {photosWithFaces.toLocaleString()}</span>
            </div>

            {!isFinished && total > 0 && (
              <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden mt-1 relative">
                <motion.div
                  className="absolute top-0 left-0 bottom-0 bg-[var(--color-primary)] rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${Math.min((scanned / total) * 100, 100)}%` }}
                  transition={{ ease: 'linear', duration: 0.3 }}
                />
              </div>
            )}

            {currentFile && (
              <span className="text-[10px] text-[var(--color-text-muted)]/60 truncate mt-1" title={currentFile}>
                {currentFile.split('\\').pop()?.split('/').pop()}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
