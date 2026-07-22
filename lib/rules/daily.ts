/**
 * Pure logic for the Daily Updates tab and its rollup into the weekly report.
 *
 * Sections log their day as they go — a number against one of their manual
 * metrics ("count") or a free-text line ("note"). At reporting time the week's
 * daily counts are summed per metric and take precedence over any figure typed
 * directly on the weekly report, so a section that has moved to daily logging
 * never has its numbers silently doubled or overwritten. Dated licences and
 * inspections stay in their own collections (they are already daily-dated);
 * this module only concerns the manual metrics.
 */
import type { DailyEntry, Section, WeekMetrics } from "./types";
import { MANUAL_METRICS_BY_SECTION, metricKey } from "./weeklyDerivation";

/** The metric choices a section's daily count form offers. */
export function dailyMetricOptions(
  section: Section,
): Array<{ key: string; label: string }> {
  return (MANUAL_METRICS_BY_SECTION[section] || []).map((label) => ({
    key: metricKey(section, label),
    label,
  }));
}

export const NSSS_SECTION: Section = "Nuclear Safety, Security & Safeguards";
export const VEHICLE_SCREENING_LABEL = "Vehicle Screening (units)";

/** The weekly-report metric key the border screening counts land on. */
export function vehicleScreeningKey(): string {
  return metricKey(NSSS_SECTION, VEHICLE_SCREENING_LABEL);
}

export interface BorderSums {
  /** Sum per named border post (only borders that appear in the entries). */
  byBorder: Record<string, number>;
  /** Counts logged without a border (head office / other). */
  unspecified: number;
  total: number;
}

/**
 * Split one metric's count entries by the border post they came from — the
 * senior officer's per-border breakdown and grand total for a day (or any
 * other slice the caller has already filtered to).
 */
export function borderSums(entries: DailyEntry[], key: string): BorderSums {
  const byBorder: Record<string, number> = {};
  let unspecified = 0;
  let total = 0;
  for (const e of entries) {
    if (e.kind !== "count" || e.metricKey !== key) continue;
    const v = typeof e.value === "number" && Number.isFinite(e.value) ? e.value : 0;
    total += v;
    if (e.border) byBorder[e.border] = (byBorder[e.border] || 0) + v;
    else unspecified += v;
  }
  return { byBorder, unspecified, total };
}

/**
 * The text of the senior officer's official daily confirmation note —
 * "Official vehicles-screened total for 2026-07-22: 143 — Chirundu 60,
 * Kasumbalesa 50, Head office / other 33". Stored on an `official` note entry
 * so the confirmation is auditable without double counting the numbers.
 */
export function buildOfficialScreeningText(
  date: string,
  sums: BorderSums,
): string {
  const parts = Object.entries(sums.byBorder)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, v]) => `${name} ${v}`);
  if (sums.unspecified > 0) parts.push(`Head office / other ${sums.unspecified}`);
  const breakdown = parts.length ? ` — ${parts.join(", ")}` : "";
  return `Official vehicles-screened total for ${date}: ${sums.total}${breakdown}`;
}

/** Sum of daily count entries per metricKey across the given entries. */
export function dailyCountSums(entries: DailyEntry[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const e of entries) {
    if (e.kind !== "count" || !e.metricKey) continue;
    const v = typeof e.value === "number" && Number.isFinite(e.value) ? e.value : 0;
    sums[e.metricKey] = (sums[e.metricKey] || 0) + v;
  }
  return sums;
}

/**
 * Effective manual values for ONE week: for each metric, the sum of that
 * week's daily entries wins over a value typed directly on the weekly report;
 * metrics with no daily entries keep the weekly figure. `fromDaily` says which
 * keys were daily-derived so the UI can mark them read-only.
 */
export function mergeWeekManualValues(
  weekly: Record<string, number>,
  weekEntries: DailyEntry[],
): { values: Record<string, number>; fromDaily: Set<string> } {
  const sums = dailyCountSums(weekEntries);
  const values: Record<string, number> = { ...weekly };
  const fromDaily = new Set<string>();
  for (const [key, sum] of Object.entries(sums)) {
    values[key] = sum;
    fromDaily.add(key);
  }
  return { values, fromDaily };
}

/**
 * Effective manual values for EVERY week that has any data — stored weekly
 * metrics overlaid with daily sums (daily wins per metric, as above). Feeds the
 * cross-week dashboards (e.g. the NSSS tab's trends and yearly totals).
 */
export function effectiveValuesByWeek(
  allWeekMetrics: WeekMetrics[],
  entries: DailyEntry[],
): Map<string, Record<string, number>> {
  const byWeek = new Map<string, Record<string, number>>();
  for (const wm of allWeekMetrics) {
    byWeek.set(wm.week, { ...(wm.values || {}) });
  }
  const entriesByWeek = new Map<string, DailyEntry[]>();
  for (const e of entries) {
    if (!e.week) continue;
    const arr = entriesByWeek.get(e.week) || [];
    arr.push(e);
    entriesByWeek.set(e.week, arr);
  }
  for (const [week, weekEntries] of entriesByWeek) {
    const merged = mergeWeekManualValues(byWeek.get(week) || {}, weekEntries);
    byWeek.set(week, merged.values);
  }
  return byWeek;
}

/** Entries dated exactly `date` (YYYY-MM-DD). */
export function entriesForDate(
  entries: DailyEntry[],
  date: string,
): DailyEntry[] {
  return entries.filter((e) => e.date === date);
}

/** Entries belonging to the reporting week `week`. */
export function entriesForWeek(
  entries: DailyEntry[],
  week: string,
): DailyEntry[] {
  return entries.filter((e) => e.week === week);
}

/**
 * Total one metric across weeks whose label passes `weekFilter` — computed on
 * effective (daily-first) values so a week is never double counted.
 */
export function sumMetricAcrossWeeks(
  byWeek: Map<string, Record<string, number>>,
  key: string,
  weekFilter: (week: string) => boolean = () => true,
): number {
  let total = 0;
  for (const [week, values] of byWeek) {
    if (!weekFilter(week)) continue;
    total += values[key] || 0;
  }
  return total;
}
