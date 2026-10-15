import { toCsv } from "./exportCsv";
import {
  SEALED_SOURCES,
  UNRECOGNISED_TYPE,
  groupOf,
  SOURCE_CATEGORIES,
  sourceCategory,
  typesInCategory,
  type SourceCategory,
} from "./sourceCategories";
import { sourcePractice, type SourcePractice } from "./sourcePractice";

/**
 * The Verified Source Inventory tab — the radiation sources and radiation-
 * emitting devices the field team physically confirmed at the facilities
 * catalogued in the Authority's verification exercise. Each record is one item
 * as recorded in Annex I of the "Activity Report on Source Inventory
 * Programme": establishment, equipment type, serial number and the status
 * observed in the field.
 *
 * This is the ground truth, not the register: the companion tab, Source
 * Inventory (`raisInventory.ts`), holds every item on the books in RAIS. These
 * 215 items are the subset an officer stood in front of and confirmed, which is
 * why they carry a facility and a field status that RAIS cannot supply.
 *
 * The raw equipment-type text in the annex is free-form (fifty-odd spellings of
 * a dozen real machine families), so every helper here derives its groupings
 * from that text rather than trusting a stored category — the detail rows stay
 * the single source of truth, and every figure on the page reconciles with a
 * filter of the table. The categories themselves are shared with the RAIS tab
 * (`sourceCategories.ts`), which is what lets the register and the field
 * exercise be read against each other line by line.
 */

/** One inventoried item, exactly as recorded in Annex I. */
export interface VerifiedRecord {
  /** Running number in the annex (1…215). */
  no: number;
  /** Establishment / facility the item is located at. */
  facility: string;
  /** Equipment type as written in the annex (free-form). */
  equipmentType: string;
  /** Serial number, or a placeholder such as "Not Provided". */
  serialNumber: string;
  /** Status observed in the field, verbatim (e.g. "In Use", "Not In Use"). */
  status: string;
}

/** Provenance for the inventory, carried on the seed so the page can cite it. */
export interface VerifiedInventoryMeta {
  title: string;
  sourceDocument: string;
  reportDate: string;
  exercisePeriod: string;
  preparedBy: string[];
  department: string;
  coverage: string;
  totalItems: number;
  annexReference: string;
}

export interface VerifiedInventorySeed {
  meta: VerifiedInventoryMeta;
  items: VerifiedRecord[];
}

/**
 * The categories the exercise reports against — the shared inventory list
 * (`sourceCategories.ts`), so a machine is named here exactly as the RAIS
 * register names it and the two tabs can be read side by side. Every equipment
 * type maps to exactly one of them.
 */
export { SOURCE_CATEGORIES, SEALED_SOURCES };
export type { SourceCategory };

/**
 * Bucket a free-form equipment type into one of the categories above. The annex
 * writes a sealed source as "Source: <nuclide>"; the text alone cannot say what
 * the source is used for, so those land in the not-determined bucket here —
 * `categoryOf` below places a whole row, holder included.
 */
export function categorizeEquipment(equipmentType: string): SourceCategory {
  return sourceCategory(equipmentType);
}

/**
 * The category a whole annex row reports under. A machine is read from its
 * equipment text alone; a sealed source ("Source: Co-57") names only its
 * nuclide, so its use is read from that and the facility holding it — see
 * `sourcePractice`. Every figure on the tab reads a row, so this is the
 * function to use; `categorizeEquipment` remains for a bare piece of text.
 */
export function practiceOf(record: VerifiedRecord): SourcePractice {
  const nuclide = sealedSourceNuclide(record.equipmentType);
  if (nuclide === null) {
    return { category: categorizeEquipment(record.equipmentType), basis: "record" };
  }
  return sourcePractice(
    { nuclide: nuclide === "Not recorded" ? "" : nuclide },
    { facility: record.facility },
  );
}

export function categoryOf(record: VerifiedRecord): SourceCategory {
  return practiceOf(record).category;
}

/**
 * The nuclide an annex row names, for a row that records a sealed source —
 * "Source: Cs-137" reads as "Cs-137". Returns null for a machine.
 *
 * The Seniors' Briefing asked for sealed sources to be split by the type of
 * source rather than counted as one line; the nuclide as recorded is what the
 * annex gives, and it is taken verbatim, the way the RAIS tab takes its own.
 */
export function sealedSourceNuclide(equipmentType: string): string | null {
  const text = equipmentType.trim();
  if (sourceCategory(text) !== SEALED_SOURCES) return null;
  const nuclide = text.replace(/^sources?\s*:\s*/i, "").trim();
  return nuclide || "Not recorded";
}

