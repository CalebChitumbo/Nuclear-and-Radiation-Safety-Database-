import { toCsv } from "./exportCsv";

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
 * The families the generator register reports against. RAIS records a free-form
 * `Type` (33 spellings across the export, plus 109 rows with none), so the tab
 * groups them into the families an inspector plans around.
 */
export const GENERATOR_FAMILIES = [
  "Fixed & Digital Radiography",
  "Mobile & Portable X-Ray",
  "Dental & OPG Systems",
  "CT & PET-CT Scanners",
  "C-Arm Units",
  "Fluoroscopy, Angiography & Cathlab",
  "Mammography Systems",
  "Radiotherapy & Accelerators",
  "Industrial & Analytical X-Ray",
  "Security Screening Scanners",
  "Other Specialised",
  "Type Not Recorded",
] as const;

export type GeneratorFamily = (typeof GENERATOR_FAMILIES)[number];

/**
 * Bucket a RAIS generator type into one of the families above.
 *
 * Order matters throughout. The specific machines are tested before the generic
 * X-ray words they contain, so a "Digital Mammography" is not swept into
 * radiography by its "Digital", a "Panoramic dental X-ray generator" is dental
 * rather than fixed, and a "Digital Mobile X-ray" is mobile rather than
 * digital radiography.
 */
export function generatorFamily(type: string): GeneratorFamily {
  const s = type.toLowerCase().trim();
  if (s === "") return "Type Not Recorded";

  // Treatment and particle machines first — a linac is not a radiography set.
  if (
    s.includes("linear accelerator") ||
    s.includes("brachytherapy") ||
    s.includes("afterloader") ||
    s.includes("cyclotron") ||
    s.includes("deep xray treatment") ||
    s.includes("deep x-ray treatment")
  ) {
    return "Radiotherapy & Accelerators";
  }

  // Screening portals, before "scanner" can pull them to CT.
  if (s.includes("baggage") || s.includes("cargo")) {
    return "Security Screening Scanners";
  }

  if (s.includes("mammograph")) return "Mammography Systems";
  if (s.includes("dental") || s.includes("opg") || s.includes("cephalometric")) {
    return "Dental & OPG Systems";
  }
  if (s.includes("c-arm") || s.includes("c arm")) return "C-Arm Units";
  if (s.includes("cathlab") || s.includes("cath lab") || s.includes("angiograph")) {
    return "Fluoroscopy, Angiography & Cathlab";
  }

  // Industrial fluoroscopy is a non-destructive-testing set, not a cathlab, so
  // it is claimed before the medical fluoroscopy test below.
  if (
    s.includes("xrf") ||
    s.includes("thickness gauge") ||
    s.includes("industrial")
  ) {
    return "Industrial & Analytical X-Ray";
  }
  if (s.includes("fluoro")) return "Fluoroscopy, Angiography & Cathlab";

  if (/\bct\b/.test(s) || s.includes("pet-ct") || s.includes("ct scanner")) {
    return "CT & PET-CT Scanners";
  }
  if (s.includes("mobile") || s.includes("portable")) {
    return "Mobile & Portable X-Ray";
  }
  if (s.includes("calibration") || s.includes("densitometer")) {
    return "Other Specialised";
  }
  if (s.includes("radiograph") || s.includes("conventional xray")) {
    return "Fixed & Digital Radiography";
  }
  return "Other Specialised";
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
  let securitySignificant = 0;
  const quality: RaisDataQuality = {
    missingSerial: 0,
    missingType: 0,
    missingNuclide: 0,
    missingActivity: 0,
    uncategorisedSources: 0,
    categoryConflicts: 0,
  };

  for (const r of records) {
    if (!isSerialRecorded(r.serialNumber)) quality.missingSerial += 1;

    if (r.kind === "Radiation Generator") {
      generators += 1;
      const family = generatorFamily(r.type);
      familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
      if (family === "Type Not Recorded") quality.missingType += 1;
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
      source ? "" : generatorFamily(r.type),
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
