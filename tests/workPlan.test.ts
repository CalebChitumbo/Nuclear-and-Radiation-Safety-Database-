import { describe, expect, it } from "vitest";

import {
  WORK_PLAN,
  WORK_PLAN_OUTPUTS,
  WORK_PLAN_OPENING_BALANCE,
  buildQuarterIndex,
  deriveStatus,
  deriveWorkPlan,
  effectiveOpeningBalance,
  normaliseQuarters,
  parseOpeningBalance,
  planForSections,
  findOutput,
  formatPercent,
  metricKeysForOutput,
  outputMetricKey,
  percentAchieved,
  quarterOfISO,
  workPlanBrief,
  workPlanRows,
  type SubprogrammeReport,
  type WorkPlanRow,
} from "../lib/rules/workPlan";
import { vehicleScreeningKey } from "../lib/rules/daily";
import { metricKey } from "../lib/rules/weeklyDerivation";
import type {
  DailyEntry,
  Inspection,
  LicenceEvent,
  WeekDef,
  WorkPlanNote,
} from "../lib/rules/types";
import weeksSeed from "../seed/weeks-2026.seed.json";

const WEEKS = weeksSeed as WeekDef[];
const week = (prefix: string): string =>
  WEEKS.find((w) => w.label.startsWith(prefix))!.label;

const Q1 = week("W02"); // wk of 05 Jan 2026
const Q1_EDGE = week("W14"); // 30 Mar → 3 Apr — straddles into April
const Q2 = week("W22"); // wk of 25 May 2026
const Q3 = week("W30"); // wk of 20 Jul 2026

const ev = (
  type: LicenceEvent["type"],
  weekLabel: string,
  date: string,
  i = 1,
): LicenceEvent => ({
  id: `e${i}-${weekLabel}-${type}`,
  date,
  week: weekLabel,
  facilityId: "f",
  facilityName: "F",
  sector: "Private",
  province: "Lusaka",
  type,
  number: "",
  facCode: "",
});

const insp = (
  type: Inspection["type"],
  weekLabel: string,
  date: string,
  i = 1,
): Inspection => ({
  id: `i${i}-${weekLabel}-${type}`,
  date,
  week: weekLabel,
  facilityId: "f",
  facilityName: "F",
  type,
  outcome: "Compliant",
  province: "Lusaka",
  sector: "Private",
  notes: "",
});

const screening = (
  value: number,
  weekLabel: string,
  date: string,
  border?: string,
): DailyEntry => ({
  id: `d-${weekLabel}-${border || "none"}-${value}`,
  date,
  week: weekLabel,
  section: "Nuclear Safety, Security & Safeguards",
  kind: "count",
  metricKey: vehicleScreeningKey(),
  label: "Vehicles screened",
  value,
  border,
});

interface Input {
  week?: string;
  events?: LicenceEvent[];
  inspections?: Inspection[];
  values?: Array<[string, Record<string, number>]>;
  dailyEntries?: DailyEntry[];
  notes?: Record<string, WorkPlanNote>;
  baseline?: Record<string, number[]> | null;
}

/**
 * Most cases are about what the system counts, so they start from a zeroed
 * opening balance; the cumulative-reporting tests pass one explicitly.
 */
function derive(input: Input = {}): SubprogrammeReport[] {
  return deriveWorkPlan({
    weeks: WEEKS,
    week: input.week ?? Q2,
    events: input.events || [],
    inspections: input.inspections || [],
    valuesByWeek: new Map(input.values || []),
    dailyEntries: input.dailyEntries,
    notes: input.notes,
    baseline: input.baseline === undefined ? {} : input.baseline,
  });
}

function row(reports: SubprogrammeReport[], id: string): WorkPlanRow {
  for (const sub of reports) {
    const found = [...sub.rows, ...sub.supporting].find(
      (r) => r.output.id === id,
    );
    if (found) return found;
  }
  throw new Error(`no row for output ${id}`);
}

