import { useState, useEffect, useRef } from 'react';
import { Search, LayoutGrid, LayoutList, Map as MapIcon, ArrowDownUp, Check } from 'lucide-react';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';

const sortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'largest', label: 'Largest first' },
] as const;

export function Topbar() {
  const { currentView, setCurrentView, searchQuery, setSearchQuery, sortBy, setSortBy } = useStore();
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortOpen]);

  if (currentView === 'scan') {
    return (
      <div className="h-14 flex items-center justify-between px-6 shrink-0 relative z-10 titlebar-drag">
        <div className="titlebar-nodrag">
          <h1 className="text-sm font-semibold text-white text-left">Scan</h1>
        </div>
      </div>
    );
  }

  const currentLabel = sortOptions.find((o) => o.value === sortBy)?.label ?? 'Sort';

  return (
    <div className="h-14 flex items-center justify-between px-6 shrink-0 relative z-10 titlebar-drag">
      <div className="flex-1 max-w-md titlebar-nodrag">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--color-text-muted)] group-focus-within:text-[var(--color-primary)] transition-colors">
            <Search size={16} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search photos..."
            className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:bg-[var(--color-base-elevated)] transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--color-text-muted)] hover:text-white"
            >
              <span className="text-lg leading-none">&times;</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 titlebar-nodrag">
        <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/10">
          <ViewButton 
            active={currentView === 'timeline'} 
            onClick={() => setCurrentView('timeline')} 
            icon={LayoutList} 
          />
          <ViewButton 
            active={currentView === 'grid'} 
            onClick={() => setCurrentView('grid')} 
            icon={LayoutGrid} 
          />
          <ViewButton 
            active={currentView === 'map'} 
            onClick={() => setCurrentView('map')} 
            icon={MapIcon} 
          />
        </div>

        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setSortOpen(!sortOpen)}
            className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 interactive"
          >
            <ArrowDownUp size={14} />
            <span className="hidden sm:inline">{currentLabel}</span>
          </button>
          {sortOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute right-0 top-full mt-1 w-44 glass-panel rounded-xl p-1.5 z-50 shadow-2xl border-white/10"
            >
              {sortOptions.map((opt) => {
                const active = sortBy === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active ? 'text-white bg-white/10' : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {active && <Check size={14} className="shrink-0" />}
                    <span className={active ? '' : 'ml-6'}>{opt.label}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function ViewButton({ active, onClick, icon: Icon }: { active: boolean, onClick: () => void, icon: any }) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded-md relative transition-colors ${
        active ? 'text-white' : 'text-[var(--color-text-muted)] hover:text-white'
      }`}
    >
      {active && (
        <motion.div
          layoutId="view-toggle"
          className="absolute inset-0 bg-white/10 rounded-md"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <Icon size={16} className="relative z-10" />
    </button>
  );
}
