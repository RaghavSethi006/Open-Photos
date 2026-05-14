import { Search, LayoutGrid, LayoutList, Map as MapIcon, ArrowDownUp } from 'lucide-react';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';

export function Topbar() {
  const { currentView, setCurrentView, searchQuery, setSearchQuery } = useStore();

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
            placeholder="Search photos, places, dates..."
            className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:bg-[var(--color-base-elevated)] transition-all"
          />
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

        <button className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 interactive">
          <ArrowDownUp size={14} />
          Sort
        </button>
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
