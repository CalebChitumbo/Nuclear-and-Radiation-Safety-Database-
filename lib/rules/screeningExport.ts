/**
 * The border-screening workbook — what the NSSS section and each inland office
 * hand SharePoint.
 *
 * Management asked for the reporting system to stay the place figures are
 * ENTERED, with SharePoint holding a file of what was entered. So this builds
 * that file, from the same `dailyEntries` the sectional update counts (output
 * 1.3.12) and, where a post logs truck by truck, the scans behind them:
 *
 *   Summary       — the office, the reporting period, the total, and one line
 *                   per office with its days and vehicles
 *   Daily totals  — one row per day, a column per office, and the day's total
 *   Entries       — every figure behind the totals: who logged it, whether it
 *                   was typed, imported or posted from the scan log, and any
 *                   correction
 *   Truck scans   — the underlying scan rows, when the caller supplies them
 *
 * Everything here is pure: the pages pick the office and the period and fetch
 * the records; this decides what goes on which sheet. `buildXlsx` turns the
 * sheets into the file.
 */
import { borderSums, vehicleScreeningKey } from "./daily";
import { screeningEntries } from "./screeningAudit";
import { weekForDate } from "./week";
import type { CellValue, WorkbookSheet } from "./xlsx";
import type { DailyEntry, TruckScan, WeekDef } from "./types";

export const SCREENING_PERIOD_KINDS = [
  "week",
  "month",
  "quarter",
  "year",
  "all",
] as const;
export type ScreeningPeriodKind = (typeof SCREENING_PERIOD_KINDS)[number];

