/**
 * Pure logic for the border scan log — the per-truck record the Nuclear
 * Safety, Security & Safeguards section's border offices keep, and everything
 * the daily and weekly reports need to derive from it.
 *
 * WHAT THIS REPLACES
 *
 * The monthly workbook holds one sheet per day and one row per scanned truck:
 * registration/chassis number, cargo (typed into one of three columns — goods
 * of interest, food, other), transporter/declarant, and the dose rate in
 * nSv/h. Beside those rows, the officer hand-typed a tally block: every
 * distinct commodity and how many trucks carried it, once for each of the
 * three columns. On a 400-truck day that tally is a long afternoon, and it is
 * the part most likely to be wrong — in the June 2026 Nakonde book the tally
 * counts and the row counts disagree on 19 of 30 days.
 *
 * Everything in that block is computed here instead (`summariseScans`), so the
 * capture form only ever asks for what genuinely varies truck to truck.
 *
 * WHAT IT ADDS
 *
 * The workbook records a dose but nothing about what happened next, so a month
 * of scans cannot answer "how many readings were above background, and what did
 * we do about them?" — the question a weekly report exists to answer. Each scan
 * therefore carries a derived `result` and, once a reading is above background,
 * the action taken.
 */
import {
  CARGO_CLASSES,
  resolveCommodity,
  resolveTransporter,
  normaliseTerm,
  type CargoClass,
} from "./borderCargo";
import {
  SCAN_RESULTS,
  type ScanAction,
  type ScanDirection,
  type ScanResult,
  type TruckScan,
  type VehicleIdKind,
} from "./types";

// ---------------------------------------------------------------------------
// Dose triage
// ---------------------------------------------------------------------------

/**
 * Review thresholds in nSv/h. These are OPERATIONAL triggers for the lane, not
 * regulatory limits: they decide when a truck gets a second look, nothing more.
 *
 * Natural background at the northern posts reads 20–100 nSv/h on the handheld
 * monitors (the June 2026 Nakonde log is almost entirely 20–100, clustered on
 * 90). ELEVATED is set well clear of that so ordinary NORM cargo does not cry
 * wolf, and ALARM at 1 µSv/h.
 *
 * The section can move these; they are read from one place so that moving them
 * re-triages the UI, the summaries and the weekly report together.
 */
export const DOSE_BACKGROUND_MAX_NSV = 150;
export const DOSE_ELEVATED_NSV = 300;
export const DOSE_ALARM_NSV = 1000;

/**
 * Above this, a reading is far more likely to be a typing slip or a unit mix-up
 * (µSv/h typed into a nSv/h field) than a real measurement, so the form asks
 * the officer to confirm rather than silently recording it.
 */
export const DOSE_IMPLAUSIBLE_NSV = 100_000;

