/**
 * Forensics for the vehicles-screened figure (work plan output 1.3.12).
 *
 * WHY THIS EXISTS
 *
 * The cumulative screening total is the sum of a few thousand `dailyEntries`
 * documents plus an opening balance, and it is read as one number on the
 * weekly report. When that number moves and nobody recognises the movement —
 * "the difference is like 9,000" — the raw collection is the only record of
 * why, and nothing in the app reads it back that way.
 *
 * Everything needed is already stored on each entry: who wrote it
 * (`updatedBy` / `updatedByName`), when the write happened (`createdAt`, set by
 * the store on every app write) and what day and post it is for. This module
 * turns that into the four answers an unexplained jump needs:
 *
 *   1. What the total stood at on a given date, and what has been added since
 *      (`totalAsOf`, `changesBetween`) — the difference, entry by entry.
 *   2. Which post-days are counted more than once (`duplicatePostDays`) — the
 *      one way the figure inflates without anyone typing a wrong number: the
 *      2026 workbook import already holds a day, and a coordinator logs it
 *      again on Daily Updates (see docs/daily-screening-2026-import.md).
 *   3. Which figures do not look like a day's work at that post
 *      (`outlyingEntries`) — a month-to-date or year-to-date total typed into
 *      a form that asks for one day.
 *   4. Which entries were written long after the day they report
 *      (`backdatedEntries`) — a legitimate catch-up, but the thing that moves
 *      a total for a week everyone had already signed off.
 *
 * It reads; it never writes. `scripts/screening-audit.ts` is the CLI over it.
 *
 * WHAT IT CANNOT SEE
 *
 * A deleted entry leaves nothing behind — `deleteDailyEntry` is a hard delete —
 * so a total that went DOWN is invisible here. Entries seeded from the workbook
 * carry `updatedBy: "seed"` and no `createdAt`, so they are treated as having
 * always been there. Both are arguments for an append-only audit log; until
 * there is one, this works from what the entries themselves remember.
 */
import { borderSums, vehicleScreeningKey } from "./daily";
import type { DailyEntry } from "./types";

/** `updatedBy` on the entries the seed script writes. */
export const SEED_AUTHOR_UID = "seed";

/** Was this entry imported from the 2026 workbook rather than typed in the app? */
export function isSeeded(e: DailyEntry): boolean {
  return e.updatedBy === SEED_AUTHOR_UID;
}

function value(e: DailyEntry): number {
  return typeof e.value === "number" && Number.isFinite(e.value) ? e.value : 0;
}

/** The screening count entries out of a mixed daily log. */
export function screeningEntries(
  entries: DailyEntry[],
  key: string = vehicleScreeningKey(),
): DailyEntry[] {
  return entries.filter((e) => e.kind === "count" && e.metricKey === key);
}

/** Sum of a set of entries' values. */
export function sumEntries(entries: DailyEntry[]): number {
  return entries.reduce((total, e) => total + value(e), 0);
}

// ---------------------------------------------------------------------------
// What changed, and when
// ---------------------------------------------------------------------------

/**
 * The total as it stood at `instant` (an ISO timestamp).
 *
 * An entry with no `createdAt` — anything the seed wrote — counts as having
 * been there from the start, which is what it means for the workbook figures
 * imported at handover.
 */
export function totalAsOf(entries: DailyEntry[], instant: string): number {
  return sumEntries(entries.filter((e) => !e.createdAt || e.createdAt <= instant));
}

export interface ScreeningChange {
  from: string;
  to: string;
  added: DailyEntry[];
  addedTotal: number;
  totalBefore: number;
  totalAfter: number;
}

/**
 * Everything written between two instants, and what it did to the total. This
 * is the direct answer to "it was 353,000 and now it is 362,000": run it across
 * the two moments and the entries that made up the difference are the list.
 */
export function changesBetween(
  entries: DailyEntry[],
  from: string,
  to: string = new Date().toISOString(),
): ScreeningChange {
  const added = entries
    .filter((e) => e.createdAt && e.createdAt > from && e.createdAt <= to)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const totalBefore = totalAsOf(entries, from);
  const addedTotal = sumEntries(added);
  return {
    from,
    to,
    added,
    addedTotal,
    totalBefore,
    totalAfter: totalBefore + addedTotal,
  };
}

// ---------------------------------------------------------------------------
// Double counting
// ---------------------------------------------------------------------------

export interface DuplicatePostDay {
  border: string;
  date: string;
  entries: DailyEntry[];
  /** Everything above the largest single figure — what the day over-counts by. */
  excess: number;
  /** True when one of them came from the workbook import. */
  includesSeeded: boolean;
}

/**
 * Post-days carrying more than one screening figure.
 *
 * One post, one day, one number: a second figure for the same post-day is
 * either a correction that should have replaced the first, or the same trucks
 * counted twice. `excess` is what the day contributes above its largest single
 * figure — the amount the cumulative total is inflated by if the duplicates
 * were not deliberate.
 *
 * Entries with no post are grouped under "(no post)" — they are the head
 * office / other line on the daily panel and can legitimately repeat, so they
 * are reported but never assumed wrong.
 */
