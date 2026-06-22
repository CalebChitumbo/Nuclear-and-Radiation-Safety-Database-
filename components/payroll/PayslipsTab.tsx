"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { kwacha, napsaFor, payslipTotals } from "@/lib/payroll/compute";
import { pid } from "@/lib/payroll/store";
import { usePayroll } from "@/lib/payroll/usePayroll";
import type { PayslipLine } from "@/lib/payroll/types";
import { DottedLine, Loading, NumInput, PrintButton, RemoveBtn, Sheet, TextInput } from "./ui";

type Template = "farm" | "healthshop";

interface Draft {
  template: Template;
  businessId: string | null;
  employeeId: string | null;
  employeeName: string;
  jobTitle: string;
  department: string;
  date: string;
  payPeriod: string;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
}

const line = (label: string, amount = 0): PayslipLine => ({ label, amount });

function defaultLines(t: Template): { earnings: PayslipLine[]; deductions: PayslipLine[] } {
  if (t === "healthshop") {
    return {
      earnings: [line("Basic salary"), line("Lunch allowance")],
      deductions: [line("Tax"), line("NAPSA"), line("Advances"), line("Others")],
    };
  }
  return {
    earnings: [line("Basic salary"), line("Overtime"), line("Piecework")],
    deductions: [line("Tax"), line("NAPSA"), line("Advances"), line("Mealie meal"), line("Others")],
  };
}

function emptyDraft(template: Template): Draft {
  return {
    template,
    businessId: null,
    employeeId: null,
    employeeName: "",
    jobTitle: "",
    department: "",
    date: new Date().toISOString().slice(0, 10),
    payPeriod: "",
    ...defaultLines(template),
  };
}