/** The dose readings the monitors produce most often, as one-tap chips. */
export const DOSE_QUICK_VALUES = [20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

/** Triage one reading. */
export function doseResult(nSvH: number): ScanResult {
  if (!Number.isFinite(nSvH)) return "Normal";
  if (nSvH >= DOSE_ALARM_NSV) return "Alarm";
  if (nSvH >= DOSE_ELEVATED_NSV) return "Elevated";
  return "Normal";
}

/** Plain-language explanation of a reading, shown live under the dose field. */
export function doseGuidance(nSvH: number): string {
  if (!Number.isFinite(nSvH)) return "";
  if (nSvH >= DOSE_ALARM_NSV) {
    return "Alarm — refer for secondary inspection and record the action taken.";
  }
  if (nSvH >= DOSE_ELEVATED_NSV) {
    return "Above background — re-scan, confirm the cargo, and record the action taken.";
  }
  if (nSvH > DOSE_BACKGROUND_MAX_NSV) {
    return "Slightly above the usual background at this post — normal for NORM cargo.";
  }
  return "Background.";
}

// ---------------------------------------------------------------------------
// Vehicle identification
// ---------------------------------------------------------------------------

/**
 * Tidy a registration or chassis number: upper case, drop the spaces officers
 * type inconsistently ("T 361 DVG" and "T361DVG" are the same truck), keep the
 * hyphens that are part of a chassis number.
 */
export function normaliseVehicleId(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const TZ_PLATE = /^T\d{3}[A-Z]{3}$/;
const ZM_PLATE = /^[A-Z]{3}\d{3,4}(?:ZM)?$/;
const CHASSIS = /^[A-Z0-9]{2,}-\d{4,}$/;

/** Classify an identifier by shape — plate, chassis number or VIN. */
export function vehicleIdKind(id: string): VehicleIdKind {
  const v = normaliseVehicleId(id);
  if (!v) return "Other";
  if (TZ_PLATE.test(v) || ZM_PLATE.test(v)) return "Plate";
  if (CHASSIS.test(v)) return "Chassis";
  if (v.length === 17 && /^[A-Z0-9]+$/.test(v)) return "VIN";
  return "Other";
}

// ---------------------------------------------------------------------------
// Building and validating a scan
// ---------------------------------------------------------------------------

/** What the capture form holds while the officer is filling it in. */
export interface ScanDraft {
  vehicleId: string;
  commodity: string;
  cargoClass: CargoClass;
  transporter: string;
  /** Kept as text so a half-typed number never reads as 0. */
  dose: string;
  direction?: ScanDirection;
  action?: ScanAction;
  remarks?: string;
}

export function emptyDraft(direction?: ScanDirection): ScanDraft {
  return {
    vehicleId: "",
    commodity: "",
    cargoClass: "Goods of Interest",
    transporter: "",
    dose: "",
    direction,
    remarks: "",
  };
}

export type ScanField = "vehicleId" | "commodity" | "transporter" | "dose" | "action";

export interface ScanValidation {
  ok: boolean;
  errors: Partial<Record<ScanField, string>>;
  /** Non-blocking — shown, but the officer can save anyway. */
  warnings: Partial<Record<ScanField, string>>;
  /** Parsed dose, NaN when the field will not parse. */
  doseNSvH: number;
  result: ScanResult;
}

/**
 * Validate a draft. The rules come straight from what went wrong in the
 * workbooks: doses recorded as "4O" (letter O), "8-", "90]" and "7090"; cargo
 * columns left blank on 97 rows; a dose reading typed into the cargo column.
 *
 * `confirmedImplausible` lets an officer stand by a reading the form flagged —
 * a genuine alarm can be very high, and the form must never make a real
 * detection harder to record than a routine pass.
 */
export function validateScan(
  draft: ScanDraft,
  opts: { confirmedImplausible?: boolean } = {},
): ScanValidation {
  const errors: Partial<Record<ScanField, string>> = {};
  const warnings: Partial<Record<ScanField, string>> = {};

  const vehicleId = normaliseVehicleId(draft.vehicleId);
  if (!vehicleId) {
    errors.vehicleId = "Registration or chassis number is required.";
  } else if (vehicleId.length < 4) {
    warnings.vehicleId = "That looks short for a registration or chassis number.";
  }

  if (!draft.commodity.trim()) {
    errors.commodity = "What is on the truck? Pick or type the cargo.";
  }

  if (!draft.transporter.trim()) {
    errors.transporter = "Transporter or declarant is required.";
  }

  // Dose: must be a plain number. "4O", "8-" and "90]" all land here.
  const raw = draft.dose.trim();
  let doseNSvH = Number.NaN;
  if (!raw) {
    errors.dose = "Dose rate is required — enter the reading in nSv/h.";
  } else if (!/^\d+(?:\.\d+)?$/.test(raw)) {
    errors.dose = "Numbers only, in nSv/h (e.g. 90).";
  } else {
    doseNSvH = Number(raw);
    if (!Number.isFinite(doseNSvH) || doseNSvH < 0) {
      errors.dose = "Numbers only, in nSv/h (e.g. 90).";
    } else if (doseNSvH >= DOSE_IMPLAUSIBLE_NSV && !opts.confirmedImplausible) {
      errors.dose = `${doseNSvH.toLocaleString()} nSv/h is unusually high — confirm the reading and the unit (nSv/h, not µSv/h).`;
    }
  }

  const result = doseResult(doseNSvH);
  if (result !== "Normal" && !draft.action) {
    errors.action = "Record what was done with this truck.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    warnings,
    doseNSvH,
    result,
  };
}

/**
 * Turn a validated draft into the record that gets stored — resolving the
 * commodity and transporter to their canonical spellings and deriving
 * everything derivable, so two officers logging the same truck produce the
 * same row.
 */
export function buildScan(
  draft: ScanDraft,
  context: {
    date: string;
    week: string;
    border: string;
    time?: string;
    officerUid?: string;
    officerName?: string;
  },
): Omit<TruckScan, "id"> {
  const validation = validateScan(draft, { confirmedImplausible: true });
  const resolved = resolveCommodity(draft.commodity, draft.cargoClass);
  const vehicleId = normaliseVehicleId(draft.vehicleId);

  const scan: Omit<TruckScan, "id"> = {
    date: context.date,
    week: context.week,
    border: context.border,
    vehicleId,
    vehicleIdKind: vehicleIdKind(vehicleId),
    cargoClass: resolved ? resolved.class : draft.cargoClass,
    commodity: resolved ? resolved.name : draft.commodity.trim(),
    transporter: resolveTransporter(draft.transporter),
    doseNSvH: validation.doseNSvH,
    result: validation.result,
  };

  // Firestore rejects undefined, so optional fields are only set when present.
  if (context.time) scan.time = context.time;
  if (resolved?.norm) scan.norm = true;
  if (draft.direction) scan.direction = draft.direction;
  if (draft.action) scan.action = draft.action;
  const remarks = draft.remarks?.trim();
  if (remarks) scan.remarks = remarks;
  if (context.officerUid) scan.officerUid = context.officerUid;
  if (context.officerName) scan.officerName = context.officerName;

  return scan;
}

/** HH:MM in the local (Zambia) clock — stamped on each scan as it is saved. */
export function nowHHMM(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Summaries — everything the workbook tallied by hand
// ---------------------------------------------------------------------------

export interface Tally {
  name: string;
  count: number;
}

function tally(values: string[]): Tally[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface DoseStats {
  min: number;
  max: number;
  mean: number;
  median: number;
}

function doseStats(values: number[]): DoseStats {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return { min: 0, max: 0, mean: 0, median: 0 };
  const sum = clean.reduce((a, b) => a + b, 0);
  const mid = Math.floor(clean.length / 2);
  return {
    min: clean[0],
    max: clean[clean.length - 1],
    mean: Math.round(sum / clean.length),
    median:
      clean.length % 2 ? clean[mid] : Math.round((clean[mid - 1] + clean[mid]) / 2),
  };
}

function emptyByClass(): Record<CargoClass, number> {
  return { "Goods of Interest": 0, Food: 0, Other: 0 };
}

function emptyByResult(): Record<ScanResult, number> {
  return { Normal: 0, Elevated: 0, Alarm: 0 };
}

export interface ScanSummary {
  total: number;
  byClass: Record<CargoClass, number>;
  /** The three tally blocks the workbook kept by hand, one per cargo class. */
  commodities: Record<CargoClass, Tally[]>;
  transporters: Tally[];
  byResult: Record<ScanResult, number>;
  /** Elevated or alarming readings — the ones the weekly report is about. */
  aboveBackground: TruckScan[];
  /** Of those, how many were on cargo that commonly carries NORM. */
  aboveBackgroundOnNorm: number;
  actions: Tally[];
  dose: DoseStats;
  /** Commodities typed in that are not yet in the controlled vocabulary. */
  newCommodities: Tally[];
  /** Units logged more than once — a double entry, or a genuine second pass. */
  repeatedVehicles: Tally[];
  /** Transporter spellings that look like the same firm typed two ways. */
  possibleDuplicateTransporters: Array<[string, string]>;
  byDirection: Record<string, number>;
  byHour: Array<{ hour: string; count: number }>;
}

/**
 * Everything a day (or any other slice) tallies to. This is the whole of the
 * workbook's summary block, plus the questions it could not answer.
 */
export function summariseScans(scans: TruckScan[]): ScanSummary {
  const byClass = emptyByClass();
  const byResult = emptyByResult();
  const byClassCommodities: Record<CargoClass, string[]> = {
    "Goods of Interest": [],
    Food: [],
    Other: [],
  };
  const aboveBackground: TruckScan[] = [];
  const byDirection: Record<string, number> = {};
  const hourCounts = new Map<string, number>();

  for (const s of scans) {
    const cls: CargoClass = CARGO_CLASSES.includes(s.cargoClass)
      ? s.cargoClass
      : "Other";
    byClass[cls] += 1;
    if (s.commodity) byClassCommodities[cls].push(s.commodity);

    const result: ScanResult = SCAN_RESULTS.includes(s.result)
      ? s.result
      : doseResult(s.doseNSvH);
    byResult[result] += 1;
    if (result !== "Normal") aboveBackground.push(s);

    if (s.direction) byDirection[s.direction] = (byDirection[s.direction] || 0) + 1;
    if (s.time && /^\d{2}:\d{2}$/.test(s.time)) {
      const hour = `${s.time.slice(0, 2)}:00`;
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }
  }

  // A commodity is "new" when it is not in the controlled vocabulary — the
  // officer typed it. Surfacing them is how the vocabulary grows on purpose.
  const newCommodities = tally(
    scans
      .map((s) => s.commodity)
      .filter((name) => {
        const resolved = resolveCommodity(name);
        return !!resolved && !resolved.known;
      }),
  );

  const repeatedVehicles = tally(scans.map((s) => s.vehicleId)).filter(
    (t) => t.count > 1,
  );

  return {
    total: scans.length,
    byClass,
    commodities: {
      "Goods of Interest": tally(byClassCommodities["Goods of Interest"]),
      Food: tally(byClassCommodities.Food),
      Other: tally(byClassCommodities.Other),
    },
    transporters: tally(scans.map((s) => s.transporter)),
    byResult,
    aboveBackground: aboveBackground.sort((a, b) => b.doseNSvH - a.doseNSvH),
    aboveBackgroundOnNorm: aboveBackground.filter((s) => s.norm).length,
    actions: tally(scans.map((s) => s.action || "")),
    dose: doseStats(scans.map((s) => s.doseNSvH)),
    newCommodities,
    repeatedVehicles,
    possibleDuplicateTransporters: findNearDuplicates(
      tally(scans.map((s) => s.transporter)).map((t) => t.name),
    ),
    byDirection,
    byHour: [...hourCounts.entries()]
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour)),
  };
}

/**
 * Names that are probably the same firm typed two ways — one edit apart, or one
 * a whole-word prefix of the other ("Spot On" / "Spot On Cargo"). Reported, not
 * merged: collapsing two real companies is a worse error than listing both, so
 * a human decides.
 */
export function findNearDuplicates(names: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const keys = names.map((n) => ({ name: n, key: normaliseTerm(n) }));
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      if (!a.key || !b.key || a.key === b.key) continue;
      const prefix =
        (b.key.startsWith(a.key + " ") || a.key.startsWith(b.key + " ")) &&
        Math.min(a.key.length, b.key.length) >= 3;
      if (prefix || editDistanceAtMostOne(a.key, b.key)) {
        pairs.push([a.name, b.name]);
      }
    }
  }
  return pairs;
}

