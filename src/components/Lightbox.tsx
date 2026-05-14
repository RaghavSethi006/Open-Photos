import { useState, useEffect } from "react";
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface LightboxProps {
    imageId: number;
    imagePath: string;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
}

export const Lightbox = ({ imageId: _imageId, imagePath, onClose, onNext, onPrev }: LightboxProps) => {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft" && onPrev) onPrev();
            if (e.key === "ArrowRight" && onNext) onNext();
            if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.5, 5));
            if (e.key === "-") setZoom((z) => Math.max(z - 0.5, 0.5));
            if (e.key === "0") {
                setZoom(1);
                setPan({ x: 0, y: 0 });
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose, onNext, onPrev]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoom > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom((z) => Math.max(0.5, Math.min(5, z + delta)));
    };

    return (
        <div
            className="fixed inset-0 bg-black z-50 flex items-center justify-center"
            onClick={onClose}
        >
            {/* Controls */}
            <div className="absolute top-4 right-4 flex gap-2 z-10">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setZoom((z) => Math.max(0.5, z - 0.5));
                    }}
                    className="bg-gray-800/80 p-2 rounded hover:bg-gray-700"
                >
                    <ZoomOut size={20} />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setZoom((z) => Math.min(5, z + 0.5));
                    }}
                    className="bg-gray-800/80 p-2 rounded hover:bg-gray-700"
                >
                    <ZoomIn size={20} />
                </button>
                <button
                    onClick={onClose}
                    className="bg-gray-800/80 p-2 rounded hover:bg-gray-700"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Navigation */}
            {onPrev && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onPrev();
                    }}
                    className="absolute left-4 bg-gray-800/80 p-2 rounded hover:bg-gray-700 z-10"
                >
                    <ChevronLeft size={32} />
                </button>
            )}
            {onNext && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onNext();
                    }}
                    className="absolute right absolute right-4 bg-gray-800/80 p-2 rounded hover:bg-gray-700 z-10"
                >
                    <ChevronRight size={32} />
                </button>
            )}

            {/* Image */}
            <div
                onClick={(e) => e.stopPropagation()}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                className="cursor-move"
                style={{
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    transition: isDragging ? "none" : "transform 0.1s",
                }}
            >
                <img
                    src={convertFileSrc(imagePath)}
                    alt="Full size"
                    className="max-w-screen max-h-screen object-contain"
                    draggable={false}
                />
            </div>

            {/* Zoom indicator */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800/80 px-3 py-1 rounded text-sm">
                {Math.round(zoom * 100)}%
            </div>
        </div>
    );
};
