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
 *
 * WHAT SHIPS HERE IS THE APPROVED PLAN, NOT THE LAST WORD. Every row's wording,
 * target, section and — most of all — the register it counts itself off is a
 * `SourceBinding`, a plain value that a saved `WorkPlanConfig` can change (see
 * `applyWorkPlanConfig`). Sections edit their own rows from the report; the
 * plan below is what an untouched row, or a row that has been reset, reports as.
 */
import { ENFORCEMENT_COLUMNS } from "./inspectionDatabase";
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
  type SourceBinding,
  type WeekDef,
  type WorkPlanConfig,
  type WorkPlanNote,
  type WorkPlanOutputConfig,
  type WorkPlanStatus,
  type WorkPlanSubprogrammeConfig,
} from "./types";

export { WORK_PLAN_STATUSES };
export type { SourceBinding, WorkPlanConfig, WorkPlanStatus };

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
 * What output 1.2.11 counts: an inspection that led to an enforcement action.
 *
 * The Inspectorate's database records the action on the inspection it came out
 * of (its ENFORCEMENT ACTION TAKEN column), so an enforcement is not a separate
 * visit — that is why a routine inspection ending in a seizure counts here as
 * well as under 1.2.4. Records logged as an "Enforcement Action" type before
 * the column existed still count, so no history is lost.
 */
export function isEnforcement(i: Inspection): boolean {
  return !!i.enforcement || i.type === "Enforcement Action";
}

/**
 * How an output's actual figure is obtained — the runnable form of the row's
 * `SourceBinding`, built by `resolveSource`.
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
  | { kind: "inspections"; match: (i: Inspection) => boolean }
  | { kind: "manual"; key: string; alsoCount?: readonly string[] };

/** Sub-counts shown when a row is expanded — the detail behind one figure. */
export type BreakdownSpec =
  | { kind: "licenceTypes" }
  | { kind: "inspectionTypes"; match: (t: InspectionType) => boolean }
  /** The nine actions of the Inspectorate's enforcement vocabulary. */
  | { kind: "enforcementActions" }
  | { kind: "borders"; key: string };

export interface WorkPlanOutput {
  /**
   * Work plan output id — the workbook's own numbering for a plan output
   * ("1.2.4"), and for a supporting figure either the output whose detail it is
   * plus a sequence ("1.2.9.1") or the subprogramme plus one ("1.2.S1"). Stable:
   * it keys the officer's notes, the opening balance and, for a manual row, the
   * metric its figures are stored against.
   */
  id: string;
  description: string;
  indicator: string;
  /** The 2026 target, or null where the workbook shows "-". */
  target: number | null;
  /** The section that reports this output (and may log against it). */
  section: Section;
  /** Where the figure comes from, as stored — editable, see `SourceBinding`. */
  binding: SourceBinding;
  /** The same link, resolved into the predicates the derivation runs. */
  source: OutputSource;
  /** Shorter wording for the Daily Updates tap targets. */
  logLabel?: string;
  breakdown?: BreakdownSpec;
  /**
   * A figure the section tracks that is NOT a work plan output. Reported under
   * the subprogramme as supporting detail, with no target, % or status.
   */
  supporting?: boolean;
  /** For a supporting figure: the output whose detail it is, e.g. "1.2.9". */
  parentId?: string;
  /** Shown under the description on the report. */
  note?: string;
  /** Ids this row has been known by — stored figures under them still count. */
  previousIds?: readonly string[];
  /** Added by a section rather than shipped in the approved workbook. */
  added?: boolean;
  /** True when a saved config changed something about the row. */
  customised?: boolean;
}

export interface Subprogramme {
  id: string;
  title: string;
  /** The workbook's sheet heading, verbatim. */
  heading: string;
  /** The section that owns the subprogramme (individual outputs may differ). */
  section: Section;
  outputs: WorkPlanOutput[];
  /** Added by a section rather than shipped in the approved workbook. */
  added?: boolean;
  customised?: boolean;
}

// ---------------------------------------------------------------------------
// The link between a row and the rest of the database
// ---------------------------------------------------------------------------

/**
 * Turn a stored link into the predicates the derivation runs.
 *
 * An unbound `licences` link counts every recorded licence; an unbound
 * `inspections` link counts every inspection VISIT — a bare enforcement action
 * is a separate output (1.2.11), so counting it here as well would report the
 * same visit twice.
 */
export function resolveSource(binding: SourceBinding): OutputSource {
  switch (binding.kind) {
    case "licences": {
      const types = binding.types;
      return {
        kind: "licences",
        match: types?.length ? (t) => types.includes(t) : undefined,
      };
    }
    case "inspections": {
      const types = binding.types;
      return {
        kind: "inspections",
        match: types?.length
          ? (i) => types.includes(i.type)
          : (i) => isInspectionVisit(i.type),
      };
    }
    case "enforcement":
      return { kind: "inspections", match: isEnforcement };
    case "manual":
    default:
      return {
        kind: "manual",
        key: binding.key,
        alsoCount: binding.alsoCount,
      };
  }
}

/** The detail a linked row can show when it is expanded. */
export function breakdownForBinding(
  binding: SourceBinding,
): BreakdownSpec | undefined {
  switch (binding.kind) {
    case "licences":
      return { kind: "licenceTypes" };
    case "inspections": {
      const types = binding.types;
      return {
        kind: "inspectionTypes",
        match: types?.length
          ? (t) => types.includes(t)
          : (t) => isInspectionVisit(t),
      };
    }
    case "enforcement":
      return { kind: "enforcementActions" };
    case "manual":
      return binding.splitByBorder
        ? { kind: "borders", key: binding.key }
        : undefined;
  }
}

