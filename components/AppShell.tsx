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
import { pendingRequests } from "@/lib/rules/signup";

const STANDALONE_ROUTES = ["/login", "/signup", "/pending"];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, canEditAS, canEditInsp, isAdmin } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // One read for both navigations: the sidebar link badge and the phone tab
  // bar show the same cross-section handoff count. Administrators also get the
  // count of account requests waiting on them, so a new officer's sign-up is
  // noticed rather than sat on.
  const { data: badges } = useStoreData(
    async (s) => {
      // Never let the badge read break the shell: if the collection isn't
      // readable yet (rules not deployed), just show no badge.
      const requests = await s.listInspectionRequests().catch(() => []);
      const accountRequests = isAdmin
        ? await s.listUsers().catch(() => [])
        : [];
      return {
        inbox: deriveInspectionInbox(requests, { canEditAS, canEditInsp }),
        accounts: pendingRequests(accountRequests).length,
      };
    },
    [canEditAS, canEditInsp, isAdmin],
  );
  const inspectionBadge = user ? badges?.inbox.count || 0 : 0;
  const requestBadge = user && isAdmin ? badges?.accounts || 0 : 0;

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

  // The three pages that stand on their own: signing in, asking for an account,
  // and waiting for that request to be approved. None of them has a navigation
  // to show, and the last two belong to accounts that may not read anything the
  // navigation would try to count.
  if (STANDALONE_ROUTES.includes(pathname)) {
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
        requestBadge={requestBadge}
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
