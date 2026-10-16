/**
 * The equipment categories the source inventory reports against — one list,
 * shared by both inventory tabs.
 *
 * Two levels, grouped by practice the way the IAEA's safety standards divide
 * the field (October 2026, replacing the flat Seniors' Briefing list of
 * September; corrected 16 Oct 2026): medical — radiotherapy, nuclear medicine,
 * interventional, and diagnostic radiology with dental and veterinary imaging
 * inside it (SSG-46, Safety Reports Series No. 104), and blood irradiators —
 * then non-medical — industrial radiography
 * (SSG-11), irradiation facilities (SSG-8), nuclear gauges (SSG-58), well
 * logging (SSG-57), security and inspection (SSG-55), analytical instruments,
 * research / education / calibration, and consumer-type products (SSG-36).
 * Each group holds the machine or source types beneath it. See
 * `docs/source-inventory-categories-2026.md` for the list, the IAEA check and
 * the mapping.
 *
 * Both registers record equipment as free-form text — RAIS' `Type` column and
 * the field annex's `Equipment Type` — in different vocabularies for the same
 * machines ("Conventional dental Xray generator" against "Dental X-ray"). One
 * classifier reads both, so the two tabs can be compared category by category,
 * and a category exists here whether or not either register has an item in it
 * yet: it is the vocabulary officers file against, not a summary of what
 * happens to be on the books today.
 */

export const SOURCE_SECTORS = ["Medical", "Non-medical", "Not classified"] as const;
export type SourceSector = (typeof SOURCE_SECTORS)[number];

/**
 * The groups, in reporting order, each with the categories it holds. The
 * category names are unique across groups, so a category alone identifies its
 * group (`groupOf`).
 */
export const SOURCE_GROUPS = [
  {
    group: "Radiotherapy",
    sector: "Medical",
    categories: [
      "Linear Accelerators",
      "Teletherapy (Co-60)",
      "Gamma Knife",
      "Kilovoltage X-Ray Therapy",
      "HDR/MDR Brachytherapy",
      "LDR Brachytherapy",
      "RT Simulators & CT Simulators",
    ],
  },
  {
    group: "Nuclear Medicine",
    sector: "Medical",
    categories: [
      "PET-CT",
      "PET-MR",
      "SPECT-CT",
      "SPECT",
      "Cyclotron",
    ],
  },
  {
    group: "Interventional Radiology & Cardiology",
    sector: "Medical",
    categories: [
      "Mobile C-Arm Units",
      "Fixed C-Arm Units",
      "Ceiling-Mounted C-Arm Units",
    ],
  },
  {
    group: "Diagnostic Radiology",
    sector: "Medical",
    categories: [
      "General CT",
      "Fixed X-Ray Fluoroscopy",
      "Fixed Conventional Radiography",
      "Fixed Digital Radiography",
      "Fixed Computed Radiography",
      "Mobile Conventional Radiography",
      "Mobile Digital Radiography",
      "Mobile Computed Radiography",
      "Mammography",
      "Bone Densitometry (DXA)",
      "Intraoral Dental",
      "Panoramic & Cephalometric Dental",
      "Dental CBCT",
      "Handheld Dental X-Ray",
      "Fixed Veterinary X-Ray",
      "Mobile Veterinary X-Ray",
      "Handheld Veterinary X-Ray",
    ],
  },
  {
    group: "Blood Irradiators",
    sector: "Medical",
    categories: ["Gamma Blood Irradiators", "X-Ray Blood Irradiators"],
  },
  {
    group: "Industrial Radiography",
    sector: "Non-medical",
    categories: [
      "Gamma Radiography",
      "Industrial X-Ray Radiography",
      "Pipeline Crawlers",
    ],
  },
  {
    group: "Irradiation Facilities",
    sector: "Non-medical",
    categories: ["Gamma Irradiators", "Electron Beam & X-Ray Irradiators"],
  },
  {
    group: "Nuclear Gauges",
    sector: "Non-medical",
    categories: ["Fixed Gauges", "Portable Gauges"],
  },
  {
    group: "Well Logging",
    sector: "Non-medical",
    categories: ["Well Logging Sources", "Neutron Generators"],
  },
  {
    group: "Security & Inspection",
    sector: "Non-medical",
    categories: ["Cargo & Vehicle Scanners", "Baggage Scanners", "Body Scanners"],
  },
  {
    group: "Analytical Instruments",
    sector: "Non-medical",
    categories: [
      "Portable XRF",
      "Fixed XRF",
      "XRF (Type Not Specified)",
      "XRD",
      "Electron Capture Detectors",
    ],
  },
  {
    group: "Research, Education & Calibration",
    sector: "Non-medical",
    categories: [
      "Research Accelerators",
      "Calibration X-Ray Generators",
      "Calibration & Reference Sources",
      "Teaching Sources",
    ],
  },
  {
    group: "Other / Consumer Products",
    sector: "Non-medical",
    categories: [
      "Static Eliminators",
      "Lightning Preventors",
      "Smoke Detectors",
      "Luminous Devices",
    ],
  },
  {
    group: "Not Classified",
    sector: "Not classified",
    categories: [
      "Sealed Source (Use Not Determined)",
      "Unrecognised Type",
      "Type Not Recorded",
    ],
  },
] as const satisfies readonly {
  group: string;
  sector: SourceSector;
  categories: readonly string[];
}[];

