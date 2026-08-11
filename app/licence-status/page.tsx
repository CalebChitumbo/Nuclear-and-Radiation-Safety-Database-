"use client";

import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { isMockMode } from "@/lib/firebase";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { ApplicationHistoryDrawer } from "@/components/ApplicationHistoryDrawer";
import { FacilitySelect } from "@/components/FacilitySelect";
import { LoadErrorBanner } from "@/components/LoadError";
import { Kpi } from "@/components/Kpi";
import { Panel } from "@/components/Section";
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
import { todayISO } from "@/lib/rules/week";
import {
  isAmbiguousLicenceRan,
  isUsePossessionWorkflow,
  needsTypeClassification,
  workflowLicenceType,
} from "@/lib/rules/licenceFamily";
import {
  latestWorkflowComment,
  workflowCommentCount,
} from "@/lib/rules/workflowNotes";
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

/**
 * The latest officer note on an application, surfaced right where the accept /
 * approve decision happens — so the background a colleague left ("waiting on
 * POP", "director unreachable") is read BEFORE acting, plus the door into the
 * full notes & history trail.
 */
function NotePeek({
  row,
  onOpen,
}: {
  row: LicenceWorkflow;
  onOpen: () => void;
}) {
  const last = latestWorkflowComment(row);
  const n = workflowCommentCount(row);
  return (
    <div className="mt-2 flex items-start gap-2 flex-wrap">
      {last ? (
        <div className="text-[11px] text-gunmetal/70 bg-mist rounded-lg px-2 py-1 min-w-0">
          ❝{" "}
          <span className="italic">
            {last.text.length > 140 ? `${last.text.slice(0, 140)}…` : last.text}
          </span>
          <span className="text-gunmetal/50">
            {" "}
            — {last.byName || "Officer"}
          </span>
        </div>
      ) : null}
      <button
        type="button"
        className="text-[11px] font-bold text-[var(--rpa-green-dark,#0a7a4a)] hover:underline shrink-0"
        onClick={onOpen}
      >
        💬 Notes &amp; history{n ? ` (${n})` : ""}
      </button>
    </div>
  );
}

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
  const { data: facilities, error: facError, reload: reloadFacs } = useStoreData(
    async (s) => s.listFacilities(),
    [],
  );
  const { data: saved, error: savedError, reload } = useStoreData(
    async (s) => s.listLicenceWorkflows(),
    [],
  );

  // Demo feed only in mock mode — a production paste box must not ship
  // pre-filled with fabricated notifications one stray click could save.
  const [text, setText] = useState(isMockMode ? SAMPLE : "");
  const [rows, setRows] = useState<LicenceWorkflow[] | null>(null);
  const [committing, setCommitting] = useState(false);
  // In-flight guard shared by every accept/approve action: a double-click must
  // not record the same licence event or authorisation twice.
  const [saving, setSaving] = useState(false);
  // An inbox row the officer is turning into a brand-new register facility.
  const [addingFor, setAddingFor] = useState<LicenceWorkflow | null>(null);
  // The application whose notes & history drawer is open.
  const [viewing, setViewing] = useState<LicenceWorkflow | null>(null);

  // Who is acting — stamped onto comments and automatic history entries so the
  // trail answers "which officer was working on this".
  const actor = user
    ? { uid: user.uid, name: user.displayName, section: user.section }
    : undefined;

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

  // The persisted record for each RAN — the notes & history trail lives there.
  // A freshly parsed board row is resolved through this map so the drawer always
  // shows the saved trail (and comments attach to the tracked record).
  const savedByRan = useMemo(() => {
    const m = new Map<string, LicenceWorkflow>();
    for (const w of saved || []) m.set((w.ran || w.id).toUpperCase(), w);
    return m;
  }, [saved]);
  const savedFor = (r: LicenceWorkflow) =>
    savedByRan.get((r.ran || r.id).toUpperCase());
  const openHistory = (r: LicenceWorkflow) => setViewing(savedFor(r) ?? r);
  const commentCountFor = (r: LicenceWorkflow) =>
    workflowCommentCount(savedFor(r) ?? r);

  // Fallback panel: Use/Possession applications whose certificate has been issued
  // but whose facility is still not Licensed. Accepting a confirmed Use/Possession
  // certificate now licenses its facility automatically (saveLicenceWorkflows runs
  // R1–R6), so a row only lands here in the edge case where that could not record
  // the licence (e.g. the email carried no RAN) — a manual override. Standalone
  // authorisations (import/transit/…) are NOT shown: they are recorded
  // automatically on accept, so surfacing them here too would double-record.
  const readyToLicense = useMemo(
    () =>
      (saved ?? []).filter((r) => {
        if (r.reviewStatus === "needs-review") return false;
        if (r.facilityStage !== "Licence / Certificate Issued") return false;
        if (!r.facilityId) return false;
        if (needsTypeClassification(r)) return false; // FORM-I awaiting classification
        if (!isUsePossessionWorkflow(r)) return false;
        const f = facById.get(r.facilityId);
        return !!f && !f.licensed;
      }),
    [saved, facById],
  );

  // Parsed-then-linked records once Analyze is clicked; otherwise the persisted
  // set so the board/table survive reloads. Queued (needs-review) items live in
  // their own panel, not the board, until an officer applies them. Memoized —
  // a fresh array identity here would defeat the buildReport memo and recompute
  // the whole report on every textarea keystroke.
  const records = useMemo(
    () => rows ?? (saved ?? []).filter((r) => r.reviewStatus !== "needs-review"),
    [rows, saved],
  );
  const report: WorkflowReport | null = useMemo(
    () => (records.length ? buildReport(records) : null),
    [records],
  );

  const applyReviewed = async (
    row: LicenceWorkflow,
    facilityId: string | null,
    officerType?: LicenceType,
  ) => {
    if (!user || saving) return;
    setSaving(true);
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
      const res = await s.saveLicenceWorkflows([rec], user.uid, actor);
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
    } finally {
      setSaving(false);
    }
  };

  // Officer confirmation that an issued certificate is now an official licence:
  // records it through the R1–R6 rules (flips licensed for use/possession types).
  const approveLicence = async (
    row: LicenceWorkflow,
    type: LicenceType,
    date: string,
  ) => {
    if (!user || !row.facilityId || saving) return;
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  };

  const analyze = () => {
    const parsed = parseNotifications(text);
    if (!parsed.length) {
      // Keep the saved pipeline view — replacing it with an empty dirty state
      // would blank the board for a bad paste.
      toast.push("Nothing recognised in the pasted text.", "error");
      return;
    }
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
    toast.push(
      `Parsed ${parsed.length} applications from the dashboard.`,
      "success",
    );
  };

  // Accept every recognised (facility-matched) incoming email at once — rolls
  // each one's status onto its facility in the register.
  const acceptAllReady = async (readyItems: LicenceWorkflow[]) => {
    if (!user || !readyItems.length || saving) return;
    setSaving(true);
    const recs: LicenceWorkflow[] = readyItems.map((row) => ({
      ...row,
      reviewStatus: "applied",
      source: row.source ?? "email",
    }));
    try {
      const s = await store();
      const res = await s.saveLicenceWorkflows(recs, user.uid, actor);
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
    } finally {
      setSaving(false);
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
      const res = await s.saveLicenceWorkflows(rows, user.uid, actor);
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
      <Panel>
        <p className="text-sm">
          Only Authorisation &amp; Standards officers (or admins) can import RAIS
          licensing status.
        </p>
      </Panel>
    );
  }

  const isDirty = rows !== null;

  return (
    <div className="space-y-4 staggered">
      {facError || savedError ? (
        <LoadErrorBanner
          error={facError || savedError || ""}
          onRetry={() => {
            reloadFacs();
            reload();
          }}
        />
      ) : null}

      {/* Per-application notes & history — the officers' shared memory pad */}
      <ApplicationHistoryDrawer
        workflow={viewing}
        isSaved={!!(viewing && savedFor(viewing))}
        onClose={() => setViewing(null)}
        onChanged={reload}
      />

      {/* The inbox — incoming RAIS emails, each with its status, ready to accept */}
      <IncomingInbox
        items={needsReview}
        facilities={facilities || []}
        busy={saving}
        onAccept={applyReviewed}
        onAcceptAllReady={acceptAllReady}
        onAddFacility={setAddingFor}
        onOpenHistory={openHistory}
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
        <ReadyToLicense
          items={readyToLicense}
          busy={saving}
          onApprove={approveLicence}
          onOpenHistory={openHistory}
        />
      ) : null}

      {/* Manual paste + full pipeline board — secondary, tucked behind a disclosure */}
      <details className="card bleed p-4 sm:p-5">
        <summary className="font-black cursor-pointer select-none py-1">
          Manual paste &amp; pipeline board
          <span className="block sm:inline text-xs text-gunmetal/55 font-normal sm:ml-2">
            paste a RAIS dashboard feed, or review the full tracked pipeline
          </span>
        </summary>

        <div className="mt-4 space-y-4">
          <div>
            <label className="field-label" htmlFor="rais-paste">
              Paste the RAIS dashboard notifications
            </label>
            <textarea
              id="rais-paste"
              className="input font-mono-nums"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Copy the whole RAIS 'assigned data forms' feed and paste it here…"
            />
            <p className="text-[11px] text-gunmetal/55 mt-1">
              Each notification (separated by <code>+ Show More</code>) is read,
              grouped per application RAN, and placed in the pipeline. Nothing is
              saved until you press <strong>Save to database</strong>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn btn-primary flex-1 sm:flex-none"
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
              <KanbanBoard
                records={records}
                onOpen={openHistory}
                commentCountFor={commentCountFor}
              />
              <ReviewTable
                records={records}
                facilities={facilities || []}
                editable={isDirty}
                onChange={updateRow}
                onOpenHistory={openHistory}
                commentCountFor={commentCountFor}
              />
              {isDirty ? (
                <div className="inset p-4 flex flex-wrap items-center gap-3">
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
    <Panel
      title="Latest update"
      action={
        <button className="btn btn-secondary" onClick={onCopy}>
          Copy report
        </button>
      }
    >
      <div className="stat-grid grid-cols-2 md:grid-cols-4">
        {order.map((p) => (
          <Kpi
            key={p}
            label={PRIORITY_META[p].label}
            value={report.byPriority[p].length}
          />
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
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Kanban board
// ---------------------------------------------------------------------------

function KanbanBoard({
  records,
  onOpen,
  commentCountFor,
}: {
  records: LicenceWorkflow[];
  onOpen: (r: LicenceWorkflow) => void;
  commentCountFor: (r: LicenceWorkflow) => number;
}) {
  const columns = WORKFLOW_PHASES.filter(
    (ph) => ph !== "Other" || records.some((r) => r.phase === "Other"),
  );
  return (
    <Panel
      title="Licensing pipeline"
      note="Tap an application for its notes &amp; history. The board scrolls sideways."
      className="overflow-x-auto"
    >
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
                  <WorkflowCard
                    key={r.id}
                    record={r}
                    comments={commentCountFor(r)}
                    onOpen={() => onOpen(r)}
                  />
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
    </Panel>
  );
}

function WorkflowCard({
  record: r,
  comments,
  onOpen,
}: {
  record: LicenceWorkflow;
  comments: number;
  onOpen: () => void;
}) {
  const meta = PRIORITY_META[r.priority];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inset p-2.5 w-full text-left block transition-colors hover:brightness-[0.98]"
      style={{ borderLeft: `3px solid ${meta.dot}` }}
      title="Open notes & history"
    >
      <div className="text-sm font-bold leading-tight">
        {r.facilityName || "(unmatched facility)"}
      </div>
      <div className="text-[11px] tabular text-gunmetal/55">{r.ran}</div>
      <div className="text-xs mt-1">{r.stage}</div>
      <div className="text-[11px] text-gunmetal/60 mt-1">{r.responsibleParty}</div>
      {r.outstandingPayment || r.bottleneck || !r.facilityId || comments > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {comments > 0 ? (
            <span className="chip green" title={`${comments} officer note(s)`}>
              💬 {comments}
            </span>
          ) : null}
          {r.outstandingPayment ? (
            <span className="chip amber">⚠ payment</span>
          ) : null}
          {r.bottleneck ? <span className="chip red">⛔ bottleneck</span> : null}
          {!r.facilityId && r.facilityName ? (
            <span className="chip">no register match</span>
          ) : null}
        </div>
      ) : null}
    </button>
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
  onOpenHistory,
  commentCountFor,
}: {
  records: LicenceWorkflow[];
  facilities: Facility[];
  editable: boolean;
  onChange: (id: string, patch: Partial<LicenceWorkflow>) => void;
  onOpenHistory: (r: LicenceWorkflow) => void;
  commentCountFor: (r: LicenceWorkflow) => number;
}) {
  // The register-match control is shared between the desktop table and the
  // mobile card list so editing behaves identically on every screen size.
  const renderMatch = (r: LicenceWorkflow) =>
    editable ? (
      <FacilitySelect
        facilities={facilities}
        value={r.facilityId}
        onChange={(id) => {
          const f = id ? facilities.find((x) => x.id === id) : undefined;
          onChange(r.id, {
            facilityId: id,
            facilityName: f ? f.name : r.facilityName,
            facCode: f ? f.facCode : r.facCode,
          });
        }}
      />
    ) : r.facilityId ? (
      <span className="chip green">matched</span>
    ) : (
      <span className="chip">unmatched</span>
    );

  // Shared by both layouts: open the application's notes & history trail.
  const renderNotes = (r: LicenceWorkflow) => {
    const n = commentCountFor(r);
    return (
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => onOpenHistory(r)}
        title="Notes & history"
      >
        💬 {n > 0 ? n : "Notes"}
      </button>
    );
  };

  return (
    <Panel
      title={`${editable ? "Review & correct" : "Tracked applications"} — ${records.length} applications`}
      flush
    >
      {/* Tablet & desktop: full table */}
      <div className="hidden md:block table-wrap">
        <table className="data tbl-sticky">
          <thead>
            <tr>
              <th>Facility</th>
              <th>RAN</th>
              <th>Stage</th>
              <th>Responsible</th>
              <th>Priority</th>
              <th>Register match</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="font-bold">
                    {r.facilityName || <em>(unmatched)</em>}
                  </div>
                  <div className="text-[11px] text-gunmetal/55">{r.ranType}</div>
                </td>
                <td className="tabular">{r.ran || "—"}</td>
                <td>
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
                <td>{r.responsibleParty}</td>
                <td>
                  <span className={`chip ${PRIORITY_META[r.priority].chip}`}>
                    {r.priority}
                  </span>
                </td>
                <td style={{ minWidth: 200 }}>{renderMatch(r)}</td>
                <td>{renderNotes(r)}</td>
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

            <div className="mt-3">{renderNotes(r)}</div>
          </div>
        ))}
      </div>
    </Panel>
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
  busy,
  onAccept,
  onAcceptAllReady,
  onAddFacility,
  onOpenHistory,
}: {
  items: LicenceWorkflow[];
  facilities: Facility[];
  busy: boolean;
  onAccept: (
    row: LicenceWorkflow,
    facilityId: string | null,
    officerType?: LicenceType,
  ) => void;
  onAcceptAllReady: (rows: LicenceWorkflow[]) => void;
  onAddFacility: (row: LicenceWorkflow) => void;
  onOpenHistory: (row: LicenceWorkflow) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [pickedType, setPickedType] = useState<Record<string, LicenceType>>({});
  const choiceFor = (r: LicenceWorkflow) => picked[r.id] ?? (r.facilityId || "");
  const statusOf = (r: LicenceWorkflow) => r.currentStatus || r.stage;

  // The type assigned to a FORM-I (RPA/LIC) number: the officer's pending pick,
  // then any type already saved on the number. No guessed fallback — a FORM-I
  // number must be classified before it can be accepted.
  const assignedTypeFor = (r: LicenceWorkflow): LicenceType | undefined =>
    pickedType[r.id] ?? r.officerType;
  // A FORM-I number still awaiting its (required) classification.
  const needsType = (r: LicenceWorkflow): boolean =>
    isAmbiguousLicenceRan(r.ran) && !assignedTypeFor(r);
  // The officerType to persist on accept (only FORM-I numbers carry one).
  const officerTypeFor = (r: LicenceWorkflow): LicenceType | undefined =>
    isAmbiguousLicenceRan(r.ran) ? assignedTypeFor(r) : r.officerType;
  // A row reflecting the pending classification, so the family chip / notes
  // update live as the officer picks a type.
  const effectiveRow = (r: LicenceWorkflow): LicenceWorkflow => {
    const t = officerTypeFor(r);
    return t ? { ...r, officerType: t } : r;
  };
  // A confirmed Use/Possession certificate whose facility is not yet Licensed:
  // accepting it sets the facility Licensed (saveLicenceWorkflows runs R1–R6).
  // Evaluated against the facility the officer has CURRENTLY picked (the
  // "wrong facility?" re-pick), not the original match — the banner must
  // describe what Accept will actually do.
  const willLicense = (r: LicenceWorkflow): boolean => {
    if (needsType(r)) return false;
    if (r.facilityStage !== "Licence / Certificate Issued") return false;
    if (!isUsePossessionWorkflow(effectiveRow(r))) return false;
    const id = choiceFor(r);
    const f = id ? facilities.find((x) => x.id === id) : undefined;
    return !!f && !f.licensed;
  };

  const ready = items.filter((r) => r.facilityId);
  const needs = items.filter((r) => !r.facilityId);

  if (!items.length) {
    return (
      <div className="card bleed p-4 sm:p-5 flex items-center gap-3 flex-wrap">
        <span className="chip green shrink-0">✓ inbox clear</span>
        <div className="text-sm text-gunmetal/70 min-w-0">
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
      <div
        className="mt-2 rounded-lg p-2"
        style={{
          background: needsType(r) ? "rgba(184,134,11,0.10)" : "var(--mist)",
          border: needsType(r) ? "1px solid rgba(184,134,11,0.35)" : "none",
        }}
      >
        <div className="caps text-[10px] text-gunmetal/60 mb-1">
          FORM-I licence — choose the application type
          <span className="text-[var(--status-stalled)]"> · required</span>
        </div>
        <select
          className="input"
          value={assignedTypeFor(r) ?? ""}
          onChange={(e) =>
            setPickedType((p) => ({
              ...p,
              [r.id]: e.target.value as LicenceType,
            }))
          }
        >
          <option value="" disabled>
            — choose type —
          </option>
          {LICENCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="text-[11px] text-gunmetal/55 mt-1">
          {r.ran} carries no type — it can&apos;t be accepted until you choose
          one. Your choice sticks to this number for every future notification.
        </div>
      </div>
    ) : null;

  return (
    <div
      className="card bleed overflow-hidden"
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
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              className="btn btn-primary"
              disabled={busy || ready.every((r) => needsType(r))}
              onClick={() =>
                onAcceptAllReady(
                  ready
                    .filter((r) => !needsType(r))
                    .map(resolveRow)
                    .filter((r) => r.facilityId),
                )
              }
            >
              {busy
                ? "Applying…"
                : `Accept all recognised (${ready.filter((r) => !needsType(r)).length})`}
            </button>
            {ready.some((r) => needsType(r)) ? (
              <span className="text-[11px] text-gunmetal/55">
                {ready.filter((r) => needsType(r)).length} FORM-I need a type first
              </span>
            ) : null}
          </div>
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
                        {needsType(r) ? (
                          <span className="chip amber">⚠ choose type</span>
                        ) : (
                          <FamilyChip row={effectiveRow(r)} />
                        )}
                        <span className="text-sm font-semibold">
                          {statusOf(r)}
                        </span>
                      </div>
                      {!needsType(r) && !isUsePossessionWorkflow(effectiveRow(r)) ? (
                        <div className="text-[11px] text-gunmetal/55 mt-1">
                          Standalone authorisation — recorded on the facility,
                          renewal status unchanged.
                        </div>
                      ) : null}
                      {willLicense(r) ? (
                        <div
                          className="text-[11px] mt-1 font-semibold"
                          style={{ color: "var(--status-ok, #00A050)" }}
                        >
                          Use/Possession certificate — accepting sets this
                          facility Licensed.
                        </div>
                      ) : null}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        className="btn btn-primary"
                        disabled={busy || needsType(r)}
                        title={
                          needsType(r)
                            ? "Choose the FORM-I application type first"
                            : undefined
                        }
                        onClick={() => onAccept(r, choice || null, officerTypeFor(r))}
                      >
                        Accept
                      </button>
                      <button
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => onAccept(r, null)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                  <NotePeek row={r} onOpen={() => onOpenHistory(r)} />
                  {renderTypePicker(r)}
                  <details className="mt-2">
                    <summary className="text-[11px] text-gunmetal/50 cursor-pointer">
                      wrong facility?
                    </summary>
                    <FacilitySelect
                      className="input mt-1"
                      facilities={facilities}
                      value={choice || null}
                      emptyLabel="— pick the facility —"
                      onChange={(id) =>
                        setPicked((p) => ({ ...p, [r.id]: id || "" }))
                      }
                    />
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
                      {needsType(r) ? (
                        <span className="chip amber">⚠ choose type</span>
                      ) : (
                        <FamilyChip row={effectiveRow(r)} />
                      )}
                      <span className="text-sm font-semibold">{statusOf(r)}</span>
                    </div>
                    {r.emailSubject ? (
                      <div className="text-[11px] text-gunmetal/50 truncate">
                        ✉ {r.emailSubject}
                      </div>
                    ) : null}
                  </div>

                  <NotePeek row={r} onOpen={() => onOpenHistory(r)} />
                  {renderTypePicker(r)}

                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <div className="caps text-[10px] text-gunmetal/50 mb-1">
                        Match to register
                      </div>
                      <FacilitySelect
                        facilities={facilities}
                        value={choice || null}
                        emptyLabel="— no match (dismiss) —"
                        onChange={(id) =>
                          setPicked((p) => ({ ...p, [r.id]: id || "" }))
                        }
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={busy || (!!choice && needsType(r))}
                      title={
                        choice && needsType(r)
                          ? "Choose the FORM-I application type first"
                          : undefined
                      }
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
 * Manual-override panel for issued certificates (stage "Licence / Certificate
 * Issued") whose facility is still not Licensed. Accepting a confirmed
 * Use/Possession certificate now licenses the facility automatically through the
 * R1–R6 rules, so this panel is normally empty; it only catches the edge cases
 * the auto-path skips (e.g. an issued email that carried no RAN to record).
 * Approving a row records the licence through the same R1–R6 rules, flipping the
 * register and feeding the weekly report.
 *
 * A row can still carry one of the two RAIS issuing specials (§4):
 *  - "renewal-auto" (Renewal Approved): pre-filled as a Use/Possession renewal —
 *    one click sets the facility Licensed.
 *  - "form-i-prompt" (Form I Approved): the type is ambiguous, so the officer is
 *    first asked "Is this a Use/Possession licence?". Yes → Licensed; No → pick
 *    the actual type (Import/Transfer/…), recorded as an authorisation only.
 */
function ReadyToLicense({
  items,
  busy,
  onApprove,
  onOpenHistory,
}: {
  items: LicenceWorkflow[];
  busy: boolean;
  onApprove: (row: LicenceWorkflow, type: LicenceType, date: string) => void;
  onOpenHistory: (row: LicenceWorkflow) => void;
}) {
  const today = todayISO();
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
      className="card bleed overflow-hidden"
      style={{ borderLeft: "3px solid var(--rpa-green, #00A050)" }}
    >
      <div className="px-4 sm:px-5 py-3 border-b border-gunmetal/8 flex items-center justify-between gap-2 flex-wrap">
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

              <NotePeek row={r} onOpen={() => onOpenHistory(r)} />

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
                  disabled={busy}
                  onClick={() => onApprove(r, effectiveType, pick.date)}
                >
                  {busy
                    ? "Recording…"
                    : isUseP(effectiveType)
                      ? "Mark Licensed"
                      : "Record authorisation"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
