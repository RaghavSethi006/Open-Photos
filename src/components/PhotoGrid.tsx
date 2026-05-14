import React from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { usePhotos } from '../hooks/usePhotos';
import { useStore } from '../store/useStore';
import { Image } from '../lib/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';

export function PhotoGrid() {
  const { data: photos, fetchNextPage, hasNextPage, isFetchingNextPage } = usePhotos();
  const { setLightboxPhotoId } = useStore();

  const flattenedPhotos = photos?.pages.flatMap(p => p.items) || [];

  return (
    <div className="w-full h-full px-4">
      <VirtuosoGrid
        style={{ height: '100%' }}
        totalCount={flattenedPhotos.length}
        components={{
          List: React.forwardRef(({ style, children, ...props }, ref) => (
            <div
              ref={ref}
              {...props}
              style={{
                ...style,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '8px',
                padding: '16px 0',
              }}
            >
              {children}
            </div>
          )),
        }}
        itemContent={(index) => {
          const photo = flattenedPhotos[index];
          if (!photo) return null;
          return <GridCard photo={photo} onClick={() => setLightboxPhotoId(photo.id)} />;
        }}
        endReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
      />
    </div>
  );
}

function GridCard({ photo, onClick }: { photo: Image, onClick: () => void }) {
  const thumbSrc = photo.thumb_256 ? convertFileSrc(photo.thumb_256) : null;
  
  return (
    <div 
      className="aspect-square rounded-lg overflow-hidden cursor-pointer group relative bg-white/5 border border-white/5"
      onClick={onClick}
    >
      {thumbSrc ? (
        <img 
          src={thumbSrc} 
          alt={photo.filename}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-[var(--color-text-muted)] animate-pulse">
          ...
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
    </div>
  );
}
