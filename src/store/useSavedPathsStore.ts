import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SavedPath {
  id: string;
  name: string;
  path: string;
}

interface SavedPathsState {
  paths: SavedPath[];
  addPath: (name: string, path: string) => void;
  removePath: (id: string) => void;
  renamePath: (id: string, newName: string) => void;
}

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useSavedPathsStore = create<SavedPathsState>()(
  persist(
    (set) => ({
      paths: [],
      addPath: (name, path) =>
        set((state) => ({
          paths: [...state.paths, { id: generateId(), name, path }],
        })),
      removePath: (id) =>
        set((state) => ({
          paths: state.paths.filter((p) => p.id !== id),
        })),
      renamePath: (id, newName) =>
        set((state) => ({
          paths: state.paths.map((p) => (p.id === id ? { ...p, name: newName } : p)),
        })),
    }),
    {
      name: 'lgp-saved-paths',
    },
  ),
);