export function PayslipsTab() {
  const { state, update } = usePayroll();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(emptyDraft("farm"));

  if (!state) return <Loading />;

  const businesses = state.businesses;
  const bizName = (id: string | null) => businesses.find((b) => b.id === id)?.name ?? "";

  const totals = payslipTotals(
    draft.earnings.map((l) => l.amount),
    draft.deductions.map((l) => l.amount),
  );

  const setTemplate = (t: Template) => setDraft((d) => ({ ...d, template: t, ...defaultLines(t) }));

  const prefill = (employeeId: string) => {
    const e = state.employees.find((x) => x.id === employeeId);
    if (!e) return;
    setDraft((d) => {
      const napsa = napsaFor(e.basicPay, state.settings.napsaRate).employeeShare;
      const earnings = d.earnings.map((l) =>
        /basic/i.test(l.label) ? { ...l, amount: e.basicPay } : l,
      );
      const deductions = d.deductions.map((l) =>
        /napsa/i.test(l.label) ? { ...l, amount: napsa } : l,
      );
      return {
        ...d,
        employeeId: e.id,
        employeeName: e.name,
        businessId: e.businessId,
        jobTitle: e.position ?? d.jobTitle,
        earnings,
        deductions,
      };
    });
  };

  const editLine = (kind: "earnings" | "deductions", i: number, p: Partial<PayslipLine>) =>
    setDraft((d) => {
      const arr = d[kind].slice();
      arr[i] = { ...arr[i], ...p };
      return { ...d, [kind]: arr };
    });

  const addLine = (kind: "earnings" | "deductions") =>
    setDraft((d) => ({ ...d, [kind]: [...d[kind], line("")] }));

  const removeLine = (kind: "earnings" | "deductions", i: number) =>
    setDraft((d) => ({ ...d, [kind]: d[kind].filter((_, j) => j !== i) }));

  const save = () => {
    if (!draft.employeeName) {
      toast.push("Choose or type an employee first.", "error");
      return;
    }
    update((d) =>
      d.payslips.unshift({
        id: pid("slip"),
        template: draft.template,
        businessId: draft.businessId,
        businessName: bizName(draft.businessId),
        employeeId: draft.employeeId,
        employeeName: draft.employeeName,
        jobTitle: draft.jobTitle,
        department: draft.department,
        date: draft.date,
        payPeriod: draft.payPeriod,
        earnings: draft.earnings,
        deductions: draft.deductions,
        createdAt: new Date().toISOString(),
      }),
    );
    toast.push("Payslip saved.", "success");
  };

  const header = draft.template === "healthshop" ? bizName(draft.businessId) || "Health Shop" : bizName(draft.businessId) || "Chitumbo Farm";

  return (
    <div className="space-y-4">
      <div className="card p-5 no-print">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="caps text-[10px] text-gunmetal/60">Template</span>
              <select className="input mt-1 w-[150px]" value={draft.template} onChange={(e) => setTemplate(e.target.value as Template)}>
                <option value="farm">Farm payslip</option>
                <option value="healthshop">Health-shop payslip</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="caps text-[10px] text-gunmetal/60">Business</span>
              <select className="input mt-1 w-[220px]" value={draft.businessId ?? ""} onChange={(e) => setDraft((d) => ({ ...d, businessId: e.target.value || null }))}>
                <option value="">—</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="caps text-[10px] text-gunmetal/60">Prefill from employee</span>
              <select className="input mt-1 w-[200px]" value={draft.employeeId ?? ""} onChange={(e) => e.target.value && prefill(e.target.value)}>
                <option value="">—</option>
                {state.employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => setDraft(emptyDraft(draft.template))}>Clear</button>
            <button className="btn btn-secondary" onClick={save}>Save</button>
            <PrintButton />
          </div>
        </div>
      </div>

      <Sheet className="max-w-[640px]">
        <div className="text-center">
          <div className="caps text-xs text-gunmetal/55">Pay Slip</div>
          <div className="text-xl font-black">{header}</div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4 text-sm">
          <Field label="Employee">
            <TextInput value={draft.employeeName} onChange={(v) => setDraft((d) => ({ ...d, employeeName: v }))} />
          </Field>
          <Field label="Job title">
            <TextInput value={draft.jobTitle} onChange={(v) => setDraft((d) => ({ ...d, jobTitle: v }))} />
          </Field>
          {draft.template === "healthshop" ? (
            <Field label="Department">
              <TextInput value={draft.department} onChange={(v) => setDraft((d) => ({ ...d, department: v }))} />
            </Field>
          ) : null}
          <Field label="Date">
            <input type="date" className="input" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
          </Field>
          <Field label="Pay period">
            <TextInput value={draft.payPeriod} onChange={(v) => setDraft((d) => ({ ...d, payPeriod: v }))} placeholder="e.g. August 2026" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
          <LineColumn
            title="Earnings"
            lines={draft.earnings}
            onEdit={(i, p) => editLine("earnings", i, p)}
            onAdd={() => addLine("earnings")}
            onRemove={(i) => removeLine("earnings", i)}
            footLabel="Gross earnings"
            footValue={totals.gross}
          />
          <LineColumn
            title="Deductions"
            lines={draft.deductions}
            onEdit={(i, p) => editLine("deductions", i, p)}
            onAdd={() => addLine("deductions")}
            onRemove={(i) => removeLine("deductions", i)}
            footLabel="Total deductions"
            footValue={totals.totalDeductions}
          />
        </div>

        <div className="mt-5 border-t border-gunmetal/20 pt-3 flex items-center justify-between">
          <span className="caps text-xs text-gunmetal/60">Net pay (gross − deductions)</span>
          <span className="text-xl font-black tabular">{kwacha(totals.net)}</span>
        </div>

        <div className="mt-8 max-w-xs">
          <DottedLine label="Signed:" />
        </div>
      </Sheet>

      {state.payslips.length > 0 ? (
        <div className="card p-5 no-print">
          <div className="caps text-xs text-gunmetal/60 mb-2">Saved payslips</div>
          <ul className="divide-y divide-gunmetal/8 text-sm">
            {state.payslips.map((p) => {
              const tt = payslipTotals(p.earnings.map((l) => l.amount), p.deductions.map((l) => l.amount));
              return (
                <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                  <span>
                    <strong>{p.employeeName}</strong> · {p.businessName || "—"} · {p.payPeriod || p.date} · net {kwacha(tt.net)}
                  </span>
                  <span className="flex items-center gap-3">
                    <button className="btn btn-ghost text-xs" onClick={() => setDraft({ template: p.template, businessId: p.businessId, employeeId: p.employeeId, employeeName: p.employeeName, jobTitle: p.jobTitle ?? "", department: p.department ?? "", date: p.date ?? "", payPeriod: p.payPeriod ?? "", earnings: p.earnings, deductions: p.deductions })}>
                      Load
                    </button>
                    <RemoveBtn onClick={() => update((d) => { d.payslips = d.payslips.filter((x) => x.id !== p.id); })} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="caps text-[10px] text-gunmetal/60">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

function LineColumn({
  title,
  lines,
  onEdit,
  onAdd,
  onRemove,
  footLabel,
  footValue,
}: {
  title: string;
  lines: PayslipLine[];
  onEdit: (i: number, p: Partial<PayslipLine>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  footLabel: string;
  footValue: number;
}) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-2 caps text-[10px] text-gunmetal/55 border-b border-gunmetal/10 pb-1">
        <span>{title}</span>
        <span className="text-right">Amount</span>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-1.5 items-center py-1">
          <TextInput value={l.label} onChange={(v) => onEdit(i, { label: v })} />
          <NumInput value={l.amount} onChange={(v) => onEdit(i, { amount: v })} />
          <RemoveBtn onClick={() => onRemove(i)} />
        </div>
      ))}
      <button className="no-print btn btn-ghost text-xs mt-1" onClick={onAdd}>+ Add line</button>
      <div className="flex items-center justify-between border-t border-gunmetal/15 mt-2 pt-1.5 font-bold">
        <span className="caps text-[10px] text-gunmetal/60">{footLabel}</span>
        <span className="tabular">{kwacha(footValue)}</span>
      </div>
    </div>
  );
}
