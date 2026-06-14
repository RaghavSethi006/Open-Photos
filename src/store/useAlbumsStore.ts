import { create } from 'zustand';
import {
  createAlbum as createAlbumApi,
  listAlbums as listAlbumsApi,
  deleteAlbum as deleteAlbumApi,
  renameAlbum as renameAlbumApi,
  addPhotosToAlbum as addPhotosApi,
  removePhotosFromAlbum as removePhotosApi,
  getAlbum as getAlbumApi,
  type Album,
} from '../lib/tauri';

interface AlbumsState {
  albums: Album[];
  loading: boolean;
  error: string | null;
  loadAlbums: () => Promise<void>;
  createAlbum: (name: string, description: string, photoPaths: string[]) => Promise<Album>;
  deleteAlbum: (id: string) => Promise<void>;
  renameAlbum: (id: string, name: string) => Promise<void>;
  addPhotos: (id: string, photoPaths: string[]) => Promise<Album>;
  removePhotos: (id: string, photoPaths: string[]) => Promise<Album>;
  getAlbum: (id: string) => Promise<Album | null>;
}

export const useAlbumsStore = create<AlbumsState>((set) => ({
  albums: [],
  loading: false,
  error: null,

  loadAlbums: async () => {
    set({ loading: true, error: null });
    try {
      const albums = await listAlbumsApi();
      set({ albums, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  createAlbum: async (name, description, photoPaths) => {
    set({ error: null });
    try {
      const album = await createAlbumApi(name, description, photoPaths);
      set((state) => ({ albums: [...state.albums, album] }));
      return album;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  deleteAlbum: async (id) => {
    set({ error: null });
    try {
      await deleteAlbumApi(id);
      set((state) => ({ albums: state.albums.filter((a) => a.id !== id) }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  renameAlbum: async (id, name) => {
    set({ error: null });
    try {
      const updated = await renameAlbumApi(id, name);
      set((state) => ({
        albums: state.albums.map((a) => (a.id === id ? updated : a)),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  addPhotos: async (id, photoPaths) => {
    set({ error: null });
    try {
      const updated = await addPhotosApi(id, photoPaths);
      set((state) => ({
        albums: state.albums.map((a) => (a.id === id ? updated : a)),
      }));
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  removePhotos: async (id, photoPaths) => {
    set({ error: null });
    try {
      const updated = await removePhotosApi(id, photoPaths);
      set((state) => ({
        albums: state.albums.map((a) => (a.id === id ? updated : a)),
      }));
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  getAlbum: async (id) => {
    try {
      return await getAlbumApi(id);
    } catch {
      return null;
    }
  },
}));
