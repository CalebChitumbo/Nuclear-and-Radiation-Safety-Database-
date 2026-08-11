"use client";

import Link from "next/link";

import { Drawer } from "./Drawer";
import { WorkflowNotesPanel } from "./WorkflowNotesPanel";
import { workflowStatusLabel } from "@/lib/rules/workflowNotes";
import type { LicenceWorkflow, WorkflowPriority } from "@/lib/rules/types";

const PRIORITY_CHIP: Record<WorkflowPriority, string> = {
  CRITICAL: "red",
  HIGH: "amber",
  NORMAL: "green",
  APPLICANT: "slate",
};

/**
 * The per-application drawer on Smart Status Update: everything an officer
 * needs to pick an application up cold — where it stands, who last touched it,
 * the full notes & history trail — and the composer to leave their own note.
 */
export function ApplicationHistoryDrawer({
  workflow,
  isSaved,
  onClose,
  onChanged,
}: {
  workflow: LicenceWorkflow | null;
  /** False when the drawer shows a freshly parsed, not-yet-saved row. */
  isSaved: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  if (!workflow) return null;
  const w = workflow;

  return (
    <Drawer
      open
      onClose={onClose}
      title={w.facilityName || "(unmatched facility)"}
    >
      <section className="card p-4 sm:p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="chip green">{workflowStatusLabel(w) || "—"}</span>
          <span className={`chip ${PRIORITY_CHIP[w.priority]}`}>{w.priority}</span>
          {w.officerType ? <span className="chip slate">{w.officerType}</span> : null}
          {w.source === "email" ? <span className="chip">✉ email</span> : null}
          {w.reviewStatus === "needs-review" ? (
            <span className="chip amber">awaiting accept</span>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Field label="Application RAN" value={w.ran || "—"} tabular />
          <Field label="Type" value={w.ranType || "—"} />
          <Field label="Pipeline phase" value={w.phase} />
          <Field label="Responsible" value={w.responsibleParty || "—"} />
          <Field label="Last seen" value={w.lastSeen || "—"} tabular />
          {w.paymentRan ? (
            <Field label="Payment RAN" value={w.paymentRan} tabular />
          ) : null}
        </dl>

        {w.alerts?.length ? (
          <div className="mt-4">
            <div className="caps text-[10px] text-gunmetal/60 mb-1">Alerts</div>
            <ul className="space-y-1">
              {w.alerts.map((a, i) => (
                <li
                  key={i}
                  className="text-sm flex items-start gap-2 text-[var(--status-stalled)]"
                >
                  <span aria-hidden="true">⚠</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {w.facilityId ? (
          <Link
            href={`/facilities/${w.facilityId}`}
            className="link-action mt-3 inline-block"
          >
            View facility →
          </Link>
        ) : null}
      </section>

      <section className="card p-4 sm:p-5">
        <WorkflowNotesPanel
          workflow={w}
          isSaved={isSaved}
          onChanged={onChanged}
        />
      </section>
    </Drawer>
  );
}

function Field({
  label,
  value,
  tabular,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div>
      <dt className="caps text-[10px] text-gunmetal/60">{label}</dt>
      <dd className={`font-bold mt-1 break-words ${tabular ? "tabular" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
