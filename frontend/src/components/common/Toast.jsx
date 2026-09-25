import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastCtx = createContext(() => {});

// useToast() -> push(message, type?)   types: success | error | warn | info
export const useToast = () => useContext(ToastCtx);

const ICON = { success: '✓', error: '✕', warn: '!', info: '•' };
const STYLE = {
  success: 'border-accent text-accent',
  error: 'border-danger text-danger',
  warn: 'border-warn text-warn',
  info: 'border-line text-ink',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-2xl border bg-surface shadow-elev text-xs font-black animate-in slide-in-from-right-4 fade-in ${STYLE[t.type] || STYLE.info}`}
          >
            <span className="text-sm leading-none">{ICON[t.type] || ICON.info}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
