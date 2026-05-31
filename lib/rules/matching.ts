import type { Facility } from "./types";

export function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(ltd|limited|plc|inc|co|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function jaccard(a: string, b: string): number {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let intersect = 0;
  A.forEach((t) => {
    if (B.has(t)) intersect++;
  });
  return intersect / (A.size + B.size - intersect);
}

/**
 * Generic words that appear in a great many facility names and so carry little
 * identifying signal. They are down-weighted (not dropped) so that two names
 * which differ only by, say, "Hospital" vs "Clinic" still score on the strength
 * of their distinctive words instead of being dragged down to a coin-flip.
 */
const GENERIC_TOKENS = new Set([
  "hospital", "hospitals", "hosp", "clinic", "clinics", "medical", "medicare",
  "centre", "center", "health", "healthcare", "general", "district", "care",
  "services", "service", "mission", "university", "college", "school",
  "council", "board", "institute", "institution", "laboratory", "lab", "labs",
  "diagnostic", "diagnostics", "pharmacy", "dental", "trust", "group",
  "holdings", "enterprises", "enterprise", "national", "rural", "urban",
  "provincial", "public", "private", "the", "of", "and",
]);

function tokenWeight(t: string): number {
  return GENERIC_TOKENS.has(t) ? 0.3 : 1;
}

/**
 * Weighted Jaccard over name tokens: shared-token weight ÷ union-token weight,
 * with generic words counting for less. More forgiving than plain Jaccard when
 * names differ only by a common word, without rewarding matches on common words
 * alone.
 */
export function weightedTokenSim(a: string, b: string): number {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  let union = 0;
  new Set([...A, ...B]).forEach((t) => {
    const w = tokenWeight(t);
    union += w;
    if (A.has(t) && B.has(t)) inter += w;
  });
  return union ? inter / union : 0;
}

function trigrams(s: string): Set<string> {
  const t = norm(s).replace(/ /g, "");
  const g = new Set<string>();
  for (let i = 0; i <= t.length - 3; i++) g.add(t.slice(i, i + 3));
  return g;
}

/**
 * Character-trigram Dice coefficient — a fuzzy, spelling-tolerant similarity
 * used as a fallback to rescue typos and minor spelling variants (e.g.
 * "Mediheal" vs "Medihealth") that token matching would miss.
 */
export function trigramSim(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((g) => {
    if (B.has(g)) inter++;
  });
  return (2 * inter) / (A.size + B.size);
}

export function scoreMatch(
  query: string,
  fac: Pick<Facility, "name" | "facCode">,
): number {
  const q = norm(query);
  const n = norm(fac.name);
  if (!q) return 0;
  if (q === n) return 1;
  if (
    /^fac\/?\d+/i.test(query.trim()) &&
    fac.facCode &&
    norm(query) === norm(fac.facCode)
  ) {
    return 1;
  }
  const shorter = q.length < n.length ? q : n;
  if (
    (n.includes(q) || q.includes(n)) &&
    shorter.length >= 6 &&
    shorter.split(" ").length >= 2
  ) {
    return 0.9;
  }
  const wj = weightedTokenSim(query, fac.name);
  // Trigram similarity is a softer fallback: only let it contribute when it is
  // genuinely high, and scaled down, so spelling variants are rescued without
  // lifting unrelated names over the match threshold.
  const tg = trigramSim(query, fac.name);
  return Math.max(wj, tg >= 0.6 ? tg * 0.8 : 0);
}

export interface MatchResult {
  query: { name: string; number: string };
  best: Facility | null;
  score: number;
  classification: "auto" | "review" | "none";
  alreadyLicensed: boolean;
}

export function classifyMatch(score: number): MatchResult["classification"] {
  if (score >= 0.72) return "auto";
  if (score >= 0.45) return "review";
  return "none";
}

export function matchOne(
  q: { name: string; number: string },
  facilities: Facility[],
): MatchResult {
  let best: Facility | null = null;
  let bestScore = 0;
  for (const f of facilities) {
    const s = scoreMatch(q.name, f);
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  }
  return {
    query: q,
    best,
    score: bestScore,
    classification: classifyMatch(bestScore),
    alreadyLicensed: !!best && bestScore >= 0.72 && best.licensed,
  };
}

/**
 * Does this token look like an AUTH/licence code rather than a facility name?
 * Codes have no spaces, e.g. "RPA/LIC/0133", "AUTH/USE.REN/0781", "FAC/0344".
 */
export function looksLikeCode(s: string): boolean {
  const t = (s || "").trim();
  if (!t || /\s/.test(t)) return false; // a code has no spaces
  return (/\d/.test(t) && /[\/.-]/.test(t)) || /^(rpa|auth|fac)/i.test(t);
}

/**
 * Parse a bulk-approval line into { name, number }. Handles, in order:
 *   1. Strip a trailing reference URL (e.g. a RAIS workflow link pasted right
 *      after the name: "… CENTREhttps://rais.rpa.gov.zm/…").
 *   2. Pipe always separates the number:  "Acme Hospital | AUTH/USE.REN/0701"
 *   3. RAIS export — code first, em/en-dash, then the name (with or without a
 *      link):  "RPA/LIC/0133 — DR. DILOBARS MEDICAL CENTRE"
 *   4. Trailing comma, only when the tail looks like a code.
 *   5. Otherwise the whole line is the name.
 */
export function parseBulkLine(line: string): { name: string; number: string } {
  // 1. Drop any reference URL (it has no whitespace, so only the link goes).
  const raw = (line || "").replace(/\s*https?:\/\/\S+/gi, "").trim();
  if (!raw) return { name: "", number: "" };

  // 2. Explicit pipe — name first.
  if (raw.includes("|")) {
    const idx = raw.indexOf("|");
    return {
      name: raw.slice(0, idx).trim(),
      number: raw.slice(idx + 1).trim(),
    };
  }

  // 3. RAIS "CODE — Name" — number first, separated by an em/en-dash (or a
  //    spaced hyphen). Only fires when the left side is a bare code.
  const dash = raw.match(/^(.+?)\s+[—–-]\s+(.+)$/);
  if (dash && looksLikeCode(dash[1])) {
    return { name: dash[2].trim(), number: dash[1].trim() };
  }

  // 4. Trailing comma, only on an AUTH-looking tail (commas in names are safe).
  const lastComma = raw.lastIndexOf(",");
  if (lastComma !== -1) {
    const tail = raw.slice(lastComma + 1).trim();
    if (/auth|fac\/\d|^[a-z0-9]{2,8}[\/.\-]\d/i.test(tail)) {
      return { name: raw.slice(0, lastComma).trim(), number: tail };
    }
  }

  return { name: raw, number: "" };
}
