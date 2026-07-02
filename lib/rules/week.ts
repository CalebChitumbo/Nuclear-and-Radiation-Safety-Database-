import type { WeekDef } from "./types";

export function parseISO(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function toISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Today as YYYY-MM-DD in LOCAL time. Date inputs default from this — using
 * toISOString() (UTC) would show yesterday between midnight and 02:00 in
 * Zambia (UTC+2) and could file a Monday entry into the previous week.
 */
export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function weekForDate(date: string, weeks: WeekDef[]): WeekDef | null {
  if (!date || weeks.length === 0) return null;
  // Exact containment first — a weekday inside its Mon–Fri window.
  for (const w of weeks) {
    if (date >= w.start && date <= w.end) return w;
  }
  // Otherwise SNAP to a reporting week so a date is never left unassigned.
  // An empty `week` is rejected by the Firestore rules (week.size() > 0), so a
  // weekend/gap licence must still belong to a week: it rolls into the most
  // recent week that has started; a date before the calendar maps to the
  // earliest week.
  let preceding: WeekDef | null = null;
  for (const w of weeks) {
    if (w.start <= date && (!preceding || w.start > preceding.start)) {
      preceding = w;
    }
  }
  return preceding ?? weeks.reduce((a, b) => (a.start <= b.start ? a : b));
}

export function weekLabelForDate(
  date: string,
  weeks: WeekDef[],
  fallback = "",
): string {
  const w = weekForDate(date, weeks);
  return w ? w.label : fallback;
}

export function currentWeek(weeks: WeekDef[], today = new Date()): WeekDef {
  // Local calendar date: the reporting week must roll over at midnight in
  // Zambia, not at midnight UTC two hours later.
  const iso = todayISO(today);
  const w = weekForDate(iso, weeks);
  if (w) return w;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].end <= iso) return weeks[i];
  }
  return weeks[0];
}
