import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Loader2 } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useStore } from '../store/useStore';
import { getPersonPhotos, listPeople, type PersonInfo, isTauriRuntime } from '../lib/tauri';

interface DisplayPhoto {
  path: string;
  name: string;
  width: number;
  height: number;
  aspect: number;
}

export function PersonDetailPage() {
  const { selectedPersonId, setCurrentView } = useStore();
  const [person, setPerson] = useState<PersonInfo | null>(null);
  const [photos, setPhotos] = useState<DisplayPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedPersonId || !isTauriRuntime()) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const people = await listPeople();
        const found = people.find((p: PersonInfo) => p.id === selectedPersonId);
        setPerson(found || null);

        const paths = await getPersonPhotos(selectedPersonId);
        const displayPhotos: DisplayPhoto[] = paths.map((p: string) => {
          const name = p.split('\\').pop()?.split('/').pop() || p;
          return { path: p, name, width: 300, height: 200, aspect: 4 / 3 };
        });
        setPhotos(displayPhotos);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedPersonId]);

  const handleBack = () => {
    setCurrentView('people');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 pb-10 pt-4">
      <div className="mx-auto max-w-6xl">
        <div className="glass-panel rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 rounded-xl hover:bg-white/10 text-[var(--color-text-muted)] hover:text-white transition-colors interactive"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="w-14 h-14 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center text-[var(--color-primary)]">
              <User size={24} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-normal text-white">{person?.name || 'Unknown Person'}</h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
              </p>
            </div>
          </div>
        </div>

        {photos.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 flex flex-col items-center text-center gap-4">
            <p className="text-[var(--color-text-muted)]">No photos found for this person.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {photos.map((photo, i) => (
              <motion.div
                key={photo.path}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="glass-panel rounded-xl overflow-hidden group cursor-pointer interactive hover:bg-white/[0.06] transition-colors"
              >
                <div className="aspect-[4/3] bg-black/40 relative overflow-hidden">
                  <img
                    src={convertFileSrc(photo.path)}
                    alt={photo.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="px-3 py-2">
                  <p className="text-xs text-[var(--color-text-muted)] truncate" title={photo.name}>
                    {photo.name}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
