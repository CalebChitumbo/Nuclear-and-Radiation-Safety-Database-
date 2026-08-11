"use client";

import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { InspectionRequestDrawer } from "@/components/InspectionRequestDrawer";
import { Panel } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { norm } from "@/lib/rules/matching";
import {
  REQUEST_PRIORITY_META,
  REQUEST_STATUS_META,
  deriveInspectionInbox,
  inspectionRequestStats,
} from "@/lib/rules/inspectionRequests";
import {
  INSPECTION_PRIORITIES,
  INSPECTION_REQUEST_STATUSES,
  INSPECTION_TYPES,
  type Facility,
  type InspectionPriority,
  type InspectionRequest,
  type InspectionRequestStatus,
  type InspectionType,
} from "@/lib/rules/types";

const CURRENT_YEAR = new Date().getFullYear();

// The pipeline the board renders top-to-bottom; terminal states get folded into
// a single "closed" group beneath it.
const PIPELINE: InspectionRequestStatus[] = [
  "Requested",
  "Acknowledged",
  "Assigned",
  "In Progress",
  "Report Ready",
];
const TERMINAL: InspectionRequestStatus[] = ["Closed", "Cancelled"];

export default function InspectionRequestsPage() {
  const { user, canEditAS, canEditInsp } = useAuth();
  const toast = useToast();
  const { data, error, reload } = useStoreData(async (s) => {
    const [facilities, requests] = await Promise.all([
      s.listFacilities(),
      s.listInspectionRequests(),
    ]);
    return { facilities, requests };
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<InspectionRequestStatus | "">("");
  const [showForm, setShowForm] = useState(false);

  // Create-form state
  const [facilityQuery, setFacilityQuery] = useState("");
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [facilityNameFreeText, setFacilityNameFreeText] = useState("");
  const [type, setType] = useState<InspectionType>("Pre-Authorisation");
  const [priority, setPriority] = useState<InspectionPriority>("Normal");
  const [neededBy, setNeededBy] = useState("");
  const [workflowRan, setWorkflowRan] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const facilities = useMemo(() => data?.facilities || [], [data]);
  const requests = useMemo(() => data?.requests || [], [data]);

  const inbox = useMemo(
    () => deriveInspectionInbox(requests, { canEditAS, canEditInsp }),
    [requests, canEditAS, canEditInsp],
  );
  const stats = useMemo(
    () => inspectionRequestStats(requests, CURRENT_YEAR),
    [requests],
  );

  const suggestions = useMemo(() => {
    if (!facilityQuery.trim() || facilityId) return [];
    const q = norm(facilityQuery);
    return facilities.filter((f) => f.nameLower.includes(q)).slice(0, 8);
  }, [facilities, facilityQuery, facilityId]);

  const selected: Facility | null = facilityId
    ? facilities.find((f) => f.id === facilityId) || null
    : null;

  const openRequest = openId
    ? requests.find((r) => r.id === openId) || null
    : null;

  const filtered = useMemo(
    () => (filter ? requests.filter((r) => r.status === filter) : requests),
    [requests, filter],
  );

  const grouped = useMemo(() => {
    const by = new Map<InspectionRequestStatus, InspectionRequest[]>();
    for (const r of filtered) {
      const arr = by.get(r.status) || [];
      arr.push(r);
      by.set(r.status, arr);
    }
    return by;
  }, [filtered]);

  const resetForm = () => {
    setFacilityQuery("");
    setFacilityId(null);
    setFacilityNameFreeText("");
    setType("Pre-Authorisation");
    setPriority("Normal");
    setNeededBy("");
    setWorkflowRan("");
    setReason("");
  };

  const submit = async () => {
    if (!user || busy) return;
    const fname = selected ? selected.name : facilityNameFreeText.trim();
    if (!fname) {
      toast.push("Choose or type a facility.", "error");
      return;
    }
    if (!reason.trim()) {
      toast.push(
        "Add a reason so the Inspectorate knows what is needed.",
        "error",
      );
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      await s.addInspectionRequest(
        {
          facilityId: selected ? selected.id : null,
          facilityName: fname,
          facCode: selected ? selected.facCode : "",
          province: selected ? selected.province : "",
          sector: selected ? selected.sector : "",
          type,
          priority,
          reason: reason.trim(),
          workflowRan: workflowRan.trim() || undefined,
          neededBy: neededBy || undefined,
        },
        { uid: user.uid, name: user.displayName, section: user.section },
      );
      toast.push(`Inspection request raised for ${fname}.`, "success");
      resetForm();
      setShowForm(false);
      reload();
    } catch (err) {
      toast.push(
        `Could not raise the request: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 staggered">
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}

      {/* Attention banners — the cross-section handoff signals */}
      {canEditInsp && inbox.incoming.length > 0 ? (
        <Banner
          tone="amber"
          title={`${inbox.incoming.length} new inspection ${
            inbox.incoming.length === 1 ? "request" : "requests"
          } from Licensing`}
          body="Accept a request to add it to the Inspectorate queue, then assign an inspector."
        />
      ) : null}
      {canEditAS && inbox.reportsReady.length > 0 ? (
        <Banner
          tone="green"
          title={`${inbox.reportsReady.length} inspection ${
            inbox.reportsReady.length === 1 ? "report is" : "reports are"
          } ready to action`}
          body="Open the request to read the report reference, then close it once you have actioned the licensing step."
        />
      ) : null}

      {/* Stats */}
      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
        <Kpi label="Open requests" value={stats.open} />
        <Kpi
          label="Awaiting Inspectorate"
          value={inbox.incoming.length}
          accent="amber"
        />
        <Kpi label="Reports ready" value={stats.reportsReady} accent="green" />
        <Kpi
          label={`Facilities inspected (${CURRENT_YEAR})`}
          value={stats.completedThisYear}
          accent="slate"
          caption={`${stats.facilitiesInspected} facilities all-time`}
        />
      </section>

      {/* Raise a request (Licensing / admin) */}
      {canEditAS ? (
        <Panel
          title="Request a pre-authorisation inspection"
          note="Sends the request to the Inspectorate and tracks it to the report."
          action={
            <button
              className="btn btn-primary"
              aria-pressed={showForm}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "Close" : "+ New request"}
            </button>
          }
        >
          {showForm ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="req-facility">
                  Facility
                </label>
                <div className="relative">
                  <input
                    id="req-facility"
                    className="input"
                    placeholder="Search register…"
                    value={selected ? selected.name : facilityQuery}
                    onChange={(e) => {
                      setFacilityQuery(e.target.value);
                      setFacilityId(null);
                      setFacilityNameFreeText(e.target.value);
                    }}
                  />
                  {suggestions.length > 0 && !selected ? (
                    <ul className="popover absolute left-0 right-0 mt-1 z-20 max-h-60 overflow-y-auto">
                      {suggestions.map((f) => (
                        <li
                          key={f.id}
                          onClick={() => {
                            setFacilityId(f.id);
                            setFacilityQuery(f.name);
                          }}
                          className="px-3 py-2.5 text-sm hover:bg-mist cursor-pointer"
                        >
                          <div className="font-bold">{f.name}</div>
                          <div className="text-xs text-gunmetal/60">
                            {f.facCode || "—"} · {f.district || "—"} ·{" "}
                            {f.province}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <p className="text-[11px] text-gunmetal/55 mt-1">
                  Free-text is fine if the facility isn&apos;t in the register
                  yet.
                </p>
              </div>

              <div>
                <label className="field-label" htmlFor="req-ran">
                  Linked application (RAN, optional)
                </label>
                <input
                  id="req-ran"
                  className="input"
                  placeholder="AUTH/USE.NEW/0203"
                  value={workflowRan}
                  onChange={(e) => setWorkflowRan(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="req-type">
                  Type
                </label>
                <select
                  id="req-type"
                  className="input"
                  value={type}
                  onChange={(e) => setType(e.target.value as InspectionType)}
                >
                  {INSPECTION_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="req-priority">
                    Priority
                  </label>
                  <select
                    id="req-priority"
                    className="input"
                    value={priority}
                    onChange={(e) =>
                      setPriority(e.target.value as InspectionPriority)
                    }
                  >
                    {INSPECTION_PRIORITIES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="req-needed-by">
                    Needed by
                  </label>
                  <input
                    id="req-needed-by"
                    type="date"
                    className="input"
                    value={neededBy}
                    onChange={(e) => setNeededBy(e.target.value)}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="field-label" htmlFor="req-scope">
                  Reason / scope
                </label>
                <textarea
                  id="req-scope"
                  className="input"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Pre-authorisation inspection for a new use/possession licence — verify shielding and source security."
                />
              </div>

              <div className="md:col-span-2 flex flex-wrap gap-2">
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={submit}
                >
                  {busy ? "Sending…" : "Send to Inspectorate"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    resetForm();
                    setShowForm(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {/* Filter + board */}
      <Panel
        title={`${filtered.length} ${filtered.length === 1 ? "request" : "requests"}`}
      >
        <div className="seg w-full">
          <button
            className="seg-btn"
            aria-pressed={filter === ""}
            onClick={() => setFilter("")}
          >
            All
          </button>
          {INSPECTION_REQUEST_STATUSES.map((sName) => (
            <button
              key={sName}
              className="seg-btn"
              aria-pressed={filter === sName}
              onClick={() => setFilter(sName)}
            >
              {REQUEST_STATUS_META[sName].label}
              {stats.byStatus[sName] ? (
                <span className="ml-1 opacity-70 tabular">
                  {stats.byStatus[sName]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {requests.length === 0 ? (
          <p className="py-10 text-center text-sm text-gunmetal/55">
            No inspection requests yet.
            {canEditAS
              ? " Use “New request” above to ask the Inspectorate to inspect a facility."
              : " Licensing officers raise these when a facility needs a pre-authorisation inspection."}
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {[...PIPELINE, ...TERMINAL]
              .filter((sName) => (filter ? sName === filter : true))
              .map((sName) => {
                const items = grouped.get(sName) || [];
                if (items.length === 0) return null;
                return (
                  <div key={sName}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`chip ${REQUEST_STATUS_META[sName].chip}`}>
                        {REQUEST_STATUS_META[sName].label}
                      </span>
                      <span className="text-xs text-gunmetal/55 tabular">
                        {items.length}
                      </span>
                    </div>
                    <ul className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                      {items.map((r) => (
                        <RequestCard
                          key={r.id}
                          r={r}
                          onOpen={() => setOpenId(r.id)}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        )}
      </Panel>

      <InspectionRequestDrawer
        request={openRequest}
        onClose={() => setOpenId(null)}
        onChanged={reload}
      />
    </div>
  );
}

function RequestCard({
  r,
  onOpen,
}: {
  r: InspectionRequest;
  onOpen: () => void;
}) {
  const priority = REQUEST_PRIORITY_META[r.priority];
  return (
    <li>
      <button
        onClick={onOpen}
        className="inset w-full text-left p-3 transition-colors hover:brightness-[0.98]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold break-words leading-tight">
              {r.facilityName}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="chip slate">{r.type}</span>
              <span className={`chip ${priority.chip}`}>{priority.label}</span>
            </div>
          </div>
          <div className="text-[11px] tabular text-gunmetal/55 text-right shrink-0">
            {r.neededBy ? <div>by {r.neededBy}</div> : null}
            {r.facCode ? <div className="caps">{r.facCode}</div> : null}
          </div>
        </div>
        {r.reason ? (
          <div className="text-xs text-gunmetal/70 mt-2 line-clamp-2">
            {r.reason}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-gunmetal/55">
          <span className="truncate">
            {r.assignedInspector
              ? `Inspector: ${r.assignedInspector}`
              : `Requested by ${r.requestedByName}`}
          </span>
          {r.reportRef ? (
            <span className="chip green shrink-0">Report filed</span>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "amber" | "green";
  title: string;
  body: string;
}) {
  const accent = tone === "green" ? "var(--rpa-green)" : "#B8860B";
  return (
    <div
      className="card bleed p-4"
      style={{ borderLeft: `3px solid ${accent}` }}
      role="status"
    >
      <div className="font-bold text-sm">{title}</div>
      <div className="text-xs text-gunmetal/70 mt-0.5">{body}</div>
    </div>
  );
}
