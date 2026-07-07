/**
 * The SOP's statutory clocks, applied to the records the app already keeps.
 *
 * The RPA licensing SOP sets hard timelines:
 *  - a pre-authorisation inspection within 26 WORKING days of the
 *    recommendation (the inspection request),
 *  - the licence within 44 WORKING days of a complete application,
 *  - a renewal licence within 15 WORKING days of a complete renewal,
 *  - 14 days for a client to answer a Form II (request for further
 *    particulars).
 *
 * This module derives due dates and ageing from those clocks — pure functions
 * over the existing InspectionRequest / LicenceWorkflow records, so no
 * migration is needed: everything is computed from dates already stored.
 *
 * It also owns the SOP's verification gate: the inspection outcome decides
 * whether an application proceeds to TECHCOM or goes back for further
 * particulars.
 */
import { parseRaisDate } from "./supersede";
import { toISO } from "./week";
import {
  addWorkingDays,
  workingDaysBetween,
  workingDaysLeft,
} from "./workingDays";
import type {
  InspectionOutcome,
  InspectionRequest,
  LicenceWorkflow,
} from "./types";

// ---------------------------------------------------------------------------
// SOP targets (working days)
// ---------------------------------------------------------------------------

/** Pre-authorisation inspection: within 26 working days of the recommendation. */
export const PRE_AUTH_INSPECTION_TARGET = 26;
/** New licence issued within 44 working days of a complete application. */
export const NEW_LICENCE_TARGET = 44;
/** Renewal licence issued within 15 working days of a complete renewal. */
export const RENEWAL_TARGET = 15;
/** Client response window for a Form II (request for further particulars). */
export const FURTHER_PARTICULARS_TARGET = 14;
/** "Due soon" warning threshold (working days remaining). */
export const DUE_SOON_THRESHOLD = 5;
/** 44-day applications flag "at risk" once this many working days have run. */
export const APPLICATION_AT_RISK_AFTER = 30;

// ---------------------------------------------------------------------------
// Generic clock state
// ---------------------------------------------------------------------------

export type SlaState = "on-track" | "due-soon" | "overdue" | "met" | "met-late";

export interface SlaStatus {
  /** The SOP due date (ISO). */
  dueDate: string;
  /**
   * Working days relative to the due date: positive = still to run, 0 = due
   * today, negative = overdue by that many working days. For completed clocks
   * it is measured at the completion date, not today.
   */
  daysLeft: number;
  state: SlaState;
}

/**
 * State of one clock: started on `startISO`, `targetDays` working days to run,
 * measured at `todayISO` — or at `completedISO` when the work is done, which
 * freezes the clock (met / met-late).
 */
export function slaStatus(
  startISO: string,
  targetDays: number,
  todayISO: string,
  completedISO?: string,
): SlaStatus {
  const dueDate = addWorkingDays(startISO, targetDays);
  if (completedISO) {
    const daysLeft = workingDaysLeft(completedISO, dueDate);
    return { dueDate, daysLeft, state: daysLeft >= 0 ? "met" : "met-late" };
  }
  const daysLeft = workingDaysLeft(todayISO, dueDate);
  const state: SlaState =
    daysLeft < 0
      ? "overdue"
      : daysLeft <= DUE_SOON_THRESHOLD
        ? "due-soon"
        : "on-track";
  return { dueDate, daysLeft, state };
}

/** Chip colour + short label for an SLA state (matches the app's chip set). */
export const SLA_STATE_META: Record<
  SlaState,
  { chip: "green" | "amber" | "red" | "slate"; label: string }
> = {
  "on-track": { chip: "slate", label: "On track" },
  "due-soon": { chip: "amber", label: "Due soon" },
  overdue: { chip: "red", label: "Overdue" },
  met: { chip: "green", label: "Met" },
  "met-late": { chip: "amber", label: "Done late" },
};

