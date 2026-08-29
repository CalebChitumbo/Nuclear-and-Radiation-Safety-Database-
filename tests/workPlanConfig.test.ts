import { beforeEach, describe, expect, it } from "vitest";

import {
  applyWorkPlanConfig,
  compareOutputIds,
  deriveWorkPlan,
  describeBinding,
  effectiveOpeningBalance,
  findOutput,
  isValidOutputId,
  metricKeysForOutput,
  nextOutputId,
  outputMetricKey,
  planOutputs,
  resolveSource,
  retiredOutputs,
  sameBinding,
  validateOutputEdit,
  WORK_PLAN,
  WORK_PLAN_OUTPUTS,
  type Subprogramme,
  type SubprogrammeReport,
  type WorkPlanRow,
} from "../lib/rules/workPlan";
import { dailyMetricOptions } from "../lib/rules/daily";
import { mockStore, resetMockStore } from "../lib/store/mockStore";
import type {
  Inspection,
  LicenceEvent,
  WeekDef,
  WorkPlanConfig,
  WorkPlanNote,
} from "../lib/rules/types";
import weeksSeed from "../seed/weeks-2026.seed.json";

const WEEKS = weeksSeed as WeekDef[];
const Q2 = WEEKS.find((w) => w.label.startsWith("W22"))!.label;

