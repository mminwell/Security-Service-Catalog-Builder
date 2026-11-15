"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type ToastTone = "success" | "error";

type ToastState = {
  id: number;
  tone: ToastTone;
  message: string;
  leaving: boolean;
};

type SaveToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const SaveToastContext = createContext<SaveToastApi | null>(null);

/** Success confirmations stay up long enough to read, then fade. Errors stay until dismissed. */
export const SUCCESS_TOAST_MS = 5000;

export function toastAutoDismissMs(tone: ToastTone): number | null {
  return tone === "success" ? SUCCESS_TOAST_MS : null;
}

export function SaveToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const hideTimer = useRef<number | null>(null);
  const serial = useRef(0);

  const clearHide = useCallback(() => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearHide();
    setToast((current) => (current && !current.leaving ? { ...current, leaving: true } : current));
    hideTimer.current = window.setTimeout(() => setToast(null), 280);
  }, [clearHide]);

  const show = useCallback(
    (tone: ToastTone, message: string) => {
      clearHide();
      serial.current += 1;
      setToast({ id: serial.current, tone, message, leaving: false });
    },
    [clearHide],
  );

  useEffect(() => {
    if (!toast || toast.leaving) return;
    const delay = toastAutoDismissMs(toast.tone);
    if (delay == null) return;
    const timer = window.setTimeout(() => dismiss(), delay);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);

  useEffect(() => () => clearHide(), [clearHide]);

  const api = useMemo<SaveToastApi>(
    () => ({
      success: (message) => show("success", message),
      error: (message) => show("error", message),
    }),
    [show],
  );

  return (
    <SaveToastContext.Provider value={api}>
      {children}
      <div className="save-toast-live" aria-live={toast?.tone === "error" ? "assertive" : "polite"}>
        {toast ? (
          <div
            className={`save-toast-layer${toast.leaving ? " leaving" : ""}`}
            onClick={dismiss}
          >
            <div
              key={toast.id}
              className={`save-toast ${toast.tone}${toast.leaving ? " leaving" : ""}`}
              role={toast.tone === "error" ? "alert" : "status"}
              onClick={(event) => event.stopPropagation()}
            >
              <SaveToastIcon tone={toast.tone} />
              <p>{toast.message}</p>
              <button type="button" className="btn btn-ghost" onClick={dismiss}>
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </SaveToastContext.Provider>
  );
}

export function useSaveToast(): SaveToastApi {
  const value = useContext(SaveToastContext);
  if (!value) throw new Error("useSaveToast must be used inside SaveToastProvider");
  return value;
}

function SaveToastIcon({ tone }: { tone: ToastTone }) {
  const success = tone === "success";
  return (
    <svg className="save-toast-icon" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" />
      {success ? <path d="M10 16.5 14.2 21 22 12" /> : <path d="M16 9v9M16 22.5h.01" />}
    </svg>
  );
}