/** Human phrasing for a clock's remaining/overdue working days. */
export function slaPhrase(s: SlaStatus): string {
  if (s.state === "met") return `met — due ${s.dueDate}`;
  if (s.state === "met-late")
    return `${-s.daysLeft} working day${s.daysLeft === -1 ? "" : "s"} late`;
  if (s.state === "overdue")
    return `${-s.daysLeft} working day${s.daysLeft === -1 ? "" : "s"} overdue`;
  if (s.daysLeft === 0) return "due today";
  return `${s.daysLeft} working day${s.daysLeft === 1 ? "" : "s"} left`;
}

// ---------------------------------------------------------------------------
// Pre-authorisation inspection clock (26 working days)
// ---------------------------------------------------------------------------

/**
 * SLA state of an inspection request. The clock starts when Licensing raises
 * the request (the SOP's "recommendation for a pre-authorisation inspection")
 * and runs 26 working days; an officer-set "needed by" date that is EARLIER
 * only tightens it. Completing the inspection freezes the clock. Cancelled
 * requests have no clock.
 */
export function inspectionRequestSla(
  r: InspectionRequest,
  todayISO: string,
): SlaStatus | null {
  if (r.status === "Cancelled") return null;
  const started = (r.requestedAt || "").slice(0, 10);
  if (!started) return null;
  const completed =
    r.status === "Report Ready" || r.status === "Closed"
      ? r.completedDate || (r.completedAt || "").slice(0, 10) || undefined
      : undefined;
  const status = slaStatus(
    started,
    PRE_AUTH_INSPECTION_TARGET,
    todayISO,
    completed,
  );
  if (r.neededBy && r.neededBy < status.dueDate) {
    // The officer asked for it sooner than the SOP requires — track the
    // tighter date.
    const measuredAt = completed || todayISO;
    const daysLeft = workingDaysLeft(measuredAt, r.neededBy);
    const state: SlaState = completed
      ? daysLeft >= 0
        ? "met"
        : "met-late"
      : daysLeft < 0
        ? "overdue"
        : daysLeft <= DUE_SOON_THRESHOLD
          ? "due-soon"
          : "on-track";
    return { dueDate: r.neededBy, daysLeft, state };
  }
  return status;
}

/** Open requests currently past their 26-working-day due date. */
export function overdueInspectionRequests(
  requests: InspectionRequest[],
  todayISO: string,
): InspectionRequest[] {
  return requests.filter((r) => {
    const s = inspectionRequestSla(r, todayISO);
    return s?.state === "overdue";
  });
}

// ---------------------------------------------------------------------------
// The verification gate — inspection outcome routes the application
// ---------------------------------------------------------------------------

export type GateRoute = "techcom" | "further-particulars";

export interface GateDecision {
  satisfactory: boolean;
  route: GateRoute;
  /** One-line guidance shown to the Licensing officer. */
  guidance: string;
}

/**
 * The SOP's Inspectorate gate: a satisfactory pre-authorisation inspection
 * sends the application (with the report bundled) to TECHCOM; an
 * unsatisfactory one routes it back for further particulars (Form II) or
 * possible rejection. "N/A" outcomes make no routing decision.
 */
export function inspectionGate(
  outcome: InspectionOutcome | undefined,
): GateDecision | null {
  if (!outcome || outcome === "N/A") return null;
  if (outcome === "Compliant" || outcome === "Minor findings") {
    return {
      satisfactory: true,
      route: "techcom",
      guidance:
        "Satisfactory inspection — bundle the report with the application and submit to TECHCOM.",
    };
  }
  return {
    satisfactory: false,
    route: "further-particulars",
    guidance:
      "Unsatisfactory inspection — request further particulars (Form II) or recommend rejection.",
  };
}

// ---------------------------------------------------------------------------
// 44-working-day application ageing
// ---------------------------------------------------------------------------

/** A RAIS date (DD/MM/YYYY or D-MMM-YYYY) as ISO, or null. */
export function raisDateToISO(s: string | undefined): string | null {
  const t = parseRaisDate(s || "");
  if (Number.isNaN(t)) return null;
  return toISO(new Date(t));
}

