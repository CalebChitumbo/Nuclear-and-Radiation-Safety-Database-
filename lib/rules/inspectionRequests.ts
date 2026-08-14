/**
 * Pure business logic for the Licensing ↔ Inspectorate handoff.
 *
 * An InspectionRequest is the shared record the two sections collaborate on: the
 * Authorisation & Standards (Licensing) section raises it when a facility needs
 * an inspection (typically a pre-authorisation inspection before a licence can be
 * issued); the Inspectorate acknowledges it, assigns an inspector, carries out
 * the inspection and files the report. This module owns the state machine, the
 * capability gating (which section may take which action), the audit trail, the
 * cross-section "inbox" notifications and the summary stats — all framework-free
 * and unit-tested. Side effects (persisting, and recording the dated Inspection
 * on completion) live in the store; this module only computes the next value.
 */
import type {
  Inspection,
  InspectionOutcome,
  InspectionPriority,
  InspectionRequest,
  InspectionRequestEvent,
  InspectionRequestStatus,
  InspectionType,
  Province,
  Section,
  Sector,
} from "./types";

/** Presentation metadata for a status pill (chip colour + pipeline order). */
export const REQUEST_STATUS_META: Record<
  InspectionRequestStatus,
  { chip: "green" | "amber" | "red" | "slate"; order: number; label: string }
> = {
  Requested: { chip: "amber", order: 0, label: "Requested" },
  Acknowledged: { chip: "slate", order: 1, label: "Acknowledged" },
  Assigned: { chip: "slate", order: 2, label: "Assigned" },
  "In Progress": { chip: "amber", order: 3, label: "In Progress" },
  "Report Ready": { chip: "green", order: 4, label: "Report Ready" },
  Closed: { chip: "slate", order: 5, label: "Closed" },
  Cancelled: { chip: "red", order: -1, label: "Cancelled" },
};

export const REQUEST_PRIORITY_META: Record<
  InspectionPriority,
  { chip: "green" | "amber" | "red" | "slate"; label: string }
> = {
  Urgent: { chip: "red", label: "Urgent" },
  High: { chip: "amber", label: "High" },
  Normal: { chip: "slate", label: "Normal" },
  Low: { chip: "slate", label: "Low" },
};

/** Active = still in the pipeline (not finished and not cancelled). */
const ACTIVE_STATUSES: InspectionRequestStatus[] = [
  "Requested",
  "Acknowledged",
  "Assigned",
  "In Progress",
];

export function isActiveRequest(r: InspectionRequest): boolean {
  return ACTIVE_STATUSES.includes(r.status);
}

/** Who is acting, so the timeline records the section as well as the person. */
export interface RequestActor {
  uid: string;
  name: string;
  section: Section | "All" | "";
}

export interface NewInspectionRequestInput {
  facilityId: string | null;
  facilityName: string;
  facCode?: string;
  province?: Province | "";
  sector?: Sector | "";
  type?: InspectionType;
  priority?: InspectionPriority;
  reason: string;
  workflowRan?: string;
  neededBy?: string;
}

/**
 * Build a brand-new request (status Requested) with its opening timeline entry.
 * The store assigns the id; `week` is the reporting week the request lands in.
 */
export function buildInspectionRequest(
  input: NewInspectionRequestInput,
  actor: RequestActor,
  now: string,
  week: string,
): Omit<InspectionRequest, "id"> {
  const type: InspectionType = input.type || "Pre-Authorisation";
  const reason = input.reason.trim();
  const opening: InspectionRequestEvent = {
    at: now,
    by: actor.uid,
    byName: actor.name,
    bySection: actor.section,
    kind: "created",
    status: "Requested",
    text: `Requested a ${type}${reason ? ` — ${reason}` : ""}`,
  };
  return {
    facilityId: input.facilityId,
    facilityName: input.facilityName.trim(),
    facCode: input.facCode || "",
    province: input.province || "",
    sector: input.sector || "",
    type,
    priority: input.priority || "Normal",
    status: "Requested",
    reason,
    workflowRan: input.workflowRan || undefined,
    neededBy: input.neededBy || undefined,
    requestedBy: actor.uid,
    requestedByName: actor.name,
    requestedAt: now,
    requestedWeek: week,
    timeline: [opening],
    updatedAt: now,
    updatedBy: actor.uid,
  };
}

export type InspectionRequestAction =
  | { kind: "acknowledge"; note?: string }
  | { kind: "assign"; inspector: string; targetDate?: string; note?: string }
  | { kind: "start"; note?: string }
  | {
      kind: "complete";
      outcome: InspectionOutcome;
      reportRef: string;
      completedDate: string;
      findings?: string;
      /**
       * The two inspection-database columns an inspector fills at the facility:
       * the enforcement action the visit led to (if any), and whether an
       * inspection card was issued. Both land on the dated Inspection this
       * completion records, so a request-driven inspection reaches the province
       * sheet and the card list as fully as one logged on the Inspectorate tab.
       */
      enforcement?: string;
      cardIssued?: string;
    }
  | { kind: "close"; note?: string }
  | { kind: "cancel"; reason: string }
  | { kind: "comment"; note: string };

