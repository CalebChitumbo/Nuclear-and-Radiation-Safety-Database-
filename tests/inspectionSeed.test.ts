import { describe, expect, it } from "vitest";

import {
  buildInspectionDatabase,
  summariseInspectionDatabase,
} from "../lib/rules/inspectionDatabase";
import {
  WORK_PLAN_OPENING_BALANCE,
  buildQuarterIndex,
  deriveWorkPlan,
  quarterOfDate,
  type SubprogrammeReport,
} from "../lib/rules/workPlan";
import {
  mapAllSeed,
  mapAllSeedInspections,
  seedInspectionId,
  type SeedFacility,
  type SeedInspection,
} from "../lib/store/seeding";
import type { WeekDef } from "../lib/rules/types";
import facilitiesSeed from "../seed/facilities.seed.json";
import registerSeed from "../seed/inspections-2026.seed.json";
import weeksSeed from "../seed/weeks-2026.seed.json";

/**
 * §18 — the Inspectorate's 2026 facility inspection register, seeded from the
 * division's hand-over document of 7 Sep 2026. See
 * docs/inspection-register-2026-import.md; the figures pinned here are that
 * document's own.
 */
const ROWS = registerSeed as SeedInspection[];
const WEEKS = weeksSeed as WeekDef[];
const FACILITIES = mapAllSeed(facilitiesSeed as SeedFacility[]);
const { inspections, skipped, unlinked } = mapAllSeedInspections(
  ROWS,
  FACILITIES,
  WEEKS,
);

/** The register's own row count, and the split its four types make. */
const ROW_COUNT = 298;
const IMPORTED = 297;
const BY_TYPE = {
  "Routine Inspection": 211,
  "Pre-Authorisation": 64,
  "Follow-up": 19,
  Investigation: 3,
};
/**
 * Rows the register dates for itself, and the quarters the REPORT puts them in
 * — a week counts to the quarter it starts in, so the three inspections of
 * 1 July fall in the week of 29 June and are Q2 here, not Q3.
 */
const DATED = 42;
const DATED_QUARTERS = [0, 21, 21, 0];

