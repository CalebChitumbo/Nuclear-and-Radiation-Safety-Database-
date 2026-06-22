"use client";

import { kwacha, round2 } from "@/lib/payroll/compute";
import { pid } from "@/lib/payroll/store";
import { usePayroll } from "@/lib/payroll/usePayroll";
import type { SalaryStructure } from "@/lib/payroll/types";
import { Loading, NumInput, PrintButton, RemoveBtn, TextInput } from "./ui";

export function StructureTab() {
  const { state, update } = usePayroll();
  if (!state) return <Loading />;

  const { salaryStructures, businesses } = state;
  const bizName = (id: string | null) =>
    businesses.find((b) => b.id === id)?.name ?? "—";

  const patchStruct = (sid: string, fn: (s: SalaryStructure) => void) =>
    update((d) => {
      const s = d.salaryStructures.find((x) => x.id === sid);
      if (s) fn(s);
    });

  const addStructure = () =>
    update((d) => {
      d.salaryStructures.push({
        id: pid("struct"),
        businessId: d.businesses[0]?.id ?? null,
        title: "New salary structure",
        rows: [{ id: pid("s"), role: "", salaryAmt: 0, people: 1, payGrade: "" }],
      });
    });

  return (
    <div className="space-y-4">
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="caps text-xs text-gunmetal/60">Proposed payroll · salary structure</div>
          <p className="text-sm text-gunmetal/65 mt-1 max-w-2xl">
            The planned wage bill per business — roles, the rate each, how many
            people on it and the pay grade. Totals update as you type.
          </p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <button className="btn btn-primary no-print" onClick={addStructure}>
            + Add structure
          </button>
        </div>
      </div>

      {salaryStructures.map((s) => {
        const grand = round2(s.rows.reduce((a, r) => a + r.salaryAmt * r.people, 0));
        const heads = s.rows.reduce((a, r) => a + (Number(r.people) || 0), 0);
        return (
          <div key={s.id} className="payroll-sheet card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="min-w-[260px] flex-1">
                <TextInput
                  value={s.title}
                  onChange={(v) => patchStruct(s.id, (x) => (x.title = v))}
                  className="font-bold"
                />
              </div>
              <select
                className="input w-[230px] no-print"
                value={s.businessId ?? ""}
                onChange={(e) => patchStruct(s.id, (x) => (x.businessId = e.target.value || null))}
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <div className="print-only text-sm font-bold">{bizName(s.businessId)}</div>
              <RemoveBtn
                title="Remove structure"
                onClick={() =>
                  update((d) => {
                    d.salaryStructures = d.salaryStructures.filter((x) => x.id !== s.id);
                  })
                }
              />
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left caps text-[10px] text-gunmetal/55 border-b border-gunmetal/10">
                  <th className="px-2 py-2 min-w-[200px]">Role</th>
                  <th className="px-2 py-2 text-right">Salary amt</th>
                  <th className="px-2 py-2 text-right">No. of people</th>
                  <th className="px-2 py-2 text-right">Total amount</th>
                  <th className="px-2 py-2">Pay grade</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.id} className="border-b border-gunmetal/6">
                    <td className="px-2 py-1.5">
                      <TextInput value={r.role} onChange={(v) => patchStruct(s.id, (x) => { const row = x.rows.find((y) => y.id === r.id); if (row) row.role = v; })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumInput value={r.salaryAmt} onChange={(v) => patchStruct(s.id, (x) => { const row = x.rows.find((y) => y.id === r.id); if (row) row.salaryAmt = v; })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumInput value={r.people} onChange={(v) => patchStruct(s.id, (x) => { const row = x.rows.find((y) => y.id === r.id); if (row) row.people = v; })} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular font-bold">
                      {kwacha(r.salaryAmt * r.people)}
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput value={r.payGrade ?? ""} onChange={(v) => patchStruct(s.id, (x) => { const row = x.rows.find((y) => y.id === r.id); if (row) row.payGrade = v; })} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <RemoveBtn onClick={() => patchStruct(s.id, (x) => { x.rows = x.rows.filter((y) => y.id !== r.id); })} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t border-gunmetal/15">
                  <td className="px-2 py-2">Total</td>
                  <td></td>
                  <td className="px-2 py-2 text-right tabular">{heads}</td>
                  <td className="px-2 py-2 text-right tabular">{kwacha(grand)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>

            <button
              className="no-print btn btn-ghost mt-2 text-sm"
              onClick={() => patchStruct(s.id, (x) => x.rows.push({ id: pid("s"), role: "", salaryAmt: 0, people: 1, payGrade: "" }))}
            >
              + Add role
            </button>
          </div>
        );
      })}
    </div>
  );
}
