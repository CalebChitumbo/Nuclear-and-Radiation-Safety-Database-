import type { NewApplicationStatus } from "./raisTemplates";
import type { CargoClass } from "./borderCargo";

// The canonical RAIS status taxonomy lives in raisTemplates.ts (co-located with
// the email-template table it is derived from). Re-exported here so callers can
// keep importing status types from the central types module. This is a
// type-only import/re-export, so there is no runtime import cycle.
export type { NewApplicationStatus };
// Same for the cargo vocabulary, which lives beside the commodity table.
export type { CargoClass };

export const PROVINCES = [
  "Lusaka",
  "Copperbelt",
  "North-Western",
  "Central",
  "Northern",
  "Luapula",
  "Eastern",
  "Western",
  "Southern",
  "Muchinga",
] as const;
export type Province = (typeof PROVINCES)[number];

export const SECTORS = ["Public", "Private"] as const;
export type Sector = (typeof SECTORS)[number];

/**
 * Medical vs non-medical practice split for the register's filters and
 * reports. Veterinary facilities count as Medical (clinical imaging); dealers,
 * screening, industrial and analytical practices are Non-Medical.
 */
export const CATEGORIES = ["Medical", "Non-Medical"] as const;
export type FacilityCategory = (typeof CATEGORIES)[number];

export const STAGES = [
  "Licensed",
  "No Application Submitted",
  "Invoice Generation Pending",
  "Waiting for Payment",
  "Accounts Clearance Pending",
  "Waiting for Review and Assessment",
  "Under Internal Review (Further Information Required)",
  "CEO Licence Approval Required",
  "Import Licence Only (Not yet Use/Possession)",
  // Added for the Licensing Status (RAIS workflow) tracker. These let the
  // facility register / Overview reflect the full pipeline an application moves
  // through once notifications are imported on the Licensing Status tab.
  "Application Submitted",
  "Under Review and Assessment",
  "Authorization Terms Issued",
  "Board Licence Approval Required",
  "Licence / Certificate Issued",
  "Inspection in Progress",
  // Added for the 2026 Facility Status List import — the RAIS "RPA official
  // use" final-processing step between review and licence issue.
  "In Final Processing",
  // Added for the RAIS email→status engine (driven by the RPA email-template
  // mapping). The granular per-email status lives on `currentStatus`; these are
  // the coarse buckets those statuses roll up to for `byStage` aggregates.
  "Draft Application",
  "Application Returned / Rejected",
  "Licence Expiring (Renewal Due)",
] as const;
export type Stage = (typeof STAGES)[number];

export const LICENCE_TYPES = [
  "New Use/Possession Licence",
  "Renewal of Use/Possession Licence",
  "Importation Licence",
  "Export Licence",
  "Transfer Licence",
  "Transport Licence",
  "Transit Licence",
  "Variation of Terms and Conditions",
  "Design and Construction Licence",
  "Decommissioning Licence",
] as const;
export type LicenceType = (typeof LICENCE_TYPES)[number];

export const INSPECTION_TYPES = [
  "Routine Inspection",
  "Follow-up",
  "Pre-Authorisation",
  "Investigation",
  "Enforcement Action",
] as const;
export type InspectionType = (typeof INSPECTION_TYPES)[number];

export const INSPECTION_OUTCOMES = [
  "Compliant",
  "Minor findings",
  "Major findings",
  "Non-compliant",
  "N/A",
] as const;
export type InspectionOutcome = (typeof INSPECTION_OUTCOMES)[number];

export const SECTIONS = [
  "Authorisation & Standards",
  "Inspectorate",
  "Nuclear Safety, Security & Safeguards",
  "National Source Inventory",
] as const;
export type Section = (typeof SECTIONS)[number];

export const ROLES = ["admin", "officer"] as const;
export type Role = (typeof ROLES)[number];

export interface Authorisation {
  type: LicenceType;
  number: string;
  date: string;
  /**
   * Quarter of issue ("2026-Q1") for licences the section reports by quarter
   * rather than by date — the Licensing Status workbook records no issue date.
   * `date` stays empty on those; everything that needs a year reads
   * `authYear()`, which falls back to this.
   */
  quarter?: string;
  eventId?: string;
}

