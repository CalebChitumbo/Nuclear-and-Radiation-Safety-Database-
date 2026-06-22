"use client";

import { Kpi } from "@/components/Kpi";
import { kwacha, napsaFor, payrollTotals, round2, sum } from "@/lib/payroll/compute";
import { usePayroll } from "@/lib/payroll/usePayroll";
import { MONTHS } from "@/lib/payroll/types";
import { Loading } from "./ui";

export function OverviewTab({ onJump }: { onJump: (tab: string) => void }) {
  const { state } = usePayroll();
  if (!state) return <Loading />;

  const activeEmployees = state.employees.filter((e) => e.active);
  const latestRun = [...state.payrollRuns].sort((a, b) =>
    a.year !== b.year ? b.year - a.year : b.month - a.month,
  )[0];
  const runTotals = latestRun ? payrollTotals(latestRun) : null;

  const napsaMonthly = sum(
    state.napsaSchedules.flatMap((s) => s.rows.map((r) => napsaFor(r.basicPay, s.rate).totalToNapsa)),
  );
  const wageBill = round2(
    state.salaryStructures.reduce(
      (a, s) => a + s.rows.reduce((b, r) => b + r.salaryAmt * r.people, 0),
      0,
    ),
  );

  const links: Array<{ tab: string; label: string; hint: string }> = [
    { tab: "run", label: "Run this month's payroll", hint: "Monthly register with carry-forward debts" },
    { tab: "payslips", label: "Print a payslip", hint: "Farm & health-shop templates" },
    { tab: "napsa", label: "NAPSA schedule", hint: "5% worker + 5% employer" },
    { tab: "advances", label: "Log an advance / debt", hint: "Running ledger & request form" },
    { tab: "leave", label: "Leave days", hint: "Calculation ledger & application form" },
    { tab: "stores", label: "Stores requisition", hint: "Order & issue stock" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Employees" value={activeEmployees.length} caption={`${state.businesses.length} businesses`} accent="green" />
        <Kpi
          label={latestRun ? `Net wages · ${MONTHS[latestRun.month - 1]} ${latestRun.year}` : "Net wages"}
          value={runTotals ? kwacha(runTotals.net) : "—"}
          caption={runTotals ? `${kwacha(runTotals.income)} gross` : "No runs yet"}
          accent="slate"
        />
        <Kpi label="NAPSA / month" value={kwacha(napsaMonthly)} caption="Worker + employer" accent="amber" />
        <Kpi label="Planned wage bill" value={kwacha(wageBill)} caption="From salary structures" accent="neutral" />
      </div>

      <div className="card p-5">
        <div className="caps text-xs text-gunmetal/60 mb-3">Quick actions</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {links.map((l) => (
            <button
              key={l.tab}
              onClick={() => onJump(l.tab)}
              className="card card-hover p-4 text-left"
            >
              <div className="font-bold">{l.label}</div>
              <div className="text-xs text-gunmetal/60 mt-0.5">{l.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="caps text-xs text-gunmetal/60 mb-2">About this module</div>
        <p className="text-sm text-gunmetal/70 max-w-3xl">
          These tabs digitise the Chitumbo / Abitehcal / Flowbreeds payroll
          workbooks. Everything is saved in this browser, computes the same
          totals as the spreadsheets, and prints to match the paper forms. Use{" "}
          <strong>Employees</strong> as the master list — the other tabs pull
          names and basic pay from there.
        </p>
      </div>
    </div>
  );
}
