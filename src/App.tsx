import { useEffect } from 'react';
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
import { setupTauriListeners, cleanupTrashFolder } from './lib/tauri';
import { useStore } from './store/useStore';
import { useSettingsStore } from './store/useSettingsStore';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';

function App() {
  useGlobalShortcuts();
  const { currentView, setCurrentView } = useStore();
  const { accentColor, theme, startupView } = useSettingsStore();

  // Apply accent color and theme on mount and when they change
  useEffect(() => {
    document.documentElement.dataset.accent = accentColor;
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  // Apply startup view on first mount
  useEffect(() => {
    if (startupView && startupView !== 'settings') {
      setCurrentView(startupView as any);
    }
  }, []);

  // Run trash cleanup on mount
  const { trashFolder, trashRetentionDays } = useSettingsStore.getState();
  useEffect(() => {
    if (trashFolder.trim()) {
      cleanupTrashFolder(trashFolder, trashRetentionDays).catch(() => {});
    }
  }, []);

  // Setup Tauri event listeners
  useEffect(() => {
    let unlisten: () => void;
    setupTauriListeners().then((cleanup) => {
      unlisten = cleanup;
    });
    return () => {
      if (unlisten) unlisten();
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
          </div>
        </main>
      </div>
      <ScanProgressHUD />
      <ToastContainer />
    </div>
  );
}

export default App;
