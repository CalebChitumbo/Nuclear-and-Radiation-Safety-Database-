import { describe, expect, it } from "vitest";
import {
  borderSums,
  buildOfficialScreeningText,
  dailyCountSums,
  dailyEntryEditScope,
  dailyMetricOptions,
  editedDailyEntry,
  effectiveValuesByWeek,
  entriesForDate,
  entriesForWeek,
  manualWeekFigures,
  mergeWeekManualValues,
  planDailyEntryWrite,
  postDayEntryId,
  screeningEntryId,
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
      baseline: {}, // count only what was logged, not the opening balance
    });
    const row = reports
      .flatMap((s) => s.rows)
      .find((r) => r.output.id === "1.3.9")!;
    expect(row.week).toBe(5);
    expect(row.total).toBe(5);
  });

  it("adds a daily count to the output's opening balance", () => {
    const opts = dailyMetricOptions(NSSS);
    const opt = opts.find((o) => o.outputId === "1.3.9")!;
    const reports = deriveWorkPlan({
      weeks: weeksSeed as WeekDef[],
      week: W22,
      events: [],
      inspections: [],
      valuesByWeek: new Map([[W22, { [opt.key]: 5 }]]),
      baseline: null, // the approved workbook carried 65 stakeholders in Q3
    });
    const row = reports
      .flatMap((s) => s.rows)
      .find((r) => r.output.id === "1.3.9")!;
    expect(row.week).toBe(5);
    expect(row.openingTotal).toBe(65);
    expect(row.total).toBe(70);
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

// ---------------------------------------------------------------------------
// Correcting what is already on file
// ---------------------------------------------------------------------------

const INSP = "Inspectorate" as const;

/** A screening figure as the wizard stores one: pinned to its post-day id. */
const postDay = (
  border: string,
  date: string,
  over: Partial<DailyEntry> = {},
): DailyEntry => ({
  ...count(60, { border, date }),
  id: screeningEntryId(date, border),
  ...over,
});

describe("postDayEntryId", () => {
  it("pins a border post's screening count to its post and day", () => {
    expect(postDayEntryId(count(60, { border: "Chirundu" }))).toBe(
      screeningEntryId("2026-05-27", "Chirundu"),
    );
  });

  it("leaves everything else free — notes, head-office figures, other metrics", () => {
    expect(postDayEntryId(note())).toBeNull();
    expect(postDayEntryId(count(60))).toBeNull();
    expect(
      postDayEntryId(count(3, { border: "Chirundu", metricKey: "insp/x" })),
    ).toBeNull();
  });
});

describe("planDailyEntryWrite", () => {
  it("writes an ordinary entry back over itself", () => {
    const e = count(60, { id: "day-1" });
    expect(planDailyEntryWrite(e, { ...e })).toEqual({
      id: "day-1",
      removeId: null,
    });
  });

  it("keeps a post-day figure in place when the post and day do not move", () => {
    const e = postDay("Chirundu", "2026-05-27");
    expect(planDailyEntryWrite(e, { ...e, date: "2026-05-27" })).toEqual({
      id: e.id,
      removeId: null,
    });
  });

  it("moves the DOCUMENT when a post-day figure is re-dated", () => {
    const e = postDay("Chirundu", "2026-05-27");
    expect(planDailyEntryWrite(e, { ...e, date: "2026-05-28" })).toEqual({
      id: screeningEntryId("2026-05-28", "Chirundu"),
      removeId: e.id,
    });
  });

  it("moves it when the figure is re-filed against another post", () => {
    const e = postDay("Chirundu", "2026-05-27");
    expect(planDailyEntryWrite(e, { ...e, border: "Kasumbalesa" })).toEqual({
      id: screeningEntryId("2026-05-27", "Kasumbalesa"),
      removeId: e.id,
    });
  });

  it("asks for a fresh document once it stops being a post-day figure", () => {
    const e = postDay("Chirundu", "2026-05-27");
    expect(
      planDailyEntryWrite(e, { ...e, metricKey: metricKey(NSSS, "Other") }),
    ).toEqual({ id: null, removeId: e.id });
  });

  it("never re-keys an entry that was not stored under its post-day id", () => {
    // The head-office figures and anything logged before the post-day rule.
    const e = count(60, { id: "day-9", border: "Chirundu" });
    expect(planDailyEntryWrite(e, { ...e, date: "2026-05-28" })).toEqual({
      id: "day-9",
      removeId: null,
    });
  });
});

describe("dailyEntryEditScope", () => {
  const officer = {
    uid: "u1",
    admin: false,
    sections: [NSSS] as const,
  };

  it("gives an administrator every field of every entry", () => {
    const admin = { uid: "boss", admin: true, sections: [INSP] as const };
    expect(dailyEntryEditScope(admin, count(60, { updatedBy: "u1" }))).toBe(
      "full",
    );
    expect(dailyEntryEditScope(admin, note({ section: INSP }))).toBe("full");
  });

  it("gives an officer every field of their own entry", () => {
    expect(dailyEntryEditScope(officer, count(60, { updatedBy: "u1" }))).toBe(
      "full",
    );
  });

  it("lets anyone in the section correct a post's screening figure — the number only", () => {
    expect(
      dailyEntryEditScope(officer, postDay("Chirundu", "2026-05-27", {
        updatedBy: "someone-else",
      })),
    ).toBe("figure");
  });

  it("refuses somebody else's ordinary entry", () => {
    expect(
      dailyEntryEditScope(officer, count(60, { updatedBy: "u2" })),
    ).toBe("none");
    expect(dailyEntryEditScope(officer, note({ updatedBy: "u2" }))).toBe("none");
  });

  it("refuses another section's entry, and a post other than the officer's own", () => {
    expect(
      dailyEntryEditScope(officer, count(60, { section: INSP, updatedBy: "u1" })),
    ).toBe("none");
    const posted = { ...officer, postedOffice: "Chirundu" };
    expect(
      dailyEntryEditScope(posted, postDay("Kasumbalesa", "2026-05-27")),
    ).toBe("none");
    expect(
      dailyEntryEditScope(posted, postDay("Chirundu", "2026-05-27")),
    ).toBe("figure");
  });

  it("refuses a signed-out reader", () => {
    expect(dailyEntryEditScope(null, count(60))).toBe("none");
  });
});

describe("editedDailyEntry", () => {
  const boss = { uid: "boss", name: "The Director" };

  it("stamps the corrector and keeps naming whoever logged it", () => {
    const e = count(60, { updatedBy: "u1", updatedByName: "Mwansa" });
    const next = editedDailyEntry(e, { ...e, value: 50 }, boss);
    expect(next.updatedBy).toBe("boss");
    expect(next.updatedByName).toBe("The Director");
    expect(next.loggedBy).toBe("u1");
    expect(next.loggedByName).toBe("Mwansa");
  });

  it("holds the original author through a second correction", () => {
    const e = count(60, {
      updatedBy: "boss",
      updatedByName: "The Director",
      loggedBy: "u1",
      loggedByName: "Mwansa",
    });
    const next = editedDailyEntry(e, { ...e, value: 40 }, {
      uid: "u2",
      name: "Banda",
    });
    expect(next.loggedBy).toBe("u1");
    expect(next.updatedBy).toBe("u2");
  });

  it("drops the field when the author comes back to their own entry", () => {
    const e = count(60, {
      updatedBy: "boss",
      updatedByName: "The Director",
      loggedBy: "u1",
      loggedByName: "Mwansa",
    });
    const next = editedDailyEntry(e, { ...e, value: 40 }, {
      uid: "u1",
      name: "Mwansa",
    });
    expect(next.loggedBy).toBeUndefined();
    expect(next.updatedBy).toBe("u1");
  });
});

// ---------------------------------------------------------------------------
// Which weeks a cumulative figure is made of
// ---------------------------------------------------------------------------

const OTHER = metricKey(NSSS, "RPO conference (Medical)");
const W24 = "W24 — wk of 08 Jun 2026";
const ORDER = [W22, W23, W24];

const wm = (week: string, values: Record<string, number>): WeekMetrics => ({
  week,
  values,
});

describe("manualWeekFigures", () => {
  it("names the weeks a typed figure was entered in, in calendar order", () => {
    const rows = manualWeekFigures(
      [OTHER],
      [wm(W23, { [OTHER]: 1 }), wm(W22, { [OTHER]: 1 })],
      [],
      ORDER,
    );
    expect(rows.map((r) => r.week)).toEqual([W22, W23]);
    expect(rows.map((r) => r.effective)).toEqual([1, 1]);
    expect(rows.every((r) => !r.fromDaily)).toBe(true);
  });

  it("adds up to the figure the report counts — the stray weeks and all", () => {
    // The 1.3.1 case: a carried 1 plus two weeks that should have been empty
    // reads as 3 against a target of 1.
    const rows = manualWeekFigures(
      [OTHER],
      [wm(W22, { [OTHER]: 1 }), wm(W24, { [OTHER]: 1 })],
      [],
      ORDER,
    );
    expect(rows.reduce((n, r) => n + r.effective, 0)).toBe(2);
  });

  it("leaves out weeks that hold nothing for this output", () => {
    const rows = manualWeekFigures(
      [OTHER],
      [wm(W22, { [OTHER]: 0, [SCREEN]: 500 }), wm(W23, { [SCREEN]: 400 })],
      [],
      ORDER,
    );
    expect(rows).toEqual([]);
  });

  it("counts a week's daily entries, and marks it as not the box to type in", () => {
    const rows = manualWeekFigures(
      [SCREEN],
      [wm(W22, { [SCREEN]: 999 })],
      [count(60, { week: W22 }), count(40, { week: W22 })],
      ORDER,
    );
    expect(rows).toEqual([
      { week: W22, typed: 999, daily: 100, effective: 100, fromDaily: true },
    ]);
  });

  it("agrees with what the report itself counts for that week", () => {
    const entries = [count(60, { week: W22 }), count(40, { week: W22 })];
    const merged = mergeWeekManualValues({ [SCREEN]: 999 }, entries);
    const [row] = manualWeekFigures([SCREEN], [wm(W22, { [SCREEN]: 999 })], entries, ORDER);
    expect(row.effective).toBe(merged.values[SCREEN]);
  });

  it("finds figures logged under the output's earlier metric names too", () => {
    const legacy = metricKey(NSSS, "Conference for RPOs");
    const rows = manualWeekFigures(
      [OTHER, legacy],
      [wm(W22, { [legacy]: 1 }), wm(W23, { [OTHER]: 1 })],
      [],
      ORDER,
    );
    expect(rows.map((r) => [r.week, r.effective])).toEqual([
      [W22, 1],
      [W23, 1],
    ]);
  });

  it("sorts a week outside the calendar last rather than dropping it", () => {
    const rows = manualWeekFigures(
      [OTHER],
      [wm("W99 — retired label", { [OTHER]: 5 }), wm(W22, { [OTHER]: 1 })],
      [],
      ORDER,
    );
    expect(rows.map((r) => r.week)).toEqual([W22, "W99 — retired label"]);
  });

  it("reads no keys, and an empty register, without inventing a week", () => {
    expect(manualWeekFigures([], [wm(W22, { [OTHER]: 1 })], [], ORDER)).toEqual([]);
    expect(manualWeekFigures([OTHER], [], [], ORDER)).toEqual([]);
  });
});
