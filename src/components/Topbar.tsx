import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, LayoutGrid, LayoutList, Map as MapIcon, ArrowDownUp, Check, SlidersHorizontal, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';

const sortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'largest', label: 'Largest first' },
] as const;

export function Topbar() {
  const { currentView, setCurrentView, searchQuery, setSearchQuery, sortBy, setSortBy, filters, setFilters } = useStore();
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.filter-btn')) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  const clearFilters = useCallback(() => {
    setFilters({
      cameraMake: undefined,
      cameraModel: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      hasGps: undefined,
      isVideo: undefined,
    });
  }, [setFilters]);

  const hasActiveFilters = !!(filters.cameraMake || filters.cameraModel || filters.dateFrom || filters.dateTo || filters.hasGps !== undefined || filters.isVideo !== undefined);

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

      <div className="flex items-center gap-3 titlebar-nodrag">
        {/* Filter button */}
        <div className="relative filter-btn">
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`p-2 rounded-lg transition-colors ${
              hasActiveFilters ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' : 'bg-white/5 text-[var(--color-text-muted)] hover:text-white border border-white/10'
            }`}
            title="Filters"
          >
            <SlidersHorizontal size={16} />
          </button>
          <AnimatePresence>
            {filterOpen && (
              <motion.div
                ref={filterRef}
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                className="absolute right-0 top-full mt-1 w-72 glass-panel rounded-xl p-3 z-50 shadow-2xl border-white/10"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider">Filters</span>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="text-xs text-[var(--color-text-muted)] hover:text-white flex items-center gap-1">
                      <X size={12} /> Clear
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Camera Make</label>
                    <input
                      type="text"
                      value={filters.cameraMake ?? ''}
                      onChange={(e) => setFilters({ cameraMake: e.target.value || undefined })}
                      placeholder="e.g. Apple, Canon"
                      className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Camera Model</label>
                    <input
                      type="text"
                      value={filters.cameraModel ?? ''}
                      onChange={(e) => setFilters({ cameraModel: e.target.value || undefined })}
                      placeholder="e.g. iPhone 15 Pro"
                      className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">From</label>
                      <input
                        type="date"
                        value={filters.dateFrom ? new Date(filters.dateFrom).toISOString().split('T')[0] : ''}
                        onChange={(e) => setFilters({ dateFrom: e.target.value ? new Date(e.target.value).getTime() : undefined })}
                        className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] [color-scheme:dark]"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">To</label>
                      <input
                        type="date"
                        value={filters.dateTo ? new Date(filters.dateTo).toISOString().split('T')[0] : ''}
                        onChange={(e) => setFilters({ dateTo: e.target.value ? new Date(e.target.value).getTime() : undefined })}
                        className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] [color-scheme:dark]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!filters.hasGps}
                        onChange={(e) => setFilters({ hasGps: e.target.checked || undefined })}
                        className="rounded border-white/20 bg-white/5"
                      />
                      Has Location
                    </label>
                    <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                      <select
                        value={filters.isVideo === undefined ? '' : filters.isVideo ? 'videos' : 'photos'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFilters({ isVideo: val === '' ? undefined : val === 'videos' ? true : false });
                        }}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                      >
                        <option value="">All</option>
                        <option value="photos">Photos only</option>
                        <option value="videos">Videos only</option>
                      </select>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

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
