import { toCsv } from "./exportCsv";
import {
  SEALED_SOURCES,
  SOURCE_CATEGORIES,
  TYPE_NOT_RECORDED,
  XRF_UNSPECIFIED,
  sourceCategory,
  typesInCategory,
  type SourceCategory,
} from "./sourceCategories";
import { XRF_FORM_BY_RAN } from "./xrfDeterminations";

/**
 * The Source Inventory tab — the national register of radiation generators and
 * sealed sources as held in RAIS (the IAEA Regulatory Authority Information
 * System), which is the Authority's system of record for authorised items.
 *
 * This is the register as RAIS knows it, not as the field team found it. The
 * companion tab, Verified Source Inventory (`verifiedInventory.ts`), holds the
 * items physically confirmed during the field verification exercise. Read
 * together they show what is on the books against what is on the ground, so
 * nothing here is corrected on import: a missing serial number or a mistyped
 * nuclide is a finding, not a defect to paper over.
 *
 * RAIS exports generators and sources as two sheets with different columns.
 * They arrive here as one record shape keyed by RAN (Radiation Accession
 * Number), with the source-only fields optional. Every grouping below is
 * derived from the detail rows, so each figure on the page reconciles with a
 * filter of the table.
 */

export const RAIS_KINDS = ["Radiation Generator", "Sealed Source"] as const;
export type RaisKind = (typeof RAIS_KINDS)[number];

/** One registered item, as exported from RAIS. */
export interface RaisRecord {
  /** Running number in register order — generators, then sources, by RAN. */
  no: number;
  /** Radiation Accession Number, e.g. "RG/0376" or "SS/0639". Unique. */
  ran: string;
  kind: RaisKind;
  /** Generator type as recorded in RAIS (free-form); empty for sources. */
  type: string;
  manufacturer: string;
  model: string;
  serialNumber: string;

  // Sealed sources only — absent on generator records.
  /** Radionuclide, e.g. "Cs-137". May list more than one. */
  nuclide?: string;
  /** Declared activity as exported, e.g. "9.99E+02 GBq". */
  activity?: string;
  /** Date the declared activity was measured (ISO). */
  activityDate?: string;
  /** IAEA category 1–5, the officer's entry preferred over RAIS' own. */
  sealedCategory?: string;
  /** Which of the two category fields the value above came from. */
  categorySource?: "manual" | "calculated";
  /** RAIS' calculated category, present only when it contradicts the entry. */
  categoryCalculated?: string;
  /** Security level A–C. */
  securityLevel?: string;
  /** ISO 2919 compliance, "Yes" / "No". */
  isoCompliance?: string;
  /** Recommended working life, e.g. "15 Year". */
  workingLife?: string;
}

/** Provenance for the export, carried on the seed so the page can cite it. */
export interface RaisInventoryMeta {
  title: string;
  sourceDocument: string;
  exportedOn: string;
  system: string;
  department: string;
  coverage: string;
  totalItems: number;
  generators: number;
  sealedSources: number;
}

export interface RaisInventorySeed {
  meta: RaisInventoryMeta;
  items: RaisRecord[];
}

/**
 * The families the generator register reports against — the shared inventory
 * categories (`sourceCategories.ts`) less the sealed-source bucket, which no
 * generator can land in. RAIS records a free-form `Type` (33 spellings across
 * the export, plus 109 rows with none), and the shared classifier folds those
 * into the categories the Seniors' Briefing asked the inventory to report
 * against, so this tab and the field-verified one now name a machine the same
 * way.
 */
export const GENERATOR_FAMILIES = SOURCE_CATEGORIES.filter(
  (c) => c !== SEALED_SOURCES,
) as readonly SourceCategory[];

export type GeneratorFamily = SourceCategory;

/**
 * Bucket a RAIS generator type into one of the families above. The rules are
 * shared with the field annex — see `sourceCategory` for the ordering that
 * keeps a "Digital Mammography" out of digital radiography and a "Baggage
 * Scanner" out of CT.
 */
export function generatorFamily(type: string): GeneratorFamily {
  return sourceCategory(type);
}

/**
 * The family for a whole record rather than for its type text alone. Identical
 * to `generatorFamily` except for the register's XRF analysers, which RAIS
 * types only as "XRF": for those the Authority's own determination of portable
 * against fixed (`XRF_FORM_BY_RAN`, keyed by RAN) fills the gap.
 *
 * A determination never overrides what a record says. Once the type text
 * classifies as anything more specific than an unqualified XRF — because an
 * officer corrected it, or a later export spells it out — that wins, and the
 * table is not consulted. Every figure on the tab reads a record, so this is
 * the function to use; `generatorFamily` remains for a bare piece of text.
 */
export function generatorFamilyOf(record: RaisRecord): GeneratorFamily {
  const family = sourceCategory(record.type);
  if (family !== XRF_UNSPECIFIED) return family;
  return XRF_FORM_BY_RAN[record.ran.trim()] || family;
}

