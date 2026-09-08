/**
 * Where each registered item actually is.
 *
 * The RAIS register export (`raisInventory.ts`) says WHAT an item is — its
 * type or nuclide, its manufacturer, its serial. It does not say who holds it.
 * RAIS keeps that on a second pair of exports, "History of a Radiation
 * Generator" and "History of a Sealed Source", one row per item: the facility
 * it is registered under, the department inside that facility, the item's
 * status and the date that status was set. `scripts/convert-source-holders.py`
 * turns those into `seed/rais-source-holders.seed.json` and this module joins
 * them onto the register by RAN.
 *
 * Two things the join has to be honest about:
 *
 * - **Not every item has one.** The exports cover 1,533 of the register's
 *   1,752 items; the rest are registered with nobody named against them. That
 *   is a gap the tab reports, never a placeholder facility.
 * - **Not every facility is on the register.** A handful of the facilities
 *   RAIS names are not in `seed/facilities.seed.json` (a test record, a clinic
 *   or two). Those keep the name RAIS gave them and are counted apart, because
 *   a holder the facilities register has never heard of is a worklist.
 *
 * District and province are not in the RAIS exports — they belong to the
 * facilities register, and the seed carries a small index of them for the ~300
 * facilities the exports name so this route need not bundle all 538. Pure, as
 * everything in `lib/rules` is: the seed comes in as an argument.
 */

/** One item's holding, verbatim from the RAIS export. */
export interface SourceHolder {
  /** Radiation Accession Number — joins onto the register. */
  ran: string;
  /** Facility name as RAIS spells it, without its "(FAC/nnnn)" suffix. */
  facility: string;
  /** The facility's code in the facilities register, e.g. "FAC/0173". */
  facCode: string;
  /** Department inside the facility, where RAIS records one. Often blank. */
  department: string;
  /** RAIS' own status wording — "In Use", "In Storage", "Not Imported" … */
  status: string;
  /** The date the status was set (ISO), blank when the export gives none. */
  statusDate: string;
}

/** District and province for one facility, indexed off the facilities register. */
export interface SourceHolderFacility {
  facCode: string;
  /** The facilities register's spelling, which is not always RAIS'. */
  name: string;
  district: string;
  province: string;
}

export interface SourceHoldersMeta {
  title: string;
  sourceDocument: string;
  exportedOn: string;
  system: string;
  department: string;
  coverage: string;
  totalHoldings: number;
  generators: number;
  sealedSources: number;
  facilities: number;
}

export interface SourceHoldersSeed {
  meta: SourceHoldersMeta;
  holders: SourceHolder[];
  facilities: SourceHolderFacility[];
}

/** Shown wherever an item's holder, or a holder's location, is not on file. */
export const HOLDER_NOT_RECORDED = "Holder not recorded";
export const LOCATION_NOT_RECORDED = "Location not on the facilities register";

/**
 * A holding with the facility's location joined on. `onRegister` is false when
 * RAIS names a facility the facilities register does not hold — the name still
 * shows, the location cannot.
 */
export interface ResolvedHolder extends SourceHolder {
  district: string;
  province: string;
  onRegister: boolean;
}

/** The joined holdings, keyed by RAN — what every function below reads. */
export type SourceHolderIndex = Map<string, ResolvedHolder>;

/**
 * Build the index from the seed. Rows without a RAN are dropped (an item that
 * cannot be looked up in RAIS is not a holding), and a RAN named twice keeps
 * the first — the converter refuses to write a duplicate, so this is a guard
 * on a hand-edited seed rather than a routine case.
 */
export function loadSourceHolders(seed: SourceHoldersSeed): SourceHolderIndex {
  const facilities = new Map(
    (seed.facilities || []).map((f) => [f.facCode.trim(), f]),
  );
  const index: SourceHolderIndex = new Map();
  for (const raw of seed.holders || []) {
    const ran = (raw.ran || "").trim();
    if (!ran || index.has(ran)) continue;
    const facCode = (raw.facCode || "").trim();
    const known = facilities.get(facCode);
    index.set(ran, {
      ran,
      facility: (raw.facility || "").trim(),
      facCode,
      department: (raw.department || "").trim(),
      status: (raw.status || "").trim(),
      statusDate: (raw.statusDate || "").trim(),
      district: known?.district || "",
      province: known?.province || "",
      onRegister: !!known,
    });
  }
  return index;
}

