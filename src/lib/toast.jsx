import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Toast notification system.
 * Mount <ToastProvider> high in the tree, then call useToast() in any component.
 *   const toast = useToast();
 *   toast('Saved!');
 *   toast('Something went wrong', { type: 'error', duration: 4000 });
 */

const ToastCtx = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    const t = {
      id,
      message,
      type: opts.type || 'info',  // 'info' | 'success' | 'error'
      duration: opts.duration ?? 2800,
    };
    setToasts((arr) => [...arr, t]);
    if (t.duration > 0) setTimeout(() => remove(id), t.duration);
    return id;
  }, [remove]);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function Toast({ toast, onClose }) {
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (toast.duration <= 0) return;
    const t = setTimeout(() => setClosing(true), Math.max(0, toast.duration - 250));
    return () => clearTimeout(t);
  }, [toast.duration]);

  return (
    <div className={`toast toast-${toast.type}${closing ? ' closing' : ''}`} role="status">
      <span className="toast-msg">{toast.message}</span>
      <button className="toast-x" onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
