'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
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
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    message: '',
    onConfirm: () => {},
    onCancel: () => {}
  });

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

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
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 transform transition-all duration-300 translate-y-0 opacity-100 ${
            t.type === 'error' ? 'bg-red-500/90 text-white' : 
            t.type === 'success' ? 'bg-green-500/90 text-white' : 
            'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)]'
          }`}>
            {t.type === 'success' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
            {t.type === 'error' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
            {t.message}
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={confirmState.onCancel}></div>
          <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
