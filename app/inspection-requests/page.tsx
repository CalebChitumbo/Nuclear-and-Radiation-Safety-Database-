"use client";

import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { InspectionRequestDrawer } from "@/components/InspectionRequestDrawer";
import { useToast } from "@/components/Toast";
import { norm } from "@/lib/rules/matching";
import {
  REQUEST_PRIORITY_META,
  REQUEST_STATUS_META,
  deriveInspectionInbox,
  inspectionRequestStats,
} from "@/lib/rules/inspectionRequests";
import {
  PRE_AUTH_INSPECTION_TARGET,
  SLA_STATE_META,
  inspectionRequestSla,
  overdueInspectionRequests,
  slaPhrase,
} from "@/lib/rules/sla";
import { todayISO } from "@/lib/rules/week";
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
  const today = todayISO();
  const overdue = useMemo(
    () => overdueInspectionRequests(requests, today),
    [requests, today],
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
      toast.push("Add a reason so the Inspectorate knows what is needed.", "error");
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
      {overdue.length > 0 ? (
        <Banner
          tone="red"
          title={`${overdue.length} inspection ${
            overdue.length === 1 ? "request is" : "requests are"
          } past the ${PRE_AUTH_INSPECTION_TARGET}-working-day SOP window`}
          body="The SOP requires a recommended pre-authorisation inspection to be conducted within 26 working days. Prioritise these."
        />
      ) : null}
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
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label="Open requests" value={stats.open} />
        <Kpi
          label="Awaiting Inspectorate"
          value={inbox.incoming.length}
          accent="amber"
        />
        <Kpi
          label={`Overdue (${PRE_AUTH_INSPECTION_TARGET}-day SOP)`}
          value={overdue.length}
          accent={overdue.length ? "red" : "slate"}
          caption="Working days from the request"
        />
        <Kpi
          label="Reports ready"
          value={stats.reportsReady}
          accent="green"
        />
        <Kpi
          label={`Facilities inspected (${CURRENT_YEAR})`}
          value={stats.completedThisYear}
          accent="slate"
          caption={`${stats.facilitiesInspected} facilities all-time`}
        />
      </section>

      {/* Raise a request (Licensing / admin) */}
      {canEditAS ? (
        <div className="card p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="caps text-xs text-gunmetal/60">
                Request a pre-authorisation inspection
              </div>
              <div className="text-xs text-gunmetal/60 mt-1">
                Sends the request to the Inspectorate and tracks it to the report.
              </div>
            </div>
            <button
              className="btn btn-primary"
              aria-pressed={showForm}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "Close" : "+ New request"}
            </button>
          </div>

          {showForm ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="caps text-[10px] text-gunmetal/60">
                  Facility
                </label>
                <div className="relative">
                  <input
                    className="input mt-1"
                    placeholder="Search register…"
                    value={selected ? selected.name : facilityQuery}
                    onChange={(e) => {
                      setFacilityQuery(e.target.value);
                      setFacilityId(null);
                      setFacilityNameFreeText(e.target.value);
                    }}
                  />
                  {suggestions.length > 0 && !selected ? (
                    <ul className="absolute left-0 right-0 mt-1 z-20 card max-h-60 overflow-y-auto">
                      {suggestions.map((f) => (
                        <li
                          key={f.id}
                          onClick={() => {
                            setFacilityId(f.id);
                            setFacilityQuery(f.name);
                          }}
                          className="px-3 py-2 text-sm hover:bg-mist cursor-pointer"
                        >
                          <div className="font-bold">{f.name}</div>
                          <div className="text-xs text-gunmetal/60">
                            {f.facCode || "—"} · {f.district || "—"} · {f.province}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="text-[11px] text-gunmetal/55 mt-1">
                  Free-text is fine if the facility isn&apos;t in the register yet.
                </div>
              </div>

              <div>
                <label className="caps text-[10px] text-gunmetal/60">
                  Linked application (RAN, optional)
                </label>
                <input
                  className="input mt-1"
                  placeholder="AUTH/USE.NEW/0203"
                  value={workflowRan}
                  onChange={(e) => setWorkflowRan(e.target.value)}
                />
              </div>

              <div>
                <label className="caps text-[10px] text-gunmetal/60">Type</label>
                <select
                  className="input mt-1"
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
                  <label className="caps text-[10px] text-gunmetal/60">
                    Priority
                  </label>
                  <select
                    className="input mt-1"
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
                  <label className="caps text-[10px] text-gunmetal/60">
                    Needed by
                  </label>
                  <input
                    type="date"
                    className="input mt-1"
                    value={neededBy}
                    onChange={(e) => setNeededBy(e.target.value)}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="caps text-[10px] text-gunmetal/60">
                  Reason / scope
                </label>
                <textarea
                  className="input mt-1"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Pre-authorisation inspection for a new use/possession licence — verify shielding and source security."
                />
              </div>

              <div className="md:col-span-2 flex gap-2">
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
        </div>
      ) : null}

      {/* Filter + board */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="caps text-xs text-gunmetal/60">
            {filtered.length} {filtered.length === 1 ? "request" : "requests"}
          </div>
          <div className="flex flex-wrap gap-1">
            <FilterChip active={filter === ""} onClick={() => setFilter("")}>
              All
            </FilterChip>
            {INSPECTION_REQUEST_STATUSES.map((sName) => (
              <FilterChip
                key={sName}
                active={filter === sName}
                onClick={() => setFilter(sName)}
                count={stats.byStatus[sName]}
              >
                {REQUEST_STATUS_META[sName].label}
              </FilterChip>
            ))}
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="py-10 text-center text-sm text-gunmetal/55">
            No inspection requests yet.
            {canEditAS
              ? " Use “New request” above to ask the Inspectorate to inspect a facility."
              : " Licensing officers raise these when a facility needs a pre-authorisation inspection."}
          </div>
        ) : (
          <div className="mt-4 space-y-6">
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
                    <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
      </div>

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
  const sla = inspectionRequestSla(r, todayISO());
  // Surface the 26-day clock when it needs attention; a quietly on-track or
  // met clock just shows its due date on the right.
  const slaAlert =
    sla && (sla.state === "due-soon" || sla.state === "overdue" || sla.state === "met-late");
  return (
    <li>
      <button
        onClick={onOpen}
        className="w-full text-left card p-4 hover:shadow-md transition-shadow"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold truncate">{r.facilityName}</div>
            <div className="text-xs text-gunmetal/60 mt-0.5">
              <span className="chip slate mr-1">{r.type}</span>
              <span className={`chip ${priority.chip} mr-1`}>{priority.label}</span>
              {slaAlert && sla ? (
                <span className={`chip ${SLA_STATE_META[sla.state].chip}`}>
                  {slaPhrase(sla)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-[11px] tabular text-gunmetal/55 text-right shrink-0">
            {sla && !slaAlert && sla.state !== "met" ? (
              <div>due {sla.dueDate}</div>
            ) : null}
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

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="px-2.5 py-1 text-xs caps font-bold rounded-lg border"
      style={{
        background: active ? "var(--rpa-green)" : "transparent",
        color: active ? "white" : "var(--gunmetal)",
        borderColor: active ? "var(--rpa-green)" : "rgba(26,27,29,0.12)",
      }}
    >
      {children}
      {typeof count === "number" && count > 0 ? (
        <span className="ml-1 opacity-80">{count}</span>
      ) : null}
    </button>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "amber" | "green" | "red";
  title: string;
  body: string;
}) {
  const bg =
    tone === "green"
      ? "rgba(0,160,80,0.10)"
      : tone === "red"
        ? "rgba(190,49,38,0.10)"
        : "rgba(184,134,11,0.12)";
  const border =
    tone === "green"
      ? "rgba(0,160,80,0.35)"
      : tone === "red"
        ? "rgba(190,49,38,0.35)"
        : "rgba(184,134,11,0.35)";
  return (
    <div
      className="card p-4"
      style={{ background: bg, borderColor: border }}
      role="status"
    >
      <div className="font-bold text-sm">{title}</div>
      <div className="text-xs text-gunmetal/70 mt-0.5">{body}</div>
    </div>
  );
}
