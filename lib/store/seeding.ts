import {
  borderId,
  NSSS_SECTION,
  screeningEntryId,
  VEHICLE_SCREENING_LABEL,
  vehicleScreeningKey,
} from "../rules/daily";
import { detectType } from "../rules/detectType";
import { norm } from "../rules/matching";
import { weekLabelForDate } from "../rules/week";
import {
  LICENCE_TYPES,
  STAGES,
  type Authorisation,
  type Border,
  type DailyEntry,
  type Facility,
  type FacilityCategory,
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
