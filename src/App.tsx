import { useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { ScanProgressHUD } from './components/ScanProgressHUD';
import { ToastContainer } from './components/ToastContainer';
import { ScanPage } from './components/ScanPage';
import { DuplicatesPage } from './components/DuplicatesPage';
import { PhotosPage } from './components/PhotosPage';
import { SettingsPage } from './components/SettingsPage';
import { TrashPage } from './components/TrashPage';
import { AlbumsPage } from './components/AlbumsPage';
import { AlbumDetailPage } from './components/AlbumDetailPage';
import { FavoritesPage } from './components/FavoritesPage';
import { YearsPage } from './components/YearsPage';
import { MapPage } from './components/MapPage';
import { PeoplePage } from './components/PeoplePage';
import { PersonDetailPage } from './components/PersonDetailPage';
import { setupTauriListeners, cleanupTrashFolder } from './lib/tauri';
import { useStore } from './store/useStore';
import { useSettingsStore } from './store/useSettingsStore';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';

function App() {
  useGlobalShortcuts();
  const { currentView, setCurrentView } = useStore();
  const { accentColor, theme } = useSettingsStore();

  // Apply accent color and theme on mount and when they change
  useEffect(() => {
    document.documentElement.dataset.accent = accentColor;
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // Apply startup view on mount only — reading from store directly to avoid re-running on setting change
  const startupDone = useRef(false);
  useEffect(() => {
    if (startupDone.current) return;
    startupDone.current = true;
    const sv = useSettingsStore.getState().startupView;
    if (sv) {
      setCurrentView(sv as any);
    }
  }, [setCurrentView]);

  // Run trash cleanup on mount — defer via requestIdleCallback so initial render is not blocked
  useEffect(() => {
    const { trashFolder, trashRetentionDays } = useSettingsStore.getState();
    if (trashFolder.trim()) {
      const work = () => {
        cleanupTrashFolder(trashFolder, trashRetentionDays).catch(() => {});
      };
      if ('requestIdleCallback' in window) {
        const id = requestIdleCallback(work, { timeout: 5000 });
        return () => cancelIdleCallback(id);
      } else {
        setTimeout(work, 2000);
      }
    }
  }, []);

  // Setup Tauri event listeners
  const unlistenRef = useRef<() => void>(undefined);
  useEffect(() => {
    let cancelled = false;
    let cleanupFn: (() => void) | undefined;

    setupTauriListeners().then((cleanup) => {
      if (cancelled) {
        cleanup();
      } else {
        cleanupFn = cleanup;
        unlistenRef.current = cleanup;
      }
    });

    return () => {
      cancelled = true;
      cleanupFn?.();
      unlistenRef.current = undefined;
    };
  }, []);

  return (
    <div className="flex h-screen w-screen bg-[var(--color-base)] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Topbar />
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden relative z-0">
          <div className="absolute inset-0">
            {currentView === 'scan' && <ScanPage />}
            {currentView === 'duplicates' && <DuplicatesPage />}
            {currentView === 'settings' && <SettingsPage />}
            {currentView === 'timeline' && <PhotosPage />}
            {currentView === 'grid' && <PhotosPage />}
            {currentView === 'map' && <MapPage />}
            {currentView === 'albums' && <AlbumsPage />}
            {currentView === 'album-detail' && <AlbumDetailPage />}
            {currentView === 'favorites' && <FavoritesPage />}
            {currentView === 'years' && <YearsPage />}
            {currentView === 'trash' && <TrashPage />}
            {currentView === 'people' && <PeoplePage />}
            {currentView === 'person-detail' && <PersonDetailPage />}
          </div>
        </main>
      </div>
      <ScanProgressHUD />
      <ToastContainer />
    </div>
  );
}

export default App;