/** One line saying where a row's figure comes from, for the report and audit. */
export function describeBinding(binding: SourceBinding): string {
  switch (binding.kind) {
    case "licences":
      return binding.types?.length
        ? `Counted off the licensing register — ${binding.types.join(", ")}.`
        : "Counted off the licensing register as licences are recorded.";
    case "inspections":
      return binding.types?.length
        ? `Counted off the inspection register — ${binding.types.join(", ")}.`
        : "Counted off the inspection register as inspections are logged.";
    case "enforcement":
      return "Counted off the inspection register — inspections that led to an enforcement action.";
    case "manual":
      return binding.splitByBorder
        ? "Summed from the border scan log and the coordinators' daily counts."
        : "Typed on the weekly report, or summed from the section's Daily Updates.";
  }
}

/** Do two links point at the same thing? Used to spot a re-pointed row. */
export function sameBinding(a: SourceBinding, b: SourceBinding): boolean {
  if (a.kind !== b.kind) return false;
  const list = (v?: readonly string[]) => [...(v || [])].sort().join("|");
  if (a.kind === "manual" && b.kind === "manual") {
    return (
      a.key === b.key &&
      list(a.alsoCount) === list(b.alsoCount) &&
      !!a.splitByBorder === !!b.splitByBorder
    );
  }
  if (a.kind === "licences" && b.kind === "licences") {
    return list(a.types) === list(b.types);
  }
  if (a.kind === "inspections" && b.kind === "inspections") {
    return list(a.types) === list(b.types);
  }
  return true; // enforcement carries nothing else
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

const manual = (id: string, alsoCount?: string[]): SourceBinding => ({
  kind: "manual",
  key: outputMetricKey(id),
  ...(alsoCount ? { alsoCount } : {}),
});

/**
 * A row as it is WRITTEN DOWN — the link as a value. The predicates the
 * derivation runs (`source`, `breakdown`) are computed from it by `finalise`,
 * so a row defined here and a row an officer re-points behave identically.
 */
type OutputDef = Omit<
  WorkPlanOutput,
  "source" | "breakdown" | "customised" | "added"
>;

interface SubprogrammeDef extends Omit<Subprogramme, "outputs" | "customised" | "added"> {
  outputs: OutputDef[];
}

function finaliseOutput(def: OutputDef): WorkPlanOutput {
  return {
    ...def,
    source: resolveSource(def.binding),
    breakdown: breakdownForBinding(def.binding),
  };
}

function finaliseSub(def: SubprogrammeDef): Subprogramme {
  return {
    ...def,
    // In the numbering's own order, so the shipped plan and an edited one read
    // the same way — a supporting figure sits under the output it belongs to,
    // and 1.1.10 follows 1.1.9 rather than 1.1.1.
    outputs: def.outputs
      .map(finaliseOutput)
      .sort((a, b) => compareOutputIds(a.id, b.id)),
  };
}

// ---------------------------------------------------------------------------
// Subprogramme 1.1 — Authorisation and Standards
// ---------------------------------------------------------------------------

const SUB_1_1: SubprogrammeDef = {
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
      binding: manual("1.1.1"),
      logLabel: "Safety guides developed/revised",
    },
    {
      id: "1.1.2",
      description: "Develop the Regulations",
      indicator: "Number of guidelines developed",
      target: 4,
      section: AS,
      binding: manual("1.1.2"),
      logLabel: "Regulations developed",
    },
    {
      id: "1.1.3",
      description: "Revise the SOP for Licensing",
      indicator: "SOPs revised",
      target: 1,
      section: AS,
      binding: manual("1.1.3"),
      logLabel: "Licensing SOPs revised",
    },
    {
      id: "1.1.4",
      description: "Issuance of Ionising Radiation Licences",
      indicator: "Number Licenses issued",
      target: 500,
      section: AS,
      binding: { kind: "licences" },
      note: "Every licence recorded on the register — expand for the split by licence type.",
    },
    {
      id: "1.1.5",
      description: "Maintain and update RAIS and ARIS",
      indicator: "Databases updated",
      target: 2,
      section: AS,
      binding: manual("1.1.5"),
      logLabel: "RAIS/ARIS databases updated",
    },
    {
      id: "1.1.6",
      description: "Virtual awareness meetings (e-licensing)",
      indicator: "Number of meetings conducted",
      target: 4,
      section: AS,
      binding: manual("1.1.6"),
      logLabel: "Virtual awareness meetings",
    },
    {
      id: "1.1.7",
      description: "Licence renewal sensitisation advert",
      indicator: "Advert developed",
      target: 1,
      section: AS,
      binding: manual("1.1.7"),
      logLabel: "Sensitisation adverts developed",
    },
    {
      id: "1.1.8",
      description: "Mobile App for e-licensing",
      indicator: "Mobile App developed",
      target: 1,
      section: AS,
      binding: manual("1.1.8"),
      logLabel: "Mobile app milestones",
    },
    {
      id: "1.1.9",
      description: "Quarterly Sectional Brochures",
      indicator: "Number of brochures developed",
      target: 4,
      section: AS,
      binding: manual("1.1.9"),
      logLabel: "Brochures developed",
    },
    {
      id: "1.1.10",
      description: "Quarterly Newsletters",
      indicator: "Number of newsletters developed",
      target: 4,
      section: AS,
      binding: manual("1.1.10"),
      logLabel: "Newsletters developed",
    },
    // Figures the section already logs that the plan has no output for.
    {
      id: "1.1.S1",
      description: "Stakeholder engagements (section)",
      indicator: "Number of engagements",
      target: null,
      section: AS,
      binding: { kind: "manual", key: metricKey(AS, "Stakeholder Engagements") },
      logLabel: "Stakeholder engagements",
      supporting: true,
    },
    {
      id: "1.1.S2",
      description: "TWG meetings attended (section)",
      indicator: "Number of meetings",
      target: null,
      section: AS,
      binding: { kind: "manual", key: metricKey(AS, "TWG Meetings attended") },
      logLabel: "TWG meetings attended",
      supporting: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Subprogramme 1.2 — Nuclear & Radiation Safety Inspections
// ---------------------------------------------------------------------------

const SUB_1_2: SubprogrammeDef = {
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
      binding: manual("1.2.1"),
      logLabel: "Inspection programmes developed",
    },
    {
      id: "1.2.2",
      description: "Review of SOPs for Inspectorate",
      indicator: "Number of SOPs",
      target: 1,
      section: INSP,
      binding: manual("1.2.2"),
      logLabel: "Inspectorate SOPs reviewed",
    },
    {
      id: "1.2.3",
      description:
        "Training for Inspectors (Radiotherapy/Diagnostic/Nuclear Medicine)",
      indicator: "Number of trainings",
      target: 4,
      section: INSP,
      binding: manual("1.2.3"),
      logLabel: "Inspector trainings",
    },
    {
      id: "1.2.4",
      description:
        "Routine, follow-up, pre-authorization & investigative inspections",
      indicator: "Number of inspections",
      target: 500,
      section: INSP,
      binding: { kind: "inspections" },
      note: "Every inspection logged on the register — expand for the routine / follow-up / pre-authorisation / investigation split.",
    },
    {
      id: "1.2.5",
      description: "Enhance smart reporting system for inspection",
      indicator: "Enhanced reporting system",
      target: 1,
      section: INSP,
      binding: manual("1.2.5"),
      logLabel: "Reporting-system enhancements",
    },
    {
      id: "1.2.6",
      description: "Conduct TWG Meetings",
      indicator: "Number of meetings",
      target: 36,
      section: INSP,
      binding: manual("1.2.6", [LEGACY.inspTwg]),
      logLabel: "TWG meetings held",
    },
    {
      id: "1.2.7",
      description: "Periodic Data Maintenance and Update on RAIS",
      indicator: "Updated Data",
      target: 4,
      section: INSP,
      binding: manual("1.2.7"),
      logLabel: "RAIS data updates",
    },
    {
      id: "1.2.8",
      description: "Develop Enforcement Policy",
      indicator: "Number of Enforcement Policy",
      target: 1,
      section: INSP,
      binding: manual("1.2.8"),
      logLabel: "Enforcement policy milestones",
    },
    {
      id: "1.2.9",
      description: "National Radiation Source Inventory Exercise",
      indicator: "Number of exercise",
      target: 1,
      section: NSI,
      binding: manual("1.2.9"),
      logLabel: "Source inventory exercises",
      note: "The National Source Inventory team's field figures are reported as supporting figures below.",
    },
    {
      id: "1.2.10",
      description: "Review of Inspection Manual",
      indicator: "Number of Inspection Manual reviewed",
      target: 1,
      section: INSP,
      binding: manual("1.2.10"),
      logLabel: "Inspection manual reviews",
    },
    {
      id: "1.2.11",
      description: "Conduct Enforcement Actions",
      indicator: "# of Enforcement actions",
      target: 50,
      section: INSP,
      binding: { kind: "enforcement" },
      note: "The enforcement action recorded against an inspection — expand for the engagement / suspension / seizure split, the same columns the inspection database summarises.",
    },
    {
      id: "1.2.S1",
      description: "Stakeholder engagements (section)",
      indicator: "Number of engagements",
      target: null,
      section: INSP,
      binding: { kind: "manual", key: metricKey(INSP, "Stakeholder Engagements") },
      logLabel: "Stakeholder engagements",
      supporting: true,
    },
    // The National Source Inventory team's field figures behind output 1.2.9.
    //
    // Numbered UNDER the output they are the detail of — 1.2.9.1 … 1.2.9.5 —
    // so the report says what they belong to. They were 1.2.S2 … 1.2.S6 when
    // supporting figures were numbered as a flat run per subprogramme, which
    // read as siblings of the section's own 1.2.S1 and told nobody they were
    // the National Source Inventory exercise's field figures. The old ids are
    // kept as `previousIds` so anything already stored against them still
    // counts (their metric keys are the section's own and never moved).
    ...(
      [
        ["Facilities visited", "Number of facilities"],
        ["Sources inventoried", "Number of sources"],
        ["Sources verified", "Number of sources"],
        ["Discrepancies identified", "Number of discrepancies"],
        ["Team meetings held", "Number of meetings"],
      ] as const
    ).map(([label, indicator], i) => ({
      id: `1.2.9.${i + 1}`,
      previousIds: [`1.2.S${i + 2}`],
      description: `${label} (National Source Inventory)`,
      indicator,
      target: null,
      section: NSI,
      binding: { kind: "manual" as const, key: metricKey(NSI, label) },
      logLabel: label,
      supporting: true,
      parentId: "1.2.9",
    })),
  ],
};

