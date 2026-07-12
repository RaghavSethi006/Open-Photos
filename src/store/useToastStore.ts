import { create } from 'zustand';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  action?: { label: string; onClick: () => void };
  _timerId?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${++counter}`;
    const timerId = window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id, _timerId: timerId }] }));
  },
  removeToast: (id) => {
    const current = get().toasts.find((t) => t.id === id);
    if (current?._timerId) window.clearTimeout(current._timerId);
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
