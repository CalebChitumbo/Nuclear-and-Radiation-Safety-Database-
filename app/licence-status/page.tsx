"use client";

import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { useToast } from "@/components/Toast";
import {
  buildReport,
  formatReportText,
  linkFacilities,
  parseNotifications,
  type WorkflowReport,
} from "@/lib/rules/parseNotifications";
import {
  WORKFLOW_PHASES,
  type Facility,
  type LicenceWorkflow,
  type WorkflowPhase,
  type WorkflowPriority,
} from "@/lib/rules/types";

const SAMPLE = `Licence Approval CEO data form assigned
Licence Approval CEO data form of AUTH/USE.REN/0872 NFC Africa Mining Plc process has been assigned to you. Please fill in the required information and submit for further processing.
+ Show More
Conditions for Renewal Licence Application
This is to inform you that the Radiation Protection Authority has issued Authorization Terms for this application.
Facility Name - NFC Africa Mining Plc
Workflow RAN - AUTH/USE.REN/0872
+ Show More
Internal Review Remarks data form assigned
Internal Review Remarks data form of RA/0794 KING SALMAN BIN ABDUL-AZIZ SPECIALIST HOSPITAL process has been assigned to you. Please fill in the required information and submit for further processing.
+ Show More
Submission of Invoice for Payment of Authorization
Facillity Name and RAN: KING SALMAN BIN ABDUL-AZIZ SPECIALIST HOSPITAL - FAC/0679
RAN of Authorization: RPA/LIC/0543
+ Show More
Payment Pending
Your payment for Authorization application having RAN RPA/LIC/0543 is pending. You can download the Invoice attached in Payment Workflow having RAN - AUTH/PAY/0978
+ Show More
Accounts Clearance data form assigned
Accounts Clearance data form of AUTH/VAR/0068 UNIVERSITY TEACHING HOSPITAL- NUCLEAR MEDICINE process has been assigned to you. Please fill in the required information and submit for further processing.`;

const PRIORITY_META: Record<
  WorkflowPriority,
  { label: string; chip: string; dot: string }
> = {
  CRITICAL: { label: "🔴 Critical", chip: "red", dot: "#A8362B" },
  HIGH: { label: "🟡 High", chip: "amber", dot: "#B8860B" },
  NORMAL: { label: "🟢 Normal", chip: "green", dot: "#00A050" },
  APPLICANT: { label: "🔵 Applicant", chip: "slate", dot: "#2C5D7A" },
};