export type SourceGroup = (typeof SOURCE_GROUPS)[number]["group"];
export type SourceCategory =
  (typeof SOURCE_GROUPS)[number]["categories"][number];

/** Every category, in group order. */
export const SOURCE_CATEGORIES: readonly SourceCategory[] = SOURCE_GROUPS.flatMap(
  (g) => g.categories as readonly SourceCategory[],
);

const GROUP_BY_CATEGORY = new Map<SourceCategory, (typeof SOURCE_GROUPS)[number]>(
  SOURCE_GROUPS.flatMap((g) =>
    (g.categories as readonly SourceCategory[]).map((c) => [c, g] as const),
  ),
);

/** The group a category sits in. */
export function groupOf(category: SourceCategory): SourceGroup {
  return GROUP_BY_CATEGORY.get(category)!.group;
}

/** Medical, non-medical, or not classified. */
export function sectorOf(category: SourceCategory): SourceSector {
  return GROUP_BY_CATEGORY.get(category)!.sector;
}

/**
 * A sealed source whose use could not be determined. Neither register records
 * what a source is used for; `sourcePractice` (`sourcePractice.ts`) reads it
 * from the record's maker and model, then from who holds it, and a source
 * neither settles waits here. `sourceCategory` also returns it for the annex's
 * bare "Source: <nuclide>" text, before the holder has been consulted.
 */
export const SEALED_SOURCES: SourceCategory = "Sealed Source (Use Not Determined)";

/** A register row that names no equipment at all. Reported as a gap. */
export const TYPE_NOT_RECORDED: SourceCategory = "Type Not Recorded";

/**
 * Equipment text that names something, but nothing the list recognises — a
 * bare "X-ray Tube", a "Dexter". Listed under its row so an officer can see
 * what is in it, and reported as a gap rather than guessed into a group.
 */
export const UNRECOGNISED_TYPE: SourceCategory = "Unrecognised Type";

/**
 * An XRF analyser whose register entry does not say whether it is portable or
 * fixed. The two are counted apart; where the register only says "XRF" the
 * item waits here rather than being guessed into one of them. It is a
 * worklist, not a machine family.
 */
export const XRF_UNSPECIFIED: SourceCategory = "XRF (Type Not Specified)";

/** The buckets that report a gap in the register rather than a machine family. */
export const GAP_CATEGORIES: readonly SourceCategory[] = [
  XRF_UNSPECIFIED,
  SEALED_SOURCES,
  UNRECOGNISED_TYPE,
  TYPE_NOT_RECORDED,
];

