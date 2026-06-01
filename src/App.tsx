import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { ScanProgressHUD } from './components/ScanProgressHUD';
import { EmptyState } from './components/EmptyState';
import { ScanPage } from './components/ScanPage';
import { setupTauriListeners } from './lib/tauri';
import { useStore } from './store/useStore';

function App() {
  const { currentView } = useStore();

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
            {currentView === 'timeline' && <EmptyState />}
            {currentView === 'grid' && <EmptyState />}
            {currentView === 'map' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Map View Placeholder</div>}
            {currentView === 'albums' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Albums View Placeholder</div>}
            {currentView === 'favorites' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Favorites View Placeholder</div>}
            {currentView === 'years' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Years View Placeholder</div>}
            {currentView === 'trash' && <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">Trash View Placeholder</div>}
          </div>
        </main>
      </div>
      <ScanProgressHUD />
    </div>
  );
}

export default App;