/** The five IAEA source categories, most significant first. */
export const IAEA_CATEGORIES = [
  "Category 1",
  "Category 2",
  "Category 3",
  "Category 4",
  "Category 5",
] as const;

export type IaeaCategory = (typeof IAEA_CATEGORIES)[number];

/** The label used for a source RAIS has never been categorised. */
export const UNCATEGORISED = "Not categorised";

export type SealedCategoryLabel = IaeaCategory | typeof UNCATEGORISED;

/** The category axis as reported: the five categories, then the gap. */
export const SEALED_CATEGORY_LABELS: readonly SealedCategoryLabel[] = [
  ...IAEA_CATEGORIES,
  UNCATEGORISED,
];

export function sealedCategoryLabel(record: RaisRecord): SealedCategoryLabel {
  const value = (record.sealedCategory || "").trim();
  const match = IAEA_CATEGORIES.find(
    (c) => c.toLowerCase() === value.toLowerCase(),
  );
  return match || UNCATEGORISED;
}

/**
 * Categories 1–3 are the security-significant ones: the sources the Code of
 * Conduct expects to be tracked individually, and the figure the Authority
 * reports on. Categories 4 and 5, and the uncategorised, are excluded.
 */
export function isSecuritySignificant(record: RaisRecord): boolean {
  const c = sealedCategoryLabel(record);
  return c === "Category 1" || c === "Category 2" || c === "Category 3";
}

/** The label used for a source with no nuclide recorded. */
export const NUCLIDE_NOT_RECORDED = "Not recorded";

/** Nuclide for grouping — verbatim from RAIS, or the not-recorded label. */
export function nuclideLabel(record: RaisRecord): string {
  return (record.nuclide || "").trim() || NUCLIDE_NOT_RECORDED;
}

const ACTIVITY_UNITS: Record<string, number> = {
  bq: 1,
  kbq: 1e3,
  mbq: 1e6,
  gbq: 1e9,
  tbq: 1e12,
  // 1 Ci = 3.7 × 10^10 Bq exactly.
  ci: 3.7e10,
  mci: 3.7e7,
  µci: 3.7e4,
  uci: 3.7e4,
};

export interface ParsedActivity {
  value: number;
  unit: string;
  /** The activity in becquerels, so records in mCi and GBq sort together. */
  becquerels: number;
}

/**
 * Parse RAIS' activity notation — "9.99E+02 GBq", "5E+00 mCi" — into a
 * comparable figure. Returns null for a blank cell or a unit not in the table
 * above, so an unreadable value is skipped rather than silently counted as
 * zero.
 */
