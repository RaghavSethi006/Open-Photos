import { useState, useEffect } from 'react';
import { getThumbnailPath, isTauriRuntime } from '../lib/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';

export function useThumbnail(path: string, maxDim = 320): string | null {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    getThumbnailPath(path, maxDim)
      .then((thumbPath) => {
        if (!cancelled) setThumb(convertFileSrc(thumbPath));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [path, maxDim]);

  return thumb;
}
