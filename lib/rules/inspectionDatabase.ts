/**
 * The Inspectorate's inspection database — the section's own 2026 workbook,
 * derived instead of typed.
 *
 * The workbook has three layers and this module reproduces all three from the
 * dated inspection register, so nobody keeps a spreadsheet alongside the system:
 *
 * 1. **A province sheet per inspection round** (Lusaka, Southern, "Copperbelt
 *    Phase 2", …): one row per facility, with the four inspection-type columns
 *    (PRE-AUTH / PLANNED / FOLLOW-UP / INVESTIGATIVE), their TOTAL, the
 *    ENFORCEMENT ACTION TAKEN, and the inspection card's issue date, expiry and
 *    status. Facilities that have not been inspected still appear, at zero —
 *    that is how the sheet doubles as the round's coverage list.
 * 2. **The consolidated Database sheet**: every province sheet stacked, with
 *    PROVINCE as the leading column.
 * 3. **The Summary sheet**: one row per province round, with INSPECTIONS and
 *    ENFORCEMENT ACTIONS grouped across the top, a Total row, and the two
 *    headline figures — Total Inspections Conducted and Total Enforcements.
 *
 *    The enforcement band is Management's six-column format (Written Notice ·
 *    Suspension of Practice · Seizure of Device · Enforcement Notice ·
 *    Suspension of License · Cancellation of License). Engagements are still
 *    recorded against an inspection and still show on the province sheet's
 *    ENFORCEMENT ACTION TAKEN column, but the summary no longer bands them and
 *    they do not count toward its Total Enforcements.
 *
 * Everything here is pure: the caller filters the register to a period (a
 * reporting week, a month, the year) and passes it in, which is what lets the
 * weekly report and the dashboard show the same table over different spans.
 */
import { toISO, parseISO } from "./week";
import { norm } from "./matching";
import {
  PROVINCES,
  type Facility,
  type Inspection,
  type InspectionType,
} from "./types";

/**
 * The enforcement vocabulary, verbatim from the workbook's Source list — the
 * dropdown the ENFORCEMENT ACTION TAKEN column is validated against.
 *
 * The spelling is the workbook's own ("License", not the "Licence" used
 * everywhere else in this codebase). It is kept exactly so an exported database
 * pastes back into the workbook's validated column, and so the Summary's
 * COUNTIF wording and ours stay one vocabulary.
 */
export const ENFORCEMENT_ACTIONS = [
  "Engagement at Facility Level",
  "Engagement at District Level",
  "Engagement at Provincial Level",
  "Seizure of Device",
  "Suspension of Practice",
  "Written Warning",
  "Enforcement Notice",
  "Suspension of License",
  "Cancellation of License",
] as const;
export type EnforcementAction = (typeof ENFORCEMENT_ACTIONS)[number];

export function isEnforcementAction(v: string): v is EnforcementAction {
  return (ENFORCEMENT_ACTIONS as readonly string[]).includes(v);
}

/**
 * The four inspection columns of a province sheet, in the workbook's order,
 * and the register type each one counts. "Planned" is the workbook's word for
 * a routine inspection (the sheets also head it "ROUTINE" — same column).
 *
 * `Enforcement Action` is deliberately not a column: in this workbook an
 * enforcement is not a kind of inspection, it is what an inspection *led to*,
 * and it is counted in the ENFORCEMENT ACTION TAKEN column instead.
 */
export const INSPECTION_COLUMNS = [
  { key: "preAuth", label: "Pre-Auth", type: "Pre-Authorisation" },
  { key: "planned", label: "Planned", type: "Routine Inspection" },
  { key: "followUp", label: "Follow-Up", type: "Follow-up" },
  { key: "investigative", label: "Investigative", type: "Investigation" },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  type: InspectionType;
}>;

export type InspectionColumnKey = (typeof INSPECTION_COLUMNS)[number]["key"];

export type InspectionCounts = Record<InspectionColumnKey, number>;

