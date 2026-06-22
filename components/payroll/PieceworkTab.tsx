"use client";

import { kwacha, pieceworkAmount, sum } from "@/lib/payroll/compute";
import { pid } from "@/lib/payroll/store";
import { usePayroll } from "@/lib/payroll/usePayroll";
import type { PieceworkBasis, PieceworkSheet } from "@/lib/payroll/types";
import { Loading, NumInput, PrintButton, RemoveBtn, Select, TextInput } from "./ui";

const BASIS_OPTIONS: Array<{ value: PieceworkBasis; label: string }> = [
  { value: "day", label: "Per day" },
  { value: "halfday", label: "Per half-day" },
  { value: "month", label: "Per month (÷30)" },
];

export function PieceworkTab() {
  const { state, update } = usePayroll();
  if (!state) return <Loading />;

  const { pieceworkSheets, businesses } = state;
  const bizName = (id: string | null) => businesses.find((b) => b.id === id)?.name ?? "—";

  const patch = (sid: string, fn: (s: PieceworkSheet) => void) =>
    update((d) => {
      const s = d.pieceworkSheets.find((x) => x.id === sid);
      if (s) fn(s);
    });

  const addSheet = () =>
    update((d) =>
      d.pieceworkSheets.push({
        id: pid("piece"),
        businessId: d.businesses[0]?.id ?? null,
        title: "Casual / piece-work rate",
        rate30: 1000,
        ratePerDay: 35,
        ratePerHalfDay: 18,
        workers: [],
      }),
    );

  return (
    <div className="space-y-4">
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="caps text-xs text-gunmetal/60">Casuals / piece-work rate</div>
          <p className="text-sm text-gunmetal/65 mt-1 max-w-2xl">
            Set the day/half-day/monthly rate, then log each casual&apos;s days. Pay
            is days × the rate for the basis chosen.
          </p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <button className="btn btn-primary no-print" onClick={addSheet}>
            + Add sheet
          </button>
        </div>
      </div>

      {pieceworkSheets.map((s) => {
        const total = sum(s.workers.map((w) => pieceworkAmount(w, s)));
        return (
          <div key={s.id} className="payroll-sheet card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <TextInput
                value={s.title}
                onChange={(v) => patch(s.id, (x) => (x.title = v))}
                className="font-bold max-w-[320px]"
              />
              <select
                className="input w-[230px] no-print"
                value={s.businessId ?? ""}
                onChange={(e) => patch(s.id, (x) => (x.businessId = e.target.value || null))}
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <div className="print-only text-sm font-bold">{bizName(s.businessId)}</div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4 max-w-xl">
              <label className="text-sm">
                <span className="caps text-[10px] text-gunmetal/60">Rate / 30 days</span>
                <NumInput value={s.rate30} onChange={(v) => patch(s.id, (x) => (x.rate30 = v))} align="left" />
              </label>
              <label className="text-sm">
                <span className="caps text-[10px] text-gunmetal/60">Rate / day</span>
                <NumInput value={s.ratePerDay} onChange={(v) => patch(s.id, (x) => (x.ratePerDay = v))} align="left" />
              </label>
              <label className="text-sm">
                <span className="caps text-[10px] text-gunmetal/60">Rate / half-day</span>
                <NumInput value={s.ratePerHalfDay} onChange={(v) => patch(s.id, (x) => (x.ratePerHalfDay = v))} align="left" />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left caps text-[10px] text-gunmetal/55 border-b border-gunmetal/10">
                    <th className="px-2 py-2 min-w-[160px]">Employee</th>
                    <th className="px-2 py-2">Date employed</th>
                    <th className="px-2 py-2">Date ended</th>
                    <th className="px-2 py-2">Basis</th>
                    <th className="px-2 py-2 text-right">No. of days</th>
                    <th className="px-2 py-2 text-right">Total to be paid</th>
                    <th className="px-2 py-2 no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {s.workers.map((w) => (
                    <tr key={w.id} className="border-b border-gunmetal/6">
                      <td className="px-2 py-1.5">
                        <TextInput value={w.name} onChange={(v) => patch(s.id, (x) => { const r = x.workers.find((y) => y.id === w.id); if (r) r.name = v; })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="date" className="input" value={w.dateEmployed ?? ""} onChange={(e) => patch(s.id, (x) => { const r = x.workers.find((y) => y.id === w.id); if (r) r.dateEmployed = e.target.value; })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="date" className="input" value={w.dateEnded ?? ""} onChange={(e) => patch(s.id, (x) => { const r = x.workers.find((y) => y.id === w.id); if (r) r.dateEnded = e.target.value; })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Select value={w.basis} options={BASIS_OPTIONS} onChange={(v) => patch(s.id, (x) => { const r = x.workers.find((y) => y.id === w.id); if (r) r.basis = v; })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumInput value={w.days} onChange={(v) => patch(s.id, (x) => { const r = x.workers.find((y) => y.id === w.id); if (r) r.days = v; })} />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular font-bold">{kwacha(pieceworkAmount(w, s))}</td>
                      <td className="px-2 py-1.5 text-right no-print">
                        <RemoveBtn onClick={() => patch(s.id, (x) => { x.workers = x.workers.filter((y) => y.id !== w.id); })} />
                      </td>
                    </tr>
                  ))}
                  {s.workers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-5 text-gunmetal/55">
                        No casuals logged yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t border-gunmetal/15">
                    <td className="px-2 py-2" colSpan={5}>
                      Total
                    </td>
                    <td className="px-2 py-2 text-right tabular">{kwacha(total)}</td>
                    <td className="no-print"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <button
              className="no-print btn btn-ghost mt-2 text-sm"
              onClick={() => patch(s.id, (x) => x.workers.push({ id: pid("pw"), name: "", days: 0, basis: "day" }))}
            >
              + Add casual
            </button>
          </div>
        );
      })}
    </div>
  );
}
