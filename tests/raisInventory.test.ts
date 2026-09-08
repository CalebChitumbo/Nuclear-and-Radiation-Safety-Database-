import { describe, expect, it } from "vitest";

import {
  GENERATOR_FAMILIES,
  NUCLIDE_NOT_RECORDED,
  SEALED_CATEGORY_LABELS,
  UNCATEGORISED,
  generatorFamily,
  generatorFamilyOf,
  isSecuritySignificant,
  isSerialRecorded,
  loadRaisInventory,
  nuclideLabel,
  parseActivity,
  raisInventoryToCsv,
  sealedCategoryLabel,
  summarizeRaisInventory,
  type RaisInventorySeed,
  type RaisRecord,
} from "../lib/rules/raisInventory";
import { XRF_FORM_BY_RAN } from "../lib/rules/xrfDeterminations";
import seed from "../seed/rais-source-inventory.seed.json";

/**
 * The Source Inventory tab is seeded from the two RAIS register exports. These
 * tests pin the export's own totals so a bad seed edit is caught, and check
 * that every derived grouping still reconciles to the 1,752 detail rows.
 */
const INVENTORY = loadRaisInventory(seed as RaisInventorySeed);
const SUMMARY = summarizeRaisInventory(INVENTORY);
const META = (seed as RaisInventorySeed).meta;

/** A minimal sealed source, so a case can set just the field under test. */
function source(fields: Partial<RaisRecord> = {}): RaisRecord {
  return {
    no: 1,
    ran: "SS/0001",
    kind: "Sealed Source",
    type: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    ...fields,
  };
}

describe("RAIS inventory seed", () => {
  it("loads all 1,752 registered items", () => {
    expect(INVENTORY.length).toBe(1752);
    expect(META.totalItems).toBe(1752);
    expect(META.generators).toBe(963);
    expect(META.sealedSources).toBe(789);
  });

  it("numbers the rows 1…1752 without a gap or a duplicate", () => {
    expect(INVENTORY.map((r) => r.no)).toEqual(
      Array.from({ length: 1752 }, (_, i) => i + 1),
    );
  });

  it("gives every item a unique RAN on the prefix for its register", () => {
    expect(new Set(INVENTORY.map((r) => r.ran)).size).toBe(1752);
    for (const r of INVENTORY) {
      const prefix = r.kind === "Radiation Generator" ? "RG" : "SS";
      expect(r.ran).toMatch(new RegExp(`^${prefix}/\\d+$`));
    }
  });

  it("orders generators first, then sources, each in accession order", () => {
    const kinds = INVENTORY.map((r) => r.kind);
    expect(kinds.indexOf("Sealed Source")).toBe(963);
    expect(kinds.lastIndexOf("Radiation Generator")).toBe(962);

    const accession = (ran: string) => Number(ran.split("/")[1]);
    for (const kind of ["Radiation Generator", "Sealed Source"] as const) {
      const numbers = INVENTORY.filter((r) => r.kind === kind).map((r) =>
        accession(r.ran),
      );
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    }
  });

  it("carries the source-only fields on sources and not on generators", () => {
    for (const r of INVENTORY) {
      if (r.kind === "Radiation Generator") {
        expect(r.nuclide).toBeUndefined();
        expect(r.activity).toBeUndefined();
        expect(r.sealedCategory).toBeUndefined();
      } else {
        // The keys are always present on a source, even when RAIS left the
        // value blank — a blank is a recorded gap, not a missing field.
        expect(r).toHaveProperty("nuclide");
        expect(r).toHaveProperty("activity");
        expect(r).toHaveProperty("sealedCategory");
      }
    }
  });
});