/** A span of the calendar the export covers. */
export interface ScreeningPeriod {
  kind: ScreeningPeriodKind;
  /** What the Summary sheet and the file name call it. */
  label: string;
  /** Inclusive ISO bounds; empty for "all". */
  start: string;
  end: string;
  /** The reporting week, when the period is one — entries are matched on it. */
  week?: string;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function lastDayOfMonth(year: number, month: number): string {
  // Day 0 of the next month is the last day of this one.
  const d = new Date(Date.UTC(year, month, 0));
  return `${year}-${String(month).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The period a kind names, anchored on a day: the selected reporting week,
 * or the calendar month / quarter / year `anchor` falls in.
 */
export function screeningPeriod(
  kind: ScreeningPeriodKind,
  anchor: string,
  week: WeekDef | null,
): ScreeningPeriod {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  switch (kind) {
    case "week": {
      if (!week) {
        return { kind, label: "Reporting week", start: anchor, end: anchor };
      }
      return { kind, label: week.label, start: week.start, end: week.end, week: week.label };
    }
    case "month": {
      const mm = String(month).padStart(2, "0");
      return {
        kind,
        label: `${MONTHS[month - 1]} ${year}`,
        start: `${year}-${mm}-01`,
        end: lastDayOfMonth(year, month),
      };
    }
    case "quarter": {
      const q = Math.floor((month - 1) / 3) + 1;
      const first = (q - 1) * 3 + 1;
      return {
        kind,
        label: `Q${q} ${year}`,
        start: `${year}-${String(first).padStart(2, "0")}-01`,
        end: lastDayOfMonth(year, first + 2),
      };
    }
    case "year":
      return { kind, label: `Year ${year}`, start: `${year}-01-01`, end: `${year}-12-31` };
    default:
      return { kind: "all", label: "All time", start: "", end: "" };
  }
}

/** Whether an entry falls in the period — by week label for a week, else by day. */
export function entryInPeriod(
  e: Pick<DailyEntry, "date" | "week">,
  period: ScreeningPeriod,
): boolean {
  if (period.week) return e.week === period.week;
  if (period.kind === "all") return true;
  return e.date >= period.start && e.date <= period.end;
}

/** The reporting weeks a period spans — what the scan fetch has to ask for. */
export function weeksInPeriod(period: ScreeningPeriod, weeks: WeekDef[]): WeekDef[] {
  if (period.week) return weeks.filter((w) => w.label === period.week);
  if (period.kind === "all") return weeks;
  // A week belongs to the period when any of its days does.
  return weeks.filter((w) => w.end >= period.start && w.start <= period.end);
}

export interface ScreeningExportInput {
  /** The office exported, or "" for every office. */
  office: string;
  period: ScreeningPeriod;
  /** The daily log the caller may read — filtered here to screening counts. */
  entries: DailyEntry[];
  /** The underlying scan rows for the period, when the caller fetched them. */
  scans?: TruckScan[];
  weeks: WeekDef[];
  /** ISO instant and the officer's name, for the Summary sheet. */
  generatedAt: string;
  generatedBy: string;
}

/** How a figure entered the system, in words the section uses. */
export function entrySource(e: DailyEntry): string {
  if (e.source === "scan-log") return "Posted from scan log";
  if (e.updatedBy === "seed") return "Daily summary workbook";
  return "Typed on Daily Updates";
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The file name the download carries — office, period, day generated. */
export function screeningExportFilename(
  office: string,
  period: ScreeningPeriod,
  generatedOn: string,
): string {
  const who = office ? slug(office) : "all-offices";
  const when =
    period.week ? slug(period.week.split(" — ")[0]) : slug(period.label);
  return `border-screening-${who}-${when}-${generatedOn}.xlsx`;
}

/**
 * The screening entries the export covers: count entries against the
 * screening metric, in the period, for the office (every office when none).
 */
export function exportedEntries(
  input: Pick<ScreeningExportInput, "office" | "period" | "entries">,
): DailyEntry[] {
  return screeningEntries(input.entries)
    .filter((e) => entryInPeriod(e, input.period))
    .filter((e) => !input.office || e.border === input.office)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.border || "").localeCompare(b.border || ""),
    );
}

const UNSPECIFIED = "Head office / other";

/** Build the workbook's sheets. */
export function buildScreeningWorkbook(input: ScreeningExportInput): WorkbookSheet[] {
  const entries = exportedEntries(input);
  const key = vehicleScreeningKey();
  const sums = borderSums(entries, key);
  const offices = Object.keys(sums.byBorder).sort((a, b) => a.localeCompare(b));
  if (sums.unspecified > 0) offices.push(UNSPECIFIED);
  const officeOf = (e: DailyEntry) => e.border || UNSPECIFIED;

  // Days with a figure, per office and overall.
  const daysByOffice = new Map<string, Set<string>>();
  const dates = new Set<string>();
  for (const e of entries) {
    dates.add(e.date);
    const o = officeOf(e);
    if (!daysByOffice.has(o)) daysByOffice.set(o, new Set());
    daysByOffice.get(o)!.add(e.date);
  }

  const summary: CellValue[][] = [
    ["Item", "Value"],
    ["Office", input.office || "All inland offices"],
    ["Reporting period", input.period.label],
    ["From", input.period.start || "Earliest record"],
    ["To", input.period.end || "Latest record"],
    ["Vehicles screened", sums.total],
    ["Days with a figure", dates.size],
    ["Offices reporting", offices.length],
    ["Entries", entries.length],
    ...(input.scans ? [["Truck scans (underlying rows)", input.scans.length] as CellValue[]] : []),
    ["Generated on", input.generatedAt],
    ["Generated by", input.generatedBy],
    ["Source", "RPA Reporting System — Daily Updates (work plan output 1.3.12)"],
    [],
    ["Office", "Days reported", "Vehicles screened"],
    ...offices.map((o) => [
      o,
      daysByOffice.get(o)?.size || 0,
      o === UNSPECIFIED ? sums.unspecified : sums.byBorder[o] || 0,
    ]),
    ["Total", dates.size, sums.total],
  ];

  // Daily totals: a row per day, a column per office, the day's total.
  const byDay = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const v = typeof e.value === "number" && Number.isFinite(e.value) ? e.value : 0;
    const day = byDay.get(e.date) || new Map<string, number>();
    const o = officeOf(e);
    day.set(o, (day.get(o) || 0) + v);
    byDay.set(e.date, day);
  }
  const daily: CellValue[][] = [
    ["Date", "Reporting week", ...offices, "Total"],
    ...[...byDay.keys()].sort().map((date) => {
      const day = byDay.get(date)!;
      const perOffice = offices.map((o) => day.get(o) ?? null);
      const total = perOffice.reduce<number>((n, v) => n + (v || 0), 0);
      return [date, weekForDate(date, input.weeks)?.label || "", ...perOffice, total];
    }),
  ];
  if (byDay.size) {
    daily.push([
      "Total",
      "",
      ...offices.map((o) => (o === UNSPECIFIED ? sums.unspecified : sums.byBorder[o] || 0)),
      sums.total,
    ]);
  }

  const entrySheet: CellValue[][] = [
    [
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
    ],
    ...entries.map((e) => [
      e.date,
      e.week,
      officeOf(e),
      typeof e.value === "number" ? e.value : 0,
      entrySource(e),
      e.loggedByName || e.updatedByName || (e.updatedBy === "seed" ? "Import" : ""),
      e.loggedBy ? e.updatedByName || "" : "",
      e.text || "",
      e.createdAt || "",
      e.id,
    ]),
  ];

  const sheets: WorkbookSheet[] = [
    { name: "Summary", rows: summary },
    { name: "Daily totals", rows: daily },
    { name: "Entries", rows: entrySheet },
  ];

  if (input.scans) {
    const scans = [...input.scans]
      .filter((s) => !input.office || s.border === input.office)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.border.localeCompare(b.border) ||
          (a.time || "").localeCompare(b.time || ""),
      );
    sheets.push({
      name: "Truck scans",
      rows: [
        [
          "Date",
          "Time",
          "Office",
          "Reporting week",
          "Vehicle ID",
          "ID kind",
          "Direction",
          "Cargo class",
          "Commodity",
          "NORM",
          "Transporter",
          "Dose (nSv/h)",
          "Result",
          "Action",
          "Remarks",
          "Officer",
        ],
        ...scans.map((s) => [
          s.date,
          s.time || "",
          s.border,
          s.week,
          s.vehicleId,
          s.vehicleIdKind,
          s.direction || "",
          s.cargoClass,
          s.commodity,
          s.norm ? "Yes" : "",
          s.transporter,
          s.doseNSvH,
          s.result,
          s.action || "",
          s.remarks || "",
          s.officerName || "",
        ]),
      ],
    });
  }

  return sheets;
}
