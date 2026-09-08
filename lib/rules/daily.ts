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
import {
  manualOutputsForSection,
  metricKeysForOutput,
  type Subprogramme,
} from "./workPlan";
import { metricKey } from "./weeklyDerivation";

/** One thing a section can log a number against on the Daily Updates tab. */
export interface DailyMetricOption {
  /** The key a new entry is written to. */
  key: string;
  /**
   * Every key whose stored figures count toward this option — `key` first, then
   * any the section used before the work plan became the reporting frame.
   */
  keys: string[];
  label: string;
  /** The work plan output the figure reports against, e.g. "1.2.6". */
  outputId: string;
  /** Off-plan supporting figure rather than a work plan output. */
  supporting: boolean;
}

/**
 * The metric choices a section's daily count form offers — its manual outputs
 * in the work plan, then the supporting figures it still tracks. The key is the
 * same one the weekly report reads, so a logged count lands on its work plan
 * row without any further mapping.
 *
 * Pass the plan in force (the approved workbook with the sections' own changes
 * laid over it) so a row a section added, reworded or re-pointed on the weekly
 * report is loggable here the same day. Omit it for the approved plan.
 */
export function dailyMetricOptions(
  section: Section,
  plan?: Subprogramme[],
): DailyMetricOption[] {
  return manualOutputsForSection(section, plan).map((o) => {
    const keys = metricKeysForOutput(o);
    return {
      key: keys[0] || "",
      keys,
      label: o.logLabel || o.description,
      outputId: o.id,
      supporting: !!o.supporting,
    };
  });
}

export const NSSS_SECTION: Section = "Nuclear Safety, Security & Safeguards";
export const VEHICLE_SCREENING_LABEL = "Vehicle Screening (units)";

/**
 * A border post's document id, derived from its name so that adding the same
 * post twice upserts it rather than duplicating it. Both stores and the seed
 * script derive it the same way — a post seeded from the daily summary
 * workbook and one an officer types must be the same border.
 */
export function borderId(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
}

/** The weekly-report metric key the border screening counts land on. */
export function vehicleScreeningKey(): string {
  return metricKey(NSSS_SECTION, VEHICLE_SCREENING_LABEL);
}

/**
 * The document id a post's screening figure for one day is stored under.
 *
 * One post, one day, one figure. Deriving the id rather than letting Firestore
 * allocate one is what makes that true: logging the same post-day again
 * REPLACES the figure instead of adding a second one beside it, so the
 * cumulative total cannot drift upward through repeated entry. The 2026
 * workbook import writes the same ids, so a coordinator correcting an imported
 * day corrects it rather than doubling it.
 */
export function screeningEntryId(date: string, border: string): string {
  return `screen-${date}-${borderId(border)}`;
}

/**
 * The figure already on file for one post on one day, if there is one — the
 * workbook's, an earlier shift's, or one posted from the scan log. The capture
 * form shows it before it overwrites it, so replacing a figure is always a
 * decision somebody made rather than something that happened to them.
 */
export function existingScreeningEntry(
  entries: DailyEntry[],
  border: string,
  date: string,
): DailyEntry | null {
  const key = vehicleScreeningKey();
  return (
    entries.find(
      (e) =>
        e.kind === "count" &&
        e.metricKey === key &&
        e.border === border &&
        e.date === date,
    ) || null
  );
}

/**
 * The id a daily entry MUST live under, or null when it may live under any.
 *
 * Only the border screening counts are pinned: one post, one day, one figure
 * (see `screeningEntryId`). Everything else in the daily log is an ordinary
 * document with an allocated id, and several of them may sit on the same day.
 */
export function postDayEntryId(
  entry: Pick<DailyEntry, "kind" | "metricKey" | "border" | "date">,
): string | null {
  if (entry.kind !== "count") return null;
  if (entry.metricKey !== vehicleScreeningKey()) return null;
  if (!entry.border) return null;
  return screeningEntryId(entry.date, entry.border);
}

