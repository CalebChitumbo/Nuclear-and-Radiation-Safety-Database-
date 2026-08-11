"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";

/** Grouped so the eleven destinations read as four short lists, not one wall. */
const NAV_GROUPS: {
  heading: string;
  items: { href: string; label: string; short?: string; icon: string }[];
}[] = [
  {
    heading: "Register",
    items: [
      { href: "/", label: "Overview", icon: "▣" },
      { href: "/facilities", label: "Facilities", icon: "▤" },
      { href: "/reports", label: "Reports", icon: "▥" },
      { href: "/licences", label: "Authorisations", icon: "▦" },
    ],
  },
  {
    heading: "Sections",
    items: [
      { href: "/inspectorate", label: "Inspectorate", icon: "✶" },
      {
        href: "/nsss",
        label: "Nuclear Safety, Security & Safeguards",
        short: "Nuclear Safety (NSSS)",
        icon: "⬢",
      },
      { href: "/border", label: "Border Scan Log", icon: "☢" },
    ],
  },
  {
    heading: "Workflow",
    items: [
      { href: "/licence-status", label: "Smart Status Update", icon: "◑" },
      { href: "/bulk-approval", label: "Bulk Approval", icon: "▼" },
      { href: "/inspection-requests", label: "Inspection Requests", icon: "⇄" },
      { href: "/daily", label: "Daily Updates", icon: "✎" },
    ],
  },
];

const ADMIN_NAV = [{ href: "/admin/users", label: "Users", icon: "◉" }];

