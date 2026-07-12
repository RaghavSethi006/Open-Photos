import { create } from 'zustand';
import {
  addFavorite as addFavoriteApi,
  removeFavorite as removeFavoriteApi,
  listFavorites as listFavoritesApi,
} from '../lib/tauri';

interface FavoritesState {
  paths: Set<string>;
  loading: boolean;
  loaded: boolean;
  loadFavorites: () => Promise<void>;
  toggle: (path: string) => Promise<void>;
  isFavorite: (path: string) => boolean;
  remove: (path: string) => Promise<void>;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  paths: new Set(),
  loading: false,
  loaded: false,

  loadFavorites: async () => {
    if (get().loaded) return;
    set({ loading: true });
    try {
      const paths = await listFavoritesApi();
      set({ paths: new Set(paths), loaded: true, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  toggle: async (path: string) => {
    const { paths } = get();
    try {
      if (paths.has(path)) {
        await removeFavoriteApi(path);
        const next = new Set(paths);
        next.delete(path);
        set({ paths: next });
      } else {
        await addFavoriteApi(path);
        const next = new Set(paths);
        next.add(path);
        set({ paths: next });
      }
    } catch {
      console.error('Failed to toggle favorite:', path);
    }
  },

  isFavorite: (path: string) => {
    return get().paths.has(path);
  },

  remove: async (path: string) => {
    try {
      await removeFavoriteApi(path);
      set((s) => {
        const next = new Set(s.paths);
        next.delete(path);
        return { paths: next };
      });
    } catch (e) {
      console.error('Failed to remove favorite:', e);
    }
  },
}));