/** True when one string becomes the other with a single edit. */
function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  // Too short to tell a typo from a different name.
  if (Math.min(a.length, b.length) < 4) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// ---------------------------------------------------------------------------
// Week rollup
// ---------------------------------------------------------------------------

export interface BorderWeekRow {
  border: string;
  total: number;
  elevated: number;
  alarms: number;
  maxDose: number;
  /** Days in the week this post logged anything at all. */
  daysReported: number;
}

export interface WeekScanSummary extends ScanSummary {
  week: string;
  byDay: Array<{ date: string; total: number }>;
  byBorder: BorderWeekRow[];
}

/** Roll a week's scans up for the weekly report — per day and per post. */
export function summariseWeek(scans: TruckScan[], week: string): WeekScanSummary {
  const weekScans = scans.filter((s) => s.week === week);
  const base = summariseScans(weekScans);

  const dayCounts = new Map<string, number>();
  const borders = new Map<string, { rows: TruckScan[]; days: Set<string> }>();
  for (const s of weekScans) {
    dayCounts.set(s.date, (dayCounts.get(s.date) || 0) + 1);
    const entry = borders.get(s.border) || { rows: [], days: new Set<string>() };
    entry.rows.push(s);
    entry.days.add(s.date);
    borders.set(s.border, entry);
  }

  const byBorder: BorderWeekRow[] = [...borders.entries()]
    .map(([border, { rows, days }]) => ({
      border,
      total: rows.length,
      elevated: rows.filter((r) => r.result === "Elevated").length,
      alarms: rows.filter((r) => r.result === "Alarm").length,
      maxDose: rows.reduce((m, r) => Math.max(m, r.doseNSvH || 0), 0),
      daysReported: days.size,
    }))
    .sort((a, b) => b.total - a.total || a.border.localeCompare(b.border));

  return {
    ...base,
    week,
    byDay: [...dayCounts.entries()]
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byBorder,
  };
}

