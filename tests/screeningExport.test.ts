import { describe, expect, it } from "vitest";

import { vehicleScreeningKey } from "../lib/rules/daily";
import {
  buildScreeningWorkbook,
  entryInPeriod,
  entrySource,
  exportedEntries,
  screeningExportFilename,
  screeningPeriod,
  weeksInPeriod,
} from "../lib/rules/screeningExport";
import type { DailyEntry, TruckScan, WeekDef } from "../lib/rules/types";

const NSSS = "Nuclear Safety, Security & Safeguards" as const;

const weeks: WeekDef[] = [
  { label: "W35 — wk of 24 Aug 2026", start: "2026-08-24", end: "2026-08-28" },
  { label: "W36 — wk of 31 Aug 2026", start: "2026-08-31", end: "2026-09-04" },
  { label: "W37 — wk of 07 Sep 2026", start: "2026-09-07", end: "2026-09-11" },
  { label: "W41 — wk of 05 Oct 2026", start: "2026-10-05", end: "2026-10-09" },
];

function count(
  date: string,
  border: string,
  value: number,
  extra: Partial<DailyEntry> = {},
): DailyEntry {
  return {
    id: `screen-${date}-${border.toLowerCase()}`,
    date,
    week: weeks.find((w) => date >= w.start && date <= w.end)?.label || "",
    section: NSSS,
    kind: "count",
    metricKey: vehicleScreeningKey(),
    label: "Vehicle Screening (units)",
    value,
    border,
    ...extra,
  };
}

const entries: DailyEntry[] = [
  count("2026-08-27", "Nakonde", 250, { updatedBy: "seed" }),
  count("2026-09-01", "Nakonde", 300, { updatedBy: "seed" }),
  count("2026-09-01", "Chirundu", 120, {
    updatedBy: "u1",
    updatedByName: "A. Banda",
    text: "Quiet day",
    createdAt: "2026-09-01T16:00:00Z",
  }),
  count("2026-09-02", "Nakonde", 310, { source: "scan-log", updatedByName: "M. Phiri" }),
  // A corrected figure names both hands.
  count("2026-09-03", "Chirundu", 90, {
    updatedBy: "admin",
    updatedByName: "The Admin",
    loggedBy: "u1",
    loggedByName: "A. Banda",
  }),
  // A head-office figure with no post.
  count("2026-09-03", "", 5, { border: undefined }),
  // Not a screening count — never exported.
  {
    id: "n1",
    date: "2026-09-01",
    week: weeks[1].label,
    section: NSSS,
    kind: "note",
    text: "Official total confirmed",
  },
  {
    id: "c-other",
    date: "2026-09-01",
    week: weeks[1].label,
    section: NSSS,
    kind: "count",
    metricKey: "NUCLEAR_SAFETY_SECURITY_SAFEGUARDS::Stakeholder engagements",
    value: 2,
  },
];