/**
 * When this application's 44-day clock started. Best evidence first: the
 * recorded complete-application date (the Form I checklist), the date the
 * record first entered the system, the connector receipt, then the parsed
 * notification date.
 */
export function workflowStartDate(w: LicenceWorkflow): string | null {
  if (w.completeReceivedAt) return w.completeReceivedAt.slice(0, 10);
  if (w.firstSeen) return w.firstSeen.slice(0, 10);
  if (w.receivedAt) return w.receivedAt.slice(0, 10);
  return raisDateToISO(w.lastSeen);
}

/** Is this application still running its 44-day clock? */
export function isActiveApplication(w: LicenceWorkflow): boolean {
  if (w.reviewStatus === "needs-review") return false; // not yet accepted
  if (w.facilityStage === "Licence / Certificate Issued") return false;
  if (w.phase === "Licence Issued") return false;
  return true;
}

export type AgeingState = "on-track" | "at-risk" | "overdue";

export interface ApplicationAge {
  workflow: LicenceWorkflow;
  startDate: string;
  /** Working days the application has been running. */
  ageDays: number;
  /** The 44-working-day due date. */
  dueDate: string;
  state: AgeingState;
  /** The ball is in the applicant's court (payment, further particulars…). */
  waitingOnApplicant: boolean;
}

export interface ApplicationAgeingSummary {
  /** Ageing per active application, oldest first. */
  rows: ApplicationAge[];
  onTrack: number;
  atRisk: number;
  overdue: number;
  /** Active applications with no usable start date (excluded from rows). */
  undated: number;
}

/**
 * Age ONE application against its SOP target (44 working days, or 15 for a
 * renewal). Null when the application is not active or carries no usable
 * start date.
 */
export function applicationAge(
  w: LicenceWorkflow,
  todayISO: string,
): ApplicationAge | null {
  if (!isActiveApplication(w)) return null;
  const startDate = workflowStartDate(w);
  if (!startDate) return null;
  const target = isRenewalRan(w.ran) ? RENEWAL_TARGET : NEW_LICENCE_TARGET;
  const atRiskAfter = isRenewalRan(w.ran)
    ? Math.max(1, RENEWAL_TARGET - DUE_SOON_THRESHOLD)
    : APPLICATION_AT_RISK_AFTER;
  const ageDays = workingDaysBetween(startDate, todayISO);
  const dueDate = addWorkingDays(startDate, target);
  const state: AgeingState =
    ageDays > target ? "overdue" : ageDays >= atRiskAfter ? "at-risk" : "on-track";
  return {
    workflow: w,
    startDate,
    ageDays,
    dueDate,
    state,
    waitingOnApplicant: /applicant|licensee/i.test(w.responsibleParty || ""),
  };
}

/**
 * Age every active application against the SOP's 44-working-day target.
 * Renewal applications use the 15-working-day renewal target instead.
 */
export function applicationAgeing(
  workflows: LicenceWorkflow[],
  todayISO: string,
): ApplicationAgeingSummary {
  const rows: ApplicationAge[] = [];
  let undated = 0;

  for (const w of workflows) {
    if (!isActiveApplication(w)) continue;
    const row = applicationAge(w, todayISO);
    if (!row) {
      undated++;
      continue;
    }
    rows.push(row);
  }

  rows.sort((a, b) => b.ageDays - a.ageDays);
  return {
    rows,
    onTrack: rows.filter((r) => r.state === "on-track").length,
    atRisk: rows.filter((r) => r.state === "at-risk").length,
    overdue: rows.filter((r) => r.state === "overdue").length,
    undated,
  };
}

/** Renewal applications (AUTH/USE.REN/…) run the 15-day renewal clock. */
export function isRenewalRan(ran: string | undefined): boolean {
  return /USE\.REN/i.test(ran || "");
}

export const AGEING_STATE_META: Record<
  AgeingState,
  { chip: "green" | "amber" | "red" | "slate"; label: string }
> = {
  "on-track": { chip: "slate", label: "On track" },
  "at-risk": { chip: "amber", label: "At risk" },
  overdue: { chip: "red", label: "Over target" },
};
