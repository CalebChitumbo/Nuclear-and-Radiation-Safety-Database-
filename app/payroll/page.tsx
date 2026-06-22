"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { AdvancesTab } from "@/components/payroll/AdvancesTab";
import { DismissalTab } from "@/components/payroll/DismissalTab";
import { EmployeesTab } from "@/components/payroll/EmployeesTab";
import { LeaveTab } from "@/components/payroll/LeaveTab";
import { NapsaTab } from "@/components/payroll/NapsaTab";
import { OverviewTab } from "@/components/payroll/OverviewTab";
import { PayrollRunTab } from "@/components/payroll/PayrollRunTab";
import { PayslipsTab } from "@/components/payroll/PayslipsTab";
import { PieceworkTab } from "@/components/payroll/PieceworkTab";
import { StoresTab } from "@/components/payroll/StoresTab";
import { StructureTab } from "@/components/payroll/StructureTab";
import { resetPayroll } from "@/lib/payroll/store";

const TABS: Array<{ id: string; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "employees", label: "Employees" },
  { id: "structure", label: "Proposed Payroll" },
  { id: "run", label: "Monthly Payroll" },
  { id: "napsa", label: "NAPSA" },
  { id: "payslips", label: "Payslips" },
  { id: "piecework", label: "Piece Work" },
  { id: "advances", label: "Advances & Debt" },
  { id: "leave", label: "Leave Days" },
  { id: "stores", label: "Stores Requisition" },
  { id: "dismissal", label: "Dismissal Pay" },
];

export default function PayrollPage() {
  const [tab, setTab] = useState("overview");
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

  // Deep-link support: /payroll#napsa selects the NAPSA tab, and switching tabs
  // updates the hash so a tab can be shared/bookmarked.
  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "");
    if (fromHash && TABS.some((t) => t.id === fromHash)) setTab(fromHash);
  }, []);

  const jump = (id: string) => {
    setTab(id);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-4 staggered">
      {/* Tab bar */}
      <div className="no-print card p-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => jump(t.id)}
              className="px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
              style={{
                background: tab === t.id ? "var(--rpa-green)" : "transparent",
                color: tab === t.id ? "#fff" : "var(--gunmetal)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" ? <OverviewTab onJump={jump} /> : null}
      {tab === "employees" ? <EmployeesTab /> : null}
      {tab === "structure" ? <StructureTab /> : null}
      {tab === "run" ? <PayrollRunTab /> : null}
      {tab === "napsa" ? <NapsaTab /> : null}
      {tab === "payslips" ? <PayslipsTab /> : null}
      {tab === "piecework" ? <PieceworkTab /> : null}
      {tab === "advances" ? <AdvancesTab /> : null}
      {tab === "leave" ? <LeaveTab /> : null}
      {tab === "stores" ? <StoresTab /> : null}
      {tab === "dismissal" ? <DismissalTab /> : null}

      {/* Maintenance */}
      <div className="no-print pt-2 text-right">
        {!confirmReset ? (
          <button className="text-xs caps text-gunmetal/45 hover:text-gunmetal/70" onClick={() => setConfirmReset(true)}>
            Reset payroll to sample data
          </button>
        ) : (
          <span className="text-xs text-gunmetal/70">
            This clears your edits and reloads the seeded sample.{" "}
            <button
              className="btn btn-danger ml-2 px-2 py-1 text-xs"
              onClick={() => {
                resetPayroll();
                setConfirmReset(false);
                toast.push("Payroll reset to sample data.", "success");
              }}
            >
              Yes, reset
            </button>
            <button className="btn btn-ghost ml-1 px-2 py-1 text-xs" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
