import { useEffect, useState } from 'react';
import { getPhotoFaces, type PhotoFaceInfo, isTauriRuntime } from '../lib/tauri';

interface Props {
  photoPath: string | null;
  visible: boolean;
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
}

export function PhotoFaceOverlay({
  photoPath,
  visible,
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
}: Props) {
  const [faces, setFaces] = useState<PhotoFaceInfo[]>([]);

  useEffect(() => {
    if (!photoPath || !visible || !isTauriRuntime()) {
      setFaces([]);
      return;
    }
    getPhotoFaces(photoPath)
      .then(setFaces)
      .catch(() => setFaces([]));
  }, [photoPath, visible]);

  if (!visible || faces.length === 0) return null;

  const scaleX = containerWidth / Math.max(imageWidth, 1);
  const scaleY = containerHeight / Math.max(imageHeight, 1);

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {faces.map((face) => {
        const [x1, y1, x2, y2] = face.bbox;
        const left = x1 * scaleX;
        const top = y1 * scaleY;
        const width = (x2 - x1) * scaleX;
        const height = (y2 - y1) * scaleY;

        return (
          <div
            key={face.id}
            className="absolute border-2 border-[var(--color-primary)]/70 rounded-lg bg-[var(--color-primary)]/10"
            style={{ left, top, width, height }}
            title={face.personName}
          >
            <span className="absolute -top-5 left-0 text-[10px] font-semibold text-white bg-[var(--color-primary)] px-1.5 py-0.5 rounded-t whitespace-nowrap">
              {face.personName}
            </span>
          </div>
        );
      })}
    </div>
  );
}
