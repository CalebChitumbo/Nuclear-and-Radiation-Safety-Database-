"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { FacilitySelect } from "@/components/FacilitySelect";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import {
  FORM_I_CHECKLIST,
  checklistComplete,
  checklistPatch,
  checklistProgress,
} from "@/lib/rules/checklist";
import {
  COMMITTEE_STATUS_META,
  allowedCommitteeActions,
  committeeStats,
  isActiveSubmission,
  type CommitteeAction,
  type CommitteeActionKind,
} from "@/lib/rules/committee";
import {
  FORM_II_STATE_META,
  formIIState,
  formIIStats,
} from "@/lib/rules/formII";
import {
  AGEING_STATE_META,
  FURTHER_PARTICULARS_TARGET,
  NEW_LICENCE_TARGET,
  PRE_AUTH_INSPECTION_TARGET,
  RENEWAL_TARGET,
  applicationAgeing,
  isRenewalRan,
  overdueInspectionRequests,
} from "@/lib/rules/sla";
import { todayISO } from "@/lib/rules/week";
import {
  COMMITTEE_STATUSES,
  type CommitteeStatus,
  type CommitteeSubmission,
  type Facility,
  type FurtherParticularsRecord,
  type LicenceWorkflow,
} from "@/lib/rules/types";

const AGEING_PAGE_SIZE = 25;