describe("summary figures reconcile to the detail rows", () => {
  it("splits the register into 963 generators and 789 sources", () => {
    expect(SUMMARY.total).toBe(1752);
    expect(SUMMARY.generators).toBe(963);
    expect(SUMMARY.sealedSources).toBe(789);
    expect(SUMMARY.generators + SUMMARY.sealedSources).toBe(SUMMARY.total);
  });

  it("puts every generator in exactly one family, totalling 963", () => {
    expect(SUMMARY.byFamily.reduce((a, f) => a + f.count, 0)).toBe(963);
    expect(SUMMARY.byFamily.map((f) => f.family)).toEqual([
      ...GENERATOR_FAMILIES,
    ]);
  });

  it("breaks the generators down by family", () => {
    const counts = Object.fromEntries(
      SUMMARY.byFamily.map((f) => [f.family, f.count]),
    );
    expect(counts).toEqual({
      "Fixed X-Ray Machines": 172,
      "Conventional Fixed Digital Radiography": 108,
      "Mobile & Portable X-Ray": 191,
      "General Dental X-Ray": 53,
      "Dental CBCT": 0,
      "Mammography Systems": 26,
      "C-Arm Units": 52,
      Fluoroscopy: 33,
      "Angiography & Cath Lab": 5,
      "General CT": 50,
      "PET-CT": 2,
      "SPECT-CT": 0,
      Brachytherapy: 2,
      Teletherapy: 2,
      "Linear Accelerators": 6,
      "Cargo Scanners": 10,
      "Baggage Scanners": 36,
      "Portal Monitors": 0,
      "Portable XRF": 18,
      "Fixed XRF": 23,
      "XRF (Type Not Specified)": 23,
      "Industrial X-Ray & Gauging": 29,
      "Other Specialised Equipment": 13,
      "Type Not Recorded": 109,
    });
  });

  it("spells out the equipment under Other Specialised", () => {
    expect(SUMMARY.otherSpecialised).toEqual([
      { type: "Calibration Xray generator", count: 10 },
      { type: "Bone densitometer", count: 1 },
      { type: "Cyclotron", count: 1 },
      { type: "Other type of particle radiation generators", count: 1 },
    ]);
    expect(
      SUMMARY.otherSpecialised.reduce((a, t) => a + t.count, 0),
    ).toBe(
      SUMMARY.byFamily.find((f) => f.family === "Other Specialised Equipment")
        ?.count,
    );
  });

  it("puts every source in exactly one IAEA category, totalling 789", () => {
    expect(SUMMARY.byCategory.reduce((a, c) => a + c.count, 0)).toBe(789);
    expect(SUMMARY.byCategory.map((c) => c.category)).toEqual([
      ...SEALED_CATEGORY_LABELS,
    ]);
    const counts = Object.fromEntries(
      SUMMARY.byCategory.map((c) => [c.category, c.count]),
    );
    expect(counts).toEqual({
      "Category 1": 50,
      "Category 2": 1,
      "Category 3": 99,
      "Category 4": 44,
      "Category 5": 4,
      [UNCATEGORISED]: 591,
    });
  });

  it("counts Categories 1–3 as the security-significant sources", () => {
    expect(SUMMARY.securitySignificant).toBe(150);
    expect(SUMMARY.securitySignificant).toBe(
      INVENTORY.filter(isSecuritySignificant).length,
    );
  });

  it("puts every source under one nuclide, totalling 789", () => {
    expect(SUMMARY.byNuclide.reduce((a, n) => a + n.count, 0)).toBe(789);
    expect(SUMMARY.distinctNuclides).toBe(19);
    // Caesium-137 dominates the register; the gap bucket always sorts last.
    expect(SUMMARY.byNuclide[0]).toEqual({ nuclide: "Cs-137", count: 618 });
    expect(SUMMARY.byNuclide[SUMMARY.byNuclide.length - 1]).toEqual({
      nuclide: NUCLIDE_NOT_RECORDED,
      count: 69,
    });
  });

  it("counts the register's gaps against the right denominator", () => {
    expect(SUMMARY.dataQuality).toEqual({
      missingSerial: 110,
      missingType: 109,
      xrfTypeUnspecified: 23,
      missingNuclide: 69,
      missingActivity: 345,
      uncategorisedSources: 591,
      categoryConflicts: 5,
    });
    // The type gap is the family bucket, and the nuclide and category gaps are
    // their own buckets — the panel and the breakdowns cannot drift apart.
    const family = Object.fromEntries(
      SUMMARY.byFamily.map((f) => [f.family, f.count]),
    );
    expect(SUMMARY.dataQuality.missingType).toBe(family["Type Not Recorded"]);
    expect(SUMMARY.dataQuality.xrfTypeUnspecified).toBe(
      family["XRF (Type Not Specified)"],
    );
    expect(SUMMARY.dataQuality.uncategorisedSources).toBe(
      SUMMARY.byCategory.find((c) => c.category === UNCATEGORISED)?.count,
    );
  });
});

