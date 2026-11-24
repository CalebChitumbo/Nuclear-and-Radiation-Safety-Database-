import { norm } from "./matching";
import type { Facility } from "./types";

/**
 * Which inspection records belong to one facility — the same rule the
 * register's enforcement chip uses (`enforcementByFacility`): an inspection
 * linked to the facility by id, or one linked to no facility whose name is
 * the facility's name once normalised.
 *
 * The second half matters for the 2026 inspection register: its rows are
 * linked to a facility only when the register's province agrees with ours, so
 * a handful sit unlinked under a name that IS a facility on the register
 * (five in the Sep 2026 import — Chama District Hospital among them). The
 * facility page and the Inspectorate's facility view both read through this,
 * so the two always count the same records.
 */
export function belongsToFacility(
  record: { facilityId: string | null; facilityName: string },
  facility: Pick<Facility, "id" | "name" | "nameLower">,
): boolean {
  if (record.facilityId) return record.facilityId === facility.id;
  const key = facility.nameLower || norm(facility.name);
  return !!key && norm(record.facilityName) === key;
}

export function recordsOfFacility<
  T extends { facilityId: string | null; facilityName: string },
>(records: T[], facility: Pick<Facility, "id" | "name" | "nameLower">): T[] {
  return records.filter((r) => belongsToFacility(r, facility));
}

/** The Inspectorate tab, opened on one facility's inspection data. */
export function facilityInspectionsHref(facilityId: string): string {
  return `/inspectorate?facility=${encodeURIComponent(facilityId)}#facility-inspections`;
}
