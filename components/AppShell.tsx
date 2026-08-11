"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "@/lib/auth";
import { useStoreData } from "@/lib/storeHooks";
import { deriveInspectionInbox } from "@/lib/rules/inspectionRequests";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, canEditAS, canEditInsp } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // One read for both navigations: the sidebar link badge and the phone tab
  // bar show the same cross-section handoff count.
  const { data: inbox } = useStoreData(
    async (s) => {
      // Never let the badge read break the shell: if the collection isn't
      // readable yet (rules not deployed), just show no badge.
      const requests = await s.listInspectionRequests().catch(() => []);
      return deriveInspectionInbox(requests, { canEditAS, canEditInsp });
    },
    [canEditAS, canEditInsp],
  );
  const inspectionBadge = user ? inbox?.count || 0 : 0;

  // Close the mobile navigation drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Stop the page behind the drawer from scrolling while it is open on mobile.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mobileNavOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="caps text-xs text-gunmetal/60">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="caps text-xs text-gunmetal/60">Redirecting…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        inspectionBadge={inspectionBadge}
      />
      {/* Content is full-width on mobile; the fixed sidebar only reserves
          space from the `lg` breakpoint up, where it is always visible. */}
      <div className={collapsed ? "lg:pl-[72px]" : "lg:pl-[248px]"}>
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="app-main mx-auto w-full max-w-[1440px] px-4 pt-4 sm:px-6 sm:pt-6">
          {children}
        </main>
      </div>
      <MobileNav
        onMore={() => setMobileNavOpen(true)}
        badge={inspectionBadge}
      />
    </div>
  );
}
