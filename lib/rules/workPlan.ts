/**
 * The approved 2026 RPA Nuclear & Radiation Safety work plan — the frame every
 * sectional update is now reported in (Management instruction, Aug 2026:
 * "sectional updates in our Monday meeting shall be in this format as they
 * appear in the approved 2026 RPA work plan").
 *
 * One row per work plan OUTPUT, with the workbook's columns:
 *
 *   Output ID · Output Description · Key Indicator · 2026 Target ·
 *   Q1 · Q2 · Q3 · Q4 · Total Actual · % Achieved · Status ·
 *   Comments · Action Points
 *
 * plus a leading **This week** figure, because the report is still produced for
 * a Monday meeting: the week column is what the section did, the quarter
 * columns are what that adds up to.
 *
 * Where the app already owns the number, the row fills itself in — licences
 * issued (1.1.4), inspections conducted (1.2.4), enforcement actions (1.2.11)
 * and vehicles screened (1.3.12) come straight off the dated registers and the
 * border/daily logs, so nobody retypes them. Everything else is a manual figure
 * an officer logs on Daily Updates or types on the weekly report, keyed the
 * same way as before so the daily → weekly rollup is unchanged.
 *
 * Quarters are assigned by the REPORTING WEEK a record belongs to, not by its
 * raw date, so an auto row and a manual row logged in the same week always land
 * in the same quarter and the columns reconcile with the weekly figures. (W14
 * runs 30 Mar → 3 Apr; it counts to Q1, the quarter it starts in.)
 */
import {
  INSPECTION_BREAKDOWN,
  LICENCE_BREAKDOWN,
  metricKey,
} from "./weeklyDerivation";
import {
  WORK_PLAN_STATUSES,
  type DailyEntry,
  type Inspection,
  type InspectionType,
  type LicenceEvent,
  type LicenceType,
  type Section,
  type WeekDef,
  type WorkPlanNote,
  type WorkPlanStatus,
} from "./types";

export { WORK_PLAN_STATUSES };
export type { WorkPlanStatus };

/** The plan year these outputs and targets belong to. */
export const WORK_PLAN_YEAR = 2026;

export const QUARTERS = [1, 2, 3, 4] as const;
export type Quarter = (typeof QUARTERS)[number];

const AS: Section = "Authorisation & Standards";
const INSP: Section = "Inspectorate";
const NSSS: Section = "Nuclear Safety, Security & Safeguards";
const NSI: Section = "National Source Inventory";

/** Inspection types that make up output 1.2.4 (everything but enforcement). */
export function isInspectionVisit(t: InspectionType): boolean {
  return t !== "Enforcement Action";
}

/**
 * How an output's actual figure is obtained.
 *
 * - `licences`    counted off the dated licence register
 * - `inspections` counted off the dated inspection register
 * - `manual`      typed on the weekly report or logged on Daily Updates.
 *   `alsoCount` lists metric keys the section used BEFORE the work plan became
 *   the reporting frame; their stored figures still count toward the output so
 *   no history is lost when the label changed.
 */
export type OutputSource =
  | { kind: "licences"; match?: (t: LicenceType) => boolean }
  | { kind: "inspections"; match: (t: InspectionType) => boolean }
  | { kind: "manual"; key: string; alsoCount?: readonly string[] };

/** Sub-counts shown when a row is expanded — the detail behind one figure. */
export type BreakdownSpec =
  | { kind: "licenceTypes" }
  | { kind: "inspectionTypes"; match: (t: InspectionType) => boolean }
  | { kind: "borders"; key: string };

export interface WorkPlanOutput {
  /** Work plan output id, e.g. "1.2.4". Stable — it keys the officer's notes. */
  id: string;
  description: string;
  indicator: string;
  /** The 2026 target, or null where the workbook shows "-". */
  target: number | null;
  /** The section that reports this output (and may log against it). */
  section: Section;
  source: OutputSource;
  /** Shorter wording for the Daily Updates tap targets. */
  logLabel?: string;
  breakdown?: BreakdownSpec;
  /**
   * A figure the section tracks that is NOT a work plan output. Reported under
   * the subprogramme as supporting detail, with no target, % or status.
   */
  supporting?: boolean;
  /** Shown under the description on the report. */
  note?: string;
}

