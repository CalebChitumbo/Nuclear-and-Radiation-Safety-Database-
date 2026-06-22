"use client";

import { useMemo, useState } from "react";

import { useToast } from "@/components/Toast";
import { kwacha } from "@/lib/payroll/compute";
import { pid } from "@/lib/payroll/store";
import { usePayroll } from "@/lib/payroll/usePayroll";
import type { Employee } from "@/lib/payroll/types";
import { Loading, NumInput, RemoveBtn, TextInput } from "./ui";

export function EmployeesTab() {
  const { state, update } = usePayroll();
  const toast = useToast();
  const [filter, setFilter] = useState<string>("");

  const businesses = state?.businesses ?? [];

  const filtered = useMemo(() => {
    const employees = state?.employees ?? [];
    return filter ? employees.filter((e) => e.businessId === filter) : employees;
  }, [state, filter]);

  const totalBasic = useMemo(
    () => filtered.reduce((a, e) => a + (e.basicPay || 0), 0),
    [filtered],
  );

  if (!state) return <Loading />;

  const patch = (id: string, p: Partial<Employee>) =>
    update((d) => {
      const e = d.employees.find((x) => x.id === id);
      if (e) Object.assign(e, p);
    });

  const addEmployee = () =>
    update((d) => {
      d.employees.push({
        id: pid("emp"),
        businessId: filter || d.businesses[0]?.id || null,
        name: "",
        position: "Worker",
        basicPay: 0,
        leaveEntitled: 24,
        active: true,
      });
    });

  const remove = (id: string) => {
    update((d) => {
      d.employees = d.employees.filter((e) => e.id !== id);
    });
    toast.push("Employee removed.", "success");
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="caps text-xs text-gunmetal/60">Employees</div>
            <p className="text-sm text-gunmetal/65 mt-1 max-w-2xl">
              The shared staff list. Payroll, NAPSA, payslips and leave all draw
              from here, so set a person up once and reuse them everywhere.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input w-[220px]"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">All businesses</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={addEmployee}>
              + Add employee
            </button>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left caps text-[10px] text-gunmetal/55 border-b border-gunmetal/10">
              <th className="px-3 py-2 min-w-[180px]">Name</th>
              <th className="px-3 py-2 min-w-[170px]">Business</th>
              <th className="px-3 py-2 min-w-[130px]">Position</th>
              <th className="px-3 py-2 text-right min-w-[110px]">Basic pay</th>
              <th className="px-3 py-2 min-w-[130px]">NRC no.</th>
              <th className="px-3 py-2 min-w-[120px]">NAPSA no.</th>
              <th className="px-3 py-2 text-right min-w-[90px]">Leave days</th>
              <th className="px-3 py-2 text-center">Active</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-gunmetal/6 align-middle">
                <td className="px-3 py-1.5">
                  <TextInput value={e.name} onChange={(v) => patch(e.id, { name: v })} placeholder="Full name" />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    className="input"
                    value={e.businessId ?? ""}
                    onChange={(ev) => patch(e.id, { businessId: ev.target.value || null })}
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <TextInput value={e.position ?? ""} onChange={(v) => patch(e.id, { position: v })} />
                </td>
                <td className="px-3 py-1.5">
                  <NumInput value={e.basicPay} onChange={(v) => patch(e.id, { basicPay: v })} />
                </td>
                <td className="px-3 py-1.5">
                  <TextInput value={e.nrc ?? ""} onChange={(v) => patch(e.id, { nrc: v })} placeholder="000000/00/0" />
                </td>
                <td className="px-3 py-1.5">
                  <TextInput value={e.napsaNo ?? ""} onChange={(v) => patch(e.id, { napsaNo: v })} />
                </td>
                <td className="px-3 py-1.5">
                  <NumInput value={e.leaveEntitled ?? 0} onChange={(v) => patch(e.id, { leaveEntitled: v })} />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={e.active}
                    onChange={(ev) => patch(e.id, { active: ev.target.checked })}
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <RemoveBtn onClick={() => remove(e.id)} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-gunmetal/55">
                  No employees yet — add one above.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="font-bold border-t border-gunmetal/15">
              <td className="px-3 py-2" colSpan={3}>
                {filtered.length} employees
              </td>
              <td className="px-3 py-2 text-right tabular">{kwacha(totalBasic)}</td>
              <td className="px-3 py-2" colSpan={5}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
