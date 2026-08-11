import { detectType } from "../rules/detectType";
import { norm } from "../rules/matching";
import {
  LICENCE_TYPES,
  STAGES,
  type Authorisation,
  type Facility,
  type FacilityCategory,
  type LicenceType,
  type Province,
  type Sector,
  type Stage,
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

export function mapSeedFacility(s: SeedFacility): Facility {
  const licensed = s.lic === "Yes";
  const name = s.name || "";
  const id = s.fac
    ? s.fac.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()
    : `fac-${s.n}`;
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