export default function LicensingProcessPage() {
  const { user, canEditAS } = useAuth();
  const { data, error, reload } = useStoreData(async (s) => {
    const [facilities, workflows, submissions, formIIs, requests] =
      await Promise.all([
        s.listFacilities(),
        s.listLicenceWorkflows().catch(() => []),
        // New collections degrade to empty until their rules are deployed.
        s.listCommitteeSubmissions().catch(() => []),
        s.listFurtherParticulars().catch(() => []),
        s.listInspectionRequests().catch(() => []),
      ]);
    return { facilities, workflows, submissions, formIIs, requests };
  }, []);

  const today = todayISO();
  const ageing = useMemo(
    () => applicationAgeing(data?.workflows || [], today),
    [data, today],
  );
  const cStats = useMemo(
    () => committeeStats(data?.submissions || []),
    [data],
  );
  const fStats = useMemo(
    () => formIIStats(data?.formIIs || [], today),
    [data, today],
  );
  const overdueInspections = useMemo(
    () => overdueInspectionRequests(data?.requests || [], today),
    [data, today],
  );

  if (!data) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  const actor = user ? { uid: user.uid, name: user.displayName } : null;

  return (
    <div className="space-y-4 staggered">
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}

      <div className="card p-5">
        <div className="font-black">The SOP clocks, live</div>
        <div className="text-xs text-gunmetal/60 mt-1">
          New licence within <b>{NEW_LICENCE_TARGET}</b> working days of a
          complete application · pre-authorisation inspection within{" "}
          <b>{PRE_AUTH_INSPECTION_TARGET}</b> · renewal within{" "}
          <b>{RENEWAL_TARGET}</b> · Form II response within{" "}
          <b>{FURTHER_PARTICULARS_TARGET}</b>. Working days exclude weekends and
          Zambian public holidays.
        </div>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label="Applications in flight"
          value={ageing.rows.length}
          caption={
            ageing.overdue
              ? `${ageing.overdue} over target · ${ageing.atRisk} at risk`
              : `${ageing.atRisk} at risk`
          }
          accent={ageing.overdue ? "red" : ageing.atRisk ? "amber" : "neutral"}
        />
        <Kpi
          label="Awaiting TECHCOM / Board"
          value={cStats.active}
          caption={`${cStats.awaitingTechcom} before TECHCOM`}
          accent="amber"
        />
        <Kpi
          label="Form II awaiting response"
          value={fStats.awaiting}
          caption={
            fStats.expired
              ? `${fStats.expired} expired — rejection candidates`
              : "response window running"
          }
          accent={fStats.expired ? "red" : "slate"}
        />
        <Kpi
          label="Inspections overdue"
          value={overdueInspections.length}
          caption={
            <Link className="underline" href="/inspection-requests">
              open requests →
            </Link>
          }
          accent={overdueInspections.length ? "red" : "green"}
        />
      </section>

      <AgeingSection
        ageing={ageing}
        today={today}
        canEdit={canEditAS}
        uid={user?.uid || ""}
        onChanged={reload}
      />

      <CommitteeSection
        submissions={data.submissions}
        facilities={data.facilities}
        canEdit={canEditAS}
        actor={actor}
        onChanged={reload}
      />

      <FormIISection
        records={data.formIIs}
        facilities={data.facilities}
        today={today}
        canEdit={canEditAS}
        actor={actor}
        onChanged={reload}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Applications vs the 44-working-day target (+ Form I completeness checklist)
// ---------------------------------------------------------------------------

function AgeingSection({
  ageing,
  today,
  canEdit,
  uid,
  onChanged,
}: {
  ageing: ReturnType<typeof applicationAgeing>;
  today: string;
  canEdit: boolean;
  uid: string;
  onChanged: () => void;
}) {
  const [shown, setShown] = useState(AGEING_PAGE_SIZE);
  const [openChecklist, setOpenChecklist] = useState<string | null>(null);
  const rows = ageing.rows.slice(0, shown);

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="font-black">
            Applications vs the {NEW_LICENCE_TARGET}-working-day target
          </div>
          <div className="text-xs text-gunmetal/60 mt-0.5">
            Clock starts when the application is complete (checklist) — or, until
            one is recorded, when it first entered the system. Renewals run the{" "}
            {RENEWAL_TARGET}-day clock.
          </div>
        </div>
        <div className="text-xs text-gunmetal/60">
          {ageing.onTrack} on track · {ageing.atRisk} at risk ·{" "}
          {ageing.overdue} over target
          {ageing.undated ? ` · ${ageing.undated} undated` : ""}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-gunmetal/55">
          No applications are currently in flight. Import RAIS notifications on
          the <Link className="underline" href="/licence-status">Licensing Status</Link>{" "}
          tab to track them here.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="caps text-[10px] text-gunmetal/60 text-left">
                <th className="py-2 pr-3">Facility</th>
                <th className="py-2 pr-3">Application (RAN)</th>
                <th className="py-2 pr-3">Started</th>
                <th className="py-2 pr-3">Age</th>
                <th className="py-2 pr-3">Due</th>
                <th className="py-2 pr-3">With</th>
                <th className="py-2">Form I checklist</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gunmetal/8">
              {rows.map((row) => {
                const w = row.workflow;
                const meta = AGEING_STATE_META[row.state];
                const progress = checklistProgress(w.checklist);
                const open = openChecklist === w.id;
                return (
                  <ChecklistRow
                    key={w.id}
                    row={row}
                    meta={meta}
                    progress={progress}
                    open={open}
                    canEdit={canEdit}
                    uid={uid}
                    today={today}
                    onToggle={() => setOpenChecklist(open ? null : w.id)}
                    onChanged={onChanged}
                  />
                );
              })}
            </tbody>
          </table>
          {ageing.rows.length > shown ? (
            <button
              className="btn btn-ghost mt-3"
              onClick={() => setShown((n) => n + AGEING_PAGE_SIZE)}
            >
              Show more ({ageing.rows.length - shown} remaining)
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ChecklistRow({
  row,
  meta,
  progress,
  open,
  canEdit,
  uid,
  today,
  onToggle,
  onChanged,
}: {
  row: ReturnType<typeof applicationAgeing>["rows"][number];
  meta: { chip: string; label: string };
  progress: { received: number; required: number };
  open: boolean;
  canEdit: boolean;
  uid: string;
  today: string;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const w = row.workflow;
  const [ticks, setTicks] = useState<Record<string, boolean>>(
    () => ({ ...(w.checklist || {}) }),
  );
  const [busy, setBusy] = useState(false);

  const saveChecklist = async () => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      const s = await store();
      const patch = checklistPatch(w, ticks, today);
      await s.updateLicenceWorkflow(w.id, patch, uid);
      toast.push(
        checklistComplete(ticks)
          ? `Application recorded COMPLETE — the ${isRenewalRan(w.ran) ? RENEWAL_TARGET : NEW_LICENCE_TARGET}-day clock runs from ${patch.completeReceivedAt}.`
          : "Checklist saved.",
        "success",
      );
      onChanged();
    } catch (err) {
      toast.push(
        `Could not save: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <tr>
        <td className="py-2 pr-3 font-bold">
          {w.facilityId ? (
            <Link className="hover:underline" href={`/facilities/${w.facilityId}`}>
              {w.facilityName}
            </Link>
          ) : (
            w.facilityName || "(unmatched)"
          )}
          {row.waitingOnApplicant ? (
            <span className="chip slate ml-2">applicant to act</span>
          ) : null}
        </td>
        <td className="py-2 pr-3 tabular text-gunmetal/70">
          {w.ran}
          {isRenewalRan(w.ran) ? (
            <span className="chip slate ml-1">renewal</span>
          ) : null}
        </td>
        <td className="py-2 pr-3 tabular">{row.startDate}</td>
        <td className="py-2 pr-3">
          <span className={`chip ${meta.chip}`}>
            {row.ageDays} wd · {meta.label}
          </span>
        </td>
        <td className="py-2 pr-3 tabular">{row.dueDate}</td>
        <td className="py-2 pr-3 text-xs text-gunmetal/70">
          {w.responsibleParty || "—"}
        </td>
        <td className="py-2">
          <button
            className={`text-xs caps font-bold ${
              w.completeReceivedAt
                ? "text-[var(--rpa-green-dark)]"
                : "text-gunmetal/70"
            } hover:underline`}
            onClick={onToggle}
            aria-expanded={open}
          >
            {w.completeReceivedAt
              ? `Complete ${w.completeReceivedAt}`
              : `${progress.received}/${progress.required} received`}
            {open ? " ▴" : " ▾"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={7} className="py-3 bg-mist/60">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 px-2">
              {FORM_I_CHECKLIST.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={!!ticks[item.id]}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setTicks((t) => ({ ...t, [item.id]: e.target.checked }))
                    }
                  />
                  <span>
                    {item.label}
                    {item.optional ? (
                      <span className="text-gunmetal/50"> (if applicable)</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
            {canEdit ? (
              <div className="px-2 mt-3 flex items-center gap-3">
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={saveChecklist}
                >
                  {busy ? "Saving…" : "Save checklist"}
                </button>
                <span className="text-[11px] text-gunmetal/60">
                  Ticking every required item records the application COMPLETE
                  and starts the SOP clock from that date.
                </span>
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// TECHCOM & Board — the digital "awaiting TECHCOM" file
// ---------------------------------------------------------------------------

const COMMITTEE_ACTION_LABEL: Record<CommitteeActionKind, string> = {
  "techcom-approve": "TECHCOM approved",
  "board-approve": "Board approved",
  reject: "Reject (Form III)",
  issue: "Licence issued",
  withdraw: "Withdraw",
  comment: "Comment",
};

function CommitteeSection({
  submissions,
  facilities,
  canEdit,
  actor,
  onChanged,
}: {
  submissions: CommitteeSubmission[];
  facilities: Facility[];
  canEdit: boolean;
  actor: { uid: string; name: string } | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  // Manual-add form
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [freeName, setFreeName] = useState("");
  const [ran, setRan] = useState("");
  const [reportRef, setReportRef] = useState("");
  const [busy, setBusy] = useState(false);

  const active = submissions.filter(isActiveSubmission);
  const closed = submissions.filter((s) => !isActiveSubmission(s));

  const add = async () => {
    if (!actor || busy) return;
    const fac = facilityId ? facilities.find((f) => f.id === facilityId) : null;
    const name = fac ? fac.name : freeName.trim();
    if (!name) {
      toast.push("Choose or type a facility.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      await s.addCommitteeSubmission(
        {
          ran: ran.trim() || undefined,
          facilityId: fac ? fac.id : null,
          facilityName: name,
          facCode: fac ? fac.facCode : "",
          province: fac ? fac.province : "",
          sector: fac ? fac.sector : "",
          reportRef: reportRef.trim() || undefined,
        },
        actor,
      );
      toast.push(`${name} filed for TECHCOM.`, "success");
      setShowAdd(false);
      setFacilityId(null);
      setFreeName("");
      setRan("");
      setReportRef("");
      onChanged();
    } catch (err) {
      toast.push(
        `Could not file: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-black">TECHCOM &amp; Board</div>
          <div className="text-xs text-gunmetal/60 mt-0.5">
            Complete applications awaiting committee review — filed automatically
            when a satisfactory pre-authorisation inspection is closed, or added
            here.
          </div>
        </div>
        {canEdit ? (
          <button
            className="btn btn-secondary"
            aria-pressed={showAdd}
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? "Close" : "+ File manually"}
          </button>
        ) : null}
      </div>

      {showAdd ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="caps text-[10px] text-gunmetal/60">Facility</label>
            <FacilitySelect
              facilities={facilities}
              value={facilityId}
              onChange={setFacilityId}
              emptyLabel="— pick from the register —"
              className="input mt-1"
            />
            {!facilityId ? (
              <input
                className="input mt-2"
                placeholder="…or type a facility name"
                value={freeName}
                onChange={(e) => setFreeName(e.target.value)}
              />
            ) : null}
          </div>
          <div className="space-y-3">
            <div>
              <label className="caps text-[10px] text-gunmetal/60">
                Application (RAN, optional)
              </label>
              <input
                className="input mt-1"
                placeholder="AUTH/USE.NEW/0203"
                value={ran}
                onChange={(e) => setRan(e.target.value)}
              />
            </div>
            <div>
              <label className="caps text-[10px] text-gunmetal/60">
                Inspection report reference (optional)
              </label>
              <input
                className="input mt-1"
                placeholder="RPA/INSP/2026/044"
                value={reportRef}
                onChange={(e) => setReportRef(e.target.value)}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <button className="btn btn-primary" disabled={busy} onClick={add}>
              {busy ? "Filing…" : "File for TECHCOM"}
            </button>
          </div>
        </div>
      ) : null}

      {submissions.length === 0 ? (
        <div className="py-8 text-center text-sm text-gunmetal/55">
          Nothing before the committees yet. Closing a satisfactory
          pre-authorisation inspection files its application here automatically.
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {COMMITTEE_STATUSES.filter((st) =>
            active.some((s) => s.status === st),
          ).map((st) => (
            <CommitteeGroup
              key={st}
              status={st}
              items={active.filter((s) => s.status === st)}
              canEdit={canEdit}
              actor={actor}
              onChanged={onChanged}
            />
          ))}
          {closed.length ? (
            <div>
              <button
                className="text-xs caps font-bold text-gunmetal/60 hover:underline"
                onClick={() => setShowClosed((v) => !v)}
                aria-expanded={showClosed}
              >
                {showClosed ? "Hide" : "Show"} concluded ({closed.length})
              </button>
              {showClosed ? (
                <div className="mt-3 space-y-5">
                  {COMMITTEE_STATUSES.filter((st) =>
                    closed.some((s) => s.status === st),
                  ).map((st) => (
                    <CommitteeGroup
                      key={st}
                      status={st}
                      items={closed.filter((s) => s.status === st)}
                      canEdit={canEdit}
                      actor={actor}
                      onChanged={onChanged}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CommitteeGroup({
  status,
  items,
  canEdit,
  actor,
  onChanged,
}: {
  status: CommitteeStatus;
  items: CommitteeSubmission[];
  canEdit: boolean;
  actor: { uid: string; name: string } | null;
  onChanged: () => void;
}) {
  const meta = COMMITTEE_STATUS_META[status];
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`chip ${meta.chip}`}>{status}</span>
        <span className="text-xs text-gunmetal/55 tabular">{items.length}</span>
      </div>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {items.map((s) => (
          <CommitteeCard
            key={s.id}
            submission={s}
            canEdit={canEdit}
            actor={actor}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </div>
  );
}

function CommitteeCard({
  submission: s,
  canEdit,
  actor,
  onChanged,
}: {
  submission: CommitteeSubmission;
  canEdit: boolean;
  actor: { uid: string; name: string } | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<CommitteeActionKind | null>(null);
  const [date, setDate] = useState(() => todayISO());
  const [note, setNote] = useState("");
  const [licenceNumber, setLicenceNumber] = useState("");
  const [formIIIRef, setFormIIIRef] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);

  const actions = canEdit && actor ? allowedCommitteeActions(s) : [];

  const run = async (kind: CommitteeActionKind) => {
    if (!actor || busy) return;
    let action: CommitteeAction;
    switch (kind) {
      case "issue":
        if (!licenceNumber.trim()) {
          toast.push("Enter the licence number (Form IV).", "error");
          return;
        }
        action = { kind, licenceNumber: licenceNumber.trim(), date, note };
        break;
      case "reject":
        action = { kind, date, formIIIRef: formIIIRef.trim() || undefined, note };
        break;
      case "withdraw":
        if (!note.trim()) {
          toast.push("Give a reason for withdrawing.", "error");
          return;
        }
        action = { kind, reason: note.trim() };
        break;
      case "comment":
        if (!note.trim()) {
          toast.push("Comment cannot be empty.", "error");
          return;
        }
        action = { kind, note: note.trim() };
        break;
      default:
        action = { kind, date, note };
    }
    setBusy(true);
    try {
      const st = await store();
      const updated = await st.updateCommitteeSubmission(s.id, action, actor);
      toast.push(
        kind === "comment" ? "Comment added." : `Now ${updated.status}.`,
        "success",
      );
      setOpen(null);
      setNote("");
      setLicenceNumber("");
      setFormIIIRef("");
      onChanged();
    } catch (err) {
      toast.push(
        `Action failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold truncate">
            {s.facilityId ? (
              <Link className="hover:underline" href={`/facilities/${s.facilityId}`}>
                {s.facilityName}
              </Link>
            ) : (
              s.facilityName
            )}
          </div>
          <div className="text-[11px] tabular text-gunmetal/55 mt-0.5">
            {s.ran || "no RAN"}
            {s.facCode ? ` · ${s.facCode}` : ""}
          </div>
        </div>
        <div className="text-[11px] tabular text-gunmetal/55 text-right shrink-0">
          <div>filed {s.submittedAt.slice(0, 10)}</div>
          {s.techcomDate ? <div>TECHCOM {s.techcomDate}</div> : null}
          {s.boardDate ? <div>Board {s.boardDate}</div> : null}
        </div>
      </div>

      {s.reportRef ? (
        <div className="text-xs text-gunmetal/70 mt-2">
          Inspection report: <b className="break-words">{s.reportRef}</b>
          {s.inspectionOutcome ? ` (${s.inspectionOutcome})` : ""}
        </div>
      ) : null}
      {s.licenceNumber ? (
        <div className="text-xs mt-1">
          <span className="chip green">
            Licence {s.licenceNumber} · {s.licenceDate}
          </span>
        </div>
      ) : null}
      {s.formIIIRef ? (
        <div className="text-xs mt-1">
          <span className="chip red">Form III {s.formIIIRef}</span>
        </div>
      ) : null}

      {actions.length ? (
        <div className="flex gap-2 flex-wrap mt-3">
          {actions.map((a) => (
            <button
              key={a}
              className={`btn ${
                a === "reject" || a === "withdraw" ? "btn-ghost" : "btn-secondary"
              }`}
              aria-pressed={open === a}
              onClick={() => setOpen(open === a ? null : a)}
            >
              {COMMITTEE_ACTION_LABEL[a]}
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="mt-3 space-y-2">
          {open !== "withdraw" && open !== "comment" ? (
            <div>
              <label className="caps text-[10px] text-gunmetal/60">
                Decision date
              </label>
              <input
                type="date"
                className="input mt-1"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          ) : null}
          {open === "issue" ? (
            <div>
              <label className="caps text-[10px] text-gunmetal/60">
                Licence number (Form IV)
              </label>
              <input
                className="input mt-1"
                placeholder="RPA/LIC/2026/0456"
                value={licenceNumber}
                onChange={(e) => setLicenceNumber(e.target.value)}
              />
              <div className="text-[11px] text-gunmetal/60 mt-1">
                Then record the licence itself on{" "}
                <Link className="underline" href="/licence-status">
                  Licensing Status
                </Link>{" "}
                (or Bulk Approval) so the register and weekly report update.
              </div>
            </div>
          ) : null}
          {open === "reject" ? (
            <div>
              <label className="caps text-[10px] text-gunmetal/60">
                Form III reference (optional)
              </label>
              <input
                className="input mt-1"
                placeholder="FORM-III/2026/07"
                value={formIIIRef}
                onChange={(e) => setFormIIIRef(e.target.value)}
              />
            </div>
          ) : null}
          <div>
            <label className="caps text-[10px] text-gunmetal/60">
              {open === "withdraw"
                ? "Reason"
                : open === "comment"
                  ? "Comment"
                  : "Note (optional)"}
            </label>
            <textarea
              className="input mt-1"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => run(open)}
          >
            {busy ? "Working…" : COMMITTEE_ACTION_LABEL[open]}
          </button>
        </div>
      ) : null}

      <button
        className="text-[11px] caps font-bold text-gunmetal/55 hover:underline mt-3"
        onClick={() => setShowHistory((v) => !v)}
        aria-expanded={showHistory}
      >
        {showHistory ? "Hide history" : `History (${s.timeline.length})`}
      </button>
      {showHistory ? (
        <ul className="mt-2 space-y-1.5">
          {[...s.timeline].reverse().map((e, i) => (
            <li key={i} className="text-xs">
              <div>{e.text}</div>
              <div className="text-[10px] text-gunmetal/50">
                {e.byName} · {e.at.slice(0, 10)}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Form II — requests for further particulars
// ---------------------------------------------------------------------------

function FormIISection({
  records,
  facilities,
  today,
  canEdit,
  actor,
  onChanged,
}: {
  records: FurtherParticularsRecord[];
  facilities: Facility[];
  today: string;
  canEdit: boolean;
  actor: { uid: string; name: string } | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [freeName, setFreeName] = useState("");
  const [ran, setRan] = useState("");
  const [details, setDetails] = useState("");
  const [issuedDate, setIssuedDate] = useState(() => todayISO());
  const [busy, setBusy] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [respondDate, setRespondDate] = useState(() => todayISO());

  const issue = async () => {
    if (!actor || busy) return;
    const fac = facilityId ? facilities.find((f) => f.id === facilityId) : null;
    const name = fac ? fac.name : freeName.trim();
    if (!name) {
      toast.push("Choose or type a facility.", "error");
      return;
    }
    if (!details.trim()) {
      toast.push("Describe the further particulars requested.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      await s.addFurtherParticulars(
        {
          ran: ran.trim() || undefined,
          facilityId: fac ? fac.id : null,
          facilityName: name,
          facCode: fac ? fac.facCode : "",
          details: details.trim(),
          issuedDate,
        },
        actor,
      );
      toast.push(
        `Form II issued to ${name} — ${FURTHER_PARTICULARS_TARGET} working days to respond.`,
        "success",
      );
      setShowForm(false);
      setFacilityId(null);
      setFreeName("");
      setRan("");
      setDetails("");
      setIssuedDate(todayISO());
      onChanged();
    } catch (err) {
      toast.push(
        `Could not issue: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const act = async (
    rec: FurtherParticularsRecord,
    kind: "respond" | "withdraw",
  ) => {
    if (!actor || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.updateFurtherParticulars(
        rec.id,
        kind === "respond"
          ? { kind, date: respondDate }
          : { kind, note: "Withdrawn by Licensing" },
        actor,
      );
      toast.push(
        kind === "respond" ? "Response recorded." : "Form II withdrawn.",
        "success",
      );
      setActingOn(null);
      onChanged();
    } catch (err) {
      toast.push(
        `Action failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-black">
            Form II — requests for further particulars
          </div>
          <div className="text-xs text-gunmetal/60 mt-0.5">
            Clients have up to {FURTHER_PARTICULARS_TARGET} working days to
            respond. Expired requests are the SOP&apos;s candidates for rejection.
          </div>
        </div>
        {canEdit ? (
          <button
            className="btn btn-secondary"
            aria-pressed={showForm}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Close" : "+ Issue Form II"}
          </button>
        ) : null}
      </div>

      {showForm ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="caps text-[10px] text-gunmetal/60">Facility</label>
            <FacilitySelect
              facilities={facilities}
              value={facilityId}
              onChange={setFacilityId}
              emptyLabel="— pick from the register —"
              className="input mt-1"
            />
            {!facilityId ? (
              <input
                className="input mt-2"
                placeholder="…or type a facility name"
                value={freeName}
                onChange={(e) => setFreeName(e.target.value)}
              />
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caps text-[10px] text-gunmetal/60">
                RAN (optional)
              </label>
              <input
                className="input mt-1"
                value={ran}
                onChange={(e) => setRan(e.target.value)}
              />
            </div>
            <div>
              <label className="caps text-[10px] text-gunmetal/60">
                Date issued
              </label>
              <input
                type="date"
                className="input mt-1"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="caps text-[10px] text-gunmetal/60">
              Particulars requested
            </label>
            <textarea
              className="input mt-1"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="e.g. RPO appointment letter and premises layout plan not submitted."
            />
          </div>
          <div className="md:col-span-2">
            <button className="btn btn-primary" disabled={busy} onClick={issue}>
              {busy ? "Issuing…" : "Issue Form II"}
            </button>
          </div>
        </div>
      ) : null}

      {records.length === 0 ? (
        <div className="py-8 text-center text-sm text-gunmetal/55">
          No Form II requests tracked yet.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="caps text-[10px] text-gunmetal/60 text-left">
                <th className="py-2 pr-3">Facility</th>
                <th className="py-2 pr-3">RAN</th>
                <th className="py-2 pr-3">Issued</th>
                <th className="py-2 pr-3">Respond by</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gunmetal/8">
              {records.map((rec) => {
                const st = formIIState(rec, today);
                const meta = FORM_II_STATE_META[st];
                const canAct = canEdit && rec.status === "Awaiting Response";
                return (
                  <tr key={rec.id}>
                    <td className="py-2 pr-3 font-bold">
                      {rec.facilityId ? (
                        <Link
                          className="hover:underline"
                          href={`/facilities/${rec.facilityId}`}
                        >
                          {rec.facilityName}
                        </Link>
                      ) : (
                        rec.facilityName
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular text-gunmetal/70">
                      {rec.ran || "—"}
                    </td>
                    <td className="py-2 pr-3 tabular">{rec.issuedDate}</td>
                    <td className="py-2 pr-3 tabular">{rec.dueDate}</td>
                    <td className="py-2 pr-3">
                      <span className={`chip ${meta.chip}`}>{meta.label}</span>
                      {rec.respondedDate ? (
                        <span className="text-[11px] text-gunmetal/55 ml-1 tabular">
                          {rec.respondedDate}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 text-xs text-gunmetal/70">
                      <div className="line-clamp-2 max-w-md">{rec.details}</div>
                      {canAct ? (
                        actingOn === rec.id ? (
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <input
                              type="date"
                              className="input !w-auto"
                              value={respondDate}
                              onChange={(e) => setRespondDate(e.target.value)}
                              aria-label="Response date"
                            />
                            <button
                              className="btn btn-primary"
                              disabled={busy}
                              onClick={() => act(rec, "respond")}
                            >
                              Record response
                            </button>
                            <button
                              className="btn btn-ghost"
                              disabled={busy}
                              onClick={() => act(rec, "withdraw")}
                            >
                              Withdraw
                            </button>
                            <button
                              className="btn btn-ghost"
                              onClick={() => setActingOn(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="text-[11px] caps font-bold text-[var(--rpa-green-dark)] hover:underline mt-1"
                            onClick={() => setActingOn(rec.id)}
                          >
                            Action →
                          </button>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
