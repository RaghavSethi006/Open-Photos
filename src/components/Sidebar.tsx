import { useStore } from '../store/useStore';
import { Library, Calendar, FolderHeart, Star, Trash2, PanelLeft, ScanLine, CopyMinus, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function Sidebar() {
  const { isSidebarOpen, toggleSidebar, currentView, setCurrentView } = useStore();

  const navItems = [
    { id: 'timeline', label: 'Photos', icon: Library },
    { id: 'years', label: 'Years', icon: Calendar },
    { id: 'albums', label: 'Albums', icon: FolderHeart },
    { id: 'favorites', label: 'Favorites', icon: Star },
    { id: 'trash', label: 'Trash', icon: Trash2 },
  ] as const;

  const tools = [
    { id: 'scan', label: 'Scan', icon: ScanLine },
    { id: 'duplicates', label: 'Delete Duplicates', icon: CopyMinus },
  ] as const;

  return (
    <motion.div 
      initial={false}
      animate={{ width: isSidebarOpen ? 240 : 64 }}
      className="h-full glass flex flex-col shrink-0 overflow-hidden relative z-20"
    >
      <div className="h-12 w-full titlebar-drag flex items-center px-3 pt-2">
        <button 
          onClick={toggleSidebar}
          className="p-1.5 rounded-md hover:bg-white/10 text-[var(--color-text-muted)] hover:text-white transition-colors titlebar-nodrag"
        >
          <PanelLeft size={18} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto titlebar-nodrag">
        {navItems.map((item) => {
          const isActive = currentView === item.id || (item.id === 'timeline' && currentView === 'grid');
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id as any)}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl interactive relative group ${
                isActive ? 'text-white' : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-white'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-white/10 rounded-xl"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <item.icon size={18} className="relative z-10 shrink-0" />
              <AnimatePresence>
                {isSidebarOpen && (
                  <motion.span 
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="relative z-10 text-sm font-medium whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}

        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-3 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]/70"
            >
              Tools
            </motion.div>
          )}
        </AnimatePresence>

        {tools.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id as any)}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl interactive relative group ${
                isActive ? 'text-white' : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-white'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-white/10 rounded-xl"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <item.icon size={18} className="relative z-10 shrink-0" />
              <AnimatePresence>
                {isSidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="relative z-10 text-sm font-medium whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-3 titlebar-nodrag">
        <button
          onClick={() => setCurrentView('settings')}
          className={`flex items-center gap-3 px-3 py-2 rounded-xl interactive relative group w-full ${
            currentView === 'settings' ? 'text-white' : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-white'
          }`}
        >
          {currentView === 'settings' && (
            <motion.div
              layoutId="sidebar-active"
              className="absolute inset-0 bg-white/10 rounded-xl"
              initial={false}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Settings size={18} className="relative z-10 shrink-0" />
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="relative z-10 text-sm font-medium whitespace-nowrap overflow-hidden"
              >
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.div>
  );
}