const BOTTOM_NAV = [{ href: "/settings", label: "Settings", icon: "⚙" }];

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
  inspectionBadge = 0,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  inspectionBadge?: number;
}) {
  const pathname = usePathname();
  const { isAdmin, signOut, user } = useAuth();

  // Collapsing to the icon rail is a desktop-only affordance. On phones and
  // tablets the drawer always shows the full navigation, so the narrow rail
  // never appears inside the slide-in panel.
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const showCollapsed = isDesktop && collapsed;

  // Escape closes the mobile drawer; while it is closed off-canvas its
  // controls must not be reachable (hidden nav links could otherwise be
  // tabbed into — including "Sign out").
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  const offCanvas = !isDesktop && !mobileOpen;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile backdrop — only interactive while the drawer is open */}
      <div
        onClick={onMobileClose}
        aria-hidden="true"
        className="no-print lg:hidden fixed inset-0 z-40"
        style={{
          background: "rgba(26,27,29,0.45)",
          opacity: mobileOpen ? 1 : 0,
          pointerEvents: mobileOpen ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
      />

      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 flex flex-col text-white lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={offCanvas}
        style={{
          background: "#1A1B1D",
          width: showCollapsed ? 72 : 248,
          maxWidth: "85vw",
          // visibility transitions discretely at the end, so the slide-out
          // animation still plays before the drawer is hidden.
          transition: "width 0.18s ease, transform 0.24s ease, visibility 0.24s",
          // Keep the off-canvas drawer out of the tab order and hit-testing.
          visibility: offCanvas ? "hidden" : "visible",
        }}
      >
        <div className="px-4 py-4 flex items-center gap-3 shrink-0">
          <Logo size={showCollapsed ? 36 : 40} />
          {!showCollapsed ? (
            <div className="min-w-0">
              <div
                className="font-black text-base leading-tight"
                style={{ color: "#F7F4EC" }}
              >
                RPA
              </div>
              <div className="caps text-[10px]" style={{ color: "#00A050" }}>
                Nuclear &amp; Radiation Safety
              </div>
            </div>
          ) : null}
          {/* Closing from inside the panel beats reaching for the backdrop. */}
          <button
            onClick={onMobileClose}
            className="lg:hidden ml-auto text-lg px-2 py-1 rounded-lg shrink-0"
            style={{ color: "rgba(247,244,236,0.7)" }}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 px-2 pb-2 overflow-y-auto overscroll-contain">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} className="mb-3">
              <div
                className="caps text-[10px] mb-1 px-3"
                style={{ color: "rgba(247,244,236,0.38)" }}
              >
                {showCollapsed ? "·" : group.heading}
              </div>
              <div className="space-y-0.5">
                {group.items.map((n) => (
                  <NavLink
                    key={n.href}
                    href={n.href}
                    active={isActive(n.href)}
                    collapsed={showCollapsed}
                    icon={n.icon}
                    label={n.short || n.label}
                    title={n.label}
                    badge={
                      n.href === "/inspection-requests"
                        ? inspectionBadge
                        : undefined
                    }
                    onNavigate={onMobileClose}
                  />
                ))}
              </div>
            </div>
          ))}

          {isAdmin ? (
            <div className="mb-3">
              <div
                className="caps text-[10px] mb-1 px-3"
                style={{ color: "rgba(247,244,236,0.38)" }}
              >
                {showCollapsed ? "·" : "Admin"}
              </div>
              <div className="space-y-0.5">
                {ADMIN_NAV.map((n) => (
                  <NavLink
                    key={n.href}
                    href={n.href}
                    active={isActive(n.href)}
                    collapsed={showCollapsed}
                    icon={n.icon}
                    label={n.label}
                    onNavigate={onMobileClose}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div
          className="px-2 py-3 space-y-1 shrink-0 border-t"
          style={{
            borderColor: "rgba(247,244,236,0.08)",
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {BOTTOM_NAV.map((n) => (
            <NavLink
              key={n.href}
              href={n.href}
              active={isActive(n.href)}
              collapsed={showCollapsed}
              icon={n.icon}
              label={n.label}
              onNavigate={onMobileClose}
            />
          ))}
          {user ? (
            <div className="px-3 py-2 mt-1">
              {!showCollapsed ? (
                <>
                  <div className="text-sm font-bold truncate">
                    {user.displayName}
                  </div>
                  <div
                    className="text-[10px] truncate"
                    style={{ color: "rgba(247,244,236,0.55)" }}
                  >
                    {user.section} · {user.role}
                  </div>
                </>
              ) : (
                <div className="text-xs font-bold text-center">
                  {user.displayName.charAt(0)}
                </div>
              )}
              <button
                onClick={() => signOut()}
                className="mt-2 w-full text-xs font-bold caps tracking-caps text-left py-2"
                style={{ color: "#F0F000" }}
              >
                {showCollapsed ? "↩" : "Sign out"}
              </button>
            </div>
          ) : null}
          {/* Collapse toggle is desktop-only; the drawer closes via its own ✕ */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:block w-full text-xs caps py-1"
            style={{ color: "rgba(247,244,236,0.5)" }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "›" : "‹ collapse"}
          </button>
        </div>
      </aside>
    </>
  );
}

function NavLink({
  href,
  active,
  icon,
  label,
  title,
  collapsed,
  badge,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: string;
  label: string;
  title?: string;
  collapsed: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const hasBadge = typeof badge === "number" && badge > 0;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors"
      style={{
        background: active ? "rgba(0,160,80,0.18)" : "transparent",
        color: active ? "#FFFFFF" : "rgba(247,244,236,0.78)",
        borderLeft: active ? "3px solid #00A050" : "3px solid transparent",
      }}
      title={collapsed ? title || label : undefined}
    >
      <span className="relative text-base shrink-0" aria-hidden="true">
        {icon}
        {collapsed && hasBadge ? (
          <span
            className="absolute -top-1.5 -right-2 w-2 h-2 rounded-full"
            style={{ background: "#E0A32E" }}
          />
        ) : null}
      </span>
      {!collapsed ? <span className="flex-1 leading-tight">{label}</span> : null}
      {!collapsed && hasBadge ? (
        <span
          className="text-[10px] font-black tabular rounded-full px-1.5 py-0.5 min-w-[18px] text-center shrink-0"
          style={{ background: "#E0A32E", color: "#1A1B1D" }}
          aria-label={`${badge} needing attention`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
