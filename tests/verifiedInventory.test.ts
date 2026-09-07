import { describe, expect, it } from "vitest";

import {
  SOURCE_CATEGORIES,
  categorizeEquipment,
  sealedSourceNuclide,
  isSerialProvided,
  loadVerifiedInventory,
  verifiedInventoryToCsv,
  statusGroup,
  summarizeVerifiedInventory,
  type VerifiedInventorySeed,
} from "../lib/rules/verifiedInventory";
import seed from "../seed/verified-source-inventory-2026.seed.json";

/**
 * The Verified Source Inventory tab is seeded from Annex I of the Activity Report on the
 * Source Inventory Programme. These tests pin the annex's own totals so a bad
 * seed edit is caught, and check that every derived grouping still reconciles
 * to the 215 detail rows.
 */
const INVENTORY = loadVerifiedInventory(seed as VerifiedInventorySeed);
const SUMMARY = summarizeVerifiedInventory(INVENTORY);

describe("Verified Source Inventory seed — Annex I", () => {
  it("loads all 215 recorded items with the four fields populated", () => {
    expect(INVENTORY.length).toBe(215);
    expect((seed as VerifiedInventorySeed).meta.totalItems).toBe(215);
    for (const r of INVENTORY) {
      expect(r.facility).not.toBe("");
      expect(r.equipmentType).not.toBe("");
      expect(r.status).not.toBe("");
      expect(Number.isInteger(r.no)).toBe(true);
    }
  });

  it("numbers the rows 1…215 without a gap or a duplicate", () => {
    expect(INVENTORY.map((r) => r.no)).toEqual(
      Array.from({ length: 215 }, (_, i) => i + 1),
    );
  });

  it("covers 75 distinct facilities", () => {
    expect(SUMMARY.facilities).toBe(75);
  });
});

describe("summary figures reconcile to the detail rows", () => {
  it("every item lands in exactly one category, totalling 215", () => {
    const total = SUMMARY.byCategory.reduce((a, c) => a + c.count, 0);
    expect(total).toBe(215);
    expect(SUMMARY.byCategory.map((c) => c.category)).toEqual([
      ...SOURCE_CATEGORIES,
    ]);
  });

  it("breaks the machines down by the reported categories", () => {
    const counts = Object.fromEntries(
      SUMMARY.byCategory
        .filter((c) => c.count > 0)
        .map((c) => [c.category, c.count]),
    );
    expect(counts).toEqual({
      "Fixed X-Ray Machines": 51,
      "Conventional Fixed Digital Radiography": 1,
      "Mobile & Portable X-Ray": 32,
      "General Dental X-Ray": 46,
      "Mammography Systems": 12,
      "C-Arm Units": 28,
      Fluoroscopy: 4,
      "General CT": 21,
      "Baggage Scanners": 1,
      "XRF (Type Not Specified)": 1,
      "Industrial X-Ray & Gauging": 2,
      "Other Specialised Equipment": 2,
      "Sealed Sources": 14,
    });
  });

  it("splits the sealed sources by the type of source", () => {
    expect(SUMMARY.bySourceType).toEqual([
      { nuclide: "Co-57", count: 5 },
      { nuclide: "Cs-137", count: 4 },
      { nuclide: "Co-60", count: 2 },
      { nuclide: "Ba-133", count: 1 },
      { nuclide: "I-129", count: 1 },
      { nuclide: "I-131", count: 1 },
    ]);
    expect(SUMMARY.bySourceType.reduce((a, s) => a + s.count, 0)).toBe(
      SUMMARY.radioactiveSources,
    );
  });

  it("spells out the equipment under Other Specialised", () => {
    expect(SUMMARY.otherSpecialised).toEqual([
      { type: "Dexter", count: 1 },
      { type: "X-ray Tube", count: 1 },
    ]);
  });

  it("groups the field statuses, totalling 215", () => {
    const total = SUMMARY.byStatus.reduce((a, s) => a + s.count, 0);
    expect(total).toBe(215);
    const counts = Object.fromEntries(
      SUMMARY.byStatus.map((s) => [s.group, s.count]),
    );
    expect(counts).toEqual({
      "In Use": 152,
      "Not In Use": 44,
      Unspecified: 19,
    });
    expect(SUMMARY.inUse).toBe(152);
    expect(SUMMARY.radioactiveSources).toBe(14);
  });

  it("counts the items that carry a real serial number", () => {
    expect(SUMMARY.serialsProvided).toBe(180);
  });
});