export type InspectionRequestActionKind = InspectionRequestAction["kind"];

// Which statuses each action may fire from. `comment` is always allowed and so
// is omitted here.
const ALLOWED_FROM: Record<
  Exclude<InspectionRequestActionKind, "comment">,
  InspectionRequestStatus[]
> = {
  acknowledge: ["Requested"],
  assign: ["Requested", "Acknowledged", "Assigned", "In Progress"],
  start: ["Acknowledged", "Assigned"],
  complete: ["Acknowledged", "Assigned", "In Progress"],
  close: ["Report Ready"],
  cancel: ["Requested", "Acknowledged", "Assigned", "In Progress"],
};

export function canApplyAction(
  status: InspectionRequestStatus,
  kind: InspectionRequestActionKind,
): boolean {
  if (kind === "comment") return true;
  return ALLOWED_FROM[kind].includes(status);
}

/**
 * The dated Inspection a completed request produces. Both stores record it —
 * one atomically in a batch, one in memory — so the shape lives here, where the
 * completion action is defined, rather than being written out twice.
 *
 * The facility's district and practice are deliberately absent: the request
 * carries a `facilityId`, so the inspection database reads them off the
 * register, which is always more current than a copy taken at completion.
 */
export function inspectionFromCompletion(
  request: InspectionRequest,
  action: Extract<InspectionRequestAction, { kind: "complete" }>,
  week: string,
  now: string,
): Omit<Inspection, "id"> {
  return {
    date: action.completedDate,
    week,
    facilityId: request.facilityId,
    facilityName: request.facilityName,
    type: request.type,
    outcome: action.outcome,
    province: request.province,
    sector: request.sector,
    notes:
      action.findings?.trim() ||
      `Pre-authorisation inspection for ${request.facilityName}.`,
    requestId: request.id,
    ...(action.enforcement ? { enforcement: action.enforcement } : {}),
    ...(action.cardIssued ? { cardIssued: action.cardIssued } : {}),
    createdAt: now,
  };
}

/**
 * Apply an action to a request, returning a new request with the status moved
 * and a timeline entry appended. Throws if the action is not valid from the
 * current status (the UI only offers valid actions, but the guard keeps the
 * store honest). `inspectionId` on completion is stamped by the store once it
 * has recorded the dated Inspection.
 */
export function applyInspectionRequestAction(
  request: InspectionRequest,
  action: InspectionRequestAction,
  actor: RequestActor,
  now: string,
): InspectionRequest {
  if (!canApplyAction(request.status, action.kind)) {
    throw new Error(
      `Cannot ${action.kind} a request that is "${request.status}".`,
    );
  }

  const next: InspectionRequest = {
    ...request,
    timeline: [...request.timeline],
    updatedAt: now,
    updatedBy: actor.uid,
  };

  const event: InspectionRequestEvent = {
    at: now,
    by: actor.uid,
    byName: actor.name,
    bySection: actor.section,
    kind: "comment",
    text: "",
  };

  switch (action.kind) {
    case "acknowledge": {
      next.status = "Acknowledged";
      next.acknowledgedAt = now;
      event.kind = "acknowledged";
      event.status = next.status;
      event.text = withNote("Acknowledged by the Inspectorate", action.note);
      break;
    }
    case "assign": {
      const inspector = action.inspector.trim();
      if (!inspector) throw new Error("An inspector name is required to assign.");
      next.assignedInspector = inspector;
      if (action.targetDate) next.targetDate = action.targetDate;
      // Acknowledging is implicit in assigning straight from Requested.
      if (request.status === "Requested" && !next.acknowledgedAt) {
        next.acknowledgedAt = now;
      }
      next.status = request.status === "In Progress" ? "In Progress" : "Assigned";
      event.kind = "assigned";
      event.status = next.status;
      event.text = withNote(
        `Assigned to ${inspector}${
          action.targetDate ? ` · target ${action.targetDate}` : ""
        }`,
        action.note,
      );
      break;
    }
    case "start": {
      next.status = "In Progress";
      next.startedAt = now;
      event.kind = "started";
      event.status = next.status;
      event.text = withNote("Inspection started", action.note);
      break;
    }
    case "complete": {
      const reportRef = action.reportRef.trim();
      next.status = "Report Ready";
      next.completedAt = now;
      next.completedDate = action.completedDate;
      next.outcome = action.outcome;
      next.reportRef = reportRef || undefined;
      next.findings = action.findings?.trim() || undefined;
      event.kind = "completed";
      event.status = next.status;
      event.text = withNote(
        `Inspection completed — ${action.outcome}${
          action.enforcement ? `. ${action.enforcement}` : ""
        }${reportRef ? `. Report: ${reportRef}` : ""}`,
        action.findings,
      );
      break;
    }
    case "close": {
      next.status = "Closed";
      event.kind = "closed";
      event.status = next.status;
      event.text = withNote(
        "Report actioned by Licensing; request closed",
        action.note,
      );
      break;
    }
    case "cancel": {
      const reason = action.reason.trim();
      next.status = "Cancelled";
      next.cancelReason = reason || undefined;
      event.kind = "cancelled";
      event.status = next.status;
      event.text = `Cancelled${reason ? ` — ${reason}` : ""}`;
      break;
    }
    case "comment": {
      const note = action.note.trim();
      if (!note) throw new Error("A comment cannot be empty.");
      event.kind = "comment";
      event.text = note;
      break;
    }
  }

  next.timeline.push(event);
  return next;
}