export interface Facility {
  id: string;
  no: number;
  name: string;
  nameLower: string;
  district: string;
  province: Province;
  practice: string;
  sector: Sector;
  /**
   * Whether the facility is operating (the register's operating status).
   * Functional and licensing status are independent axes — a non-functional
   * facility can still hold a licence, and a functional one can be unlicensed.
   */
  functional: boolean;
  /** Medical (incl. veterinary) vs Non-Medical practice split. */
  category: FacilityCategory;
  licensed: boolean;
  stage: Stage;
  /**
   * An earlier (pre-2026) application that never completed and has had no
   * 2026 activity. The stage still shows how far it got.
   */
  stalled?: boolean;
  /** Imported with uncertainty — an officer should confirm this record. */
  needsReview?: boolean;
  /** Why the record is flagged for review. */
  reviewNote?: string;
  /**
   * The source line from the register import — the licensing status the
   * import read for this facility — kept as informational provenance.
   */
  statusDetail?: string;
  /**
   * The granular RAIS status this facility currently shows, taken from the most
   * recent applicable email for its active application (the spreadsheet's
   * `NewApplicationStatus`). `stage` is the coarse bucket it rolls up to; this is
   * the precise wording surfaced on the dashboard. Absent on older docs.
   */
  currentStatus?: NewApplicationStatus;
  facCode: string;
  auths: Authorisation[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface LicenceEvent {
  id: string;
  date: string;
  week: string;
  facilityId: string | null;
  facilityName: string;
  sector: Sector | "";
  province: Province | "";
  type: LicenceType;
  number: string;
  facCode: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface Inspection {
  id: string;
  date: string;
  week: string;
  facilityId: string | null;
  facilityName: string;
  type: InspectionType;
  outcome: InspectionOutcome;
  province: Province | "";
  sector: Sector | "";
  notes: string;
  /**
   * Set when this inspection was produced by completing an InspectionRequest
   * (the pre-authorisation handoff between Licensing and Inspectorate). Links the
   * dated inspection log back to the workflow that asked for it.
   */
  requestId?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Lifecycle of a cross-section inspection request — the handoff that lets the
 * Authorisation & Standards (Licensing) section ask the Inspectorate to inspect
 * a facility, and lets the Inspectorate report back when it is done. In pipeline
 * order; "Cancelled" is out-of-band (reachable from any active state).
 *
 *   Requested → Acknowledged → Assigned → In Progress → Report Ready → Closed
 *
 * - Requested     Licensing raised it; waiting for the Inspectorate to pick up.
 * - Acknowledged  Inspectorate accepted the request into its queue.
 * - Assigned      An inspector has been named (and optionally a target date).
 * - In Progress   The inspection is underway.
 * - Report Ready  Inspection done + report filed; Licensing is notified to act.
 * - Closed        Licensing has actioned the report; the loop is complete.
 * - Cancelled     Withdrawn by Licensing or declined by the Inspectorate.
 */
export const INSPECTION_REQUEST_STATUSES = [
  "Requested",
  "Acknowledged",
  "Assigned",
  "In Progress",
  "Report Ready",
  "Closed",
  "Cancelled",
] as const;
export type InspectionRequestStatus =
  (typeof INSPECTION_REQUEST_STATUSES)[number];

/** Urgency an officer sets on an inspection request. */
export const INSPECTION_PRIORITIES = ["Urgent", "High", "Normal", "Low"] as const;
export type InspectionPriority = (typeof INSPECTION_PRIORITIES)[number];

/**
 * One entry in an inspection request's audit trail. Every action — the initial
 * request, an acknowledgement, an assignment, a status move, a free-text comment
 * — appends one of these so both sections can read the full conversation and
 * history on the request without a separate messaging system.
 */
export interface InspectionRequestEvent {
  at: string;
  by: string;
  byName: string;
  bySection: Section | "All" | "";
  kind:
    | "created"
    | "acknowledged"
    | "assigned"
    | "started"
    | "completed"
    | "closed"
    | "cancelled"
    | "comment";
  status?: InspectionRequestStatus;
  text: string;
}

/**
 * A request from Licensing to the Inspectorate to inspect a facility (usually a
 * pre-authorisation inspection). It is the shared record both sections work on:
 * Licensing creates it and later reads the report reference off it; the
 * Inspectorate acknowledges, assigns an inspector, progresses and completes it.
 * Completing it records a dated Inspection (linked by `inspectionId`) so the
 * Inspectorate's "inspections conducted" database and the weekly report stay in
 * one place.
 */
export interface InspectionRequest {
  id: string;
  facilityId: string | null;
  facilityName: string;
  facCode: string;
  province: Province | "";
  sector: Sector | "";
  /** Kind of inspection asked for — defaults to Pre-Authorisation. */
  type: InspectionType;
  priority: InspectionPriority;
  status: InspectionRequestStatus;
  /** Why the inspection is needed (the licensing officer's justification). */
  reason: string;
  /** Optional link to the licensing application (RAIS RAN) driving this. */
  workflowRan?: string;
  /** When Licensing would like the inspection done by (ISO date, optional). */
  neededBy?: string;

  /** Requester (Licensing / Authorisation & Standards). */
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  requestedWeek: string;

  /** Inspectorate handling. */
  assignedInspector?: string;
  targetDate?: string;
  acknowledgedAt?: string;
  startedAt?: string;

  /** Completion / report. */
  completedAt?: string;
  completedDate?: string;
  outcome?: InspectionOutcome;
  /** Where the signed inspection report lives (a link, a RAIS ref, a location). */
  reportRef?: string;
  findings?: string;
  /** The dated Inspection record created when this request was completed. */
  inspectionId?: string;

  /** Set when cancelled/declined. */
  cancelReason?: string;

  /** Full audit trail / conversation, oldest first. */
  timeline: InspectionRequestEvent[];
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Kanban columns for the Licensing Status board, in pipeline order. Each parsed
 * RAIS notification is mapped to exactly one phase (see parseNotifications.ts).
 */
export const WORKFLOW_PHASES = [
  "Application",
  "Payment",
  "Accounts Clearance",
  "RPA Receipt",
  "Review & Assessment",
  "Authorization / Conditions",
  "Approval (CEO/Board)",
  "Licence Issued",
  "Inspection",
  "Other",
] as const;
export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

/** Urgency buckets, mirroring the officer's RAIS triage prompt. */
export const WORKFLOW_PRIORITIES = [
  "CRITICAL",
  "HIGH",
  "NORMAL",
  "APPLICANT",
] as const;
export type WorkflowPriority = (typeof WORKFLOW_PRIORITIES)[number];

/**
 * One entry in an application's notes & history trail — the shared memory pad
 * officers keep on a licence workflow (RAN). "comment" entries are typed by an
 * officer (any section) so whoever picks the application up next has the
 * background; "status" entries are appended automatically by the store whenever
 * a save changes what the application shows (a status move, an accepted email,
 * a FORM-I classification), so the trail reads as a who-did-what-when history
 * of the application without anyone having to write it up.
 */
export interface WorkflowNote {
  id: string;
  /** ISO timestamp the entry was made. */
  at: string;
  /** uid of the officer responsible. */
  by: string;
  byName: string;
  bySection: Section | "All" | "";
  kind: "comment" | "status";
  text: string;
  /** For "status" entries: the status label the application showed from here. */
  status?: string;
  /** How the underlying update entered the system (status entries only). */
  source?: "paste" | "email";
}

/**
 * One licensing application tracked through the RAIS pipeline, keyed by its
 * workflow RAN (e.g. AUTH/USE.REN/1097). Produced by the Licensing Status tab's
 * parser from pasted dashboard notifications and persisted so the register stays
 * current across reloads. A facility can own several of these at once (different
 * RANs), which is why the unit is the RAN, not the facility.
 */
export interface LicenceWorkflow {
  id: string;
  ran: string;
  ranType: string;
  facilityId: string | null;
  facilityName: string;
  facCode: string;
  /** Fuzzy-match confidence (0–1) against the register; 1 = exact FAC code. */
  matchScore?: number;
  /** The furthest-reached notification title (what the card headline shows). */
  notificationTitle: string;
  /** Short sub-stage label shown on the card, e.g. "CEO Approval". */
  stage: string;
  phase: WorkflowPhase;
  responsibleParty: string;
  priority: WorkflowPriority;
  outstandingPayment: boolean;
  bottleneck: boolean;
  /** Payment workflow RAN (AUTH/PAY/####) when one was seen. */
  paymentRan?: string;
  /** Human-readable dependency / bottleneck alerts for this application. */
  alerts: string[];
  /** Every notification title seen for this RAN, in input order. */
  notifications: string[];
  /** The Stage value rolled up onto the matched facility on commit. */
  facilityStage: Stage;
  /**
   * The canonical RAIS status this email maps to (the spreadsheet's
   * `NewApplicationStatus`). This is what supersedes the facility's displayed
   * status; `facilityStage` is the coarse bucket it rolls up to. Undefined for
   * records classified only by the legacy regex rules (dashboard-paste titles).
   */
  currentStatus?: NewApplicationStatus;
  /**
   * The licence type an officer has assigned to this application's number. RAIS
   * FORM-I numbers (RPA/LIC/####) don't encode a type — they may be import,
   * design & construction, transport, transit or use/possession — so the officer
   * classifies the number once and that choice sticks to every later
   * notification for the same RAN (it overrides the RAN/status guess in
   * workflowLicenceType). Absent until an officer sets it.
   */
  officerType?: LicenceType;
  /**
   * Set for the two licence-issuing emails and the resets. "renewal-auto" and
   * "form-i-prompt" surface in the Ready-to-license panel for the officer's R1–R6
   * action; "reset" marks rejection/returned/declination/withdrawal/additional-info
   * so a genuinely newer one may move the status backward (see supersede.ts).
   */
  special?: "renewal-auto" | "form-i-prompt" | "reset";
  /** Most recent date seen in the notifications (DD/MM/YYYY as pasted). */
  lastSeen: string;
  /**
   * How this record entered the system: an officer paste on the Licensing
   * Status tab, or the automatic RAIS email connector (ingestRaisEmail).
   */
  source?: "paste" | "email";
  /**
   * Set on email-ingested records. "applied" means a confident facility match
   * was auto-rolled onto the register; "needs-review" means it is waiting for an
   * officer to confirm the facility match on the Licensing Status tab.
   */
  reviewStatus?: "applied" | "needs-review";
  /** ISO timestamp the connector received the source email. */
  receivedAt?: string;
  /** Subject line of the source email (for the review queue). */
  emailSubject?: string;
  /**
   * Officer notes & automatic status history, oldest first (see WorkflowNote).
   * Comments are appended by officers from the application-history drawer or
   * the facility drawer; "status" entries are appended by saveLicenceWorkflows.
   * The trail is append-only and survives every import — an import payload
   * never carries it, it only adds to it. Absent on records saved before the
   * feature existed.
   */
  notes?: WorkflowNote[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface WeekMetrics {
  week: string;
  values: Record<string, number>;
  submittedBy?: Record<string, string>;
  status?: Record<string, "Pending" | "In Progress" | "Done">;
}

/**
 * The Status column of the approved work plan. "Pending" is the workbook's own
 * wording for an output that is under way but not yet delivered; the other
 * values let an officer say what the figures alone cannot.
 */
export const WORK_PLAN_STATUSES = [
  "Not Started",
  "In Progress",
  "Pending",
  "On Hold",
  "Achieved",
  "Cancelled",
] as const;
export type WorkPlanStatus = (typeof WORK_PLAN_STATUSES)[number];

/**
 * What each work plan output had already achieved before the system started
 * counting it — one document per plan year. The report is cumulative for the
 * year, so every output starts from its opening balance and adds what has been
 * recorded since. Saving one REPLACES the figures the code ships with (the
 * approved workbook's actuals at handover) rather than adding to them.
 */
export interface WorkPlanBaseline {
  /** The plan year — also the document id. */
  year: number;
  /** Output id → [Q1, Q2, Q3, Q4] carried in. */
  values: Record<string, number[]>;
  /** Free-text provenance: where the figures were taken from, and when. */
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * The narrative an officer keeps against one work plan output — the workbook's
 * Status / Comments / Action Points columns. Figures are derived from the
 * registers and the logged metrics; only these three are typed, and they belong
 * to the output for the whole plan year rather than to a single week.
 */
export interface WorkPlanNote {
  /** The work plan output id, e.g. "1.2.4" — also the document id. */
  id: string;
  /** Overrides the status derived from the figures when set. */
  status?: WorkPlanStatus;
  comments?: string;
  actionPoints?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * One daily log line from a section — the unit of the Daily Updates tab.
 * `count` entries carry a number against a metric (keyed with the SAME
 * metricKey the weekly report uses, so daily figures sum straight into the
 * weekly totals); `note` entries are free-text "what happened today" lines.
 * Dated licences and inspections are NOT duplicated here — those collections
 * are already daily-dated and the Daily Updates tab reads them directly.
 */
export interface DailyEntry {
  id: string;
  /** YYYY-MM-DD (local Zambia date the work happened). */
  date: string;
  /** Reporting week the date lands in (weekLabelForDate). */
  week: string;
  section: Section;
  kind: "count" | "note";
  /** metricKey(section, label) — present on count entries. */
  metricKey?: string;
  /** Human label of the metric (count entries). */
  label?: string;
  value?: number;
  /** Note text, or an optional remark attached to a count. */
  text?: string;
  /**
   * The border post this count came from (NSSS vehicle screening). Each
   * border coordinator logs their own figure; the day's official total is the
   * sum across borders. Absent on non-border entries.
   */
  border?: string;
  /**
   * Marks the NSSS senior officer's official daily confirmation (a `note`
   * entry recording the confirmed screening total). Never set on the border
   * coordinators' count entries — the numbers stay single-sourced.
   */
  official?: boolean;
  /**
   * Set on the count a border post posts from its scan log rather than typing.
   * The figure is the number of scans recorded that day, so re-posting replaces
   * the previous one instead of adding to it — the weekly total can never
   * double count a post that logs truck by truck.
   */
  source?: "scan-log";
  createdAt?: string;
  updatedBy?: string;
  updatedByName?: string;
}

/**
 * A border post / office the NSSS section screens vehicles at. Coordinators
 * pick their border when logging a daily screening count; deactivated borders
 * keep their history but stop appearing in the picker. Managed by the NSSS
 * section (and admins) on the NSSS tab.
 */
export interface Border {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedBy?: string;
}

/**
 * How a scanned unit was identified. Derived from the shape of what the
 * officer typed, so it is never a question on the form: Tanzanian and Zambian
 * plates look like plates, an imported vehicle carries a chassis number, and a
 * 17-character VIN is a VIN.
 */
export const VEHICLE_ID_KINDS = ["Plate", "Chassis", "VIN", "Other"] as const;
export type VehicleIdKind = (typeof VEHICLE_ID_KINDS)[number];

/** Which way the unit was moving through the post. */
export const SCAN_DIRECTIONS = ["Inbound", "Outbound", "Transit"] as const;
export type ScanDirection = (typeof SCAN_DIRECTIONS)[number];

/**
 * The radiological outcome of a scan, derived from the dose rate against the
 * post's review thresholds (see borderScans.ts). Not a regulatory
 * classification — a working triage that decides whether the truck moves on or
 * gets a second look.
 */
export const SCAN_RESULTS = ["Normal", "Elevated", "Alarm"] as const;
export type ScanResult = (typeof SCAN_RESULTS)[number];

/** What the officer did with the unit. Required once a reading is elevated. */
export const SCAN_ACTIONS = [
  "Released",
  "Re-scanned & released",
  "Referred for secondary inspection",
  "Held pending investigation",
  "Denied entry",
  "Escalated to RPA Head Office",
] as const;
export type ScanAction = (typeof SCAN_ACTIONS)[number];

/**
 * One scanned truck at a border post — the unit of the border scan log, and
 * the record the monthly workbook kept as a spreadsheet row.
 *
 * A post logs a few hundred of these a day, so every field is either picked
 * from a controlled list, derived, or carried over from the shift header. The
 * day's tallies (what used to be typed into the summary block beside each
 * sheet) are computed from these rows — see summariseScans in borderScans.ts.
 */
export interface TruckScan {
  id: string;
  /** YYYY-MM-DD — the shift's date, set once in the header. */
  date: string;
  /** Reporting week the date lands in (weekLabelForDate). */
  week: string;
  /** Border post name — set once in the header, from the Border register. */
  border: string;
  /** HH:MM local, stamped on save. Shows the post's peak hours. */
  time?: string;
  /** Registration or chassis number, normalised (upper case, no spaces). */
  vehicleId: string;
  /** Derived from the shape of vehicleId — never typed. */
  vehicleIdKind: VehicleIdKind;
  /** Carried over from the shift header unless changed on the scan. */
  direction?: ScanDirection;
  /** Derived from the commodity, or picked when the commodity is new. */
  cargoClass: CargoClass;
  /** Canonical commodity name (resolveCommodity). */
  commodity: string;
  /** Commodity commonly carries NORM — copied so old rows keep their meaning. */
  norm?: boolean;
  transporter: string;
  /** Dose rate at the vehicle, nSv/h — as read off the monitor. */
  doseNSvH: number;
  /** Derived from doseNSvH against the review thresholds. */
  result: ScanResult;
  /** What the officer did. Required once the reading is above background. */
  action?: ScanAction;
  remarks?: string;
  officerUid?: string;
  officerName?: string;
  createdAt?: string;
}

export interface Activity {
  id: string;
  week: string;
  section: Section | string;
  text: string;
  status: "Done" | "In Progress" | "Not Started" | "On Hold";
  createdAt?: string;
  updatedBy?: string;
}

export interface DashboardAggregate {
  total: number;
  licensed: number;
  unlicensed: number;
  /** Facilities currently operating (functional=true). Absent on old docs. */
  functional?: number;
  auths: number;
  bySector: {
    Public: { total: number; licensed: number };
    Private: { total: number; licensed: number };
  };
  /** Medical vs Non-Medical split. Absent on aggregate docs written before it. */
  byCategory?: {
    Medical: { total: number; licensed: number };
    "Non-Medical": { total: number; licensed: number };
  };
  byProvince: Record<Province, { total: number; licensed: number }>;
  byStage: Partial<Record<Stage, number>>;
  updatedAt?: string;
  /**
   * Epoch ms taken when the rollup's register scan STARTED, stamped by the
   * onFacilityWrite Cloud Function. Concurrent recomputes use it as a
   * last-count-wins guard so an earlier (stale) scan can never overwrite a
   * later one. Absent on docs written before this guard existed.
   */
  countedAt?: number;
}

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  section: Section | "All";
  disabled?: boolean;
}

export interface WeekDef {
  label: string;
  start: string;
  end: string;
}

export function isUseP(type: LicenceType): boolean {
  return (
    type === "New Use/Possession Licence" ||
    type === "Renewal of Use/Possession Licence"
  );
}

export function emptyAggregate(): DashboardAggregate {
  const byProvince = {} as Record<Province, { total: number; licensed: number }>;
  for (const p of PROVINCES) byProvince[p] = { total: 0, licensed: 0 };
  return {
    total: 0,
    licensed: 0,
    unlicensed: 0,
    functional: 0,
    auths: 0,
    bySector: {
      Public: { total: 0, licensed: 0 },
      Private: { total: 0, licensed: 0 },
    },
    byCategory: {
      Medical: { total: 0, licensed: 0 },
      "Non-Medical": { total: 0, licensed: 0 },
    },
    byProvince,
    byStage: {},
  };
}