/**
 * Where an edited entry has to be written, and what has to be taken away.
 *
 * Correcting a figure is usually a write back to the same document. A screening
 * count is not: its id names the post and the day it belongs to, so moving one
 * to another day or another post has to move the DOCUMENT, or the post-day
 * invariant breaks and the same day could be logged twice. Three shapes come
 * out of that:
 *
 * - `id` set, `removeId` null — write over the document that is there.
 * - both set — the post-day id changed; write the new one, drop the old.
 * - `id` null — the entry stopped being a post-day figure (its metric changed,
 *   or its post was cleared), so it needs a freshly allocated document and the
 *   pinned one goes.
 *
 * Whatever already sits at the destination is REPLACED, which is the point:
 * the caller shows the officer that figure before it disappears.
 */
export function planDailyEntryWrite(
  entry: DailyEntry,
  next: Pick<DailyEntry, "kind" | "metricKey" | "border" | "date">,
): { id: string | null; removeId: string | null } {
  // An entry that is not already stored under its post-day id is an ordinary
  // document — the workbook import and the head-office figures both are.
  if (entry.id !== postDayEntryId(entry)) {
    return { id: entry.id, removeId: null };
  }
  const nextId = postDayEntryId(next);
  if (nextId === entry.id) return { id: entry.id, removeId: null };
  return { id: nextId, removeId: entry.id };
}

/**
 * What an account may change on a daily entry that is already on file — the
 * app's side of the `dailyEntries` update rule in `firestore.rules`:
 *
 * - `full` — every field on the entry. An administrator on any entry (that is
 *   the point of the role: the figures are the department's, and a mistake
 *   somebody else typed is still the department's to correct), and an officer
 *   on the entries they wrote themselves.
 * - `figure` — the number and its remark, and nothing that would move the
 *   entry somewhere else. A post's screening figure is the one entry anybody
 *   in the section may correct without having written it (a later shift, the
 *   workbook import), and the rules refuse to let that same write re-point the
 *   post-day at another post or another day.
 * - `none` — read only.
 *
 * `postedOffice` confines a border coordinator to their own post, exactly as
 * `filedAtOwnPost` does in the rules.
 */
export type DailyEntryEditScope = "none" | "figure" | "full";

export interface DailyEntryEditor {
  uid: string;
  admin: boolean;
  /** The sections whose records this account is shown (`sectionsFor`). */
  sections: readonly Section[];
  /** The inland office the account is posted to, if any. */
  postedOffice?: string | null;
}

export function dailyEntryEditScope(
  editor: DailyEntryEditor | null,
  entry: DailyEntry,
): DailyEntryEditScope {
  if (!editor) return "none";
  if (editor.admin) return "full";
  if (!editor.sections.includes(entry.section)) return "none";
  if (editor.postedOffice && entry.border !== editor.postedOffice) return "none";
  if (editor.uid && entry.updatedBy === editor.uid) return "full";
  return postDayEntryId(entry) === entry.id ? "figure" : "none";
}

/**
 * The author an edited entry keeps naming. `updatedBy` is who wrote the figure
 * that is there now — the rules force it to be the account doing the writing —
 * so an administrator correcting somebody else's entry would otherwise erase
 * the only record on the document of who logged it. `loggedBy` holds that,
 * from the first edit onwards; the row then reads "logged by X, corrected by
 * Y" instead of quietly becoming Y's.
 */
export function editedDailyEntry(
  entry: DailyEntry,
  next: Omit<DailyEntry, "id">,
  editor: { uid: string; name: string },
): Omit<DailyEntry, "id"> {
  const author = entry.loggedBy || entry.updatedBy;
  const authorName = entry.loggedByName || entry.updatedByName;
  // Somebody else's entry keeps naming them; an officer correcting their own
  // is simply its author again, so the field goes away rather than saying the
  // same name twice.
  const elsewhere = !!author && author !== editor.uid;
  return {
    ...next,
    updatedBy: editor.uid,
    updatedByName: editor.name,
    loggedBy: elsewhere ? author : undefined,
    loggedByName: elsewhere ? authorName : undefined,
  };
}

/**
 * A post that logs truck by truck does not type a daily figure — it posts the
 * count of what it scanned. It goes to the post-day's own document
 * (`screeningEntryId`), so posting again REPLACES whatever figure the day held,
 * whoever put it there: the same day can never be added to the week twice, and
 * the weekly report keeps reading the same metric it always has. `source`
 * records that the figure was counted rather than typed.
 */