export function parseActivity(activity: string | undefined): ParsedActivity | null {
  const text = (activity || "").trim();
  if (!text) return null;
  const match = text.match(/^([0-9.]+(?:[eE][+-]?\d+)?)\s*([A-Za-zµ]+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const factor = ACTIVITY_UNITS[match[2].toLowerCase()];
  if (factor === undefined) return null;
  return { value, unit: match[2], becquerels: value * factor };
}

/** A serial that is a real number, not a blank or a "not visible" note. */
export function isSerialRecorded(serial: string): boolean {
  const s = (serial || "").toLowerCase().trim();
  return s !== "" && s !== "not visible" && s !== "not provided";
}

/**
 * The gaps the tab reports on. These are the reason the RAIS register and the
 * field-verified one are shown side by side: each figure is a count of items
 * the register cannot fully describe.
 */
export interface RaisDataQuality {
  missingSerial: number;
  missingType: number;
  /**
   * Generators the register calls "XRF" without saying whether they are
   * portable or fixed. The two are counted apart now, so an unqualified entry
   * is a row for an officer to resolve rather than a family of its own.
   */
  xrfTypeUnspecified: number;
  missingNuclide: number;
  missingActivity: number;
  uncategorisedSources: number;
  /** Sources where the officer's category contradicts RAIS' calculated one. */
  categoryConflicts: number;
}

export interface RaisSummary {
  total: number;
  generators: number;
  sealedSources: number;
  securitySignificant: number;
  /** Named nuclides in the register — the not-recorded bucket is not one. */
  distinctNuclides: number;
  byFamily: { family: GeneratorFamily; count: number }[];
  /**
   * What the catch-all family actually holds, commonest first — the briefing
   * asked for the equipment under "Other Specialised" to be spelled out rather
   * than left to the label.
   */
  otherSpecialised: { type: string; count: number }[];
  /**
   * How many of the Portable / Fixed XRF counts come from the Authority's
   * determination rather than from the register's own words, so the tab can
   * say so where it reports them.
   */
  xrfDetermined: { portable: number; fixed: number };
  byNuclide: { nuclide: string; count: number }[];
  byCategory: { category: SealedCategoryLabel; count: number }[];
  dataQuality: RaisDataQuality;
}

/** Roll the detail rows up into the figures shown on the page. */
export function summarizeRaisInventory(records: RaisRecord[]): RaisSummary {
  const familyCounts = new Map<GeneratorFamily, number>(
    GENERATOR_FAMILIES.map((f) => [f, 0]),
  );
  const categoryCounts = new Map<SealedCategoryLabel, number>(
    SEALED_CATEGORY_LABELS.map((c) => [c, 0]),
  );
  const nuclideCounts = new Map<string, number>();

  let generators = 0;
  let sealedSources = 0;
  const determined = { portable: 0, fixed: 0 };
  let securitySignificant = 0;
  const quality: RaisDataQuality = {
    missingSerial: 0,
    missingType: 0,
    xrfTypeUnspecified: 0,
    missingNuclide: 0,
    missingActivity: 0,
    uncategorisedSources: 0,
    categoryConflicts: 0,
  };

  for (const r of records) {
    if (!isSerialRecorded(r.serialNumber)) quality.missingSerial += 1;

    if (r.kind === "Radiation Generator") {
      generators += 1;
      const family = generatorFamilyOf(r);
      familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
      if (family === TYPE_NOT_RECORDED) quality.missingType += 1;
      if (family === XRF_UNSPECIFIED) quality.xrfTypeUnspecified += 1;
      // Counted where the family came from the determination table, not from
      // the record's own text.
      if (sourceCategory(r.type) === XRF_UNSPECIFIED) {
        if (family === "Portable XRF") determined.portable += 1;
        if (family === "Fixed XRF") determined.fixed += 1;
      }
      continue;
    }

    sealedSources += 1;
    const nuclide = nuclideLabel(r);
    nuclideCounts.set(nuclide, (nuclideCounts.get(nuclide) || 0) + 1);
    if (nuclide === NUCLIDE_NOT_RECORDED) quality.missingNuclide += 1;
    if (!parseActivity(r.activity)) quality.missingActivity += 1;

    const category = sealedCategoryLabel(r);
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    if (category === UNCATEGORISED) quality.uncategorisedSources += 1;
    if (isSecuritySignificant(r)) securitySignificant += 1;
    if (r.categoryCalculated) quality.categoryConflicts += 1;
  }

  return {
    total: records.length,
    generators,
    sealedSources,
    securitySignificant,
    distinctNuclides: [...nuclideCounts.keys()].filter(
      (n) => n !== NUCLIDE_NOT_RECORDED,
    ).length,
    byFamily: GENERATOR_FAMILIES.map((family) => ({
      family,
      count: familyCounts.get(family) || 0,
    })),
    otherSpecialised: typesInCategory(
      records
        .filter((r) => r.kind === "Radiation Generator")
        .map((r) => r.type),
      "Other Specialised Equipment",
    ),
    xrfDetermined: determined,
    // Commonest nuclide first; the not-recorded bucket always sits last so it
    // reads as a gap rather than as one more nuclide in the register.
    byNuclide: [...nuclideCounts.entries()]
      .map(([nuclide, count]) => ({ nuclide, count }))
      .sort((a, b) => {
        if (a.nuclide === NUCLIDE_NOT_RECORDED) return 1;
        if (b.nuclide === NUCLIDE_NOT_RECORDED) return -1;
        return b.count - a.count || a.nuclide.localeCompare(b.nuclide);
      }),
    byCategory: SEALED_CATEGORY_LABELS.map((category) => ({
      category,
      count: categoryCounts.get(category) || 0,
    })),
    dataQuality: quality,
  };
}

/**
 * Load the seed into clean, number-sorted records. Trims stray whitespace and
 * drops any row without a RAN — without its accession number an item cannot be
 * looked up in RAIS, so it is not a register entry.
 */
export function loadRaisInventory(seed: RaisInventorySeed): RaisRecord[] {
  return seed.items
    .map((r) => ({
      ...r,
      no: r.no,
      ran: (r.ran || "").trim(),
      kind: r.kind,
      type: (r.type || "").trim(),
      manufacturer: (r.manufacturer || "").trim(),
      model: (r.model || "").trim(),
      serialNumber: (r.serialNumber || "").trim(),
    }))
    .filter((r) => r.ran !== "")
    .sort((a, b) => a.no - b.no);
}

/** Flatten records for CSV export, one line per item, with the derived groups. */
export function raisInventoryToCsv(records: RaisRecord[]): string {
  const header = [
    "No",
    "RAN",
    "Kind",
    "Type",
    "Family",
    "Manufacturer",
    "Model",
    "Serial Number",
    "Nuclide",
    "Activity",
    "Activity Date",
    "IAEA Category",
    "Category Source",
    "RAIS Calculated Category",
    "Security Level",
    "ISO 2919",
    "Working Life",
  ];
  const rows = records.map((r) => {
    const source = r.kind === "Sealed Source";
    return [
      String(r.no),
      r.ran,
      r.kind,
      r.type,
      source ? "" : generatorFamilyOf(r),
      r.manufacturer,
      r.model,
      r.serialNumber,
      source ? nuclideLabel(r) : "",
      r.activity || "",
      r.activityDate || "",
      source ? sealedCategoryLabel(r) : "",
      r.categorySource || "",
      r.categoryCalculated || "",
      r.securityLevel || "",
      r.isoCompliance || "",
      r.workingLife || "",
    ];
  });
  return toCsv(header, rows);
}
