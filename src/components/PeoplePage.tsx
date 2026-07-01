import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, UserPlus,   Loader2, ChevronRight, User,
  FolderOpen, AlertCircle, RefreshCw,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useStore } from '../store/useStore';
import { useToastStore } from '../store/useToastStore';
import {
  listPeople,
  checkFaceModels,
  scanFaces,
  listPhotos,
  type PersonInfo,
  isTauriRuntime,
} from '../lib/tauri';
import { FaceDetectProgressHUD } from './FaceDetectProgressHUD';

export function PeoplePage() {
  const { setCurrentView, setSelectedPersonId } = useStore();
  const addToast = useToastStore((s) => s.addToast);
  const [people, setPeople] = useState<PersonInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelsReady, setModelsReady] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
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
      // face index may not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  const initModels = useCallback(async () => {
    if (!isTauriRuntime()) return;
    setModelsLoading(true);
    setModelError(null);
    try {
      await checkFaceModels();
      setModelsReady(true);
      setModelError(null);
    } catch (err) {
      setModelsReady(false);
      setModelError(err instanceof Error ? err.message : String(err));
      addToast({ message: 'Face AI models failed to download. Check your internet connection.', type: 'error' });
    } finally {
      setModelsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    initModels();
    loadPeople();
  }, [initModels, loadPeople]);

  const handleScanFaces = async () => {
    if (scanning || !isTauriRuntime()) return;

    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;

    setScanning(true);
    try {
      const entries = await listPhotos(selected);
      const photoPaths = entries
        .filter((e) => !e.isFolder)
        .map((e) => e.path);

      if (photoPaths.length === 0) {
        addToast({ message: 'No photos found in the selected folder.', type: 'info' });
        setScanning(false);
        return;
      }

      addToast({ message: `Scanning ${photoPaths.length} photos for faces...`, type: 'info' });
      const processed = await scanFaces(photoPaths, false);
      await loadPeople();
      addToast({ message: `Face scan complete. Found faces in ${processed.length} of ${photoPaths.length} photos.`, type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ message: `Face scan failed: ${msg}`, type: 'error' });
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
            <div className="flex items-center gap-3">
              {modelError && (
                <button
                  onClick={initModels}
                  disabled={modelsLoading}
                  className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition-colors"
                >
                  {modelsLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Retry Download
                </button>
              )}
              <button
                onClick={handleScanFaces}
                disabled={scanning || !modelsReady}
                className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50"
              >
                {scanning ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FolderOpen size={16} />
                )}
                {scanning ? 'Scanning...' : 'Scan Folder'}
              </button>
            </div>
          </div>

          {modelError && (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 flex items-start gap-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
              <div className="text-sm text-red-200">
                <p className="font-semibold mb-0.5">Model download failed</p>
                <p className="text-red-300/80">{modelError}</p>
              </div>
            </div>
          )}

          {modelsLoading && !modelsReady && (
            <div className="mt-4 rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-4 py-3 flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />
              <span className="text-sm text-[var(--color-text-muted)]">
                Downloading face AI models (~16 MB). This may take a moment...
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : people.length === 0 || (people.length === 1 && people[0].id === '__unassigned__' && people[0].faceCount === 0) ? (
          <div className="glass-panel rounded-2xl p-12 flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
              <UserPlus size={40} strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-semibold text-white">No People Found Yet</h3>
            <p className="text-sm text-[var(--color-text-muted)] max-w-md">
              Click "Scan Folder" to select a photo folder. The AI will detect faces, group them by person, and let you name each one.
            </p>
            {!modelsReady && !modelError && (
              <p className="text-xs text-[var(--color-text-muted)]/60">
                Initializing face detection models...
              </p>
            )}
            {modelsReady && (
              <button
                onClick={handleScanFaces}
                className="flex items-center gap-2 bg-[var(--color-primary)] text-white font-medium px-5 py-2.5 rounded-xl hover:bg-[var(--color-primary)]/90 interactive shadow-lg shadow-[var(--color-primary)]/20"
              >
                <FolderOpen size={16} />
                Select Folder & Scan
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {people.filter((p) => p.id !== '__unassigned__').map((person, i) => (
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
                    {person.thumbnailDataUrl ? (
                      <img src={person.thumbnailDataUrl} alt={person.name} className="w-full h-full object-cover" />
                    ) : (
                      <User size={28} strokeWidth={1.5} />
                    )}
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
