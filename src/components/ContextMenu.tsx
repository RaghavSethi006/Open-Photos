import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  onClick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [menuHeight, setMenuHeight] = useState(0);
  const [menuWidth, setMenuWidth] = useState(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const combinedRef = useCallback((node: HTMLDivElement | null) => {
    (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (node) {
      setMenuHeight(node.offsetHeight);
      setMenuWidth(node.offsetWidth);
    }
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, []);

  const adjustedX = Math.min(x, window.innerWidth - (menuWidth || 200) - 16);
  const estimatedHeight = menuHeight || items.length * 40;
  const adjustedY = Math.min(y, window.innerHeight - estimatedHeight);

  return (
    <AnimatePresence>
      <motion.div
        ref={combinedRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.1 }}
        className="fixed z-[200] glass-panel rounded-xl p-1.5 shadow-2xl border-white/10 min-w-[180px]"
        style={{ left: adjustedX, top: adjustedY }}
      >
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              item.danger
                ? 'text-red-400 hover:bg-red-400/10'
                : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/10'
            }`}
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span className="flex-1 text-left">{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-[var(--color-text-muted)]/50 font-mono">{item.shortcut}</span>
            )}
          </button>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
