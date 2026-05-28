import { detectType } from "../rules/detectType";
import { norm } from "../rules/matching";
import {
  type Authorisation,
  type Facility,
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
  const allowed: Stage[] = [
    "Licensed",
    "No Application Submitted",
    "Invoice Generation Pending",
    "Waiting for Payment",
    "Accounts Clearance Pending",
    "Waiting for Review and Assessment",
    "Under Internal Review (Further Information Required)",
    "CEO Licence Approval Required",
    "Import Licence Only (Not yet Use/Possession)",
  ];
  return (allowed as string[]).includes(s)
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
  return {
    id,
    no: s.n,
    name,
    nameLower: norm(name),
    district: s.dist || "",
    province: safeProvince(s.prov),
    practice: s.prac || "",
    sector: s.sec === "Public" ? ("Public" as Sector) : ("Private" as Sector),
    licensed,
    stage: safeStage(s.stage, licensed),
    facCode: s.fac || "",
    auths: buildAuths(s.ln, s.auth),
  };
}

export function mapAllSeed(rows: SeedFacility[]): Facility[] {
  return rows.map(mapSeedFacility);
}