function withNote(base: string, note?: string): string {
  const n = note?.trim();
  return n ? `${base} — ${n}` : base;
}

export interface RequestCapabilities {
  canEditAS: boolean;
  canEditInsp: boolean;
}

/**
 * The actions the current user may take on a request, in display order. The
 * Inspectorate drives the inspection; Licensing (the requester) closes the loop
 * once the report is ready. Either may comment, and either may cancel while the
 * request is still active.
 */
export function allowedActions(
  request: InspectionRequest,
  caps: RequestCapabilities,
): InspectionRequestActionKind[] {
  const out: InspectionRequestActionKind[] = [];
  const status = request.status;
  const insp = caps.canEditInsp;
  const as = caps.canEditAS;

  if (insp && canApplyAction(status, "acknowledge")) out.push("acknowledge");
  if (insp && canApplyAction(status, "assign")) out.push("assign");
  if (insp && canApplyAction(status, "start")) out.push("start");
  if (insp && canApplyAction(status, "complete")) out.push("complete");
  if (as && canApplyAction(status, "close")) out.push("close");
  if ((as || insp) && canApplyAction(status, "cancel")) out.push("cancel");
  if (as || insp) out.push("comment");
  return out;
}

export interface InspectionInbox {
  /** New requests waiting for the Inspectorate to pick up. */
  incoming: InspectionRequest[];
  /** Requests the Inspectorate has accepted but not yet reported on. */
  inProgress: InspectionRequest[];
  /** Completed reports waiting for Licensing to action. */
  reportsReady: InspectionRequest[];
  /** Count relevant to THIS user (drives the sidebar badge). */
  count: number;
}

/**
 * Split the requests into the two handoff queues and compute the attention count
 * for the signed-in user. An Inspectorate officer is alerted to new incoming
 * requests; a Licensing officer is alerted to reports that are ready to action.
 * Admins / "All" see both.
 */
export function deriveInspectionInbox(
  requests: InspectionRequest[],
  caps: RequestCapabilities,
): InspectionInbox {
  const incoming = requests.filter((r) => r.status === "Requested");
  const inProgress = requests.filter((r) =>
    ["Acknowledged", "Assigned", "In Progress"].includes(r.status),
  );
  const reportsReady = requests.filter((r) => r.status === "Report Ready");
  const count =
    (caps.canEditInsp ? incoming.length : 0) +
    (caps.canEditAS ? reportsReady.length : 0);
  return { incoming, inProgress, reportsReady, count };
}

export interface InspectionRequestStats {
  total: number;
  open: number;
  byStatus: Record<InspectionRequestStatus, number>;
  reportsReady: number;
  completed: number;
  completedThisYear: number;
  facilitiesInspected: number;
}

/**
 * Summary numbers for the Inspectorate's request database — totals by status,
 * how many reports are ready, and how many distinct facilities have had a
 * completed inspection (this year and overall).
 */
export function inspectionRequestStats(
  requests: InspectionRequest[],
  year: number,
): InspectionRequestStats {
  const byStatus = {
    Requested: 0,
    Acknowledged: 0,
    Assigned: 0,
    "In Progress": 0,
    "Report Ready": 0,
    Closed: 0,
    Cancelled: 0,
  } as Record<InspectionRequestStatus, number>;

  let open = 0;
  let completed = 0;
  let completedThisYear = 0;
  const inspectedFacilities = new Set<string>();
  const yearPrefix = String(year);

  for (const r of requests) {
    byStatus[r.status] += 1;
    if (isActiveRequest(r)) open += 1;
    if (r.status === "Report Ready" || r.status === "Closed") {
      completed += 1;
      const key = r.facilityId || r.facilityName;
      if (key) inspectedFacilities.add(key);
      if ((r.completedDate || "").startsWith(yearPrefix)) completedThisYear += 1;
    }
  }

  return {
    total: requests.length,
    open,
    byStatus,
    reportsReady: byStatus["Report Ready"],
    completed,
    completedThisYear,
    facilitiesInspected: inspectedFacilities.size,
  };
}
