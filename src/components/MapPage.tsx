import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FolderOpen, Loader2, MapPin, Navigation } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { listPhotos, getPhotoMetadata, isTauriRuntime, type PhotoEntry } from '../lib/tauri';
import { useSettingsStore } from '../store/useSettingsStore';

interface GeoPhoto {
  path: string;
  name: string;
  lat: number;
  lng: number;
  src: string;
}

// Fix Leaflet default icon
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

export function MapPage() {
  const { defaultFolder } = useSettingsStore();
  const [folder, setFolder] = useState('');
  const [allEntries, setAllEntries] = useState<PhotoEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoPhotos, setGeoPhotos] = useState<GeoPhoto[]>([]);
  const [scanningGps, setScanningGps] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    if (defaultFolder && !folder) {
      setFolder(defaultFolder);
      loadPhotos(defaultFolder);
    }
  }, [defaultFolder]);

  const loadPhotos = async (dir: string) => {
    setLoading(true);
    setError(null);
    setAllEntries([]);
    try {
      const entries = await listPhotos(dir);
      setAllEntries(entries.filter((e) => !e.isFolder));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleBrowse = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setFolder(selected);
        await loadPhotos(selected);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  // Scan GPS for all photos
  useEffect(() => {
    if (allEntries.length === 0) return;
    setScanningGps(true);
    const geo: GeoPhoto[] = [];
    let done = 0;
    const batch = async () => {
      for (const entry of allEntries) {
        try {
          const meta = await getPhotoMetadata(entry.path);
          if (meta.gpsLat && meta.gpsLng) {
            const lat = meta.gpsLatRef === 'S' ? -meta.gpsLat : meta.gpsLat;
            const lng = meta.gpsLngRef === 'W' ? -meta.gpsLng : meta.gpsLng;
            geo.push({
              path: entry.path,
              name: entry.name,
              lat,
              lng,
              src: isTauriRuntime() ? convertFileSrc(entry.path) : entry.path,
            });
          }
        } catch { /* skip */ }
        done++;
        if (done % 20 === 0) setGeoPhotos([...geo]);
      }
      setGeoPhotos(geo);
      setScanningGps(false);
    };
    batch();
  }, [allEntries]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  // Update markers when geoPhotos change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    if (markersRef.current) {
      map.removeLayer(markersRef.current);
    }
    if (geoPhotos.length === 0) return;

    const markers = L.markerClusterGroup({ chunkedLoading: true });
    geoPhotos.forEach((gp) => {
      const marker = L.marker([gp.lat, gp.lng]);
      marker.bindPopup(`
        <div style="text-align:center;max-width:200px;">
          <img src="${gp.src}" style="width:100%;max-height:120px;object-fit:cover;border-radius:4px;" loading="lazy" />
          <div style="font-size:11px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${gp.name}</div>
        </div>
      `);
      markers.addLayer(marker);
    });
    map.addLayer(markers);
    markersRef.current = markers;

    if (geoPhotos.length > 0) {
      const bounds = markers.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      }
    }
  }, [geoPhotos]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.06] shrink-0">
        <button onClick={handleBrowse} className="flex items-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-lg shadow-[var(--color-primary)]/20">
          <FolderOpen size={16} />
          Choose Folder
        </button>
        {folder && <span className="text-[var(--color-text-muted)] text-sm truncate min-w-0 flex-1">{folder}</span>}
        {geoPhotos.length > 0 && (
          <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
            <MapPin size={12} className="inline" /> {geoPhotos.length} geotagged
          </span>
        )}
      </div>

      <div className="flex-1 relative">
        {!folder && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center px-8">
            <div className="w-24 h-24 rounded-3xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
              <Navigation size={44} strokeWidth={1.3} />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Map View</h2>
            <p className="mt-2 text-[var(--color-text-muted)] max-w-xs leading-relaxed">Open a folder to see geotagged photos on the map.</p>
            <button onClick={handleBrowse} className="bg-[var(--color-primary)] hover:bg-indigo-400 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-[var(--color-primary)]/20">Choose Folder</button>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--color-text-muted)]">
            <Loader2 size={36} className="animate-spin text-[var(--color-primary)]" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm text-red-200">{error}</div>
          </div>
        )}

        {folder && !loading && allEntries.length > 0 && scanningGps && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-black/70 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            Reading GPS data from {allEntries.length} photos...
          </div>
        )}

        {folder && !loading && geoPhotos.length === 0 && !scanningGps && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
            <MapPin size={40} strokeWidth={1.3} />
            <p className="text-sm">No geotagged photos found.</p>
          </div>
        )}

        <div ref={mapRef} className="absolute inset-0 z-0" style={{ background: '#1a1a2e' }} />
      </div>
    </div>
  );
}
