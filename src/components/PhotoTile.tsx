import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  ImageOff,
  Loader2,
  ZoomIn,
  MoreVertical,
  Check,
  Folder,
  Star,
  Eye,
  Star as StarIcon,
  Copy,
  Trash2,
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauriRuntime, type PhotoEntry } from '../lib/tauri';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { useToastStore } from '../store/useToastStore';

export interface LayoutPhoto extends PhotoEntry {
  src: string;
  displayWidth: number;
  displayHeight: number;
}

interface Props {
  photo: LayoutPhoto;
  isSelected: boolean;
  selectionMode: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onSelectClick: () => void;
  onFolderClick?: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
  onDelete?: () => void;
  gap?: number;
}

export function PhotoTile({
  photo,
  isSelected,
  selectionMode,
  onOpen,
  onToggleSelect,
  onSelectClick,
  onFolderClick,
  onToggleFavorite,
  isFavorite,
  onDelete,
  gap = 4,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addToast = useToastStore((s) => s.addToast);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const copyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(photo.path);
      addToast({ type: 'info', message: 'Path copied to clipboard' });
    } catch { /* ignore */ }
  }, [photo.path, addToast]);

  const ctxItems: ContextMenuItem[] = [
    { label: 'Open', icon: <Eye size={14} />, onClick: onOpen },
  ];
  if (onToggleFavorite) {
    ctxItems.push({
      label: isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
      icon: <StarIcon size={14} />,
      onClick: onToggleFavorite,
    });
  }
  ctxItems.push(
    { label: 'Select', icon: <Check size={14} />, onClick: onSelectClick },
    { label: 'Copy Path', icon: <Copy size={14} />, onClick: copyPath },
  );
  if (onDelete) {
    ctxItems.push(
      { label: 'Move to Trash', icon: <Trash2 size={14} />, danger: true, onClick: onDelete },
    );
  }

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  if (photo.isFolder) {
    return (
      <div
        className="relative shrink-0 rounded-xl overflow-hidden cursor-pointer group bg-white/5 border border-white/10 hover:border-white/25 transition-all"
        style={{ width: 160, height: 140 }}
        onClick={onFolderClick}
      >
        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
          <Folder size={36} className="text-[var(--color-primary)]/60" />
          <span className="text-xs font-medium text-white text-center px-2 truncate max-w-full">
            {photo.name}
          </span>
        </div>
      </div>
    );
  }

  const isPhoto = !photo.isVideo;
  const assetUrl = isTauriRuntime() ? convertFileSrc(photo.path) : photo.path;

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect();
    } else {
      onOpen();
    }
  };

  const style = {
    width: photo.displayWidth,
    height: photo.displayHeight,
    marginRight: gap,
  };

  return (
    <motion.div
      className="relative shrink-0 overflow-hidden rounded-sm cursor-pointer group bg-white/5"
      style={style}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {!loaded && !errored && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 size={20} className="text-white/20 animate-spin" />
        </div>
      )}

      {errored ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/20">
          <ImageOff size={20} />
          <span className="text-[10px]">error</span>
        </div>
      ) : !isPhoto ? (
        <div className="relative w-full h-full">
          <video
            src={assetUrl}
            className="w-full h-full object-cover"
            muted
            preload="metadata"
            onLoadedMetadata={() => setLoaded(true)}
            onError={() => setErrored(true)}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
              <Play size={18} className="text-white ml-0.5" fill="white" />
            </div>
          </div>
        </div>
      ) : (
        <img
          src={assetUrl}
          alt={photo.name}
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          draggable={false}
        />
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-150" />

      {/* Selection mode checkbox */}
      {selectionMode && (
        <div
          className={`absolute top-2 left-2 z-10 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
            isSelected
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
              : 'border-white/60 bg-black/30'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
        >
          {isSelected && <Check size={13} strokeWidth={3} className="text-white" />}
        </div>
      )}

      {/* Favorite star */}
      {onToggleFavorite && !selectionMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`absolute top-2 left-2 z-10 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:scale-110 ${
            isFavorite ? 'opacity-100 bg-amber-400/20' : 'bg-black/40'
          }`}
        >
          <Star size={12} className={isFavorite ? 'text-amber-400' : 'text-white/80'} fill={isFavorite ? '#fbbf24' : 'none'} />
        </button>
      )}

      {/* 3-dot menu - only in non-selection mode */}
      {!selectionMode && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="w-7 h-7 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-black/60"
          >
            <MoreVertical size={14} className="text-white" />
          </button>

          {showMenu && (
            <div
              ref={menuRef}
              className="absolute right-0 top-8 w-36 glass-panel rounded-xl p-1 shadow-2xl border-white/10 z-50"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onSelectClick();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-white hover:bg-white/10 transition-colors"
              >
                Select
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onOpen();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-white hover:bg-white/10 transition-colors"
              >
                Open
              </button>
            </div>
          )}
        </div>
      )}

      {/* Zoom icon on hover */}
      {!selectionMode && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
          <div className="w-7 h-7 rounded-full bg-black/40 flex items-center justify-center">
            <ZoomIn size={13} className="text-white" />
          </div>
        </div>
      )}

      {/* Selected overlay */}
      {isSelected && (
        <div className="absolute inset-0 border-2 border-[var(--color-primary)] rounded-sm pointer-events-none" />
      )}

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />
      )}
    </motion.div>
  );
}
