import { describe, expect, it } from "vitest";
import {
  dailyCountSums,
  dailyMetricOptions,
  effectiveValuesByWeek,
  entriesForDate,
  entriesForWeek,
  mergeWeekManualValues,
  sumMetricAcrossWeeks,
} from "../lib/rules/daily";
import { deriveWeekly, metricKey } from "../lib/rules/weeklyDerivation";
import type { DailyEntry, WeekMetrics } from "../lib/rules/types";

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
  it("uses exactly the weekly report's metric keys, for every section", () => {
    const opts = dailyMetricOptions(NSSS);
    expect(opts.map((o) => o.label)).toContain("Vehicle Screening (units)");
    for (const o of opts) {
      expect(o.key).toBe(metricKey(NSSS, o.label));
    }
    // A daily count logged against an option key lands on the weekly table.
    const rep = deriveWeekly([], [], { [opts[0].key]: 5 });
    const nsss = rep.find((s) => s.section === NSSS)!;
    expect(nsss.metrics.find((m) => m.key === opts[0].key)?.value).toBe(5);
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
