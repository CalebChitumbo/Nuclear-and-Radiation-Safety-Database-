import { toCsv } from "./exportCsv";

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
 * filter of the table.
 */

/** One inventoried item, exactly as recorded in Annex I. */
export interface VerifiedRecord {
  /** Running number in the annex (1…215). */
  no: number;
  /** Establishment / facility holding the item. */
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
 * The nine machine families the exercise reports against (Annex summary order).
 * Every equipment type maps to exactly one of these.
 */
export const SOURCE_CATEGORIES = [
  "Fixed X-Ray Machines",
  "Dental X-Ray & OPG Systems",
  "Mobile & Portable X-Ray Units",
  "C-Arm Units",
  "CT Scanners",
  "Radioactive Sources",
  "Mammography Systems",
  "Fluoroscopy Units",
  "Other Specialized / Gauge Equipment",
] as const;

export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

/**
 * Bucket a free-form equipment type into one of the nine machine families.
 * Order matters: the sealed-source and specialised checks run before the plain
 * X-ray ones so a "Source: Cs-137" or an "Industrial Nuclear Gauge" is never
 * swept into "Fixed X-Ray".
 */
export function categorizeEquipment(equipmentType: string): SourceCategory {
  const s = equipmentType.toLowerCase().trim();

  // Sealed radioactive sources are written "Source: <nuclide>"; gauges use the
  // sealed source but are reported with the specialised equipment.
  if (s.includes("gauge")) return "Other Specialized / Gauge Equipment";
  if (s.startsWith("source:")) return "Radioactive Sources";

  // Specialised / non-imaging kit before the generic X-ray families.
  if (
    s.includes("xrf") ||
    s.includes("baggage") ||
    s.includes("dexter") ||
    s.includes("tube")
  ) {
    return "Other Specialized / Gauge Equipment";
  }

  if (s.includes("mammograph")) return "Mammography Systems";
  if (s.includes("fluoro")) return "Fluoroscopy Units";
  if (s.includes("c-arm") || s.includes("c arm")) return "C-Arm Units";
  if (/\bct\b/.test(s) || s.includes("ct-") || s === "scanners") {
    return "CT Scanners";
  }
  if (s.includes("dental") || s.includes("opg") || s === "opd" || s === "dpg") {
    return "Dental X-Ray & OPG Systems";
  }
  if (s.includes("mobile") || s.includes("portable")) {
    return "Mobile & Portable X-Ray Units";
  }
  return "Fixed X-Ray Machines";
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

  for (const r of records) {
    catCounts.set(
      categorizeEquipment(r.equipmentType),
      (catCounts.get(categorizeEquipment(r.equipmentType)) || 0) + 1,
    );
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
    byStatus: STATUS_GROUPS.map((group) => ({
      group,
      count: statusCounts.get(group) || 0,
    })),
    radioactiveSources: catCounts.get("Radioactive Sources") || 0,
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
    "Category",
    "Serial Number",
    "Status",
    "Status Group",
  ];
  const rows = records.map((r) => [
    String(r.no),
    r.facility,
    r.equipmentType,
    categorizeEquipment(r.equipmentType),
    r.serialNumber,
    r.status,
    statusGroup(r.status),
  ]);
  return toCsv(header, rows);
}
