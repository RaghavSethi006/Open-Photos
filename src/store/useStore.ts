import { create } from 'zustand';

interface StoreState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  
  currentView: 'timeline' | 'grid' | 'map' | 'albums' | 'favorites' | 'years' | 'trash';
  setCurrentView: (view: 'timeline' | 'grid' | 'map' | 'albums' | 'favorites' | 'years' | 'trash') => void;
  
  selectedPhotos: Set<number>;
  togglePhotoSelection: (id: number) => void;
  clearSelection: () => void;
  
  lightboxPhotoId: number | null;
  setLightboxPhotoId: (id: number | null) => void;
  
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const useStore = create<StoreState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  
  currentView: 'timeline',
  setCurrentView: (view) => set({ currentView: view }),
  
  selectedPhotos: new Set(),
  togglePhotoSelection: (id) => set((state) => {
    const newSet = new Set(state.selectedPhotos);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    return { selectedPhotos: newSet };
  }),
  clearSelection: () => set({ selectedPhotos: new Set() }),
  
  lightboxPhotoId: null,
  setLightboxPhotoId: (id) => set({ lightboxPhotoId: id }),
  
  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));

// Progress store separate for performance (frequent updates)
interface ProgressState {
  isScanning: boolean;
  scanned: number;
  found: number;
  indexed: number;
  thumbnails_done: number;
  current_dir: string;
  elapsed_ms: number;
  estimated_remaining_ms: number | null;
  phase: string;
  updateProgress: (progress: Partial<ProgressState>) => void;
  setScanning: (isScanning: boolean) => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  isScanning: false,
  scanned: 0,
  found: 0,
  indexed: 0,
  thumbnails_done: 0,
  current_dir: '',
  elapsed_ms: 0,
  estimated_remaining_ms: null,
  phase: 'Idle',
  updateProgress: (p) => set((state) => ({ ...state, ...p })),
  setScanning: (isScanning) => set({ isScanning }),
}));
