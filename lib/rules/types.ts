import type { NewApplicationStatus } from "./raisTemplates";

// The canonical RAIS status taxonomy lives in raisTemplates.ts (co-located with
// the email-template table it is derived from). Re-exported here so callers can
// keep importing status types from the central types module. This is a
// type-only import/re-export, so there is no runtime import cycle.
export type { NewApplicationStatus };

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
  licensed: boolean;
  stage: Stage;
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
  createdAt?: string;
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
  updatedAt?: string;
  updatedBy?: string;
}

export interface WeekMetrics {
  week: string;
  values: Record<string, number>;
  submittedBy?: Record<string, string>;
  status?: Record<string, "Pending" | "In Progress" | "Done">;
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
  auths: number;
  bySector: {
    Public: { total: number; licensed: number };
    Private: { total: number; licensed: number };
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
    auths: 0,
    bySector: {
      Public: { total: 0, licensed: 0 },
      Private: { total: 0, licensed: 0 },
    },
    byProvince,
    byStage: {},
  };
}
