import { detectType } from "../rules/detectType";
import { norm } from "../rules/matching";
import {
  STAGES,
  type Authorisation,
  type Facility,
  type FacilityCategory,
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
