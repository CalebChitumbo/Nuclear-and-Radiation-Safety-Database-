"use client";

/**
 * The running list of what this post has logged today — the shift's own record,
 * kept visible so an officer can see the last few scans without scrolling and
 * fix a mistake straight away.
 */
import { useState } from "react";

import { Panel } from "@/components/Section";
import { store } from "@/lib/store";
import { useToast } from "@/components/Toast";
import { scanWriteErrorMessage } from "@/lib/rules/borderScans";
import type { TruckScan } from "@/lib/rules/types";

const RESULT_COLOUR: Record<string, string> = {
  Normal: "var(--rpa-green-dark)",
  Elevated: "#7a5b07",
  Alarm: "var(--status-stalled)",
};

const PAGE = 20;

export function ShiftLog({
  scans,
  canRemove,
  onChanged,
}: {
  scans: TruckScan[];
  /** True when the signed-in officer may remove a given scan. */
  canRemove: (s: TruckScan) => boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState("");

  const remove = async (s: TruckScan) => {
    if (busy) return;
    setBusy(s.id);
    try {
      const db = await store();
      await db.deleteTruckScan(s.id);
      toast.push(`${s.vehicleId} removed from the log.`, "success");
      onChanged();
    } catch (err) {
      toast.push(`Could not remove it. ${scanWriteErrorMessage(err)}`, "error");
    } finally {
      setBusy("");
    }
  };

  const visible = scans.slice(0, shown);

  return (
    <Panel
      title={`Today's log — ${scans.length} scan${scans.length === 1 ? "" : "s"}`}
      flush
    >
      {scans.length === 0 ? (
        <p className="px-4 sm:px-5 text-sm text-gunmetal/60">
          No trucks logged at this post today yet.
        </p>
      ) : (
        <>
          {/* Desktop: the full row, as the workbook had it */}
          <div className="hidden md:block table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Unit</th>
                  <th>Cargo</th>
                  <th>Transporter</th>
                  <th className="num">nSv/h</th>
                  <th>Result</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id}>
                    <td className="tabular text-gunmetal/70">{s.time || "—"}</td>
                    <td className="font-bold">
                      {s.vehicleId}
                      <span className="block text-[11px] font-normal text-gunmetal/50">
                        {s.vehicleIdKind}
                        {s.direction ? ` · ${s.direction}` : ""}
                      </span>
                    </td>
                    <td>
                      {s.commodity}
                      <span className="block text-[11px] text-gunmetal/50">
                        {s.cargoClass}
                      </span>
                    </td>
                    <td>{s.transporter}</td>
                    <td className="num font-bold">
                      {Number.isFinite(s.doseNSvH) ? s.doseNSvH : "—"}
                    </td>
                    <td>
                      <span
                        className="text-xs font-black"
                        style={{ color: RESULT_COLOUR[s.result] }}
                      >
                        {s.result}
                      </span>
                      {s.action ? (
                        <span className="block text-[11px] text-gunmetal/55">
                          {s.action}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right">
                      {canRemove(s) ? (
                        <button
                          className="link-action"
                          style={{ color: "var(--status-stalled)" }}
                          disabled={busy === s.id}
                          onClick={() => remove(s)}
                        >
                          {busy === s.id ? "…" : "Remove"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: one block per truck — this screen is used at the barrier */}
          <ul className="md:hidden divide-y divide-gunmetal/8">
            {visible.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold break-words">{s.vehicleId}</div>
                    <div className="text-[11px] text-gunmetal/50">
                      {s.time || "—"} · {s.vehicleIdKind}
                      {s.direction ? ` · ${s.direction}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="tabular font-black">
                      {Number.isFinite(s.doseNSvH) ? s.doseNSvH : "—"}
                      <span className="text-[10px] font-normal text-gunmetal/50">
                        {" "}
                        nSv/h
                      </span>
                    </div>
                    <div
                      className="text-xs font-black"
                      style={{ color: RESULT_COLOUR[s.result] }}
                    >
                      {s.result}
                    </div>
                  </div>
                </div>
                <div className="mt-1 text-xs text-gunmetal/70 break-words">
                  {s.commodity}
                  <span className="text-gunmetal/50"> · {s.cargoClass}</span>
                  {s.transporter ? (
                    <span className="text-gunmetal/50"> · {s.transporter}</span>
                  ) : null}
                </div>
                {s.action ? (
                  <div className="text-[11px] text-gunmetal/55 mt-0.5">
                    {s.action}
                  </div>
                ) : null}
                {canRemove(s) ? (
                  <button
                    className="link-action mt-1"
                    style={{ color: "var(--status-stalled)" }}
                    disabled={busy === s.id}
                    onClick={() => remove(s)}
                  >
                    {busy === s.id ? "…" : "Remove"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {scans.length > shown ? (
            <div className="px-4 sm:px-5 pt-3 mt-3 border-t border-gunmetal/8">
              <button
                className="btn btn-secondary w-full sm:w-auto"
                onClick={() => setShown((n) => n + PAGE)}
              >
                Show {Math.min(PAGE, scans.length - shown)} more
              </button>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
