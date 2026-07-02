"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Overview", icon: "▣" },
  { href: "/facilities", label: "Facilities", icon: "▤" },
  { href: "/licences", label: "Licences", icon: "▦" },
  { href: "/licence-status", label: "Licensing Status", icon: "◑" },
  { href: "/bulk-approval", label: "Bulk Approval", icon: "▼" },
  { href: "/inspections", label: "Inspections", icon: "✶" },
  { href: "/weekly", label: "Weekly Report", icon: "◷" },
];

const ADMIN_NAV = [
  { href: "/admin/users", label: "Users", icon: "◉" },
];

const BOTTOM_NAV = [
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
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
          // visibility transitions discretely at the end, so the slide-out
          // animation still plays before the drawer is hidden.
          transition: "width 0.18s ease, transform 0.24s ease, visibility 0.24s",
          // Keep the off-canvas drawer out of the tab order and hit-testing.
          visibility: offCanvas ? "hidden" : "visible",
        }}
      >
        <div className="px-4 py-5 flex items-center gap-3">
          <Logo size={showCollapsed ? 36 : 44} />
          {!showCollapsed ? (
            <div>
              <div
                className="font-black text-base leading-tight"
                style={{ color: "#F7F4EC" }}
              >
                RPA
              </div>
              <div
                className="caps text-[10px]"
                style={{ color: "#00A050" }}
              >
                Nuclear &amp; Radiation Safety
              </div>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
          {NAV.map((n) => (
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

          {isAdmin ? (
            <>
              <div
                className="caps text-[10px] mt-6 mb-1 px-3"
                style={{ color: "rgba(247,244,236,0.5)" }}
              >
                {showCollapsed ? "·" : "Admin"}
              </div>
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
            </>
          ) : null}
        </nav>

        <div className="px-2 py-3 space-y-1">
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
            <div
              className="px-3 py-2 mt-2 rounded-lg"
              style={{ background: "rgba(247,244,236,0.05)" }}
            >
              {!showCollapsed ? (
                <>
                  <div className="text-xs caps" style={{ color: "#00A050" }}>
                    Signed in
                  </div>
                  <div className="text-sm font-bold truncate">{user.displayName}</div>
                  <div
                    className="text-[10px] truncate"
                    style={{ color: "rgba(247,244,236,0.65)" }}
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
                className="mt-2 w-full text-xs font-bold caps tracking-caps"
                style={{ color: "#F0F000" }}
              >
                {showCollapsed ? "↩" : "Sign out"}
              </button>
            </div>
          ) : null}
          {/* Collapse toggle is desktop-only; the drawer closes via the backdrop */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:block w-full text-xs caps mt-2"
            style={{ color: "rgba(247,244,236,0.6)" }}
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
  collapsed,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: string;
  label: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold transition-colors"
      style={{
        background: active ? "rgba(0,160,80,0.18)" : "transparent",
        color: active ? "#FFFFFF" : "rgba(247,244,236,0.78)",
        borderLeft: active ? "3px solid #00A050" : "3px solid transparent",
      }}
      title={collapsed ? label : undefined}
    >
      <span className="text-base" aria-hidden="true">
        {icon}
      </span>
      {!collapsed ? <span>{label}</span> : null}
    </Link>
  );
}
