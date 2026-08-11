import { describe, expect, it } from "vitest";
import {
  borderSums,
  buildOfficialScreeningText,
  dailyCountSums,
  dailyMetricOptions,
  effectiveValuesByWeek,
  entriesForDate,
  entriesForWeek,
  mergeWeekManualValues,
  sumMetricAcrossWeeks,
  vehicleScreeningKey,
} from "../lib/rules/daily";
import { metricKey } from "../lib/rules/weeklyDerivation";
import {
  deriveWorkPlan,
  metricKeysForOutput,
  findOutput,
} from "../lib/rules/workPlan";
import weeksSeed from "../seed/weeks-2026.seed.json";
import type { DailyEntry, WeekDef, WeekMetrics } from "../lib/rules/types";

const NSSS = "Nuclear Safety, Security & Safeguards" as const;
const SCREEN = metricKey(NSSS, "Vehicle Screening (units)");
const W22 = "W22 — wk of 25 May 2026";
const W23 = "W23 — wk of 01 Jun 2026";

const count = (
  value: number,
  over: Partial<DailyEntry> = {},
): DailyEntry => ({
  id: `d${Math.random()}`,
  date: "2026-05-27",
  week: W22,
  section: NSSS,
  kind: "count",
  metricKey: SCREEN,
  label: "Vehicle Screening (units)",
  value,
  ...over,
});

const note = (over: Partial<DailyEntry> = {}): DailyEntry => ({
  id: `n${Math.random()}`,
  date: "2026-05-27",
  week: W22,
  section: NSSS,
  kind: "note",
  text: "Escorted a consignment.",
  ...over,
});

describe("daily metric options", () => {
  it("offers the section's work plan outputs, on the report's own keys", () => {
    const opts = dailyMetricOptions(NSSS);
    // Vehicles screened is output 1.3.12, still on its original metric key.
    const screening = opts.find((o) => o.outputId === "1.3.12")!;
    expect(screening.key).toBe(SCREEN);
    for (const o of opts) {
      expect(o.keys).toEqual(metricKeysForOutput(findOutput(o.outputId)!));
      expect(o.key).toBe(o.keys[0]);
    }
  });

  it("lands a daily count on the work plan row it was logged against", () => {
    const opts = dailyMetricOptions(NSSS);
    const opt = opts.find((o) => o.outputId === "1.3.9")!;
    const reports = deriveWorkPlan({
      weeks: weeksSeed as WeekDef[],
      week: W22,
      events: [],
      inspections: [],
      valuesByWeek: new Map([[W22, { [opt.key]: 5 }]]),
    });
    const row = reports
      .flatMap((s) => s.rows)
      .find((r) => r.output.id === "1.3.9")!;
    expect(row.week).toBe(5);
    expect(row.total).toBe(5);
  });
});

describe("dailyCountSums", () => {
  it("sums count entries per metric and ignores notes", () => {
    const sums = dailyCountSums([count(12), count(8), note()]);
    expect(sums[SCREEN]).toBe(20);
    expect(Object.keys(sums)).toHaveLength(1);
  });

  it("treats missing/invalid values as zero", () => {
    const sums = dailyCountSums([
      count(5),
      count(0, { value: undefined }),
      count(0, { value: Number.NaN }),
    ]);
    expect(sums[SCREEN]).toBe(5);
  });
});

describe("mergeWeekManualValues", () => {
  it("lets the week's daily sum win over the typed weekly figure", () => {
    const merged = mergeWeekManualValues({ [SCREEN]: 99 }, [count(3), count(4)]);
    expect(merged.values[SCREEN]).toBe(7);
    expect(merged.fromDaily.has(SCREEN)).toBe(true);
  });

  it("keeps weekly figures for metrics without daily entries", () => {
    const other = metricKey(NSSS, "TWG Meetings");
    const merged = mergeWeekManualValues({ [other]: 2 }, [count(3)]);
    expect(merged.values[other]).toBe(2);
    expect(merged.fromDaily.has(other)).toBe(false);
    expect(merged.values[SCREEN]).toBe(3);
  });
});

describe("effectiveValuesByWeek", () => {
  const wm = (week: string, value: number): WeekMetrics => ({
    week,
    values: { [SCREEN]: value },
  });

  it("overlays daily sums onto stored weekly metrics per week", () => {
    const byWeek = effectiveValuesByWeek(
      [wm(W22, 50), wm(W23, 9)],
      [count(3), count(4)], // both in W22
    );
    expect(byWeek.get(W22)?.[SCREEN]).toBe(7); // daily wins
    expect(byWeek.get(W23)?.[SCREEN]).toBe(9); // weekly kept
  });

  it("creates weeks that only exist as daily entries", () => {
    const byWeek = effectiveValuesByWeek([], [count(6, { week: W23 })]);
    expect(byWeek.get(W23)?.[SCREEN]).toBe(6);
  });

  it("sums a metric across selected weeks", () => {
    const byWeek = effectiveValuesByWeek([wm(W22, 5), wm(W23, 9)], []);
    expect(sumMetricAcrossWeeks(byWeek, SCREEN)).toBe(14);
    expect(sumMetricAcrossWeeks(byWeek, SCREEN, (w) => w === W23)).toBe(9);
  });
});

describe("entry filters", () => {
  it("filters by date and by week", () => {
    const a = count(1, { date: "2026-05-27", week: W22 });
    const b = count(2, { date: "2026-06-02", week: W23 });
    expect(entriesForDate([a, b], "2026-05-27")).toEqual([a]);
    expect(entriesForWeek([a, b], W23)).toEqual([b]);
  });
});

describe("border screening", () => {
  it("exposes the screening metric on the weekly report's key", () => {
    expect(vehicleScreeningKey()).toBe(SCREEN);
  });

  it("splits sums per border with an unspecified bucket and grand total", () => {
    const sums = borderSums(
      [
        count(60, { border: "Chirundu" }),
        count(40, { border: "Chirundu" }),
        count(50, { border: "Kasumbalesa" }),
        count(33), // head office / other
        note(), // ignored
        count(9, { metricKey: metricKey(NSSS, "TWG Meetings"), border: "Chirundu" }),
      ],
      SCREEN,
    );
    expect(sums.byBorder).toEqual({ Chirundu: 100, Kasumbalesa: 50 });
    expect(sums.unspecified).toBe(33);
    expect(sums.total).toBe(183);
  });

  it("border entries still sum into the weekly rollup unchanged", () => {
    const merged = mergeWeekManualValues({}, [
      count(60, { border: "Chirundu" }),
      count(50, { border: "Kasumbalesa" }),
    ]);
    expect(merged.values[SCREEN]).toBe(110);
  });

  it("builds the official confirmation text, largest border first", () => {
    const text = buildOfficialScreeningText("2026-05-27", {
      byBorder: { Kasumbalesa: 50, Chirundu: 100 },
      unspecified: 33,
      total: 183,
    });
    expect(text).toBe(
      "Official vehicles-screened total for 2026-05-27: 183 — Chirundu 100, Kasumbalesa 50, Head office / other 33",
    );
  });
});
