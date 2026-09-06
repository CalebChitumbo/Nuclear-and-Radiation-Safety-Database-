"use client";

/**
 * "What changed" — the audit log, read by the people whose figures it is about.
 *
 * The section's cumulative screening figure is read as one number by people who
 * did not enter it. When it moves and nobody recognises the movement, the
 * question is always the same: who changed what, and when. This answers it in
 * the app, on the tab where the figure is read — the alternative is a service
 * account and a terminal, which puts the answer out of reach of the officer
 * who actually needs it.
 *
 * Ordinary logging is not shown by default. A figure being entered for the
 * first time is the system working; a figure being REPLACED, removed, or moved
 * by a lot is what somebody should be able to account for.
 */
import { useMemo, useState } from "react";

import { Panel } from "@/components/Section";
import { auditByActor, netMovement, notableChanges } from "@/lib/rules/auditLog";
import type { AuditEntry } from "@/lib/rules/types";

/** A figure this far off is worth a look whether or not it replaced anything. */
const BIG_MOVE = 1000;

function when(at: string): string {
  return at ? at.slice(0, 16).replace("T", " ") : "";
}

function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString()}`;
}

export function FigureChangesPanel({ entries }: { entries: AuditEntry[] }) {
  const [showAll, setShowAll] = useState(false);

  const notable = useMemo(() => notableChanges(entries, BIG_MOVE), [entries]);
  const shown = useMemo(
    () =>
      (showAll
        ? [...entries].sort((a, b) => b.at.localeCompare(a.at))
        : notable
      ).slice(0, 60),
    [entries, notable, showAll],
  );
  const actors = useMemo(() => auditByActor(notable), [notable]);
  const net = netMovement(notable);

  return (
    <Panel
      title="What changed"
      note={
        showAll
          ? "Every recorded change, newest first."
          : "Figures replaced, removed, or moved by a lot. Routine logging is hidden."
      }
      flush
      action={
        <button
          className="link-action"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Only notable changes" : "Show everything"} →
        </button>
      }
    >
      {entries.length === 0 ? (
        <p className="px-4 sm:px-5 text-sm text-gunmetal/60">
          Nothing recorded yet. Every change to a screening figure, a truck scan
          or the work plan&apos;s opening balances is logged here from the moment
          it happens — who made it, when, and what the figure was before.
        </p>
      ) : (
        <>
          {!showAll && notable.length ? (
            <div className="px-4 sm:px-5 pb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>
                <span className="font-black tabular">{notable.length}</span>{" "}
                notable change{notable.length === 1 ? "" : "s"}
              </span>
              {net !== 0 ? (
                <span>
                  net effect on the reported figures{" "}
                  <span className="font-black tabular">{signed(net)}</span>
                </span>
              ) : null}
              {actors.slice(0, 3).map((a) => (
                <span key={a.actor} className="text-gunmetal/60">
                  {a.name} {a.changes}
                  {a.net ? ` (${signed(a.net)})` : ""}
                </span>
              ))}
            </div>
          ) : null}

          {shown.length === 0 ? (
            <p className="px-4 sm:px-5 pb-4 text-sm text-gunmetal/60">
              Nothing but routine logging — no figure has been replaced or
              removed.
            </p>
          ) : (
            <ul className="divide-y divide-gunmetal/8">
              {shown.map((e) => (
                <ChangeRow key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

function ChangeRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const fields = Object.entries(entry.changed || {});

  return (
    <li className="px-4 sm:px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm">{entry.summary}</div>
          <div className="text-xs text-gunmetal/55 tabular mt-0.5">
            {when(entry.at)}
            {entry.border ? ` · ${entry.border}` : ""}
            {entry.actorIsAuthor ? "" : " · removed by an unrecorded account"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {typeof entry.delta === "number" && entry.delta !== 0 ? (
            <span
              className={`chip tabular ${entry.delta > 0 ? "" : "red"}`}
              title="Effect on the reported figure"
            >
              {signed(entry.delta)}
            </span>
          ) : null}
          <span
            className={`chip ${
              entry.action === "deleted"
                ? "red"
                : entry.action === "updated"
                  ? "amber"
                  : "slate"
            }`}
          >
            {entry.action}
          </span>
        </div>
      </div>
      {fields.length ? (
        <>
          <button
            className="text-xs caps font-bold text-gunmetal/55 mt-1"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide" : `What changed (${fields.length})`}
          </button>
          {open ? (
            <ul className="mt-1 text-xs tabular space-y-0.5">
              {fields.map(([field, { from, to }]) => (
                <li key={field} className="text-gunmetal/70">
                  <span className="font-bold">{field}</span>{" "}
                  {JSON.stringify(from)} → {JSON.stringify(to)}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
