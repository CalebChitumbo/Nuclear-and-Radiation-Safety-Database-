"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { kwacha, payrollRow, payrollTotals } from "@/lib/payroll/compute";
import { pid } from "@/lib/payroll/store";
import { usePayroll } from "@/lib/payroll/usePayroll";
import { MONTHS, type PayrollRun, type PayrollRunRow } from "@/lib/payroll/types";
import { Loading, NumInput, PrintButton, RemoveBtn, TextInput } from "./ui";

const runLabel = (r: PayrollRun, biz: string) =>
  `${MONTHS[r.month - 1]} ${r.year}${biz ? " · " + biz : ""}`;

export function PayrollRunTab() {
  const { state, update } = usePayroll();
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);

  if (!state) return <Loading />;

  const { payrollRuns, businesses, employees } = state;
  const run = payrollRuns.find((r) => r.id === activeId) ?? payrollRuns[0] ?? null;
  const bizName = (id: string | null) => businesses.find((b) => b.id === id)?.name ?? "";

  const patch = (fn: (r: PayrollRun) => void) =>
    run &&
    update((d) => {
      const r = d.payrollRuns.find((x) => x.id === run.id);
      if (r) fn(r);
    });

  const patchRow = (rowId: string, fn: (row: PayrollRunRow) => void) =>
    patch((r) => {
      const row = r.rows.find((x) => x.id === rowId);
      if (row) fn(row);
    });

  const newRun = () => {
    const now = new Date();
    const r: PayrollRun = {
      id: pid("run"),
      businessId: businesses[0]?.id ?? null,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      workingDays: state.settings.workingDays,
      recoveryRate: state.settings.recoveryRate,
      rows: [],
      createdAt: now.toISOString(),
    };
    update((d) => d.payrollRuns.push(r));
    setActiveId(r.id);
    toast.push("New payroll run created.", "success");
  };

  const loadEmployees = () =>
    patch((r) => {
      const list = employees.filter((e) => e.active && (!r.businessId || e.businessId === r.businessId) && e.basicPay > 0);
      const have = new Set(r.rows.map((x) => x.employeeId));
      for (const e of list) {
        if (have.has(e.id)) continue;
        r.rows.push({
          id: pid("runrow"),
          employeeId: e.id,
          name: e.name,
          rate: e.basicPay,
          overtime: 0,
          piecework: 0,
          absentDays: 0,
          advance: 0,
          balBf: 0,
          zesco: 0,
          other: 0,
        });
      }
    });

  const carryForward = () => {
    if (!run) return;
    const nextMonth = run.month === 12 ? 1 : run.month + 1;
    const nextYear = run.month === 12 ? run.year + 1 : run.year;
    const r: PayrollRun = {
      id: pid("run"),
      businessId: run.businessId,
      month: nextMonth,
      year: nextYear,
      workingDays: run.workingDays,
      recoveryRate: run.recoveryRate,
      createdAt: new Date().toISOString(),
      rows: run.rows.map((row) => ({
        id: pid("runrow"),
        employeeId: row.employeeId,
        name: row.name,
        rate: row.rate,
        overtime: 0,
        piecework: 0,
        absentDays: 0,
        advance: 0,
        balBf: payrollRow(row, run.workingDays, run.recoveryRate).balCf,
        zesco: 0,
        other: 0,
      })),
    };
    update((d) => d.payrollRuns.push(r));
    setActiveId(r.id);
    toast.push(`${MONTHS[nextMonth - 1]} ${nextYear} created with balances carried forward.`, "success");
  };

  const totals = run ? payrollTotals(run) : null;

  return (
    <div className="space-y-4">
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="caps text-xs text-gunmetal/60">Monthly payroll register</div>
          <p className="text-sm text-gunmetal/65 mt-1 max-w-2xl">
            The redesigned <strong>August 2022</strong> sheet: an absent day docks{" "}
            <em>rate ÷ working-days</em>, debts recover at a capped rate each month,
            and whatever is left rolls forward as Bal C/F into next month.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          {payrollRuns.length > 0 ? (
            <select
              className="input w-[240px]"
              value={run?.id ?? ""}
              onChange={(e) => setActiveId(e.target.value)}
            >
              {payrollRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {runLabel(r, bizName(r.businessId))}
                </option>
              ))}
            </select>
          ) : null}
          <button className="btn btn-primary" onClick={newRun}>
            + New run
          </button>
        </div>
      </div>

      {run && totals ? (
        <div className="payroll-sheet card p-5">
          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div className="text-2xl font-black">
              {bizName(run.businessId) || "Payroll"}
              <span className="text-base font-bold text-gunmetal/55">
                {" "}
                — {MONTHS[run.month - 1]} {run.year}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 no-print">
              <PrintButton />
              <button className="btn btn-secondary" onClick={loadEmployees}>
                Add staff
              </button>
              <button className="btn btn-secondary" onClick={carryForward}>
                Carry to next month →
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 no-print">
            <label className="text-sm">
              <span className="caps text-[10px] text-gunmetal/60">Business</span>
              <select
                className="input mt-1"
                value={run.businessId ?? ""}
                onChange={(e) => patch((r) => (r.businessId = e.target.value || null))}
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="caps text-[10px] text-gunmetal/60">Month</span>
              <select
                className="input mt-1"
                value={run.month}
                onChange={(e) => patch((r) => (r.month = Number(e.target.value)))}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="caps text-[10px] text-gunmetal/60">Year</span>
              <NumInput value={run.year} onChange={(v) => patch((r) => (r.year = v))} align="left" />
            </label>
            <label className="text-sm">
              <span className="caps text-[10px] text-gunmetal/60">Working days</span>
              <NumInput value={run.workingDays} onChange={(v) => patch((r) => (r.workingDays = v))} align="left" />
            </label>
            <label className="text-sm">
              <span className="caps text-[10px] text-gunmetal/60">Recovery cap %</span>
              <NumInput value={run.recoveryRate * 100} onChange={(v) => patch((r) => (r.recoveryRate = (v || 0) / 100))} align="left" />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-right caps text-[9px] text-gunmetal/55 border-b border-gunmetal/10">
                  <th className="px-1.5 py-2 text-left min-w-[150px]">Name</th>
                  <th className="px-1.5 py-2">Rate</th>
                  <th className="px-1.5 py-2">O/T</th>
                  <th className="px-1.5 py-2">Piece</th>
                  <th className="px-1.5 py-2">Absent days</th>
                  <th className="px-1.5 py-2">Advance</th>
                  <th className="px-1.5 py-2">Bal B/F</th>
                  <th className="px-1.5 py-2">ZESCO</th>
                  <th className="px-1.5 py-2">Other</th>
                  <th className="px-1.5 py-2 bg-mist">Income</th>
                  <th className="px-1.5 py-2">Owed</th>
                  <th className="px-1.5 py-2">Recovered</th>
                  <th className="px-1.5 py-2">Bal C/F</th>
                  <th className="px-1.5 py-2 bg-mist">Net pay</th>
                  <th className="px-1.5 py-2 no-print"></th>
                </tr>
              </thead>
              <tbody>
                {run.rows.map((row) => {
                  const c = payrollRow(row, run.workingDays, run.recoveryRate);
                  return (
                    <tr key={row.id} className="border-b border-gunmetal/6">
                      <td className="px-1.5 py-1">
                        <TextInput value={row.name} onChange={(v) => patchRow(row.id, (x) => (x.name = v))} />
                      </td>
                      <td className="px-1 py-1"><NumInput value={row.rate} onChange={(v) => patchRow(row.id, (x) => (x.rate = v))} /></td>
                      <td className="px-1 py-1"><NumInput value={row.overtime} onChange={(v) => patchRow(row.id, (x) => (x.overtime = v))} /></td>
                      <td className="px-1 py-1"><NumInput value={row.piecework} onChange={(v) => patchRow(row.id, (x) => (x.piecework = v))} /></td>
                      <td className="px-1 py-1"><NumInput value={row.absentDays} onChange={(v) => patchRow(row.id, (x) => (x.absentDays = v))} /></td>
                      <td className="px-1 py-1"><NumInput value={row.advance} onChange={(v) => patchRow(row.id, (x) => (x.advance = v))} /></td>
                      <td className="px-1 py-1"><NumInput value={row.balBf} onChange={(v) => patchRow(row.id, (x) => (x.balBf = v))} /></td>
                      <td className="px-1 py-1"><NumInput value={row.zesco} onChange={(v) => patchRow(row.id, (x) => (x.zesco = v))} /></td>
                      <td className="px-1 py-1"><NumInput value={row.other} onChange={(v) => patchRow(row.id, (x) => (x.other = v))} /></td>
                      <td className="px-1.5 py-1 text-right tabular bg-mist font-bold">{kwacha(c.income)}</td>
                      <td className="px-1.5 py-1 text-right tabular text-gunmetal/70">{kwacha(c.owed)}</td>
                      <td className="px-1.5 py-1 text-right tabular">{kwacha(c.recovered)}</td>
                      <td className="px-1.5 py-1 text-right tabular text-gunmetal/70">{kwacha(c.balCf)}</td>
                      <td className="px-1.5 py-1 text-right tabular bg-mist font-bold">{kwacha(c.net)}</td>
                      <td className="px-1 py-1 text-right no-print">
                        <RemoveBtn onClick={() => patch((r) => { r.rows = r.rows.filter((x) => x.id !== row.id); })} />
                      </td>
                    </tr>
                  );
                })}
                {run.rows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-2 py-6 text-gunmetal/55 text-sm">
                      No rows yet — use <strong>Add staff</strong> to pull in the
                      business&apos;s employees, or add a row below.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t border-gunmetal/15 text-right tabular">
                  <td className="px-1.5 py-2 text-left">Total · {run.rows.length}</td>
                  <td colSpan={8}></td>
                  <td className="px-1.5 py-2 bg-mist">{kwacha(totals.income)}</td>
                  <td></td>
                  <td className="px-1.5 py-2">{kwacha(totals.recovered)}</td>
                  <td className="px-1.5 py-2">{kwacha(totals.balCf)}</td>
                  <td className="px-1.5 py-2 bg-mist">{kwacha(totals.net)}</td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <button
            className="no-print btn btn-ghost mt-2 text-sm"
            onClick={() => patch((r) => r.rows.push({ id: pid("runrow"), employeeId: null, name: "", rate: 0, overtime: 0, piecework: 0, absentDays: 0, advance: 0, balBf: 0, zesco: 0, other: 0 }))}
          >
            + Add row
          </button>
        </div>
      ) : (
        <div className="card p-6 text-sm text-gunmetal/55">
          No payroll runs yet.{" "}
          <button className="btn btn-primary ml-2" onClick={newRun}>
            Create the first run
          </button>
        </div>
      )}
    </div>
  );
}
