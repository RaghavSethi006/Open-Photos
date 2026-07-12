import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Play, Pause, X, Info, ChevronLeft, ChevronRight, Star, Trash2, Copy, FolderInput
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { PhotoInfoPanel } from './PhotoInfoPanel';
import { PhotoFaceOverlay } from './PhotoFaceOverlay';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { useToastStore } from '../store/useToastStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { moveFilesToTrash, moveFile } from '../lib/tauri';
import { open } from '@tauri-apps/plugin-dialog';

export interface LightboxPhoto {
  path: string;
  name: string;
  src?: string;
  isVideo?: boolean;
  sizeBytes?: number;
  modifiedMs?: number;
}

interface Props {
  photos: LightboxPhoto[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function Lightbox({ photos, index, onClose, onPrev, onNext }: Props) {
  const photo = photos[index];
  const [showInfo, setShowInfo] = useState(false);

  // Zoom & Pan
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Slideshow
  const [slideshow, setSlideshow] = useState(false);
  const slideshowRef = useRef<number | null>(null);

  // Face Bounding Box Dims
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [containerDims, setContainerDims] = useState<{ width: number; height: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);

  const { paths: favPaths, toggle: toggleFavorite, loadFavorites } = useFavoritesStore();
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    setShowInfo(false);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setDimensions(null);
    setContainerDims(null);
  }, [index]);

  // Slideshow auto-advance
  useEffect(() => {
    if (!slideshow) {
      if (slideshowRef.current) {
        clearInterval(slideshowRef.current);
        slideshowRef.current = null;
      }
      return;
    }
    slideshowRef.current = window.setInterval(() => {
      if (index < photos.length - 1) {
        onNext();
      } else {
        setSlideshow(false);
      }
    }, 3000);
    return () => {
      if (slideshowRef.current) {
        clearInterval(slideshowRef.current);
        slideshowRef.current = null;
      }
    };
  }, [slideshow, index, photos.length, onNext]);