describe("generatorFamily", () => {
  it("claims the treatment and screening machines before the X-ray words", () => {
    expect(generatorFamily("Linear accelerator")).toBe("Linear Accelerators");
    expect(generatorFamily("Brachytherapy Afterloader")).toBe("Brachytherapy");
    expect(generatorFamily("Deep Xray treatment")).toBe("Teletherapy");
    // A cyclotron is neither a linac nor a treatment machine; it is named
    // under Other Specialised rather than counted as radiotherapy.
    expect(generatorFamily("Cyclotron")).toBe("Other Specialised Equipment");
    expect(generatorFamily("Baggage Scanner")).toBe("Baggage Scanners");
    expect(generatorFamily("Cargo Scanner")).toBe("Cargo Scanners");
  });

  it("reads the specific machine before the generic word it contains", () => {
    // "Digital Mammography" would otherwise fall to digital radiography.
    expect(generatorFamily("Digital Mammography")).toBe("Mammography Systems");
    // "Digital Mobile X-ray" is mobile, not digital radiography.
    expect(generatorFamily("Digital Mobile X-ray")).toBe(
      "Mobile & Portable X-Ray",
    );
    // "Portable Dental X Ray" is dental, not portable radiography.
    expect(generatorFamily("Portable Dental X Ray")).toBe("General Dental X-Ray");
    // "Digital C-arm X-ray" is a C-arm.
    expect(generatorFamily("Digital C-arm X-ray")).toBe("C-Arm Units");
    // Industrial fluoroscopy is NDT kit, not a fluoroscopy suite.
    expect(generatorFamily("Industrial Xray fluoroscopy")).toBe(
      "Industrial X-Ray & Gauging",
    );
    expect(generatorFamily("Digital Fluoroscopy X-ray")).toBe("Fluoroscopy");
  });

  it("recognises the imaging families across the export's spellings", () => {
    expect(generatorFamily("Fixed Xray radiography")).toBe(
      "Fixed X-Ray Machines",
    );
    expect(generatorFamily("Conventional Xray generator")).toBe(
      "Fixed X-Ray Machines",
    );
    expect(generatorFamily("Digital radiography DR x-ray")).toBe(
      "Conventional Fixed Digital Radiography",
    );
    expect(generatorFamily("CT scanner")).toBe("General CT");
    expect(generatorFamily("PET-CT")).toBe("PET-CT");
    expect(generatorFamily("Panoramic dental X-ray generator")).toBe(
      "General Dental X-Ray",
    );
    expect(generatorFamily("Cephalometric dental Xray generator")).toBe(
      "General Dental X-Ray",
    );
    expect(generatorFamily("Cathlab")).toBe("Angiography & Cath Lab");
    expect(generatorFamily("Angiography generator")).toBe(
      "Angiography & Cath Lab",
    );
    // The register's XRF rows do not say portable or fixed, so they wait in
    // their own bucket rather than being guessed into one.
    expect(generatorFamily("XRF")).toBe("XRF (Type Not Specified)");
    expect(generatorFamily("Xray thickness gauge")).toBe(
      "Industrial X-Ray & Gauging",
    );
    expect(generatorFamily("Bone densitometer")).toBe(
      "Other Specialised Equipment",
    );
    expect(generatorFamily("Calibration Xray generator")).toBe(
      "Other Specialised Equipment",
    );
  });

  it("keeps a blank type as its own bucket, not as an 'other'", () => {
    expect(generatorFamily("")).toBe("Type Not Recorded");
    expect(generatorFamily("   ")).toBe("Type Not Recorded");
  });

  it("maps every type in the export to a declared family", () => {
    for (const r of INVENTORY) {
      if (r.kind !== "Radiation Generator") continue;
      expect(GENERATOR_FAMILIES).toContain(generatorFamily(r.type));
    }
  });
});