/**
 * The weekly report paragraph, written from the scans themselves — the section
 * pastes this rather than retyping counts off a spreadsheet.
 */
export function weeklyNarrative(summary: WeekScanSummary): string {
  if (!summary.total) return "No trucks were scanned at the border posts this week.";

  const posts = summary.byBorder.map((b) => `${b.border} ${b.total}`).join(", ");
  const top = summary.commodities["Goods of Interest"]
    .slice(0, 5)
    .map((t) => `${t.name} (${t.count})`)
    .join(", ");

  const lines = [
    `${summary.total.toLocaleString()} trucks were scanned for radiation at the border posts during ${summary.week}${
      posts ? ` — ${posts}` : ""
    }.`,
  ];

  if (top) lines.push(`The main goods of interest were ${top}.`);

  // Only the classes that actually moved get a sentence — "and 0 of other
  // goods" is noise in a report someone has to read.
  const alsoCarried = [
    summary.byClass.Food
      ? `${summary.byClass.Food} consignment${summary.byClass.Food === 1 ? "" : "s"} of food`
      : "",
    summary.byClass.Other
      ? `${summary.byClass.Other} of other goods`
      : "",
  ].filter(Boolean);
  if (alsoCarried.length) {
    lines.push(
      `${alsoCarried.join(" and ")} ${alsoCarried.length === 1 && summary.byClass.Food === 1 ? "was" : "were"} also scanned.`,
    );
  }

  const above = summary.byResult.Elevated + summary.byResult.Alarm;
  if (above === 0) {
    lines.push(
      `All readings were at background (highest ${summary.dose.max} nSv/h, typical ${summary.dose.median} nSv/h). No consignment required further action.`,
    );
  } else {
    const actions = summary.actions
      .filter((a) => a.name)
      .map((a) => `${a.name.toLowerCase()} (${a.count})`)
      .join(", ");
    lines.push(
      `${above} reading${above === 1 ? " was" : "s were"} above background${
        summary.byResult.Alarm ? ` (${summary.byResult.Alarm} at alarm level)` : ""
      }, the highest at ${summary.dose.max} nSv/h${
        summary.aboveBackgroundOnNorm
          ? `; ${summary.aboveBackgroundOnNorm} involved cargo that commonly carries naturally occurring radioactive material`
          : ""
      }.`,
    );
    if (actions) lines.push(`Action taken: ${actions}.`);
  }

  return lines.join(" ");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const CSV_COLUMNS: Array<[string, (s: TruckScan) => string | number]> = [
  ["Date", (s) => s.date],
  ["Time", (s) => s.time || ""],
  ["Border post", (s) => s.border],
  ["Reg / chassis number", (s) => s.vehicleId],
  ["ID type", (s) => s.vehicleIdKind],
  ["Direction", (s) => s.direction || ""],
  ["Cargo class", (s) => s.cargoClass],
  ["Commodity", (s) => s.commodity],
  ["NORM-bearing", (s) => (s.norm ? "Yes" : "")],
  ["Transporter / declarant", (s) => s.transporter],
  ["Dose (nSv/h)", (s) => (Number.isFinite(s.doseNSvH) ? s.doseNSvH : "")],
  ["Result", (s) => s.result],
  ["Action taken", (s) => s.action || ""],
  ["Remarks", (s) => s.remarks || ""],
  ["Officer", (s) => s.officerName || ""],
];

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The scan log as CSV — the row-level record, for the file the post keeps. */
export function scansToCsv(scans: TruckScan[]): string {
  const header = CSV_COLUMNS.map(([label]) => csvCell(label)).join(",");
  const rows = scans.map((s) =>
    CSV_COLUMNS.map(([, get]) => csvCell(get(s))).join(","),
  );
  return [header, ...rows].join("\n");
}

/**
 * The summary as CSV — the tally blocks the workbook kept beside the rows,
 * computed. Same shape the section is used to reading, so nothing is lost in
 * the move off the spreadsheet.
 */
export function summaryToCsv(summary: ScanSummary): string {
  const lines: string[] = [["Section", "Item", "Count"].join(",")];
  const push = (section: string, name: string, count: number | string) =>
    lines.push([csvCell(section), csvCell(name), csvCell(count)].join(","));

  push("Totals", "Trucks scanned", summary.total);
  for (const cls of CARGO_CLASSES) push("Totals", cls, summary.byClass[cls]);
  for (const r of SCAN_RESULTS) push("Result", r, summary.byResult[r]);
  push("Dose (nSv/h)", "Highest", summary.dose.max);
  push("Dose (nSv/h)", "Typical (median)", summary.dose.median);
  push("Dose (nSv/h)", "Lowest", summary.dose.min);
  for (const cls of CARGO_CLASSES) {
    for (const t of summary.commodities[cls]) push(cls, t.name, t.count);
  }
  for (const t of summary.transporters) push("Transporter / declarant", t.name, t.count);
  for (const t of summary.actions.filter((a) => a.name)) {
    push("Action taken", t.name, t.count);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers the capture screen leans on
// ---------------------------------------------------------------------------

/** Scans for one post on one day, newest first — the shift's running list. */
export function scansForShift(
  scans: TruckScan[],
  border: string,
  date: string,
): TruckScan[] {
  return scans
    .filter((s) => s.border === border && s.date === date)
    .sort((a, b) => (b.time || "").localeCompare(a.time || "") || b.id.localeCompare(a.id));
}

/**
 * Transporters this post has actually logged, most-used first, with the seed
 * list behind them. The picker gets better the more the post uses it.
 */
export function knownTransporters(
  scans: TruckScan[],
  seed: string[],
  border?: string,
): string[] {
  const relevant = border ? scans.filter((s) => s.border === border) : scans;
  const used = tally(relevant.map((s) => s.transporter)).map((t) => t.name);
  const seen = new Set(used.map(normaliseTerm));
  return [...used, ...seed.filter((s) => !seen.has(normaliseTerm(s)))];
}

/**
 * Has this unit already been logged at this post today? Catches the double
 * entry that happens when a queue is busy — and, when it is not a mistake, the
 * officer confirms and the second pass is recorded as its own scan.
 */
export function findSameDayScan(
  scans: TruckScan[],
  vehicleId: string,
  border: string,
  date: string,
): TruckScan | null {
  const id = normaliseVehicleId(vehicleId);
  if (!id) return null;
  return (
    scans.find(
      (s) => s.border === border && s.date === date && s.vehicleId === id,
    ) || null
  );
}

/**
 * The commodity and transporter this unit carried last time it came through —
 * regular runs repeat, so the form can offer the previous answer instead of
 * asking the same question again.
 */
export function lastSeenDetails(
  scans: TruckScan[],
  vehicleId: string,
): { commodity: string; cargoClass: CargoClass; transporter: string } | null {
  const id = normaliseVehicleId(vehicleId);
  if (!id) return null;
  const previous = scans
    .filter((s) => s.vehicleId === id)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!previous) return null;
  return {
    commodity: previous.commodity,
    cargoClass: previous.cargoClass,
    transporter: previous.transporter,
  };
}
