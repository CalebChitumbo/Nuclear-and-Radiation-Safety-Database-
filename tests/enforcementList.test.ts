import { describe, expect, it } from "vitest";

import {
  buildInspectionDatabase,
  summariseInspectionDatabase,
} from "../lib/rules/inspectionDatabase";
import { norm } from "../lib/rules/matching";
import {
  WORK_PLAN_OPENING_BALANCE,
  deriveWorkPlan,
  isInspectionVisit,
  type SubprogrammeReport,
} from "../lib/rules/workPlan";
import {
  ENFORCEMENT_LIST_ACTION,
  ENFORCEMENT_LIST_ID_PREFIX,
  mapAllSeed,
  mapAllSeedInspections,
  mergeSeededInspection,
  supersededByRegister,
  type SeedEnforcement,
  type SeedFacility,
  type SeedInspection,
} from "../lib/store/seeding";
import type { Inspection, WeekDef } from "../lib/rules/types";
import enforcementSeed from "../seed/enforcement-2026.seed.json";
import facilitiesSeed from "../seed/facilities.seed.json";
import registerSeed from "../seed/inspections-2026.seed.json";
import weeksSeed from "../seed/weeks-2026.seed.json";

/**
 * The Inspectorate & Enforcement Division's 2026 enforcement list, handed over
 * on 28 Sep 2026 and laid on the inspection register. See
 * docs/enforcement-list-2026-import.md; the figures pinned here are that
 * document's own.
 */
const LIST = enforcementSeed as SeedEnforcement[];
const ROWS = registerSeed as SeedInspection[];
const WEEKS = weeksSeed as WeekDef[];
const FACILITIES = mapAllSeed(facilitiesSeed as SeedFacility[]);
const { inspections, enforcement } = mapAllSeedInspections(
  ROWS,
  FACILITIES,
  WEEKS,
  LIST,
);

/** The document's numbered rows. */
const LIST_ROWS = 116;
/** Rows whose action is recorded on the register inspection it came out of. */
const ON_REGISTER = 99;
/** Rows the register has no inspection for, recorded as actions of their own. */
const OWN_RECORDS = 17;
/** Actions that carry a date — all of them through their register inspection. */
const DATED = 37;

/** Words of four letters or more — enough to tie a loose spelling to its row. */
function words(s: string): Set<string> {
  return new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
}

