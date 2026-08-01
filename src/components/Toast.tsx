"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ToastType = "success" | "error" | "info";

type ToastItem = { id: number; type: ToastType; text: string };

type ToastFn = (text: string, type?: ToastType) => void;

const ToastContext = createContext<ToastFn | null>(null);

/** แจ้งเตือนมุมจอ — ใช้บอกผลการบันทึก/ลบ ฯลฯ */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const remove = useCallback((id: number) => {
    setItems((p) => p.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastFn>((text, type = "success") => {
    const id = ++seq.current;
    setItems((p) => [...p, { id, type, text }]);
    timers.current.push(setTimeout(() => remove(id), type === "error" ? 5000 : 3000));
  }, [remove]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {items.length > 0 && (
        <div className="toast-stack" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast ${t.type}`} onClick={() => remove(t.id)}>
              {t.text}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
