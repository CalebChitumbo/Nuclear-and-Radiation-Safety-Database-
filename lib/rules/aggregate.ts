import {
  type DashboardAggregate,
  type Facility,
  PROVINCES,
  emptyAggregate,
} from "./types";

/**
 * Recompute the dashboard aggregate from the full facility list.
 * Cheap at 474 docs; safe to use as a refresh path or in the seed script.
 */
export function computeAggregate(
  facilities: Facility[],
): DashboardAggregate {
  const agg = emptyAggregate();
  agg.total = facilities.length;

  for (const f of facilities) {
    if (f.licensed) agg.licensed += 1;
    else agg.unlicensed += 1;

    agg.auths += (f.auths || []).length;

    const sectorBucket =
      f.sector === "Public" ? agg.bySector.Public : agg.bySector.Private;
    sectorBucket.total += 1;
    if (f.licensed) sectorBucket.licensed += 1;

    if (PROVINCES.includes(f.province)) {
      const pb = agg.byProvince[f.province];
      pb.total += 1;
      if (f.licensed) pb.licensed += 1;
    }

    agg.byStage[f.stage] = (agg.byStage[f.stage] || 0) + 1;
  }

  agg.updatedAt = new Date().toISOString();
  return agg;
}