describe("categorizeEquipment", () => {
  it("keeps sealed sources and gauges out of the X-ray families", () => {
    expect(categorizeEquipment("Source: Cs-137")).toBe("Sealed Sources");
    expect(categorizeEquipment("Source: Co-60")).toBe("Sealed Sources");
    expect(categorizeEquipment("Industrial Nuclear Gauge")).toBe(
      "Industrial X-Ray & Gauging",
    );
    expect(categorizeEquipment("XRF-3000")).toBe("XRF (Type Not Specified)");
    expect(categorizeEquipment("X-Ray Baggage Scan")).toBe("Baggage Scanners");
  });

  it("recognises the imaging families across spelling variants", () => {
    expect(categorizeEquipment("Fixed X-ray")).toBe("Fixed X-Ray Machines");
    expect(categorizeEquipment("Fixed Xray")).toBe("Fixed X-Ray Machines");
    expect(categorizeEquipment("Fixed Digital X-Ray")).toBe(
      "Conventional Fixed Digital Radiography",
    );
    expect(categorizeEquipment("CT-Scanner")).toBe("General CT");
    expect(categorizeEquipment("CT Scanner")).toBe("General CT");
    expect(categorizeEquipment("C-arm (Mini)")).toBe("C-Arm Units");
    // The annex's one cath-lab entry is a C-arm installed in a cath lab.
    expect(categorizeEquipment("C-arm (Cath Lab)")).toBe("C-Arm Units");
    expect(categorizeEquipment("Mammograph")).toBe("Mammography Systems");
    expect(categorizeEquipment("Fluoroscopy")).toBe("Fluoroscopy");
    expect(categorizeEquipment("OPG")).toBe("General Dental X-Ray");
    expect(categorizeEquipment("Portable Dental X-ray")).toBe(
      "General Dental X-Ray",
    );
    expect(categorizeEquipment("Mobile X-ray")).toBe("Mobile & Portable X-Ray");
    expect(categorizeEquipment("Portable X-ray")).toBe(
      "Mobile & Portable X-Ray",
    );
  });

  it("maps every equipment type in the annex to a declared category", () => {
    for (const r of INVENTORY) {
      expect(SOURCE_CATEGORIES).toContain(categorizeEquipment(r.equipmentType));
    }
  });
});

describe("sealedSourceNuclide", () => {
  it("reads the nuclide out of the annex's source notation", () => {
    expect(sealedSourceNuclide("Source: Cs-137")).toBe("Cs-137");
    expect(sealedSourceNuclide("Source:Am-241/Be")).toBe("Am-241/Be");
  });

  it("returns nothing for a machine", () => {
    expect(sealedSourceNuclide("Fixed X-ray")).toBeNull();
    expect(sealedSourceNuclide("Industrial Nuclear Gauge")).toBeNull();
  });
});

describe("statusGroup", () => {
  it("reads the negatives before the positives they contain", () => {
    expect(statusGroup("In Use")).toBe("In Use");
    expect(statusGroup("Active")).toBe("In Use");
    expect(statusGroup("Not In Use")).toBe("Not In Use");
    expect(statusGroup("Not Yet In Use")).toBe("Not In Use");
    expect(statusGroup("Expired (Inactive)")).toBe("Not In Use");
    expect(statusGroup("Inactive")).toBe("Not In Use");
    expect(statusGroup("Not Provided")).toBe("Unspecified");
    expect(statusGroup("New")).toBe("Unspecified");
  });
});

describe("isSerialProvided", () => {
  it("treats placeholders as no serial", () => {
    expect(isSerialProvided("136831HLS")).toBe(true);
    expect(isSerialProvided("Not Provided")).toBe(false);
    expect(isSerialProvided("")).toBe(false);
    expect(isSerialProvided("N/A")).toBe(false);
  });
});

describe("verifiedInventoryToCsv", () => {
  it("emits a header plus one line per record with the derived columns", () => {
    const csv = verifiedInventoryToCsv(INVENTORY);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "No,Facility,Equipment Type,Category,Serial Number,Status,Status Group",
    );
    expect(lines.length).toBe(216); // header + 215 rows
  });
});
