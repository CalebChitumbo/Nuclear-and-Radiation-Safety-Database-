"use client";

import { useState } from "react";

import { dismissalTotals, kwacha } from "@/lib/payroll/compute";
import { pid } from "@/lib/payroll/store";
import { usePayroll } from "@/lib/payroll/usePayroll";
import type { DismissalLine, DismissalPay } from "@/lib/payroll/types";
import { DottedLine, Loading, NumInput, PrintButton, RemoveBtn, Sheet, TextInput } from "./ui";

type Group = "dues" | "leaveDays" | "benefits" | "deductions";

export function DismissalTab() {
  const { state, update } = usePayroll();
  const [activeId, setActiveId] = useState<string | null>(null);

  if (!state) return <Loading />;

  const { dismissalPays, businesses } = state;
  const rec = dismissalPays.find((r) => r.id === activeId) ?? dismissalPays[0] ?? null;
  const bizName = (id: string | null) => businesses.find((b) => b.id === id)?.name ?? "—";

  const patch = (fn: (r: DismissalPay) => void) =>
    rec &&
    update((d) => {
      const r = d.dismissalPays.find((x) => x.id === rec.id);
      if (r) fn(r);
    });

  const newRec = () => {
    const r: DismissalPay = {
      id: pid("dis"),
      name: "",
      businessId: businesses[0]?.id ?? null,
      period: "",
      dues: [{ id: pid("l"), amount: 0 }],
      leaveDays: [{ id: pid("l"), label: "Leave days", amount: 0 }],
      benefits: [{ id: pid("l"), label: "Benefits", amount: 0 }],
      deductions: [{ id: pid("l"), amount: 0 }],
      createdAt: new Date().toISOString(),
    };
    update((d) => d.dismissalPays.push(r));
    setActiveId(r.id);
  };

  const t = rec ? dismissalTotals(rec) : null;

  const LineGroup = ({ group, title, withLabel }: { group: Group; title: string; withLabel?: boolean }) => {
    if (!rec) return null;
    const lines = rec[group];
    return (
      <div>
        <div className="caps text-[10px] text-gunmetal/60 mb-1">{title}</div>
        <table className="w-full text-sm">
          <tbody>
            {lines.map((ln: DismissalLine) => (
              <tr key={ln.id}>
                {withLabel ? (
                  <td className="py-1 pr-2 w-[120px]">
                    <TextInput value={ln.label ?? ""} onChange={(v) => patch((r) => { const x = r[group].find((y) => y.id === ln.id); if (x) x.label = v; })} placeholder="Label" />
                  </td>
                ) : null}
                <td className="py-1 pr-2 w-[120px]">
                  <NumInput value={ln.amount} onChange={(v) => patch((r) => { const x = r[group].find((y) => y.id === ln.id); if (x) x.amount = v; })} />
                </td>
                <td className="py-1 pr-2">
                  <TextInput value={ln.desc ?? ""} onChange={(v) => patch((r) => { const x = r[group].find((y) => y.id === ln.id); if (x) x.desc = v; })} placeholder="Description" />
                </td>
                <td className="py-1 text-right no-print">
                  <RemoveBtn onClick={() => patch((r) => { r[group] = r[group].filter((y) => y.id !== ln.id); })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="no-print btn btn-ghost text-xs mt-1" onClick={() => patch((r) => r[group].push({ id: pid("l"), amount: 0 }))}>
          + Add line
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <div className="caps text-xs text-gunmetal/60">Dismissal / terminal pay</div>
          <p className="text-sm text-gunmetal/65 mt-1 max-w-2xl">
            Final pay-out: unpaid dues plus leave-day pay plus benefits accrued,
            less any debts owed back. Net pay updates live.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dismissalPays.length > 1 ? (
            <select className="input w-[200px]" value={rec?.id ?? ""} onChange={(e) => setActiveId(e.target.value)}>
              {dismissalPays.map((r) => (
                <option key={r.id} value={r.id}>{r.name || "Untitled"}</option>
              ))}
            </select>
          ) : null}
          <PrintButton />
          <button className="btn btn-primary" onClick={newRec}>+ New record</button>
        </div>
      </div>

      {rec && t ? (
        <Sheet>
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gunmetal/20 pb-3 mb-4">
            <div>
              <div className="caps text-[10px] text-gunmetal/60">Dismissal pay</div>
              <div className="flex items-center gap-2 mt-1">
                <TextInput value={rec.name} onChange={(v) => patch((r) => (r.name = v))} placeholder="Employee name" className="text-lg font-black max-w-[260px]" />
              </div>
            </div>
            <div className="text-sm text-right">
              <div className="print-only font-bold">{bizName(rec.businessId)}</div>
              <div className="flex items-center gap-2">
                <span className="caps text-[10px] text-gunmetal/60">Period</span>
                <TextInput value={rec.period ?? ""} onChange={(v) => patch((r) => (r.period = v))} className="max-w-[200px]" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <LineGroup group="dues" title="Unpaid dues" />
            <LineGroup group="leaveDays" title="Leave-day pay" withLabel />
            <LineGroup group="benefits" title="Benefits accrued" withLabel />
            <LineGroup group="deductions" title="Deductions (debts owed)" />
          </div>

          <div className="mt-6 border-t border-gunmetal/15 pt-3">
            <table className="text-sm ml-auto tabular">
              <tbody>
                <tr><td className="pr-6 text-gunmetal/65">Total dues</td><td className="text-right">{kwacha(t.dues)}</td></tr>
                <tr><td className="pr-6 text-gunmetal/65">Leave-day pay</td><td className="text-right">{kwacha(t.leave)}</td></tr>
                <tr><td className="pr-6 text-gunmetal/65">Benefits</td><td className="text-right">{kwacha(t.benefits)}</td></tr>
                <tr><td className="pr-6 text-gunmetal/65">Less deductions</td><td className="text-right">−{kwacha(t.deductions)}</td></tr>
                <tr className="font-black text-base border-t border-gunmetal/20">
                  <td className="pr-6 pt-1">Net pay</td><td className="text-right pt-1">{kwacha(t.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-8 max-w-xs">
            <DottedLine label="Signed:" />
          </div>
        </Sheet>
      ) : (
        <div className="card p-6 text-sm text-gunmetal/55">
          No dismissal records.{" "}
          <button className="btn btn-primary ml-2" onClick={newRec}>Create one</button>
        </div>
      )}
    </div>
  );
}
