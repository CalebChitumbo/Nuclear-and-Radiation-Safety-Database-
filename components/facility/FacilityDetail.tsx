"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import { StatusPill } from "@/components/StatusPill";
import { WorkflowNotesPanel } from "@/components/WorkflowNotesPanel";
import { Field, Panel } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { CardStatusChip } from "@/components/inspectorate/InspectionDatabaseTable";
import { detectType } from "@/lib/rules/detectType";
import { enforcementByFacility } from "@/lib/rules/enforcementStatus";
import { cardStatus } from "@/lib/rules/inspectionDatabase";
import { REQUEST_STATUS_META } from "@/lib/rules/inspectionRequests";
import { authWhen } from "@/lib/rules/licenceStats";
import { todayISO } from "@/lib/rules/week";
import {
  workflowCommentCount,
  workflowStatusLabel,
} from "@/lib/rules/workflowNotes";
import {
  type Facility,
  type Inspection,
  type InspectionPriority,
  type InspectionRequest,
  type LicenceEvent,
  type LicenceType,
  type LicenceWorkflow,
  INSPECTION_PRIORITIES,
  LICENCE_TYPES,
  isUseP,
} from "@/lib/rules/types";

/**
 * Everything known about one facility, laid out the same way in both places it
 * is read: the slide-in drawer (single column) and its permalink page (record
 * rail beside the history). The order answers the questions in the order they
 * are asked — what is this facility, is it licensed, what has it been issued,
 * what has happened to it, what can I do about it.
 */
