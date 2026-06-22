"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { kwacha, leaveFor, round2, sum } from "@/lib/payroll/compute";
import { pid } from "@/lib/payroll/store";
import { usePayroll } from "@/lib/payroll/usePayroll";
import type { LeaveLedger } from "@/lib/payroll/types";
import { DottedLine, Loading, NumInput, PrintButton, RemoveBtn, Sheet, TextInput } from "./ui";

interface Draft {
  surname: string;
  firstName: string;
  gender: string;
  position: string;
  daysEntitled: number;
  daysAsked: number;
  reason: string;
  startDate: string;
}

const emptyDraft: Draft = {
  surname: "",
  firstName: "",
  gender: "",
  position: "",
  daysEntitled: 24,
  daysAsked: 0,
  reason: "",
  startDate: "",
};

export function LeaveTab() {
  const { state, update } = usePayroll();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  if (!state) return <Loading />;

  const ledger: LeaveLedger | null = state.leaveLedgers[0] ?? null;

  const patchLedger = (fn: (l: LeaveLedger) => void) =>
    ledger &&
    update((d) => {
      const l = d.leaveLedgers.find((x) => x.id === ledger.id);
      if (l) fn(l);
    });

  const setDraftField = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const balance = round2(draft.daysEntitled - draft.daysAsked);

  const saveApplication = () => {
    if (!draft.surname && !draft.firstName) {
      toast.push("Enter the employee's name first.", "error");
      return;
    }
    update((d) =>
      d.leaveApplications.unshift({
        id: pid("leaveapp"),
        surname: draft.surname,
        firstName: draft.firstName,
        gender: draft.gender,
        position: draft.position,
        daysEntitled: draft.daysEntitled,
        daysAsked: draft.daysAsked,
        reason: draft.reason,
        startDate: draft.startDate,
        createdAt: new Date().toISOString(),
      }),
    );
    toast.push("Leave application saved.", "success");
  };

  const totals = ledger
    ? {
        amount: sum(ledger.rows.map((r) => leaveFor(r.allocated, r.taken, ledger.dayRate).amount)),
        taken: sum(ledger.rows.map((r) => leaveFor(r.allocated, r.taken, ledger.dayRate).totalTaken)),
      }
    : null;

  return (
    <div className="space-y-4">
      {/* ── Leave application form (printable) ───────────────────────────── */}
      <div className="card p-5 no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="caps text-xs text-gunmetal/60">Leave application form</div>
          <p className="text-sm text-gunmetal/65 mt-1 max-w-2xl">
            Fill it in and print for signing, or save a copy. Balance is days
            entitled minus days asked for.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="input w-[220px]"
            value=""
            onChange={(e) => {
              const emp = state.employees.find((x) => x.id === e.target.value);
              if (!emp) return;
              const parts = emp.name.trim().split(/\s+/);
              const row = ledger?.rows.find((r) => r.employeeId === emp.id);
              const lf = row ? leaveFor(row.allocated, row.taken, ledger!.dayRate) : null;
              setDraft((d) => ({
                ...d,
                firstName: parts.slice(0, -1).join(" ") || parts[0] || "",
                surname: parts.length > 1 ? parts[parts.length - 1] : "",
                position: emp.position ?? "",
                daysEntitled: emp.leaveEntitled ?? 24,
                daysAsked: lf ? Math.max(0, lf.balance > 0 ? d.daysAsked : 0) : d.daysAsked,
              }));
            }}
          >
            <option value="">Prefill from employee…</option>
            {state.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={saveApplication}>
            Save
          </button>
          <PrintButton />
        </div>
      </div>

      <Sheet>
        <div className="text-center text-xl font-black tracking-wide border-b border-gunmetal/20 pb-3 mb-5">
          LEAVE DAYS FORM
        </div>
        <div className="caps text-xs text-gunmetal/60 mb-3">Personal data</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">Sir name</span>
            <TextInput value={draft.surname} onChange={(v) => setDraftField("surname", v)} />
          </label>
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">First name</span>
            <TextInput value={draft.firstName} onChange={(v) => setDraftField("firstName", v)} />
          </label>
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">Gender</span>
            <TextInput value={draft.gender} onChange={(v) => setDraftField("gender", v)} />
          </label>
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">Position held</span>
            <TextInput value={draft.position} onChange={(v) => setDraftField("position", v)} />
          </label>
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">No. of days entitled</span>
            <NumInput value={draft.daysEntitled} onChange={(v) => setDraftField("daysEntitled", v)} align="left" />
          </label>
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">No. of days asked for</span>
            <NumInput value={draft.daysAsked} onChange={(v) => setDraftField("daysAsked", v)} align="left" />
          </label>
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">Balance in days</span>
            <div className="input bg-mist tabular font-bold">{balance}</div>
          </label>
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">Date leave starts</span>
            <input type="date" className="input" value={draft.startDate} onChange={(e) => setDraftField("startDate", e.target.value)} />
          </label>
        </div>
        <label className="text-sm block mt-4">
          <span className="caps text-[10px] text-gunmetal/60">Reason for going on leave</span>
          <textarea className="input mt-1" rows={2} value={draft.reason} onChange={(e) => setDraftField("reason", e.target.value)} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
          <DottedLine label="Employee sign:" />
          <DottedLine label="MD sign:" />
        </div>
      </Sheet>

      {/* ── Leave calculation ledger ─────────────────────────────────────── */}
      {ledger && totals ? (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="caps text-xs text-gunmetal/60">Leave days calculation</div>
            <div className="flex items-center gap-2 no-print">
              <label className="caps text-[10px] text-gunmetal/60">Year</label>
              <div className="w-[90px]">
                <NumInput value={ledger.year} onChange={(v) => patchLedger((l) => (l.year = v))} align="left" />
              </div>
              <label className="caps text-[10px] text-gunmetal/60">Pay / day</label>
              <div className="w-[90px]">
                <NumInput value={ledger.dayRate} onChange={(v) => patchLedger((l) => (l.dayRate = v))} align="left" />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left caps text-[10px] text-gunmetal/55 border-b border-gunmetal/10">
                  <th className="px-2 py-2 min-w-[170px]">Name</th>
                  <th className="px-2 py-2 text-right">Allocated days</th>
                  <th className="px-2 py-2 text-right">Days taken</th>
                  <th className="px-2 py-2 text-right">Balance in days</th>
                  <th className="px-2 py-2 text-right">Amount to be paid</th>
                  <th className="px-2 py-2 no-print"></th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((r) => {
                  const lf = leaveFor(r.allocated, r.taken, ledger.dayRate);
                  return (
                    <tr key={r.id} className="border-b border-gunmetal/6">
                      <td className="px-2 py-1.5">
                        <TextInput value={r.name} onChange={(v) => patchLedger((l) => { const row = l.rows.find((x) => x.id === r.id); if (row) row.name = v; })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumInput value={r.allocated} onChange={(v) => patchLedger((l) => { const row = l.rows.find((x) => x.id === r.id); if (row) row.allocated = v; })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumInput value={lf.totalTaken} onChange={(v) => patchLedger((l) => { const row = l.rows.find((x) => x.id === r.id); if (row) row.taken = [v]; })} />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular">{lf.balance}</td>
                      <td className="px-2 py-1.5 text-right tabular font-bold">{kwacha(lf.amount)}</td>
                      <td className="px-2 py-1.5 text-right no-print">
                        <RemoveBtn onClick={() => patchLedger((l) => { l.rows = l.rows.filter((x) => x.id !== r.id); })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t border-gunmetal/15">
                  <td className="px-2 py-2">Total</td>
                  <td></td>
                  <td className="px-2 py-2 text-right tabular">{totals.taken}</td>
                  <td></td>
                  <td className="px-2 py-2 text-right tabular">{kwacha(totals.amount)}</td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <button
            className="no-print btn btn-ghost mt-2 text-sm"
            onClick={() => patchLedger((l) => l.rows.push({ id: pid("leave-row"), employeeId: null, name: "", allocated: 24, taken: [] }))}
          >
            + Add employee
          </button>
        </div>
      ) : null}

      {state.leaveApplications.length > 0 ? (
        <div className="card p-5 no-print">
          <div className="caps text-xs text-gunmetal/60 mb-2">Saved applications</div>
          <ul className="divide-y divide-gunmetal/8 text-sm">
            {state.leaveApplications.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-2">
                <span>
                  <strong>{a.firstName} {a.surname}</strong> · {a.daysAsked} day(s)
                  {a.startDate ? ` from ${a.startDate}` : ""}
                </span>
                <span className="flex items-center gap-3">
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => setDraft({ surname: a.surname, firstName: a.firstName, gender: a.gender ?? "", position: a.position ?? "", daysEntitled: a.daysEntitled, daysAsked: a.daysAsked, reason: a.reason ?? "", startDate: a.startDate ?? "" })}
                  >
                    Load into form
                  </button>
                  <RemoveBtn onClick={() => update((d) => { d.leaveApplications = d.leaveApplications.filter((x) => x.id !== a.id); })} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
