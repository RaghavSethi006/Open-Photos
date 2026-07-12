import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, Loader2, ChevronRight, User,
  FolderOpen, Check, Pencil, Eye, EyeOff,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useStore } from '../store/useStore';
import { useToastStore } from '../store/useToastStore';
import { useSettingsStore } from '../store/useSettingsStore';
import {
  listPeople,
  scanFaces,
  listPhotos,
  hidePerson,
  unhidePerson,
  type PersonInfo,
  isTauriRuntime,
} from '../lib/tauri';
import { FaceDetectProgressHUD } from './FaceDetectProgressHUD';
import { MergePeopleDialog } from './MergePeopleDialog';
import { RenamePersonDialog } from './RenamePersonDialog';
import { ConfirmDialog } from './ConfirmDialog';

export function PeoplePage() {
  const { setCurrentView, setSelectedPersonId, bumpFaceVersion } = useStore();
  const addToast = useToastStore((s) => s.addToast);
  const settings = useSettingsStore();
  const [people, setPeople] = useState<PersonInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Merge states
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  // Rename states
  const [renameTarget, setRenameTarget] = useState<PersonInfo | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);

  // Hide states
  const [showHidden, setShowHidden] = useState(false);
  const [hideConfirmTarget, setHideConfirmTarget] = useState<PersonInfo | null>(null);

  const { faceVersion } = useStore();

  const loadPeople = useCallback(async () => {
    if (!isTauriRuntime()) {
      setLoading(false);
      return;
    }
    try {
      const result = await listPeople(showHidden);
      setPeople(result);
    } catch {
      // face index may not exist yet
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  useEffect(() => {
    loadPeople();
  }, [loadPeople, faceVersion]);

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
      const processed = await scanFaces(
        photoPaths,
        settings.faceModelSize === 'large',
        settings.faceSimilarityThreshold,
      );
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
    if (isSelectMode) {
      setSelectedIds((prev) =>
        prev.includes(personId)
          ? prev.filter((id) => id !== personId)
          : [...prev, personId]
      );
    } else {
      setSelectedPersonId(personId);
      setCurrentView('person-detail');
    }
  };

  const handleRenameClick = (e: React.MouseEvent, person: PersonInfo) => {
    e.stopPropagation();
    setRenameTarget(person);
    setRenameDialogOpen(true);
  };

  const handleRenamed = async () => {
    setRenameDialogOpen(false);
    setRenameTarget(null);
    await loadPeople();
  };

  const handleMerged = async () => {
    setIsSelectMode(false);
    setSelectedIds([]);
    await loadPeople();
    addToast({ message: 'Profiles merged successfully.', type: 'success' });
  };

  const assignablePeople = people.filter((p) => p.id !== '__unassigned__');
  const selectedPeople = assignablePeople.filter((p) => selectedIds.includes(p.id));

  return (
    <div className="h-full overflow-y-auto px-8 pb-24 pt-4">
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
              <button
                onClick={() => setShowHidden((v) => !v)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors border ${
                  showHidden
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'border-white/10 text-[var(--color-text-muted)] hover:text-white hover:border-white/20'
                }`}
              >
                {showHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                {showHidden ? 'Hide hidden' : 'Show hidden'}
              </button>
              {assignablePeople.length > 1 && (
                <button
                  onClick={() => {
                    setIsSelectMode(!isSelectMode);
                    setSelectedIds([]);
                  }}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors border ${
                    isSelectMode
                      ? 'bg-white/10 border-white/20 text-white'
                      : 'border-white/10 text-[var(--color-text-muted)] hover:text-white hover:border-white/20'
                  }`}
                >
                  {isSelectMode ? 'Cancel Select' : 'Select to Merge'}
                </button>
              )}
              <button
                onClick={handleScanFaces}
                disabled={scanning}
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
            <button
              onClick={handleScanFaces}
              className="flex items-center gap-2 bg-[var(--color-primary)] text-white font-medium px-5 py-2.5 rounded-xl hover:bg-[var(--color-primary)]/90 interactive shadow-lg shadow-[var(--color-primary)]/20"
            >
              <FolderOpen size={16} />
              Select Folder & Scan
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assignablePeople.map((person, i) => {
              const isSelected = selectedIds.includes(person.id);
              const isHidden = person.hidden === true;
              return (
                <motion.button
                  key={person.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => handlePersonClick(person.id)}
                  className={`glass-panel rounded-2xl p-5 text-left transition-all group interactive relative ${
                    isHidden
                      ? 'opacity-40'
                      : isSelectMode && isSelected
                        ? 'border-[var(--color-primary)]/70 bg-white/[0.08] shadow-lg ring-1 ring-[var(--color-primary)]/25'
                        : 'hover:bg-white/[0.06]'
                  }`}
                >
                  {!isSelectMode && !isHidden && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setHideConfirmTarget(person); }}
                        className="absolute top-3 right-12 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-black/60 z-10"
                        title="Hide"
                      >
                        <EyeOff size={12} className="text-white" />
                      </button>
                      <button
                        onClick={(e) => handleRenameClick(e, person)}
                        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-black/60 z-10"
                        title="Rename"
                      >
                        <Pencil size={12} className="text-white" />
                      </button>
                    </>
                  )}
                  {!isSelectMode && isHidden && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await unhidePerson(person.id);
                          bumpFaceVersion();
                          addToast({ message: `"${person.name}" is now visible.`, type: 'success' });
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : String(err);
                          addToast({ message: `Failed to unhide: ${msg}`, type: 'error' });
                        }
                      }}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[var(--color-primary)]/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-[var(--color-primary)]/80 z-10"
                      title="Unhide"
                    >
                      <Eye size={12} className="text-white" />
                    </button>
                  )}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center text-[var(--color-primary)] shrink-0 overflow-hidden">
                      {(() => {
                        const thumbUrl = person.thumbnailPath
                          ? convertFileSrc(person.thumbnailPath)
                          : person.thumbnailDataUrl;
                        return thumbUrl ? (
                          <img src={thumbUrl} alt={person.name} className="w-full h-full object-cover" />
                        ) : (
                          <User size={28} strokeWidth={1.5} />
                        );
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-white truncate">{person.name}</h3>
                        {isHidden && (
                          <span className="text-[10px] font-medium text-[var(--color-text-muted)] bg-white/10 px-1.5 py-0.5 rounded">
                            Hidden
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        {person.faceCount} {person.faceCount === 1 ? 'photo' : 'photos'}
                      </p>
                    </div>
                    {isSelectMode ? (
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0 ${
                        isSelected
                          ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                          : 'border-white/20 bg-black/20 text-transparent'
                      }`}>
                        <Check size={12} strokeWidth={3} className={isSelected ? 'opacity-100' : 'opacity-0'} />
                      </div>
                    ) : (
                      <ChevronRight size={16} className="text-[var(--color-text-muted)] group-hover:text-white transition-colors shrink-0" />
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
      <FaceDetectProgressHUD />

      {/* Floating Action Bar for Merging */}
      <AnimatePresence>
        {isSelectMode && selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-black/85 backdrop-blur-md border border-white/10 rounded-2xl px-6 py-4 shadow-2xl flex items-center gap-6 min-w-[320px] max-w-[90vw]"
          >
            <span className="text-sm font-medium text-white whitespace-nowrap">
              {selectedIds.length} {selectedIds.length === 1 ? 'person' : 'people'} selected
            </span>
            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={() => {
                  setIsSelectMode(false);
                  setSelectedIds([]);
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--color-text-muted)] hover:text-white transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={() => setMergeDialogOpen(true)}
                disabled={selectedIds.length < 2}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--color-primary)] text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                Merge
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MergePeopleDialog
        open={mergeDialogOpen}
        onClose={() => setMergeDialogOpen(false)}
        selectedPeople={selectedPeople}
        onMerged={handleMerged}
      />

      <RenamePersonDialog
        open={renameDialogOpen}
        onClose={() => { setRenameDialogOpen(false); setRenameTarget(null); }}
        person={renameTarget}
        onRenamed={handleRenamed}
      />

      <ConfirmDialog
        open={hideConfirmTarget !== null}
        title={`Hide "${hideConfirmTarget?.name ?? ''}"?`}
        message={`Their photos won't be deleted — only the person cluster will be hidden. You can unhide them later by toggling "Show hidden".`}
        confirmLabel="Hide"
        danger
        onConfirm={async () => {
          if (hideConfirmTarget) {
            try {
              await hidePerson(hideConfirmTarget.id);
              bumpFaceVersion();
              addToast({ message: `"${hideConfirmTarget.name}" hidden.`, type: 'success' });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              addToast({ message: `Failed to hide: ${msg}`, type: 'error' });
            }
          }
          setHideConfirmTarget(null);
        }}
        onCancel={() => setHideConfirmTarget(null)}
      />
    </div>
  );
}