export function scanLogCountEntry(input: {
  date: string;
  week: string;
  border: string;
  total: number;
  uid?: string;
  name?: string;
}): Omit<DailyEntry, "id"> {
  return {
    date: input.date,
    week: input.week,
    section: NSSS_SECTION,
    kind: "count",
    metricKey: vehicleScreeningKey(),
    label: VEHICLE_SCREENING_LABEL,
    value: input.total,
    border: input.border,
    source: "scan-log",
    text: `From the border scan log — ${input.total} truck${
      input.total === 1 ? "" : "s"
    } recorded individually.`,
    updatedBy: input.uid,
    updatedByName: input.name,
  };
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
 * One week's contribution to a typed work plan output, and where it came from.
 *
 * A cumulative Total Actual is an opening balance plus everything recorded
 * since, and until now the report could say what those two numbers were but
 * not WHICH weeks the second one was made of. So a figure typed into the wrong
 * week — the commonest way a manual output overshoots its target — could be
 * seen but not found. This is the breakdown that finds it.
 */
export interface ManualWeekFigure {
  week: string;
  /** What was typed into the weekly report's box for this metric. */
  typed: number;
  /** What Daily Updates logged against it that week. */
  daily: number;
  /** What the report actually counts — the daily sum wins where there is one. */
  effective: number;
  /** True when the week is daily-derived, so its box is not the thing to fix. */
  fromDaily: boolean;
}

/**
 * Every week holding a figure for one output, in calendar order.
 *
 * `keys` is the output's whole key history (`metricKeysForOutput`), so a figure
 * logged under wording the plan has since moved on from is still found — it is
 * still in the total, so it has to be in the breakdown that explains the total.
 *
 * A week is listed when it holds anything at all, a typed 0 with daily entries
 * included; weeks with nothing are left out. Precedence is the same rule the
 * report itself uses (`mergeWeekManualValues`): the daily sum wins per metric,
 * per week, so `effective` here and the reported figure can never disagree.
 */
export function manualWeekFigures(
  keys: readonly string[],
  weekMetrics: WeekMetrics[],
  entries: DailyEntry[],
  /** Week labels in calendar order; anything outside it sorts last, by label. */
  order: readonly string[] = [],
): ManualWeekFigure[] {
  const wanted = new Set(keys.filter(Boolean));
  if (!wanted.size) return [];

  const typedByWeek = new Map<string, number>();
  for (const wm of weekMetrics) {
    let sum = 0;
    for (const key of wanted) sum += wm.values?.[key] || 0;
    if (sum !== 0) typedByWeek.set(wm.week, sum);
  }

  const dailyByWeek = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== "count" || !e.week || !e.metricKey) continue;
    if (!wanted.has(e.metricKey)) continue;
    const v =
      typeof e.value === "number" && Number.isFinite(e.value) ? e.value : 0;
    dailyByWeek.set(e.week, (dailyByWeek.get(e.week) || 0) + v);
  }

  const rank = new Map(order.map((label, i) => [label, i]));
  return [...new Set([...typedByWeek.keys(), ...dailyByWeek.keys()])]
    .map((week) => {
      const typed = typedByWeek.get(week) || 0;
      const fromDaily = dailyByWeek.has(week);
      const daily = dailyByWeek.get(week) || 0;
      return { week, typed, daily, effective: fromDaily ? daily : typed, fromDaily };
    })
    .sort((a, b) => {
      const ra = rank.get(a.week) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.week) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.week.localeCompare(b.week);
    });
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
  return sumMetricsAcrossWeeks(byWeek, [key], weekFilter);
}

/**
 * The same, over several keys at once — what one reported figure is made of
 * when the section logged it under an earlier metric name (see
 * `metricKeysForOutput`). Keys must be distinct or the figure double counts.
 */
export function sumMetricsAcrossWeeks(
  byWeek: Map<string, Record<string, number>>,
  keys: readonly string[],
  weekFilter: (week: string) => boolean = () => true,
): number {
  let total = 0;
  for (const [week, values] of byWeek) {
    if (!weekFilter(week)) continue;
    for (const key of keys) total += values[key] || 0;
  }
  return total;
}