export function FacilityDetail({
  facilityId,
  variant,
  onChanged,
  onLoaded,
}: {
  facilityId: string;
  variant: "page" | "drawer";
  onChanged?: () => void;
  /** Lets the drawer title itself without a second read of the facility. */
  onLoaded?: (facility: Facility | null) => void;
}) {
  const { user, canEditAS } = useAuth();
  const toast = useToast();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [events, setEvents] = useState<LicenceEvent[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [requests, setRequests] = useState<InspectionRequest[]>([]);
  const [workflows, setWorkflows] = useState<LicenceWorkflow[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [number, setNumber] = useState("");
  const [type, setType] = useState<LicenceType>("New Use/Possession Licence");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [autoType, setAutoType] = useState(true);

  // Held in a ref so a caller passing an inline callback can't re-run the load.
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  // Inspection-request quick form
  const [reqOpen, setReqOpen] = useState(false);
  const [reqReason, setReqReason] = useState("");
  const [reqPriority, setReqPriority] = useState<InspectionPriority>("Normal");
  const [reqNeededBy, setReqNeededBy] = useState("");

  // Targeted reads: one facility doc + its own events/inspections/requests
  // (indexed queries in Firebase mode) instead of downloading whole collections.
  const loadFacility = useCallback(async (id: string) => {
    const s = await store();
    return Promise.all([
      s.getFacility(id),
      s.listLicenceEventsFor(id),
      s.listInspectionsFor(id),
      // Secondary: a missing rule/index for this new collection must not stop
      // the facility itself from opening. Degrade to an empty list.
      s.listInspectionRequestsFor(id).catch(() => []),
      // The facility's tracked applications, with their officer notes/history.
      s.listLicenceWorkflowsFor(id).catch(() => []),
    ]);
  }, []);

  useEffect(() => {
    // Cancellation guard: switching facilities quickly must not let the slower,
    // stale response win (the actions below key off facility.id).
    let cancelled = false;
    setNotFound(false);
    loadFacility(facilityId)
      .then(([f, evs, ins, reqs, wfs]) => {
        if (cancelled) return;
        setFacility(f);
        setNotFound(!f);
        setEvents(evs);
        setInspections(ins);
        setRequests(reqs);
        setWorkflows(wfs);
        onLoadedRef.current?.(f);
      })
      .catch(() => {
        if (!cancelled) toast.push("Failed to load facility.", "error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId, loadFacility]);

  // Auto-detect from number as user types.
  useEffect(() => {
    if (autoType && number) {
      const detected = detectType(number, type);
      setType(detected);
    }
  }, [number, autoType]); // eslint-disable-line react-hooks/exhaustive-deps

  const usePAuths = useMemo(
    () => (facility?.auths || []).filter((a) => isUseP(a.type)),
    [facility],
  );
  const otherAuths = useMemo(
    () => (facility?.auths || []).filter((a) => !isUseP(a.type)),
    [facility],
  );
  // What the Authority last did about this facility, off its inspections.
  const enforcement = useMemo(
    () =>
      facility
        ? enforcementByFacility(inspections, [facility]).get(facility.id)
        : undefined,
    [facility, inspections],
  );

  if (notFound) {
    return (
      <Panel>
        <div className="text-sm text-gunmetal/70">
          That facility is not in the register (it may have been removed).{" "}
          <Link className="link-action" href="/facilities">
            Back to the register
          </Link>
        </div>
      </Panel>
    );
  }

  if (!facility) {
    return <div className="caps text-xs text-gunmetal/60 py-6">Loading…</div>;
  }

  const effectNote = isUseP(type)
    ? facility.licensed
      ? "Will be logged as a Use/Possession renewal. Status stays Licensed."
      : "Will set this facility to Licensed."
    : "Recorded as an authorisation the facility holds. Licensing status will not change.";

  const refresh = async (id: string) => {
    const [f, evs, ins, reqs, wfs] = await loadFacility(id);
    setFacility(f);
    setEvents(evs);
    setInspections(ins);
    setRequests(reqs);
    setWorkflows(wfs);
  };

  const submitRequest = async () => {
    if (!user || busy) return;
    if (!reqReason.trim()) {
      toast.push("Add a reason for the inspection.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      await s.addInspectionRequest(
        {
          facilityId: facility.id,
          facilityName: facility.name,
          facCode: facility.facCode,
          province: facility.province,
          sector: facility.sector,
          type: "Pre-Authorisation",
          priority: reqPriority,
          reason: reqReason.trim(),
          neededBy: reqNeededBy || undefined,
        },
        { uid: user.uid, name: user.displayName, section: user.section },
      );
      toast.push(`Inspection requested for ${facility.name}.`, "success");
      setReqReason("");
      setReqNeededBy("");
      setReqPriority("Normal");
      setReqOpen(false);
      onChanged?.();
      await refresh(facility.id);
    } catch (err) {
      toast.push(
        `Could not raise the request: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    // Busy-guard: a double-click on Record must not log the same licence
    // event (and weekly count) twice.
    if (!user || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.recordLicences(
        [{ facilityId: facility.id, number, type, date }],
        user.uid,
      );
      toast.push(`Authorisation recorded for ${facility.name}.`, "success");
      setNumber("");
      setAdding(false);
      setAutoType(true);
      onChanged?.();
      await refresh(facility.id);
    } catch (err) {
      toast.push(
        `Recording failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const overrideStatus = async (licensed: boolean) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.updateFacility(
        facility.id,
        {
          licensed,
          stage: licensed ? "Licensed" : "No Application Submitted",
        },
        user.uid,
      );
      toast.push(
        `Status set to ${licensed ? "Licensed" : "Unlicensed"} (manual override).`,
        "default",
      );
      onChanged?.();
      await refresh(facility.id);
    } catch (err) {
      toast.push(
        `Status change failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  /** Small direct edits to the facility record (functional/category/review). */
  const patchFacility = async (patch: Partial<Facility>, note: string) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.updateFacility(facility.id, patch, user.uid);
      toast.push(note, "success");
      onChanged?.();
      await refresh(facility.id);
    } catch (err) {
      toast.push(
        `Update failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const isPage = variant === "page";

  // ---- blocks ------------------------------------------------------------

  const identity = (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusPill licensed={facility.licensed} stage={facility.stage} />
      {facility.functional === false ? (
        <span className="chip red">Non-Functional</span>
      ) : (
        <span className="chip green">Functional</span>
      )}
      <span className="chip">
        {facility.category === "Non-Medical" ? "Non-Medical" : "Medical"}
      </span>
      <span className="chip slate">{facility.sector}</span>
      <span className="chip">{facility.province}</span>
      {facility.facCode ? (
        <span className="chip caps">{facility.facCode}</span>
      ) : null}
      {facility.stalled ? (
        <span
          className="chip amber"
          title="Earlier application with no 2026 activity"
        >
          Stalled application
        </span>
      ) : null}
      {enforcement ? (
        <span
          className={`chip ${enforcement.severity === "engagement" ? "amber" : "red"}`}
          title={`Latest enforcement action on the inspection register${
            enforcement.date ? ` — ${enforcement.date}` : ""
          }`}
        >
          {enforcement.action}
        </span>
      ) : null}
    </div>
  );

  const reviewCallout = facility.needsReview ? (
    <div
      className="inset p-3 sm:p-4 text-sm"
      style={{ borderLeft: "3px solid rgba(184,134,11,0.6)" }}
    >
      <div className="caps text-[10px] text-gunmetal/60">Needs review</div>
      <div className="mt-1">
        {facility.reviewNote ||
          "Imported with uncertainty — confirm this record."}
      </div>
      {canEditAS ? (
        <button
          className="btn btn-secondary mt-2 text-xs"
          disabled={busy}
          onClick={() =>
            patchFacility({ needsReview: false }, "Review flag cleared.")
          }
        >
          Mark as verified
        </button>
      ) : null}
    </div>
  ) : null;

  const recordPanel = (
    <Panel title="Record" bleed={!isPage}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="District" value={facility.district || "—"} />
        <Field label="Practice" value={facility.practice || "—"} />
        <Field label="Sector" value={facility.sector} />
        <Field label="Sequence #" value={String(facility.no || "—")} />
        <Field label="Stage" value={facility.stage} wide />
        <Field
          label="Enforcement standing"
          value={
            enforcement
              ? `${enforcement.action}${enforcement.date ? ` · ${enforcement.date}` : ""}${
                  enforcement.history.length > 1
                    ? ` · ${enforcement.history.length} actions on record`
                    : ""
                }`
              : "No enforcement action recorded"
          }
          wide
        />
        {facility.currentStatus ? (
          <Field label="RAIS status" value={facility.currentStatus} wide />
        ) : null}
        {facility.statusDetail ? (
          <Field
            label="2026 licensing status"
            value={facility.statusDetail}
            wide
          />
        ) : null}
      </dl>
    </Panel>
  );

  const actionsPanel = canEditAS ? (
    <Panel title="Update this facility" bleed={!isPage}>
      {!adding ? (
        <div className="space-y-2">
          <button
            className="btn btn-primary w-full"
            onClick={() => setAdding(true)}
          >
            + Record an authorisation
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => overrideStatus(!facility.licensed)}
              title="Manual status override (R6 — no event recorded)"
            >
              Mark {facility.licensed ? "unlicensed" : "licensed"}
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() =>
                patchFacility(
                  { functional: !(facility.functional !== false) },
                  facility.functional !== false
                    ? "Marked non-functional."
                    : "Marked functional.",
                )
              }
            >
              Mark {facility.functional !== false ? "non-functional" : "functional"}
            </button>
            <button
              className="btn btn-secondary sm:col-span-2"
              disabled={busy}
              onClick={() =>
                patchFacility(
                  {
                    category:
                      facility.category === "Non-Medical"
                        ? "Medical"
                        : "Non-Medical",
                  },
                  "Category updated.",
                )
              }
            >
              Set category:{" "}
              {facility.category === "Non-Medical" ? "Medical" : "Non-Medical"}
            </button>
          </div>
          <p className="text-[11px] text-gunmetal/55">
            Recording an authorisation writes a dated licence event; the status
            override does not.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="auth-number">
                AUTH number
              </label>
              <input
                id="auth-number"
                className="input"
                value={number}
                placeholder="AUTH/USE.REN/0701"
                onChange={(e) => {
                  setNumber(e.target.value);
                  setAutoType(true);
                }}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="auth-date">
                Date issued
              </label>
              <input
                id="auth-date"
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="auth-type">
              Licence type{" "}
              {autoType ? (
                <span className="text-[var(--rpa-green-dark)]">· auto</span>
              ) : null}
            </label>
            <select
              id="auth-type"
              className="input"
              value={type}
              onChange={(e) => {
                setType(e.target.value as LicenceType);
                setAutoType(false);
              }}
            >
              {LICENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-gunmetal/65">{effectNote}</div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={submit}
            >
              {busy ? "Recording…" : "Record"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setAdding(false);
                setNumber("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Panel>
  ) : null;

  const authorisationsPanel = (
    <Panel
      title="Authorisations held"
      note="Use/Possession licences decide the facility's licensed status; everything else is recorded but does not change it."
      bleed={!isPage}
    >
      <div className="space-y-4">
        <div>
          <div className="caps text-[10px] text-gunmetal/50 mb-1.5">
            Use / Possession
          </div>
          {usePAuths.length === 0 ? (
            <p className="text-sm text-gunmetal/55">
              No Use/Possession authorisations on record.
            </p>
          ) : (
            <ul className="divide-y divide-gunmetal/8">
              {usePAuths.map((a, i) => (
                <AuthRow key={`u${i}`} a={a} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="caps text-[10px] text-gunmetal/50 mb-1.5">
            Other authorisations
          </div>
          {otherAuths.length === 0 ? (
            <p className="text-sm text-gunmetal/55">No other authorisations.</p>
          ) : (
            <ul className="divide-y divide-gunmetal/8">
              {otherAuths.map((a, i) => (
                <AuthRow key={`o${i}`} a={a} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );

  const applicationsPanel = workflows.length ? (
    <Panel
      title="Applications — officer notes &amp; history"
      note="What is happening on each application, and the notes officers left for whoever works on it next."
      bleed={!isPage}
    >
      <ul className="divide-y divide-gunmetal/8">
        {workflows.map((w) => {
          const n = workflowCommentCount(w);
          return (
            <li key={w.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-bold text-sm tabular break-words">
                    {w.ran || w.id}
                  </div>
                  <div className="text-xs text-gunmetal/60">
                    {workflowStatusLabel(w)}
                  </div>
                </div>
                {w.lastSeen ? (
                  <span className="text-xs tabular text-gunmetal/55 shrink-0">
                    {w.lastSeen}
                  </span>
                ) : null}
              </div>
              <details className="mt-2">
                <summary className="text-[11px] font-bold text-[var(--rpa-green-dark)] cursor-pointer select-none py-1">
                  💬 Notes &amp; history{n ? ` (${n})` : ""}
                </summary>
                <div className="mt-3">
                  <WorkflowNotesPanel workflow={w} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </Panel>
  ) : null;

  const historyPanel = (
    <Panel title="History" bleed={!isPage}>
      <div className="space-y-4">
        <div>
          <div className="caps text-[10px] text-gunmetal/50 mb-1.5">
            Licence events (dated log)
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-gunmetal/55">No events.</p>
          ) : (
            <ul className="divide-y divide-gunmetal/8 text-sm">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="flex items-baseline justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold break-words">{e.type}</div>
                    <div className="text-xs text-gunmetal/60 tabular">
                      {e.number || "no number"} · {e.week}
                    </div>
                  </div>
                  <div className="text-xs tabular text-gunmetal/55 shrink-0">
                    {e.date}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="caps text-[10px] text-gunmetal/50 mb-1.5">
            Inspections
          </div>
          {inspections.length === 0 ? (
            <p className="text-sm text-gunmetal/55">No inspections.</p>
          ) : (
            <ul className="divide-y divide-gunmetal/8 text-sm">
              {inspections.map((i) => (
                <li
                  key={i.id}
                  className="flex items-baseline justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold break-words">{i.type}</div>
                    <div className="text-xs text-gunmetal/60">{i.outcome}</div>
                    {i.enforcement ? (
                      <div className="mt-1">
                        <span className="chip red">{i.enforcement}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="text-xs tabular text-gunmetal/55 shrink-0 text-right">
                    <div>{i.date}</div>
                    {/* The inspection card issued at the visit, and whether it
                        is still standing today. */}
                    {i.cardIssued ? (
                      <div className="mt-1">
                        <CardStatusChip
                          status={cardStatus(i.cardIssued, todayISO())}
                        />
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );

  const requestsPanel = (
    <Panel
      title="Inspection requests"
      bleed={!isPage}
      action={
        <Link href="/inspection-requests" className="link-action">
          Open board →
        </Link>
      }
    >
      {requests.length === 0 ? (
        <p className="text-sm text-gunmetal/55">
          No inspection requests for this facility.
        </p>
      ) : (
        <ul className="divide-y divide-gunmetal/8 text-sm">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex items-baseline justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <div className="font-bold">{r.type}</div>
                <div className="text-xs text-gunmetal/60 break-words">
                  {r.assignedInspector
                    ? `Inspector: ${r.assignedInspector}`
                    : `Requested by ${r.requestedByName}`}
                  {r.reportRef ? " · report filed" : ""}
                </div>
              </div>
              <span
                className={`chip ${REQUEST_STATUS_META[r.status].chip} shrink-0`}
              >
                {REQUEST_STATUS_META[r.status].label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canEditAS ? (
        !reqOpen ? (
          <button
            className="btn btn-secondary mt-3 w-full sm:w-auto"
            onClick={() => setReqOpen(true)}
          >
            Request pre-authorisation inspection
          </button>
        ) : (
          <div className="mt-3 inset p-3 sm:p-4 space-y-3">
            <div>
              <label className="field-label" htmlFor="req-reason">
                Reason / scope
              </label>
              <textarea
                id="req-reason"
                className="input"
                rows={2}
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                placeholder="What should the Inspectorate check?"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="req-priority">
                  Priority
                </label>
                <select
                  id="req-priority"
                  className="input"
                  value={reqPriority}
                  onChange={(e) =>
                    setReqPriority(e.target.value as InspectionPriority)
                  }
                >
                  {INSPECTION_PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="req-needed">
                  Needed by
                </label>
                <input
                  id="req-needed"
                  type="date"
                  className="input"
                  value={reqNeededBy}
                  onChange={(e) => setReqNeededBy(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={submitRequest}
              >
                {busy ? "Sending…" : "Send to Inspectorate"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setReqOpen(false);
                  setReqReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )
      ) : null}
    </Panel>
  );

  // ---- layouts -----------------------------------------------------------

  if (!isPage) {
    return (
      <div className="space-y-4">
        {identity}
        {reviewCallout}
        {recordPanel}
        {actionsPanel}
        {authorisationsPanel}
        {applicationsPanel}
        {historyPanel}
        {requestsPanel}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <Link href="/facilities" className="link-action inline-block">
          ← Facilities register
        </Link>
        <div>
          <h1 className="text-xl sm:text-3xl font-black tracking-tight leading-tight break-words">
            {facility.name}
          </h1>
          <p className="text-sm text-gunmetal/60 mt-1">
            {[facility.practice, facility.district, facility.province]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        {identity}
      </header>

      {reviewCallout}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {authorisationsPanel}
          {applicationsPanel}
          {historyPanel}
          {requestsPanel}
        </div>
        <div className="space-y-4 min-w-0 lg:sticky lg:top-20">
          {recordPanel}
          {actionsPanel}
        </div>
      </div>
    </div>
  );
}

function AuthRow({
  a,
}: {
  a: { type: string; number: string; date: string; quarter?: string };
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm py-2">
      <div className="min-w-0">
        <div className="font-bold break-words">{a.type}</div>
        <div className="text-xs text-gunmetal/55 tabular">
          {a.number || "no number"}
        </div>
      </div>
      {/* Licences imported by quarter show "Q1 2026" in place of a date. */}
      <div className="text-xs tabular text-gunmetal/55 shrink-0">
        {authWhen(a) || "—"}
      </div>
    </li>
  );
}
