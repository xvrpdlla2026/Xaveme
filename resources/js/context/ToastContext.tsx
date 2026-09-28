/**
 * context/ToastContext.tsx: the app's one notification surface.
 *
 * Every failed write reaches the user through here, which is why there is exactly one host
 * element and one queue. The host is a popover: a modal dialog paints above everything in
 * the ordinary stacking order, so a toast that stayed in that order would be invisible
 * exactly when it is needed. Showing it again on every toast puts it back on top of a
 * dialog opened since.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';

export type ToastKind = 'info' | 'success' | 'error' | 'warn';

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  /** Put one line of text on screen. Errors stay longer, because they carry something to read. */
  toast: (message: string, kind?: ToastKind, timeoutMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const LIFE_MS: Record<ToastKind, number> = {
  info: 3200,
  success: 3200,
  warn: 3200,
  error: 7000,
};

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, kind: ToastKind = 'info', timeoutMs?: number) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { id, message, kind }]);
    const life = timeoutMs && timeoutMs > 0 ? timeoutMs : LIFE_MS[kind];
    window.setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id));
    }, life);
  }, []);

  // Into the top layer on the first toast rather than at boot, and re-entered on each one.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof host.showPopover !== 'function') return;
    try {
      if (toasts.length) {
        if (host.matches(':popover-open')) host.hidePopover();
        host.showPopover();
      } else if (host.matches(':popover-open')) {
        host.hidePopover();
      }
    } catch {
      // Refused: the notification still appears, at the stylesheet's own index.
    }
  }, [toasts]);

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        id="toast-host"
        ref={hostRef}
        className="toast-host"
        aria-live="polite"
        popover="manual"
      >
        {toasts.map((entry) => (
          <div key={entry.id} className={'toast toast--' + entry.kind} role="status">
            <span className="toast__msg">{entry.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** The toast queue. Throws when used outside the provider, because a lost toast is a bug. */
export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside a ToastProvider.');
  return value;
}