export interface Subprogramme {
  id: string;
  title: string;
  /** The workbook's sheet heading, verbatim. */
  heading: string;
  /** The section that owns the subprogramme (individual outputs may differ). */
  section: Section;
  outputs: WorkPlanOutput[];
}

// ---------------------------------------------------------------------------
// Metric keys
// ---------------------------------------------------------------------------

/**
 * The metric key a manual work plan output is logged against. Namespaced by
 * output id so a row keeps its figures even if Management rewords the output.
 */
export function outputMetricKey(id: string): string {
  return `WP2026::${id}`;
}

/** Keys the section used before the work plan became the reporting frame. */
const LEGACY = {
  inspTwg: metricKey(INSP, "TWG Meetings attended"),
  nsssScreening: metricKey(NSSS, "Vehicle Screening (units)"),
  nsssIaea: metricKey(NSSS, "IAEA Meetings attended"),
  nsssStakeholder: metricKey(NSSS, "Stakeholder Engagements"),
  nsssTwg: metricKey(NSSS, "TWG Meetings"),
} as const;

const manual = (
  id: string,
  alsoCount?: readonly string[],
): OutputSource => ({ kind: "manual", key: outputMetricKey(id), alsoCount });

// ---------------------------------------------------------------------------
// Subprogramme 1.1 — Authorisation and Standards
// ---------------------------------------------------------------------------