/** The holding for one item, or null when the exports never named it. */
export function holderFor(
  index: SourceHolderIndex,
  ran: string,
): ResolvedHolder | null {
  return index.get((ran || "").trim()) || null;
}

/**
 * A location on one line — "Ndola · Copperbelt", or the district alone when
 * the two are the same word (Lusaka, Ndola and Kitwe all are). Takes anything
 * carrying the three fields, so it reads a holding or a facility row alike.
 */
export function locationLabel(
  where: { district: string; province: string; onRegister: boolean } | null,
): string {
  if (!where) return "";
  if (!where.onRegister) return LOCATION_NOT_RECORDED;
  const { district, province } = where;
  if (!district && !province) return "";
  if (!district) return province;
  if (!province || district === province) return district;
  return `${district} · ${province}`;
}

/** Everything about a holding that should match a search box. */
export function holderSearchText(holder: ResolvedHolder | null): string {
  if (!holder) return "";
  return [
    holder.facility,
    holder.facCode,
    holder.department,
    holder.district,
    holder.province,
    holder.status,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface HolderGroup {
  /** Province, facility name, or status — whichever axis this row counts. */
  label: string;
  count: number;
}

export interface FacilityHolding extends HolderGroup {
  facCode: string;
  district: string;
  province: string;
  onRegister: boolean;
}

export interface HolderSummary {
  /** Items the exports name a facility for. */
  withHolder: number;
  /** Items registered with nobody named against them. */
  withoutHolder: number;
  /** Distinct facilities named — by code, or by name where RAIS gives none. */
  facilities: number;
  /** Facilities RAIS names that the facilities register does not hold. */
  facilitiesOffRegister: number;
  /** Items held at those facilities — the location worklist. */
  itemsOffRegister: number;
  /** Commonest province first; items with no province are not counted here. */
  byProvince: HolderGroup[];
  /** Every facility, most items first. */
  byFacility: FacilityHolding[];
  /** RAIS' status wording, commonest first. */
  byStatus: HolderGroup[];
}

function sortByCount<T extends HolderGroup>(rows: T[]): T[] {
  return rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Roll the holdings up for the records given — the merged register, so an item
 * an officer added or removed counts here exactly as it counts everywhere else
 * on the tab. Every figure reconciles with a filter of the list below it.
 */
export function summariseHolders(
  records: { ran: string }[],
  index: SourceHolderIndex,
): HolderSummary {
  const provinces = new Map<string, number>();
  const statuses = new Map<string, number>();
  const facilities = new Map<string, FacilityHolding>();
  let withHolder = 0;
  let itemsOffRegister = 0;

  for (const record of records) {
    const holder = holderFor(index, record.ran);
    if (!holder) continue;
    withHolder += 1;
    if (!holder.onRegister) itemsOffRegister += 1;
    if (holder.province) {
      provinces.set(holder.province, (provinces.get(holder.province) || 0) + 1);
    }
    if (holder.status) {
      statuses.set(holder.status, (statuses.get(holder.status) || 0) + 1);
    }
    // Keyed by code where RAIS gives one: two spellings of the same facility
    // are one holder, which is the whole point of the code being exported.
    const key = holder.facCode || holder.facility;
    if (!key) continue;
    const row = facilities.get(key);
    if (row) row.count += 1;
    else {
      facilities.set(key, {
        label: holder.facility || key,
        count: 1,
        facCode: holder.facCode,
        district: holder.district,
        province: holder.province,
        onRegister: holder.onRegister,
      });
    }
  }

  const byFacility = sortByCount([...facilities.values()]);
  return {
    withHolder,
    withoutHolder: records.length - withHolder,
    facilities: byFacility.length,
    facilitiesOffRegister: byFacility.filter((f) => !f.onRegister).length,
    itemsOffRegister,
    byProvince: sortByCount(
      [...provinces.entries()].map(([label, count]) => ({ label, count })),
    ),
    byFacility,
    byStatus: sortByCount(
      [...statuses.entries()].map(([label, count]) => ({ label, count })),
    ),
  };
}