/**
 * Lay per-category counts out under their groups, in reporting order, for the
 * breakdown panels. Groups with nothing in them are kept (with a zero total) so
 * a page can name them; `rows` keeps every category in the group.
 */
export function groupCounts<T extends { count: number }>(
  counts: readonly T[],
  categoryOf: (row: T) => SourceCategory,
): {
  group: SourceGroup;
  sector: SourceSector;
  total: number;
  rows: T[];
}[] {
  return SOURCE_GROUPS.map((g) => {
    const rows = counts.filter((row) =>
      (g.categories as readonly string[]).includes(categoryOf(row)),
    );
    return {
      group: g.group,
      sector: g.sector,
      total: rows.reduce((a, r) => a + r.count, 0),
      rows,
    };
  });
}

/** Plain radiography, by mounting and imaging technology. */
const RADIOGRAPHY: Record<
  "fixed" | "mobile",
  Record<"conventional" | "digital" | "computed", SourceCategory>
> = {
  fixed: {
    conventional: "Fixed Conventional Radiography",
    digital: "Fixed Digital Radiography",
    computed: "Fixed Computed Radiography",
  },
  mobile: {
    conventional: "Mobile Conventional Radiography",
    digital: "Mobile Digital Radiography",
    computed: "Mobile Computed Radiography",
  },
};

const has = (s: string, ...words: string[]) => words.some((w) => s.includes(w));

/**
 * Bucket a free-form equipment type into one of the categories above.
 *
 * Order is the whole of the logic: nearly every entry contains a generic X-ray
 * word, so each specific machine has to claim its rows before the generic test
 * that would also match them. A "Digital Mobile X-ray" is mobile radiography
 * rather than fixed, a "Portable Dental X Ray" is dental rather than mobile
 * radiography, an "Industrial Xray fluoroscopy" is NDT kit rather than a
 * fluoroscopy room, and an "X-Ray Baggage Scan" is a screening scanner rather
 * than a radiography set.
 */
