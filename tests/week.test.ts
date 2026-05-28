import { describe, expect, it } from "vitest";
import {
  currentWeek,
  weekForDate,
  weekLabelForDate,
} from "../lib/rules/week";
import type { WeekDef } from "../lib/rules/types";

const weeks: WeekDef[] = [
  { label: "W22 — wk of 25 May 2026", start: "2026-05-25", end: "2026-05-29" },
  { label: "W23 — wk of 01 Jun 2026", start: "2026-06-01", end: "2026-06-05" },
];

describe("week.ts", () => {
  it("places dates inside their reporting week", () => {
    expect(weekForDate("2026-05-27", weeks)?.label).toBe(
      "W22 — wk of 25 May 2026",
    );
    expect(weekForDate("2026-06-05", weeks)?.label).toBe(
      "W23 — wk of 01 Jun 2026",
    );
  });

  it("weekend dates between weeks return null", () => {
    expect(weekForDate("2026-05-30", weeks)).toBeNull();
  });

  it("weekLabelForDate uses fallback when no match", () => {
    expect(weekLabelForDate("2026-12-31", weeks, "unknown")).toBe("unknown");
  });

  it("currentWeek returns the week containing today", () => {
    const w = currentWeek(weeks, new Date("2026-05-28T00:00:00Z"));
    expect(w.label).toBe("W22 — wk of 25 May 2026");
  });
});