// ---------------------------------------------------------------------------
// Subprogramme 1.3 — Nuclear Safety, Security and Safeguards
// ---------------------------------------------------------------------------

const SUB_1_3: SubprogrammeDef = {
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
      binding: manual("1.3.1"),
      logLabel: "RPO conference (Medical)",
    },
    {
      id: "1.3.2",
      description: "Annual Conference for RPOs (Non-Medical)",
      indicator: "Number of Conferences",
      target: 1,
      section: NSSS,
      binding: manual("1.3.2"),
      logLabel: "RPO conference (Non-Medical)",
    },
    {
      id: "1.3.3",
      description: "Open two inland offices (Mongu & Ndola)",
      indicator: "Number of Offices opened",
      target: 2,
      section: NSSS,
      binding: manual("1.3.3"),
      logLabel: "Inland offices opened",
    },
    {
      id: "1.3.4",
      description: "INSSERV Mission Action Plan",
      indicator: "Number of meetings",
      target: 1,
      section: NSSS,
      binding: manual("1.3.4"),
      logLabel: "INSSERV action plan meetings",
    },
    {
      id: "1.3.5",
      description: "Physical protection inspection",
      indicator: "Number of Facilities inspected",
      target: 10,
      section: NSSS,
      binding: manual("1.3.5"),
      logLabel: "Physical protection inspections",
    },
    {
      id: "1.3.6",
      description: "SOP for Nuclear Safety, Security & Safeguard",
      indicator: "Number of SOPs developed",
      target: 8,
      section: NSSS,
      binding: manual("1.3.6"),
      logLabel: "NSSS SOPs developed",
    },
    {
      id: "1.3.7",
      description: "Implement INSSP under Nuclear Security",
      indicator: "INSSP programme implemented",
      target: 100,
      section: NSSS,
      binding: manual("1.3.7"),
      logLabel: "INSSP implementation (%)",
      note: "Reported as percentage points of the programme implemented.",
    },
    {
      id: "1.3.8",
      description: "Regional Workshop (IAEA/EU/USNRC/CBRN/RASIM)",
      indicator: "# of meetings",
      target: 2,
      section: NSSS,
      binding: manual("1.3.8", [LEGACY.nsssIaea]),
      logLabel: "Regional workshops / IAEA meetings",
    },
    {
      id: "1.3.9",
      description: "Stakeholder Engagement and Sensitisation",
      indicator: "# of stakeholders'",
      target: 40,
      section: NSSS,
      binding: manual("1.3.9", [LEGACY.nsssStakeholder]),
      logLabel: "Stakeholders engaged",
    },
    {
      id: "1.3.10",
      description: "Training for ZRA Inspectors/Responders/FLO",
      indicator: "# of trainings conducted",
      target: 4,
      section: NSSS,
      binding: manual("1.3.10"),
      logLabel: "ZRA / responder trainings",
    },
    {
      id: "1.3.11",
      description: "Monitoring & Evaluation of Inland Offices",
      indicator: "Number of Monitoring and Evaluation",
      target: null,
      section: NSSS,
      binding: manual("1.3.11"),
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
      binding: {
        kind: "manual",
        key: LEGACY.nsssScreening,
        splitByBorder: true,
      },
      logLabel: "Vehicles screened",
      note: "Fed by the border scan log and the coordinators' daily counts — expand for the split by border post.",
    },
    {
      id: "1.3.13",
      description: "Quarterly Meetings for Coordinators and TWG",
      indicator: "# of meetings'",
      target: 5,
      section: NSSS,
      binding: manual("1.3.13", [LEGACY.nsssTwg]),
      logLabel: "Coordinator / TWG meetings",
    },
    {
      id: "1.3.14",
      description: "Enhance detection capacity system",
      indicator: "# number of detection system",
      target: 1,
      section: NSSS,
      binding: manual("1.3.14"),
      logLabel: "Detection systems enhanced",
    },
  ],
};