const SUB_1_1: Subprogramme = {
  id: "1.1",
  title: "Authorisation and Standards",
  heading: "Subprogramme 1.1 — Authorisation and Standards",
  section: AS,
  outputs: [
    {
      id: "1.1.1",
      description: "Development/Revision of Safety Guides",
      indicator: "Number of guidelines developed",
      target: 12,
      section: AS,
      source: manual("1.1.1"),
      logLabel: "Safety guides developed/revised",
    },
    {
      id: "1.1.2",
      description: "Develop the Regulations",
      indicator: "Number of guidelines developed",
      target: 4,
      section: AS,
      source: manual("1.1.2"),
      logLabel: "Regulations developed",
    },
    {
      id: "1.1.3",
      description: "Revise the SOP for Licensing",
      indicator: "SOPs revised",
      target: 1,
      section: AS,
      source: manual("1.1.3"),
      logLabel: "Licensing SOPs revised",
    },
    {
      id: "1.1.4",
      description: "Issuance of Ionising Radiation Licences",
      indicator: "Number Licenses issued",
      target: 500,
      section: AS,
      source: { kind: "licences" },
      breakdown: { kind: "licenceTypes" },
      note: "Every licence recorded on the register — expand for the split by licence type.",
    },
    {
      id: "1.1.5",
      description: "Maintain and update RAIS and ARIS",
      indicator: "Databases updated",
      target: 2,
      section: AS,
      source: manual("1.1.5"),
      logLabel: "RAIS/ARIS databases updated",
    },
    {
      id: "1.1.6",
      description: "Virtual awareness meetings (e-licensing)",
      indicator: "Number of meetings conducted",
      target: 4,
      section: AS,
      source: manual("1.1.6"),
      logLabel: "Virtual awareness meetings",
    },
    {
      id: "1.1.7",
      description: "Licence renewal sensitisation advert",
      indicator: "Advert developed",
      target: 1,
      section: AS,
      source: manual("1.1.7"),
      logLabel: "Sensitisation adverts developed",
    },
    {
      id: "1.1.8",
      description: "Mobile App for e-licensing",
      indicator: "Mobile App developed",
      target: 1,
      section: AS,
      source: manual("1.1.8"),
      logLabel: "Mobile app milestones",
    },
    {
      id: "1.1.9",
      description: "Quarterly Sectional Brochures",
      indicator: "Number of brochures developed",
      target: 4,
      section: AS,
      source: manual("1.1.9"),
      logLabel: "Brochures developed",
    },
    {
      id: "1.1.10",
      description: "Quarterly Newsletters",
      indicator: "Number of newsletters developed",
      target: 4,
      section: AS,
      source: manual("1.1.10"),
      logLabel: "Newsletters developed",
    },
    // Figures the section already logs that the plan has no output for.
    {
      id: "1.1.S1",
      description: "Stakeholder engagements (section)",
      indicator: "Number of engagements",
      target: null,
      section: AS,
      source: { kind: "manual", key: metricKey(AS, "Stakeholder Engagements") },
      logLabel: "Stakeholder engagements",
      supporting: true,
    },
    {
      id: "1.1.S2",
      description: "TWG meetings attended (section)",
      indicator: "Number of meetings",
      target: null,
      section: AS,
      source: { kind: "manual", key: metricKey(AS, "TWG Meetings attended") },
      logLabel: "TWG meetings attended",
      supporting: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Subprogramme 1.2 — Nuclear & Radiation Safety Inspections
// ---------------------------------------------------------------------------

const SUB_1_2: Subprogramme = {
  id: "1.2",
  title: "Nuclear & Radiation Safety Inspections",
  heading: "Subprogramme 1.2 — Nuclear & Radiation Safety Inspections",
  section: INSP,
  outputs: [
    {
      id: "1.2.1",
      description: "Development of Inspection Programme 2026",
      indicator: "Number of inspection programmes",
      target: 1,
      section: INSP,
      source: manual("1.2.1"),
      logLabel: "Inspection programmes developed",
    },
    {
      id: "1.2.2",
      description: "Review of SOPs for Inspectorate",
      indicator: "Number of SOPs",
      target: 1,
      section: INSP,
      source: manual("1.2.2"),
      logLabel: "Inspectorate SOPs reviewed",
    },
    {
      id: "1.2.3",
      description:
        "Training for Inspectors (Radiotherapy/Diagnostic/Nuclear Medicine)",
      indicator: "Number of trainings",
      target: 4,
      section: INSP,
      source: manual("1.2.3"),
      logLabel: "Inspector trainings",
    },
    {
      id: "1.2.4",
      description:
        "Routine, follow-up, pre-authorization & investigative inspections",
      indicator: "Number of inspections",
      target: 500,
      section: INSP,
      source: { kind: "inspections", match: isInspectionVisit },
      breakdown: { kind: "inspectionTypes", match: isInspectionVisit },
      note: "Every inspection logged on the register — expand for the routine / follow-up / pre-authorisation / investigation split.",
    },
    {
      id: "1.2.5",
      description: "Enhance smart reporting system for inspection",
      indicator: "Enhanced reporting system",
      target: 1,
      section: INSP,
      source: manual("1.2.5"),
      logLabel: "Reporting-system enhancements",
    },
    {
      id: "1.2.6",
      description: "Conduct TWG Meetings",
      indicator: "Number of meetings",
      target: 36,
      section: INSP,
      source: manual("1.2.6", [LEGACY.inspTwg]),
      logLabel: "TWG meetings held",
    },
    {
      id: "1.2.7",
      description: "Periodic Data Maintenance and Update on RAIS",
      indicator: "Updated Data",
      target: 4,
      section: INSP,
      source: manual("1.2.7"),
      logLabel: "RAIS data updates",
    },
    {
      id: "1.2.8",
      description: "Develop Enforcement Policy",
      indicator: "Number of Enforcement Policy",
      target: 1,
      section: INSP,
      source: manual("1.2.8"),
      logLabel: "Enforcement policy milestones",
    },
    {
      id: "1.2.9",
      description: "National Radiation Source Inventory Exercise",
      indicator: "Number of exercise",
      target: 1,
      section: NSI,
      source: manual("1.2.9"),
      logLabel: "Source inventory exercises",
      note: "The National Source Inventory team's field figures are reported as supporting figures below.",
    },
    {
      id: "1.2.10",
      description: "Review of Inspection Manual",
      indicator: "Number of Inspection Manual reviewed",
      target: 1,
      section: INSP,
      source: manual("1.2.10"),
      logLabel: "Inspection manual reviews",
    },
    {
      id: "1.2.11",
      description: "Conduct Enforcement Actions",
      indicator: "# of Enforcement actions",
      target: 50,
      section: INSP,
      source: {
        kind: "inspections",
        match: (t) => t === "Enforcement Action",
      },
      note: "Logged on the inspection register as an Enforcement Action.",
    },
    {
      id: "1.2.S1",
      description: "Stakeholder engagements (section)",
      indicator: "Number of engagements",
      target: null,
      section: INSP,
      source: { kind: "manual", key: metricKey(INSP, "Stakeholder Engagements") },
      logLabel: "Stakeholder engagements",
      supporting: true,
    },
    // The National Source Inventory team's field figures behind output 1.2.9.
    ...(
      [
        ["Facilities visited", "Number of facilities"],
        ["Sources inventoried", "Number of sources"],
        ["Sources verified", "Number of sources"],
        ["Discrepancies identified", "Number of discrepancies"],
        ["Team meetings held", "Number of meetings"],
      ] as const
    ).map(([label, indicator], i) => ({
      id: `1.2.S${i + 2}`,
      description: `${label} (National Source Inventory)`,
      indicator,
      target: null,
      section: NSI,
      source: { kind: "manual" as const, key: metricKey(NSI, label) },
      logLabel: label,
      supporting: true,
    })),
  ],
};

// ---------------------------------------------------------------------------
// Subprogramme 1.3 — Nuclear Safety, Security and Safeguards
// ---------------------------------------------------------------------------

const SUB_1_3: Subprogramme = {
  id: "1.3",
  title: "Nuclear Safety, Security and Safeguards / Stakeholder Engagement",
  heading:
    "Subprogramme 1.3 — Nuclear Safety, Security and Safeguards / Stakeholder Engagement",
  section: NSSS,
  outputs: [
    {
      id: "1.3.1",
      description: "Annual Conference for RPOs (Medical)",
      indicator: "Number of conferences",
      target: 1,
      section: NSSS,
      source: manual("1.3.1"),
      logLabel: "RPO conference (Medical)",
    },
    {
      id: "1.3.2",
      description: "Annual Conference for RPOs (Non-Medical)",
      indicator: "Number of Conferences",
      target: 1,
      section: NSSS,
      source: manual("1.3.2"),
      logLabel: "RPO conference (Non-Medical)",
    },
    {
      id: "1.3.3",
      description: "Open two inland offices (Mongu & Ndola)",
      indicator: "Number of Offices opened",
      target: 2,
      section: NSSS,
      source: manual("1.3.3"),
      logLabel: "Inland offices opened",
    },
    {
      id: "1.3.4",
      description: "INSSERV Mission Action Plan",
      indicator: "Number of meetings",
      target: 1,
      section: NSSS,
      source: manual("1.3.4"),
      logLabel: "INSSERV action plan meetings",
    },
    {
      id: "1.3.5",
      description: "Physical protection inspection",
      indicator: "Number of Facilities inspected",
      target: 10,
      section: NSSS,
      source: manual("1.3.5"),
      logLabel: "Physical protection inspections",
    },
    {
      id: "1.3.6",
      description: "SOP for Nuclear Safety, Security & Safeguard",
      indicator: "Number of SOPs developed",
      target: 8,
      section: NSSS,
      source: manual("1.3.6"),
      logLabel: "NSSS SOPs developed",
    },
    {
      id: "1.3.7",
      description: "Implement INSSP under Nuclear Security",
      indicator: "INSSP programme implemented",
      target: 100,
      section: NSSS,
      source: manual("1.3.7"),
      logLabel: "INSSP implementation (%)",
      note: "Reported as percentage points of the programme implemented.",
    },
    {
      id: "1.3.8",
      description: "Regional Workshop (IAEA/EU/USNRC/CBRN/RASIM)",
      indicator: "# of meetings",
      target: 2,
      section: NSSS,
      source: manual("1.3.8", [LEGACY.nsssIaea]),
      logLabel: "Regional workshops / IAEA meetings",
    },
    {
      id: "1.3.9",
      description: "Stakeholder Engagement and Sensitisation",
      indicator: "# of stakeholders'",
      target: 40,
      section: NSSS,
      source: manual("1.3.9", [LEGACY.nsssStakeholder]),
      logLabel: "Stakeholders engaged",
    },
    {
      id: "1.3.10",
      description: "Training for ZRA Inspectors/Responders/FLO",
      indicator: "# of trainings conducted",
      target: 4,
      section: NSSS,
      source: manual("1.3.10"),
      logLabel: "ZRA / responder trainings",
    },
    {
      id: "1.3.11",
      description: "Monitoring & Evaluation of Inland Offices",
      indicator: "Number of Monitoring and Evaluation",
      target: null,
      section: NSSS,
      source: manual("1.3.11"),
      logLabel: "Inland office M&E visits",
    },
    {
      id: "1.3.12",
      description: "Monitoring of illicit trafficking (ZRA Asycuda)",
      indicator: "Number of screened vehicles",
      target: 350000,
      section: NSSS,
      // Keyed to the screening metric the border posts already write to, so the
      // scan log and the coordinators' daily figures feed this row untouched.
      source: { kind: "manual", key: LEGACY.nsssScreening },
      logLabel: "Vehicles screened",
      breakdown: { kind: "borders", key: LEGACY.nsssScreening },
      note: "Fed by the border scan log and the coordinators' daily counts — expand for the split by border post.",
    },
    {
      id: "1.3.13",
      description: "Quarterly Meetings for Coordinators and TWG",
      indicator: "# of meetings'",
      target: 5,
      section: NSSS,
      source: manual("1.3.13", [LEGACY.nsssTwg]),
      logLabel: "Coordinator / TWG meetings",
    },
    {
      id: "1.3.14",
      description: "Enhance detection capacity system",
      indicator: "# number of detection system",
      target: 1,
      section: NSSS,
      source: manual("1.3.14"),
      logLabel: "Detection systems enhanced",
    },
  ],
};

export const WORK_PLAN: Subprogramme[] = [SUB_1_1, SUB_1_2, SUB_1_3];

/** Every output across the plan, in workbook order. */
export const WORK_PLAN_OUTPUTS: WorkPlanOutput[] = WORK_PLAN.flatMap(
  (s) => s.outputs,
);

export function findOutput(id: string): WorkPlanOutput | null {
  return WORK_PLAN_OUTPUTS.find((o) => o.id === id) || null;
}

/**
 * The outputs a section may log a figure against — its manual plan outputs and
 * supporting figures, in plan order. This is what the Daily Updates tab offers.
 */
export function manualOutputsForSection(section: Section): WorkPlanOutput[] {
  return WORK_PLAN_OUTPUTS.filter(
    (o) => o.section === section && o.source.kind === "manual",
  );
}

/**
 * Every metric key whose stored figures count toward an output — the key new
 * entries are written to first, then any the section used before the work plan
 * became the reporting frame. Empty for outputs counted off a register.
 */
export function metricKeysForOutput(output: WorkPlanOutput): string[] {
  return manualKeys(output.source);
}

// ---------------------------------------------------------------------------
// Quarters
// ---------------------------------------------------------------------------

/** The calendar quarter an ISO date falls in, or null if it is unparseable. */
export function quarterOfISO(iso: string): Quarter | null {
  const month = Number((iso || "").slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return ((Math.floor((month - 1) / 3) + 1) as Quarter);
}

/**
 * Reporting week → quarter, for weeks belonging to the plan year. A week counts
 * to the quarter it STARTS in, so a week that straddles a quarter boundary is
 * never split or double counted.
 */
export function buildQuarterIndex(
  weeks: WeekDef[],
  year = WORK_PLAN_YEAR,
): Map<string, Quarter> {
  const index = new Map<string, Quarter>();
  for (const w of weeks) {
    if (Number(w.start.slice(0, 4)) !== year) continue;
    const q = quarterOfISO(w.start);
    if (q) index.set(w.label, q);
  }
  return index;
}

/** The quarter that contains `date`, or null when it is outside the plan year. */
export function quarterOfDate(date: string, year = WORK_PLAN_YEAR): Quarter | null {
  if (Number((date || "").slice(0, 4)) !== year) return null;
  return quarterOfISO(date);
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export interface WorkPlanBreakdownRow {
  label: string;
  week: number;
  total: number;
}

export interface WorkPlanRow {
  output: WorkPlanOutput;
  /** The selected reporting week's contribution. */
  week: number;
  /** Cumulative actuals, index 0 = Q1. */
  quarters: number[];
  /** Total Actual — the sum of the four quarters. */
  total: number;
  /** Total ÷ target × 100, or null where the output has no numeric target. */
  percent: number | null;
  /** The status shown: the officer's override if set, otherwise derived. */
  status: WorkPlanStatus;
  derivedStatus: WorkPlanStatus;
  statusOverridden: boolean;
  comments: string;
  actionPoints: string;
  /** True when the figure comes off a register and cannot be typed. */
  auto: boolean;
  /** The metric key this week's figure is written to (manual rows only). */
  metricKey: string | null;
  /** True when the week's figure is summed from Daily Updates (read-only). */
  fromDaily: boolean;
  breakdown: WorkPlanBreakdownRow[];
}

export interface SubprogrammeReport {
  id: string;
  title: string;
  heading: string;
  section: Section;
  /** Plan outputs, in workbook order. */
  rows: WorkPlanRow[];
  /** Figures the section tracks that the plan has no output for. */
  supporting: WorkPlanRow[];
}

export interface WorkPlanInput {
  /** The reporting calendar — supplies each week's quarter. */
  weeks: WeekDef[];
  /** The week whose column the "this week" figures come from. */
  week: string;
  events: LicenceEvent[];
  inspections: Inspection[];
  /**
   * Effective manual values per reporting week — stored weekly figures with the
   * week's daily sums overlaid (see `effectiveValuesByWeek`).
   */
  valuesByWeek: Map<string, Record<string, number>>;
  /** Daily entries, for the per-border breakdown on 1.3.12. */
  dailyEntries?: DailyEntry[];
  /** Metric keys whose selected-week figure is summed from Daily Updates. */
  fromDaily?: Set<string>;
  /** The officers' status / comments / action points, keyed by output id. */
  notes?: Record<string, WorkPlanNote>;
  year?: number;
}

function emptyQuarters(): number[] {
  return [0, 0, 0, 0];
}

/** Status when nobody has overridden it: read off the figures. */
export function deriveStatus(
  total: number,
  target: number | null,
): WorkPlanStatus {
  if (target !== null && target > 0 && total >= target) return "Achieved";
  if (total > 0) return "In Progress";
  return "Not Started";
}

export function percentAchieved(
  total: number,
  target: number | null,
): number | null {
  if (target === null || target <= 0) return null;
  return (total / target) * 100;
}

/** One decimal, but whole numbers stay whole — "27.2%", "100%". */
export function formatPercent(percent: number | null): string {
  if (percent === null) return "—";
  const rounded = Math.round(percent * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

interface Tally {
  week: number;
  quarters: number[];
  total: number;
}

function tallyRecords<T extends { week: string; date: string }>(
  records: T[],
  quarterByWeek: Map<string, Quarter>,
  weekLabel: string,
  year: number,
): Tally {
  const quarters = emptyQuarters();
  let week = 0;
  for (const r of records) {
    if (r.week === weekLabel) week += 1;
    // Prefer the reporting week's quarter; fall back to the record's own date
    // for anything filed against a week outside the plan calendar.
    const q = quarterByWeek.get(r.week) ?? quarterOfDate(r.date, year);
    if (q) quarters[q - 1] += 1;
  }
  return { week, quarters, total: quarters.reduce((a, b) => a + b, 0) };
}

function tallyManual(
  keys: readonly string[],
  valuesByWeek: Map<string, Record<string, number>>,
  quarterByWeek: Map<string, Quarter>,
  weekLabel: string,
): Tally {
  const quarters = emptyQuarters();
  let week = 0;
  for (const [label, values] of valuesByWeek) {
    let sum = 0;
    for (const key of keys) sum += values[key] || 0;
    if (!sum) continue;
    if (label === weekLabel) week += sum;
    const q = quarterByWeek.get(label);
    if (q) quarters[q - 1] += sum;
  }
  return { week, quarters, total: quarters.reduce((a, b) => a + b, 0) };
}

function manualKeys(source: OutputSource): string[] {
  if (source.kind !== "manual") return [];
  return [source.key, ...(source.alsoCount || [])];
}

function buildBreakdown(
  output: WorkPlanOutput,
  input: WorkPlanInput,
  quarterByWeek: Map<string, Quarter>,
  year: number,
): WorkPlanBreakdownRow[] {
  const spec = output.breakdown;
  if (!spec) return [];

  /** Counts a slice of dated records: this week, and the whole plan year. */
  const count = <T extends { week: string; date: string }>(
    label: string,
    records: T[],
  ): WorkPlanBreakdownRow => {
    const t = tallyRecords(records, quarterByWeek, input.week, year);
    return { label, week: t.week, total: t.total };
  };

  if (spec.kind === "licenceTypes") {
    return LICENCE_BREAKDOWN.map((b) =>
      count(b.label, input.events.filter((e) => b.match(e.type))),
    ).filter((r) => r.total > 0 || r.week > 0);
  }

  if (spec.kind === "inspectionTypes") {
    return INSPECTION_BREAKDOWN.filter((b) => spec.match(b.type)).map((b) =>
      count(b.label, input.inspections.filter((i) => i.type === b.type)),
    );
  }

  {
    const byBorder = new Map<string, WorkPlanBreakdownRow>();
    for (const e of input.dailyEntries || []) {
      if (e.kind !== "count" || e.metricKey !== spec.key) continue;
      const value =
        typeof e.value === "number" && Number.isFinite(e.value) ? e.value : 0;
      if (!value) continue;
      const label = e.border || "Head office / other";
      const row = byBorder.get(label) || { label, week: 0, total: 0 };
      if (e.week === input.week) row.week += value;
      if (quarterByWeek.get(e.week) ?? quarterOfDate(e.date, year)) {
        row.total += value;
      }
      byBorder.set(label, row);
    }
    return [...byBorder.values()].sort(
      (a, b) => b.total - a.total || a.label.localeCompare(b.label),
    );
  }
}

function deriveRow(
  output: WorkPlanOutput,
  input: WorkPlanInput,
  quarterByWeek: Map<string, Quarter>,
  year: number,
): WorkPlanRow {
  const { source } = output;
  let tally: Tally;
  if (source.kind === "licences") {
    const match = source.match;
    tally = tallyRecords(
      match ? input.events.filter((e) => match(e.type)) : input.events,
      quarterByWeek,
      input.week,
      year,
    );
  } else if (source.kind === "inspections") {
    tally = tallyRecords(
      input.inspections.filter((i) => source.match(i.type)),
      quarterByWeek,
      input.week,
      year,
    );
  } else {
    tally = tallyManual(
      manualKeys(source),
      input.valuesByWeek,
      quarterByWeek,
      input.week,
    );
  }

  const note = (input.notes || {})[output.id];
  const derivedStatus = deriveStatus(tally.total, output.target);
  const key = source.kind === "manual" ? source.key : null;

  return {
    output,
    week: tally.week,
    quarters: tally.quarters,
    total: tally.total,
    percent: percentAchieved(tally.total, output.target),
    status: note?.status || derivedStatus,
    derivedStatus,
    statusOverridden: !!note?.status,
    comments: note?.comments || "",
    actionPoints: note?.actionPoints || "",
    auto: source.kind !== "manual",
    metricKey: key,
    fromDaily: !!key && !!input.fromDaily?.has(key),
    breakdown: buildBreakdown(output, input, quarterByWeek, year),
  };
}

/**
 * The whole work plan, filled in from the registers and the logged figures —
 * the weekly report's data model.
 */
export function deriveWorkPlan(input: WorkPlanInput): SubprogrammeReport[] {
  const year = input.year ?? WORK_PLAN_YEAR;
  const quarterByWeek = buildQuarterIndex(input.weeks, year);
  return WORK_PLAN.map((sub) => {
    const derived = sub.outputs.map((o) =>
      deriveRow(o, input, quarterByWeek, year),
    );
    return {
      id: sub.id,
      title: sub.title,
      heading: sub.heading,
      section: sub.section,
      rows: derived.filter((r) => !r.output.supporting),
      supporting: derived.filter((r) => r.output.supporting),
    };
  });
}

// ---------------------------------------------------------------------------
// Exports for the Monday meeting
// ---------------------------------------------------------------------------

export const WORK_PLAN_CSV_HEADER = [
  "Subprogramme",
  "Output ID",
  "Output Description",
  "Key Indicator",
  `${WORK_PLAN_YEAR} Target`,
  "This Week",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "Total Actual",
  "% Achieved",
  "Status",
  "Comments",
  "Action Points",
];

function csvRow(sub: SubprogrammeReport, row: WorkPlanRow): string[] {
  return [
    sub.heading,
    row.output.id,
    row.output.description,
    row.output.indicator,
    row.output.target === null ? "-" : String(row.output.target),
    String(row.week),
    ...row.quarters.map(String),
    String(row.total),
    row.percent === null ? "" : String(Math.round(row.percent * 10) / 10),
    row.output.supporting ? "" : row.status,
    row.comments,
    row.actionPoints,
  ];
}

/** The report as the workbook's own columns — paste straight into the sheet. */
export function workPlanRows(reports: SubprogrammeReport[]): string[][] {
  return reports.flatMap((sub) =>
    [...sub.rows, ...sub.supporting].map((row) => csvRow(sub, row)),
  );
}

/** A plain-text sectional brief, subprogramme by subprogramme. */
export function workPlanBrief(
  reports: SubprogrammeReport[],
  weekLabel: string,
): string {
  const lines: string[] = [];
  lines.push(`RPA Sectional Update — ${weekLabel}`);
  lines.push(`Against the approved ${WORK_PLAN_YEAR} RPA work plan`);
  lines.push("");
  for (const sub of reports) {
    lines.push(sub.heading);
    for (const row of sub.rows) {
      const target = row.output.target === null ? "-" : row.output.target;
      lines.push(
        `  ${row.output.id}  ${row.output.description}` +
          ` — this week ${row.week}; Q1 ${row.quarters[0]} Q2 ${row.quarters[1]}` +
          ` Q3 ${row.quarters[2]} Q4 ${row.quarters[3]};` +
          ` total ${row.total}/${target} (${formatPercent(row.percent)}) — ${row.status}`,
      );
      if (row.comments) lines.push(`      Comments: ${row.comments}`);
      if (row.actionPoints) lines.push(`      Action: ${row.actionPoints}`);
    }
    if (sub.supporting.length) {
      lines.push("  Supporting figures");
      for (const row of sub.supporting) {
        lines.push(
          `    ${row.output.description} — this week ${row.week}; total ${row.total}`,
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}
