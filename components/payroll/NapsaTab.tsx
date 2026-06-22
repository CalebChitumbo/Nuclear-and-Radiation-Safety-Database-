"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { kwacha, napsaFor, sum } from "@/lib/payroll/compute";
import { pid } from "@/lib/payroll/store";
import { usePayroll } from "@/lib/payroll/usePayroll";
import type { NapsaSchedule } from "@/lib/payroll/types";
import { Loading, NumInput, PrintButton, RemoveBtn, TextInput } from "./ui";

export function NapsaTab() {
  const { state, update } = usePayroll();
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);

  if (!state) return <Loading />;

  const schedules = state.napsaSchedules;
  const schedule = schedules.find((s) => s.id === activeId) ?? schedules[0] ?? null;

  const patch = (fn: (s: NapsaSchedule) => void) =>
    schedule &&
    update((d) => {
      const s = d.napsaSchedules.find((x) => x.id === schedule.id);
      if (s) fn(s);
    });

  const syncFromEmployees = () =>
    patch((s) => {
      const existing = new Map(s.rows.map((r) => [r.employeeId, r]));
      s.rows = state.employees.map((e) => {
        const prev = existing.get(e.id);
        return {
          id: prev?.id ?? pid("napsa-row"),
          employeeId: e.id,
          name: e.name,
          nrc: e.nrc,
          napsaNo: e.napsaNo,
          basicPay: e.basicPay,
        };
      });
    });

  const totals = schedule
    ? {
        basic: sum(schedule.rows.map((r) => r.basicPay)),
        employee: sum(schedule.rows.map((r) => napsaFor(r.basicPay, schedule.rate).employeeShare)),
        total: sum(schedule.rows.map((r) => napsaFor(r.basicPay, schedule.rate).totalToNapsa)),
        balance: sum(schedule.rows.map((r) => napsaFor(r.basicPay, schedule.rate).balanceForPayslip)),
      }
    : null;

  return (
    <div className="space-y-4">
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="caps text-xs text-gunmetal/60">NAPSA contributions</div>
          <p className="text-sm text-gunmetal/65 mt-1 max-w-2xl">
            5% is taken from the worker and matched 5% by the employer; the two go
            to NAPSA. The payslip balance is basic pay less the worker&apos;s 5%.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          {schedules.length > 1 ? (
            <select
              className="input w-[220px]"
              value={schedule?.id ?? ""}
              onChange={(e) => setActiveId(e.target.value)}
            >
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : null}
          <button className="btn btn-secondary" onClick={syncFromEmployees}>
            Sync from employees
          </button>
          <PrintButton />
        </div>
      </div>

      {schedule && totals ? (
        <div className="payroll-sheet card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-lg font-black">Napsa contributions</div>
            <div className="flex items-center gap-2 no-print">
              <label className="caps text-[10px] text-gunmetal/60">Rate</label>
              <div className="w-[90px]">
                <NumInput
                  value={schedule.rate * 100}
                  onChange={(v) => patch((s) => (s.rate = (v || 0) / 100))}
                />
              </div>
              <span className="text-sm text-gunmetal/60">%</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left caps text-[10px] text-gunmetal/55 border-b border-gunmetal/10">
                  <th className="px-2 py-2 min-w-[170px]">Name</th>
                  <th className="px-2 py-2 text-right">Basic pay</th>
                  <th className="px-2 py-2 min-w-[120px]">NRC no.</th>
                  <th className="px-2 py-2 min-w-[110px]">NAPSA no.</th>
                  <th className="px-2 py-2 text-right">5% worker</th>
                  <th className="px-2 py-2 text-right">5% employer</th>
                  <th className="px-2 py-2 text-right">Total to NAPSA</th>
                  <th className="px-2 py-2 text-right">Balance for payslip</th>
                  <th className="px-2 py-2 no-print"></th>
                </tr>
              </thead>
              <tbody>
                {schedule.rows.map((r) => {
                  const n = napsaFor(r.basicPay, schedule.rate);
                  return (
                    <tr key={r.id} className="border-b border-gunmetal/6">
                      <td className="px-2 py-1.5">
                        <TextInput value={r.name} onChange={(v) => patch((s) => { const row = s.rows.find((x) => x.id === r.id); if (row) row.name = v; })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumInput value={r.basicPay} onChange={(v) => patch((s) => { const row = s.rows.find((x) => x.id === r.id); if (row) row.basicPay = v; })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <TextInput value={r.nrc ?? ""} onChange={(v) => patch((s) => { const row = s.rows.find((x) => x.id === r.id); if (row) row.nrc = v; })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <TextInput value={r.napsaNo ?? ""} onChange={(v) => patch((s) => { const row = s.rows.find((x) => x.id === r.id); if (row) row.napsaNo = v; })} />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular">{kwacha(n.employeeShare)}</td>
                      <td className="px-2 py-1.5 text-right tabular">{kwacha(n.employerShare)}</td>
                      <td className="px-2 py-1.5 text-right tabular font-bold">{kwacha(n.totalToNapsa)}</td>
                      <td className="px-2 py-1.5 text-right tabular">{kwacha(n.balanceForPayslip)}</td>
                      <td className="px-2 py-1.5 text-right no-print">
                        <RemoveBtn onClick={() => patch((s) => { s.rows = s.rows.filter((x) => x.id !== r.id); })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t border-gunmetal/15">
                  <td className="px-2 py-2">Total</td>
                  <td className="px-2 py-2 text-right tabular">{kwacha(totals.basic)}</td>
                  <td colSpan={2}></td>
                  <td className="px-2 py-2 text-right tabular">{kwacha(totals.employee)}</td>
                  <td className="px-2 py-2 text-right tabular">{kwacha(totals.employee)}</td>
                  <td className="px-2 py-2 text-right tabular">{kwacha(totals.total)}</td>
                  <td className="px-2 py-2 text-right tabular">{kwacha(totals.balance)}</td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              className="no-print btn btn-ghost text-sm"
              onClick={() => patch((s) => s.rows.push({ id: pid("napsa-row"), employeeId: null, name: "", basicPay: 0 }))}
            >
              + Add row
            </button>
            <div className="text-[11px] text-gunmetal/55">
              Note: NAPSA applies a statutory monthly ceiling on the insurable
              earnings — adjust basic pay if a worker is above it.
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-6 text-sm text-gunmetal/55">
          No NAPSA schedule yet.{" "}
          <button className="btn btn-primary ml-2" onClick={() => { update((d) => d.napsaSchedules.push({ id: pid("napsa"), label: "New schedule", businessId: d.businesses[0]?.id ?? null, rate: d.settings.napsaRate, rows: [] })); toast.push("Schedule created.", "success"); }}>
            Create one
          </button>
        </div>
      )}
    </div>
  );
}