describe("the XRF determinations", () => {
  /** Every RAIS generator whose own type text says no more than "XRF". */
  const xrf = INVENTORY.filter(
    (r) =>
      r.kind === "Radiation Generator" &&
      generatorFamily(r.type) === "XRF (Type Not Specified)",
  );

  it("covers 41 of the register's 64 unqualified XRF analysers", () => {
    expect(xrf.length).toBe(64);
    expect(Object.keys(XRF_FORM_BY_RAN).length).toBe(41);
    expect(SUMMARY.xrfDetermined).toEqual({ portable: 18, fixed: 23 });
  });

  it("determines nothing but an unqualified XRF analyser", () => {
    const byRan = new Map(INVENTORY.map((r) => [r.ran, r]));
    for (const ran of Object.keys(XRF_FORM_BY_RAN)) {
      const record = byRan.get(ran);
      expect(record, `${ran} is not in the register`).toBeDefined();
      expect(generatorFamily((record as RaisRecord).type)).toBe(
        "XRF (Type Not Specified)",
      );
    }
  });

  it("leaves the 23 the register gives nothing to read as a worklist", () => {
    const undetermined = xrf.filter((r) => !XRF_FORM_BY_RAN[r.ran]);
    expect(undetermined.length).toBe(23);
    for (const r of undetermined) {
      expect(generatorFamilyOf(r)).toBe("XRF (Type Not Specified)");
    }
    expect(SUMMARY.dataQuality.xrfTypeUnspecified).toBe(undetermined.length);
  });

  it("fills a gap and never overrides what a record says", () => {
    const determined = {
      no: 1,
      ran: "RG/0128",
      kind: "Radiation Generator" as const,
      type: "XRF",
      manufacturer: "Oxford Instruments",
      model: "X – MET 7000",
      serialNumber: "721493",
    };
    expect(generatorFamilyOf(determined)).toBe("Portable XRF");
    // A correction, or a later export that spells the type out, wins.
    expect(
      generatorFamilyOf({ ...determined, type: "Fixed XRF" }),
    ).toBe("Fixed XRF");
    // A RAN with no determination stays in the worklist.
    expect(generatorFamilyOf({ ...determined, ran: "RG/0177" })).toBe(
      "XRF (Type Not Specified)",
    );
  });

  it("reports the determined family on the CSV, not the bare type", () => {
    const csv = raisInventoryToCsv([
      {
        no: 1,
        ran: "RG/0817",
        kind: "Radiation Generator",
        type: "XRF",
        manufacturer: "Malvern Panalytical",
        model: "ZETIUM",
        serialNumber: "",
      },
    ]);
    expect(csv.split("\r\n")[1]).toContain("Fixed XRF");
  });
});

describe("sealedCategoryLabel", () => {
  it("reads the recorded category, whatever its casing", () => {
    expect(sealedCategoryLabel(source({ sealedCategory: "Category 1" }))).toBe(
      "Category 1",
    );
    expect(sealedCategoryLabel(source({ sealedCategory: "category 3" }))).toBe(
      "Category 3",
    );
  });

  it("falls back to the gap label rather than inventing a category", () => {
    expect(sealedCategoryLabel(source())).toBe(UNCATEGORISED);
    expect(sealedCategoryLabel(source({ sealedCategory: "" }))).toBe(
      UNCATEGORISED,
    );
    expect(sealedCategoryLabel(source({ sealedCategory: "Category 9" }))).toBe(
      UNCATEGORISED,
    );
  });

  it("counts only Categories 1–3 as security significant", () => {
    expect(isSecuritySignificant(source({ sealedCategory: "Category 1" }))).toBe(true);
    expect(isSecuritySignificant(source({ sealedCategory: "Category 3" }))).toBe(true);
    expect(isSecuritySignificant(source({ sealedCategory: "Category 4" }))).toBe(false);
    expect(isSecuritySignificant(source({ sealedCategory: "Category 5" }))).toBe(false);
    expect(isSecuritySignificant(source())).toBe(false);
  });

  it("prefers the officer's entry, keeping RAIS' own where they differ", () => {
    // The importer resolves the override; the record keeps the loser so the
    // conflict can be reported. Five sources in the export disagree.
    const conflicting = INVENTORY.filter((r) => r.categoryCalculated);
    expect(conflicting.length).toBe(5);
    for (const r of conflicting) {
      expect(r.categorySource).toBe("manual");
      expect(r.sealedCategory).not.toBe(r.categoryCalculated);
    }
  });
});

describe("nuclideLabel", () => {
  it("takes the nuclide verbatim — RAIS is the register of record", () => {
    expect(nuclideLabel(source({ nuclide: "Cs-137" }))).toBe("Cs-137");
    expect(nuclideLabel(source({ nuclide: "Am-241, Cs-137" }))).toBe(
      "Am-241, Cs-137",
    );
  });

  it("labels a blank nuclide as a gap", () => {
    expect(nuclideLabel(source())).toBe(NUCLIDE_NOT_RECORDED);
    expect(nuclideLabel(source({ nuclide: "  " }))).toBe(NUCLIDE_NOT_RECORDED);
  });
});

