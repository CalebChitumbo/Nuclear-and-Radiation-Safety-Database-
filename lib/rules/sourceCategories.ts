/**
 * The equipment categories the source inventory reports against — one list,
 * shared by both inventory tabs.
 *
 * The split follows the recommendations of the Seniors' Monday Briefing on the
 * inventory exercise (September 2026): fixed radiography separated from digital,
 * dental from dental CBCT, radiotherapy into brachytherapy and teletherapy with
 * linear accelerators standing alone, CT into general / PET-CT / SPECT-CT,
 * fluoroscopy apart from angiography and cath lab, screening into cargo,
 * baggage and portal monitors, and XRF into portable and fixed. See
 * `docs/source-inventory-categories-2026.md` for the memo and the mapping.
 *
 * Both registers record equipment as free-form text — RAIS' `Type` column and
 * the field annex's `Equipment Type` — in different vocabularies for the same
 * machines ("Conventional dental Xray generator" against "Dental X-ray"). One
 * classifier reads both, so the two tabs can finally be compared category by
 * category, and a category exists here whether or not either register has an
 * item in it yet: it is the vocabulary officers file against, not a summary of
 * what happens to be on the books today.
 */

export const SOURCE_CATEGORIES = [
  "Fixed X-Ray Machines",
  "Conventional Fixed Digital Radiography",
  "Mobile & Portable X-Ray",
  "General Dental X-Ray",
  "Dental CBCT",
  "Mammography Systems",
  "C-Arm Units",
  "Fluoroscopy",
  "Angiography & Cath Lab",
  "General CT",
  "PET-CT",
  "SPECT-CT",
  "Brachytherapy",
  "Teletherapy",
  "Linear Accelerators",
  "Cargo Scanners",
  "Baggage Scanners",
  "Portal Monitors",
  "Portable XRF",
  "Fixed XRF",
  "XRF (Type Not Specified)",
  "Industrial X-Ray & Gauging",
  "Other Specialised Equipment",
  "Sealed Sources",
  "Type Not Recorded",
] as const;

export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

/** Sealed sources are grouped by nuclide, not by machine — see `sourceTypeOf`. */
export const SEALED_SOURCES: SourceCategory = "Sealed Sources";

/** A register row that names no equipment at all. Reported as a gap. */
export const TYPE_NOT_RECORDED: SourceCategory = "Type Not Recorded";

/**
 * An XRF analyser whose register entry does not say whether it is portable or
 * fixed. The briefing asked for the two to be counted apart; where the register
 * only says "XRF" the item waits here rather than being guessed into one of
 * them. It is a worklist, not a machine family.
 */
export const XRF_UNSPECIFIED: SourceCategory = "XRF (Type Not Specified)";

/** The buckets that report a gap in the register rather than a machine family. */
export const GAP_CATEGORIES: readonly SourceCategory[] = [
  XRF_UNSPECIFIED,
  TYPE_NOT_RECORDED,
];

/**
 * Bucket a free-form equipment type into one of the categories above.
 *
 * Order is the whole of the logic: nearly every entry contains a generic X-ray
 * word, so each specific machine has to claim its rows before the generic test
 * that would also match them. A "Digital Mobile X-ray" is mobile rather than
 * digital radiography, a "Portable Dental X Ray" is dental rather than
 * portable, an "Industrial Xray fluoroscopy" is NDT kit rather than a
 * fluoroscopy suite, and an "X-Ray Baggage Scan" is a screening scanner rather
 * than a radiography set.
 */
