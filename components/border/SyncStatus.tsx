"use client";

/**
 * The one line an officer at a post with no signal needs: is the phone
 * offline, how many scans are saved here but not yet on the server, and did
 * the server refuse any of them.
 *
 * It stays out of the way when everything is through — most of the time it
 * renders nothing at all.
 */
import { useEffect, useRef } from "react";

import { useToast } from "@/components/Toast";
import { dismissWriteFailure } from "@/lib/store/writeQueue";
import { useOnline, useWriteQueue } from "@/lib/storeHooks";
import { scanWriteErrorMessage } from "@/lib/rules/borderScans";

export function SyncStatus({ pending }: { pending: number }) {
  const online = useOnline();
  const { failures } = useWriteQueue();
  const toast = useToast();

  // A refusal can arrive long after the officer moved on — say so out loud
  // once, and leave the banner to hold the detail until it is dismissed.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    const latest = failures[0];
    if (!latest || latest.id === announced.current) return;
    announced.current = latest.id;
    toast.push(`The server refused ${latest.label} — see the note above the log.`, "error");
  }, [failures, toast]);

  if (online && !pending && !failures.length) return null;

  return (
    <div className="space-y-2">
      {!online || pending ? (
        <div
          role="status"
          className="card bleed p-3 text-sm flex flex-wrap items-center gap-2"
          style={{ borderLeft: "3px solid #7a5b07" }}
        >
          <span className="chip amber">
            {online ? "Syncing" : "No signal"}
          </span>
          <span className="min-w-0">
            {pending
              ? `${pending} scan${pending === 1 ? "" : "s"} saved on this device, not yet on the server.`
              : "Scans are saved on this device and sent when the connection returns."}
            {!online && pending ? " They go when the connection returns." : null}
          </span>
        </div>
      ) : null}

      {failures.map((f) => (
        <div
          key={f.id}
          role="alert"
          className="card bleed p-3 text-sm flex flex-wrap items-start justify-between gap-3"
          style={{ borderLeft: "3px solid var(--status-stalled)" }}
        >
          <span className="min-w-0">
            <span className="chip red mr-2">Refused</span>
            <strong>{f.label}</strong> was not saved — log it again.{" "}
            <span className="text-gunmetal/60">{scanWriteErrorMessage(f.message)}</span>
          </span>
          <button className="link-action shrink-0" onClick={() => dismissWriteFailure(f.id)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
