import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Maximize, Aperture, Clock, Sun, Crosshair, MapPin, Info } from 'lucide-react';
import { getPhotoMetadata, type PhotoMetadata } from '../lib/tauri';

interface Props {
  path: string;
  open: boolean;
  onClose: () => void;
}

function formatDate(ts: number | null): string {
  if (!ts) return 'Unknown';
  return new Date(ts * 1000).toLocaleString();
}

export function PhotoInfoPanel({ path, open, onClose }: Props) {
  const [metadata, setMetadata] = useState<PhotoMetadata | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    setLoading(true);
    getPhotoMetadata(path)
      .then((m) => { if (!cancelled) setMetadata(m); })
      .catch(() => { if (!cancelled) setMetadata(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, open]);

  const rows: { icon: React.ReactNode; label: string; value: string }[] = [];

  if (metadata) {
    if (metadata.cameraMake || metadata.cameraModel) {
      rows.push({
        icon: <Camera size={14} />,
        label: 'Camera',
        value: [metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(' ') || 'Unknown',
      });
    }
    if (metadata.width && metadata.height) {
      rows.push({
        icon: <Maximize size={14} />,
        label: 'Dimensions',
        value: `${metadata.width} × ${metadata.height}`,
      });
    }
    if (metadata.aperture) {
      rows.push({ icon: <Aperture size={14} />, label: 'Aperture', value: metadata.aperture });
    }
    if (metadata.shutterSpeed) {
      rows.push({ icon: <Clock size={14} />, label: 'Shutter', value: metadata.shutterSpeed });
    }
    if (metadata.iso) {
      rows.push({ icon: <Sun size={14} />, label: 'ISO', value: String(metadata.iso) });
    }
    if (metadata.focalLength) {
      rows.push({ icon: <Crosshair size={14} />, label: 'Focal Length', value: metadata.focalLength });
    }
    if (metadata.dateTaken) {
      rows.push({ icon: <Clock size={14} />, label: 'Date Taken', value: formatDate(metadata.dateTaken) });
    }
    if (metadata.gpsLat && metadata.gpsLng) {
      const lat = metadata.gpsLatRef === 'S' ? -metadata.gpsLat : metadata.gpsLat;
      const lng = metadata.gpsLngRef === 'W' ? -metadata.gpsLng : metadata.gpsLng;
      rows.push({
        icon: <MapPin size={14} />,
        label: 'Location',
        value: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      });
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.15 }}
          className="absolute right-0 top-0 bottom-0 w-72 glass-panel border-l border-white/10 z-20 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Info size={14} />
              Info
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)] hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>

          <div className="px-4 py-3">
            <p className="text-xs font-mono text-[var(--color-text-muted)] truncate mb-3" title={path}>
              {path}
            </p>

            {loading && (
              <div className="flex items-center justify-center py-6">
                <div className="h-5 w-5 rounded-full border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] animate-spin" />
              </div>
            )}

            {!loading && rows.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">No metadata available for this file.</p>
            )}

            {!loading && rows.length > 0 && (
              <div className="flex flex-col gap-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="shrink-0 text-[var(--color-text-muted)]">{row.icon}</span>
                    <span className="text-[var(--color-text-muted)] w-20 shrink-0">{row.label}</span>
                    <span className="text-white truncate">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
