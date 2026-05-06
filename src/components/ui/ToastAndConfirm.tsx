'use client';

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ConfirmState {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

interface ToastAndConfirmContextType {
  showToast: (message: string, type?: ToastType) => void;
  askConfirm: (message: string) => Promise<boolean>;
}

const ToastAndConfirmContext = createContext<ToastAndConfirmContextType | undefined>(undefined);

export function useToastAndConfirm() {
  const context = useContext(ToastAndConfirmContext);
  if (!context) throw new Error('useToastAndConfirm must be used within ToastAndConfirmProvider');
  return context;
}

export function ToastAndConfirmProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    message: '',
    onConfirm: () => {},
    onCancel: () => {}
  });

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);

    // Start exit animation before removal
    const exitTimer = setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      const removeTimer = setTimeout(() => removeToast(id), 200);
      toastTimers.current.set(id + '_rm', removeTimer);
    }, 2800);
    toastTimers.current.set(id, exitTimer);
  }, [removeToast]);

  const askConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        message,
        onConfirm: () => {
          setConfirmState(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setConfirmState(prev => ({ ...prev, isOpen: false }));
          resolve(false);
        }
      });
    });
  }, []);

  return (
    <ToastAndConfirmContext.Provider value={{ showToast, askConfirm }}>
      {children}
      
      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto px-5 py-3.5 rounded-xl shadow-2xl backdrop-blur-md border text-sm font-medium flex items-center gap-3 transition-all duration-300 ${
              t.exiting ? 'toast-exit opacity-0 scale-95 translate-y-2' : 'toast-enter opacity-100 scale-100 translate-y-0'
            } ${
              t.type === 'error' ? 'bg-red-500/80 border-red-500/50 text-white' : 
              t.type === 'success' ? 'bg-[var(--primary)]/90 border-[var(--primary-hover)]/50 text-white' : 
              'bg-[var(--bg-card)]/90 border-[var(--border)] text-[var(--text)]'
            }`}
          >
            {t.type === 'success' && (
              <div className="bg-white/20 p-1 rounded-full shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            )}
            {t.type === 'error' && (
              <div className="bg-white/20 p-1 rounded-full shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
            )}
            {t.type === 'info' && (
              <div className="bg-[var(--text-muted)]/20 p-1 rounded-full shrink-0 text-[var(--text)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </div>
            )}
            <span className="leading-snug">{t.message}</span>
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm mobile-menu-overlay" onClick={confirmState.onCancel}></div>
          <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden confirm-enter">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Confirmar acción</h3>
              <p className="text-sm text-[var(--text-muted)]">{confirmState.message}</p>
            </div>
            <div className="bg-[var(--bg-input)] px-6 py-4 flex items-center justify-end gap-3 rounded-b-xl border-t border-[var(--border)]">
              <button onClick={confirmState.onCancel} className="px-4 py-2 text-sm font-medium rounded-lg text-[var(--text-muted)] hover:bg-[var(--border)] transition-colors">
                Cancelar
              </button>
              <button 
                onClick={confirmState.onConfirm} 
                className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors shadow-sm shadow-[var(--primary)]/20"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastAndConfirmContext.Provider>
  );
}
