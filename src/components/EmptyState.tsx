import { open } from '@tauri-apps/plugin-dialog';
import { startScan } from '../lib/tauri';
import { ImagePlus } from 'lucide-react';
import { motion } from 'framer-motion';

export function EmptyState() {
  const handleAddFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        await startScan(selected);
      }
    } catch (e) {
      console.error("Failed to open dialog or start scan:", e);
    }
  };

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
          onClick={handleAddFolder}
          className="bg-[var(--color-primary)] text-white font-medium px-6 py-3 rounded-xl hover:bg-indigo-400 interactive shadow-lg shadow-[var(--color-primary)]/20"
        >
          Add Your Photos
        </button>
      </motion.div>
    </div>
  );
}
