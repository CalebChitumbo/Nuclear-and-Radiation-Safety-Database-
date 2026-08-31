import { describe, expect, it } from "vitest";

import {
  borderSums,
  effectiveValuesByWeek,
  vehicleScreeningKey,
} from "../lib/rules/daily";
import { deriveWorkPlan, type SubprogrammeReport } from "../lib/rules/workPlan";
import {
  mapSeedBorders,
  mapSeedScreening,
  type SeedScreening,
} from "../lib/store/seeding";
import type { WeekDef } from "../lib/rules/types";
import screening from "../seed/daily-screening-2026.seed.json";
import weeks from "../seed/weeks-2026.seed.json";

/**
 * §17 — the inland offices' 2026 daily screening log, seeded from the section's
 * daily summary workbook. See docs/daily-screening-2026-import.md; the figures
 * pinned here are that workbook's own Summary sheet.
 */
const SEED = screening as SeedScreening;
const WEEKS = weeks as WeekDef[];
const entries = mapSeedScreening(SEED, WEEKS);

/** The Summary sheet's per-post totals for the year to date. */
const SUMMARY: Record<string, number> = {
  Chingola: 58521,
  Chirundu: 32966,
  "Kapiri Mposhi": 87990,
  Katete: 15032,
  Livingstone: 48719,
  Mongu: 3296,
  Nakonde: 77640,
  Ndola: 7013,
};
const GRAND_TOTAL = 331177;

describe("§17 — seeded daily screening log (2026 daily summary workbook)", () => {
  it("loads 1,484 daily counts across the 8 inland offices", () => {
    expect(entries.length).toBe(1484);
    expect(mapSeedBorders(SEED).map((b) => b.name)).toEqual(
      Object.keys(SUMMARY).sort((a, b) => a.localeCompare(b)),
    );
  });

  it("totals 331,177 vehicles, and matches the workbook post by post", () => {
    const sums = borderSums(entries, vehicleScreeningKey());
    expect(sums.total).toBe(GRAND_TOTAL);
    expect(sums.unspecified).toBe(0);
    expect(sums.byBorder).toEqual(SUMMARY);
  });

  it("gives every count a reporting week, so none is lost to the rollup", () => {
    for (const e of entries) {
      expect(e.week).not.toBe("");
      expect(e.section).toBe("Nuclear Safety, Security & Safeguards");
      expect(e.metricKey).toBe(vehicleScreeningKey());
      expect(e.border).toBeTruthy();
      expect(Number.isInteger(e.value)).toBe(true);
    }
  });

  it("keys each entry by post and date, so re-seeding never doubles a day", () => {
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    const chingolaNewYear = entries.find(
      (e) => e.border === "Chingola" && e.date === "2026-01-01",
    )!;
    expect(chingolaNewYear.id).toBe("screen-2026-01-01-chingola");
    expect(chingolaNewYear.value).toBe(186);
  });
});

describe("§17 — the screening log fills in work plan output 1.3.12", () => {
  const reports: SubprogrammeReport[] = deriveWorkPlan({
    weeks: WEEKS,
    week: "W34 — wk of 17 Aug 2026",
    events: [],
    inspections: [],
    valuesByWeek: effectiveValuesByWeek([], entries),
    dailyEntries: entries,
    // No saved baseline — the code's opening balance applies. It carries in
    // only the late-August days this log has yet to reach; everything the log
    // does hold is counted from these entries, never carried.
  });
  const row = reports
    .flatMap((s) => s.rows)
    .find((r) => r.output.id === "1.3.12")!;

  /** The workbook's cumulative figure — see docs/subprogrammes-2026-cumulative-update.md. */
  const WORKBOOK_TOTAL = 341009;

  it("counts all 331,177 screened vehicles off the log itself", () => {
    expect(row.recordedTotal).toBe(GRAND_TOTAL);
    // The rest is the gap between the log and the section's workbook — the
    // only part of 1.3.12 that is carried in.
    expect(row.openingTotal).toBe(WORKBOOK_TOTAL - GRAND_TOTAL);
    expect(row.total).toBe(WORKBOOK_TOTAL);
    expect(row.status).toBe("In Progress");
  });

  it("splits the quarters by reporting week", () => {
    // A week counts to the quarter it starts in, so W14 (30 Mar – 3 Apr) puts
    // three April days into Q1: the quarters differ from the workbook's
    // calendar months by those days, but the year total does not.
    expect(row.quarters.reduce((a, b) => a + b, 0)).toBe(WORKBOOK_TOTAL);
    expect(row.recorded.reduce((a, b) => a + b, 0)).toBe(GRAND_TOTAL);
    expect(row.quarters[3]).toBe(0); // nothing reported in Q4 yet
    for (const q of row.quarters.slice(0, 3)) expect(q).toBeGreaterThan(0);
  });

  it("breaks the figure down by border post", () => {
    expect(
      Object.fromEntries(row.breakdown.map((b) => [b.label, b.total])),
    ).toEqual(SUMMARY);
  });
});
