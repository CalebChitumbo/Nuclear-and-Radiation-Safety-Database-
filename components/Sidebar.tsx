"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Overview", icon: "▣" },
  { href: "/facilities", label: "Facilities", icon: "▤" },
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

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin, signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside
      className="no-print fixed inset-y-0 left-0 z-30 flex flex-col text-white"
      style={{
        background: "#1A1B1D",
        width: collapsed ? 72 : 248,
        transition: "width 0.18s ease",
      }}
    >
      <div className="px-4 py-5 flex items-center gap-3">
        <Logo size={collapsed ? 36 : 44} />
        {!collapsed ? (
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

      <nav className="flex-1 px-2 space-y-1">
        {NAV.map((n) => (
          <NavLink
            key={n.href}
            href={n.href}
            active={isActive(n.href)}
            collapsed={collapsed}
            icon={n.icon}
            label={n.label}
          />
        ))}

        {isAdmin ? (
          <>
            <div
              className="caps text-[10px] mt-6 mb-1 px-3"
              style={{ color: "rgba(247,244,236,0.5)" }}
            >
              {collapsed ? "·" : "Admin"}
            </div>
            {ADMIN_NAV.map((n) => (
              <NavLink
                key={n.href}
                href={n.href}
                active={isActive(n.href)}
                collapsed={collapsed}
                icon={n.icon}
                label={n.label}
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
            collapsed={collapsed}
            icon={n.icon}
            label={n.label}
          />
        ))}
        {user ? (
          <div
            className="px-3 py-2 mt-2 rounded-lg"
            style={{ background: "rgba(247,244,236,0.05)" }}
          >
            {!collapsed ? (
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
              {collapsed ? "↩" : "Sign out"}
            </button>
          </div>
        ) : null}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full text-xs caps mt-2"
          style={{ color: "rgba(247,244,236,0.6)" }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "›" : "‹ collapse"}
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  active,
  icon,
  label,
  collapsed,
}: {
  href: string;
  active: boolean;
  icon: string;
  label: string;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
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
