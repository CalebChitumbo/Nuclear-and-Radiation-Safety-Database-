"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Phone tab bar. The slide-in drawer holds every destination, but reaching a
 * hamburger at the top of the screen one-handed is the whole problem with it —
 * the four screens officers actually live in sit here instead, within thumb
 * reach, and "More" opens the full list.
 */
const TABS = [
  { href: "/", label: "Overview", icon: "▣" },
  { href: "/facilities", label: "Register", icon: "▤" },
  { href: "/daily", label: "Daily", icon: "✎" },
  { href: "/inspection-requests", label: "Requests", icon: "⇄" },
];

export function MobileNav({
  onMore,
  badge = 0,
}: {
  onMore: () => void;
  badge?: number;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      className="no-print lg:hidden fixed inset-x-0 bottom-0 z-40 flex bg-white/95 backdrop-blur border-t"
      style={{
        borderColor: "var(--line)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      aria-label="Primary"
    >
      {TABS.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold"
            style={{
              minHeight: "var(--mobile-nav)",
              color: active ? "var(--rpa-green-dark)" : "rgba(26,27,29,0.6)",
            }}
          >
            <span className="relative text-lg leading-none" aria-hidden="true">
              {t.icon}
              {t.href === "/inspection-requests" && badge > 0 ? (
                <span
                  className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-black flex items-center justify-center"
                  style={{ background: "#E0A32E", color: "#1A1B1D" }}
                >
                  {badge > 9 ? "9+" : badge}
                </span>
              ) : null}
            </span>
            <span className="caps tracking-caps">{t.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold"
        style={{ minHeight: "var(--mobile-nav)", color: "rgba(26,27,29,0.6)" }}
        aria-label="Open the full menu"
      >
        <span className="text-lg leading-none" aria-hidden="true">
          ☰
        </span>
        <span className="caps tracking-caps">More</span>
      </button>
    </nav>
  );
}
