import type { Facility } from "./types";

export function norm(s: string): string {
  return (s || "")
    .toLowerCase()
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
  return jaccard(query, fac.name);
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
