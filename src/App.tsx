import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { ScanProgressHUD } from './components/ScanProgressHUD';
import { ScanPage } from './components/ScanPage';
import { DuplicatesPage } from './components/DuplicatesPage';
import { PhotosPage } from './components/PhotosPage';
import { SettingsPage } from './components/SettingsPage';
import { TrashPage } from './components/TrashPage';
import { setupTauriListeners, cleanupTrashFolder } from './lib/tauri';
import { useStore } from './store/useStore';
import { useSettingsStore } from './store/useSettingsStore';

function App() {
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
            {currentView === 'map' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Map View Placeholder</div>}
            {currentView === 'albums' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Albums View Placeholder</div>}
            {currentView === 'favorites' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Favorites View Placeholder</div>}
            {currentView === 'years' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Years View Placeholder</div>}
            {currentView === 'trash' && <TrashPage />}
          </div>
        </main>
      </div>
      <ScanProgressHUD />
    </div>
  );
}

export default App;
