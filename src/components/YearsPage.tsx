import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FolderOpen, Loader2, Image, Calendar } from 'lucide-react';
import { listPhotos, isTauriRuntime, type PhotoEntry } from '../lib/tauri';
import { useSettingsStore } from '../store/useSettingsStore';
import { useStore } from '../store/useStore';

export function YearsPage() {
  const { defaultFolder } = useSettingsStore();
  const { setCurrentView, setPendingFolder } = useStore();
  const [folder, setFolder] = useState('');
  const [allEntries, setAllEntries] = useState<PhotoEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPhotos = useCallback(async (dir: string) => {
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
  }, []);

  useEffect(() => {
    if (defaultFolder && !folder) {
      setFolder(defaultFolder);
      loadPhotos(defaultFolder);
    }
  }, [defaultFolder, loadPhotos]);

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

  const years = useMemo(() => {
    const map = new Map<number, PhotoEntry[]>();
    for (const e of allEntries) {
      const year = new Date(e.modifiedMs).getFullYear();
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [allEntries]);

  const handleYearClick = (_year: number) => {
    if (folder) {
      setPendingFolder(folder);
    }
    setCurrentView('timeline');
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.06] shrink-0">
        <button onClick={handleBrowse} className="flex items-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-lg shadow-[var(--color-primary)]/20">
          <FolderOpen size={16} />
          Choose Folder
        </button>
        {folder && <span className="text-[var(--color-text-muted)] text-sm truncate min-w-0 flex-1">{folder}</span>}
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-10 pt-6">
        {!folder && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5">
              <div className="w-24 h-24 rounded-3xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                <Calendar size={44} strokeWidth={1.3} />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Browse by Year</h2>
              <p className="mt-2 text-[var(--color-text-muted)] max-w-xs leading-relaxed">Open a folder to see your photos grouped by year.</p>
              <button onClick={handleBrowse} className="bg-[var(--color-primary)] hover:bg-indigo-400 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-[var(--color-primary)]/20">Choose Folder</button>
            </motion.div>
          </div>
        )}

        {loading && <div className="flex items-center justify-center h-full"><Loader2 size={36} className="animate-spin text-[var(--color-primary)]" /></div>}

        {error && <div className="m-6 rounded-xl border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm text-red-200">{error}</div>}

        {!loading && folder && years.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--color-text-muted)]">
            <Calendar size={40} strokeWidth={1.3} />
            <p className="text-sm">No photos found.</p>
          </div>
        )}

        {!loading && years.length > 0 && (
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-semibold text-white mb-6">Years</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {years.map(([year, photos]) => {
                const cover = photos[0];
                const coverSrc = isTauriRuntime() ? convertFileSrc(cover.path) : cover.path;
                return (
                  <motion.button
                    key={year}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => handleYearClick(year)}
                    className="glass-panel rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all text-left group"
                  >
                    <div className="aspect-[4/3] bg-black/40 relative overflow-hidden">
                      <img src={coverSrc} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      <div className="absolute bottom-3 left-3">
                        <div className="text-2xl font-bold text-white drop-shadow-lg">{year}</div>
                      </div>
                      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-lg">
                        <Image size={12} className="text-white/70" />
                        <span className="text-[10px] font-medium text-white/90">{photos.length}</span>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
