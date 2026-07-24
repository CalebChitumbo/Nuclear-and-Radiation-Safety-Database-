import type { FacilityCategory } from "./types";

// Practice keywords that mark a facility as Medical. Veterinary counts as
// Medical (clinical imaging). Mirrors the 2026 status-list importer.
const MEDICAL_PRACTICE =
  /x[- ]?ray|imaging|dental|nuclear medicine|radiotherapy|computed tomography|\bct\b|mammo|fluoro|veterinar|animal health/i;

// Fallback when the practice is blank: a clinical-sounding name.
const MEDICAL_NAME =
  /hospital|clinic|medical|dental|diagnos|health|hospice|veterinary|medicare|surgery|imaging/i;

/**
 * Guess Medical vs Non-Medical from a facility's practice (falling back to
 * its name when the practice is blank). Used as the default wherever a
 * facility is created without an explicit category; officers can override it
 * on the facility record.
 */
export function categoriseFacility(
  practice: string,
  name: string,
): FacilityCategory {
  if (practice && practice.trim()) {
    return MEDICAL_PRACTICE.test(practice) ? "Medical" : "Non-Medical";
  }
  return MEDICAL_NAME.test(name) ? "Medical" : "Non-Medical";
}
