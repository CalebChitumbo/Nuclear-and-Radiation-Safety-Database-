"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

  const push = useCallback(
    (message: string, variant: ToastItem["variant"] = "default") => {
      const id = Math.random().toString(36).slice(2);
      setItems((cur) => [...cur, { id, message, variant }]);
      setTimeout(() => {
        setItems((cur) => cur.filter((i) => i.id !== id));
      }, 4200);
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
