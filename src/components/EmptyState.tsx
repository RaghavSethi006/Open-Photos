import { ImagePlus } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';

export function EmptyState() {
  const { setCurrentView } = useStore();

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full flex flex-col items-center text-center gap-6"
      >
        <div className="w-24 h-24 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
          <ImagePlus size={48} strokeWidth={1.5} />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-white">Your Library is Empty</h2>
          <p className="text-[var(--color-text-muted)] leading-relaxed">
            Local Google Photos is a private, blazing fast photo manager. Add your first folder of photos to get started.
          </p>
        </div>

        <button 
          onClick={() => setCurrentView('scan')}
          className="bg-[var(--color-primary)] text-white font-medium px-6 py-3 rounded-xl hover:bg-indigo-400 interactive shadow-lg shadow-[var(--color-primary)]/20"
        >
          Open Scan Tool
        </button>
      </motion.div>
    </div>
  );
}
