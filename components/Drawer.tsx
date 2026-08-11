"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  // Pages animate in behind a `transform`, which makes them the containing
  // block for `position: fixed` and traps their stacking context. A drawer
  // rendered inline was therefore pinned to the page rather than the viewport
  // and painted *under* the top bar. Portalling to <body> keeps it a true
  // overlay. Mounted-guard because document doesn't exist during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  // On a phone the drawer covers the screen; the page behind it must not scroll
  // underneath the panel.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div className="drawer-overlay no-print" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="drawer no-print"
        role="dialog"
        aria-modal="true"
        aria-label={title || "Detail"}
      >
        <header
          className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-white/95 backdrop-blur border-b shrink-0"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black tracking-tight leading-tight break-words">
              {title}
            </h2>
            {subtitle ? (
              <div className="text-xs text-gunmetal/55 mt-0.5">{subtitle}</div>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost px-3 shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 overscroll-contain">
          {children}
        </div>
        {footer ? (
          <footer
            className="px-4 sm:px-6 py-3 border-t bg-white shrink-0"
            style={{
              borderColor: "var(--line)",
              paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            {footer}
          </footer>
        ) : null}
      </aside>
    </>,
    document.body,
  );
}
