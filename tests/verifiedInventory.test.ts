import { describe, expect, it } from "vitest";

import {
  SOURCE_CATEGORIES,
  categorizeEquipment,
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

  it("breaks the machines down by family (Annex summary)", () => {
    const counts = Object.fromEntries(
      SUMMARY.byCategory.map((c) => [c.category, c.count]),
    );
    expect(counts).toEqual({
      "Fixed X-Ray Machines": 52,
      "Dental X-Ray & OPG Systems": 46,
      "Mobile & Portable X-Ray Units": 32,
      "C-Arm Units": 28,
      "CT Scanners": 21,
      "Radioactive Sources": 14,
      "Mammography Systems": 12,
      "Fluoroscopy Units": 4,
      "Other Specialized / Gauge Equipment": 6,
    });
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
    expect(categorizeEquipment("Source: Cs-137")).toBe("Radioactive Sources");
    expect(categorizeEquipment("Source: Co-60")).toBe("Radioactive Sources");
    expect(categorizeEquipment("Industrial Nuclear Gauge")).toBe(
      "Other Specialized / Gauge Equipment",
    );
    expect(categorizeEquipment("XRF-3000")).toBe(
      "Other Specialized / Gauge Equipment",
    );
    expect(categorizeEquipment("X-Ray Baggage Scan")).toBe(
      "Other Specialized / Gauge Equipment",
    );
  });

  it("recognises the imaging families across spelling variants", () => {
    expect(categorizeEquipment("Fixed X-ray")).toBe("Fixed X-Ray Machines");
    expect(categorizeEquipment("Fixed Xray")).toBe("Fixed X-Ray Machines");
    expect(categorizeEquipment("CT-Scanner")).toBe("CT Scanners");
    expect(categorizeEquipment("CT Scanner")).toBe("CT Scanners");
    expect(categorizeEquipment("C-arm (Mini)")).toBe("C-Arm Units");
    expect(categorizeEquipment("Mammograph")).toBe("Mammography Systems");
    expect(categorizeEquipment("Fluoroscopy")).toBe("Fluoroscopy Units");
    expect(categorizeEquipment("OPG")).toBe("Dental X-Ray & OPG Systems");
    expect(categorizeEquipment("Portable Dental X-ray")).toBe(
      "Dental X-Ray & OPG Systems",
    );
    expect(categorizeEquipment("Mobile X-ray")).toBe(
      "Mobile & Portable X-Ray Units",
    );
    expect(categorizeEquipment("Portable X-ray")).toBe(
      "Mobile & Portable X-Ray Units",
    );
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
