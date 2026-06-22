"use client";

import { useState } from "react";

import { pid } from "@/lib/payroll/store";
import { usePayroll } from "@/lib/payroll/usePayroll";
import type { StoresRequisition } from "@/lib/payroll/types";
import { DottedLine, Loading, NumInput, PrintButton, RemoveBtn, Sheet, TextInput } from "./ui";

export function StoresTab() {
  const { state, update } = usePayroll();
  const [activeId, setActiveId] = useState<string | null>(null);

  if (!state) return <Loading />;

  const { storesRequisitions, businesses } = state;
  const req = storesRequisitions.find((r) => r.id === activeId) ?? storesRequisitions[0] ?? null;
  const bizName = (id: string | null) => businesses.find((b) => b.id === id)?.name ?? "—";

  const patch = (fn: (r: StoresRequisition) => void) =>
    req &&
    update((d) => {
      const r = d.storesRequisitions.find((x) => x.id === req.id);
      if (r) fn(r);
    });

  const newReq = () => {
    const r: StoresRequisition = {
      id: pid("store"),
      businessId: businesses[0]?.id ?? null,
      position: "",
      no: "",
      items: Array.from({ length: 5 }, () => ({ id: pid("si"), itemCode: "", description: "", qtyOrdered: 0, qtyIssued: 0 })),
      authorisedBy: "",
      issuedBy: "",
      receivedBy: "",
      createdAt: new Date().toISOString(),
    };
    update((d) => d.storesRequisitions.push(r));
    setActiveId(r.id);
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <div className="caps text-xs text-gunmetal/60">Stores requisition</div>
          <p className="text-sm text-gunmetal/65 mt-1 max-w-2xl">
            Request stock from stores: list the items and quantities ordered, record
            what was issued, then print for the three signatures.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {storesRequisitions.length > 1 ? (
            <select className="input w-[200px]" value={req?.id ?? ""} onChange={(e) => setActiveId(e.target.value)}>
              {storesRequisitions.map((r) => (
                <option key={r.id} value={r.id}>
                  {bizName(r.businessId)} · #{r.no || "—"}
                </option>
              ))}
            </select>
          ) : null}
          <PrintButton />
          <button className="btn btn-primary" onClick={newReq}>+ New requisition</button>
        </div>
      </div>

      {req ? (
        <Sheet>
          <div className="flex items-start justify-between gap-3 mb-1">
            <select
              className="input w-[260px] no-print"
              value={req.businessId ?? ""}
              onChange={(e) => patch((r) => (r.businessId = e.target.value || null))}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <div className="text-right text-sm">
              <span className="caps text-[10px] text-gunmetal/60">No.</span>{" "}
              <span className="inline-block w-[90px] no-print align-middle">
                <TextInput value={req.no ?? ""} onChange={(v) => patch((r) => (r.no = v))} />
              </span>
              <span className="print-only font-bold">{req.no || "—"}</span>
            </div>
          </div>
          <div className="print-only text-lg font-black">{bizName(req.businessId)}</div>
          <div className="text-center text-lg font-black tracking-wide mb-4">Stores Requisition</div>

          <div className="flex flex-wrap items-center gap-2 mb-4 max-w-md">
            <span className="caps text-[10px] text-gunmetal/60">Position</span>
            <div className="flex-1 min-w-[180px]">
              <TextInput value={req.position ?? ""} onChange={(v) => patch((r) => (r.position = v))} />
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left caps text-[10px] text-gunmetal/55 border-b border-gunmetal/10">
                <th className="px-2 py-2 w-10">No.</th>
                <th className="px-2 py-2">Item code</th>
                <th className="px-2 py-2 min-w-[220px]">Item description</th>
                <th className="px-2 py-2 text-right">Qty ordered</th>
                <th className="px-2 py-2 text-right">Qty issued</th>
                <th className="px-2 py-2 no-print"></th>
              </tr>
            </thead>
            <tbody>
              {req.items.map((it, i) => (
                <tr key={it.id} className="border-b border-gunmetal/6">
                  <td className="px-2 py-1.5 text-gunmetal/55">{i + 1}</td>
                  <td className="px-2 py-1.5"><TextInput value={it.itemCode ?? ""} onChange={(v) => patch((r) => { const x = r.items.find((y) => y.id === it.id); if (x) x.itemCode = v; })} /></td>
                  <td className="px-2 py-1.5"><TextInput value={it.description} onChange={(v) => patch((r) => { const x = r.items.find((y) => y.id === it.id); if (x) x.description = v; })} /></td>
                  <td className="px-2 py-1.5"><NumInput value={it.qtyOrdered} onChange={(v) => patch((r) => { const x = r.items.find((y) => y.id === it.id); if (x) x.qtyOrdered = v; })} /></td>
                  <td className="px-2 py-1.5"><NumInput value={it.qtyIssued} onChange={(v) => patch((r) => { const x = r.items.find((y) => y.id === it.id); if (x) x.qtyIssued = v; })} /></td>
                  <td className="px-2 py-1.5 text-right no-print">
                    <RemoveBtn onClick={() => patch((r) => { r.items = r.items.filter((y) => y.id !== it.id); })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="no-print btn btn-ghost mt-2 text-sm" onClick={() => patch((r) => r.items.push({ id: pid("si"), itemCode: "", description: "", qtyOrdered: 0, qtyIssued: 0 }))}>
            + Add item
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8">
            <DottedLine label="Authorised by:" />
            <DottedLine label="Issued by:" />
            <DottedLine label="Received by:" />
          </div>
          <div className="mt-4">
            <DottedLine label="Date:" />
          </div>
        </Sheet>
      ) : (
        <div className="card p-6 text-sm text-gunmetal/55">
          No requisitions yet.{" "}
          <button className="btn btn-primary ml-2" onClick={newReq}>Create one</button>
        </div>
      )}
    </div>
  );
}