describe("screeningPeriod", () => {
  it("names the reporting week, month, quarter and year an anchor falls in", () => {
    expect(screeningPeriod("week", "2026-09-02", weeks[1])).toEqual({
      kind: "week",
      label: weeks[1].label,
      start: "2026-08-31",
      end: "2026-09-04",
      week: weeks[1].label,
    });
    expect(screeningPeriod("month", "2026-09-02", null)).toMatchObject({
      label: "September 2026",
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(screeningPeriod("month", "2026-02-10", null)).toMatchObject({
      end: "2026-02-28",
    });
    expect(screeningPeriod("quarter", "2026-09-02", null)).toMatchObject({
      label: "Q3 2026",
      start: "2026-07-01",
      end: "2026-09-30",
    });
    expect(screeningPeriod("year", "2026-09-02", null)).toMatchObject({
      label: "Year 2026",
      start: "2026-01-01",
      end: "2026-12-31",
    });
    expect(screeningPeriod("all", "2026-09-02", null)).toMatchObject({
      label: "All time",
      start: "",
      end: "",
    });
  });

  it("matches a week by its label and everything else by the day", () => {
    const week = screeningPeriod("week", "2026-09-02", weeks[1]);
    expect(entryInPeriod({ date: "2026-09-05", week: weeks[1].label }, week)).toBe(true);
    expect(entryInPeriod({ date: "2026-09-01", week: weeks[2].label }, week)).toBe(false);
    const month = screeningPeriod("month", "2026-09-02", null);
    expect(entryInPeriod({ date: "2026-09-30", week: "" }, month)).toBe(true);
    expect(entryInPeriod({ date: "2026-10-01", week: "" }, month)).toBe(false);
    expect(entryInPeriod({ date: "1999-01-01", week: "" }, screeningPeriod("all", "2026-09-02", null))).toBe(true);
  });

  it("lists the reporting weeks a period touches", () => {
    expect(weeksInPeriod(screeningPeriod("month", "2026-09-02", null), weeks).map((w) => w.label)).toEqual([
      weeks[1].label,
      weeks[2].label,
    ]);
    expect(weeksInPeriod(screeningPeriod("week", "2026-09-02", weeks[1]), weeks)).toEqual([weeks[1]]);
    expect(weeksInPeriod(screeningPeriod("all", "2026-09-02", null), weeks)).toHaveLength(4);
  });
});

describe("exportedEntries", () => {
  it("keeps screening counts in the period, for the office asked for", () => {
    const period = screeningPeriod("week", "2026-09-02", weeks[1]);
    expect(exportedEntries({ office: "", period, entries }).map((e) => e.id)).toEqual([
      "screen-2026-09-01-chirundu",
      "screen-2026-09-01-nakonde",
      "screen-2026-09-02-nakonde",
      "screen-2026-09-03-",
      "screen-2026-09-03-chirundu",
    ]);
    expect(exportedEntries({ office: "Nakonde", period, entries }).map((e) => e.date)).toEqual([
      "2026-09-01",
      "2026-09-02",
    ]);
  });

  it("says how each figure got there", () => {
    expect(entrySource(entries[0])).toBe("Daily summary workbook");
    expect(entrySource(entries[2])).toBe("Typed on Daily Updates");
    expect(entrySource(entries[3])).toBe("Posted from scan log");
  });
});

describe("buildScreeningWorkbook", () => {
  const period = screeningPeriod("week", "2026-09-02", weeks[1]);
  const sheets = buildScreeningWorkbook({
    office: "",
    period,
    entries,
    weeks,
    generatedAt: "2026-09-10T08:00:00Z",
    generatedBy: "S. Mwale",
  });
  const byName = Object.fromEntries(sheets.map((s) => [s.name, s.rows]));

  it("carries the office, the period and the totals on the Summary sheet", () => {
    expect(sheets.map((s) => s.name)).toEqual(["Summary", "Daily totals", "Entries"]);
    const summary = byName.Summary;
    expect(summary[1]).toEqual(["Office", "All inland offices"]);
    expect(summary[2]).toEqual(["Reporting period", weeks[1].label]);
    expect(summary[3]).toEqual(["From", "2026-08-31"]);
    expect(summary[4]).toEqual(["To", "2026-09-04"]);
    expect(summary[5]).toEqual(["Vehicles screened", 825]);
    expect(summary[6]).toEqual(["Days with a figure", 3]);
    expect(summary[7]).toEqual(["Offices reporting", 3]);
    expect(summary[8]).toEqual(["Entries", 5]);
    expect(summary[10]).toEqual(["Generated by", "S. Mwale"]);
    // Then a line per office, ending in the total.
    expect(summary.slice(-4)).toEqual([
      ["Chirundu", 2, 210],
      ["Nakonde", 2, 610],
      ["Head office / other", 1, 5],
      ["Total", 3, 825],
    ]);
  });

  it("pivots the daily totals by office, with a Total column and row", () => {
    expect(byName["Daily totals"]).toEqual([
      ["Date", "Reporting week", "Chirundu", "Nakonde", "Head office / other", "Total"],
      ["2026-09-01", weeks[1].label, 120, 300, null, 420],
      ["2026-09-02", weeks[1].label, null, 310, null, 310],
      ["2026-09-03", weeks[1].label, 90, null, 5, 95],
      ["Total", "", 210, 610, 5, 825],
    ]);
  });

  it("lists every entry with its source and both hands on a correction", () => {
    const rows = byName.Entries;
    expect(rows[0]).toEqual([
      "Date",
      "Reporting week",
      "Office",
      "Vehicles screened",
      "Source",
      "Logged by",
      "Corrected by",
      "Remark",
      "Recorded at",
      "Entry id",
    ]);
    expect(rows[1]).toEqual([
      "2026-09-01",
      weeks[1].label,
      "Chirundu",
      120,
      "Typed on Daily Updates",
      "A. Banda",
      "",
      "Quiet day",
      "2026-09-01T16:00:00Z",
      "screen-2026-09-01-chirundu",
    ]);
    expect(rows[2].slice(4, 7)).toEqual(["Daily summary workbook", "Import", ""]);
    // The corrected figure: logged by Banda, corrected by the administrator.
    const corrected = rows.find((r) => r[9] === "screen-2026-09-03-chirundu")!;
    expect(corrected.slice(3, 7)).toEqual([90, "Typed on Daily Updates", "A. Banda", "The Admin"]);
  });

  it("confines a single office's workbook to that office", () => {
    const one = buildScreeningWorkbook({
      office: "Nakonde",
      period,
      entries,
      weeks,
      generatedAt: "2026-09-10T08:00:00Z",
      generatedBy: "S. Mwale",
    });
    const rows = Object.fromEntries(one.map((s) => [s.name, s.rows]));
    expect(rows.Summary[1]).toEqual(["Office", "Nakonde"]);
    expect(rows.Summary[5]).toEqual(["Vehicles screened", 610]);
    expect(rows["Daily totals"][0]).toEqual(["Date", "Reporting week", "Nakonde", "Total"]);
    expect(rows.Entries).toHaveLength(3);
  });

  it("adds the truck scans sheet only when scans are supplied, for the office", () => {
    const scan = (over: Partial<TruckScan>): TruckScan => ({
      id: "s1",
      date: "2026-09-02",
      week: weeks[1].label,
      border: "Nakonde",
      time: "08:15",
      vehicleId: "T123ABC",
      vehicleIdKind: "Plate",
      direction: "Inbound",
      cargoClass: "Goods of Interest",
      commodity: "Copper cathodes",
      norm: false,
      transporter: "ABC Haulage",
      doseNSvH: 90,
      result: "Normal",
      officerName: "M. Phiri",
      ...over,
    });
    const scans = [scan({}), scan({ id: "s2", border: "Chirundu", doseNSvH: 400, result: "Elevated", action: "Re-scanned & released" })];
    const withScans = buildScreeningWorkbook({
      office: "Nakonde",
      period,
      entries,
      scans,
      weeks,
      generatedAt: "2026-09-10T08:00:00Z",
      generatedBy: "S. Mwale",
    });
    expect(withScans.map((s) => s.name)).toContain("Truck scans");
    const rows = withScans.find((s) => s.name === "Truck scans")!.rows;
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual([
      "2026-09-02",
      "08:15",
      "Nakonde",
      weeks[1].label,
      "T123ABC",
      "Plate",
      "Inbound",
      "Goods of Interest",
      "Copper cathodes",
      "",
      "ABC Haulage",
      90,
      "Normal",
      "",
      "",
      "M. Phiri",
    ]);
  });

  it("names the file after the office, the period and the day", () => {
    expect(screeningExportFilename("Kapiri Mposhi", period, "2026-09-10")).toBe(
      "border-screening-kapiri-mposhi-w36-2026-09-10.xlsx",
    );
    expect(
      screeningExportFilename("", screeningPeriod("quarter", "2026-09-02", null), "2026-09-10"),
    ).toBe("border-screening-all-offices-q3-2026-2026-09-10.xlsx");
  });
});
