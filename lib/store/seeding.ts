import {
  borderId,
  NSSS_SECTION,
  screeningEntryId,
  VEHICLE_SCREENING_LABEL,
  vehicleScreeningKey,
} from "../rules/daily";
import { detectType } from "../rules/detectType";
import { classifyMatch, matchOne, norm } from "../rules/matching";
import { weekLabelForDate } from "../rules/week";
import {
  LICENCE_TYPES,
  PROVINCES,
  STAGES,
  type Authorisation,
  type Border,
  type DailyEntry,
  type Facility,
  type FacilityCategory,
  type Inspection,
  type InspectionType,
  type LicenceType,
  type Province,
  type Sector,
  type Stage,
  type WeekDef,
} from "../rules/types";

/**
 * One licence on a seeded facility, as the Licensing Status import writes it:
 * type, quarter of issue ("2026-Q1", blank when the source has none) and the
 * RAIS licence number when the register knows it.
 */
export interface SeedLicence {
  t: string;
  q?: string;
  n?: string;
}

export interface SeedFacility {
  n: number;
  name: string;
  dist: string;
  prov: string;
  prac: string;
  sec: string;
  lic: string;
  stage: string;
  auth: string;
  fac: string;
  ln: string;
  /**
   * Every licence recorded for the facility, one entry per licence. Present on
   * rows imported from the Licensing Status workbook; rows predating it carry
   * their numbers in `ln` alone and are expanded by buildAuths().
   */
  lics?: SeedLicence[];
  /** "Yes"/"No" — operating status from the register import. */
  func?: string;
  /** "Medical" / "Non-Medical" (veterinary counts as Medical). */
  cat?: string;
  /** "Yes" when an earlier application stalled with no 2026 activity. */
  stalled?: string;
  /** Review note when the imported row needs an officer's confirmation. */
  review?: string;
  /** Source detail line from the register import (status · licences · quarter). */
  detail?: string;
}

function safeProvince(p: string): Province {
  const known = [
    "Lusaka",
    "Copperbelt",
    "North-Western",
    "Central",
    "Northern",
    "Luapula",
    "Eastern",
    "Western",
    "Southern",
    "Muchinga",
  ] as const;
  return (known as readonly string[]).includes(p)
    ? (p as Province)
    : "Lusaka";
}

function safeStage(s: string, licensed: boolean): Stage {
  if (licensed) return "Licensed";
  return (STAGES as readonly string[]).includes(s)
    ? (s as Stage)
    : "No Application Submitted";
}

function safeLicenceType(t: string, fallback: LicenceType): LicenceType {
  return (LICENCE_TYPES as readonly string[]).includes(t)
    ? (t as LicenceType)
    : fallback;
}

/**
 * The licences listed on a seed row. Each entry is one authorisation; the
 * workbook dates them by quarter, so `date` stays empty and `quarter` carries
 * the period (see Authorisation.quarter).
 */
function licencesToAuths(lics: SeedLicence[]): Authorisation[] {
  return lics.map((l) => {
    const number = l.n || "";
    const type = safeLicenceType(
      l.t,
      number ? detectType(number, "Renewal of Use/Possession Licence")
             : "Renewal of Use/Possession Licence",
    );
    const a: Authorisation = { type, number, date: "" };
    if (l.q) a.quarter = l.q;
    return a;
  });
}

function buildAuths(ln: string, auth: string): Authorisation[] {
  if (!ln) return [];
  const tokens = ln
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter((t) => /auth/i.test(t));
  if (tokens.length === 0) return [];
  const fallback =
    auth === "New"
      ? "New Use/Possession Licence"
      : "Renewal of Use/Possession Licence";
  return tokens.map((number) => ({
    type: detectType(number, fallback),
    number,
    date: "",
  }));
}

/**
 * A seeded facility's document id.
 *
 * Its RAN where RAIS has issued one ("FAC/0250" → "fac-0250"). A facility
 * without one is keyed by its NAME, not by its row number: the register is
 * sorted licensed-first-then-alphabetical, so the row number moves whenever the
 * register is re-imported, and an id derived from it would leave the previous
 * import's document behind as a duplicate.
 *
 * The `seed-` prefix keeps these clear of both the RAN ids and the random ids
 * `addFacility` mints for a facility typed into the app.
 */