/** The approved plan as the code ships it — what an unedited row reports as. */
export const WORK_PLAN: Subprogramme[] = [SUB_1_1, SUB_1_2, SUB_1_3].map(
  finaliseSub,
);

/** Every output across the approved plan, in workbook order. */
export const WORK_PLAN_OUTPUTS: WorkPlanOutput[] = WORK_PLAN.flatMap(
  (s) => s.outputs,
);

/** Every output of a plan, in its order. */
export function planOutputs(plan: Subprogramme[] = WORK_PLAN): WorkPlanOutput[] {
  return plan.flatMap((s) => s.outputs);
}

/**
 * One output by id, matching an id the row has been known by as well as its
 * current one — a renumbered row must not lose the notes and figures already
 * stored against it.
 */
export function findOutput(
  id: string,
  plan: Subprogramme[] = WORK_PLAN,
): WorkPlanOutput | null {
  const outputs = planOutputs(plan);
  return (
    outputs.find((o) => o.id === id) ||
    outputs.find((o) => o.previousIds?.includes(id)) ||
    null
  );
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

/**
 * The numbering the report reads in, dotted-decimal like the workbook itself:
 *
 *   1.2        the subprogramme
 *   1.2.4      a plan output, the workbook's own number
 *   1.2.9.1    a supporting figure that is the detail behind output 1.2.9
 *   1.2.S1     a supporting figure the whole subprogramme keeps, with no
 *              output of its own to sit under
 *
 * Sorting on it puts every row where a reader expects it — 1.2.9 then its
 * 1.2.9.1…, and 1.1.10 after 1.1.9 rather than after 1.1.1 — which is why the
 * comparison is segment by segment and numeric, never a string compare.
 */
export function compareOutputIds(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i];
    const y = right[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = Number(x);
    const ny = Number(y);
    const xNum = x !== "" && Number.isFinite(nx);
    const yNum = y !== "" && Number.isFinite(ny);
    // A numbered row sorts before a lettered one (1.2.9 before 1.2.S1).
    if (xNum && !yNum) return -1;
    if (!xNum && yNum) return 1;
    if (xNum && yNum) {
      if (nx !== ny) return nx - ny;
      continue;
    }
    if (x !== y) return x.localeCompare(y);
  }
  return 0;
}

