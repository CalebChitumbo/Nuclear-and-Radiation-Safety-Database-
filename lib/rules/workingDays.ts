/**
 * Working-day arithmetic for the SOP's statutory clocks.
 *
 * The RPA licensing SOP measures every deadline in WORKING days — the
 * pre-authorisation inspection within 26 working days, the licence within 44
 * working days of a complete application, a renewal within 15 working days —
 * so the app needs a calendar that skips weekends and Zambian public holidays.
 *
 * Pure and framework-free. All dates are ISO `YYYY-MM-DD` strings handled in
 * UTC (same convention as week.ts) so arithmetic never shifts across a
 * timezone boundary.
 */
import { parseISO, toISO } from "./week";

/**
 * Easter Sunday for a year (Gregorian computus, Anonymous algorithm).
 * Zambia observes Good Friday, Holy Saturday and Easter Monday around it.
 */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISO(new Date(Date.UTC(year, month - 1, day)));
}

function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** 0 = Sunday … 6 = Saturday. */
function dayOfWeek(iso: string): number {
  return parseISO(iso).getUTCDay();
}

/** First Monday of a month (1-based month), as an ISO date. */
function firstMonday(year: number, month: number): string {
  const first = toISO(new Date(Date.UTC(year, month - 1, 1)));
  const dow = dayOfWeek(first);
  return addDays(first, (8 - dow) % 7);
}

export interface Holiday {
  date: string;
  name: string;
}

/**
 * Zambian statutory public holidays for a year, per the Public Holidays Act
 * (Cap. 391, as amended):
 *
 *  - Fixed dates: New Year (1 Jan), International Women's Day (8 Mar), Youth
 *    Day (12 Mar), Kenneth Kaunda Day (28 Apr), Labour Day (1 May), Africa
 *    Freedom Day (25 May), National Day of Prayer (18 Oct), Independence Day
 *    (24 Oct), Christmas (25 Dec).
 *  - Easter-relative: Good Friday, Holy Saturday, Easter Monday.
 *  - Moveable Mondays: Heroes' Day (first Monday of July), Unity Day (the
 *    Tuesday after it), Farmers' Day (first Monday of August).
 *
 * When a fixed-date holiday falls on a Sunday, the following Monday is
 * observed (the Act's substitution rule); both days are returned so the
 * Sunday original still reads as a holiday.
 */
export function zambianHolidays(year: number): Holiday[] {
  const fixed: Holiday[] = [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: `${year}-03-08`, name: "International Women's Day" },
    { date: `${year}-03-12`, name: "Youth Day" },
    { date: `${year}-04-28`, name: "Kenneth Kaunda Day" },
    { date: `${year}-05-01`, name: "Labour Day" },
    { date: `${year}-05-25`, name: "Africa Freedom Day" },
    { date: `${year}-10-18`, name: "National Day of Prayer" },
    { date: `${year}-10-24`, name: "Independence Day" },
    { date: `${year}-12-25`, name: "Christmas Day" },
  ];

  const easter = easterSunday(year);
  const heroes = firstMonday(year, 7);
  const out: Holiday[] = [
    ...fixed,
    { date: addDays(easter, -2), name: "Good Friday" },
    { date: addDays(easter, -1), name: "Holy Saturday" },
    { date: addDays(easter, 1), name: "Easter Monday" },
    { date: heroes, name: "Heroes' Day" },
    { date: addDays(heroes, 1), name: "Unity Day" },
    { date: firstMonday(year, 8), name: "Farmers' Day" },
  ];

  // Sunday → observed the following Monday.
  for (const h of fixed) {
    if (dayOfWeek(h.date) === 0) {
      out.push({ date: addDays(h.date, 1), name: `${h.name} (observed)` });
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const holidayCache = new Map<number, Set<string>>();

function holidaySet(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(zambianHolidays(year).map((h) => h.date));
    holidayCache.set(year, set);
  }
  return set;
}

export function isHoliday(iso: string): boolean {
  return holidaySet(Number(iso.slice(0, 4))).has(iso);
}

/** Monday–Friday and not a Zambian public holiday. */
export function isWorkingDay(iso: string): boolean {
  const dow = dayOfWeek(iso);
  if (dow === 0 || dow === 6) return false;
  return !isHoliday(iso);
}

/**
 * The n-th working day after `iso` (n ≥ 1) — i.e. the SOP due date for a clock
 * of n working days started on `iso`. n = 0 returns the same date.
 */
export function addWorkingDays(iso: string, n: number): string {
  let d = iso;
  let remaining = n;
  while (remaining > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) remaining--;
  }
  return d;
}

/**
 * Working days elapsed from `fromISO` (exclusive) to `toISO` (inclusive).
 * Returns 0 when `toISO` ≤ `fromISO` — the clocks never run backwards.
 * A clock started Monday reads 1 on Tuesday: "day one" of the SOP window.
 */
export function workingDaysBetween(fromISO: string, toISO: string): number {
  if (!fromISO || !toISO || toISO <= fromISO) return 0;
  let count = 0;
  let d = fromISO;
  // Hard ceiling keeps a malformed input from spinning forever.
  for (let i = 0; i < 3660 && d < toISO; i++) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) count++;
  }
  return count;
}

/**
 * Signed working days from `todayISO` until `dueISO`: positive = still to run,
 * 0 = due today, negative = overdue by that many working days.
 */
export function workingDaysLeft(todayISO: string, dueISO: string): number {
  if (dueISO >= todayISO) return workingDaysBetween(todayISO, dueISO);
  return -workingDaysBetween(dueISO, todayISO);
}
