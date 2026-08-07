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
  /** "Yes"/"No" — operating status from the 2026 Facility Status List. */
  func?: string;
  /** "Medical" / "Non-Medical" (veterinary counts as Medical). */
  cat?: string;
  /** "Yes" when an earlier application stalled with no 2026 activity. */
  stalled?: string;
  /** Review note when the imported row needs an officer's confirmation. */
  review?: string;
  /** Source detail line from the status list (latest stage · date). */
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
    // Rows predating the 2026 status-list import lack `func` — treat them as
    // operating rather than silently shrinking the functional counts.
    functional: s.func !== "No",
    category:
      s.cat === "Non-Medical"
        ? ("Non-Medical" as FacilityCategory)
        : ("Medical" as FacilityCategory),
    licensed,
    stage: safeStage(s.stage, licensed),
    facCode: s.fac || "",
    auths: buildAuths(s.ln, s.auth),
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

/**
 * One row of the authorisation register (seed/authorisations.seed.json) — the
 * standalone licences a facility holds alongside its use/possession licence:
 * importation, transit, transfer, transport and variations of terms. Field
 * names mirror the source spreadsheet's columns.
 */
export interface SeedAuthorisation {
  n: number;
  /** Date issued (ISO), when the source records one. */
  date: string;
  /** Facility name as written on the licence. */
  name: string;
  sec: string;
  prov: string;
  /** Licence type, exactly as in LICENCE_TYPES. */
  type: string;
  /** Licence number, e.g. RPA/LIC/0349 or AUTH/VAR/0094. */
  num: string;
  /** Valid from / valid to, when the licence states a window. */
  from: string;
  to: string;
  /** FAC code of the holding facility — the primary link into the register. */
  fac: string;
  /** What the licence permits, in its own wording. */
  scope: string;
}

export interface AuthorisationImport {
  /** The register, with every resolved authorisation merged onto its holder. */
  facilities: Facility[];
  /** Rows that matched no facility — nothing was recorded for these. */
  unmatched: SeedAuthorisation[];
  /** How many rows were attached (facilities.length is unchanged by the merge). */
  attached: number;
  /** Facilities that gained a FAC code from the authorisation they hold. */
  facCodesFilled: number;
}

function safeLicenceType(t: string): LicenceType | null {
  return (LICENCE_TYPES as readonly string[]).includes(t)
    ? (t as LicenceType)
    : null;
}

/**
 * Pick the facility an authorisation belongs to. The FAC code is the primary
 * key; the register carries it for only part of its rows, so an exact
 * (normalised) name match is the fallback. Where either key is ambiguous — the
 * register holds several branches under one FAC code, e.g. the three
 * Occupational Health and Safety Institute sites on FAC/0094 — the row's own
 * name and province break the tie. Anything still ambiguous stays unmatched
 * rather than being recorded against a guess.
 */
function resolveHolder(
  row: SeedAuthorisation,
  facilities: Facility[],
  byFac: Map<string, number[]>,
  byName: Map<string, number[]>,
): number {
  const candidates =
    (row.fac ? byFac.get(row.fac) : undefined) ||
    byName.get(norm(row.name)) ||
    [];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return -1;

  const sameName = candidates.filter(
    (i) => facilities[i].nameLower === norm(row.name),
  );
  if (sameName.length === 1) return sameName[0];
  const sameProvince = candidates.filter(
    (i) => facilities[i].province === row.prov,
  );
  if (sameProvince.length === 1) return sameProvince[0];
  return -1;
}

/**
 * Merge the authorisation register onto the facility register: every licence
 * becomes an `auths` entry on the facility that holds it, and a facility whose
 * FAC code the 2026 status list never captured takes the code from its own
 * licence.
 *
 * Pure and idempotent — it returns new facility objects and never appends a
 * licence number the facility already carries, so re-seeding cannot duplicate
 * entries. Standalone authorisations do not confer licensed status, so neither
 * `licensed` nor `stage` is touched here (R: only use/possession licences move
 * a facility's status).
 */
export function applySeedAuthorisations(
  facilities: Facility[],
  rows: SeedAuthorisation[],
): AuthorisationImport {
  // Indexed by position, not by id: the register carries a handful of rows that
  // share a FAC code (three Occupational Health and Safety Institute sites on
  // FAC/0094), and the seed derives the facility id from that code — so ids are
  // not unique and keying by them would attach one licence to every namesake.
  const byFac = new Map<string, number[]>();
  const byName = new Map<string, number[]>();
  facilities.forEach((f, i) => {
    if (f.facCode) {
      const list = byFac.get(f.facCode);
      if (list) list.push(i);
      else byFac.set(f.facCode, [i]);
    }
    const named = byName.get(f.nameLower);
    if (named) named.push(i);
    else byName.set(f.nameLower, [i]);
  });

  const extra = new Map<number, Authorisation[]>();
  const codeFor = new Map<number, string>();
  const unmatched: SeedAuthorisation[] = [];

  for (const row of rows) {
    const type = safeLicenceType(row.type);
    const at = type ? resolveHolder(row, facilities, byFac, byName) : -1;
    if (at < 0 || !type) {
      unmatched.push(row);
      continue;
    }
    const auth: Authorisation = {
      type,
      number: (row.num || "").trim(),
      date: row.date || "",
    };
    if (row.scope) auth.scope = row.scope;
    if (row.from) auth.validFrom = row.from;
    if (row.to) auth.validTo = row.to;

    const held = extra.get(at);
    if (held) held.push(auth);
    else extra.set(at, [auth]);
    if (!facilities[at].facCode && row.fac) codeFor.set(at, row.fac);
  }

  let attached = 0;
  const merged = facilities.map((f, i) => {
    const add = extra.get(i);
    const code = codeFor.get(i);
    if (!add && !code) return f;
    const seen = new Set((f.auths || []).map((a) => a.number).filter(Boolean));
    const fresh: Authorisation[] = [];
    for (const a of add || []) {
      if (a.number && seen.has(a.number)) continue;
      if (a.number) seen.add(a.number);
      fresh.push(a);
    }
    attached += fresh.length;
    return {
      ...f,
      facCode: f.facCode || code || "",
      auths: [...(f.auths || []), ...fresh],
    };
  });

  return {
    facilities: merged,
    unmatched,
    attached,
    facCodesFilled: codeFor.size,
  };
}

/**
 * The seeded register as the app should see it: the facility rows with the
 * authorisation register merged in. Used by both the Firestore seed script and
 * the in-memory mock store so the two start from identical data.
 */
export function buildSeedRegister(
  facilityRows: SeedFacility[],
  authRows: SeedAuthorisation[],
): AuthorisationImport {
  return applySeedAuthorisations(mapAllSeed(facilityRows), authRows);
}
