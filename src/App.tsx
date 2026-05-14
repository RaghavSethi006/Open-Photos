import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { ScanProgressHUD } from './components/ScanProgressHUD';
import { Timeline } from './components/Timeline';
import { PhotoGrid } from './components/PhotoGrid';
import { PhotoLightbox } from './components/PhotoLightbox';
import { EmptyState } from './components/EmptyState';
import { setupTauriListeners } from './lib/tauri';
import { useStore } from './store/useStore';
import { usePhotos } from './hooks/usePhotos';
import { useDebounce } from './hooks/useDebounce';

function App() {
  const { currentView, searchQuery } = useStore();
  const debouncedSearch = useDebounce(searchQuery, 150);
  const { data: photos, isLoading } = usePhotos({ search: debouncedSearch });

  const hasPhotos = photos && photos.pages.length > 0 && photos.pages[0].items.length > 0;

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
            {currentView === 'timeline' && (hasPhotos ? <Timeline /> : <EmptyState />)}
            {currentView === 'grid' && (hasPhotos ? <PhotoGrid /> : <EmptyState />)}
            {currentView === 'map' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Map View Placeholder</div>}
            {currentView === 'albums' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Albums View Placeholder</div>}
            {currentView === 'favorites' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Favorites View Placeholder</div>}
            {currentView === 'years' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Years View Placeholder</div>}
            {currentView === 'trash' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Trash View Placeholder</div>}
          </div>
        </main>
      </div>
      <ScanProgressHUD />
      <PhotoLightbox />
    </div>
  );
}

export default App;