/**
 * The plan as one part of the department sees it: only the outputs the given
 * sections report, and only the subprogrammes that still have a row. This is
 * what a section officer's sectional update and daily "week so far" are read
 * through — their own rows, not the department's — while the department itself
 * (an administrator, or the cross-section posting) is handed the whole plan.
 *
 * Filter at the output, not the subprogramme: a subprogramme belongs to one
 * section but individual outputs in it may be reported by another.
 */
export function planForSections(
  plan: Subprogramme[],
  sections: readonly Section[],
): Subprogramme[] {
  const keep = new Set(sections);
  return plan
    .map((sub) => ({
      ...sub,
      outputs: sub.outputs.filter((o) => keep.has(o.section)),
    }))
    .filter((sub) => sub.outputs.length > 0);
}

/**
 * The next free number for a row being added, in the scheme above — the report
 * numbers new rows itself so nobody has to work out what is already taken.
 */
export function nextOutputId(
  plan: Subprogramme[],
  input: { subprogramme: string; supporting?: boolean; parentId?: string },
): string {
  const taken = new Set<string>();
  for (const o of planOutputs(plan)) {
    taken.add(o.id);
    for (const p of o.previousIds || []) taken.add(p);
  }
  const prefix = input.supporting
    ? input.parentId
      ? `${input.parentId}.`
      : `${input.subprogramme}.S`
    : `${input.subprogramme}.`;
  for (let n = 1; n < 1000; n++) {
    const id = `${prefix}${n}`;
    if (!taken.has(id)) return id;
  }
  // A subprogramme with a thousand rows is not a numbering problem.
  return `${prefix}${Date.now()}`;
}

/** Is this a well-formed row number in the scheme above? */
export function isValidOutputId(id: string): boolean {
  return /^\d+\.\d+(\.\d+)*(\.S\d+)?$/.test(id.trim());
}

// ---------------------------------------------------------------------------
// The sections' own changes — the plan the report is actually read through
// ---------------------------------------------------------------------------

const SUBPROGRAMME_ID = /^\d+\.\d+$/;

/** A heading built the way the workbook writes them. */
export function subprogrammeHeading(id: string, title: string): string {
  return `Subprogramme ${id} — ${title}`;
}

function outputConfigFor(
  output: { id: string; previousIds?: readonly string[] },
  configured: Record<string, WorkPlanOutputConfig>,
): WorkPlanOutputConfig | undefined {
  const direct = configured[output.id];
  if (direct) return direct;
  for (const prev of output.previousIds || []) {
    if (configured[prev]) return configured[prev];
  }
  return undefined;
}

/** Has this entry actually changed anything, or is it an empty husk? */
function changesSomething(entry: WorkPlanOutputConfig): boolean {
  return (
    entry.added === true ||
    entry.hidden === true ||
    [
      "description",
      "indicator",
      "target",
      "note",
      "logLabel",
      "section",
      "supporting",
      "parentId",
      "binding",
    ].some((k) => (entry as Record<string, unknown>)[k] !== undefined)
  );
}

function applyOutput(
  base: WorkPlanOutput,
  entry: WorkPlanOutputConfig | undefined,
): WorkPlanOutput {
  if (!entry || !changesSomething(entry)) return base;
  const binding = entry.binding ?? base.binding;
  return {
    ...base,
    description: entry.description ?? base.description,
    indicator: entry.indicator ?? base.indicator,
    target: entry.target === undefined ? base.target : entry.target,
    note: entry.note === undefined ? base.note : entry.note || undefined,
    logLabel: entry.logLabel ?? base.logLabel,
    section: entry.section ?? base.section,
    supporting: entry.supporting ?? base.supporting,
    parentId: entry.parentId === undefined ? base.parentId : entry.parentId || undefined,
    binding,
    source: resolveSource(binding),
    breakdown: breakdownForBinding(binding),
    customised: true,
  };
}

/**
 * A row a section added for itself. It carries no approved wording to fall back
 * on, so anything it does not say gets a sane default rather than a blank cell.
 */
function buildAddedOutput(
  id: string,
  entry: WorkPlanOutputConfig,
  fallbackSection: Section,
): WorkPlanOutput {
  const binding: SourceBinding = entry.binding ?? {
    kind: "manual",
    key: outputMetricKey(id),
  };
  return {
    id,
    description: entry.description || `Output ${id}`,
    indicator: entry.indicator || "Number",
    target: entry.target === undefined ? null : entry.target,
    section: entry.section || fallbackSection,
    binding,
    source: resolveSource(binding),
    breakdown: breakdownForBinding(binding),
    logLabel: entry.logLabel,
    note: entry.note || undefined,
    supporting: entry.supporting,
    parentId: entry.parentId || undefined,
    added: true,
    customised: true,
  };
}

