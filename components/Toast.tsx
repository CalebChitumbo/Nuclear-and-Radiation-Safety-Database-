"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ToastItem {
  id: string;
  message: string;
  variant: "default" | "success" | "error";
}

interface ToastCtx {
  push: (m: string, variant?: ToastItem["variant"]) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Clear pending dismiss timers on unmount — they would otherwise call
  // setItems on an unmounted provider.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const push = useCallback(
    (message: string, variant: ToastItem["variant"] = "default") => {
      const id = Math.random().toString(36).slice(2);
      setItems((cur) => [...cur, { id, message, variant }]);
      const t = setTimeout(() => {
        timers.current.delete(t);
        setItems((cur) => cur.filter((i) => i.id !== id));
      }, 4200);
      timers.current.add(t);
    },
    [],
  );

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="toast" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`toast-item ${i.variant}`}>
            {i.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) return { push: () => undefined };
  return ctx;
}