const COLUMN_FOR_TYPE = new Map<InspectionType, InspectionColumnKey>(
  INSPECTION_COLUMNS.map((c) => [c.type, c.key]),
);

/** The column an inspection of this type is counted in, if any. */
export function inspectionColumn(t: InspectionType): InspectionColumnKey | null {
  return COLUMN_FOR_TYPE.get(t) ?? null;
}

/**
 * The Summary sheet's enforcement band — the six ENFORCEMENT ACTIONS in the
 * order Management's summary prints them. Label and action are separate
 * because the summary heads the register's "Written Warning" as "Written
 * Notice"; the stored value is left alone so existing records keep counting.
 *
 * The three engagements are deliberately not columns here: they stay in the
 * vocabulary (the province sheet shows them), but the summary reports
 * enforcement actions only.
 */
export const ENFORCEMENT_COLUMNS = [
  {
    key: "Written Warning",
    label: "Written Notice",
    group: "ENFORCEMENT ACTIONS",
  },
  {
    key: "Suspension of Practice",
    label: "Suspension of Practice",
    group: "ENFORCEMENT ACTIONS",
  },
  {
    key: "Seizure of Device",
    label: "Seizure of Device",
    group: "ENFORCEMENT ACTIONS",
  },
  {
    key: "Enforcement Notice",
    label: "Enforcement Notice",
    group: "ENFORCEMENT ACTIONS",
  },
  {
    key: "Suspension of License",
    label: "Suspension of License",
    group: "ENFORCEMENT ACTIONS",
  },
  {
    key: "Cancellation of License",
    label: "Cancellation of License",
    group: "ENFORCEMENT ACTIONS",
  },
] as const satisfies ReadonlyArray<{
  key: EnforcementAction;
  label: string;
  group: "ENFORCEMENT ACTIONS";
}>;

export type EnforcementCounts = Record<EnforcementAction, number>;

/** The actions the Summary sheet bands and totals. */
const SUMMARISED_ENFORCEMENTS = new Set<string>(
  ENFORCEMENT_COLUMNS.map((c) => c.key),
);

/** Whether an action is one of the summary's six enforcement columns. */
export function isSummarisedEnforcement(action: string): boolean {
  return SUMMARISED_ENFORCEMENTS.has(action);
}

/** The Authority talking to a facility — recorded, but not an enforcement. */
export const ENGAGEMENT_ACTIONS = ENFORCEMENT_ACTIONS.filter((a) =>
  a.startsWith("Engagement at "),
);

const ENGAGEMENTS = new Set<string>(ENGAGEMENT_ACTIONS);

/**
 * How firmly an action reads on screen: an engagement is the Authority talking
 * to a facility, so it is amber; the six enforcement actions take something
 * away from it, so they are red.
 */
export function enforcementTone(action: string): "amber" | "red" {
  return ENGAGEMENTS.has(action) ? "amber" : "red";
}

// ---------------------------------------------------------------------------
// Inspection cards
// ---------------------------------------------------------------------------

/** An inspection card runs for 30 days from the day it is issued. */
export const CARD_VALID_DAYS = 30;
/** It shows as expiring once it is inside this many days of running out. */
export const CARD_EXPIRING_WITHIN_DAYS = 14;

