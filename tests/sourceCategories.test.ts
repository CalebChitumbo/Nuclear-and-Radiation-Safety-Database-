import { describe, expect, it } from "vitest";

import {
  GAP_CATEGORIES,
  SOURCE_CATEGORIES,
  XRF_UNSPECIFIED,
  sourceCategory,
  typesInCategory,
} from "../lib/rules/sourceCategories";

/**
 * The categories both inventory tabs report against, as set out by the
 * Seniors' Monday Briefing of September 2026. These tests pin the vocabulary
 * itself — a category the briefing asked for must exist even where neither
 * register holds an item in it yet — and the ordering that decides which of
 * the words in a free-form entry wins.
 */
describe("the reported categories", () => {
  it("carries every split the briefing asked for", () => {
    expect([...SOURCE_CATEGORIES]).toEqual([
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
    ]);
  });

  it("keeps the two gap buckets out of the machine families", () => {
    expect([...GAP_CATEGORIES]).toEqual([
      "XRF (Type Not Specified)",
      "Type Not Recorded",
    ]);
  });
});

describe("sourceCategory", () => {
  it("splits fixed radiography from fixed digital radiography", () => {
    expect(sourceCategory("Fixed Xray radiography")).toBe(
      "Fixed X-Ray Machines",
    );
    expect(sourceCategory("Conventional Xray generator")).toBe(
      "Fixed X-Ray Machines",
    );
    expect(sourceCategory("Digital radiography DR x-ray")).toBe(
      "Conventional Fixed Digital Radiography",
    );
    expect(sourceCategory("Fixed Digital X-Ray")).toBe(
      "Conventional Fixed Digital Radiography",
    );
    // A mobile set is mobile before it is digital.
    expect(sourceCategory("Digital Mobile X-ray")).toBe(
      "Mobile & Portable X-Ray",
    );
  });

  it("splits general dental from dental CBCT", () => {
    expect(sourceCategory("Conventional dental Xray generator")).toBe(
      "General Dental X-Ray",
    );
    expect(sourceCategory("Panoramic dental X-ray generator")).toBe(
      "General Dental X-Ray",
    );
    expect(sourceCategory("Cephalometric dental Xray generator")).toBe(
      "General Dental X-Ray",
    );
    expect(sourceCategory("OPG")).toBe("General Dental X-Ray");
    // Dental beats the portable and fixed words its entries carry.
    expect(sourceCategory("Portable Dental X Ray")).toBe("General Dental X-Ray");
    expect(sourceCategory("Fixed Dental Xray")).toBe("General Dental X-Ray");
    expect(sourceCategory("Dental CBCT")).toBe("Dental CBCT");
    expect(sourceCategory("Cone beam CT")).toBe("Dental CBCT");
  });

  it("splits radiotherapy into brachytherapy and teletherapy, linacs apart", () => {
    expect(sourceCategory("Brachytherapy Afterloader")).toBe("Brachytherapy");
    // Deep X-ray treatment is orthovoltage external beam.
    expect(sourceCategory("Deep Xray treatment")).toBe("Teletherapy");
    expect(sourceCategory("Co-60 teletherapy unit")).toBe("Teletherapy");
    // A linear accelerator stands alone, medical or industrial.
    expect(sourceCategory("Linear accelerator")).toBe("Linear Accelerators");
    expect(sourceCategory("Industrial linac")).toBe("Linear Accelerators");
  });

  it("splits CT into general, PET-CT and SPECT-CT", () => {
    expect(sourceCategory("CT scanner")).toBe("General CT");
    expect(sourceCategory("CT-Scan")).toBe("General CT");
    expect(sourceCategory("PET-CT")).toBe("PET-CT");
    expect(sourceCategory("SPECT-CT")).toBe("SPECT-CT");
  });

  it("splits fluoroscopy from angiography and cath lab", () => {
    expect(sourceCategory("Fluoroscopic Xray generator")).toBe("Fluoroscopy");
    expect(sourceCategory("Digital Fluoroscopy X-ray")).toBe("Fluoroscopy");
    expect(sourceCategory("Angiography generator")).toBe(
      "Angiography & Cath Lab",
    );
    expect(sourceCategory("Cathlab")).toBe("Angiography & Cath Lab");
    // A C-arm is a C-arm wherever it is installed.
    expect(sourceCategory("C-arm (Cath Lab)")).toBe("C-Arm Units");
  });

  it("splits screening into cargo, baggage and portal monitors", () => {
    expect(sourceCategory("Cargo Scanner")).toBe("Cargo Scanners");
    expect(sourceCategory("Baggage Scanner")).toBe("Baggage Scanners");
    expect(sourceCategory("X-Ray Baggage Scan")).toBe("Baggage Scanners");
    expect(sourceCategory("Radiation Portal Monitor")).toBe("Portal Monitors");
  });

  it("splits XRF, and says so when the register does not", () => {
    expect(sourceCategory("Portable XRF")).toBe("Portable XRF");
    expect(sourceCategory("Handheld XRF analyser")).toBe("Portable XRF");
    expect(sourceCategory("Fixed XRF")).toBe("Fixed XRF");
    expect(sourceCategory("Benchtop XRF")).toBe("Fixed XRF");
    // The register's own 64 rows say only "XRF" — neither is guessed from the
    // manufacturer's model name.
    expect(sourceCategory("XRF")).toBe(XRF_UNSPECIFIED);
    expect(sourceCategory("XRF-3000")).toBe(XRF_UNSPECIFIED);
  });

  it("keeps industrial kit out of the medical families", () => {
    expect(sourceCategory("Industrial Xray fluoroscopy")).toBe(
      "Industrial X-Ray & Gauging",
    );
    expect(sourceCategory("Xray thickness gauge")).toBe(
      "Industrial X-Ray & Gauging",
    );
    expect(sourceCategory("Industrial Nuclear Gauge")).toBe(
      "Industrial X-Ray & Gauging",
    );
  });

  it("reads the specific machine before the generic word it contains", () => {
    expect(sourceCategory("Digital Mammography")).toBe("Mammography Systems");
    expect(sourceCategory("Digital C-arm X-ray")).toBe("C-Arm Units");
    expect(sourceCategory("Portable Xray radiography")).toBe(
      "Mobile & Portable X-Ray",
    );
  });

  it("names the specialised kit rather than filing it as radiography", () => {
    expect(sourceCategory("Calibration Xray generator")).toBe(
      "Other Specialised Equipment",
    );
    expect(sourceCategory("Bone densitometer")).toBe(
      "Other Specialised Equipment",
    );
    expect(sourceCategory("Cyclotron")).toBe("Other Specialised Equipment");
    expect(sourceCategory("Other type of particle radiation generators")).toBe(
      "Other Specialised Equipment",
    );
    expect(sourceCategory("X-ray Tube")).toBe("Other Specialised Equipment");
  });

  it("reads the annex's sealed sources by their notation", () => {
    expect(sourceCategory("Source: Cs-137")).toBe("Sealed Sources");
    expect(sourceCategory("Source: Am-241/Be")).toBe("Sealed Sources");
  });

  it("keeps a blank entry as its own bucket, not as an 'other'", () => {
    expect(sourceCategory("")).toBe("Type Not Recorded");
    expect(sourceCategory("   ")).toBe("Type Not Recorded");
  });
});

describe("typesInCategory", () => {
  it("spells out what a catch-all category holds, commonest first", () => {
    expect(
      typesInCategory(
        [
          "Calibration Xray generator",
          "Calibration Xray generator",
          "Cyclotron",
          "CT scanner",
        ],
        "Other Specialised Equipment",
      ),
    ).toEqual([
      { type: "Calibration Xray generator", count: 2 },
      { type: "Cyclotron", count: 1 },
    ]);
  });
});
