"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Drawer } from "./Drawer";
import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useToast } from "./Toast";
import { todayISO } from "@/lib/rules/week";
import {
  REQUEST_PRIORITY_META,
  REQUEST_STATUS_META,
  allowedActions,
  type InspectionRequestActionKind,
} from "@/lib/rules/inspectionRequests";
import {
  PRE_AUTH_INSPECTION_TARGET,
  SLA_STATE_META,
  inspectionGate,
  inspectionRequestSla,
  slaPhrase,
} from "@/lib/rules/sla";
import {
  INSPECTION_OUTCOMES,
  type InspectionOutcome,
  type InspectionRequest,
  type InspectionRequestEvent,
} from "@/lib/rules/types";

const ACTION_LABEL: Record<InspectionRequestActionKind, string> = {
  acknowledge: "Accept request",
  assign: "Assign inspector",
  start: "Start inspection",
  complete: "Complete + file report",
  close: "Close (report actioned)",
  cancel: "Cancel",
  comment: "Comment",
};

const KIND_ICON: Record<InspectionRequestEvent["kind"], string> = {
  created: "✚",
  acknowledged: "✓",
  assigned: "◎",
  started: "▸",
  completed: "★",
  closed: "⬤",
  cancelled: "✕",
  comment: "❝",
};

