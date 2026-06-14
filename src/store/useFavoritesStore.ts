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
  },

  isFavorite: (path: string) => {
    return get().paths.has(path);
  },
}));
