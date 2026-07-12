import { open } from '@tauri-apps/plugin-dialog';
import {
  Palette,
  Monitor,
  FolderOpen,
  ScanLine,
  Trash2,
  Bookmark,
  RotateCcw,
  Check,
  Plus,
  X,
  Pencil,
  CheckCheck,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import { ACCENT_COLORS, useSettingsStore, type AccentColor } from '../store/useSettingsStore';
import { useSavedPathsStore } from '../store/useSavedPathsStore';
import { useStore } from '../store/useStore';
import { clusterFaces } from '../lib/tauri';
import { useToastStore } from '../store/useToastStore';

export function SettingsPage() {
  const settings = useSettingsStore();
  const { paths, addPath, removePath, renamePath } = useSavedPathsStore();

  const [editingPathId, setEditingPathId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [reclustering, setReclustering] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  const handleRecluster = async () => {
    setReclustering(true);
    try {
      await clusterFaces(settings.faceSimilarityThreshold);
      useStore.getState().bumpFaceVersion();
      addToast({
        message: 'Faces successfully re-clustered with the new threshold.',
        type: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({
        message: `Failed to re-cluster: ${msg}`,
        type: 'error',
      });
    } finally {
      setReclustering(false);
    }
  };

  const browse = async (setter: (value: string) => void) => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setter(selected);
    }
  };

  const handleAddPath = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      const name = selected.split('\\').pop()?.split('/').pop() || 'Folder';
      addPath(name, selected);
    }
  };

  const startEditing = (id: string, currentName: string) => {
    setEditingPathId(id);
    setEditingName(currentName);
  };

  const saveEditing = (id: string) => {
    if (editingName.trim()) {
      renamePath(id, editingName.trim());
    }
    setEditingPathId(null);
  };

  return (
    <div className="h-full overflow-y-auto px-8 pb-10 pt-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="glass-panel rounded-2xl p-6">
          <div className="mb-6 flex items-start justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal text-white">Settings</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                Customize your Local Google Photos experience.
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--color-primary)]/12 p-3 text-[var(--color-primary)]">
              <Monitor size={24} />
            </div>
          </div>
        </div>

        {/* Appearance */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <Palette size={18} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold text-white">Appearance</h3>
          </div>

          <div className="mb-5">
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-3">
              Accent Color
            </label>
            <div className="flex flex-wrap gap-3">
              {ACCENT_COLORS.map((accent) => {
                const active = settings.accentColor === accent.id;
                return (
                  <button
                    key={accent.id}
                    onClick={() => settings.updateSetting('accentColor', accent.id as AccentColor)}
                    className={`relative flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                      active
                        ? 'border-white/20 bg-white/10 text-white'
                        : 'border-white/10 bg-white/[0.03] text-[var(--color-text-muted)] hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-white/20"
                      style={{ backgroundColor: accent.color }}
                    />
                    {accent.label}
                    {active && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                        <Check size={10} strokeWidth={3} className="text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-2">
              Theme
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => settings.updateSetting('theme', 'dark')}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                  settings.theme === 'dark'
                    ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/15 text-white'
                    : 'border-white/10 bg-white/[0.03] text-[var(--color-text-muted)] hover:text-white'
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => settings.updateSetting('theme', 'light')}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                  settings.theme === 'light'
                    ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/15 text-white'
                    : 'border-white/10 bg-white/[0.03] text-[var(--color-text-muted)] hover:text-white'
                }`}
              >
                Light
              </button>
            </div>
          </div>
        </section>

        {/* General */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <Monitor size={18} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold text-white">General</h3>
          </div>

          <div className="grid gap-4">
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">
              Default folder
              <p className="text-[10px] text-[var(--color-text-muted)]/60 mt-0.5 mb-2">
                Auto-loads this folder when opening the Photos view.
              </p>
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <FolderOpen size={17} className="shrink-0 text-[var(--color-text-muted)]" />
                <input
                  value={settings.defaultFolder}
                  onChange={(e) => settings.updateSetting('defaultFolder', e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-white shadow-none outline-none"
                  placeholder="No folder set"
                />
                <button
                  type="button"
                  onClick={() => browse((v) => settings.updateSetting('defaultFolder', v))}
                  className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/12"
                >
                  Browse
                </button>
              </div>
            </label>

            <label className="block text-xs font-medium text-[var(--color-text-muted)]">
              Startup view
              <select
                value={settings.startupView}
                onChange={(e) => settings.updateSetting('startupView', e.target.value)}
                className="mt-2 block w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white shadow-none outline-none"
              >
                <option value="scan">Scan</option>
                <option value="timeline">Photos</option>
                <option value="duplicates">Delete Duplicates</option>
                <option value="settings">Settings</option>
              </select>
            </label>
          </div>
        </section>

        {/* Saved Paths */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bookmark size={18} className="text-[var(--color-primary)]" />
              <h3 className="text-sm font-semibold text-white">Saved Paths</h3>
            </div>
            <button
              onClick={handleAddPath}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] hover:border-white/20 hover:text-white transition-all"
            >
              <Plus size={14} />
              Add Path
            </button>
          </div>

          <p className="text-xs text-[var(--color-text-muted)]/60 mb-4">
            Saved paths appear in folder selection dropdowns across the app.
          </p>

          {paths.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-sm text-[var(--color-text-muted)]">
              No saved paths yet. Click "Add Path" to bookmark a folder.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {paths.map((sp) => (
                <div
                  key={sp.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 group"
                >
                  <Bookmark size={15} className="shrink-0 text-[var(--color-text-muted)]" />

                  {editingPathId === sp.id ? (
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-white outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditing(sp.id);
                          if (e.key === 'Escape') setEditingPathId(null);
                        }}
                      />
                      <button
                        onClick={() => saveEditing(sp.id)}
                        className="p-1 rounded text-[var(--color-primary)] hover:bg-white/10"
                      >
                        <CheckCheck size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{sp.name}</div>
                        <div className="text-[10px] text-[var(--color-text-muted)] truncate font-mono">
                          {sp.path}
                        </div>
                      </div>

                      <button
                        onClick={() => startEditing(sp.id, sp.name)}
                        className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
                        title="Rename"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => removePath(sp.id)}
                        className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-red-400 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remove"
                      >
                        <X size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Scan Defaults */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <ScanLine size={18} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold text-white">Scan Defaults</h3>
          </div>

          <div className="grid gap-5">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-2">
                Default mode
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => settings.updateSetting('defaultScanMode', 'copy')}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                    settings.defaultScanMode === 'copy'
                      ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-[var(--color-text-muted)] hover:text-white'
                  }`}
                >
                  Copy
                </button>
                <button
                  onClick={() => settings.updateSetting('defaultScanMode', 'move')}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                    settings.defaultScanMode === 'move'
                      ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-[var(--color-text-muted)] hover:text-white'
                  }`}
                >
                  Move
                </button>
              </div>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 cursor-pointer">
              <div>
                <span className="text-sm font-medium text-white">Read image EXIF dates</span>
                <p className="text-[10px] text-[var(--color-text-muted)]/60 mt-0.5">
                  Extract date from EXIF metadata when organizing files.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.defaultUseExif}
                onChange={(e) => settings.updateSetting('defaultUseExif', e.target.checked)}
                className="h-5 w-5 accent-[var(--color-primary)]"
              />
            </label>

            <label className="block text-xs font-medium text-[var(--color-text-muted)]">
              Fallback date
              <p className="text-[10px] text-[var(--color-text-muted)]/60 mt-0.5 mb-2">
                Used when no date metadata is found.
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <input
                  type="date"
                  value={settings.defaultFallbackDate}
                  onChange={(e) => settings.updateSetting('defaultFallbackDate', e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-white shadow-none outline-none"
                />
              </div>
            </label>
          </div>
        </section>

        {/* Trash */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <Trash2 size={18} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold text-white">Trash & Cleanup</h3>
          </div>

          <div className="grid gap-4">
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">
              Trash folder
              <p className="text-[10px] text-[var(--color-text-muted)]/60 mt-0.5 mb-2">
                Duplicate files are moved here instead of being permanently deleted.
              </p>
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <Trash2 size={17} className="shrink-0 text-[var(--color-text-muted)]" />
                <input
                  value={settings.trashFolder}
                  onChange={(e) => settings.updateSetting('trashFolder', e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-white shadow-none outline-none"
                  placeholder="e.g. D:\.trash"
                />
                <button
                  type="button"
                  onClick={() => browse((v) => settings.updateSetting('trashFolder', v))}
                  className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/12"
                >
                  Browse
                </button>
              </div>
            </label>

            <label className="block text-xs font-medium text-[var(--color-text-muted)]">
              Auto-delete after
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={settings.trashRetentionDays}
                  onChange={(e) =>
                    settings.updateSetting('trashRetentionDays', Math.max(1, parseInt(e.target.value) || 30))
                  }
                  className="w-20 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                />
                <span className="text-sm text-[var(--color-text-muted)]">days</span>
              </div>
            </label>
          </div>
        </section>

        {/* Face AI */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <ScanLine size={18} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold text-white">Face AI</h3>
          </div>

          <div className="grid gap-5">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-2">
                Recognition model
              </label>
              <p className="text-[10px] text-[var(--color-text-muted)]/60 mb-3">
                Small model is faster and smaller (~16 MB). Large model is more accurate (~100 MB). Models download on first use.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => settings.updateSetting('faceModelSize', 'small')}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                    settings.faceModelSize === 'small'
                      ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-[var(--color-text-muted)] hover:text-white'
                  }`}
                >
                  Small (Fast)
                </button>
                <button
                  onClick={() => settings.updateSetting('faceModelSize', 'large')}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                    settings.faceModelSize === 'large'
                      ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-[var(--color-text-muted)] hover:text-white'
                  }`}
                >
                  Large (Accurate)
                </button>
              </div>
            </div>

            <label className="block text-xs font-medium text-[var(--color-text-muted)]">
              Similarity threshold
              <p className="text-[10px] text-[var(--color-text-muted)]/60 mt-0.5 mb-2">
                Lower = more aggressive grouping (may merge different people). Higher = stricter (may split same person).
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0.3}
                  max={0.8}
                  step={0.05}
                  value={settings.faceSimilarityThreshold}
                  onChange={(e) => settings.updateSetting('faceSimilarityThreshold', parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <span className="text-sm text-white font-mono w-10 text-right">
                  {settings.faceSimilarityThreshold.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleRecluster}
                disabled={reclustering}
                className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                {reclustering ? (
                  <Loader2 size={13} className="animate-spin text-[var(--color-primary)]" />
                ) : (
                  <RefreshCw size={13} />
                )}
                {reclustering ? 'Re-clustering...' : 'Recluster Faces'}
              </button>
            </label>
          </div>
        </section>

        {/* Reset */}
        <div className="flex justify-end">
          <button
            onClick={() => {
              if (confirm('Reset all settings to defaults?')) {
                useSettingsStore.getState().resetDefaults();
              }
            }}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-[var(--color-text-muted)] hover:border-white/20 hover:text-white transition-all"
          >
            <RotateCcw size={14} />
            Reset all settings
          </button>
        </div>
      </div>
    </div>
  );
}