  // Keyboard controls — use refs to avoid re-registration when callbacks change
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onPrevRef = useRef(onPrev);
  onPrevRef.current = onPrev;
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'ArrowLeft') onPrevRef.current();
      if (e.key === 'ArrowRight') onNextRef.current();
      if (e.key === ' ' || e.key === 'Space') {
        e.preventDefault();
        setSlideshow((s) => !s);
      }
      if (e.key === 'i') setShowInfo((s) => !s);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Native non-passive wheel listener for zoom (React's onWheel is passive by default)
  useEffect(() => {
    const el = zoomContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((s) => Math.max(0.5, Math.min(5, s + delta)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setPosition({ x: dx, y: dy });
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale > 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      const zoomScale = 2.5;
      setScale(zoomScale);
      const rect = e.currentTarget.getBoundingClientRect();
      // Offset relative to element center so the clicked point stays centered
      const x = (rect.width / 2 - (e.clientX - rect.left)) * (zoomScale - 1);
      const y = (rect.height / 2 - (e.clientY - rect.top)) * (zoomScale - 1);
      setPosition({ x, y });
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setContainerDims({ width: img.clientWidth, height: img.clientHeight });
  };

  useEffect(() => {
    if (!imgRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerDims({
        width: entry.target.clientWidth,
        height: entry.target.clientHeight,
      });
    });
    ro.observe(imgRef.current);
    return () => ro.disconnect();
  }, [photo?.path]);

  if (!photo) return null;

  const isFav = favPaths.has(photo.path);

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(photo.path);
      addToast({ type: 'info', message: 'Path copied to clipboard' });
    } catch { /* ignore */ }
  };

  const handleToggleFavorite = async () => {
    await toggleFavorite(photo.path);
  };

  const handleDelete = async () => {
    const tf = useSettingsStore.getState().trashFolder;
    if (!tf.trim()) {
      addToast({ type: 'error', message: 'Please set a Trash folder in Settings first.' });
      return;
    }
    try {
      await moveFilesToTrash([photo.path], tf);
      addToast({ type: 'success', message: 'Moved to trash' });
      onClose();
    } catch (err) {
      addToast({ type: 'error', message: String(err) });
    }
  };

  const handleMove = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select destination folder',
      });
      if (!selected) return;
      await moveFile(photo.path, selected);
      addToast({ type: 'success', message: 'File moved' });
      onClose();
    } catch (err) {
      addToast({ type: 'error', message: String(err) });
    }
  };

  const isVideo = photo.isVideo !== undefined
    ? photo.isVideo
    : /\.(mp4|mov|mkv|avi|wmv|flv|m4v|webm)$/i.test(photo.name);

  const assetUrl = photo.src || (isTauri ? convertFileSrc(photo.path) : photo.path);

  return createPortal(
    <motion.div
      key="lightbox"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-sm"
      onClick={onClose}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      {/* Top bar - Close */}
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-30 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        title="Close (Esc)"
      >
        <X size={20} />
      </button>

      {/* Top bar - Actions */}
      <div
        className={`absolute top-4 z-30 flex items-center gap-1.5 transition-all ${
          showInfo ? 'right-[19rem]' : 'right-4'
        }`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); handleCopyPath(); }}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Copy path"
        >
          <Copy size={16} />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); handleToggleFavorite(); }}
          className={`p-2 rounded-full transition-colors ${
            isFav ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star size={16} className={isFav ? 'fill-yellow-400' : ''} />
        </button>

        {isTauri && (
          <button
            onClick={(e) => { e.stopPropagation(); handleMove(); }}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Move to folder"
          >
            <FolderInput size={16} />
          </button>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          className="p-2 rounded-full bg-white/10 hover:bg-red-500/30 text-white hover:text-red-400 transition-colors"
          title="Move to trash"
        >
          <Trash2 size={16} />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setShowInfo((s) => !s); }}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Photo info (I)"
        >
          <Info size={16} />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setSlideshow(!slideshow); }}
          className={`p-2 rounded-full transition-colors ${
            slideshow ? 'bg-[var(--color-primary)] text-white' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title={slideshow ? 'Stop slideshow' : 'Start slideshow'}
        >
          {slideshow ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>

      {/* Bottom bar */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 px-6 py-4 bg-gradient-to-t from-black/70 to-transparent"
        style={{ pointerEvents: 'none' }}
      >
        <p className="text-white font-medium text-sm truncate">{photo.name}</p>
        <p className="text-white/50 text-xs mt-0.5">
          {[
            photo.sizeBytes !== undefined && photo.sizeBytes !== null && formatFileSize(photo.sizeBytes),
            photo.modifiedMs !== undefined && photo.modifiedMs !== null && new Date(photo.modifiedMs).toLocaleString()
          ].filter(Boolean).join(' · ')}
          {scale !== 1 && <span className="ml-2">· {Math.round(scale * 100)}%</span>}
        </p>
      </div>

      {/* Nav */}
      {index > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="absolute left-4 z-30 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className={`absolute z-30 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all ${
            showInfo ? 'right-[19rem]' : 'right-4'
          }`}
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* Image/Video with zoom & pan */}
      <div
        ref={zoomContainerRef}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className={`overflow-hidden select-none transition-all ${
          showInfo ? 'max-w-[calc(90vw-18rem)]' : 'max-w-[90vw]'
        } max-h-[85vh] relative flex items-center justify-center`}
        style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {isVideo ? (
          <video
            src={assetUrl}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded-lg animate-fade-in"
            style={{ objectFit: 'contain' }}
          />
        ) : (
          <div
            className="relative inline-block"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'center',
            }}
          >
            <img
              ref={imgRef}
              src={assetUrl}
              alt={photo.name}
              onLoad={handleImageLoad}
              className="rounded-lg object-contain transition-transform duration-100 max-w-full max-h-[85vh]"
              draggable={false}
            />
            {dimensions && containerDims && (
              <PhotoFaceOverlay
                photoPath={photo.path}
                visible={true}
                imageWidth={dimensions.width}
                imageHeight={dimensions.height}
                containerWidth={containerDims.width}
                containerHeight={containerDims.height}
              />
            )}
          </div>
        )}
      </div>

      {/* Counter */}
      <div className="absolute bottom-[3.5rem] left-1/2 -translate-x-1/2 bg-black/50 text-white/70 text-xs px-3 py-1.5 rounded-full">
        {index + 1} / {photos.length}
        {slideshow && <span className="ml-2 text-[var(--color-primary)]">●</span>}
      </div>

      <PhotoInfoPanel path={photo.path} open={showInfo} onClose={() => setShowInfo(false)} />
    </motion.div>,
    document.body
  );
}
