import { describe, expect, it } from "vitest";

import {
  GAP_CATEGORIES,
  SOURCE_CATEGORIES,
  SOURCE_GROUPS,
  UNRECOGNISED_TYPE,
  XRF_UNSPECIFIED,
  groupCounts,
  groupOf,
  sectorOf,
  sourceCategory,
  typesInCategory,
} from "../lib/rules/sourceCategories";

/**
 * The practice groups and types both inventory tabs report against (October
 * 2026, checked against the IAEA safety standards — see
 * `docs/source-inventory-categories-2026.md`). These tests pin the vocabulary
 * itself — a type must exist even where neither register holds an item in it
 * yet — and the ordering that decides which of the words in a free-form entry
 * wins.
 */
describe("the reported groups and types", () => {
  it("carries the fifteen practice groups, medical first", () => {
    expect(SOURCE_GROUPS.map((g) => [g.group, g.sector])).toEqual([
      ["Radiotherapy", "Medical"],
      ["Nuclear Medicine", "Medical"],
      ["Interventional Radiology & Cardiology", "Medical"],
      ["Diagnostic Radiology", "Medical"],
      ["Dental Radiology", "Medical"],
      ["Veterinary", "Medical"],
      ["Blood Irradiators", "Medical"],
      ["Industrial Radiography", "Non-medical"],
      ["Irradiation Facilities", "Non-medical"],
      ["Nuclear Gauges", "Non-medical"],
      ["Well Logging", "Non-medical"],
      ["Security & Inspection", "Non-medical"],
      ["Analytical Instruments", "Non-medical"],
      ["Research, Education & Calibration", "Non-medical"],
      ["Other / Consumer Products", "Non-medical"],
      ["Not Classified", "Not classified"],
    ]);
  });

  it("carries every type, each in exactly one group", () => {
    expect([...SOURCE_CATEGORIES]).toEqual([
      "Linear Accelerators",
      "Teletherapy (Co-60)",
      "Gamma Knife",
      "Kilovoltage X-Ray Therapy",
      "HDR/MDR Brachytherapy",
      "LDR Brachytherapy",
      "RT Simulators & CT Simulators",
      "PET-CT",
      "PET-MR",
      "SPECT-CT",
      "Gamma Camera / SPECT",
      "Radionuclide Therapy",
      "Radiopharmacy / Hot Lab",
      "Cyclotron",
      "Angiography & Cath Lab",
      "Mobile C-Arm Units",
      "General CT",
      "Fluoroscopy (Fixed R/F Rooms)",
      "Fixed Radiography (CR/DR)",
      "Mobile Radiography",
      "Mammography",
      "Bone Densitometry (DXA)",
      "Intraoral Dental",
      "Panoramic & Cephalometric",
      "Dental CBCT",
      "Handheld Dental X-Ray",
      "Veterinary X-Ray",
      "Handheld Veterinary X-Ray",
      "Veterinary NM & Radiotherapy",
      "Gamma Blood Irradiators",
      "X-Ray Blood Irradiators",
      "Gamma Radiography",
      "Industrial X-Ray Radiography",
      "Pipeline Crawlers",
      "Gamma Irradiators",
      "Electron Beam & X-Ray Irradiators",
      "Fixed Gauges",
      "Portable Gauges",
      "Well Logging Sources",
      "Neutron Generators",
      "Cargo & Vehicle Scanners",
      "Baggage Scanners",
      "Body Scanners",
      "Portable XRF",
      "Fixed XRF",
      "XRF (Type Not Specified)",
      "XRD",
      "Electron Capture Detectors",
      "Research Accelerators",
      "Calibration X-Ray Generators",
      "Calibration & Reference Sources",
      "Teaching Sources",
      "Static Eliminators",
      "Lightning Preventors",
      "Smoke Detectors",
      "Luminous Devices",
      "Sealed Source (Use Not Determined)",
      "Unrecognised Type",
      "Type Not Recorded",
    ]);
    expect(new Set(SOURCE_CATEGORIES).size).toBe(SOURCE_CATEGORIES.length);
    expect(groupOf("Fixed Gauges")).toBe("Nuclear Gauges");
    expect(sectorOf("Cyclotron")).toBe("Medical");
    expect(sectorOf("Baggage Scanners")).toBe("Non-medical");
  });

  it("keeps the four gap buckets out of the machine families", () => {
    expect([...GAP_CATEGORIES]).toEqual([
      "XRF (Type Not Specified)",
      "Sealed Source (Use Not Determined)",
      "Unrecognised Type",
      "Type Not Recorded",
    ]);
  });

  it("totals per-type counts under their groups", () => {
    const groups = groupCounts(
      [
        { c: "Fixed Gauges" as const, count: 3 },
        { c: "Portable Gauges" as const, count: 2 },
        { c: "General CT" as const, count: 1 },
      ],
      (r) => r.c,
    );
    expect(groups.find((g) => g.group === "Nuclear Gauges")?.total).toBe(5);
    expect(groups.find((g) => g.group === "Diagnostic Radiology")?.total).toBe(1);
    expect(groups.find((g) => g.group === "Well Logging")?.total).toBe(0);
  });
});