export function duplicatePostDays(entries: DailyEntry[]): DuplicatePostDay[] {
  // Keyed on post + day. The post name is carried in the group rather than
  // parsed back out of the key: "Kapiri Mposhi" has a space in it.
  const groups = new Map<
    string,
    { border: string; date: string; rows: DailyEntry[] }
  >();
  for (const e of entries) {
    const border = e.border || "(no post)";
    const gkey = `${border} | ${e.date}`;
    const group = groups.get(gkey) || { border, date: e.date, rows: [] };
    group.rows.push(e);
    groups.set(gkey, group);
  }

  const out: DuplicatePostDay[] = [];
  for (const { border, date, rows: group } of groups.values()) {
    if (group.length < 2) continue;
    const largest = Math.max(...group.map(value));
    out.push({
      border,
      date,
      entries: [...group].sort((a, b) =>
        (a.createdAt || "").localeCompare(b.createdAt || ""),
      ),
      excess: sumEntries(group) - largest,
      includesSeeded: group.some(isSeeded),
    });
  }
  return out.sort((a, b) => b.excess - a.excess || a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Figures that do not look like a day
// ---------------------------------------------------------------------------

export interface OutlyingEntry {
  entry: DailyEntry;
  /** The post's usual day, for comparison. */
  median: number;
  /** How many times its usual day this figure is. */
  factor: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Figures far above what the post normally does in a day — the shape a
 * month-to-date or year-to-date total makes when it is typed into a form that
 * asks for one day's count.
 *
 * Compared against the post's OWN median, because the posts differ by an order
 * of magnitude (Katete does ~65 a day, Kapiri Mposhi ~386), so a single
 * department-wide threshold would either miss Katete's mistakes or drown in
 * Kapiri Mposhi's ordinary days.
 */
export function outlyingEntries(
  entries: DailyEntry[],
  factor = 5,
): OutlyingEntry[] {
  const byBorder = new Map<string, DailyEntry[]>();
  for (const e of entries) {
    const border = e.border || "(no post)";
    byBorder.set(border, [...(byBorder.get(border) || []), e]);
  }

  const out: OutlyingEntry[] = [];
  for (const group of byBorder.values()) {
    // A handful of entries cannot establish what "usual" is at a post.
    if (group.length < 5) continue;
    const usual = median(group.map(value));
    if (usual <= 0) continue;
    for (const entry of group) {
      const ratio = value(entry) / usual;
      if (ratio >= factor) out.push({ entry, median: usual, factor: ratio });
    }
  }
  return out.sort((a, b) => b.factor - a.factor);
}

// ---------------------------------------------------------------------------
// Late entries
// ---------------------------------------------------------------------------

export interface BackdatedEntry {
  entry: DailyEntry;
  /** Days between the day reported and the day it was written. */
  lagDays: number;
}

/** Whole days between two YYYY-MM-DD dates. */
function daysBetween(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * Entries written well after the day they report. Catching up on a week of
 * paperwork is normal and legitimate; what matters is that it moves a
 * cumulative figure for weeks already reported, so the movement has an
 * explanation rather than a mystery.
 */
export function backdatedEntries(
  entries: DailyEntry[],
  minLagDays = 7,
): BackdatedEntry[] {
  const out: BackdatedEntry[] = [];
  for (const entry of entries) {
    if (!entry.createdAt) continue;
    const lagDays = daysBetween(entry.date, entry.createdAt.slice(0, 10));
    if (lagDays >= minLagDays) out.push({ entry, lagDays });
  }
  return out.sort((a, b) => b.lagDays - a.lagDays);
}

// ---------------------------------------------------------------------------
// Is the carried-in balance still carrying anything?
// ---------------------------------------------------------------------------

export interface CarryInCheck {
  /** The last day the workbook import holds, per post. */
  importEndsAt: Record<string, string>;
  /** Figures logged by hand for days after their post's import ends. */
  afterImport: DailyEntry[];
  afterImportTotal: number;
  /** Posts whose days have since been logged past the end of the import. */
  postsOverlapping: string[];
}

/**
 * Whether the opening balance is still carrying work the system does not hold.
 *
 * Output 1.3.12's opening balance exists for ONE reason: the workbook reported
 * a higher total than its own dated rows added up to, and the difference was
 * days the imported log does not hold — the late-August days after the import
 * ends. It is a stand-in for records that were missing.
 *
 * The moment somebody logs those days by hand, the stand-in and the real
 * records are both in the total and the vehicles are counted twice. That is
 * written into `WORK_PLAN_OPENING_BALANCE` as a warning ("zero this row or they
 * count twice"), and this is how to find out whether it has happened: for each
 * post, the last day the import holds, and everything logged for that post
 * since.
 *
 * It reports; it does not conclude. Whether those days are the SAME days the
 * balance was carrying is a question for the section, not for arithmetic.
 */
export function carryInCheck(entries: DailyEntry[]): CarryInCheck {
  const importEndsAt: Record<string, string> = {};
  for (const e of entries) {
    if (!isSeeded(e) || !e.border) continue;
    const seen = importEndsAt[e.border];
    if (!seen || e.date > seen) importEndsAt[e.border] = e.date;
  }

  const afterImport = entries
    .filter((e) => {
      if (isSeeded(e) || !e.border) return false;
      const ends = importEndsAt[e.border];
      // A post the import never covered has no carry-in to overlap with.
      return !!ends && e.date > ends;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    importEndsAt,
    afterImport,
    afterImportTotal: sumEntries(afterImport),
    postsOverlapping: [...new Set(afterImport.map((e) => e.border || ""))].sort(),
  };
}

// ---------------------------------------------------------------------------
// Who wrote what
// ---------------------------------------------------------------------------

export interface ActorTotal {
  uid: string;
  name: string;
  entries: number;
  total: number;
  firstWrite: string;
  lastWrite: string;
  borders: string[];
}

/** The screening figures grouped by the account that wrote them. */
export function byActor(entries: DailyEntry[]): ActorTotal[] {
  const groups = new Map<string, DailyEntry[]>();
  for (const e of entries) {
    const uid = e.updatedBy || "(unknown)";
    groups.set(uid, [...(groups.get(uid) || []), e]);
  }
  return [...groups.entries()]
    .map(([uid, group]) => {
      const stamps = group
        .map((e) => e.createdAt || "")
        .filter(Boolean)
        .sort();
      return {
        uid,
        name: group.find((e) => e.updatedByName)?.updatedByName || "(no name)",
        entries: group.length,
        total: sumEntries(group),
        firstWrite: stamps[0] || "",
        lastWrite: stamps[stamps.length - 1] || "",
        borders: [...new Set(group.map((e) => e.border || "(no post)"))].sort(),
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// The whole report
// ---------------------------------------------------------------------------

export interface ScreeningAudit {
  /** Every screening count entry considered. */
  entries: DailyEntry[];
  seededTotal: number;
  loggedTotal: number;
  openingBalance: number;
  /** Opening + seeded + logged — what output 1.3.12 should read. */
  grandTotal: number;
  byBorder: Record<string, number>;
  unspecified: number;
  actors: ActorTotal[];
  duplicates: DuplicatePostDay[];
  duplicateExcess: number;
  outliers: OutlyingEntry[];
  backdated: BackdatedEntry[];
  carryIn: CarryInCheck;
  /** Set when a window was asked for. */
  change: ScreeningChange | null;
}

/**
 * Everything above in one pass, from a daily log and the opening balance in
 * force. `since` (an ISO timestamp) adds the "what moved it" window.
 */
export function auditScreening(input: {
  entries: DailyEntry[];
  metricKey?: string;
  openingBalance?: number[];
  since?: string;
  outlierFactor?: number;
  backdatedLagDays?: number;
}): ScreeningAudit {
  const key = input.metricKey || vehicleScreeningKey();
  const entries = screeningEntries(input.entries, key);
  const opening = (input.openingBalance || []).reduce(
    (a, b) => a + (Number.isFinite(b) ? b : 0),
    0,
  );
  const sums = borderSums(entries, key);
  const duplicates = duplicatePostDays(entries);
  const seeded = entries.filter(isSeeded);

  return {
    entries,
    seededTotal: sumEntries(seeded),
    loggedTotal: sumEntries(entries.filter((e) => !isSeeded(e))),
    openingBalance: opening,
    grandTotal: opening + sums.total,
    byBorder: sums.byBorder,
    unspecified: sums.unspecified,
    actors: byActor(entries),
    duplicates,
    duplicateExcess: duplicates.reduce((a, d) => a + d.excess, 0),
    outliers: outlyingEntries(entries, input.outlierFactor),
    backdated: backdatedEntries(entries, input.backdatedLagDays),
    carryIn: carryInCheck(entries),
    change: input.since ? changesBetween(entries, input.since) : null,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const CSV_COLUMNS: Array<[string, (e: DailyEntry) => string | number]> = [
  ["Written at", (e) => e.createdAt || "(imported)"],
  ["Day reported", (e) => e.date],
  ["Week", (e) => e.week],
  ["Post", (e) => e.border || ""],
  ["Vehicles", (e) => (typeof e.value === "number" ? e.value : "")],
  ["Source", (e) => (isSeeded(e) ? "Workbook import" : e.source || "Typed in")],
  ["Officer", (e) => e.updatedByName || ""],
  ["Account", (e) => e.updatedBy || ""],
  ["Remark", (e) => e.text || ""],
  ["Entry id", (e) => e.id],
];

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The entries behind the figure, newest write first — the trail as a file. */
export function screeningEntriesToCsv(entries: DailyEntry[]): string {
  const rows = [...entries].sort(
    (a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || "") ||
      b.date.localeCompare(a.date),
  );
  return [
    CSV_COLUMNS.map(([label]) => csvCell(label)).join(","),
    ...rows.map((e) => CSV_COLUMNS.map(([, get]) => csvCell(get(e))).join(",")),
  ].join("\n");
}