describe("parseActivity", () => {
  it("reads RAIS' scientific notation into a comparable figure", () => {
    expect(parseActivity("9.99E+02 GBq")).toEqual({
      value: 999,
      unit: "GBq",
      becquerels: 999e9,
    });
    expect(parseActivity("1.295E+03 Bq")).toEqual({
      value: 1295,
      unit: "Bq",
      becquerels: 1295,
    });
  });

  it("converts curies at 3.7 × 10^10 Bq", () => {
    expect(parseActivity("1E+00 Ci")?.becquerels).toBe(3.7e10);
    expect(parseActivity("5E+00 mCi")?.becquerels).toBe(1.85e8);
    expect(parseActivity("1E+00 µCi")?.becquerels).toBe(3.7e4);
  });

  it("returns null rather than counting an unreadable value as zero", () => {
    expect(parseActivity("")).toBeNull();
    expect(parseActivity(undefined)).toBeNull();
    expect(parseActivity("GBq")).toBeNull();
    expect(parseActivity("9.99E+02 furlongs")).toBeNull();
  });

  it("reads every activity the export records", () => {
    const withActivity = INVENTORY.filter((r) => (r.activity || "").trim());
    expect(withActivity.length).toBe(444);
    for (const r of withActivity) {
      expect(parseActivity(r.activity)).not.toBeNull();
    }
  });
});

describe("isSerialRecorded", () => {
  it("treats a blank or a field note as no serial", () => {
    expect(isSerialRecorded("IN20240809023H")).toBe(true);
    expect(isSerialRecorded("")).toBe(false);
    expect(isSerialRecorded("   ")).toBe(false);
    expect(isSerialRecorded("not visible")).toBe(false);
    expect(isSerialRecorded("Not Provided")).toBe(false);
  });
});

describe("raisInventoryToCsv", () => {
  it("emits a header plus one line per record with the derived columns", () => {
    const csv = raisInventoryToCsv(INVENTORY);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "No,RAN,Kind,Type,Family,Manufacturer,Model,Serial Number,Nuclide," +
        "Activity,Activity Date,IAEA Category,Category Source," +
        "RAIS Calculated Category,Security Level,ISO 2919,Working Life," +
        "Held By,Facility Code,Department,District,Province," +
        "Holding Status,Status Date",
    );
    expect(lines.length).toBe(1753); // header + 1,752 rows
  });

  it("fills the family column for generators and the nuclide for sources", () => {
    const csv = raisInventoryToCsv([
      source({ no: 1, ran: "SS/0001", nuclide: "Cs-137", sealedCategory: "Category 3" }),
      {
        no: 2,
        ran: "RG/0001",
        kind: "Radiation Generator",
        type: "CT scanner",
        manufacturer: "Siemens",
        model: "",
        serialNumber: "123",
      },
    ]);
    const [, sourceLine, generatorLine] = csv.split("\r\n");
    expect(sourceLine).toContain("Cs-137");
    expect(sourceLine).toContain("Category 3");
    expect(generatorLine).toContain("General CT");
    // A generator has no nuclide or category to report.
    expect(generatorLine.split(",").filter((v) => v === "Cs-137")).toEqual([]);
  });
});

describe("loadRaisInventory", () => {
  it("drops a row without a RAN — it cannot be looked up in RAIS", () => {
    const loaded = loadRaisInventory({
      meta: META,
      items: [source({ no: 1, ran: "SS/0001" }), source({ no: 2, ran: "  " })],
    });
    expect(loaded.map((r) => r.ran)).toEqual(["SS/0001"]);
  });

  it("trims the fields it displays", () => {
    const [loaded] = loadRaisInventory({
      meta: META,
      items: [
        source({
          ran: " SS/0001 ",
          manufacturer: " Troxler ",
          model: " 3430 ",
          serialNumber: " 0139 ",
        }),
      ],
    });
    expect(loaded).toMatchObject({
      ran: "SS/0001",
      manufacturer: "Troxler",
      model: "3430",
      serialNumber: "0139",
    });
  });
});
