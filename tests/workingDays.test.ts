import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  easterSunday,
  isWorkingDay,
  workingDaysBetween,
  workingDaysLeft,
  zambianHolidays,
} from "../lib/rules/workingDays";

describe("easterSunday", () => {
  it("computes known Easter dates", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });
});

describe("zambianHolidays", () => {
  it("includes the fixed statutory days", () => {
    const dates = zambianHolidays(2026).map((h) => h.date);
    for (const d of [
      "2026-01-01", // New Year
      "2026-03-08", // Women's Day
      "2026-03-12", // Youth Day
      "2026-04-28", // Kenneth Kaunda Day
      "2026-05-01", // Labour Day
      "2026-05-25", // Africa Freedom Day
      "2026-10-18", // National Day of Prayer
      "2026-10-24", // Independence Day
      "2026-12-25", // Christmas
    ]) {
      expect(dates).toContain(d);
    }
  });

  it("computes the Easter cluster for 2026 (Easter Sunday 5 Apr)", () => {
    const dates = zambianHolidays(2026).map((h) => h.date);
    expect(dates).toContain("2026-04-03"); // Good Friday
    expect(dates).toContain("2026-04-04"); // Holy Saturday
    expect(dates).toContain("2026-04-06"); // Easter Monday
  });

  it("computes the moveable Monday holidays for 2026", () => {
    const dates = zambianHolidays(2026).map((h) => h.date);
    expect(dates).toContain("2026-07-06"); // Heroes' Day — first Monday of July
    expect(dates).toContain("2026-07-07"); // Unity Day — the Tuesday after
    expect(dates).toContain("2026-08-03"); // Farmers' Day — first Monday of August
  });

  it("observes a Sunday holiday on the following Monday", () => {
    // 8 March 2026 (Women's Day) is a Sunday → Monday 9 March observed.
    const h = zambianHolidays(2026);
    expect(h.some((x) => x.date === "2026-03-09" && /observed/.test(x.name))).toBe(
      true,
    );
  });
});

describe("isWorkingDay", () => {
  it("rejects weekends", () => {
    expect(isWorkingDay("2026-06-06")).toBe(false); // Saturday
    expect(isWorkingDay("2026-06-07")).toBe(false); // Sunday
    expect(isWorkingDay("2026-06-08")).toBe(true); // Monday
  });

  it("rejects public holidays", () => {
    expect(isWorkingDay("2026-05-25")).toBe(false); // Africa Freedom Day (Monday)
    expect(isWorkingDay("2026-07-07")).toBe(false); // Unity Day (Tuesday)
    expect(isWorkingDay("2026-05-26")).toBe(true);
  });
});

describe("addWorkingDays", () => {
  it("skips a plain weekend", () => {
    // Friday + 1 working day = Monday.
    expect(addWorkingDays("2026-06-05", 1)).toBe("2026-06-08");
  });

  it("skips weekends AND holidays across a window", () => {
    // Thu 2 Jul 2026 + 3 working days: Fri 3rd (1), Mon 6th is Heroes' Day,
    // Tue 7th is Unity Day, so Wed 8th (2), Thu 9th (3).
    expect(addWorkingDays("2026-07-02", 3)).toBe("2026-07-09");
  });

  it("computes a 26-working-day SOP window", () => {
    // From Mon 1 Jun 2026 (day 0, exclusive): June contributes 21 working
    // days (2–30), then Jul 1,2,3 (24), skip the 4–5 weekend and the 6–7
    // Heroes'/Unity holidays, land on Wed 8 (25), Thu 9 (26).
    expect(addWorkingDays("2026-06-01", 26)).toBe("2026-07-09");
  });

  it("returns the same date for n = 0", () => {
    expect(addWorkingDays("2026-06-05", 0)).toBe("2026-06-05");
  });
});

describe("workingDaysBetween / workingDaysLeft", () => {
  it("counts working days exclusive of start, inclusive of end", () => {
    expect(workingDaysBetween("2026-06-01", "2026-06-05")).toBe(4);
    expect(workingDaysBetween("2026-06-05", "2026-06-08")).toBe(1); // over a weekend
  });

  it("never runs backwards", () => {
    expect(workingDaysBetween("2026-06-05", "2026-06-01")).toBe(0);
    expect(workingDaysBetween("2026-06-05", "2026-06-05")).toBe(0);
  });

  it("is the inverse of addWorkingDays", () => {
    const due = addWorkingDays("2026-06-01", 26);
    expect(workingDaysBetween("2026-06-01", due)).toBe(26);
  });

  it("signs the remaining days: positive before due, negative after", () => {
    expect(workingDaysLeft("2026-06-01", "2026-06-05")).toBe(4);
    expect(workingDaysLeft("2026-06-05", "2026-06-05")).toBe(0);
    expect(workingDaysLeft("2026-06-08", "2026-06-05")).toBe(-1);
  });
});
