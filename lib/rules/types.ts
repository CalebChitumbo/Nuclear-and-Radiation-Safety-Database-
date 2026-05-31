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
  /** Most recent date seen in the notifications (DD/MM/YYYY as pasted). */
  lastSeen: string;
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
