import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { usePhotos } from '../hooks/usePhotos';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Info, Share, Star, Trash2, Calendar, HardDrive, Maximize, MapPin } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';

export function PhotoLightbox() {
  const { lightboxPhotoId, setLightboxPhotoId } = useStore();
  const { data: photos } = usePhotos();
  const [showInfo, setShowInfo] = useState(false);

  const allPhotos = photos?.pages.flatMap(p => p.items) || [];
  const currentIndex = allPhotos.findIndex(p => p.id === lightboxPhotoId);
  const photo = allPhotos[currentIndex];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!photo) return;
      if (e.key === 'Escape') setLightboxPhotoId(null);
      if (e.key === 'ArrowRight' && currentIndex < allPhotos.length - 1) {
        setLightboxPhotoId(allPhotos[currentIndex + 1].id);
      }
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setLightboxPhotoId(allPhotos[currentIndex - 1].id);
      }
      if (e.key === 'i') {
        setShowInfo(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photo, currentIndex, allPhotos, setLightboxPhotoId]);

  if (!photo) return null;

  const imgSrc = convertFileSrc(photo.path); 
  const thumbSrc = photo.thumb_480 ? convertFileSrc(photo.thumb_480) : null;

  const formatSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`;
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return 'Unknown Date';
    return new Date(ts * 1000).toLocaleString(undefined, { 
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-3xl overflow-hidden"
      >
        <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-between px-6 z-10 titlebar-drag">
          <div className="titlebar-nodrag flex items-center gap-4">
            <button 
              onClick={() => setLightboxPhotoId(null)}
              className="p-2 rounded-full hover:bg-white/10 text-white interactive"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="titlebar-nodrag flex items-center gap-2">
            <ActionButton icon={Star} />
            <ActionButton icon={Share} />
            <ActionButton icon={Info} onClick={() => setShowInfo(!showInfo)} active={showInfo} />
            <ActionButton icon={Trash2} className="text-red-400 hover:bg-red-400/20" />
          </div>
        </div>

        <motion.div 
          key={photo.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative flex-1 h-full flex items-center justify-center p-16"
        >
          <div className="relative w-full h-full flex items-center justify-center">
            {thumbSrc && (
              <img 
                src={thumbSrc} 
                className="absolute max-w-full max-h-full object-contain filter blur-md opacity-50"
                alt="thumb"
              />
            )}
            <img 
              src={imgSrc} 
              className="relative max-w-full max-h-full object-contain drop-shadow-2xl z-10"
              alt={photo.filename}
            />
          </div>
        </motion.div>

        {/* Info Panel sliding from right */}
        <AnimatePresence>
          {showInfo && (
            <motion.div
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="w-80 h-full glass bg-[var(--color-base-elevated)]/50 border-l border-white/10 flex flex-col pt-16 z-20 shrink-0"
            >
              <div className="p-6 flex flex-col gap-8 text-sm">
                <div>
                  <h3 className="text-white font-medium text-lg mb-1">{photo.filename}</h3>
                  <p className="text-[var(--color-text-muted)] flex items-center gap-2">
                    <Calendar size={14} />
                    {formatDate(photo.date_taken)}
                  </p>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-semibold">Details</h4>
                  
                  <div className="flex items-center gap-3 text-white">
                    <HardDrive size={16} className="text-[var(--color-text-muted)]" />
                    <div className="flex flex-col">
                      <span>{formatSize(photo.size_bytes)}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">{photo.ext.toUpperCase()} file</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-white">
                    <Maximize size={16} className="text-[var(--color-text-muted)]" />
                    <div className="flex flex-col">
                      <span>{photo.width && photo.height ? `${photo.width} × ${photo.height}` : 'Unknown'}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">Dimensions</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 text-white">
                    <MapPin size={16} className="text-[var(--color-text-muted)]" />
                    <div className="flex flex-col">
                      <span>No location data</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

function ActionButton({ icon: Icon, className = '', onClick, active }: { icon: any, className?: string, onClick?: () => void, active?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={`p-2 rounded-full transition-colors interactive ${active ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white'} ${className}`}
    >
      <Icon size={18} />
    </button>
  );
}
