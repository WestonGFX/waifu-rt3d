import { useState, useCallback, createContext, useContext } from 'react';
import { X } from 'lucide-react';

type ToastType = 'info' | 'success' | 'error' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  info: (message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Hook to access toast notifications from any component. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  info:    { bg: 'var(--color-accent-soft)', border: 'var(--color-accent)', icon: 'ℹ' },
  success: { bg: 'rgba(50,200,100,0.15)', border: 'var(--color-success)', icon: '✓' },
  error:   { bg: 'rgba(255,50,50,0.15)', border: 'var(--color-error, #f44)', icon: '✕' },
  warning: { bg: 'rgba(255,200,50,0.15)', border: '#fa0', icon: '⚠' },
};

/**
 * Toast notification provider. Wrap your app with this to enable
 * useToast() in any child component.
 *
 * Renders a fixed container in the top-right corner with stacked
 * auto-dismissing notification cards.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType, duration = 3000) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    info: (msg, dur) => addToast(msg, 'info', dur),
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur),
    warning: (msg, dur) => addToast(msg, 'warning', dur),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container — fixed top-right */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '360px' }}>
        {toasts.map((toast) => {
          const colors = TOAST_COLORS[toast.type];
          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm animate-slide-in"
              style={{
                backgroundColor: colors.bg,
                border: `1px solid ${colors.border}`,
                color: 'var(--color-text-primary)',
                backdropFilter: 'blur(12px)',
                boxShadow: `0 0 12px ${colors.border}33`,
              }}
            >
              <span className="text-sm flex-shrink-0 mt-0.5">{colors.icon}</span>
              <span className="flex-1 min-w-0">{toast.message}</span>
              <button
                onClick={() => dismiss(toast.id)}
                className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
