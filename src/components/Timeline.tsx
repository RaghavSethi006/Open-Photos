import { useState } from "react";
import { useTimeline } from "../hooks/useTimeline";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Lightbox } from "./Lightbox";

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

export const Timeline = () => {
    const { data: timeline, isLoading, error } = useTimeline();
    const [lightbox, setLightbox] = useState<{ id: number; path: string; index: number; groupIndex: number } | null>(null);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-gray-500 dark:text-gray-400">Loading timeline...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-red-500">Error: {error.message}</div>
            </div>
        );
    }

    // Flatten photos for lightbox navigation
    const allPhotos = timeline?.flatMap(group => group.photos) || [];

    const handleNext = () => {
        if (lightbox) {
            const flatIndex = allPhotos.findIndex(p => p.id === lightbox.id);
            if (flatIndex < allPhotos.length - 1) {
                const next = allPhotos[flatIndex + 1];
                setLightbox({ ...lightbox, id: next.id, path: next.path });
            }
        }
    };

    const handlePrev = () => {
        if (lightbox) {
            const flatIndex = allPhotos.findIndex(p => p.id === lightbox.id);
            if (flatIndex > 0) {
                const prev = allPhotos[flatIndex - 1];
                setLightbox({ ...lightbox, id: prev.id, path: prev.path });
            }
        }
    };

    return (
        <>
            <div className="p-4 space-y-8 pb-20">
                {timeline?.map((group, groupIndex) => (
                    <div key={`${group.year}-${group.month}`}>
                        <div className="sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm py-4 z-20 flex items-baseline gap-3 border-b border-transparent transition-colors">
                            <h2 className="text-xl font-medium text-gray-900 dark:text-white">
                                {MONTH_NAMES[group.month - 1]} {group.year}
                            </h2>
                            <span className="text-sm text-gray-500 dark:text-gray-400 font-normal">
                                {group.count} photos
                            </span>
                        </div>

                        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1 md:gap-2 mt-2">
                            {group.photos.map((photo, photoIndex) => {
                                const thumbUrl = convertFileSrc("", "thumb").replace("thumb://localhost/", "thumb://") + photo.id;

                                return (
                                    <div
                                        key={photo.id}
                                        className="aspect-square bg-gray-200 dark:bg-gray-800 rounded overflow-hidden cursor-pointer photo-hover relative group"
                                        onClick={() => setLightbox({ id: photo.id, path: photo.path, index: photoIndex, groupIndex })}
                                    >
                                        <img
                                            src={thumbUrl}
                                            alt={photo.filename}
                                            className="w-full h-full object-cover transition-transform duration-300"
                                            loading="lazy"
                                            onError={(e) => {
                                                e.currentTarget.src = convertFileSrc(photo.path);
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {lightbox && (
                <Lightbox
                    imageId={lightbox.id}
                    imagePath={lightbox.path}
                    onClose={() => setLightbox(null)}
                    onNext={allPhotos.findIndex(p => p.id === lightbox.id) < allPhotos.length - 1 ? handleNext : undefined}
                    onPrev={allPhotos.findIndex(p => p.id === lightbox.id) > 0 ? handlePrev : undefined}
                />
            )}
        </>
    );
};