export function InspectionRequestDrawer({
  request,
  onClose,
  onChanged,
}: {
  request: InspectionRequest | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user, canEditAS, canEditInsp } = useAuth();
  const toast = useToast();
  const [local, setLocal] = useState<InspectionRequest | null>(request);
  const [open, setOpen] = useState<InspectionRequestActionKind | null>(null);
  const [busy, setBusy] = useState(false);

  // Assign fields
  const [inspector, setInspector] = useState("");
  const [targetDate, setTargetDate] = useState("");
  // Complete fields
  const [outcome, setOutcome] = useState<InspectionOutcome>("Compliant");
  const [reportRef, setReportRef] = useState("");
  const [completedDate, setCompletedDate] = useState(() => todayISO());
  const [findings, setFindings] = useState("");
  // Shared note / reason
  const [note, setNote] = useState("");

  // The drawer keeps its own copy so the timeline updates in place after each
  // action; sync it whenever a different request is opened.
  const shown = local && request && local.id === request.id ? local : request;

  const actions = useMemo(
    () => (shown ? allowedActions(shown, { canEditAS, canEditInsp }) : []),
    [shown, canEditAS, canEditInsp],
  );

  const resetForms = () => {
    setOpen(null);
    setInspector("");
    setTargetDate("");
    setReportRef("");
    setFindings("");
    setNote("");
    setCompletedDate(todayISO());
    setOutcome("Compliant");
  };

  if (!shown) return null;

  const actor = user
    ? { uid: user.uid, name: user.displayName, section: user.section }
    : null;

  const run = async (kind: InspectionRequestActionKind) => {
    if (!actor || busy) return;
    setBusy(true);
    try {
      const s = await store();
      let action;
      switch (kind) {
        case "assign":
          if (!inspector.trim()) {
            toast.push("Enter the inspector's name.", "error");
            setBusy(false);
            return;
          }
          action = {
            kind,
            inspector: inspector.trim(),
            targetDate: targetDate || undefined,
            note: note || undefined,
          };
          break;
        case "complete":
          if (!reportRef.trim()) {
            toast.push("Enter where the report can be found.", "error");
            setBusy(false);
            return;
          }
          action = {
            kind,
            outcome,
            reportRef: reportRef.trim(),
            completedDate,
            findings: findings || undefined,
          };
          break;
        case "cancel":
          if (!note.trim()) {
            toast.push("Give a reason for cancelling.", "error");
            setBusy(false);
            return;
          }
          action = { kind, reason: note.trim() };
          break;
        case "comment":
          if (!note.trim()) {
            toast.push("Comment cannot be empty.", "error");
            setBusy(false);
            return;
          }
          action = { kind, note: note.trim() };
          break;
        default:
          action = { kind, note: note || undefined };
      }
      const updated = await s.updateInspectionRequest(shown.id, action, actor);
      setLocal(updated);
      resetForms();
      onChanged();
      toast.push(
        kind === "comment" ? "Comment added." : `Request ${updated.status}.`,
        "success",
      );
    } catch (err) {
      toast.push(
        `Action failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const statusMeta = REQUEST_STATUS_META[shown.status];
  const priorityMeta = REQUEST_PRIORITY_META[shown.priority];
  const sla = inspectionRequestSla(shown, todayISO());
  const gate = inspectionGate(shown.outcome);

  // The unsatisfactory route: raise the Form II straight off the report, so
  // the further-particulars clock starts with everything prefilled.
  const issueFormII = async () => {
    if (!actor || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.addFurtherParticulars(
        {
          ran: shown.workflowRan,
          facilityId: shown.facilityId,
          facilityName: shown.facilityName,
          facCode: shown.facCode,
          details:
            shown.findings?.trim() ||
            `Address the findings of the ${shown.type.toLowerCase()} inspection (report ${shown.reportRef || "on file"}).`,
          issuedDate: todayISO(),
        },
        actor,
      );
      toast.push(
        "Form II issued — tracked under Licensing Process with its 14-working-day response window.",
        "success",
      );
      onChanged();
    } catch (err) {
      toast.push(
        `Could not issue Form II: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onClose={onClose} title={shown.facilityName}>
      <section>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`chip ${statusMeta.chip}`}>{statusMeta.label}</span>
          <span className={`chip ${priorityMeta.chip}`}>
            {priorityMeta.label} priority
          </span>
          <span className="chip slate">{shown.type}</span>
          {sla ? (
            <span className={`chip ${SLA_STATE_META[sla.state].chip}`}>
              {SLA_STATE_META[sla.state].label} · {slaPhrase(sla)}
            </span>
          ) : null}
          {shown.facCode ? (
            <span className="chip caps">{shown.facCode}</span>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <Field label="Province" value={shown.province || "—"} />
          <Field label="Sector" value={shown.sector || "—"} />
          <Field
            label="Requested by"
            value={`${shown.requestedByName}`}
            sub={fmt(shown.requestedAt)}
          />
          <Field
            label={`SOP due (${PRE_AUTH_INSPECTION_TARGET} working days)`}
            value={sla ? sla.dueDate : "—"}
            sub={shown.neededBy ? `officer asked by ${shown.neededBy}` : undefined}
          />
          {shown.assignedInspector ? (
            <Field
              label="Assigned inspector"
              value={shown.assignedInspector}
              sub={shown.targetDate ? `target ${shown.targetDate}` : undefined}
            />
          ) : null}
          {shown.outcome ? (
            <Field label="Outcome" value={shown.outcome} />
          ) : null}
          {shown.workflowRan ? (
            <div className="col-span-2">
              <Field label="Licensing application (RAN)" value={shown.workflowRan} />
            </div>
          ) : null}
        </dl>

        {shown.reason ? (
          <div className="mt-4">
            <div className="caps text-[10px] text-gunmetal/60">Reason</div>
            <div className="text-sm mt-1 whitespace-pre-line">{shown.reason}</div>
          </div>
        ) : null}

        {shown.reportRef ? (
          <div className="mt-4 card p-3 bg-mist">
            <div className="caps text-[10px] text-gunmetal/60">
              Inspection report
            </div>
            <div className="text-sm mt-1 font-bold break-words">
              {isUrl(shown.reportRef) ? (
                <a
                  className="underline text-[var(--rpa-green-dark)]"
                  href={shown.reportRef}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shown.reportRef}
                </a>
              ) : (
                shown.reportRef
              )}
            </div>
            {shown.findings ? (
              <div className="text-xs text-gunmetal/70 mt-2 whitespace-pre-line">
                {shown.findings}
              </div>
            ) : null}
            {shown.facilityId && shown.inspectionId ? (
              <Link
                href={`/facilities/${shown.facilityId}`}
                className="text-xs caps font-bold text-[var(--rpa-green-dark)] mt-2 inline-block"
              >
                View on facility →
              </Link>
            ) : null}
          </div>
        ) : null}

        {/* The SOP's verification gate: the outcome routes the application. */}
        {gate && shown.type === "Pre-Authorisation" ? (
          <div
            className="mt-4 card p-3"
            style={{
              background: gate.satisfactory
                ? "rgba(0,160,80,0.08)"
                : "rgba(190,49,38,0.07)",
              borderColor: gate.satisfactory
                ? "rgba(0,160,80,0.3)"
                : "rgba(190,49,38,0.3)",
            }}
          >
            <div className="caps text-[10px] text-gunmetal/60">
              Next step per SOP
            </div>
            <div className="text-sm mt-1">{gate.guidance}</div>
            {!gate.satisfactory && canEditAS ? (
              <button
                className="btn btn-secondary mt-2"
                disabled={busy}
                onClick={issueFormII}
              >
                {busy ? "Working…" : "Issue Form II (further particulars)"}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Actions */}
      {actions.length > 0 && actor ? (
        <section className="card p-4 bg-mist">
          <div className="caps text-xs text-gunmetal/60 mb-3">Actions</div>
          <div className="flex gap-2 flex-wrap">
            {actions.map((a) => (
              <button
                key={a}
                className={`btn ${
                  a === "cancel"
                    ? "btn-ghost"
                    : a === "comment"
                      ? "btn-secondary"
                      : "btn-primary"
                }`}
                aria-pressed={open === a}
                onClick={() => setOpen(open === a ? null : a)}
              >
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>

          {open === "assign" ? (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Labeled label="Inspector">
                  <input
                    className="input mt-1"
                    placeholder="Inspector name"
                    value={inspector}
                    onChange={(e) => setInspector(e.target.value)}
                  />
                </Labeled>
                <Labeled label="Target date (optional)">
                  <input
                    type="date"
                    className="input mt-1"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                  />
                </Labeled>
              </div>
              <NoteField note={note} setNote={setNote} label="Note (optional)" />
              <RunButton busy={busy} onClick={() => run("assign")}>
                Assign
              </RunButton>
            </div>
          ) : null}

          {open === "complete" ? (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Labeled label="Outcome">
                  <select
                    className="input mt-1"
                    value={outcome}
                    onChange={(e) =>
                      setOutcome(e.target.value as InspectionOutcome)
                    }
                  >
                    {INSPECTION_OUTCOMES.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="Date conducted">
                  <input
                    type="date"
                    className="input mt-1"
                    value={completedDate}
                    onChange={(e) => setCompletedDate(e.target.value)}
                  />
                </Labeled>
              </div>
              <Labeled label="Report reference / location">
                <input
                  className="input mt-1"
                  placeholder="RPA/INSP/2026/044 or a document link"
                  value={reportRef}
                  onChange={(e) => setReportRef(e.target.value)}
                />
              </Labeled>
              <Labeled label="Findings (optional)">
                <textarea
                  className="input mt-1"
                  rows={3}
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  placeholder="Summary of findings / conditions."
                />
              </Labeled>
              <div className="text-[11px] text-gunmetal/60">
                This files a dated inspection in the Inspectorate log and notifies
                Licensing that the report is ready.
              </div>
              <RunButton busy={busy} onClick={() => run("complete")}>
                File report
              </RunButton>
            </div>
          ) : null}

          {open === "cancel" ? (
            <div className="mt-3 space-y-3">
              <NoteField note={note} setNote={setNote} label="Reason" />
              <RunButton busy={busy} danger onClick={() => run("cancel")}>
                Cancel request
              </RunButton>
            </div>
          ) : null}

          {open === "comment" ? (
            <div className="mt-3 space-y-3">
              <NoteField note={note} setNote={setNote} label="Comment" />
              <RunButton busy={busy} onClick={() => run("comment")}>
                Post comment
              </RunButton>
            </div>
          ) : null}

          {(open === "acknowledge" || open === "start" || open === "close") ? (
            <div className="mt-3 space-y-3">
              {open === "close" &&
              gate?.satisfactory &&
              shown.type === "Pre-Authorisation" ? (
                <div className="text-[11px] text-gunmetal/60">
                  The inspection was satisfactory — closing files this
                  application in the <b>TECHCOM queue</b> automatically, with the
                  report reference bundled.
                </div>
              ) : null}
              <NoteField note={note} setNote={setNote} label="Note (optional)" />
              <RunButton busy={busy} onClick={() => run(open)}>
                {ACTION_LABEL[open]}
              </RunButton>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Timeline */}
      <section>
        <h3 className="caps text-xs text-gunmetal/60 mb-2">
          History &amp; communication
        </h3>
        <ul className="space-y-3">
          {[...shown.timeline].reverse().map((e, i) => (
            <li key={i} className="flex gap-3">
              <div
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs"
                style={{ background: "rgba(0,160,80,0.12)", color: "#0b5" }}
                aria-hidden="true"
              >
                {KIND_ICON[e.kind]}
              </div>
              <div className="min-w-0">
                <div className="text-sm whitespace-pre-line">{e.text}</div>
                <div className="text-[11px] text-gunmetal/55">
                  {e.byName}
                  {e.bySection ? ` · ${e.bySection}` : ""} · {fmt(e.at)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Drawer>
  );
}

function Field({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <dt className="caps text-[10px] text-gunmetal/60">{label}</dt>
      <dd className="font-bold mt-1 break-words">{value}</dd>
      {sub ? <dd className="text-[11px] text-gunmetal/55">{sub}</dd> : null}
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="caps text-[10px] text-gunmetal/60">{label}</label>
      {children}
    </div>
  );
}

function NoteField({
  note,
  setNote,
  label,
}: {
  note: string;
  setNote: (v: string) => void;
  label: string;
}) {
  return (
    <Labeled label={label}>
      <textarea
        className="input mt-1"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </Labeled>
  );
}

function RunButton({
  busy,
  onClick,
  danger,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`btn ${danger ? "btn-ghost" : "btn-primary"}`}
      disabled={busy}
      onClick={onClick}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}
