import { useState } from "react";

import { usePhotos } from "../hooks/usePhotos";
import { VirtuosoGrid } from "react-virtuoso";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Lightbox } from "./Lightbox";

export const PhotoGrid = () => {
    const { data: photos, isLoading, error } = usePhotos(10000, 0);
    const [lightbox, setLightbox] = useState<{ id: number; path: string; index: number } | null>(null);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-gray-500 dark:text-gray-400">Loading photos...</div>
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

    if (!photos || photos.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="text-6xl mb-4">📷</div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">No photos yet</h2>
                <p className="text-gray-600 dark:text-gray-400">Scan a folder to get started</p>
            </div>
        );
    }

    const handleNext = () => {
        if (lightbox && photos && lightbox.index < photos.length - 1) {
            const next = photos[lightbox.index + 1];
            setLightbox({ id: next.id, path: next.path, index: lightbox.index + 1 });
        }
    };

    const handlePrev = () => {
        if (lightbox && lightbox.index > 0 && photos) {
            const prev = photos[lightbox.index - 1];
            setLightbox({ id: prev.id, path: prev.path, index: lightbox.index - 1 });
        }
    };

    return (
        <>
            <div className="h-full p-4">
                <VirtuosoGrid
                    style={{ height: "100%" }}
                    totalCount={photos?.length || 0}
                    overscan={200}
                    components={{
                        List: ({ children, ...props }) => (
                            <div
                                {...props}
                                className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2"
                            >
                                {children}
                            </div>
                        ),
                        Item: ({ children, ...props }) => (
                            <div {...props} className="aspect-square">
                                {children}
                            </div>
                        ),
                    }}
                    itemContent={(index) => {
                        const photo = photos![index];
                        const thumbUrl =
                            convertFileSrc("", "thumb").replace("thumb://localhost/", "thumb://") + photo.id;

                        return (
                            <div
                                className="w-full h-full bg-gray-200 dark:bg-gray-800 rounded overflow-hidden cursor-pointer photo-hover"
                                onClick={() => setLightbox({ id: photo.id, path: photo.path, index })}
                            >
                                <img
                                    src={thumbUrl}
                                    alt={photo.filename}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                        e.currentTarget.src = convertFileSrc(photo.path);
                                    }}
                                />
                            </div>
                        );
                    }}
                />
            </div>

            {lightbox && (
                <Lightbox
                    imageId={lightbox.id}
                    imagePath={lightbox.path}
                    onClose={() => setLightbox(null)}
                    onNext={lightbox.index < (photos?.length || 0) - 1 ? handleNext : undefined}
                    onPrev={lightbox.index > 0 ? handlePrev : undefined}
                />
            )}
        </>
    );
};
