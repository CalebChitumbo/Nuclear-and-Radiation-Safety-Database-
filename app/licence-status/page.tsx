"use client";

import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { useToast } from "@/components/Toast";
import { AddFacilityDialog } from "@/components/AddFacilityDialog";
import {
  addWorkflowsToRanMap,
  buildReport,
  formatReportText,
  linkByRan,
  linkFacilities,
  parseNotifications,
  ranMapFromFacilities,
  type WorkflowReport,
} from "@/lib/rules/parseNotifications";
import { detectType } from "@/lib/rules/detectType";
import {
  isAmbiguousLicenceRan,
  isUsePossessionWorkflow,
  workflowLicenceType,
} from "@/lib/rules/licenceFamily";
import {
  LICENCE_TYPES,
  WORKFLOW_PHASES,
  isUseP,
  type Facility,
  type LicenceType,
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

// Short labels for the licence family a workflow belongs to. Use/Possession
// (green) drives the facility's renewal status on the register; everything else
// (slate) is a standalone authorisation that does not.
const SHORT_FAMILY: Partial<Record<LicenceType, string>> = {
  "Renewal of Use/Possession Licence": "Renewal",
  "New Use/Possession Licence": "New use",
  "Importation Licence": "Import",
  "Export Licence": "Export",
  "Transfer Licence": "Transfer",
  "Transport Licence": "Transport",
  "Transit Licence": "Transit",
  "Variation of Terms and Conditions": "Variation",
  "Design and Construction Licence": "Design & Construction",
  "Decommissioning Licence": "Decommissioning",
};

/** A chip naming the licence family, so officers see what an update will touch. */
function FamilyChip({ row }: { row: LicenceWorkflow }) {
  const type = workflowLicenceType(row);
  const isUse = isUseP(type);
  return (
    <span
      className={`chip ${isUse ? "green" : "slate"}`}
      title={
        isUse
          ? "Use/Possession — updates the facility's renewal status"
          : "Standalone authorisation — does not change renewal status"
      }
    >
      {SHORT_FAMILY[type] || type}
    </span>
  );
}

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
  // An inbox row the officer is turning into a brand-new register facility.
  const [addingFor, setAddingFor] = useState<LicenceWorkflow | null>(null);

  // The incoming-email inbox: everything the connector queued, awaiting accept.
  // Re-link by RAN in the UI too, so a pending email whose RAN is in the register
  // (or was matched on a sibling notification) shows its facility right away,
  // without waiting for the connector to re-process it.
  const needsReview = useMemo(() => {
    const pending = (saved ?? []).filter((r) => r.reviewStatus === "needs-review");
    const map = addWorkflowsToRanMap(
      ranMapFromFacilities(facilities ?? []),
      saved ?? [],
    );
    return linkByRan(pending, map);
  }, [saved, facilities]);

  const facById = useMemo(
    () => new Map((facilities || []).map((f) => [f.id, f])),
    [facilities],
  );

  // Use/Possession applications whose certificate has been issued but whose
  // facility is not yet officially Licensed — these await the one-click approval
  // below (R1–R6). Standalone authorisations (import/transit/…) are NOT shown:
  // they are recorded automatically when their email is accepted, so surfacing
  // them here too would double-record the authorisation.
  const readyToLicense = useMemo(
    () =>
      (saved ?? []).filter((r) => {
        if (r.reviewStatus === "needs-review") return false;
        if (r.facilityStage !== "Licence / Certificate Issued") return false;
        if (!r.facilityId) return false;
        if (!isUsePossessionWorkflow(r)) return false;
        const f = facById.get(r.facilityId);
        return !!f && !f.licensed;
      }),
    [saved, facById],
  );

  // Parsed-then-linked records once Analyze is clicked; otherwise the persisted
  // set so the board/table survive reloads. Queued (needs-review) items live in
  // their own panel, not the board, until an officer applies them.
  const records =
    rows ?? (saved ?? []).filter((r) => r.reviewStatus !== "needs-review");
  const report: WorkflowReport | null = useMemo(
    () => (records.length ? buildReport(records) : null),
    [records],
  );

  const applyReviewed = async (
    row: LicenceWorkflow,
    facilityId: string | null,
    officerType?: LicenceType,
  ) => {
    if (!user) return;
    const f = facilityId
      ? (facilities || []).find((x) => x.id === facilityId)
      : undefined;
    const rec: LicenceWorkflow = {
      ...row,
      facilityId: facilityId || null,
      facilityName: f ? f.name : row.facilityName,
      facCode: f ? f.facCode : row.facCode,
      officerType: officerType ?? row.officerType,
      reviewStatus: "applied",
      source: row.source ?? "email",
    };
    try {
      const s = await store();
      const res = await s.saveLicenceWorkflows([rec], user.uid);
      toast.push(
        facilityId
          ? `Applied — ${res.facilitiesUpdated} facility stage updated.`
          : "Dismissed from the review queue.",
        "success",
      );
      reload();
    } catch (err) {
      toast.push(
        `Could not apply: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  };

  // Officer confirmation that an issued certificate is now an official licence:
  // records it through the R1–R6 rules (flips licensed for use/possession types).
  const approveLicence = async (
    row: LicenceWorkflow,
    type: LicenceType,
    date: string,
  ) => {
    if (!user || !row.facilityId) return;
    try {
      const s = await store();
      const res = await s.recordLicences(
        [{ facilityId: row.facilityId, number: row.ran, type, date }],
        user.uid,
      );
      toast.push(
        res.summary.newLicensed > 0
          ? `${row.facilityName} is now Licensed.`
          : `Recorded ${type} for ${row.facilityName}.`,
        "success",
      );
      reload();
    } catch (err) {
      toast.push(
        `Could not record licence: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  };

  const analyze = () => {
    const parsed = parseNotifications(text);
    // Match by name first, then rescue RAN-only notifications using the register
    // and everything already imported (the "remembered" RAN → facility links).
    const ranMap = addWorkflowsToRanMap(
      ranMapFromFacilities(facilities || []),
      saved || [],
    );
    const linked = linkByRan(linkFacilities(parsed, facilities || []), ranMap);
    // Carry a previously officer-assigned licence type over to the freshly
    // parsed records for the same RAN, so a classified FORM-I number keeps its
    // type instead of falling back to the guess.
    const typeByRan = new Map<string, LicenceType>();
    for (const w of saved || []) {
      if (w.officerType && w.ran) typeByRan.set(w.ran.toUpperCase(), w.officerType);
    }
    const withTypes = linked.map((r) =>
      !r.officerType && r.ran && typeByRan.has(r.ran.toUpperCase())
        ? { ...r, officerType: typeByRan.get(r.ran.toUpperCase()) }
        : r,
    );
    setRows(withTypes);
    if (!parsed.length) {
      toast.push("Nothing recognised in the pasted text.", "error");
    } else {
      toast.push(
        `Parsed ${parsed.length} applications from the dashboard.`,
        "success",
      );
    }
  };

  // Accept every recognised (facility-matched) incoming email at once — rolls
  // each one's status onto its facility in the register.
  const acceptAllReady = async (readyItems: LicenceWorkflow[]) => {
    if (!user || !readyItems.length) return;
    const recs: LicenceWorkflow[] = readyItems.map((row) => ({
      ...row,
      reviewStatus: "applied",
      source: row.source ?? "email",
    }));
    try {
      const s = await store();
      const res = await s.saveLicenceWorkflows(recs, user.uid);
      toast.push(
        `Applied ${recs.length} update(s) — ${res.facilitiesUpdated} facility status(es) updated.`,
        "success",
      );
      reload();
    } catch (err) {
      toast.push(
        `Could not apply: ${err instanceof Error ? err.message : err}`,
        "error",
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
      {/* The inbox — incoming RAIS emails, each with its status, ready to accept */}
      <IncomingInbox
        items={needsReview}
        facilities={facilities || []}
        onAccept={applyReviewed}
        onAcceptAllReady={acceptAllReady}
        onAddFacility={setAddingFor}
      />

      {/* Create a brand-new register facility from an incoming email, then link it. */}
      <AddFacilityDialog
        key={addingFor?.id ?? "none"}
        open={!!addingFor}
        initialName={addingFor?.facilityName || ""}
        initialFacCode={addingFor?.facCode || ""}
        onClose={() => setAddingFor(null)}
        onCreated={(fac) => {
          if (addingFor) applyReviewed(addingFor, fac.id);
        }}
      />

      {/* The two licence-issuing emails (§4): confirm the type, record via R1–R6 */}
      {readyToLicense.length ? (
        <ReadyToLicense items={readyToLicense} onApprove={approveLicence} />
      ) : null}

      {/* Manual paste + full pipeline board — secondary, tucked behind a disclosure */}
      <details className="card p-4">
        <summary className="font-black cursor-pointer select-none">
          Manual paste &amp; pipeline board
          <span className="text-xs text-gunmetal/55 font-normal ml-2">
            paste a RAIS dashboard feed, or review the full tracked pipeline
          </span>
        </summary>

        <div className="mt-4 space-y-4">
          <div>
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
                    Matched facilities will have their status updated in the
                    register.
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
            <div className="text-sm text-gunmetal/60">
              Paste a RAIS dashboard feed above and press{" "}
              <strong>Analyze dashboard</strong> to see the full pipeline.
            </div>
          )}
        </div>
      </details>
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

  // The register-match control is shared between the desktop table and the
  // mobile card list so editing behaves identically on every screen size.
  const renderMatch = (r: LicenceWorkflow) =>
    editable ? (
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
        {r.facilityId && !facOptions.some((f) => f.id === r.facilityId) ? (
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
    );

  return (
    <div className="card overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gunmetal/8 font-black">
        {editable ? "Review & correct" : "Tracked applications"}
        <span className="text-xs text-gunmetal/55 font-normal ml-2">
          {records.length} applications
        </span>
      </div>

      {/* Tablet & desktop: full table */}
      <div className="hidden md:block overflow-x-auto">
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
                <td className="px-4 py-3">{renderMatch(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards (a 6-column table is unreadable on a phone) */}
      <div className="md:hidden divide-y divide-gunmetal/8">
        {records.map((r) => (
          <div key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold leading-tight">
                  {r.facilityName || <em>(unmatched)</em>}
                </div>
                <div className="text-[11px] text-gunmetal/55">{r.ranType}</div>
              </div>
              <span
                className={`chip ${PRIORITY_META[r.priority].chip} shrink-0`}
              >
                {r.priority}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              <div>
                <div className="caps text-[10px] text-gunmetal/50">RAN</div>
                <div className="text-sm tabular">{r.ran || "—"}</div>
              </div>
              <div>
                <div className="caps text-[10px] text-gunmetal/50">
                  Responsible
                </div>
                <div className="text-sm">{r.responsibleParty}</div>
              </div>
              <div className="col-span-2">
                <div className="caps text-[10px] text-gunmetal/50">Stage</div>
                <div className="text-sm">{r.stage}</div>
                {r.outstandingPayment || r.bottleneck ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.outstandingPayment ? (
                      <span className="chip amber">payment</span>
                    ) : null}
                    {r.bottleneck ? (
                      <span className="chip red">bottleneck</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-3">
              <div className="caps text-[10px] text-gunmetal/50 mb-1">
                Register match
              </div>
              {renderMatch(r)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email connector review queue
// ---------------------------------------------------------------------------

/**
 * The incoming-email inbox. Every RAIS notification the connector imported waits
 * here with its status until an officer accepts it (which rolls that status onto
 * the facility in the register) or dismisses it. Items whose facility is known —
 * matched by name or by RAN — sit in "Ready to apply" and can be accepted in
 * bulk; the rest need a facility picked once (after which future emails for the
 * same application link themselves).
 */
function IncomingInbox({
  items,
  facilities,
  onAccept,
  onAcceptAllReady,
  onAddFacility,
}: {
  items: LicenceWorkflow[];
  facilities: Facility[];
  onAccept: (
    row: LicenceWorkflow,
    facilityId: string | null,
    officerType?: LicenceType,
  ) => void;
  onAcceptAllReady: (rows: LicenceWorkflow[]) => void;
  onAddFacility: (row: LicenceWorkflow) => void;
}) {
  const facOptions = facilities.slice(0, 400);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [pickedType, setPickedType] = useState<Record<string, LicenceType>>({});
  const choiceFor = (r: LicenceWorkflow) => picked[r.id] ?? (r.facilityId || "");
  const statusOf = (r: LicenceWorkflow) => r.currentStatus || r.stage;

  // The licence type to use for a FORM-I (RPA/LIC) number: the officer's pending
  // pick, then any type already assigned to the number, then the best guess.
  const chosenTypeFor = (r: LicenceWorkflow): LicenceType =>
    pickedType[r.id] ?? r.officerType ?? workflowLicenceType(r);
  // For ambiguous LIC numbers the effective type comes from the picker; other
  // RANs keep whatever they already carry.
  const officerTypeFor = (r: LicenceWorkflow): LicenceType | undefined =>
    isAmbiguousLicenceRan(r.ran) ? chosenTypeFor(r) : r.officerType;
  // A row reflecting the pending classification, so the family chip / notes
  // update live as the officer changes the dropdown.
  const effectiveRow = (r: LicenceWorkflow): LicenceWorkflow =>
    isAmbiguousLicenceRan(r.ran) ? { ...r, officerType: chosenTypeFor(r) } : r;

  const ready = items.filter((r) => r.facilityId);
  const needs = items.filter((r) => !r.facilityId);

  if (!items.length) {
    return (
      <div className="card p-5 flex items-center gap-3">
        <span className="chip green shrink-0">✓ inbox clear</span>
        <div className="text-sm text-gunmetal/70">
          No incoming RAIS updates to review. New notification emails appear here
          automatically.
        </div>
      </div>
    );
  }

  // Resolve a row to its currently-chosen facility + type (for the bulk accept).
  const resolveRow = (r: LicenceWorkflow): LicenceWorkflow => {
    const id = choiceFor(r);
    const f = facilities.find((x) => x.id === id);
    return {
      ...r,
      facilityId: id || null,
      facilityName: f ? f.name : r.facilityName,
      facCode: f ? f.facCode : r.facCode,
      officerType: officerTypeFor(r),
    };
  };

  // The FORM-I classifier: only RPA/LIC numbers, whose type can't be read from
  // the number. The choice sticks to the number for every later notification.
  const renderTypePicker = (r: LicenceWorkflow) =>
    isAmbiguousLicenceRan(r.ran) ? (
      <div className="mt-2 rounded-lg bg-mist p-2">
        <div className="caps text-[10px] text-gunmetal/60 mb-1">
          FORM-I licence — set the application type
          {!r.officerType && !pickedType[r.id] ? (
            <span className="text-[var(--status-stalled)]"> · not set</span>
          ) : null}
        </div>
        <select
          className="input"
          value={chosenTypeFor(r)}
          onChange={(e) =>
            setPickedType((p) => ({
              ...p,
              [r.id]: e.target.value as LicenceType,
            }))
          }
        >
          {LICENCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="text-[11px] text-gunmetal/55 mt-1">
          {r.ran} carries no type — your choice sticks to this number for every
          future notification.
        </div>
      </div>
    ) : null;

  return (
    <div
      className="card overflow-hidden"
      style={{ borderLeft: "3px solid var(--rpa-green-dark, #00A050)" }}
    >
      <div className="px-4 sm:px-5 py-3 border-b border-gunmetal/8 flex items-center justify-between gap-2 flex-wrap">
        <div className="font-black">
          Incoming RAIS updates
          <span className="text-xs text-gunmetal/55 font-normal ml-2">
            {items.length} from email — accept to update the register
          </span>
        </div>
        {ready.length ? (
          <button
            className="btn btn-primary shrink-0"
            onClick={() =>
              onAcceptAllReady(
                ready.map(resolveRow).filter((r) => r.facilityId),
              )
            }
          >
            Accept all recognised ({ready.length})
          </button>
        ) : (
          <span className="chip amber shrink-0">✉ auto-imported</span>
        )}
      </div>

      {ready.length ? (
        <>
          <div className="px-4 sm:px-5 pt-3 pb-1 caps text-[10px] text-gunmetal/50">
            Ready to apply — facility recognised
          </div>
          <div className="divide-y divide-gunmetal/8">
            {ready.map((r) => {
              const choice = choiceFor(r);
              return (
                <div key={r.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold leading-tight">
                        {r.facilityName}
                      </div>
                      <div className="text-[11px] text-gunmetal/55">
                        {r.ran} · {r.ranType}
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <FamilyChip row={effectiveRow(r)} />
                        <span className="text-sm font-semibold">
                          {statusOf(r)}
                        </span>
                      </div>
                      {!isUsePossessionWorkflow(effectiveRow(r)) ? (
                        <div className="text-[11px] text-gunmetal/55 mt-1">
                          Standalone authorisation — recorded on the facility,
                          renewal status unchanged.
                        </div>
                      ) : null}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        className="btn btn-primary"
                        onClick={() => onAccept(r, choice || null, officerTypeFor(r))}
                      >
                        Accept
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => onAccept(r, null)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                  {renderTypePicker(r)}
                  <details className="mt-2">
                    <summary className="text-[11px] text-gunmetal/50 cursor-pointer">
                      wrong facility?
                    </summary>
                    <select
                      className="input mt-1"
                      value={choice}
                      onChange={(e) =>
                        setPicked((p) => ({ ...p, [r.id]: e.target.value }))
                      }
                    >
                      {choice && !facOptions.some((f) => f.id === choice) ? (
                        <option value={choice}>{r.facilityName}</option>
                      ) : null}
                      {facOptions.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </details>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {needs.length ? (
        <>
          <div className="px-4 sm:px-5 pt-3 pb-1 caps text-[10px] text-gunmetal/50 border-t border-gunmetal/8">
            Needs a facility — match once; future emails for it link automatically
          </div>
          <div className="divide-y divide-gunmetal/8">
            {needs.map((r) => {
              const choice = choiceFor(r);
              return (
                <div key={r.id} className="p-4">
                  <div className="min-w-0">
                    <div className="font-bold leading-tight">
                      {r.facilityName || (
                        <em className="text-gunmetal/50 font-normal">
                          (facility not named in email)
                        </em>
                      )}
                    </div>
                    <div className="text-[11px] text-gunmetal/55">
                      {r.ran || "no RAN"} · {r.ranType}
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <FamilyChip row={effectiveRow(r)} />
                      <span className="text-sm font-semibold">{statusOf(r)}</span>
                    </div>
                    {r.emailSubject ? (
                      <div className="text-[11px] text-gunmetal/50 truncate">
                        ✉ {r.emailSubject}
                      </div>
                    ) : null}
                  </div>

                  {renderTypePicker(r)}

                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <div className="caps text-[10px] text-gunmetal/50 mb-1">
                        Match to register
                      </div>
                      <select
                        className="input"
                        value={choice}
                        onChange={(e) =>
                          setPicked((p) => ({ ...p, [r.id]: e.target.value }))
                        }
                      >
                        <option value="">— no match (dismiss) —</option>
                        {facOptions.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={() => onAccept(r, choice || null, officerTypeFor(r))}
                    >
                      {choice ? "Apply" : "Dismiss"}
                    </button>
                  </div>

                  {/* New applicant not yet in the register — create + link in one step. */}
                  <button
                    type="button"
                    className="mt-2 text-[11px] font-bold text-[var(--rpa-green-dark,#0a7a4a)] hover:underline"
                    onClick={() => onAddFacility(r)}
                  >
                    + Add{" "}
                    {r.facilityName ? `"${r.facilityName}"` : "a new facility"} to
                    the register
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ready-to-license approval
// ---------------------------------------------------------------------------

/** Best-guess licence type for the approval dropdown: the officer-assigned type
 *  if the number was classified, otherwise inferred from the RAN. */
function defaultLicenceType(r: LicenceWorkflow): LicenceType {
  if (r.officerType) return r.officerType;
  const fallback: LicenceType = /renewal/i.test(r.ranType)
    ? "Renewal of Use/Possession Licence"
    : "New Use/Possession Licence";
  return detectType(r.ran, fallback);
}

/**
 * Applications whose certificate has been issued (stage "Licence / Certificate
 * Issued") but which are not yet officially Licensed. Approving one records the
 * licence through the R1–R6 rules — the deliberate human step that flips the
 * register, feeds the weekly report, and is never done automatically by email.
 *
 * Two RAIS emails land here as explicit cases (spec §4):
 *  - "renewal-auto" (Renewal Approved): pre-filled as a Use/Possession renewal —
 *    one click sets the facility Licensed.
 *  - "form-i-prompt" (Form I Approved): the type is ambiguous, so the officer is
 *    first asked "Is this a Use/Possession licence?". Yes → Licensed; No → pick
 *    the actual type (Import/Transfer/…), recorded as an authorisation only.
 */
function ReadyToLicense({
  items,
  onApprove,
}: {
  items: LicenceWorkflow[];
  onApprove: (row: LicenceWorkflow, type: LicenceType, date: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [picks, setPicks] = useState<
    Record<string, { type: LicenceType; date: string; useP?: boolean }>
  >({});
  const pickFor = (r: LicenceWorkflow) =>
    picks[r.id] || {
      type: defaultLicenceType(r),
      date: today,
      // Form I starts at the common answer (Yes) but the officer must confirm.
      useP: r.special === "form-i-prompt" ? true : undefined,
    };

  return (
    <div
      className="card overflow-hidden"
      style={{ borderLeft: "3px solid var(--status-ok, #00A050)" }}
    >
      <div className="px-4 sm:px-5 py-3 border-b border-gunmetal/8 flex items-center justify-between gap-2">
        <div className="font-black">
          Ready to license
          <span className="text-xs text-gunmetal/55 font-normal ml-2">
            {items.length} issued certificate(s) — approve to record the licence
          </span>
        </div>
        <span className="chip green shrink-0">✓ approve</span>
      </div>

      <div className="divide-y divide-gunmetal/8">
        {items.map((r) => {
          const pick = pickFor(r);
          const set = (
            patch: Partial<{ type: LicenceType; date: string; useP?: boolean }>,
          ) => setPicks((p) => ({ ...p, [r.id]: { ...pick, ...patch } }));
          const isFormI = r.special === "form-i-prompt";
          // Form I "Yes" forces a new Use/Possession licence; otherwise the
          // officer's chosen type wins.
          const effectiveType: LicenceType =
            isFormI && pick.useP ? "New Use/Possession Licence" : pick.type;
          const showTypePicker = !isFormI || pick.useP === false;
          return (
            <div key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold leading-tight">{r.facilityName}</div>
                  <div className="text-[11px] text-gunmetal/55">
                    {r.ran} · {r.ranType}
                  </div>
                </div>
                <span className="chip shrink-0">
                  {r.currentStatus || "Licence / Certificate Issued"}
                </span>
              </div>

              {isFormI ? (
                <div className="mt-3">
                  <div className="caps text-[10px] text-gunmetal/50 mb-1">
                    Is this a Use/Possession licence?
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`btn ${pick.useP ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => set({ useP: true })}
                    >
                      Yes — Use/Possession
                    </button>
                    <button
                      type="button"
                      className={`btn ${pick.useP === false ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => set({ useP: false })}
                    >
                      No — another type
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <div>
                  <div className="caps text-[10px] text-gunmetal/50 mb-1">
                    Licence type
                  </div>
                  {showTypePicker ? (
                    <select
                      className="input"
                      value={pick.type}
                      onChange={(e) => set({ type: e.target.value as LicenceType })}
                    >
                      {LICENCE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="input bg-gunmetal/5 text-gunmetal/70">
                      {effectiveType}
                    </div>
                  )}
                </div>
                <div>
                  <div className="caps text-[10px] text-gunmetal/50 mb-1">Date</div>
                  <input
                    type="date"
                    className="input"
                    value={pick.date}
                    onChange={(e) => set({ date: e.target.value })}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => onApprove(r, effectiveType, pick.date)}
                >
                  {isUseP(effectiveType) ? "Mark Licensed" : "Record authorisation"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
