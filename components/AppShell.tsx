"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "@/lib/auth";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

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
      <Sidebar />
      <div className="pl-[248px] max-[900px]:pl-[72px]">
        <Topbar />
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
