/**
 * Metric-key derivation and the register breakdowns the weekly report shows
 * behind its auto-filled work plan rows.
 *
 * The report itself is assembled in `workPlan.ts` — the approved 2026 work plan
 * is the reporting frame. This module stays the single owner of how a metric
 * key is spelled, because those keys are written into stored documents
 * (`weekMetrics.values`, `dailyEntries.metricKey`) and must never drift.
 */
import type { InspectionType, LicenceType } from "./types";

/**
 * The licence-type split shown behind work plan output 1.1.4 (Issuance of
 * Ionising Radiation Licences). Every recorded licence counts toward 1.1.4; this
 * is how the section reads that figure back.
 */
export const LICENCE_BREAKDOWN: {
  label: string;
  match: (t: LicenceType) => boolean;
}[] = [
  {
    label: "Possession Licences issued",
    match: (t) =>
      t === "New Use/Possession Licence" ||
      t === "Renewal of Use/Possession Licence",
  },
  { label: "Importation Licences", match: (t) => t === "Importation Licence" },
  { label: "Export Licences", match: (t) => t === "Export Licence" },
  { label: "Transfer Licences", match: (t) => t === "Transfer Licence" },
  { label: "Transport Licences", match: (t) => t === "Transport Licence" },
  { label: "Transit Licences", match: (t) => t === "Transit Licence" },
  {
    label: "Variation of Terms and Conditions",
    match: (t) => t === "Variation of Terms and Conditions",
  },
  {
    label: "Design and Construction Licences",
    match: (t) => t === "Design and Construction Licence",
  },
  {
    label: "Decommissioning Licences",
    match: (t) => t === "Decommissioning Licence",
  },
];

/**
 * The inspection-type split behind outputs 1.2.4 and 1.2.11. Logging an
 * inspection still records its type — the work plan reports the total, the
 * breakdown says what the total was made of.
 */
export const INSPECTION_BREAKDOWN: {
  label: string;
  type: InspectionType;
}[] = [
  { label: "Routine Inspections", type: "Routine Inspection" },
  { label: "Follow-ups", type: "Follow-up" },
  { label: "Pre-Authorisation Inspections", type: "Pre-Authorisation" },
  { label: "Investigations", type: "Investigation" },
  { label: "Enforcement Actions", type: "Enforcement Action" },
];

export function sectionKey(section: string): string {
  return section
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

/**
 * The stored key for one section's metric. Stable by contract: it is written
 * into `weekMetrics.values` and `dailyEntries.metricKey`, so changing how a key
 * is spelled orphans figures that are already on record.
 */
export function metricKey(section: string, label: string): string {
  return `${sectionKey(section)}::${label}`;
}