export function sourceCategory(equipmentType: string): SourceCategory {
  const s = equipmentType.toLowerCase().trim();
  if (s === "") return TYPE_NOT_RECORDED;

  // The field annex writes a sealed source as "Source: <nuclide>".
  if (/^sources?\s*:/.test(s)) return SEALED_SOURCES;

  // Treatment machines first — a linac is not a radiography set, and "deep
  // X-ray treatment" is orthovoltage external beam, i.e. teletherapy.
  if (s.includes("linear accelerator") || s.includes("linac")) {
    return "Linear Accelerators";
  }
  if (s.includes("brachytherapy") || s.includes("afterloader")) {
    return "Brachytherapy";
  }
  if (
    s.includes("teletherapy") ||
    s.includes("orthovoltage") ||
    s.includes("deep xray treatment") ||
    s.includes("deep x-ray treatment")
  ) {
    return "Teletherapy";
  }

  // Screening, before "scanner" can pull a portal or a baggage set to CT.
  if (s.includes("portal monitor") || s.includes("portal radiation")) {
    return "Portal Monitors";
  }
  if (s.includes("cargo")) return "Cargo Scanners";
  if (s.includes("baggage") || s.includes("luggage") || s.includes("parcel")) {
    return "Baggage Scanners";
  }

  // XRF before the industrial and generic X-ray tests it would otherwise fall
  // to. Portable and fixed are read from the entry; neither is inferred from
  // the manufacturer's model name.
  if (s.includes("xrf") || s.includes("fluorescence")) {
    if (
      s.includes("portable") ||
      s.includes("handheld") ||
      s.includes("hand-held") ||
      s.includes("hand held") ||
      s.includes("mobile")
    ) {
      return "Portable XRF";
    }
    if (
      s.includes("fixed") ||
      s.includes("bench") ||
      s.includes("desktop") ||
      s.includes("stationary") ||
      s.includes("on-line") ||
      s.includes("online") ||
      s.includes("laboratory")
    ) {
      return "Fixed XRF";
    }
    return XRF_UNSPECIFIED;
  }

  if (s.includes("mammograph")) return "Mammography Systems";

  // Dental before the fixed / portable / panoramic words its entries carry.
  const cbct = s.includes("cbct") || s.includes("cone beam");
  if (
    s.includes("dental") ||
    s.includes("opg") ||
    s.includes("cephalometric") ||
    s.includes("panoramic") ||
    s === "opd" ||
    s === "dpg"
  ) {
    return cbct ? "Dental CBCT" : "General Dental X-Ray";
  }
  if (cbct) return "Dental CBCT";

  // A C-arm is a C-arm wherever it is installed, cath labs included.
  if (s.includes("c-arm") || s.includes("c arm")) return "C-Arm Units";
  if (s.includes("cathlab") || s.includes("cath lab") || s.includes("angiograph")) {
    return "Angiography & Cath Lab";
  }

  // Industrial radiography and gauging, before the medical fluoroscopy and CT
  // tests: an "Industrial Xray fluoroscopy" is a non-destructive-testing set.
  if (
    s.includes("industrial") ||
    s.includes("gauge") ||
    s.includes("gauging") ||
    s.includes("non-destructive") ||
    s.includes("ndt")
  ) {
    return "Industrial X-Ray & Gauging";
  }
  if (s.includes("fluoro")) return "Fluoroscopy";

  // The hybrid scanners before plain CT, which their names contain.
  if (s.includes("spect")) return "SPECT-CT";
  if (/\bpet\b/.test(s) || s.includes("pet-ct") || s.includes("pet/ct")) {
    return "PET-CT";
  }
  if (/\bct\b/.test(s) || s.includes("ct-") || s === "scanners") {
    return "General CT";
  }

  if (s.includes("mobile") || s.includes("portable")) {
    return "Mobile & Portable X-Ray";
  }

  // Named specialised kit, claimed before the generic X-ray fallback so a
  // calibration set or a bone densitometer is not filed as radiography.
  if (
    s.includes("calibration") ||
    s.includes("densitometer") ||
    s.includes("cyclotron") ||
    s.includes("particle radiation") ||
    s.includes("x-ray tube") ||
    s.includes("xray tube") ||
    s.includes("dexter")
  ) {
    return "Other Specialised Equipment";
  }

  // What is left of the plain radiography sets: digital first, since the
  // briefing counts conventional fixed digital radiography apart from the
  // conventional fixed machines.
  if (
    s.includes("digital radiograph") ||
    /\bdr\b/.test(s) ||
    (s.includes("digital") && (s.includes("fixed") || s.includes("radiograph")))
  ) {
    return "Conventional Fixed Digital Radiography";
  }
  if (
    s.includes("radiograph") ||
    s.includes("fixed") ||
    s.includes("x-ray") ||
    s.includes("xray") ||
    s.includes("x ray")
  ) {
    return "Fixed X-Ray Machines";
  }

  return "Other Specialised Equipment";
}

/**
 * Count the distinct equipment entries that landed in one category, commonest
 * first. The briefing asked for the equipment under "Other Specialised" to be
 * spelled out; this is what the pages print beneath that row, and it works for
 * any category an officer wants to open up.
 */
export function typesInCategory(
  entries: readonly string[],
  category: SourceCategory,
): { type: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const text = entry.trim();
    if (sourceCategory(text) !== category) continue;
    counts.set(text, (counts.get(text) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}