describe("the 2026 enforcement list", () => {
  it("holds every numbered row of the document once", () => {
    expect(LIST).toHaveLength(LIST_ROWS);
    expect(LIST.map((r) => r.n)).toEqual(
      Array.from({ length: LIST_ROWS }, (_, i) => i + 1),
    );
  });

  it("points each register row at an inspection that names the same facility", () => {
    const byRow = new Map(ROWS.map((r) => [r.n, r]));
    for (const row of LIST.filter((r) => r.register !== undefined)) {
      const target = byRow.get(row.register!);
      expect(target, `row ${row.n}`).toBeDefined();
      const shared = [...words(row.name)].some((w) => words(target!.name).has(w));
      expect(
        norm(row.name) === norm(target!.name) || shared,
        `row ${row.n} "${row.name}" → register ${row.register} "${target!.name}"`,
      ).toBe(true);
    }
  });

  it("never records two actions on one register inspection", () => {
    const refs = LIST.flatMap((r) => (r.register !== undefined ? [r.register] : []));
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("applies every row — on the register or as an action of its own", () => {
    expect(enforcement.skipped).toEqual([]);
    expect(enforcement.stamped).toBe(ON_REGISTER);
    expect(enforcement.recorded).toBe(OWN_RECORDS);
    expect(ON_REGISTER + OWN_RECORDS).toBe(LIST_ROWS);
  });

  it("records every action as a Written Notice, as the section instructed", () => {
    const enforced = inspections.filter((i) => i.enforcement);
    expect(enforced).toHaveLength(LIST_ROWS);
    expect(ENFORCEMENT_LIST_ACTION).toBe("Written Warning");
    expect(new Set(enforced.map((i) => i.enforcement))).toEqual(
      new Set(["Written Warning"]),
    );
    // Written Notice is one of the summary's six columns, so all 116 count
    // toward its Total Enforcements over the whole register.
    const summary = summariseInspectionDatabase(
      buildInspectionDatabase(inspections, FACILITIES, { today: "2026-09-28" }),
    );
    expect(summary.total.enforcementTotal).toBe(LIST_ROWS);
  });

  it("keeps the register's own count of inspections", () => {
    // An action with no register inspection is not a visit — 1.2.4 does not
    // count it, and the register's 297 inspections are still 297.
    const own = inspections.filter((i) => i.id.startsWith(ENFORCEMENT_LIST_ID_PREFIX));
    expect(own).toHaveLength(OWN_RECORDS);
    for (const i of own) expect(i.type).toBe("Enforcement Action");
    expect(inspections.filter((i) => isInspectionVisit(i.type))).toHaveLength(297);
  });

  it("links the list's own actions to the facilities they name", () => {
    const own = inspections.filter((i) => i.id.startsWith(ENFORCEMENT_LIST_ID_PREFIX));
    const unlinked = own.filter((i) => !i.facilityId).map((i) => i.facilityName);
    // Names the facility register does not hold: an officer can attach them.
    expect(unlinked.sort()).toEqual(["SES", "Shachitari construction", "Zongmai"]);
    expect(
      own.find((i) => i.facilityName === "Our Ladys Hospice")?.facilityId,
    ).toBeTruthy();
  });

  it("is never taken for a typed duplicate of the register", () => {
    expect(supersededByRegister(`${ENFORCEMENT_LIST_ID_PREFIX}ses-1`, "2026-03-01")).toBe(
      false,
    );
  });

  it("keeps output 1.2.11 at the section's 193 — the list is inside it", () => {
    const dated = inspections.filter((i) => i.enforcement && i.date);
    expect(dated).toHaveLength(DATED);

    const opening = WORK_PLAN_OPENING_BALANCE["1.2.11"];
    expect(opening.reduce((a, b) => a + b, 0) + DATED).toBe(193);

    const reports: SubprogrammeReport[] = deriveWorkPlan({
      weeks: WEEKS,
      week: WEEKS[0].label,
      events: [],
      inspections,
      valuesByWeek: new Map(),
    });
    const row = reports
      .flatMap((r) => [...r.rows, ...r.supporting])
      .find((r) => r.output.id === "1.2.11");
    expect(row?.total).toBe(193);
    // The section's own quarterly split is unchanged.
    expect(row?.quarters).toEqual([45, 61, 87, 0]);
  });
});

describe("re-seeding a register inspection an officer has worked on", () => {
  const seeded: Inspection = {
    id: "reg2026-x-routine-inspection-1",
    date: "",
    week: "",
    facilityId: "fac-1",
    facilityName: "X Hospital",
    type: "Routine Inspection",
    outcome: "N/A",
    province: "Lusaka",
    sector: "",
    notes: "Row 1 of the register.",
    enforcement: "Written Warning",
    updatedBy: "seed",
  };

  it("writes the seed over a document only the seed has written", () => {
    const { id: _id, ...doc } = seeded;
    void _id;
    expect(mergeSeededInspection(seeded, undefined)).toBe(seeded);
    expect(mergeSeededInspection(seeded, doc)).toBe(seeded);
  });

  it("keeps the officer's card, action, day and notes", () => {
    const merged = mergeSeededInspection(seeded, {
      ...seeded,
      date: "2026-05-12",
      week: "W20",
      outcome: "Major findings",
      notes: "Card re-issued at the visit.",
      enforcement: "Seizure of Device",
      cardIssued: "2026-05-12",
      updatedBy: "officer-uid",
      updatedAt: "2026-09-28T08:00:00.000Z",
    });
    expect(merged).toMatchObject({
      id: seeded.id,
      facilityId: "fac-1",
      date: "2026-05-12",
      week: "W20",
      outcome: "Major findings",
      notes: "Card re-issued at the visit.",
      enforcement: "Seizure of Device",
      cardIssued: "2026-05-12",
      updatedBy: "officer-uid",
    });
  });

  it("keeps an action the officer took off", () => {
    const { enforcement: _e, ...cleared } = seeded;
    void _e;
    const merged = mergeSeededInspection(seeded, { ...cleared, updatedBy: "officer-uid" });
    expect(merged.enforcement).toBeUndefined();
  });
});
