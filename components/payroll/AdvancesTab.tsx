"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { kwacha, round2, sum } from "@/lib/payroll/compute";
import { pid } from "@/lib/payroll/store";
import { usePayroll } from "@/lib/payroll/usePayroll";
import type { AdvanceRequest, DebtLedger } from "@/lib/payroll/types";
import { DottedLine, Loading, NumInput, PrintButton, RemoveBtn, Sheet, TextInput } from "./ui";

interface ReqDraft {
  name: string;
  department: string;
  date: string;
  amount: number;
  reason: string;
  status: AdvanceRequest["status"];
}

const emptyReq: ReqDraft = {
  name: "",
  department: "",
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  reason: "",
  status: "pending",
};

export function AdvancesTab() {
  const { state, update } = usePayroll();
  const toast = useToast();
  const [req, setReq] = useState<ReqDraft>(emptyReq);

  if (!state) return <Loading />;

  const patchLedger = (id: string, fn: (l: DebtLedger) => void) =>
    update((d) => {
      const l = d.debtLedgers.find((x) => x.id === id);
      if (l) fn(l);
    });

  const addLedger = () =>
    update((d) => d.debtLedgers.push({ id: pid("debt"), employeeId: null, name: "", entries: [] }));

  const saveRequest = () => {
    if (!req.name) {
      toast.push("Enter a name for the request.", "error");
      return;
    }
    update((d) =>
      d.advanceRequests.unshift({
        id: pid("req"),
        name: req.name,
        department: req.department,
        date: req.date,
        amount: req.amount,
        reason: req.reason,
        status: req.status,
        createdAt: new Date().toISOString(),
      }),
    );
    toast.push("Advance request saved.", "success");
  };

  return (
    <div className="space-y-4">
      {/* ── Advance / debt ledger ────────────────────────────────────────── */}
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <div className="caps text-xs text-gunmetal/60">Advance &amp; debt ledger</div>
          <p className="text-sm text-gunmetal/65 mt-1 max-w-2xl">
            Track money or items advanced to a worker. The cumulative total is what
            they owe — carry it into the payroll&apos;s Bal B/F to recover it.
          </p>
        </div>
        <button className="btn btn-primary" onClick={addLedger}>
          + New debt record
        </button>
      </div>

      {state.debtLedgers.map((l) => {
        let running = 0;
        const total = sum(l.entries.map((e) => e.amount));
        return (
          <div key={l.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="caps text-[10px] text-gunmetal/60">Name</span>
                <TextInput value={l.name} onChange={(v) => patchLedger(l.id, (x) => (x.name = v))} className="font-bold max-w-[260px]" />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm">Owing: <strong className="tabular">{kwacha(total)}</strong></span>
                <RemoveBtn title="Remove record" onClick={() => update((d) => { d.debtLedgers = d.debtLedgers.filter((x) => x.id !== l.id); })} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left caps text-[10px] text-gunmetal/55 border-b border-gunmetal/10">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2 text-right">Amount / item</th>
                    <th className="px-2 py-2 min-w-[200px]">Purpose</th>
                    <th className="px-2 py-2 text-center">Entered</th>
                    <th className="px-2 py-2 text-right">Cumulative</th>
                    <th className="px-2 py-2 no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {l.entries.map((e) => {
                    running = round2(running + (e.amount || 0));
                    return (
                      <tr key={e.id} className="border-b border-gunmetal/6">
                        <td className="px-2 py-1.5">
                          <input type="date" className="input" value={e.date} onChange={(ev) => patchLedger(l.id, (x) => { const r = x.entries.find((y) => y.id === e.id); if (r) r.date = ev.target.value; })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <NumInput value={e.amount} onChange={(v) => patchLedger(l.id, (x) => { const r = x.entries.find((y) => y.id === e.id); if (r) r.amount = v; })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <TextInput value={e.purpose ?? ""} onChange={(v) => patchLedger(l.id, (x) => { const r = x.entries.find((y) => y.id === e.id); if (r) r.purpose = v; })} />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={e.entered} onChange={(ev) => patchLedger(l.id, (x) => { const r = x.entries.find((y) => y.id === e.id); if (r) r.entered = ev.target.checked; })} />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular font-bold">{kwacha(running)}</td>
                        <td className="px-2 py-1.5 text-right no-print">
                          <RemoveBtn onClick={() => patchLedger(l.id, (x) => { x.entries = x.entries.filter((y) => y.id !== e.id); })} />
                        </td>
                      </tr>
                    );
                  })}
                  {l.entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-4 text-gunmetal/55">No entries yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <button
              className="no-print btn btn-ghost mt-2 text-sm"
              onClick={() => patchLedger(l.id, (x) => x.entries.push({ id: pid("de"), date: new Date().toISOString().slice(0, 10), amount: 0, purpose: "", entered: false }))}
            >
              + Add entry
            </button>
          </div>
        );
      })}

      {/* ── Advance request form (printable) ─────────────────────────────── */}
      <div className="card p-5 no-print flex flex-wrap items-center justify-between gap-3">
        <div className="caps text-xs text-gunmetal/60">Advance request form</div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={saveRequest}>Save request</button>
          <PrintButton />
        </div>
      </div>

      <Sheet>
        <div className="text-center text-lg font-black tracking-wide mb-5">ADVANCE REQUEST FORM</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">Name</span>
            <TextInput value={req.name} onChange={(v) => setReq((d) => ({ ...d, name: v }))} />
          </label>
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">Department</span>
            <TextInput value={req.department} onChange={(v) => setReq((d) => ({ ...d, department: v }))} />
          </label>
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">Date</span>
            <input type="date" className="input" value={req.date} onChange={(e) => setReq((d) => ({ ...d, date: e.target.value }))} />
          </label>
          <label className="text-sm">
            <span className="caps text-[10px] text-gunmetal/60">Amount</span>
            <NumInput value={req.amount} onChange={(v) => setReq((d) => ({ ...d, amount: v }))} align="left" />
          </label>
        </div>
        <label className="text-sm block mt-4">
          <span className="caps text-[10px] text-gunmetal/60">Reason</span>
          <textarea className="input mt-1" rows={2} value={req.reason} onChange={(e) => setReq((d) => ({ ...d, reason: e.target.value }))} />
        </label>
        <div className="flex flex-wrap items-center gap-4 mt-5">
          <span className="caps text-[10px] text-gunmetal/60">Decision:</span>
          {(["authorized", "unauthorized", "pending"] as const).map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm capitalize">
              <input type="radio" name="reqstatus" checked={req.status === s} onChange={() => setReq((d) => ({ ...d, status: s }))} />
              {s}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
          <DottedLine label="Employee sign:" />
          <DottedLine label="Authorising sign:" />
        </div>
      </Sheet>

      {state.advanceRequests.length > 0 ? (
        <div className="card p-5 no-print">
          <div className="caps text-xs text-gunmetal/60 mb-2">Saved requests</div>
          <ul className="divide-y divide-gunmetal/8 text-sm">
            {state.advanceRequests.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-2">
                <span>
                  <strong>{a.name}</strong> · {kwacha(a.amount)} · {a.date}{" "}
                  <span className={`chip ml-1 ${a.status === "authorized" ? "green" : a.status === "unauthorized" ? "red" : "amber"}`}>{a.status}</span>
                </span>
                <span className="flex items-center gap-3">
                  <button className="btn btn-ghost text-xs" onClick={() => setReq({ name: a.name, department: a.department ?? "", date: a.date, amount: a.amount, reason: a.reason ?? "", status: a.status })}>
                    Load
                  </button>
                  <RemoveBtn onClick={() => update((d) => { d.advanceRequests = d.advanceRequests.filter((x) => x.id !== a.id); })} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
