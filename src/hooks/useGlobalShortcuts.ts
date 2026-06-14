import { useEffect } from 'react';
import { useStore } from '../store/useStore';

export function useGlobalShortcuts() {
  const { searchQuery, setSearchQuery, currentView, setCurrentView } = useStore();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      switch (e.key) {
        case '/':
          e.preventDefault();
          const search = document.querySelector<HTMLInputElement>('input[type="text"][placeholder*="Search"]');
          search?.focus();
          break;
        case 'Escape':
          setSearchQuery('');
          break;
        case '1':
          setCurrentView('timeline');
          break;
        case '2':
          setCurrentView('albums');
          break;
        case '3':
          setCurrentView('favorites');
          break;
        case '4':
          setCurrentView('scan');
          break;
        case '5':
          setCurrentView('settings');
          break;
        case 't':
          setCurrentView('trash');
          break;
        case 'd':
          setCurrentView('duplicates');
          break;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchQuery, setSearchQuery, currentView, setCurrentView]);
}