export default function LicenceStatusPage() {
  const { user, canEditAS } = useAuth();
  const toast = useToast();
  const { data: facilities } = useStoreData(
    async (s) => s.listFacilities(),
    [],
  );
  const { data: saved, reload } = useStoreData(
    async (s) => s.listLicenceWorkflows(),
    [],
  );

  const [text, setText] = useState(SAMPLE);
  const [rows, setRows] = useState<LicenceWorkflow[] | null>(null);
  const [committing, setCommitting] = useState(false);

  // Parsed-then-linked records once Analyze is clicked; otherwise the persisted
  // set so the board/table survive reloads.
  const records = rows ?? saved ?? [];
  const report: WorkflowReport | null = useMemo(
    () => (records.length ? buildReport(records) : null),
    [records],
  );

  const analyze = () => {
    const parsed = parseNotifications(text);
    const linked = linkFacilities(parsed, facilities || []);
    setRows(linked);
    if (!parsed.length) {
      toast.push("Nothing recognised in the pasted text.", "error");
    } else {
      toast.push(
        `Parsed ${parsed.length} applications from the dashboard.`,
        "success",
      );
    }
  };

  const updateRow = (id: string, patch: Partial<LicenceWorkflow>) => {
    setRows((r) =>
      (r || []).map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const commit = async () => {
    if (!user || !rows) return;
    setCommitting(true);
    try {
      const s = await store();
      const res = await s.saveLicenceWorkflows(rows, user.uid);
      toast.push(
        `Saved ${res.saved} applications · ${res.facilitiesUpdated} facility stages updated.`,
        "success",
      );
      setRows(null);
      reload();
    } catch (err) {
      toast.push(
        `Save failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setCommitting(false);
    }
  };

  const copyReport = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(formatReportText(report));
      toast.push("Report copied to clipboard.", "success");
    } catch {
      toast.push("Could not access clipboard.", "error");
    }
  };

  if (!canEditAS) {
    return (
      <div className="card p-6 text-sm">
        Only Authorisation &amp; Standards officers (or admins) can import RAIS
        licensing status.
      </div>
    );
  }

  const isDirty = rows !== null;

  return (
    <div className="space-y-4 staggered">
      {/* Paste + analyze */}
      <div className="card p-5">
        <label className="caps text-[10px] text-gunmetal/60">
          Paste the RAIS dashboard notifications
        </label>
        <textarea
          className="input mt-1 font-mono-nums"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Copy the whole RAIS 'assigned data forms' feed and paste it here…"
        />
        <div className="text-[11px] text-gunmetal/55 mt-1">
          Each notification (separated by <code>+ Show More</code>) is read,
          grouped per application RAN, and placed in the pipeline. Nothing is
          saved until you press <strong>Save to database</strong>.
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            onClick={analyze}
            disabled={!facilities}
          >
            Analyze dashboard
          </button>
          {isDirty ? (
            <button className="btn btn-ghost" onClick={() => setRows(null)}>
              Discard parse
            </button>
          ) : null}
        </div>
      </div>

      {report ? (
        <>
          <ReportPanel report={report} onCopy={copyReport} />
          <KanbanBoard records={records} />
          <ReviewTable
            records={records}
            facilities={facilities || []}
            editable={isDirty}
            onChange={updateRow}
          />
          {isDirty ? (
            <div className="card p-5 flex flex-wrap items-center gap-3">
              <button
                className="btn btn-primary"
                disabled={committing}
                onClick={commit}
              >
                {committing
                  ? "Saving…"
                  : `Save ${rows?.length ?? 0} applications to database`}
              </button>
              <div className="text-xs text-gunmetal/60">
                Matched facilities will have their stage updated in the register.
              </div>
            </div>
          ) : (
            <div className="text-xs text-gunmetal/55 px-1">
              Showing the last saved status. Paste a fresh dashboard and press
              Analyze to update.
            </div>
          )}
        </>
      ) : (
        <div className="card p-6 text-sm text-gunmetal/60">
          No licensing status yet. Paste the RAIS dashboard above and press{" "}
          <strong>Analyze dashboard</strong> to see where every application sits.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report panel
// ---------------------------------------------------------------------------

function ReportPanel({
  report,
  onCopy,
}: {
  report: WorkflowReport;
  onCopy: () => void;
}) {
  const order: WorkflowPriority[] = ["CRITICAL", "HIGH", "NORMAL", "APPLICANT"];
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-black">Latest update</div>
        <button className="btn btn-secondary" onClick={onCopy}>
          Copy report
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {order.map((p) => (
          <div key={p} className="card p-3">
            <div className="caps text-[10px] text-gunmetal/60">
              {PRIORITY_META[p].label}
            </div>
            <div className="text-3xl font-black tabular">
              {report.byPriority[p].length}
            </div>
          </div>
        ))}
      </div>

      {report.alerts.length ? (
        <div className="mt-4">
          <div className="caps text-[10px] text-gunmetal/60 mb-1">
            Dependency &amp; bottleneck alerts
          </div>
          <ul className="space-y-1">
            {report.alerts.map((a, i) => (
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

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {order.map((p) =>
          report.byPriority[p].length ? (
            <div key={p}>
              <div className="caps text-[10px] text-gunmetal/60 mb-1">
                {PRIORITY_META[p].label} — action required
              </div>
              <ul className="space-y-1">
                {report.byPriority[p].slice(0, 12).map((r) => (
                  <li key={r.id} className="text-sm">
                    <span className="font-bold">{r.facilityName || "(unmatched)"}</span>{" "}
                    <span className="tabular text-gunmetal/55">{r.ran}</span>
                    <span className="text-gunmetal/60">
                      {" "}
                      — {r.stage} → {r.responsibleParty}
                    </span>
                  </li>
                ))}
                {report.byPriority[p].length > 12 ? (
                  <li className="text-xs text-gunmetal/50">
                    +{report.byPriority[p].length - 12} more…
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban board
// ---------------------------------------------------------------------------

function KanbanBoard({ records }: { records: LicenceWorkflow[] }) {
  const columns = WORKFLOW_PHASES.filter(
    (ph) => ph !== "Other" || records.some((r) => r.phase === "Other"),
  );
  return (
    <div className="card p-5 overflow-x-auto">
      <div className="font-black mb-3">Licensing pipeline</div>
      <div className="flex gap-3" style={{ minWidth: "min-content" }}>
        {columns.map((phase) => {
          const items = records.filter((r) => r.phase === phase);
          return (
            <div
              key={phase}
              className="flex-shrink-0"
              style={{ width: 220 }}
            >
              <div className="caps text-[10px] text-gunmetal/60 mb-2 flex items-center justify-between">
                <span>{phase}</span>
                <span className="tabular">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((r) => (
                  <WorkflowCard key={r.id} record={r} />
                ))}
                {!items.length ? (
                  <div className="text-[11px] text-gunmetal/35 py-3 text-center">
                    —
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkflowCard({ record: r }: { record: LicenceWorkflow }) {
  const meta = PRIORITY_META[r.priority];
  return (
    <div
      className="card card-hover p-2.5"
      style={{ borderLeft: `3px solid ${meta.dot}` }}
    >
      <div className="text-sm font-bold leading-tight">
        {r.facilityName || "(unmatched facility)"}
      </div>
      <div className="text-[11px] tabular text-gunmetal/55">{r.ran}</div>
      <div className="text-xs mt-1">{r.stage}</div>
      <div className="text-[11px] text-gunmetal/60 mt-1">{r.responsibleParty}</div>
      {r.outstandingPayment || r.bottleneck || !r.facilityId ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {r.outstandingPayment ? (
            <span className="chip amber">⚠ payment</span>
          ) : null}
          {r.bottleneck ? <span className="chip red">⛔ bottleneck</span> : null}
          {!r.facilityId && r.facilityName ? (
            <span className="chip">no register match</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review / detail table
// ---------------------------------------------------------------------------

function ReviewTable({
  records,
  facilities,
  editable,
  onChange,
}: {
  records: LicenceWorkflow[];
  facilities: Facility[];
  editable: boolean;
  onChange: (id: string, patch: Partial<LicenceWorkflow>) => void;
}) {
  const facOptions = facilities.slice(0, 300);
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-gunmetal/8 font-black">
        {editable ? "Review & correct" : "Tracked applications"}
        <span className="text-xs text-gunmetal/55 font-normal ml-2">
          {records.length} applications
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tbl-sticky">
          <thead>
            <tr className="text-left text-xs caps text-gunmetal/55">
              <th className="px-4 py-2">Facility</th>
              <th className="px-4 py-2">RAN</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Responsible</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Register match</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-t border-gunmetal/8 align-top">
                <td className="px-4 py-3">
                  <div className="font-bold">
                    {r.facilityName || <em>(unmatched)</em>}
                  </div>
                  <div className="text-[11px] text-gunmetal/55">{r.ranType}</div>
                </td>
                <td className="px-4 py-3 tabular">{r.ran || "—"}</td>
                <td className="px-4 py-3">
                  <div>{r.stage}</div>
                  <div className="mt-1 flex gap-1">
                    {r.outstandingPayment ? (
                      <span className="chip amber">payment</span>
                    ) : null}
                    {r.bottleneck ? (
                      <span className="chip red">bottleneck</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">{r.responsibleParty}</td>
                <td className="px-4 py-3">
                  <span className={`chip ${PRIORITY_META[r.priority].chip}`}>
                    {r.priority}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {editable ? (
                    <select
                      className="input"
                      value={r.facilityId || ""}
                      onChange={(e) => {
                        const id = e.target.value;
                        const f = facilities.find((x) => x.id === id);
                        onChange(r.id, {
                          facilityId: id || null,
                          facilityName: f ? f.name : r.facilityName,
                          facCode: f ? f.facCode : r.facCode,
                        });
                      }}
                    >
                      <option value="">— no match —</option>
                      {/* keep the matched facility visible even past the cap */}
                      {r.facilityId &&
                      !facOptions.some((f) => f.id === r.facilityId) ? (
                        <option value={r.facilityId}>{r.facilityName}</option>
                      ) : null}
                      {facOptions.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  ) : r.facilityId ? (
                    <span className="chip green">matched</span>
                  ) : (
                    <span className="chip">unmatched</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
