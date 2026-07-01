import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const ACCENT_COLORS = [
  { id: 'purple', label: 'Purple', color: '#8b5cf6' },
  { id: 'blue', label: 'Blue', color: '#3b82f6' },
  { id: 'green', label: 'Green', color: '#22c55e' },
  { id: 'red', label: 'Red', color: '#ef4444' },
  { id: 'orange', label: 'Orange', color: '#f97316' },
  { id: 'teal', label: 'Teal', color: '#14b8a6' },
  { id: 'pink', label: 'Pink', color: '#ec4899' },
  { id: 'zinc', label: 'Zinc', color: '#a1a1aa' },
] as const;

export type AccentColor = typeof ACCENT_COLORS[number]['id'];

const DEFAULT_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp',
  '.gif', '.avif', '.mp4', '.mov', '.mkv', '.avi', '.wmv', '.flv', '.m4v', '.webm',
];

interface SettingsState {
  accentColor: AccentColor;
  theme: 'dark' | 'light';
  startupView: string;
  defaultFolder: string;
  defaultScanMode: 'copy' | 'move';
  defaultUseExif: boolean;
  defaultExtensions: string[];
  defaultFallbackDate: string;
  trashFolder: string;
  trashRetentionDays: number;
  confirmBeforeDelete: boolean;
  skipHiddenFiles: boolean;
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  resetDefaults: () => void;
}

const DEFAULTS: Omit<SettingsState, 'updateSetting' | 'resetDefaults'> = {
  accentColor: 'purple',
  theme: 'dark',
  startupView: 'scan',
  defaultFolder: '',
  defaultScanMode: 'copy',
  defaultUseExif: true,
  defaultExtensions: DEFAULT_EXTENSIONS,
  defaultFallbackDate: '2000-01-01',
  trashFolder: '',
  trashRetentionDays: 30,
  confirmBeforeDelete: true,
  skipHiddenFiles: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      updateSetting: (key, value) => set({ [key]: value }),
      resetDefaults: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'lgp-settings',
    },
  ),
);