/**
 * The plan the report is read through: the approved workbook, with the
 * sections' saved changes laid over it.
 *
 * Nothing is destructive. An untouched row is the approved row, object for
 * object; a retired row is hidden but keeps its figures; clearing an entry
 * hands the row straight back to the workbook. Rows are returned in the
 * numbering's own order, so a row a section adds appears where its number says
 * it belongs rather than at the bottom.
 */
export function applyWorkPlanConfig(
  config?: WorkPlanConfig | null,
  base: Subprogramme[] = WORK_PLAN,
): Subprogramme[] {
  const outputEntries = config?.outputs || {};
  const subEntries = config?.subprogrammes || {};

  const subs = new Map<string, Subprogramme>();
  for (const sub of base) {
    subs.set(sub.id, { ...sub, outputs: [] });
  }
  // Subprogrammes a section added — a whole new sheet of the plan.
  for (const [id, entry] of Object.entries(subEntries)) {
    if (!entry?.added || subs.has(id) || !SUBPROGRAMME_ID.test(id)) continue;
    const title = entry.title || `Subprogramme ${id}`;
    subs.set(id, {
      id,
      title,
      heading: entry.heading || subprogrammeHeading(id, title),
      section: entry.section || base[0]?.section || "Authorisation & Standards",
      outputs: [],
      added: true,
      customised: true,
    });
  }
  // Renamed headings.
  for (const [id, entry] of Object.entries(subEntries)) {
    const sub = subs.get(id);
    if (!sub || entry?.added) continue;
    const title = entry?.title ?? sub.title;
    const changed =
      entry?.title !== undefined ||
      entry?.heading !== undefined ||
      entry?.section !== undefined;
    if (!changed) continue;
    subs.set(id, {
      ...sub,
      title,
      heading:
        entry?.heading ??
        (entry?.title !== undefined ? subprogrammeHeading(id, title) : sub.heading),
      section: entry?.section ?? sub.section,
      customised: true,
    });
  }

  const place = (output: WorkPlanOutput, subId: string) => {
    const sub = subs.get(subId);
    if (sub) sub.outputs.push(output);
  };

  const seen = new Set<string>();
  for (const sub of base) {
    for (const output of sub.outputs) {
      const entry = outputConfigFor(output, outputEntries);
      seen.add(output.id);
      for (const p of output.previousIds || []) seen.add(p);
      if (entry?.hidden) continue;
      place(applyOutput(output, entry), entry?.subprogramme ?? sub.id);
    }
  }
  for (const [id, entry] of Object.entries(outputEntries)) {
    if (!entry?.added || seen.has(id) || entry.hidden) continue;
    const subId = entry.subprogramme || id.split(".").slice(0, 2).join(".");
    const sub = subs.get(subId);
    if (!sub) continue;
    place(buildAddedOutput(id, entry, sub.section), subId);
  }

  return [...subs.values()]
    .filter((sub) => !subEntries[sub.id]?.hidden)
    .sort((a, b) => compareOutputIds(a.id, b.id))
    .map((sub) => ({
      ...sub,
      outputs: [...sub.outputs].sort((a, b) => compareOutputIds(a.id, b.id)),
    }));
}

/**
 * The rows a saved config has retired — off the report, but not gone. Shown so
 * an officer can put one back rather than having to remember what was dropped.
 */
export function retiredOutputs(
  config?: WorkPlanConfig | null,
  base: Subprogramme[] = WORK_PLAN,
): WorkPlanOutput[] {
  const entries = config?.outputs || {};
  const out: WorkPlanOutput[] = [];
  for (const sub of base) {
    for (const output of sub.outputs) {
      const entry = outputConfigFor(output, entries);
      if (entry?.hidden) out.push(applyOutput(output, { ...entry, hidden: false }));
    }
  }
  const shipped = new Set(planOutputs(base).map((o) => o.id));
  for (const [id, entry] of Object.entries(entries)) {
    if (entry?.added && entry.hidden && !shipped.has(id)) {
      out.push(buildAddedOutput(id, entry, sectionOfId(id, base)));
    }
  }
  return out.sort((a, b) => compareOutputIds(a.id, b.id));
}

function sectionOfId(id: string, base: Subprogramme[]): Section {
  const subId = id.split(".").slice(0, 2).join(".");
  return base.find((s) => s.id === subId)?.section || base[0].section;
}

/**
 * What a row must satisfy before it is saved. The numbering and the metric key
 * are the two things a mistake here would break for good, so both are checked
 * against the plan the row is going into rather than trusted.
 */
