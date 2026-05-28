import type { LicenceType } from "./types";

/**
 * R4 — AUTH numbers encode the licence type. Detect it from the string,
 * falling back to a chosen default when no signal is present.
 */
export function detectType(
  num: string,
  fallback: LicenceType,
): LicenceType {
  const s = (num || "").toUpperCase();
  if (/USE\.REN|\bREN\b/.test(s)) return "Renewal of Use/Possession Licence";
  if (/USE\.NEW|\bUSE\b/.test(s)) return "New Use/Possession Licence";
  if (/IMP/.test(s)) return "Importation Licence";
  if (/EXP/.test(s)) return "Export Licence";
  if (/TRANSF|\bTRF\b/.test(s)) return "Transfer Licence";
  if (/TRANSP|\bTRP\b/.test(s)) return "Transport Licence";
  if (/TRANSIT|\bTRN\b/.test(s)) return "Transit Licence";
  if (/VAR/.test(s)) return "Variation of Terms and Conditions";
  if (/DCL|D&C|DESIGN|CONSTR/.test(s))
    return "Design and Construction Licence";
  if (/DEC|DCM/.test(s)) return "Decommissioning Licence";
  return fallback;
}