const ev = (
  type: LicenceEvent["type"],
  date = "2026-05-26",
  i = 1,
): LicenceEvent => ({
  id: `e${i}-${type}`,
  date,
  week: Q2,
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
  i = 1,
  enforcement?: string,
): Inspection => ({
  id: `i${i}-${type}-${enforcement || ""}`,
  date: "2026-05-26",
  week: Q2,
  facilityId: "f",
  facilityName: "F",
  type,
  outcome: "Compliant",
  province: "Lusaka",
  sector: "Private",
  notes: "",
  ...(enforcement ? { enforcement } : {}),
});

interface Input {
  config?: WorkPlanConfig | null;
  events?: LicenceEvent[];
  inspections?: Inspection[];
  values?: Array<[string, Record<string, number>]>;
  notes?: Record<string, WorkPlanNote>;
  baseline?: Record<string, number[]> | null;
}

function derive(input: Input = {}): SubprogrammeReport[] {
  return deriveWorkPlan({
    plan: applyWorkPlanConfig(input.config),
    weeks: WEEKS,
    week: Q2,
    events: input.events || [],
    inspections: input.inspections || [],
    valuesByWeek: new Map(input.values || []),
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

function ids(plan: Subprogramme[], subId: string): string[] {
  return planOutputs(plan)
    .filter((o) => o.id.startsWith(`${subId}.`))
    .map((o) => o.id);
}

// ---------------------------------------------------------------------------

describe("numbering", () => {
  it("numbers a supporting figure under the output it is the detail of", () => {
    // The National Source Inventory's field figures are what output 1.2.9 —
    // the inventory exercise — is made of, so they read as 1.2.9.1 … and not
    // as siblings of the Inspectorate's own supporting figure.
    const nsi = WORK_PLAN_OUTPUTS.filter((o) => o.parentId === "1.2.9");
    expect(nsi.map((o) => o.id)).toEqual([
      "1.2.9.1",
      "1.2.9.2",
      "1.2.9.3",
      "1.2.9.4",
      "1.2.9.5",
    ]);
    expect(nsi.every((o) => o.supporting)).toBe(true);
    expect(nsi[0].description).toContain("Facilities visited");
  });

  it("still answers to the numbers those figures used to carry", () => {
    // Renumbering must never orphan what is already stored against a row.
    expect(findOutput("1.2.S2")?.id).toBe("1.2.9.1");
    expect(findOutput("1.2.S6")?.id).toBe("1.2.9.5");
  });

  it("keeps a subprogramme-wide supporting figure on the subprogramme", () => {
    expect(findOutput("1.1.S1")?.parentId).toBeUndefined();
    expect(findOutput("1.2.S1")?.section).toBe("Inspectorate");
  });

  it("sorts the way a reader reads the workbook", () => {
    const sorted = ["1.1.10", "1.1.2", "1.2.9.1", "1.2.10", "1.2.9", "1.2.S1"];
    sorted.sort(compareOutputIds);
    expect(sorted).toEqual([
      "1.1.2",
      "1.1.10",
      "1.2.9",
      "1.2.9.1",
      "1.2.10",
      "1.2.S1",
    ]);
  });

  it("gives every row of the shipped plan a well-formed, unique number", () => {
    const all = WORK_PLAN_OUTPUTS.map((o) => o.id);
    expect(all.filter((id) => !isValidOutputId(id))).toEqual([]);
    expect(new Set(all).size).toBe(all.length);
    // Including the numbers rows used to carry — a new row must not take one.
    const withHistory = WORK_PLAN_OUTPUTS.flatMap((o) => [
      o.id,
      ...(o.previousIds || []),
    ]);
    expect(new Set(withHistory).size).toBe(withHistory.length);
  });

  it("numbers a new row itself, never reusing a number", () => {
    expect(nextOutputId(WORK_PLAN, { subprogramme: "1.1" })).toBe("1.1.11");
    expect(nextOutputId(WORK_PLAN, { subprogramme: "1.2" })).toBe("1.2.12");
    expect(
      nextOutputId(WORK_PLAN, { subprogramme: "1.1", supporting: true }),
    ).toBe("1.1.S3");
    expect(
      nextOutputId(WORK_PLAN, {
        subprogramme: "1.2",
        supporting: true,
        parentId: "1.2.9",
      }),
    ).toBe("1.2.9.6");
    // 1.2.S2 … 1.2.S6 are taken by history, so the next free one is S7.
    expect(
      nextOutputId(WORK_PLAN, { subprogramme: "1.2", supporting: true }),
    ).toBe("1.2.S7");
  });
});

describe("where a figure comes from", () => {
  it("resolves each link to what it counts", () => {
    const licences = resolveSource({ kind: "licences" });
    expect(licences.kind).toBe("licences");
    expect((licences as { match?: unknown }).match).toBeUndefined();

    const some = resolveSource({
      kind: "licences",
      types: ["Importation Licence"],
    });
    const match = (some as { match: (t: string) => boolean }).match;
    expect(match("Importation Licence")).toBe(true);
    expect(match("Export Licence")).toBe(false);

    const visits = resolveSource({ kind: "inspections" });
    const visited = (visits as { match: (i: Inspection) => boolean }).match;
    expect(visited(insp("Routine Inspection"))).toBe(true);
    // A bare enforcement action is output 1.2.11's, not 1.2.4's.
    expect(visited(insp("Enforcement Action"))).toBe(false);

    const enf = resolveSource({ kind: "enforcement" });
    const enforced = (enf as { match: (i: Inspection) => boolean }).match;
    expect(enforced(insp("Routine Inspection", 1, "Seizure of Sources"))).toBe(
      true,
    );
    expect(enforced(insp("Routine Inspection"))).toBe(false);
  });

  it("keeps the shipped rows pointed where they always were", () => {
    expect(findOutput("1.1.4")!.binding).toEqual({ kind: "licences" });
    expect(findOutput("1.2.4")!.binding).toEqual({ kind: "inspections" });
    expect(findOutput("1.2.11")!.binding).toEqual({ kind: "enforcement" });
    expect(findOutput("1.3.12")!.binding).toMatchObject({
      kind: "manual",
      splitByBorder: true,
    });
  });

  it("tells an officer in words what a row counts", () => {
    expect(describeBinding({ kind: "licences" })).toContain("licensing register");
    expect(describeBinding({ kind: "enforcement" })).toContain("enforcement");
    expect(describeBinding({ kind: "manual", key: "x" })).toContain("Daily Updates");
  });

  it("spots a row that has been re-pointed", () => {
    expect(sameBinding({ kind: "licences" }, { kind: "licences" })).toBe(true);
    expect(
      sameBinding(
        { kind: "licences", types: ["Export Licence", "Transit Licence"] },
        { kind: "licences", types: ["Transit Licence", "Export Licence"] },
      ),
    ).toBe(true);
    expect(sameBinding({ kind: "licences" }, { kind: "enforcement" })).toBe(false);
    expect(
      sameBinding({ kind: "manual", key: "a" }, { kind: "manual", key: "b" }),
    ).toBe(false);
  });
});

describe("editing the plan", () => {
  it("reports the approved plan when nothing has been changed", () => {
    expect(applyWorkPlanConfig(null)).toEqual(WORK_PLAN);
    expect(applyWorkPlanConfig({ year: 2026, outputs: {} })).toEqual(WORK_PLAN);
  });

  it("takes a revised target through to % achieved", () => {
    const config: WorkPlanConfig = {
      year: 2026,
      outputs: { "1.1.4": { target: 200 } },
    };
    const r = row(derive({ config, events: [ev("Export Licence")] }), "1.1.4");
    expect(r.output.target).toBe(200);
    expect(r.total).toBe(1);
    expect(r.percent).toBeCloseTo(0.5);
    expect(r.output.customised).toBe(true);
  });

  it("keeps every other column of a row it did not touch", () => {
    const plan = applyWorkPlanConfig({
      year: 2026,
      outputs: { "1.2.4": { target: 600 } },
    });
    const edited = findOutput("1.2.4", plan)!;
    const approved = findOutput("1.2.4")!;
    expect(edited.description).toBe(approved.description);
    expect(edited.indicator).toBe(approved.indicator);
    expect(edited.binding).toEqual(approved.binding);
  });

  it("rewords a row without moving its figures", () => {
    const config: WorkPlanConfig = {
      year: 2026,
      outputs: {
        "1.1.1": {
          description: "Development of Safety Guides (revised wording)",
          indicator: "Guides issued",
        },
      },
    };
    const key = outputMetricKey("1.1.1");
    const r = row(
      derive({ config, values: [[Q2, { [key]: 3 }]] }),
      "1.1.1",
    );
    expect(r.output.description).toContain("revised wording");
    expect(r.week).toBe(3);
    expect(r.total).toBe(3);
  });

  it("re-points a typed row at a register, and it counts itself", () => {
    // The ask behind this: a row somebody was retyping should be able to read
    // the licensing register instead, with nothing copied by hand.
    const config: WorkPlanConfig = {
      year: 2026,
      outputs: {
        "1.1.6": {
          binding: { kind: "licences", types: ["Importation Licence"] },
        },
      },
    };
    const reports = derive({
      config,
      events: [
        ev("Importation Licence", "2026-05-26", 1),
        ev("Importation Licence", "2026-05-27", 2),
        ev("Export Licence", "2026-05-27", 3),
      ],
    });
    const r = row(reports, "1.1.6");
    expect(r.auto).toBe(true);
    expect(r.week).toBe(2);
    expect(r.total).toBe(2);
    expect(r.breakdown.some((b) => b.label === "Importation Licences")).toBe(
      true,
    );
  });

  it("points two rows at one figure so neither is retyped", () => {
    const shared = outputMetricKey("1.3.13");
    const config: WorkPlanConfig = {
      year: 2026,
      outputs: { "1.1.6": { binding: { kind: "manual", key: shared } } },
    };
    const reports = derive({ config, values: [[Q2, { [shared]: 4 }]] });
    expect(row(reports, "1.1.6").week).toBe(4);
    expect(row(reports, "1.3.13").week).toBe(4);
  });

  it("adds a row a section keeps for itself, in its numbered place", () => {
    const id = nextOutputId(WORK_PLAN, { subprogramme: "1.1" });
    const config: WorkPlanConfig = {
      year: 2026,
      outputs: {
        [id]: {
          added: true,
          subprogramme: "1.1",
          description: "Public enquiries answered",
          indicator: "Number of enquiries",
          target: 100,
          section: "Authorisation & Standards",
        },
      },
    };
    const plan = applyWorkPlanConfig(config);
    expect(ids(plan, "1.1")).toContain(id);
    // Numbered 1.1.11, so it lands after 1.1.10 and before the S rows.
    expect(ids(plan, "1.1").indexOf(id)).toBe(
      ids(plan, "1.1").indexOf("1.1.10") + 1,
    );
    const r = row(
      derive({ config, values: [[Q2, { [outputMetricKey(id)]: 7 }]] }),
      id,
    );
    expect(r.output.added).toBe(true);
    expect(r.week).toBe(7);
    expect(r.percent).toBeCloseTo(7);
    // And it is loggable on Daily Updates the same day.
    expect(
      dailyMetricOptions("Authorisation & Standards", plan).some(
        (o) => o.outputId === id,
      ),
    ).toBe(true);
  });

  it("retires a row without losing it, and puts it back", () => {
    const config: WorkPlanConfig = {
      year: 2026,
      outputs: { "1.1.7": { hidden: true } },
    };
    const plan = applyWorkPlanConfig(config);
    expect(findOutput("1.1.7", plan)).toBeNull();
    expect(retiredOutputs(config).map((o) => o.id)).toEqual(["1.1.7"]);
    // Clearing the entry is the undo.
    expect(findOutput("1.1.7", applyWorkPlanConfig({ year: 2026 }))).not.toBeNull();
  });

  it("keeps an added row's definition when it is retired, so it can come back", () => {
    // Retiring must MERGE onto the row's entry, never replace it: an added row
    // whose entry was overwritten with { hidden: true } alone would have
    // nothing left to restore.
    const added = {
      added: true,
      subprogramme: "1.1",
      description: "Public enquiries answered",
      indicator: "Number of enquiries",
      target: 120,
    };
    const retired: WorkPlanConfig = {
      year: 2026,
      outputs: { "1.1.11": { ...added, hidden: true } },
    };
    expect(findOutput("1.1.11", applyWorkPlanConfig(retired))).toBeNull();
    expect(retiredOutputs(retired).map((o) => o.description)).toEqual([
      "Public enquiries answered",
    ]);

    const back = applyWorkPlanConfig({
      year: 2026,
      outputs: { "1.1.11": added },
    });
    expect(findOutput("1.1.11", back)?.target).toBe(120);
  });

  it("renames a subprogramme heading", () => {
    const plan = applyWorkPlanConfig({
      year: 2026,
      subprogrammes: { "1.1": { title: "Authorisation, Standards & Guidance" } },
    });
    expect(plan[0].heading).toBe(
      "Subprogramme 1.1 — Authorisation, Standards & Guidance",
    );
    expect(plan[0].customised).toBe(true);
    // The rows underneath are untouched.
    expect(plan[0].outputs).toHaveLength(WORK_PLAN[0].outputs.length);
  });

  it("carries a renumbered row's saved notes and opening balance across", () => {
    const reports = derive({
      // Saved when the row was still numbered 1.2.S2.
      notes: {
        "1.2.S2": { id: "1.2.S2", comments: "Chirundu and Kasumbalesa done." },
      },
      baseline: { "1.2.S2": [3, 0, 0, 0] },
    });
    const r = row(reports, "1.2.9.1");
    expect(r.comments).toBe("Chirundu and Kasumbalesa done.");
    expect(r.openingTotal).toBe(3);
  });

  it("gives every row of an edited plan an opening balance", () => {
    const plan = applyWorkPlanConfig({
      year: 2026,
      outputs: {
        "1.1.11": {
          added: true,
          subprogramme: "1.1",
          description: "New row",
          indicator: "Number",
        },
      },
    });
    const balance = effectiveOpeningBalance(null, plan);
    for (const o of planOutputs(plan)) {
      expect(balance[o.id]).toHaveLength(4);
    }
  });

  it("keeps a manual row's figures on its own key when it is added", () => {
    const plan = applyWorkPlanConfig({
      year: 2026,
      outputs: {
        "1.3.15": {
          added: true,
          subprogramme: "1.3",
          description: "Detector calibrations",
          indicator: "Number",
        },
      },
    });
    expect(metricKeysForOutput(findOutput("1.3.15", plan)!)).toEqual([
      outputMetricKey("1.3.15"),
    ]);
  });
});

describe("what a saved row has to satisfy", () => {
  it("refuses a number that is not a work plan number", () => {
    expect(validateOutputEdit(WORK_PLAN, "banana", {})).toContain(
      "not a work plan number",
    );
    expect(validateOutputEdit(WORK_PLAN, "1.2.4", {})).toBeNull();
  });

  it("refuses a number another row already answers to", () => {
    expect(
      validateOutputEdit(WORK_PLAN, "1.2.4", {}, { added: true }),
    ).toContain("already exists");
    expect(
      validateOutputEdit(WORK_PLAN, "1.2.12", {}, { added: true }),
    ).toBeNull();
  });

  it("refuses an empty description, a negative target, or a missing parent", () => {
    expect(validateOutputEdit(WORK_PLAN, "1.2.4", { description: " " })).toContain(
      "description",
    );
    expect(validateOutputEdit(WORK_PLAN, "1.2.4", { target: -5 })).toContain(
      "zero or more",
    );
    expect(
      validateOutputEdit(WORK_PLAN, "1.2.4", { parentId: "9.9.9" }),
    ).toContain("no output 9.9.9");
    // A blank target is the workbook's "-", not a mistake.
    expect(validateOutputEdit(WORK_PLAN, "1.2.4", { target: null })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The persistence seam: what the report actually saves and reads back.
// ---------------------------------------------------------------------------

describe("mock store — saving changes to the plan", () => {
  beforeEach(() => resetMockStore());

  it("saves one row at a time, and clearing it is the undo", async () => {
    expect(await mockStore.getWorkPlanConfig(2026)).toBeNull();

    await mockStore.setWorkPlanOutputConfig(
      2026,
      "1.1.4",
      { target: 400 },
      "u-as",
    );
    await mockStore.setWorkPlanOutputConfig(
      2026,
      "1.2.4",
      { description: "Inspections of licensed facilities" },
      "u-insp",
    );

    let config = await mockStore.getWorkPlanConfig(2026);
    // Two sections editing their own rows: neither loses the other's change.
    expect(config?.outputs?.["1.1.4"]?.target).toBe(400);
    expect(config?.outputs?.["1.1.4"]?.updatedBy).toBe("u-as");
    expect(config?.outputs?.["1.2.4"]?.description).toContain("licensed");

    const plan = applyWorkPlanConfig(config);
    expect(findOutput("1.1.4", plan)?.target).toBe(400);

    await mockStore.setWorkPlanOutputConfig(2026, "1.1.4", null, "u-as");
    config = await mockStore.getWorkPlanConfig(2026);
    expect(config?.outputs?.["1.1.4"]).toBeUndefined();
    expect(config?.outputs?.["1.2.4"]).toBeDefined();
    expect(findOutput("1.1.4", applyWorkPlanConfig(config))?.target).toBe(500);
  });

  it("hands the whole year back to the approved plan on reset", async () => {
    await mockStore.setWorkPlanOutputConfig(
      2026,
      "1.3.12",
      { target: 1 },
      "u-nsss",
    );
    await mockStore.setWorkPlanSubprogrammeConfig(
      2026,
      "1.3",
      { title: "Nuclear Security" },
      "u-admin",
    );
    await mockStore.resetWorkPlanConfig(2026, "u-admin");

    const config = await mockStore.getWorkPlanConfig(2026);
    expect(config?.outputs).toEqual({});
    expect(config?.subprogrammes).toEqual({});
    expect(applyWorkPlanConfig(config)).toEqual(WORK_PLAN);
  });

  it("carries the changes into the export", async () => {
    await mockStore.setWorkPlanOutputConfig(
      2026,
      "1.1.4",
      { target: 400 },
      "u-as",
    );
    const dump = await mockStore.exportAll();
    expect(dump.workPlanConfig?.outputs?.["1.1.4"]?.target).toBe(400);
  });
});