export const CARD_STATUSES = ["Active", "Expiring Soon", "Expired"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

function shiftDays(date: string, days: number): string {
  const d = parseISO(date);
  // UTC arithmetic on a UTC-anchored date — the result must not depend on the
  // timezone the browser happens to be in.
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** The card's expiry date — issue date + 30 days. Blank in, blank out. */
export function cardExpiry(issued?: string): string {
  return issued ? shiftDays(issued, CARD_VALID_DAYS) : "";
}

/**
 * Active / Expiring Soon / Expired, on the workbook's own thresholds: expired
 * once today is past the expiry date, expiring once today has reached the
 * fortnight before it. Empty when no card has been issued.
 */
export function cardStatus(issued: string | undefined, today: string): CardStatus | "" {
  const expiry = cardExpiry(issued);
  if (!expiry) return "";
  if (today > expiry) return "Expired";
  if (today >= shiftDays(expiry, -CARD_EXPIRING_WITHIN_DAYS)) return "Expiring Soon";
  return "Active";
}

// ---------------------------------------------------------------------------
// Rounds — a province, optionally split into phases
// ---------------------------------------------------------------------------

/**
 * The name of one inspection round: the province, plus the phase when the
 * province was covered in more than one ("Copperbelt Phase 2"). A phase already
 * carrying its province is left alone, so an officer may type either.
 */
export function roundLabel(province: string, phase?: string): string {
  const p = (province || "").trim() || UNASSIGNED;
  const ph = (phase || "").trim();
  if (!ph) return p;
  return norm(ph).startsWith(norm(p)) ? ph : `${p} ${ph}`;
}

/** Where a facility with no province lands — free-text logs, mostly. */
export const UNASSIGNED = "Unassigned";

const PROVINCE_RANK = new Map<string, number>(
  PROVINCES.map((p, i) => [p, i]),
);

function rankOf(province: string): number {
  return PROVINCE_RANK.get(province) ?? PROVINCES.length;
}

// ---------------------------------------------------------------------------
// The database rows — one per facility per round
// ---------------------------------------------------------------------------

export interface DatabaseRow {
  /** NO. — the row's sequence within its round. */
  no: number;
  facilityId: string | null;
  facility: string;
  district: string;
  practice: string;
  province: string;
  /** "" unless the round was phased. */
  phase: string;
  /** province + phase — the workbook's sheet name and Summary row. */
  round: string;
  counts: InspectionCounts;
  /** PRE-AUTH + PLANNED + FOLLOW-UP + INVESTIGATIVE. */
  total: number;
  /** ENFORCEMENT ACTION TAKEN — the most recent action, as the workbook shows. */
  enforcement: EnforcementAction | "";
  /** Every action taken at this facility in the period, most recent first. */
  enforcements: EnforcementAction[];
  /** DATE INSP CARD ISSUED — the most recent card. */
  cardIssued: string;
  cardExpiry: string;
  cardStatus: CardStatus | "";
  /** Date of the most recent inspection in the period ("" when never). */
  lastInspected: string;
  /** The inspections behind the row, most recent first. */
  inspections: Inspection[];
}

export interface BuildOptions {
  /** Local today (YYYY-MM-DD) — drives the card status column. */
  today: string;
  /**
   * Also list register facilities with nothing recorded, at zero, the way a
   * province sheet lists everything the round has to cover. Off by default:
   * the consolidated view is about work done.
   */
  includeUninspected?: boolean;
  /** Restrict to one province (the register's spelling), e.g. a drill-down. */
  province?: string;
}

interface Bucket {
  province: string;
  phase: string;
  round: string;
  facilityId: string | null;
  facility: string;
  district: string;
  practice: string;
  counts: InspectionCounts;
  enforcements: Array<{ date: string; action: EnforcementAction }>;
  cards: string[];
  inspections: Inspection[];
}

function emptyCounts(): InspectionCounts {
  return { preAuth: 0, planned: 0, followUp: 0, investigative: 0 };
}

function facilityKey(i: { facilityId: string | null; facilityName: string }): string {
  return i.facilityId || `name:${norm(i.facilityName)}`;
}

/**
 * Build the database — one row per facility per round, ordered the way the
 * workbook orders its sheets (province order, then phase) and its rows
 * (facility name).
 *
 * `inspections` is whatever slice of the register the caller wants reported:
 * a reporting week for the weekly update, the year for the dashboard.
 */
export function buildInspectionDatabase(
  inspections: Inspection[],
  facilities: Facility[],
  opts: BuildOptions,
): DatabaseRow[] {
  const byId = new Map(facilities.map((f) => [f.id, f]));
  const buckets = new Map<string, Bucket>();

  const bucketFor = (
    key: string,
    seed: () => Omit<Bucket, "counts" | "enforcements" | "cards" | "inspections">,
  ): Bucket => {
    const found = buckets.get(key);
    if (found) return found;
    const created: Bucket = {
      ...seed(),
      counts: emptyCounts(),
      enforcements: [],
      cards: [],
      inspections: [],
    };
    buckets.set(key, created);
    return created;
  };

  for (const i of inspections) {
    const facility = i.facilityId ? byId.get(i.facilityId) : undefined;
    const province = (facility?.province || i.province || "").trim() || UNASSIGNED;
    if (opts.province && province !== opts.province) continue;
    const phase = (i.phase || "").trim();
    const round = roundLabel(province, phase);
    const b = bucketFor(`${round}::${facilityKey(i)}`, () => ({
      province,
      phase,
      round,
      facilityId: i.facilityId,
      facility: facility?.name || i.facilityName,
      district: facility?.district || i.district || "",
      practice: facility?.practice || i.practice || "",
    }));

    const col = inspectionColumn(i.type);
    if (col) b.counts[col] += 1;
    if (i.enforcement && isEnforcementAction(i.enforcement)) {
      b.enforcements.push({ date: i.date || "", action: i.enforcement });
    }
    if (i.cardIssued) b.cards.push(i.cardIssued);
    b.inspections.push(i);
  }

  if (opts.includeUninspected) {
    for (const f of facilities) {
      const province = (f.province || "").trim() || UNASSIGNED;
      if (opts.province && province !== opts.province) continue;
      // A facility already carried by a phased round is covered there; only
      // add the unphased placeholder when it has nothing at all.
      const covered = [...buckets.values()].some((b) => b.facilityId === f.id);
      if (covered) continue;
      bucketFor(`${province}::${f.id}`, () => ({
        province,
        phase: "",
        round: province,
        facilityId: f.id,
        facility: f.name,
        district: f.district || "",
        practice: f.practice || "",
      }));
    }
  }

  const rows: DatabaseRow[] = [...buckets.values()].map((b) => {
    const enforcements = [...b.enforcements].sort((x, y) =>
      (y.date || "").localeCompare(x.date || ""),
    );
    const cardIssued = b.cards.slice().sort().pop() || "";
    const dates = b.inspections
      .map((i) => i.date || "")
      .filter(Boolean)
      .sort();
    return {
      no: 0,
      facilityId: b.facilityId,
      facility: b.facility,
      district: b.district,
      practice: b.practice,
      province: b.province,
      phase: b.phase,
      round: b.round,
      counts: b.counts,
      total:
        b.counts.preAuth +
        b.counts.planned +
        b.counts.followUp +
        b.counts.investigative,
      enforcement: enforcements.length ? enforcements[0].action : "",
      enforcements: enforcements.map((e) => e.action),
      cardIssued,
      cardExpiry: cardExpiry(cardIssued),
      cardStatus: cardStatus(cardIssued, opts.today),
      lastInspected: dates.length ? dates[dates.length - 1] : "",
      inspections: b.inspections
        .slice()
        .sort((x, y) => (y.date || "").localeCompare(x.date || "")),
    };
  });

  rows.sort(
    (a, b) =>
      rankOf(a.province) - rankOf(b.province) ||
      a.province.localeCompare(b.province) ||
      a.phase.localeCompare(b.phase) ||
      a.facility.localeCompare(b.facility),
  );

  // NO. restarts on each sheet, as it does in the workbook.
  let round = "";
  let n = 0;
  for (const r of rows) {
    if (r.round !== round) {
      round = r.round;
      n = 0;
    }
    r.no = ++n;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The Summary sheet
// ---------------------------------------------------------------------------

export interface SummaryRow {
  /** The Summary sheet's PROVINCE column — a round, so phases get their own row. */
  round: string;
  province: string;
  phase: string;
  inspections: InspectionCounts;
  /** The INSPECTIONS group's TOTAL. */
  inspectionsTotal: number;
  /** Every action taken, engagements included — the province sheet needs them. */
  enforcement: EnforcementCounts;
  /** The trailing TOTAL — the six banded enforcement actions only. */
  enforcementTotal: number;
  /** Distinct facilities with at least one inspection in the period. */
  facilities: number;
}

export interface InspectionSummary {
  rows: SummaryRow[];
  /** The Total row. */
  total: SummaryRow;
}

function emptyEnforcement(): EnforcementCounts {
  const out = {} as EnforcementCounts;
  for (const a of ENFORCEMENT_ACTIONS) out[a] = 0;
  return out;
}

function emptySummaryRow(round: string, province = "", phase = ""): SummaryRow {
  return {
    round,
    province,
    phase,
    inspections: emptyCounts(),
    inspectionsTotal: 0,
    enforcement: emptyEnforcement(),
    enforcementTotal: 0,
    facilities: 0,
  };
}

/**
 * Roll the database up into the Summary sheet: a row per round in sheet order,
 * plus the Total row. Rounds where nothing was recorded are dropped — a sheet
 * of zeros is noise on a dashboard, though the province drill-down still lists
 * every facility the round has to cover.
 */
export function summariseInspectionDatabase(rows: DatabaseRow[]): InspectionSummary {
  const byRound = new Map<string, SummaryRow>();
  const order: string[] = [];
  const total = emptySummaryRow("Total");
  let totalFacilities = 0;

  for (const r of rows) {
    let s = byRound.get(r.round);
    if (!s) {
      s = emptySummaryRow(r.round, r.province, r.phase);
      byRound.set(r.round, s);
      order.push(r.round);
    }
    for (const c of INSPECTION_COLUMNS) {
      s.inspections[c.key] += r.counts[c.key];
      total.inspections[c.key] += r.counts[c.key];
    }
    s.inspectionsTotal += r.total;
    total.inspectionsTotal += r.total;
    for (const a of r.enforcements) {
      s.enforcement[a] += 1;
      total.enforcement[a] += 1;
      if (!isSummarisedEnforcement(a)) continue;
      s.enforcementTotal += 1;
      total.enforcementTotal += 1;
    }
    if (r.total > 0) {
      s.facilities += 1;
      totalFacilities += 1;
    }
  }

  total.facilities = totalFacilities;

  const summaryRows = order
    .map((k) => byRound.get(k) as SummaryRow)
    .filter((s) => s.inspectionsTotal > 0 || s.enforcementTotal > 0);

  return { rows: summaryRows, total };
}

// ---------------------------------------------------------------------------
// Exports — the workbook's own layouts, so a download opens as the same sheet
// ---------------------------------------------------------------------------

/** The consolidated Database sheet's columns, verbatim. */
export const DATABASE_CSV_HEADER = [
  "PROVINCE",
  "FACILITY NAME",
  "DISTRICT",
  "PRACTICE",
  "PRE-AUTH",
  "PLANNED",
  "FOLLOW-UP",
  "INVESTIGATIVE",
  "TOTAL",
  "ENFORCEMENT ACTION TAKEN",
  "DATE INSP CARD ISSUED",
  "INSP CARD EXPIRY DATE",
  "INSP CARD STATUS",
];

export function databaseCsvRows(rows: DatabaseRow[]): string[][] {
  return rows.map((r) => [
    r.round,
    r.facility,
    r.district,
    r.practice,
    r.counts.preAuth ? String(r.counts.preAuth) : "",
    r.counts.planned ? String(r.counts.planned) : "",
    r.counts.followUp ? String(r.counts.followUp) : "",
    r.counts.investigative ? String(r.counts.investigative) : "",
    String(r.total),
    r.enforcement,
    r.cardIssued,
    r.cardExpiry,
    r.cardStatus,
  ]);
}

/**
 * The Summary sheet, including its two-tier head (the INSPECTIONS /
 * ENFORCEMENT ACTIONS band above the column names) and the two headline
 * figures underneath.
 */
export function summaryCsvRows(summary: InspectionSummary): string[][] {
  const band = ["", "INSPECTIONS", "", "", "", ""];
  const head = [
    "PROVINCE",
    ...INSPECTION_COLUMNS.map((c) => c.label),
    "TOTAL",
  ];
  let group = "";
  for (const c of ENFORCEMENT_COLUMNS) {
    band.push(c.group === group ? "" : c.group);
    group = c.group;
    head.push(c.label);
  }
  band.push("");
  head.push("TOTAL");

  const line = (s: SummaryRow) => [
    s.round,
    ...INSPECTION_COLUMNS.map((c) => String(s.inspections[c.key])),
    String(s.inspectionsTotal),
    ...ENFORCEMENT_COLUMNS.map((c) => String(s.enforcement[c.key])),
    String(s.enforcementTotal),
  ];

  return [
    band,
    head,
    ...summary.rows.map(line),
    line(summary.total),
    [],
    [
      "Total Inspections Conducted",
      String(summary.total.inspectionsTotal),
      "",
      "Total Enforcements",
      String(summary.total.enforcementTotal),
    ],
  ];
}

// ---------------------------------------------------------------------------
// Inspection cards due
// ---------------------------------------------------------------------------

/**
 * Cards that need attention, soonest expiry first: the ones already expired and
 * the ones inside their last fortnight. This is the follow-up list the card
 * columns exist for. Expired cards come before expiring ones by construction,
 * because an expiry already past sorts before one still to come.
 */
export function cardsDue(rows: DatabaseRow[]): DatabaseRow[] {
  return rows
    .filter((r) => r.cardStatus === "Expired" || r.cardStatus === "Expiring Soon")
    .sort((a, b) => a.cardExpiry.localeCompare(b.cardExpiry));
}

/**
 * Whole days from today to the card's expiry: positive while it runs,
 * negative once it has run out (the number of days overdue). Null when
 * there is no card.
 */
export function cardDaysLeft(expiry: string, today: string): number | null {
  if (!expiry || !today) return null;
  const ms = parseISO(expiry).getTime() - parseISO(today).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * The one line the follow-up list shows under a card: how long it has been
 * expired, or how long it has left. Empty when there is no card.
 */
export function describeCard(expiry: string, today: string): string {
  const days = cardDaysLeft(expiry, today);
  if (days === null) return "";
  if (days < 0) {
    const n = -days;
    return `Expired ${n} day${n === 1 ? "" : "s"} ago`;
  }
  if (days === 0) return "Expires today";
  return `Expires in ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The follow-up an expired card calls for. The Inspectorate's own sequence:
 * a card is re-issued at a follow-up visit; if the facility was already on
 * notice the next step is the firmer one. This only SUGGESTS — the officer
 * picks the action on the form.
 */
export function suggestedFollowUp(row: Pick<DatabaseRow, "cardStatus" | "enforcement">): {
  type: InspectionType;
  hint: string;
} {
  if (row.cardStatus !== "Expired") {
    return {
      type: "Follow-up",
      hint: "Card still running — schedule the follow-up before it expires.",
    };
  }
  if (!row.enforcement) {
    return {
      type: "Follow-up",
      hint: "Card expired with no action on record — a follow-up inspection, and a written notice if the findings stand.",
    };
  }
  if (isSummarisedEnforcement(row.enforcement)) {
    return {
      type: "Enforcement Action",
      hint: `Card expired after ${row.enforcement} — record the next enforcement step.`,
    };
  }
  return {
    type: "Follow-up",
    hint: `Card expired after an ${row.enforcement.toLowerCase()} — a follow-up, and a formal notice if nothing has changed.`,
  };
}
