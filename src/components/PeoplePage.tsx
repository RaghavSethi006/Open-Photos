import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, UserPlus, ScanFace, Loader2, ChevronRight, User } from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  listPeople,
  checkFaceModels,
  scanFaces,
  type PersonInfo,
  isTauriRuntime,
} from '../lib/tauri';
import { FaceDetectProgressHUD } from './FaceDetectProgressHUD';

export function PeoplePage() {
  const { setCurrentView, setSelectedPersonId } = useStore();
  const [people, setPeople] = useState<PersonInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelsReady, setModelsReady] = useState(false);
  const [scanning, setScanning] = useState(false);

  const loadPeople = useCallback(async () => {
    if (!isTauriRuntime()) {
      setLoading(false);
      return;
    }
    try {
      const result = await listPeople();
      setPeople(result);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      if (!isTauriRuntime()) return;
      try {
        await checkFaceModels();
        setModelsReady(true);
      } catch {
        setModelsReady(false);
      }
    };
    init();
    loadPeople();
  }, [loadPeople]);

  const handleScanFaces = async () => {
    if (scanning || !isTauriRuntime()) return;
    setScanning(true);
    try {
      setScanning(true);
      await scanFaces([], false);
      await loadPeople();
    } catch (err) {
      console.error('Face scan failed:', err);
    } finally {
      setScanning(false);
    }
  };

  const handlePersonClick = (personId: string) => {
    setSelectedPersonId(personId);
    setCurrentView('person-detail');
  };

  return (
    <div className="h-full overflow-y-auto px-8 pb-10 pt-4">
      <div className="mx-auto max-w-6xl">
        <div className="glass-panel rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-[var(--color-primary)]/12 p-3 text-[var(--color-primary)]">
                <Users size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-normal text-white">People</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                  Detect and tag faces in your photo library. All processing is done locally — nothing leaves your device.
                </p>
              </div>
            </div>
            <button
              onClick={handleScanFaces}
              disabled={scanning || !modelsReady}
              className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50"
            >
              {scanning ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ScanFace size={16} />
              )}
              {scanning ? 'Scanning...' : 'Scan Faces'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : people.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
              <UserPlus size={40} strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-semibold text-white">No People Found Yet</h3>
            <p className="text-sm text-[var(--color-text-muted)] max-w-md">
              Click "Scan Faces" to analyze your photos. The AI will detect faces, group them by person, and let you name each one.
            </p>
            {!modelsReady && (
              <p className="text-xs text-amber-400">
                Face detection models need to be downloaded on first use. This may take a moment.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {people.map((person, i) => (
              <motion.button
                key={person.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => handlePersonClick(person.id)}
                className="glass-panel rounded-2xl p-5 text-left hover:bg-white/[0.06] transition-colors group interactive"
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center text-[var(--color-primary)] shrink-0 overflow-hidden">
                    <User size={28} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-white truncate">{person.name}</h3>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {person.faceCount} {person.faceCount === 1 ? 'photo' : 'photos'}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-[var(--color-text-muted)] group-hover:text-white transition-colors shrink-0" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
      <FaceDetectProgressHUD />
    </div>
  );
}
