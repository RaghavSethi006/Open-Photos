import React, { useMemo } from 'react';
import { GroupedVirtuoso } from 'react-virtuoso';
import { usePhotos, useTimelineGroups } from '../hooks/usePhotos';
import { useStore } from '../store/useStore';
import { Image } from '../lib/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';

export function Timeline() {
  const { data: groups, isLoading: groupsLoading } = useTimelineGroups();
  const { data: photos, fetchNextPage, hasNextPage, isFetchingNextPage } = usePhotos();
  const { setLightboxPhotoId } = useStore();

  const flattenedPhotos = useMemo(() => {
    return photos?.pages.flatMap(p => p.items) || [];
  }, [photos]);

  const groupCounts = useMemo(() => {
    if (!groups) return [];
    return groups.map(g => g.count);
  }, [groups]);

  if (groupsLoading) {
    return <div className="p-8 text-[var(--color-text-muted)]">Loading timeline...</div>;
  }

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  return (
    <div className="w-full h-full">
      <GroupedVirtuoso
        groupCounts={groupCounts}
        groupContent={(index) => {
          const group = groups?.[index];
          if (!group) return null;
          return (
            <div className="bg-[var(--color-base)]/90 backdrop-blur-md py-4 px-6 sticky top-0 z-10 border-b border-transparent">
              <h2 className="text-xl font-bold tracking-tight text-white">
                {monthNames[group.month - 1]} {group.year}
              </h2>
            </div>
          );
        }}
        itemContent={(index, groupIndex) => {
          const photo = flattenedPhotos[index];
          if (!photo) {
            // Skeleton while loading
            return (
              <div className="p-2 w-full h-48">
                <div className="w-full h-full bg-white/5 animate-pulse rounded-lg" />
              </div>
            );
          }
          
          return (
            <div className="p-1 inline-block w-1/4 h-64 align-top">
              <PhotoCard photo={photo} onClick={() => setLightboxPhotoId(photo.id)} />
            </div>
          );
        }}
        endReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        // Enable grid layout within Virtuoso
        components={{
          List: React.forwardRef(({ style, children, ...props }, ref) => (
            <div
              ref={ref}
              {...props}
              style={{
                ...style,
                display: 'flex',
                flexWrap: 'wrap',
                padding: '0 16px',
              }}
            >
              {children}
            </div>
          )),
          Item: ({ children, ...props }) => (
            <div {...props} style={{ margin: 0 }}>
              {children}
            </div>
          )
        }}
      />
    </div>
  );
}

function PhotoCard({ photo, onClick }: { photo: Image, onClick: () => void }) {
  const thumbSrc = photo.thumb_256 ? convertFileSrc(photo.thumb_256) : null;
  
  return (
    <div 
      className="w-full h-full rounded-xl overflow-hidden cursor-pointer group relative bg-white/5 border border-white/5"
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
        <div className="w-full h-full flex items-center justify-center text-xs text-[var(--color-text-muted)]">
          No thumb
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
    </div>
  );
}
