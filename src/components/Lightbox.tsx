import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Play, Pause, X, Info, ChevronLeft, ChevronRight
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { PhotoInfoPanel } from './PhotoInfoPanel';
import { PhotoFaceOverlay } from './PhotoFaceOverlay';

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

  // Keyboard controls
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === ' ' || e.key === 'Space') {
        e.preventDefault();
        setSlideshow((s) => !s);
      }
      if (e.key === 'i') setShowInfo((s) => !s);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => Math.max(0.5, Math.min(5, s + delta)));
  };

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
      setScale(2.5);
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (rect.width / 2 - e.clientX) * 0.5;
      const y = (rect.height / 2 - e.clientY) * 0.5;
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
  }, [photo?.path, scale]);

  if (!photo) return null;

  const isVideo = photo.isVideo !== undefined
    ? photo.isVideo
    : /\.(mp4|mov|mkv|avi|wmv|flv|m4v|webm)$/i.test(photo.name);

  const assetUrl = photo.src || (isTauri ? convertFileSrc(photo.path) : photo.path);

  return (
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
      {/* Top actions */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSlideshow(!slideshow);
        }}
        className={`absolute top-4 left-4 z-30 p-2 rounded-full transition-colors ${
          slideshow ? 'bg-[var(--color-primary)] text-white' : 'bg-white/10 hover:bg-white/20 text-white'
        }`}
        title={slideshow ? 'Stop slideshow' : 'Start slideshow'}
      >
        {slideshow ? <Pause size={18} /> : <Play size={18} />}
      </button>

      <button
        onClick={onClose}
        className={`absolute z-30 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all ${
          showInfo ? 'top-4 right-[19rem]' : 'top-4 right-4'
        }`}
      >
        <X size={20} />
      </button>

      {!showInfo && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowInfo(true);
          }}
          className="absolute top-4 right-16 z-30 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Photo info (I)"
        >
          <Info size={18} />
        </button>
      )}

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
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
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
    </motion.div>
  );
}
