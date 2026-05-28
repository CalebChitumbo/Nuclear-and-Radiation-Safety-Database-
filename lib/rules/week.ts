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

export function weekForDate(date: string, weeks: WeekDef[]): WeekDef | null {
  if (!date) return null;
  for (const w of weeks) {
    if (date >= w.start && date <= w.end) return w;
  }
  return null;
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
  const iso = toISO(today);
  const w = weekForDate(iso, weeks);
  if (w) return w;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].end <= iso) return weeks[i];
  }
  return weeks[0];
}