describe("§18 — seeded 2026 inspection register", () => {
  it("carries the document's 298 rows and imports the 297 that have a type", () => {
    expect(ROWS.length).toBe(ROW_COUNT);
    expect(inspections.length).toBe(IMPORTED);
    // One row — Ndola Cancer Disease Hospital — is held back rather than
    // guessed at: the document leaves its Type of Inspection blank and the
    // section has not yet said what it was.
    expect(skipped.length).toBe(1);
    expect(skipped[0].row.name).toBe("Ndola Cancer Disease Hospital");
  });

  it("normalises the document's five spellings of pre-authorisation", () => {
    const byType: Record<string, number> = {};
    for (const i of inspections) byType[i.type] = (byType[i.type] || 0) + 1;
    expect(byType).toEqual(BY_TYPE);
    // Every row that reads like a pre-authorisation lands in one type, however
    // the officer who typed it spelled it.
    const spellings = new Set(
      ROWS.filter((r) => /pre.?auth/i.test(r.type)).map((r) => r.type),
    );
    expect(spellings.size).toBeGreaterThan(3);
  });

  it("gives every row a stable id, and numbers a facility's repeat visits", () => {
    expect(new Set(inspections.map((i) => i.id)).size).toBe(inspections.length);
    // Coptic Hospital Manchinchi Road appears four times in the register — two
    // pre-authorisations, one investigative and one routine. The repeated pair
    // must survive as two inspections, not collapse into one.
    const coptic = inspections.filter((i) =>
      i.facilityName.startsWith("Coptic Hospital Manchinchi"),
    );
    expect(coptic.length).toBe(4);
    expect(coptic.filter((i) => i.type === "Pre-Authorisation").length).toBe(2);
    expect(
      seedInspectionId("Coptic Hospital Manchinchi Road", "Pre-Authorisation", 2),
    ).toBe("reg2026-coptic-hospital-manchinchi-road-pre-authorisation-2");
  });

  it("dates 42 rows and leaves the rest undated rather than inventing a day", () => {
    const dated = inspections.filter((i) => i.date);
    expect(dated.length).toBe(DATED);
    expect(inspections.length - dated.length).toBe(IMPORTED - DATED);
    // A dated row always carries the reporting week it belongs to; an undated
    // one carries neither, so no period claims it.
    for (const i of dated) expect(i.week).not.toBe("");
    for (const i of inspections) {
      if (!i.date) expect(i.week).toBe("");
      else expect(i.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("records no outcome — the register has no outcome column", () => {
    for (const i of inspections) expect(i.outcome).toBe("N/A");
  });

  it("links a row to a facility only when the province agrees", () => {
    expect(unlinked).toBe(112);
    expect(inspections.length - unlinked).toBe(185);
    for (const i of inspections) {
      if (!i.facilityId) continue;
      const f = FACILITIES.find((x) => x.id === i.facilityId);
      expect(f).toBeTruthy();
      expect(i.province).toBe(f?.province);
    }
    // The register visits a "Hilltop" hospital in three provinces, and the
    // facility register holds one in each. Name alone would have sent all three
    // to whichever scored highest; the province sends each to its own.
    const hilltop = inspections
      .filter((i) => /^Hilltop/.test(i.facilityName))
      .map((i) => [i.province, i.facilityName]);
    expect(hilltop.sort()).toEqual([
      ["Lusaka", "Hilltop Hospital Lusaka"],
      ["North-Western", "Hilltop Hospital Solwezi"],
      ["Northern", "Hilltop Hospital - Kasama"],
    ]);
  });

  it("builds the province sheets the Inspectorate tab shows", () => {
    const rows = buildInspectionDatabase(inspections, FACILITIES, {
      today: "2026-09-07",
    });
    const summary = summariseInspectionDatabase(rows);
    // Every imported inspection is counted in one of the four sheet columns.
    expect(summary.total.inspectionsTotal).toBe(IMPORTED);
    expect(summary.total.inspections.planned).toBe(BY_TYPE["Routine Inspection"]);
    expect(summary.total.inspections.preAuth).toBe(BY_TYPE["Pre-Authorisation"]);
    expect(summary.total.inspections.followUp).toBe(BY_TYPE["Follow-up"]);
    expect(summary.total.inspections.investigative).toBe(BY_TYPE.Investigation);
    // The register records no enforcement action against any of them.
    expect(summary.total.enforcementTotal).toBe(0);
  });

  it("does not report the register's dated rows twice under output 1.2.4", () => {
    // The 42 dated rows are counted off the register, so 1.2.4's opening
    // balance sheds exactly them, quarter for quarter as the report attributes
    // them. Carried + counted must come back to the 295 the section reported on
    // 4 Sep 2026, split the way the section's own workbook split it.
    const quarterByWeek = buildQuarterIndex(WEEKS, 2026);
    const quarters = [0, 0, 0, 0];
    for (const i of inspections) {
      if (!i.date) continue;
      const q = quarterByWeek.get(i.week) ?? quarterOfDate(i.date, 2026);
      expect(q).not.toBeNull();
      if (q) quarters[q - 1] += 1;
    }
    expect(quarters).toEqual(DATED_QUARTERS);

    const opening = WORK_PLAN_OPENING_BALANCE["1.2.4"];
    expect(opening.map((v, i) => v + quarters[i])).toEqual([40, 123, 132, 0]);

    const reports: SubprogrammeReport[] = deriveWorkPlan({
      weeks: WEEKS,
      week: WEEKS[0].label,
      events: [],
      inspections,
      valuesByWeek: new Map(),
      // No saved baseline — a saved one replaces the code constant wholesale,
      // and it is the constant this is checking.
    });
    const row = reports
      .flatMap((r) => [...r.rows, ...r.supporting])
      .find((r) => r.output.id === "1.2.4");
    expect(row?.total).toBe(295);
    expect(row?.quarters).toEqual([40, 123, 132, 0]);
  });
});