export function sourceCategory(equipmentType: string): SourceCategory {
  const s = equipmentType.toLowerCase().trim();
  if (s === "") return TYPE_NOT_RECORDED;

  // The field annex writes a sealed source as "Source: <nuclide>".
  if (/^sources?\s*:/.test(s)) return SEALED_SOURCES;

  // Veterinary X-ray first: a veterinary set is not a hospital one. (The list
  // has no veterinary nuclear medicine or radiotherapy; that text falls
  // through to the human machines below.)
  if (
    has(s, "veterinary", "vet ", "animal") &&
    !has(s, "nuclear", "radiotherap", "linac", "iodine", "i-131")
  ) {
    if (has(s, "handheld", "hand-held", "hand held")) {
      return "Handheld Veterinary X-Ray";
    }
    if (has(s, "mobile", "portable", "trolley")) return "Mobile Veterinary X-Ray";
    return "Fixed Veterinary X-Ray";
  }

  // Blood irradiators before the irradiators and the gamma words.
  if (s.includes("blood")) {
    return has(s, "x-ray", "xray", "x ray")
      ? "X-Ray Blood Irradiators"
      : "Gamma Blood Irradiators";
  }

  // An accelerator at a mine or a cargo yard is not a radiotherapy machine.
  const linac = has(s, "linear accelerator", "linac", "tomotherap", "cyberknife");
  if (linac && has(s, "industrial", "ndt", "non-destructive")) {
    return "Industrial X-Ray Radiography";
  }
  if (linac && has(s, "cargo", "container", "vehicle")) {
    return "Cargo & Vehicle Scanners";
  }
  if (linac && has(s, "research")) return "Research Accelerators";
  if (linac) return "Linear Accelerators";

  // The rest of radiotherapy. "Deep X-ray treatment" is orthovoltage external
  // beam: kilovoltage therapy, not Co-60 teletherapy.
  if (s.includes("gamma knife") || s.includes("gammaknife")) return "Gamma Knife";
  if (has(s, "brachytherapy", "afterloader", "seed", "eye plaque")) {
    return has(s, "ldr", "seed", "plaque") ? "LDR Brachytherapy" : "HDR/MDR Brachytherapy";
  }
  if (has(s, "teletherapy", "cobalt unit", "co-60 unit", "cobalt-60 unit")) {
    return "Teletherapy (Co-60)";
  }
  if (
    has(
      s,
      "orthovoltage",
      "superficial",
      "deep xray treatment",
      "deep x-ray treatment",
      "deep x-ray therapy",
      "kilovoltage",
    )
  ) {
    return "Kilovoltage X-Ray Therapy";
  }
  if (s.includes("simulator")) return "RT Simulators & CT Simulators";

  // Nuclear medicine — the hybrids before plain CT, which their names contain.
  if (/\bpet\b/.test(s) || has(s, "pet-")) {
    return has(s, "mr") ? "PET-MR" : "PET-CT";
  }
  if (s.includes("spect")) {
    return /\bct\b|spect-ct|spect\/ct/.test(s) ? "SPECT-CT" : "SPECT";
  }
  // A gamma camera is the SPECT system without the CT.
  if (s.includes("gamma camera")) return "SPECT";
  if (s.includes("cyclotron")) return "Cyclotron";

  // Security and inspection, before "scanner" can pull a baggage set to CT.
  if (has(s, "cargo", "vehicle scan", "container scan")) {
    return "Cargo & Vehicle Scanners";
  }
  if (has(s, "baggage", "luggage", "parcel")) return "Baggage Scanners";
  if (has(s, "body scan", "full body", "human imaging")) return "Body Scanners";

  // Analytical instruments, before the industrial and generic X-ray tests.
  // Portable and fixed are read from the entry; neither is inferred from the
  // manufacturer's model name here (see `XRF_FORM_BY_RAN` for that).
  if (s.includes("xrf") || s.includes("fluorescence")) {
    if (has(s, "portable", "handheld", "hand-held", "hand held", "mobile")) {
      return "Portable XRF";
    }
    if (
      has(s, "fixed", "bench", "desktop", "stationary", "on-line", "online", "laboratory")
    ) {
      return "Fixed XRF";
    }
    return XRF_UNSPECIFIED;
  }
  if (s.includes("xrd") || s.includes("diffract")) return "XRD";
  if (s.includes("electron capture") || /\becd\b/.test(s)) {
    return "Electron Capture Detectors";
  }

  // Well logging, before the gauge and neutron-generator tests.
  if (has(s, "logging", "well log")) {
    return s.includes("neutron generator") ? "Neutron Generators" : "Well Logging Sources";
  }

  // Calibration, research and teaching kit, before the generic X-ray test.
  if (s.includes("calibration") || s.includes("reference source") || s.includes("check source")) {
    return has(s, "x-ray", "xray", "x ray", "generator")
      ? "Calibration X-Ray Generators"
      : "Calibration & Reference Sources";
  }
  if (has(s, "teaching", "educational")) return "Teaching Sources";
  if (has(s, "particle radiation", "research accelerator", "van de graaff")) {
    return "Research Accelerators";
  }
  if (s.includes("neutron generator")) return "Neutron Generators";

  // Irradiation facilities.
  if (s.includes("irradiat")) {
    return has(s, "electron", "e-beam", "x-ray", "xray")
      ? "Electron Beam & X-Ray Irradiators"
      : "Gamma Irradiators";
  }

  // Consumer-type products.
  if (has(s, "static eliminator", "antistatic", "anti-static")) return "Static Eliminators";
  if (s.includes("lightning")) return "Lightning Preventors";
  if (s.includes("smoke detector")) return "Smoke Detectors";
  if (s.includes("luminous")) return "Luminous Devices";

  // Nuclear gauges — X-ray thickness gauges included (SSG-58 covers both). A
  // gauge is fixed unless the entry says it is carried: moisture/density
  // gauges on a road site are the portable kind.
  if (has(s, "gauge", "gauging", "densitometer") && !has(s, "bone")) {
    return has(s, "portable", "moisture", "troxler", "handheld")
      ? "Portable Gauges"
      : "Fixed Gauges";
  }

  // Industrial radiography, before the medical fluoroscopy test: an
  // "Industrial Xray fluoroscopy" is a non-destructive-testing set.
  if (s.includes("crawler")) return "Pipeline Crawlers";
  if (has(s, "gamma radiograph", "exposure device", "ir-192", "se-75")) {
    return "Gamma Radiography";
  }
  if (has(s, "industrial", "non-destructive", "ndt")) {
    return "Industrial X-Ray Radiography";
  }

  if (has(s, "bone densit", "dxa", "dexa")) return "Bone Densitometry (DXA)";
  if (s.includes("mammograph")) return "Mammography";

  // Dental, before the fixed / portable words its entries carry. A bare "OPD"
  // or "DPG" is the annex's misspelling of OPG; "Dental X-ray (OPD)" is a
  // dental set in an out-patient department, and is caught by "dental".
  const cbct = s.includes("cbct") || s.includes("cone beam");
  const panoramic =
    has(s, "opg", "orthopantom", "cephalometric", "panoramic") || s === "opd" || s === "dpg";
  if (s.includes("dental") || panoramic) {
    if (cbct) return "Dental CBCT";
    if (panoramic) return "Panoramic & Cephalometric Dental";
    if (has(s, "portable", "handheld", "hand-held", "hand held", "mobile")) {
      return "Handheld Dental X-Ray";
    }
    return "Intraoral Dental";
  }
  if (cbct) return "Dental CBCT";

  // Interventional. Ceiling-mounted only where the entry says so; an
  // angiography suite or cath lab — including the annex's "C-arm (Cath Lab)" —
  // is a fixed C-arm; any other C-arm is the mobile kind used in theatre.
  const cArm = s.includes("c-arm") || s.includes("c arm");
  if ((cArm || has(s, "angiograph", "cathlab", "cath lab")) && s.includes("ceiling")) {
    return "Ceiling-Mounted C-Arm Units";
  }
  if (has(s, "cathlab", "cath lab", "angiograph")) return "Fixed C-Arm Units";
  if (cArm) {
    return has(s, "fixed", "floor") ? "Fixed C-Arm Units" : "Mobile C-Arm Units";
  }

  if (s.includes("fluoro")) return "Fixed X-Ray Fluoroscopy";
  if (/\bct\b/.test(s) || s.includes("ct-") || s === "scanners") return "General CT";

  // The plain radiography sets, mobile or fixed, each by imaging technology:
  // computed (CR plates) and digital (DR panels) where the entry says so, and
  // conventional (film) otherwise — the register's unqualified "Fixed Xray
  // radiography" and "Portable Xray radiography" read as conventional, which
  // is what the September briefing's split took them for too.
  const technology =
    has(s, "computed radiograph") || /\bcr\b/.test(s)
      ? "computed"
      : has(s, "digital") || /\bdr\b/.test(s)
        ? "digital"
        : "conventional";
  if (has(s, "mobile", "portable", "trolley")) return RADIOGRAPHY.mobile[technology];
  if (has(s, "radiograph", "fixed", "x-ray", "xray", "x ray", "conventional", "digital")) {
    if (has(s, "tube")) return UNRECOGNISED_TYPE;
    return RADIOGRAPHY.fixed[technology];
  }

  return UNRECOGNISED_TYPE;
}

/**
 * Count the distinct equipment entries that landed in one category, commonest
 * first. The pages print this beneath the *Unrecognised Type* row so an
 * officer can see what it holds, and it works for any category an officer
 * wants to open up.
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