/** Sealed sources by nuclide, commonest first. */
export function sourceTypeBreakdown(
  records: VerifiedRecord[],
): { nuclide: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const nuclide = sealedSourceNuclide(r.equipmentType);
    if (!nuclide) continue;
    counts.set(nuclide, (counts.get(nuclide) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([nuclide, count]) => ({ nuclide, count }))
    .sort((a, b) => b.count - a.count || a.nuclide.localeCompare(b.nuclide));
}

/**
 * The field statuses collapse to three working states. The raw status is kept
 * on the record and shown in the table; this grouping only drives the filter
 * and the "in use" figure.
 */
export const STATUS_GROUPS = ["In Use", "Not In Use", "Unspecified"] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export function statusGroup(status: string): StatusGroup {
  const s = status.toLowerCase().trim();
  // "Not in use", "Not yet in use", "Expired (Inactive)", "Inactive".
  // Checked first: "not in use" contains "in use", and "inactive" contains
  // "active", so the negatives must win before the positives are tested.
  if (
    s.includes("not in use") ||
    s.includes("not yet") ||
    s.includes("inactive") ||
    s.includes("expired")
  ) {
    return "Not In Use";
  }
  if (s.includes("in use") || s === "active") return "In Use";
  // "Not Provided", "New", "Basic" and anything else unrecognised.
  return "Unspecified";
}

/** A serial that is a real number, not a "Not Provided" / "N/A" placeholder. */
export function isSerialProvided(serial: string): boolean {
  const s = serial.toLowerCase().trim();
  return (
    s !== "" &&
    s !== "not provided" &&
    s !== "n/a" &&
    s !== "na" &&
    s !== "none" &&
    s !== "-"
  );
}

export interface VerifiedInventorySummary {
  total: number;
  facilities: number;
  serialsProvided: number;
  byCategory: { category: SourceCategory; count: number }[];
  /** Sealed sources by nuclide — the type-of-source split. */
  bySourceType: { nuclide: string; count: number }[];
  /** What the *Unrecognised Type* gap actually holds, commonest first. */
  unrecognised: { type: string; count: number }[];
  byStatus: { group: StatusGroup; count: number }[];
  radioactiveSources: number;
  inUse: number;
}

/** Roll the detail rows up into the figures shown on the page. */
export function summarizeVerifiedInventory(records: VerifiedRecord[]): VerifiedInventorySummary {
  const catCounts = new Map<SourceCategory, number>(
    SOURCE_CATEGORIES.map((c) => [c, 0]),
  );
  const statusCounts = new Map<StatusGroup, number>(
    STATUS_GROUPS.map((g) => [g, 0]),
  );
  const facilities = new Set<string>();
  let serialsProvided = 0;
  let radioactiveSources = 0;

  for (const r of records) {
    const category = categoryOf(r);
    catCounts.set(category, (catCounts.get(category) || 0) + 1);
    if (sealedSourceNuclide(r.equipmentType) !== null) radioactiveSources += 1;
    const g = statusGroup(r.status);
    statusCounts.set(g, (statusCounts.get(g) || 0) + 1);
    facilities.add(r.facility.trim().toLowerCase());
    if (isSerialProvided(r.serialNumber)) serialsProvided += 1;
  }

  return {
    total: records.length,
    facilities: facilities.size,
    serialsProvided,
    byCategory: SOURCE_CATEGORIES.map((category) => ({
      category,
      count: catCounts.get(category) || 0,
    })),
    bySourceType: sourceTypeBreakdown(records),
    unrecognised: typesInCategory(
      records.map((r) => r.equipmentType),
      UNRECOGNISED_TYPE,
    ),
    byStatus: STATUS_GROUPS.map((group) => ({
      group,
      count: statusCounts.get(group) || 0,
    })),
    radioactiveSources,
    inUse: statusCounts.get("In Use") || 0,
  };
}

/**
 * Load the seed into clean, number-sorted records. Trims stray whitespace and
 * drops any row missing both a facility and an equipment type (a defensive
 * guard against a malformed seed edit).
 */
export function loadVerifiedInventory(seed: VerifiedInventorySeed): VerifiedRecord[] {
  return seed.items
    .map((r) => ({
      no: r.no,
      facility: (r.facility || "").trim(),
      equipmentType: (r.equipmentType || "").trim(),
      serialNumber: (r.serialNumber || "").trim(),
      status: (r.status || "").trim(),
    }))
    .filter((r) => r.facility !== "" || r.equipmentType !== "")
    .sort((a, b) => a.no - b.no);
}

/** Flatten records for CSV export, one line per item, with the derived groups. */
export function verifiedInventoryToCsv(records: VerifiedRecord[]): string {
  const header = [
    "No",
    "Facility",
    "Equipment Type",
    "Practice Group",
    "Category",
    "Serial Number",
    "Status",
    "Status Group",
  ];
  const rows = records.map((r) => [
    String(r.no),
    r.facility,
    r.equipmentType,
    groupOf(categoryOf(r)),
    categoryOf(r),
    r.serialNumber,
    r.status,
    statusGroup(r.status),
  ]);
  return toCsv(header, rows);
}
