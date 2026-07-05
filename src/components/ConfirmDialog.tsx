"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

/** modal ยืนยัน — ใช้แทน window.confirm() (promise-based) */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending(opts);
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setPending(null);
  }, []);

  // Esc = ยกเลิก, Enter = ยืนยัน + โฟกัสปุ่มยืนยันเมื่อเปิด
  useEffect(() => {
    if (!pending) return;
    confirmBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="modal-overlay" onClick={() => close(false)}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.title ?? "ยืนยัน"}
            onClick={(e) => e.stopPropagation()}
          >
            {pending.title && <h3 className="modal-title">{pending.title}</h3>}
            <p className="modal-message">{pending.message}</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => close(false)}>
                {pending.cancelText ?? "ยกเลิก"}
              </button>
              <button
                ref={confirmBtnRef}
                className={`btn ${pending.danger ? "btn-danger" : "btn-primary"}`}
                onClick={() => close(true)}
              >
                {pending.confirmText ?? "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