describe("the plan itself", () => {
  it("carries all three subprogrammes and their workbook outputs", () => {
    expect(WORK_PLAN.map((s) => s.id)).toEqual(["1.1", "1.2", "1.3"]);
    const planOutputs = WORK_PLAN_OUTPUTS.filter((o) => !o.supporting);
    expect(planOutputs.filter((o) => o.id.startsWith("1.1."))).toHaveLength(10);
    expect(planOutputs.filter((o) => o.id.startsWith("1.2."))).toHaveLength(11);
    expect(planOutputs.filter((o) => o.id.startsWith("1.3."))).toHaveLength(14);
  });

  it("keeps the workbook's targets", () => {
    expect(findOutput("1.1.4")?.target).toBe(500);
    expect(findOutput("1.2.4")?.target).toBe(500);
    expect(findOutput("1.2.6")?.target).toBe(36);
    expect(findOutput("1.2.11")?.target).toBe(50);
    expect(findOutput("1.3.12")?.target).toBe(350000);
    // "-" in the sheet — no numeric target to measure against.
    expect(findOutput("1.3.11")?.target).toBeNull();
  });

  it("gives every output a unique id", () => {
    const ids = WORK_PLAN_OUTPUTS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("logs vehicle screening on the key the border scan log already writes", () => {
    // Changing this orphans every figure the border posts have ever recorded.
    expect(metricKeysForOutput(findOutput("1.3.12")!)).toEqual([
      vehicleScreeningKey(),
    ]);
  });

  it("still counts figures logged under the pre-work-plan metric names", () => {
    expect(metricKeysForOutput(findOutput("1.3.13")!)).toEqual([
      outputMetricKey("1.3.13"),
      metricKey("Nuclear Safety, Security & Safeguards", "TWG Meetings"),
    ]);
  });
});

describe("quarters", () => {
  it("maps a month to its quarter", () => {
    expect(quarterOfISO("2026-01-05")).toBe(1);
    expect(quarterOfISO("2026-06-30")).toBe(2);
    expect(quarterOfISO("2026-07-01")).toBe(3);
    expect(quarterOfISO("2026-12-31")).toBe(4);
  });

  it("counts a straddling week to the quarter it starts in", () => {
    const index = buildQuarterIndex(WEEKS);
    expect(index.get(Q1_EDGE)).toBe(1); // 30 Mar → 3 Apr
    expect(index.get(week("W15"))).toBe(2);
    expect(index.get(week("W40"))).toBe(3); // 28 Sep → 2 Oct
    expect(index.get(week("W53"))).toBe(4); // 28 Dec → 1 Jan 2027
  });
});

describe("output 1.1.4 — licences issued", () => {
  it("counts every recorded licence into its week and quarter", () => {
    const reports = derive({
      week: Q2,
      events: [
        ev("New Use/Possession Licence", Q1, "2026-01-06", 1),
        ev("Importation Licence", Q2, "2026-05-26", 2),
        ev("Importation Licence", Q2, "2026-05-27", 3),
        ev("Transport Licence", Q3, "2026-07-21", 4),
      ],
    });
    const r = row(reports, "1.1.4");
    expect(r.auto).toBe(true);
    expect(r.week).toBe(2);
    expect(r.quarters).toEqual([1, 2, 1, 0]);
    expect(r.total).toBe(4);
    expect(r.percent).toBeCloseTo((4 / 500) * 100);
  });

  it("breaks the total down by licence type", () => {
    const reports = derive({
      week: Q2,
      events: [
        ev("New Use/Possession Licence", Q2, "2026-05-26", 1),
        ev("Renewal of Use/Possession Licence", Q2, "2026-05-27", 2),
        ev("Export Licence", Q1, "2026-01-06", 3),
      ],
    });
    const r = row(reports, "1.1.4");
    const possession = r.breakdown.find(
      (b) => b.label === "Possession Licences issued",
    );
    expect(possession).toEqual({
      label: "Possession Licences issued",
      week: 2,
      total: 2,
    });
    expect(r.breakdown.find((b) => b.label === "Export Licences")?.total).toBe(1);
    // Types with nothing on record stay off the breakdown.
    expect(r.breakdown.some((b) => b.label === "Transit Licences")).toBe(false);
  });
});

describe("outputs 1.2.4 and 1.2.11 — inspections and enforcement", () => {
  const inspections = [
    insp("Routine Inspection", Q2, "2026-05-26", 1),
    insp("Routine Inspection", Q2, "2026-05-27", 2),
    insp("Pre-Authorisation", Q2, "2026-05-28", 3),
    insp("Follow-up", Q1, "2026-01-06", 4),
    insp("Investigation", Q3, "2026-07-21", 5),
    insp("Enforcement Action", Q2, "2026-05-29", 6),
    insp("Enforcement Action", Q1, "2026-01-07", 7),
  ];

  it("reports inspection visits as one figure, enforcement separately", () => {
    const reports = derive({ week: Q2, inspections });
    const visits = row(reports, "1.2.4");
    expect(visits.week).toBe(3); // 2 routine + 1 pre-auth
    expect(visits.quarters).toEqual([1, 3, 1, 0]);
    expect(visits.total).toBe(5);

    const enforcement = row(reports, "1.2.11");
    expect(enforcement.week).toBe(1);
    expect(enforcement.total).toBe(2);
  });

  it("keeps the per-type breakdown behind the 1.2.4 figure", () => {
    const reports = derive({ week: Q2, inspections });
    const breakdown = row(reports, "1.2.4").breakdown;
    expect(breakdown.map((b) => [b.label, b.week, b.total])).toEqual([
      ["Routine Inspections", 2, 2],
      ["Follow-ups", 0, 1],
      ["Pre-Authorisation Inspections", 1, 1],
      ["Investigations", 0, 1],
    ]);
    // Enforcement actions are their own output, never folded into 1.2.4.
    expect(breakdown.some((b) => b.label === "Enforcement Actions")).toBe(false);
  });

  it("counts an action recorded on an inspection, as the database does", () => {
    // The Inspectorate's database records the enforcement against the
    // inspection it came out of — a routine visit that ends in a seizure is
    // one inspection AND one enforcement, so it counts under both outputs.
    const withAction: Inspection[] = [
      { ...insp("Routine Inspection", Q2, "2026-05-26", 8),
        enforcement: "Seizure of Device" },
      { ...insp("Pre-Authorisation", Q2, "2026-05-27", 9),
        enforcement: "Engagement at Facility Level" },
    ];
    const reports = derive({ week: Q2, inspections: withAction });
    expect(row(reports, "1.2.4").week).toBe(2);
    expect(row(reports, "1.2.11").week).toBe(2);
  });

  it("splits 1.2.11 by the action taken, the summary's own columns", () => {
    const withAction: Inspection[] = [
      { ...insp("Routine Inspection", Q2, "2026-05-26", 8),
        enforcement: "Engagement at Facility Level" },
      { ...insp("Routine Inspection", Q1, "2026-01-06", 9),
        enforcement: "Engagement at Facility Level" },
      { ...insp("Follow-up", Q2, "2026-05-27", 10),
        enforcement: "Seizure of Device" },
      // Logged before the action was recorded — still in the figure.
      insp("Enforcement Action", Q2, "2026-05-28", 11),
    ];
    const reports = derive({ week: Q2, inspections: withAction });
    const r = row(reports, "1.2.11");
    expect(r.total).toBe(4);
    expect(r.breakdown.map((b) => [b.label, b.week, b.total])).toEqual([
      ["Facility Level", 1, 2],
      ["Devices Seized", 1, 1],
      ["Action not recorded", 1, 1],
    ]);
  });
});

describe("manual outputs", () => {
  it("puts a week's figure in its week, its quarter and the total", () => {
    const key = outputMetricKey("1.1.1");
    const reports = derive({
      week: Q2,
      values: [
        [Q1, { [key]: 2 }],
        [Q2, { [key]: 3 }],
      ],
    });
    const r = row(reports, "1.1.1");
    expect(r.auto).toBe(false);
    expect(r.metricKey).toBe(key);
    expect(r.week).toBe(3);
    expect(r.quarters).toEqual([2, 3, 0, 0]);
    expect(r.total).toBe(5);
  });

  it("adds figures logged under the section's earlier metric name", () => {
    const legacy = metricKey("Inspectorate", "TWG Meetings attended");
    const reports = derive({
      week: Q2,
      values: [
        [Q1, { [legacy]: 4 }],
        [Q2, { [outputMetricKey("1.2.6")]: 1, [legacy]: 2 }],
      ],
    });
    const r = row(reports, "1.2.6");
    expect(r.week).toBe(3);
    expect(r.total).toBe(7);
  });

  it("marks a week whose figure came from Daily Updates as read-only", () => {
    const key = outputMetricKey("1.1.1");
    const reports = deriveWorkPlan({
      weeks: WEEKS,
      week: Q2,
      events: [],
      inspections: [],
      valuesByWeek: new Map([[Q2, { [key]: 3 }]]),
      fromDaily: new Set([key]),
    });
    expect(row(reports, "1.1.1").fromDaily).toBe(true);
    expect(row(reports, "1.1.2").fromDaily).toBe(false);
  });
});

describe("output 1.3.12 — vehicles screened", () => {
  const entries = [
    screening(60, Q2, "2026-05-26", "Chirundu"),
    screening(40, Q2, "2026-05-27", "Chirundu"),
    screening(50, Q2, "2026-05-27", "Kasumbalesa"),
    screening(33, Q1, "2026-01-06"),
  ];

  it("reads the border posts' figures without any re-entry", () => {
    const key = vehicleScreeningKey();
    const reports = derive({
      week: Q2,
      values: [
        [Q1, { [key]: 33 }],
        [Q2, { [key]: 150 }],
      ],
      dailyEntries: entries,
    });
    const r = row(reports, "1.3.12");
    expect(r.week).toBe(150);
    expect(r.quarters).toEqual([33, 150, 0, 0]);
    expect(r.total).toBe(183);
  });

  it("breaks the figure down by border post", () => {
    const reports = derive({ week: Q2, dailyEntries: entries });
    expect(row(reports, "1.3.12").breakdown).toEqual([
      { label: "Chirundu", week: 100, total: 100 },
      { label: "Kasumbalesa", week: 50, total: 50 },
      { label: "Head office / other", week: 0, total: 33 },
    ]);
  });
});

describe("% achieved and status", () => {
  it("measures the total against the target", () => {
    expect(percentAchieved(136, 500)).toBeCloseTo(27.2);
    expect(formatPercent(percentAchieved(136, 500))).toBe("27.2%");
    expect(formatPercent(percentAchieved(61, 50))).toBe("122%");
    // No numeric target — nothing to measure against.
    expect(percentAchieved(4, null)).toBeNull();
    expect(formatPercent(null)).toBe("—");
  });

  it("derives a status from the figures", () => {
    expect(deriveStatus(0, 12)).toBe("Not Started");
    expect(deriveStatus(3, 12)).toBe("In Progress");
    expect(deriveStatus(12, 12)).toBe("Achieved");
    expect(deriveStatus(61, 50)).toBe("Achieved");
    expect(deriveStatus(2, null)).toBe("In Progress");
  });

  it("lets an officer override the status, comments and action points", () => {
    const reports = derive({
      week: Q2,
      notes: {
        "1.1.8": {
          id: "1.1.8",
          status: "On Hold",
          comments: "Awaiting procurement.",
          actionPoints: "Follow up with ICT by month end.",
        },
      },
    });
    const r = row(reports, "1.1.8");
    expect(r.derivedStatus).toBe("Not Started");
    expect(r.status).toBe("On Hold");
    expect(r.statusOverridden).toBe(true);
    expect(r.comments).toBe("Awaiting procurement.");
    expect(r.actionPoints).toBe("Follow up with ICT by month end.");

    // Untouched outputs stay on the derived status.
    expect(row(reports, "1.1.7").statusOverridden).toBe(false);
  });
});

describe("exports", () => {
  it("emits the workbook's columns, one line per output", () => {
    const reports = derive({
      week: Q2,
      events: [ev("Importation Licence", Q2, "2026-05-26", 1)],
    });
    const rows = workPlanRows(reports);
    expect(rows).toHaveLength(WORK_PLAN_OUTPUTS.length);
    const licences = rows.find((r) => r[1] === "1.1.4")!;
    expect(licences.slice(0, 6)).toEqual([
      "Subprogramme 1.1 — Authorisation and Standards",
      "1.1.4",
      "Issuance of Ionising Radiation Licences",
      "Number Licenses issued",
      "500",
      "1",
    ]);
    // Q1..Q4, total, %, status
    expect(licences.slice(6, 13)).toEqual([
      "0",
      "1",
      "0",
      "0",
      "1",
      "0.2",
      "In Progress",
    ]);
    // A "-" target exports as the workbook writes it, with no percentage.
    const noTarget = rows.find((r) => r[1] === "1.3.11")!;
    expect(noTarget[4]).toBe("-");
    expect(noTarget[11]).toBe("");
  });

  it("writes a brief the meeting can read", () => {
    const brief = workPlanBrief(derive({ week: Q2 }), Q2);
    expect(brief).toContain("RPA Sectional Update — " + Q2);
    expect(brief).toContain("Subprogramme 1.2 — Nuclear & Radiation Safety Inspections");
    expect(brief).toContain("1.2.11");
  });
});

describe("opening balance — the plan is cumulative for the year", () => {
  it("ships the three sections' cumulative actuals from SUB_PROGRAMS_1.xlsx", () => {
    // The figures the sections' work plan sheets show. Changing them silently
    // re-states every report, so they are pinned here.
    // 1.1.x — Authorisation & Standards; 1.1.4 is its 357 licences by quarter.
    expect(WORK_PLAN_OPENING_BALANCE["1.1.1"]).toEqual([3, 3, 0, 0]);
    expect(WORK_PLAN_OPENING_BALANCE["1.1.4"]).toEqual([152, 125, 80, 0]);
    expect(WORK_PLAN_OPENING_BALANCE["1.1.6"]).toEqual([1, 3, 0, 0]);
    // 1.2.x — the Inspectorate's Subprogram 1.2 sheet, unchanged this update.
    expect(WORK_PLAN_OPENING_BALANCE["1.2.4"]).toEqual([40, 123, 121, 0]);
    expect(WORK_PLAN_OPENING_BALANCE["1.2.6"]).toEqual([8, 8, 7, 0]);
    expect(WORK_PLAN_OPENING_BALANCE["1.2.11"]).toEqual([45, 61, 87, 0]);
    // 1.3.x — Nuclear Safety, Security & Safeguards.
    expect(WORK_PLAN_OPENING_BALANCE["1.3.5"]).toEqual([0, 9, 1, 0]);
    expect(WORK_PLAN_OPENING_BALANCE["1.3.7"]).toEqual([0, 0, 100, 0]);
    expect(WORK_PLAN_OPENING_BALANCE["1.3.9"]).toEqual([0, 0, 65, 0]);
    expect(WORK_PLAN_OPENING_BALANCE["1.3.10"]).toEqual([0, 5, 2, 0]);
    expect(WORK_PLAN_OPENING_BALANCE["1.3.13"]).toEqual([0, 0, 26, 0]);
  });

  it("carries in only the screening days the daily log does not hold", () => {
    // The inland offices' log is seeded as daily entries and counted directly,
    // so carrying the workbook's whole 341,009 would count 331,177 of them
    // twice. Only the gap — the late-August days the log has yet to reach — is
    // carried in, which brings the row to the workbook's figure exactly.
    expect(WORK_PLAN_OPENING_BALANCE["1.3.12"]).toEqual([0, 0, 9832, 0]);
    const carried = WORK_PLAN_OPENING_BALANCE["1.3.12"].reduce(
      (a, b) => a + b,
      0,
    );
    expect(carried + 331177).toBe(341009);
  });

  it("adds what the system records on top of what was carried in", () => {
    const reports = deriveWorkPlan({
      weeks: WEEKS,
      week: Q2,
      events: [
        ev("Importation Licence", Q2, "2026-05-26", 1),
        ev("Importation Licence", Q2, "2026-05-27", 2),
        ev("Export Licence", Q3, "2026-07-21", 3),
      ],
      inspections: [],
      valuesByWeek: new Map(),
      // No saved baseline — the workbook's figures apply.
      baseline: null,
    });
    const r = row(reports, "1.1.4");
    expect(r.opening).toEqual([152, 125, 80, 0]);
    expect(r.recorded).toEqual([0, 2, 1, 0]);
    expect(r.quarters).toEqual([152, 127, 81, 0]);
    expect(r.openingTotal).toBe(357);
    expect(r.recordedTotal).toBe(3);
    expect(r.total).toBe(360);
    // The week column stays the week's own work — it is not cumulative.
    expect(r.week).toBe(2);
  });

  it("measures % achieved and status on the cumulative total", () => {
    const reports = deriveWorkPlan({
      weeks: WEEKS,
      week: Q2,
      events: [],
      inspections: [],
      valuesByWeek: new Map(),
      baseline: null,
    });
    // 193 enforcement actions carried in against a target of 50.
    const enforcement = row(reports, "1.2.11");
    expect(enforcement.total).toBe(193);
    expect(formatPercent(enforcement.percent)).toBe("386%");
    expect(enforcement.status).toBe("Achieved");
    // Nothing carried in and nothing recorded stays Not Started.
    expect(row(reports, "1.1.8").total).toBe(0);
    expect(row(reports, "1.1.8").status).toBe("Not Started");
  });

  it("lets a saved baseline replace the workbook figures outright", () => {
    const reports = deriveWorkPlan({
      weeks: WEEKS,
      week: Q2,
      events: [],
      inspections: [],
      valuesByWeek: new Map(),
      baseline: { "1.1.4": [10, 20, 0, 0] },
    });
    expect(row(reports, "1.1.4").quarters).toEqual([10, 20, 0, 0]);
    // Outputs the saved baseline omits are zero, not the workbook's figure —
    // otherwise an output an officer cleared would quietly come back.
    expect(row(reports, "1.2.4").quarters).toEqual([0, 0, 0, 0]);
  });

  it("counts only what the system holds when the baseline is cleared", () => {
    const reports = derive({
      week: Q2,
      baseline: {},
      inspections: [insp("Routine Inspection", Q2, "2026-05-26", 1)],
    });
    expect(row(reports, "1.2.4").total).toBe(1);
    expect(row(reports, "1.2.4").openingTotal).toBe(0);
  });

  it("normalises whatever is stored into four whole, non-negative quarters", () => {
    expect(normaliseQuarters([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4]);
    expect(normaliseQuarters([2.7, -3, undefined, "8"])).toEqual([2, 0, 0, 8]);
    expect(normaliseQuarters(undefined)).toEqual([0, 0, 0, 0]);
  });

  it("gives every output a balance, saved or not", () => {
    const fromWorkbook = effectiveOpeningBalance(null);
    const cleared = effectiveOpeningBalance({});
    for (const o of WORK_PLAN_OUTPUTS) {
      expect(fromWorkbook[o.id]).toHaveLength(4);
      expect(cleared[o.id]).toEqual([0, 0, 0, 0]);
    }
  });

  it("reports the split in the exported sheet and brief", () => {
    const reports = deriveWorkPlan({
      weeks: WEEKS,
      week: Q2,
      events: [ev("Importation Licence", Q2, "2026-05-26", 1)],
      inspections: [],
      valuesByWeek: new Map(),
      baseline: null,
    });
    const line = workPlanRows(reports).find((r) => r[1] === "1.1.4")!;
    expect(line[10]).toBe("358"); // Total Actual
    expect(line[15]).toBe("357"); // Opening Balance
    expect(line[16]).toBe("1"); // Recorded in System
    expect(workPlanBrief(reports, Q2)).toContain(
      "[opening balance 357, recorded since 1]",
    );
  });
});

describe("pasting opening figures from the work plan spreadsheet", () => {
  it("reads a row copied straight out of the workbook", () => {
    const pasted = [
      "1.2.4\tRoutine, follow-up, pre-authorization & investigative inspections\tNumber of inspections\t500\t40\t96\t\t\t136\t27.2\tPending",
      "1.3.12\tMonitoring of illicit trafficking (ZRA Asycuda)\tNumber of screened vehicles\t350000\t138155\t239650\t\t\t377805\t107.9\tPending",
    ].join("\n");
    const { values, matched, skipped } = parseOpeningBalance(pasted);
    expect(matched).toEqual(["1.2.4", "1.3.12"]);
    expect(skipped).toEqual([]);
    expect(values["1.2.4"]).toEqual([40, 96, 0, 0]);
    expect(values["1.3.12"]).toEqual([138155, 239650, 0, 0]);
  });

  it("reads a loose id-then-numbers line, thousands separators and all", () => {
    const { values, matched } = parseOpeningBalance(
      "1.1.4 0 125 0 0\n1.3.12: 138,155 239,650",
    );
    expect(matched).toEqual(["1.1.4", "1.3.12"]);
    expect(values["1.1.4"]).toEqual([0, 125, 0, 0]);
    expect(values["1.3.12"]).toEqual([138155, 239650, 0, 0]);
  });

  it("skips lines with no output id rather than guessing", () => {
    const { matched, skipped } = parseOpeningBalance(
      "Output ID\tOutput Description\n1.1.1 0 3\n9.9.9 5\n\nsome prose",
    );
    expect(matched).toEqual(["1.1.1"]);
    // The header, the id that is not on the plan, and the prose.
    expect(skipped).toHaveLength(3);
  });
});

describe("planForSections — the part of the plan a section is shown", () => {
  it("keeps only the outputs the sections report, and drops emptied subprogrammes", () => {
    const nsss = "Nuclear Safety, Security & Safeguards" as const;
    const own = planForSections(WORK_PLAN, [nsss]);
    expect(own.length).toBeGreaterThan(0);
    expect(own.length).toBeLessThan(WORK_PLAN.length);
    for (const sub of own) {
      expect(sub.outputs.length).toBeGreaterThan(0);
      for (const o of sub.outputs) expect(o.section).toBe(nsss);
    }
    // Vehicle screening is the section's headline output, so it must survive.
    expect(own.flatMap((s) => s.outputs).some((o) => o.id === "1.3.12")).toBe(true);
  });

  it("hands the department the whole plan, untouched", () => {
    const all = planForSections(WORK_PLAN, [
      "Authorisation & Standards",
      "Inspectorate",
      "Nuclear Safety, Security & Safeguards",
      "National Source Inventory",
    ]);
    expect(all.map((s) => s.outputs.length)).toEqual(
      WORK_PLAN.map((s) => s.outputs.length),
    );
  });
});
