"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({ open, onClose, title, children, footer }: Props) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the dialog on open and hand it back on close, so keyboard
  // users aren't left tabbing through the page behind an aria-modal panel.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="drawer-overlay"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title || "Detail"}
      >
        <header
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "rgba(26,27,29,0.08)" }}
        >
          <h2 className="text-lg font-black tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {children}
        </div>
        {footer ? (
          <footer
            className="px-6 py-4 border-t bg-white"
            style={{ borderColor: "rgba(26,27,29,0.08)" }}
          >
            {footer}
          </footer>
        ) : null}
      </aside>
    </>
  );
}
