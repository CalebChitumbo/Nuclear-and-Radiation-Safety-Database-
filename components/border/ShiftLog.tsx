"use client";

/**
 * The running list of what this post has logged today — the shift's own record,
 * kept visible so an officer can see the last few scans without scrolling and
 * fix a mistake straight away.
 */
import { useState } from "react";

import { store } from "@/lib/store";
import { useToast } from "@/components/Toast";
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
      toast.push(
        `Could not remove it: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-gunmetal/8 flex items-center justify-between gap-2 flex-wrap">
        <div className="font-black">
          Today&apos;s log
          <span className="text-xs font-normal text-gunmetal/55 ml-2">
            {scans.length} scan{scans.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {scans.length === 0 ? (
        <div className="p-6 text-sm text-gunmetal/60">
          No trucks logged at this post today yet.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs caps text-gunmetal/55">
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Unit</th>
                  <th className="px-4 py-2">Cargo</th>
                  <th className="px-4 py-2">Transporter</th>
                  <th className="px-4 py-2 text-right">nSv/h</th>
                  <th className="px-4 py-2">Result</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {scans.slice(0, shown).map((s) => (
                  <tr key={s.id} className="border-t border-gunmetal/8">
                    <td className="px-4 py-2 tabular text-gunmetal/70">
                      {s.time || "—"}
                    </td>
                    <td className="px-4 py-2 font-bold">
                      {s.vehicleId}
                      <span className="block text-[11px] font-normal text-gunmetal/50">
                        {s.vehicleIdKind}
                        {s.direction ? ` · ${s.direction}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {s.commodity}
                      <span className="block text-[11px] text-gunmetal/50">
                        {s.cargoClass}
                      </span>
                    </td>
                    <td className="px-4 py-2">{s.transporter}</td>
                    <td className="px-4 py-2 text-right tabular font-bold">
                      {Number.isFinite(s.doseNSvH) ? s.doseNSvH : "—"}
                    </td>
                    <td className="px-4 py-2">
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
                    <td className="px-4 py-2 text-right">
                      {canRemove(s) ? (
                        <button
                          className="text-xs caps font-bold"
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
          {scans.length > shown ? (
            <div className="px-5 py-3 border-t border-gunmetal/8">
              <button
                className="btn btn-secondary text-xs"
                onClick={() => setShown((n) => n + PAGE)}
              >
                Show {Math.min(PAGE, scans.length - shown)} more
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
