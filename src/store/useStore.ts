import { create } from 'zustand';

interface StoreState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;

  currentView: 'timeline' | 'grid' | 'map' | 'albums' | 'favorites' | 'years' | 'trash' | 'scan' | 'duplicates' | 'settings' | 'album-detail';
  setCurrentView: (view: StoreState['currentView']) => void;

  selectedAlbumId: string | null;
  setSelectedAlbumId: (id: string | null) => void;

  pendingFolder: string | null;
  setPendingFolder: (path: string | null) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const useStore = create<StoreState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  currentView: 'scan',
  setCurrentView: (view) => set({ currentView: view }),

  selectedAlbumId: null,
  setSelectedAlbumId: (id) => set({ selectedAlbumId: id }),

  pendingFolder: null,
  setPendingFolder: (path) => set({ pendingFolder: path }),

  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));

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
  copied: number;
  moved: number;
  skipped: number;
  renamedDuplicates: number;
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
  copied: 0,
  moved: 0,
  skipped: 0,
  renamedDuplicates: 0,
  updateProgress: (p) => set((state) => ({ ...state, ...p })),
  setScanning: (isScanning) => set({ isScanning }),
}));