describe("sourceCategory", () => {
  it("files fixed rooms together, conventional and digital alike", () => {
    expect(sourceCategory("Fixed Xray radiography")).toBe("Fixed Radiography (CR/DR)");
    expect(sourceCategory("Conventional Xray generator")).toBe(
      "Fixed Radiography (CR/DR)",
    );
    expect(sourceCategory("Digital radiography DR x-ray")).toBe(
      "Fixed Radiography (CR/DR)",
    );
    expect(sourceCategory("Fixed Digital X-Ray")).toBe("Fixed Radiography (CR/DR)");
    // Mobile before fixed, and before the digital word.
    expect(sourceCategory("Digital Mobile X-ray")).toBe("Mobile Radiography");
    expect(sourceCategory("Portable Xray radiography")).toBe("Mobile Radiography");
  });

  it("splits dental four ways", () => {
    expect(sourceCategory("Conventional dental Xray generator")).toBe(
      "Intraoral Dental",
    );
    expect(sourceCategory("Fixed Dental Xray")).toBe("Intraoral Dental");
    // An out-patient department's dental set, not a misspelt OPG.
    expect(sourceCategory("Dental X-ray (OPD)")).toBe("Intraoral Dental");
    expect(sourceCategory("Panoramic dental X-ray generator")).toBe(
      "Panoramic & Cephalometric",
    );
    expect(sourceCategory("Cephalometric dental Xray generator")).toBe(
      "Panoramic & Cephalometric",
    );
    expect(sourceCategory("OPG")).toBe("Panoramic & Cephalometric");
    expect(sourceCategory("OPD")).toBe("Panoramic & Cephalometric");
    expect(sourceCategory("Portable Dental X Ray")).toBe("Handheld Dental X-Ray");
    expect(sourceCategory("Dental CBCT")).toBe("Dental CBCT");
    expect(sourceCategory("Cone beam CT")).toBe("Dental CBCT");
  });

  it("splits radiotherapy by machine", () => {
    expect(sourceCategory("Linear accelerator")).toBe("Linear Accelerators");
    expect(sourceCategory("Tomotherapy")).toBe("Linear Accelerators");
    expect(sourceCategory("CyberKnife")).toBe("Linear Accelerators");
    expect(sourceCategory("Co-60 teletherapy unit")).toBe("Teletherapy (Co-60)");
    expect(sourceCategory("Gamma Knife")).toBe("Gamma Knife");
    expect(sourceCategory("Deep Xray treatment")).toBe("Kilovoltage X-Ray Therapy");
    expect(sourceCategory("Superficial X-ray therapy")).toBe(
      "Kilovoltage X-Ray Therapy",
    );
    expect(sourceCategory("Brachytherapy Afterloader")).toBe("HDR/MDR Brachytherapy");
    expect(sourceCategory("LDR brachytherapy seeds")).toBe("LDR Brachytherapy");
    expect(sourceCategory("CT Simulator")).toBe("RT Simulators & CT Simulators");
  });

  it("keeps an industrial accelerator out of radiotherapy", () => {
    expect(sourceCategory("Industrial linac")).toBe("Industrial X-Ray Radiography");
  });

  it("splits nuclear medicine, hybrids before plain CT", () => {
    expect(sourceCategory("PET-CT")).toBe("PET-CT");
    expect(sourceCategory("PET/MR")).toBe("PET-MR");
    expect(sourceCategory("SPECT-CT")).toBe("SPECT-CT");
    expect(sourceCategory("SPECT")).toBe("Gamma Camera / SPECT");
    expect(sourceCategory("Gamma camera")).toBe("Gamma Camera / SPECT");
    expect(sourceCategory("Cyclotron")).toBe("Cyclotron");
    expect(sourceCategory("CT scanner")).toBe("General CT");
    expect(sourceCategory("CT-Scan")).toBe("General CT");
  });

  it("splits interventional from diagnostic fluoroscopy", () => {
    expect(sourceCategory("Angiography generator")).toBe("Angiography & Cath Lab");
    expect(sourceCategory("Cathlab")).toBe("Angiography & Cath Lab");
    // A C-arm in a cath lab is that lab's fixed C-arm.
    expect(sourceCategory("C-arm (Cath Lab)")).toBe("Angiography & Cath Lab");
    expect(sourceCategory("C-arm Xray generator")).toBe("Mobile C-Arm Units");
    expect(sourceCategory("Digital C-arm X-ray")).toBe("Mobile C-Arm Units");
    expect(sourceCategory("Fluoroscopic Xray generator")).toBe(
      "Fluoroscopy (Fixed R/F Rooms)",
    );
    expect(sourceCategory("Digital Mammography")).toBe("Mammography");
    expect(sourceCategory("Bone densitometer")).toBe("Bone Densitometry (DXA)");
  });

  it("files veterinary and blood irradiators apart from hospital kit", () => {
    expect(sourceCategory("Veterinary X-ray")).toBe("Veterinary X-Ray");
    expect(sourceCategory("Handheld veterinary X-ray")).toBe(
      "Handheld Veterinary X-Ray",
    );
    expect(sourceCategory("Cs-137 blood irradiator")).toBe("Gamma Blood Irradiators");
    expect(sourceCategory("X-ray blood irradiator")).toBe("X-Ray Blood Irradiators");
  });

  it("reads the industrial practices", () => {
    expect(sourceCategory("Industrial Xray fluoroscopy")).toBe(
      "Industrial X-Ray Radiography",
    );
    expect(sourceCategory("Ir-192 gamma radiography camera")).toBe(
      "Gamma Radiography",
    );
    expect(sourceCategory("Pipeline crawler")).toBe("Pipeline Crawlers");
    expect(sourceCategory("Gamma irradiator")).toBe("Gamma Irradiators");
    expect(sourceCategory("Electron beam irradiator")).toBe(
      "Electron Beam & X-Ray Irradiators",
    );
    expect(sourceCategory("Xray thickness gauge")).toBe("Fixed Gauges");
    expect(sourceCategory("Industrial Nuclear Gauge")).toBe("Fixed Gauges");
    expect(sourceCategory("Portable moisture density gauge")).toBe(
      "Portable Gauges",
    );
    expect(sourceCategory("Well logging tool")).toBe("Well Logging Sources");
    expect(sourceCategory("Neutron generator")).toBe("Neutron Generators");
  });

  it("splits security screening", () => {
    expect(sourceCategory("Cargo Scanner")).toBe("Cargo & Vehicle Scanners");
    expect(sourceCategory("Baggage Scanner")).toBe("Baggage Scanners");
    expect(sourceCategory("X-Ray Baggage Scan")).toBe("Baggage Scanners");
    expect(sourceCategory("Full body scanner")).toBe("Body Scanners");
  });

  it("splits XRF into portable and fixed", () => {
    expect(sourceCategory("Portable XRF")).toBe("Portable XRF");
    expect(sourceCategory("Handheld XRF analyser")).toBe("Portable XRF");
    expect(sourceCategory("Fixed XRF")).toBe("Fixed XRF");
    expect(sourceCategory("Benchtop XRF")).toBe("Fixed XRF");
    expect(sourceCategory("XRD")).toBe("XRD");
    expect(sourceCategory("Electron capture detector")).toBe(
      "Electron Capture Detectors",
    );
  });

  it("does not guess the form of an XRF the entry does not describe", () => {
    expect(sourceCategory("XRF")).toBe(XRF_UNSPECIFIED);
    expect(sourceCategory("XRF-3000")).toBe(XRF_UNSPECIFIED);
  });

  it("reads research, calibration and consumer-type products", () => {
    expect(sourceCategory("Calibration Xray generator")).toBe(
      "Calibration X-Ray Generators",
    );
    expect(sourceCategory("Calibration source")).toBe(
      "Calibration & Reference Sources",
    );
    expect(sourceCategory("Other type of particle radiation generators")).toBe(
      "Research Accelerators",
    );
    expect(sourceCategory("Static eliminator")).toBe("Static Eliminators");
    expect(sourceCategory("Lightning preventor")).toBe("Lightning Preventors");
    expect(sourceCategory("Smoke detector")).toBe("Smoke Detectors");
  });

  it("cannot tell a sealed source's use from the nuclide alone", () => {
    // The holder settles it — see sourcePractice.
    expect(sourceCategory("Source: Cs-137")).toBe(
      "Sealed Source (Use Not Determined)",
    );
    expect(sourceCategory("Source: Am-241/Be")).toBe(
      "Sealed Source (Use Not Determined)",
    );
  });

  it("reports what it cannot place rather than guessing", () => {
    expect(sourceCategory("X-ray Tube")).toBe(UNRECOGNISED_TYPE);
    expect(sourceCategory("Dexter")).toBe(UNRECOGNISED_TYPE);
    // A portal monitor detects radiation; it is not a source.
    expect(sourceCategory("Radiation Portal Monitor")).toBe(UNRECOGNISED_TYPE);
  });

  it("keeps a blank entry as its own bucket, not as an 'other'", () => {
    expect(sourceCategory("")).toBe("Type Not Recorded");
    expect(sourceCategory("   ")).toBe("Type Not Recorded");
  });
});

describe("typesInCategory", () => {
  it("spells out what a category holds, commonest first", () => {
    expect(
      typesInCategory(
        ["X-ray Tube", "X-ray Tube", "Dexter", "CT scanner"],
        UNRECOGNISED_TYPE,
      ),
    ).toEqual([
      { type: "X-ray Tube", count: 2 },
      { type: "Dexter", count: 1 },
    ]);
  });
});