export function validateOutputEdit(
  plan: Subprogramme[],
  id: string,
  entry: WorkPlanOutputConfig,
  opts: { added?: boolean } = {},
): string | null {
  if (!isValidOutputId(id)) {
    return `"${id}" is not a work plan number — use a number like 1.2.4, 1.2.9.1 or 1.2.S1.`;
  }
  if (opts.added && findOutput(id, plan)) {
    return `Output ${id} already exists on the plan.`;
  }
  if (entry.description !== undefined && !entry.description.trim()) {
    return "An output needs a description.";
  }
  if (entry.indicator !== undefined && !entry.indicator.trim()) {
    return "An output needs a key indicator.";
  }
  if (
    entry.target !== undefined &&
    entry.target !== null &&
    (!Number.isFinite(entry.target) || entry.target < 0)
  ) {
    return "A target must be zero or more, or left blank for no target.";
  }
  if (entry.binding?.kind === "manual" && !entry.binding.key.trim()) {
    return "A typed figure needs a metric key to store it against.";
  }
  if (entry.parentId && !findOutput(entry.parentId, plan)) {
    return `There is no output ${entry.parentId} for this figure to sit under.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Opening balance
// ---------------------------------------------------------------------------

/**
 * What an output had already achieved before the system started counting it,
 * per quarter. The report is cumulative for the plan year, so every row starts
 * from its opening balance and adds what has been recorded since — a section
 * that was at 357 licences when it moved onto the system reports 358 after the
 * next one is logged, not 1.
 *
 * These are the three sections' own cumulative actuals for the plan year, taken
 * from `SUB_PROGRAMS_1.xlsx` — the one workbook that now carries all three
 * subprogramme sheets (see docs/subprogrammes-2026-cumulative-update.md).
 * Every figure below is the workbook's Q1–Q4 row, except where the system
 * already holds the records behind it:
 *
 * - 1.1.4  the workbook's 357 licences by quarter. The licence register holds
 *          no dated `licenceEvents` yet (the Licensing Status import seeds
 *          facilities and their authorisations, not issue events), so the whole
 *          figure is carried in and every licence logged from here adds on top.
 * - 1.2.x  carried in whole — the inspection register is empty, so 1.2.4 and
 *          1.2.11 have nothing behind them the system counts.
 * - 1.3.12 the ONE row the system part-holds: the inland offices' daily log
 *          (seed/daily-screening-2026.seed.json, see
 *          docs/daily-screening-2026-import.md) is counted directly and runs to
 *          21 Aug 2026 = 331,177 vehicles. The workbook is at 341,009, so only
 *          the 9,832 the log does not hold is carried in. If those late-August
 *          days are ever logged on Daily Updates, zero this row or they count
 *          twice.
 *
 * A saved `workPlanBaseline` document REPLACES these wholesale (it does not
 * add), so an officer can correct or re-baseline the plan without touching the
 * code.
 *
 * The one thing to watch: an output's opening balance covers work the registers
 * do NOT hold. Back-importing the same licences or inspections would count them
 * twice — re-baseline to zero for that output if you ever do, the way 1.3.12
 * already is.
 */
export const WORK_PLAN_OPENING_BALANCE: Record<string, number[]> = {
  // Subprogramme 1.1 — Authorisation and Standards
  "1.1.1": [3, 3, 0, 0],
  "1.1.2": [1, 2, 0, 0],
  "1.1.3": [0, 1, 0, 0],
  "1.1.4": [152, 125, 80, 0],
  "1.1.5": [0, 1, 0, 0],
  "1.1.6": [1, 3, 0, 0],
  "1.1.7": [0, 1, 0, 0],
  "1.1.8": [0, 0, 0, 0],
  "1.1.9": [1, 1, 0, 0],
  "1.1.10": [1, 1, 0, 0],
  // Subprogramme 1.2 — Nuclear & Radiation Safety Inspections
  "1.2.1": [1, 0, 0, 0],
  "1.2.2": [1, 0, 0, 0],
  "1.2.3": [0, 2, 0, 0],
  "1.2.4": [40, 123, 121, 0],
  "1.2.5": [1, 1, 0, 0],
  "1.2.6": [8, 8, 7, 0],
  "1.2.7": [1, 1, 0, 0],
  "1.2.8": [1, 0, 0, 0],
  "1.2.9": [0, 1, 0, 0],
  "1.2.10": [0, 1, 0, 0],
  "1.2.11": [45, 61, 87, 0],
  // Subprogramme 1.3 — Nuclear Safety, Security and Safeguards
  "1.3.1": [0, 1, 0, 0],
  "1.3.2": [0, 0, 0, 0],
  "1.3.3": [0, 2, 0, 0],
  "1.3.4": [0, 0, 0, 0],
  "1.3.5": [0, 9, 1, 0],
  "1.3.6": [0, 0, 8, 0],
  // Percentage points of the INSSP programme implemented, not a count.
  "1.3.7": [0, 0, 100, 0],
  "1.3.8": [0, 0, 2, 0],
  "1.3.9": [0, 0, 65, 0],
  "1.3.10": [0, 5, 2, 0],
  "1.3.11": [0, 0, 0, 0],
  // Mostly counted from the seeded daily screening log; only the days the log
  // does not hold are carried in — 341,009 (workbook) − 331,177 (log to
  // 21 Aug 2026) = 9,832. See the note above before changing this.
  "1.3.12": [0, 0, 9832, 0],
  "1.3.13": [0, 0, 26, 0],
  "1.3.14": [0, 0, 1, 0],
};

/** A quarter array that is always length 4, with whole non-negative numbers. */
export function normaliseQuarters(input: unknown): number[] {
  const out = [0, 0, 0, 0];
  if (!Array.isArray(input)) return out;
  for (let i = 0; i < 4; i++) {
    const n = Number(input[i]);
    out[i] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return out;
}

/**
 * The opening balance in force: a saved baseline if there is one, otherwise the
 * workbook's figures at handover. Saved baselines replace rather than merge, so
 * an output an officer zeroed stays zero.
 */
export function effectiveOpeningBalance(
  saved?: Record<string, number[]> | null,
  plan: Subprogramme[] = WORK_PLAN,
): Record<string, number[]> {
  const source = saved ?? WORK_PLAN_OPENING_BALANCE;
  const out: Record<string, number[]> = {};
  for (const o of planOutputs(plan)) {
    // A renumbered row keeps the balance saved under the number it had.
    const stored =
      source[o.id] ??
      (o.previousIds || []).map((p) => source[p]).find((v) => v !== undefined);
    out[o.id] = normaliseQuarters(stored);
  }
  return out;
}

/**
 * Read opening figures out of pasted text, so a section can copy its rows
 * straight out of the work plan spreadsheet.
 *
 * Two shapes are understood, both keyed on the output id that starts the line:
 *
 * - A row copied from the workbook — tab separated, with the quarters in the
 *   sheet's own columns (id, description, indicator, target, Q1..Q4, …).
 * - Anything looser — the id followed by up to four numbers, read as Q1..Q4.
 *
 * Lines that carry no output id, or an id the plan does not have, come back as
 * `skipped` rather than being guessed at.
 */
export function parseOpeningBalance(text: string): {
  values: Record<string, number[]>;
  matched: string[];
  skipped: string[];
} {
  const values: Record<string, number[]> = {};
  const matched: string[] = [];
  const skipped: string[] = [];

  for (const raw of (text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const cells = line.split("\t").map((c) => c.trim());
    const id = (cells[0].match(/\d+\.\d+\.\d+/) || [])[0];
    if (!id || !findOutput(id)) {
      skipped.push(line);
      continue;
    }

    // A pasted workbook row keeps the sheet's column order; the quarters are
    // the four cells after the target. Blank cells mean nothing achieved.
    const quarters =
      cells.length >= 8
        ? cells.slice(4, 8).map((c) => Number(c.replace(/[,\s]/g, "")) || 0)
        : (line
            .slice(line.indexOf(id) + id.length)
            .match(/-?[\d,]*\d/g) || []
          )
            .slice(0, 4)
            .map((n) => Number(n.replace(/,/g, "")) || 0);

    values[id] = normaliseQuarters(quarters);
    matched.push(id);
  }

  return { values, matched, skipped };
}

/**
 * The outputs a section may log a figure against — its manual plan outputs and
 * supporting figures, in plan order. This is what the Daily Updates tab offers.
 */
export function manualOutputsForSection(
  section: Section,
  plan: Subprogramme[] = WORK_PLAN,
): WorkPlanOutput[] {
  return planOutputs(plan).filter(
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
  /** Already achieved before the system started counting, index 0 = Q1. */
  opening: number[];
  /** Recorded in the system, index 0 = Q1. */
  recorded: number[];
  /** Cumulative actuals as reported — opening + recorded, index 0 = Q1. */
  quarters: number[];
  openingTotal: number;
  recordedTotal: number;
  /** Total Actual — the sum of the four quarters, opening balance included. */
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
  /**
   * The plan to report against — the approved workbook with the sections'
   * saved changes laid over it (`applyWorkPlanConfig`). Omit for the approved
   * plan exactly as the code ships it.
   */
  plan?: Subprogramme[];
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
  /**
   * The saved opening balance per output id. Omit to start every output from
   * the approved workbook's figures at handover; pass `{}` for a plan that
   * counts only what the system has recorded.
   */
  baseline?: Record<string, number[]> | null;
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

  if (spec.kind === "enforcementActions") {
    const rows = ENFORCEMENT_COLUMNS.map((c) =>
      count(c.label, input.inspections.filter((i) => i.enforcement === c.key)),
    ).filter((r) => r.total > 0 || r.week > 0);
    // Records logged as an "Enforcement Action" type before the action itself
    // was recorded have no column to sit in, but they are still in the figure.
    const untyped = input.inspections.filter(
      (i) => i.type === "Enforcement Action" && !i.enforcement,
    );
    if (untyped.length) rows.push(count("Action not recorded", untyped));
    return rows;
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
  opening: number[],
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
      input.inspections.filter((i) => source.match(i)),
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

  // The plan is cumulative for the year: what the output had already achieved
  // when it came onto the system, plus everything recorded since.
  const quarters = tally.quarters.map((v, i) => v + (opening[i] || 0));
  const total = quarters.reduce((a, b) => a + b, 0);

  // A renumbered row keeps the narrative saved under the number it had.
  const notes = input.notes || {};
  const note =
    notes[output.id] ||
    (output.previousIds || []).map((p) => notes[p]).find(Boolean);
  const derivedStatus = deriveStatus(total, output.target);
  const key = source.kind === "manual" ? source.key : null;

  return {
    output,
    week: tally.week,
    opening,
    recorded: tally.quarters,
    quarters,
    openingTotal: opening.reduce((a, b) => a + b, 0),
    recordedTotal: tally.total,
    total,
    percent: percentAchieved(total, output.target),
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
  const plan = input.plan ?? WORK_PLAN;
  const quarterByWeek = buildQuarterIndex(input.weeks, year);
  const opening = effectiveOpeningBalance(input.baseline, plan);
  return plan.map((sub) => {
    const derived = sub.outputs.map((o) =>
      deriveRow(o, input, quarterByWeek, year, opening[o.id] || emptyQuarters()),
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
  // Trailing, so the columns before them paste straight into the workbook:
  // how the cumulative figure splits between what was carried in and what the
  // system has counted.
  "Opening Balance",
  "Recorded in System",
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
    String(row.openingTotal),
    String(row.recordedTotal),
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
          ` total ${row.total}/${target} (${formatPercent(row.percent)}) — ${row.status}` +
          (row.openingTotal
            ? ` [opening balance ${row.openingTotal}, recorded since ${row.recordedTotal}]`
            : ""),
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
