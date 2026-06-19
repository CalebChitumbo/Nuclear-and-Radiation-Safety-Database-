import {
  type Facility,
  type LicenceType,
  type Stage,
  LICENCE_TYPES,
  isUseP,
} from "./types";

/**
 * Register-wide licence statistics for the Overview and Licences pages.
 *
 *  - how many authorisations of each type have been issued (renewal + new use +
 *    import + transit + transfer + …), and
 *  - how many facilities hold a current Use/Possession licence *for a given
 *    year* versus those still in the renewal pipeline (and which stage).
 *
 * Pure; cheap to recompute at 474 facilities, so the pages derive it on the
 * client from the facility list they already load.
 */
export interface LicenceStats {
  /** Total authorisations recorded across the whole register (every type). */
  totalIssued: number;
  /** Count of recorded authorisations per licence type. */
  issuedByType: Record<LicenceType, number>;
  /** Use/Possession licences (new + renewal) — the ones that confer "licensed". */
  useTotal: number;
  /** Standalone authorisations (import/transit/transfer/variation/export/…). */
  otherTotal: number;
  /** Facilities currently flagged licensed for Use/Possession. */
  licensedTotal: number;
  /** Of those, the ones whose latest Use/Possession licence is dated in `year` (or later). */
  licensedThisYear: number;
  /** Licensed, but the latest Use/Possession licence predates `year` or is undated. */
  licensedYearUnconfirmed: number;
  /** Facilities with no current Use/Possession licence. */
  notLicensed: number;
  /** The renewal-pipeline stage those unlicensed facilities sit on. */
  notLicensedByStage: Partial<Record<Stage, number>>;
}

/**
 * Full year of an authorisation date ("YYYY-MM-DD", or any Date-parseable
 * string), or null when there is no usable date. Seeded auths carry no date, so
 * those facilities count as "year unconfirmed" until a dated renewal is logged.
 */
export function licenceYear(date: string): number | null {
  const iso = /^(\d{4})-\d{2}-\d{2}/.exec(date || "");
  if (iso) return Number(iso[1]);
  const t = Date.parse(date || "");
  return Number.isNaN(t) ? null : new Date(t).getUTCFullYear();
}

function emptyByType(): Record<LicenceType, number> {
  const o = {} as Record<LicenceType, number>;
  for (const t of LICENCE_TYPES) o[t] = 0;
  return o;
}

export function computeLicenceStats(
  facilities: Facility[],
  year: number,
): LicenceStats {
  const issuedByType = emptyByType();
  let totalIssued = 0;
  let useTotal = 0;
  let otherTotal = 0;
  let licensedTotal = 0;
  let licensedThisYear = 0;
  let notLicensed = 0;
  const notLicensedByStage: Partial<Record<Stage, number>> = {};

  for (const f of facilities) {
    const auths = f.auths || [];
    for (const a of auths) {
      totalIssued += 1;
      issuedByType[a.type] = (issuedByType[a.type] ?? 0) + 1;
      if (isUseP(a.type)) useTotal += 1;
      else otherTotal += 1;
    }

    if (f.licensed) {
      licensedTotal += 1;
      // The most recent Use/Possession licence year tells us whether this
      // facility's licence is current for `year` (renewed) or due for renewal.
      const years = auths
        .filter((a) => isUseP(a.type))
        .map((a) => licenceYear(a.date))
        .filter((y): y is number => y !== null);
      const latest = years.length ? Math.max(...years) : null;
      if (latest !== null && latest >= year) licensedThisYear += 1;
    } else {
      notLicensed += 1;
      notLicensedByStage[f.stage] = (notLicensedByStage[f.stage] || 0) + 1;
    }
  }

  return {
    totalIssued,
    issuedByType,
    useTotal,
    otherTotal,
    licensedTotal,
    licensedThisYear,
    licensedYearUnconfirmed: licensedTotal - licensedThisYear,
    notLicensed,
    notLicensedByStage,
  };
}
