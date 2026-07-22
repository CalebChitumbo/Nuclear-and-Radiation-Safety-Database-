/**
 * Pure logic for the Inspectorate tab — the section's own dashboard.
 *
 * The dashboard answers "what has been inspected, and how" over a chosen
 * period (the selected reporting week, this month, this year, or all time):
 * counts per inspection type (pre-authorisation / routine / investigation /
 * follow-up / enforcement), outcomes, distinct facilities reached, and the
 * enforcement actions taken. It also derives the forward-looking inspection
 * schedule from the cross-section requests raised by Licensing.
 */
import { isActiveRequest } from "./inspectionRequests";
import {
  INSPECTION_OUTCOMES,
  INSPECTION_TYPES,
  type Inspection,
  type InspectionOutcome,
  type InspectionPriority,
  type InspectionRequest,
  type InspectionType,
  type WeekDef,
} from "./types";

export const INSPECTION_PERIODS = ["week", "month", "year", "all"] as const;
export type InspectionPeriod = (typeof INSPECTION_PERIODS)[number];

export interface PeriodContext {
  /** The selected reporting week (drives the "week" period). */
  week: WeekDef | null;
  /** Local today as YYYY-MM-DD (drives "month" and "year"). */
  today: string;
}

export function periodLabel(period: InspectionPeriod, ctx: PeriodContext): string {
  switch (period) {
    case "week":
      return ctx.week ? ctx.week.label : "This week";
    case "month":
      return `Month ${ctx.today.slice(0, 7)}`;
    case "year":
      return `Year ${ctx.today.slice(0, 4)}`;
    default:
      return "All time";
  }
}

export function inspectionInPeriod(
  i: Inspection,
  period: InspectionPeriod,
  ctx: PeriodContext,
): boolean {
  switch (period) {
    case "week":
      return !!ctx.week && i.week === ctx.week.label;
    case "month":
      return (i.date || "").slice(0, 7) === ctx.today.slice(0, 7);
    case "year":
      return (i.date || "").slice(0, 4) === ctx.today.slice(0, 4);
    default:
      return true;
  }
}

export interface InspectorateDashboard {
  /** Inspections conducted in the period. */
  total: number;
  /** Distinct facilities inspected in the period. */
  facilities: number;
  byType: Record<InspectionType, number>;
  byOutcome: Record<InspectionOutcome, number>;
  /** Enforcement actions in the period, newest first. */
  enforcement: Inspection[];
  /** Major findings + non-compliant outcomes — the follow-up workload. */
  needsFollowUp: number;
}

export function deriveInspectorateDashboard(
  inspections: Inspection[],
  period: InspectionPeriod,
  ctx: PeriodContext,
): InspectorateDashboard {
  const byType = {} as Record<InspectionType, number>;
  for (const t of INSPECTION_TYPES) byType[t] = 0;
  const byOutcome = {} as Record<InspectionOutcome, number>;
  for (const o of INSPECTION_OUTCOMES) byOutcome[o] = 0;

  const distinct = new Set<string>();
  const enforcement: Inspection[] = [];
  let total = 0;
  let needsFollowUp = 0;

  for (const i of inspections) {
    if (!inspectionInPeriod(i, period, ctx)) continue;
    total += 1;
    distinct.add(i.facilityId || i.facilityName);
    if (i.type in byType) byType[i.type] += 1;
    if (i.outcome in byOutcome) byOutcome[i.outcome] += 1;
    if (i.type === "Enforcement Action") enforcement.push(i);
    if (i.outcome === "Major findings" || i.outcome === "Non-compliant") {
      needsFollowUp += 1;
    }
  }

  enforcement.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return {
    total,
    facilities: distinct.size,
    byType,
    byOutcome,
    enforcement,
    needsFollowUp,
  };
}

const PRIORITY_RANK: Record<InspectionPriority, number> = {
  Urgent: 0,
  High: 1,
  Normal: 2,
  Low: 3,
};

/** The date a scheduled request is expected to happen on, if any. */
export function scheduledDate(r: InspectionRequest): string {
  return r.targetDate || r.neededBy || "";
}

/**
 * The Inspectorate's forward schedule, from the Licensing ↔ Inspectorate
 * requests: every request still in the pipeline (Requested / Acknowledged /
 * Assigned / In Progress), soonest expected date first — the inspector's
 * target date, else Licensing's needed-by date. Undated requests sink to the
 * bottom, ordered by priority then age, so urgent unscheduled work stays
 * visible right under the dated queue.
 */
export function deriveInspectionSchedule(
  requests: InspectionRequest[],
): InspectionRequest[] {
  return requests.filter(isActiveRequest).sort((a, b) => {
    const da = scheduledDate(a);
    const db = scheduledDate(b);
    if (da && db && da !== db) return da.localeCompare(db);
    if (da && !db) return -1;
    if (!da && db) return 1;
    const pa = PRIORITY_RANK[a.priority] ?? 2;
    const pb = PRIORITY_RANK[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return (a.requestedAt || "").localeCompare(b.requestedAt || "");
  });
}