export function seedFacilityId(s: Pick<SeedFacility, "fac" | "name">): string {
  if (s.fac) return s.fac.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
  const slug = norm(s.name || "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `seed-${slug}`;
}

export function mapSeedFacility(s: SeedFacility): Facility {
  const licensed = s.lic === "Yes";
  const name = s.name || "";
  const id = seedFacilityId(s);
  const f: Facility = {
    id,
    no: s.n,
    name,
    nameLower: norm(name),
    district: s.dist || "",
    province: safeProvince(s.prov),
    practice: s.prac || "",
    sector: s.sec === "Public" ? ("Public" as Sector) : ("Private" as Sector),
    // Rows predating the status imports lack `func` — treat them as
    // operating rather than silently shrinking the functional counts.
    functional: s.func !== "No",
    category:
      s.cat === "Non-Medical"
        ? ("Non-Medical" as FacilityCategory)
        : ("Medical" as FacilityCategory),
    licensed,
    stage: safeStage(s.stage, licensed),
    facCode: s.fac || "",
    auths: s.lics ? licencesToAuths(s.lics) : buildAuths(s.ln, s.auth),
  };
  // Optional flags only when set — keeps Firestore docs (and JSON exports)
  // free of empty placeholder fields.
  if (s.stalled === "Yes") f.stalled = true;
  if (s.review) {
    f.needsReview = true;
    f.reviewNote = s.review;
  }
  if (s.detail) f.statusDetail = s.detail;
  return f;
}

export function mapAllSeed(rows: SeedFacility[]): Facility[] {
  return rows.map(mapSeedFacility);
}

// ---------------------------------------------------------------------------
// Border screening — the 2026 daily summary workbook
// ---------------------------------------------------------------------------

/** One inland office's reported days, as the daily-summary import writes them. */
export interface SeedScreeningPost {
  border: string;
  /** [YYYY-MM-DD, vehicles assessed] pairs, in date order. */
  days: Array<[string, number]>;
}

/**
 * The Nuclear Safety, Security & Safeguards section's daily screening figures,
 * one post per entry (see docs/daily-screening-2026-import.md). These are
 * seeded as real daily log entries rather than as a work plan opening balance,
 * so output 1.3.12 counts them, the NSSS tab can split them by post, and a day
 * an officer corrects behaves like any other daily entry.
 */
export interface SeedScreening {
  /** Workbook the figures were imported from. */
  source: string;
  year: number;
  posts: SeedScreeningPost[];
}

/**
 * Shown as the author of a seeded screening count, in place of an officer's
 * name — the figure came from the section's workbook, not from someone typing
 * it into the Daily Updates tab.
 */
export const SCREENING_SEED_AUTHOR = "Daily summary workbook";

// One post, one day, one figure - the id rule lives with the daily rules now,
// re-exported here because the seed is one of the two writers that depend on it.
export { screeningEntryId };

/** The border posts the daily summary workbook reports, in name order. */
export function mapSeedBorders(seed: SeedScreening): Border[] {
  return seed.posts
    .map((p) => ({ id: borderId(p.border), name: p.border, active: true }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The seeded screening counts as daily log entries. Ids are derived from the
 * post and the date, so re-seeding updates a day in place instead of adding a
 * second figure for it.
 */
export function mapSeedScreening(
  seed: SeedScreening,
  weeks: WeekDef[],
): DailyEntry[] {
  const metricKey = vehicleScreeningKey();
  const entries: DailyEntry[] = [];
  for (const post of seed.posts) {
    for (const [date, value] of post.days) {
      entries.push({
        id: screeningEntryId(date, post.border),
        date,
        week: weekLabelForDate(date, weeks),
        section: NSSS_SECTION,
        kind: "count",
        metricKey,
        label: VEHICLE_SCREENING_LABEL,
        value,
        border: post.border,
        updatedBy: "seed",
        updatedByName: SCREENING_SEED_AUTHOR,
      });
    }
  }
  // Newest first — the order every store hands daily entries back in.
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// The Inspectorate's 2026 facility inspection register
// ---------------------------------------------------------------------------

/**
 * One row of the Inspectorate & Enforcement Division's handover register
 * ("COMPLETE FACILITY INSPECTION REGISTER", 7 Sep 2026), kept in the document's
 * own words: its province spelling, its inspection-type wording and its
 * DD/MM/YYYY dates. Everything is normalised here rather than in the JSON, so
 * the seed file stays checkable against the document it came from.
 *
 * Duplicate facility names are deliberate — a repeated name is a separate visit
 * to that facility on another occasion, which is why `seedInspectionId` numbers
 * the repeats instead of collapsing them.
 *
 * See docs/inspection-register-2026-import.md.
 */
export interface SeedInspection {
  /** Row number in the handover document (1-based), for tracing back to it. */
  n: number;
  /** PROVINCE, as written ("North Western", "central", "" when the cell is blank). */
  prov: string;
  /** FACILITY, as written. */
  name: string;
  /** TYPE OF INSPECTION, as written. "" when the document leaves it blank. */
  type: string;
  /** INSPECTION DATE as DD/MM/YYYY. "" when the document does not record one. */
  date: string;
  /** Where a cell the document left blank was filled in from. */
  note?: string;
}

/** Shown as the author of a seeded inspection, in place of an officer's name. */
export const INSPECTION_SEED_AUTHOR = "2026 inspection register";

/**
 * The register's inspection-type wording mapped onto the system's five types.
 * The document spells pre-authorisation five ways (American -ization, British
 * -isation, with and without the word "Inspection", and lower case), which is
 * what a register typed by several officers over a year looks like.
 */
function seedInspectionType(raw: string): InspectionType | null {
  const t = norm(raw);
  if (!t) return null;
  if (t.startsWith("routine")) return "Routine Inspection";
  if (t.startsWith("follow")) return "Follow-up";
  if (t.startsWith("pre") || t.startsWith("preauth")) return "Pre-Authorisation";
  if (t.startsWith("investigat")) return "Investigation";
  if (t.startsWith("enforcement")) return "Enforcement Action";
  return null;
}

/** The register's province spelling mapped onto the register's own list. */
function seedInspectionProvince(raw: string): Province | "" {
  const p = norm(raw);
  if (!p) return "";
  if (p === "north western" || p === "northwestern" || p === "north west") {
    return "North-Western";
  }
  const match = PROVINCES.find((known) => norm(known) === p);
  return match ?? "";
}

/** DD/MM/YYYY as the register writes it → YYYY-MM-DD. "" when not recorded. */
function seedInspectionDate(raw: string): string {
  const m = (raw || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * A stable document id for a register row.
 *
 * Deliberately NOT the row number: the section hands the register over as a
 * whole document, and a row inserted in the middle of the next one would
 * re-key every row below it, leaving hundreds of orphaned duplicates. Keying on
 * the facility, the type and which repeat this is survives that — the same
 * visit keeps its id wherever the row moves to.
 */
export function seedInspectionId(
  name: string,
  type: InspectionType,
  occurrence: number,
): string {
  const slug = norm(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const kind = norm(type).replace(/[^a-z0-9]+/g, "-");
  return `reg2026-${slug}-${kind}-${occurrence}`;
}

/**
 * The facility the row names, or null when the register cannot be sure.
 *
 * The bar is `classifyMatch`'s own "auto" threshold, and a row that names a
 * province must match a facility in it: the register carries several same-named
 * facilities in different provinces ("Hilltop Hospital" in Lusaka, Solwezi and
 * Kasama), and attaching an inspection to the wrong one writes a fact into that
 * facility's history that nothing later corrects. Leaving it unlinked loses
 * only the link — the row still reports under its own name and province, and an
 * officer can attach it from the app.
 */
function matchSeedFacility(
  name: string,
  province: Province | "",
  facilities: Facility[],
): Facility | null {
  const pool = province
    ? facilities.filter((f) => f.province === province)
    : facilities;
  const m = matchOne({ name, number: "" }, pool);
  return classifyMatch(m.score) === "auto" ? m.best : null;
}

export interface MappedSeedInspections {
  inspections: Inspection[];
  /** Rows the register carries that could not be imported, and why. */
  skipped: Array<{ row: SeedInspection; reason: string }>;
  /** Rows imported without a link to a register facility. */
  unlinked: number;
}

/**
 * The register as dated inspections.
 *
 * Two things it deliberately does not do:
 *
 * - **It invents no dates.** The document records one for 42 of its rows and
 *   leaves the rest blank, so those rows are stored with an empty `date` and
 *   `week`. They show on the Inspectorate tab under "All time" and in the
 *   database and summary sheets, and they are counted by no reporting period —
 *   which is right, because nothing knows which period they belong to. Work
 *   plan output 1.2.4 still carries them in its opening balance; see the note
 *   there and docs/inspection-register-2026-import.md.
 * - **It records no outcome.** The register has no outcome column, so every row
 *   is stored as "N/A" rather than assumed compliant.
 */
export function mapAllSeedInspections(
  rows: SeedInspection[],
  facilities: Facility[],
  weeks: WeekDef[],
): MappedSeedInspections {
  const inspections: Inspection[] = [];
  const skipped: MappedSeedInspections["skipped"] = [];
  const seen = new Map<string, number>();
  let unlinked = 0;

  for (const row of rows) {
    const type = seedInspectionType(row.type);
    if (!type) {
      skipped.push({
        row,
        reason: "the register records no type of inspection for this row",
      });
      continue;
    }
    const province = seedInspectionProvince(row.prov);
    const facility = matchSeedFacility(row.name, province, facilities);
    if (!facility) unlinked += 1;

    const key = `${norm(row.name)}::${type}`;
    const occurrence = (seen.get(key) || 0) + 1;
    seen.set(key, occurrence);

    const date = seedInspectionDate(row.date);
    const notes = [
      `Row ${row.n} of the Inspectorate's 2026 facility inspection register.`,
      row.note,
      date ? "" : "The register records no date for this inspection.",
      facility ? "" : "Not matched to a facility on the register.",
    ]
      .filter(Boolean)
      .join(" ");

    inspections.push({
      id: seedInspectionId(row.name, type, occurrence),
      date,
      week: date ? weekLabelForDate(date, weeks, "") : "",
      facilityId: facility ? facility.id : null,
      facilityName: facility ? facility.name : row.name,
      type,
      outcome: "N/A",
      province: facility ? facility.province : province,
      sector: facility ? facility.sector : "",
      district: facility ? facility.district : "",
      practice: facility ? facility.practice : "",
      notes,
      updatedBy: "seed",
    });
  }

  // Newest first, undated rows last — the order every store hands them back in.
  inspections.sort((a, b) => b.date.localeCompare(a.date));
  return { inspections, skipped, unlinked };
}
