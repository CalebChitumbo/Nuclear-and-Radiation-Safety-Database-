import { describe, expect, it } from "vitest";

import {
  EDITABLE_FIELDS,
  diffPatch,
  editId,
  mergeRaisInventory,
  mergeVerifiedInventory,
  sanitizePatch,
  validateEdit,
  type InventoryEdit,
} from "../lib/rules/inventoryEdits";
import { summarizeRaisInventory, type RaisRecord } from "../lib/rules/raisInventory";
import type { VerifiedRecord } from "../lib/rules/verifiedInventory";

/**
 * Corrections are an overlay over the seed, never a rewrite of it. These tests
 * pin the properties that makes that safe: a correction only touches the record
 * it names, a removal is recoverable, an addition survives being corrected, and
 * nothing an officer types can introduce a field the record shape lacks.
 */

const GENERATOR: RaisRecord = {
  no: 1,
  ran: "RG/0376",
  kind: "Radiation Generator",
  type: "Digital radiography DR x-ray",
  manufacturer: "Philips",
  model: "E7239X",
  serialNumber: "",
};

const SOURCE: RaisRecord = {
  no: 2,
  ran: "SS/0452",
  kind: "Sealed Source",
  type: "",
  manufacturer: "Troxler",
  model: "3430",
  serialNumber: "RPA11",
  nuclide: "Co-60",
  activity: "9.99E+02 GBq",
  activityDate: "2025-03-26",
  sealedCategory: "Category 3",
  securityLevel: "",
  isoCompliance: "Yes",
  workingLife: "15 Year",
};

const BASELINE: RaisRecord[] = [GENERATOR, SOURCE];

function edit(over: Partial<InventoryEdit> = {}): InventoryEdit {
  const inventory = over.inventory ?? "rais";
  const key = over.key ?? "RG/0376";
  return {
    id: editId(inventory, key),
    inventory,
    key,
    patch: {},
    updatedBy: "u1",
    updatedByName: "Officer",
    updatedAt: "2026-08-29T09:00:00.000Z",
    ...over,
  };
}

describe("sanitizePatch", () => {
  it("keeps only the fields the inventory allows", () => {
    const patch = sanitizePatch("rais", {
      serialNumber: " 12345 ",
      nuclide: "Cs-137",
      // Neither of these is an officer's to set: `ran` is the key the
      // correction is stored under, and `no` is the register's own numbering.
      ran: "RG/9999",
      no: 7,
      somethingElse: "x",
    });
    expect(patch).toEqual({ serialNumber: "12345", nuclide: "Cs-137" });
  });

  it("trims values and keeps a deliberate blank", () => {
    // Clearing a field is a real correction — "the register says 0139 but the
    // plate is unreadable" — so an empty string is stored, not dropped.
    expect(sanitizePatch("verified", { serialNumber: "  " })).toEqual({
      serialNumber: "",
    });
  });

  it("restricts the verified annex to its four recorded fields", () => {
    expect([...EDITABLE_FIELDS.verified]).toEqual([
      "facility",
      "equipmentType",
      "serialNumber",
      "status",
    ]);
    expect(sanitizePatch("verified", { nuclide: "Cs-137" })).toEqual({});
  });
});

describe("diffPatch", () => {
  it("stores only what actually differs from the register", () => {
    const patch = diffPatch("rais", GENERATOR, {
      manufacturer: "Philips",
      serialNumber: "IN2024",
    });
    // The manufacturer was retyped identically, so it is not a correction and
    // keeps tracking the register through a future re-import.
    expect(patch).toEqual({ serialNumber: "IN2024" });
  });

  it("treats every typed value as content when there is no baseline", () => {
    expect(diffPatch("rais", null, { type: "CT scanner" })).toEqual({
      type: "CT scanner",
    });
  });

  it("records clearing a field that the register had filled in", () => {
    expect(diffPatch("rais", SOURCE, { serialNumber: "" })).toEqual({
      serialNumber: "",
    });
  });
});

describe("validateEdit", () => {
  const empty = new Set<string>();

  it("accepts a plain correction", () => {
    expect(
      validateEdit(
        { inventory: "rais", key: "RG/0376", patch: { serialNumber: "1" } },
        empty,
      ),
    ).toBeNull();
  });

  it("insists an added RAIS record carries a well-formed RAN", () => {
    const bad = validateEdit(
      {
        inventory: "rais",
        key: "1024",
        patch: { kind: "Radiation Generator" },
        added: true,
      },
      empty,
    );
    expect(bad).toMatch(/RG\/0376 or SS\/0639/);
    expect(
      validateEdit(
        {
          inventory: "rais",
          key: "RG/1024",
          patch: { kind: "Radiation Generator" },
          added: true,
        },
        empty,
      ),
    ).toBeNull();
  });

  it("refuses an accession number already in the register", () => {
    expect(
      validateEdit(
        {
          inventory: "rais",
          key: "RG/0376",
          patch: { kind: "Radiation Generator" },
          added: true,
        },
        new Set(["RG/0376"]),
      ),
    ).toMatch(/already in the register/);
  });

  it("does not apply the RAN rules to a correction of an existing record", () => {
    // Only an addition names its own key; correcting a record reuses the key it
    // already has, whatever the seed happened to call it.
    expect(
      validateEdit(
        { inventory: "rais", key: "12", patch: { type: "CT scanner" } },
        new Set(["12"]),
      ),
    ).toBeNull();
  });

  it("requires the fields an added record cannot be read without", () => {
    expect(
      validateEdit(
        { inventory: "rais", key: "RG/1024", patch: {}, added: true },
        empty,
      ),
    ).toMatch(/kind is required/);
    expect(
      validateEdit(
        {
          inventory: "verified",
          key: "216",
          patch: { facility: "Ndola Central" },
          added: true,
        },
        empty,
      ),
    ).toMatch(/equipmentType is required/);
  });

  it("rejects a register value that is neither of the two", () => {
    expect(
      validateEdit(
        { inventory: "rais", key: "RG/0376", patch: { kind: "Reactor" } },
        empty,
      ),
    ).toMatch(/not a radiation generator or a sealed source/);
  });

  it("caps the note so a correction stays a note", () => {
    expect(
      validateEdit(
        {
          inventory: "rais",
          key: "RG/0376",
          patch: {},
          note: "x".repeat(501),
        },
        empty,
      ),
    ).toMatch(/under 500 characters/);
  });
});

describe("mergeRaisInventory", () => {
  it("returns the register untouched when nothing is corrected", () => {
    const merged = mergeRaisInventory(BASELINE, []);
    expect(merged.records).toEqual(BASELINE);
    expect(merged.removed).toEqual([]);
    expect(merged.editedKeys.size).toBe(0);
    expect(merged.addedKeys.size).toBe(0);
  });

  it("applies a correction to the named record and nothing else", () => {
    const merged = mergeRaisInventory(BASELINE, [
      edit({ key: "RG/0376", patch: { serialNumber: "IN20240809023H" } }),
    ]);
    expect(merged.records[0].serialNumber).toBe("IN20240809023H");
    // Every other field of the corrected record, and the whole of the record
    // beside it, come through as the register has them.
    expect(merged.records[0].manufacturer).toBe("Philips");
    expect(merged.records[1]).toEqual(SOURCE);
    expect([...merged.editedKeys]).toEqual(["RG/0376"]);
  });

  it("ignores corrections belonging to the other inventory", () => {
    const merged = mergeRaisInventory(BASELINE, [
      edit({ inventory: "verified", key: "RG/0376", patch: { facility: "X" } }),
    ]);
    expect(merged.records).toEqual(BASELINE);
  });

  it("cannot introduce a field the record shape does not have", () => {
    const merged = mergeRaisInventory(BASELINE, [
      edit({ key: "RG/0376", patch: { ran: "RG/9999", bogus: "x" } }),
    ]);
    // The overlay is filtered by the same whitelist on the way out, so a
    // document written out of band still cannot rename a record.
    expect(merged.records[0].ran).toBe("RG/0376");
    expect("bogus" in merged.records[0]).toBe(false);
  });

  it("takes a removed record out of the register but keeps it", () => {
    const merged = mergeRaisInventory(BASELINE, [
      edit({ key: "SS/0452", removed: true }),
    ]);
    expect(merged.records.map((r) => r.ran)).toEqual(["RG/0376"]);
    expect(merged.removed.map((r) => r.ran)).toEqual(["SS/0452"]);
    // And it is gone from the figures, which read the live register only.
    expect(summarizeRaisInventory(merged.records).sealedSources).toBe(0);
  });

  it("shows a removed record with its corrections still applied", () => {
    const merged = mergeRaisInventory(BASELINE, [
      edit({ key: "SS/0452", patch: { nuclide: "Cs-137" }, removed: true }),
    ]);
    expect(merged.removed[0].nuclide).toBe("Cs-137");
  });

  it("adds a record that has no row in the seed", () => {
    const merged = mergeRaisInventory(BASELINE, [
      edit({
        key: "SS/0900",
        added: true,
        patch: { kind: "Sealed Source", nuclide: "Ir-192", serialNumber: "A1" },
      }),
    ]);
    expect(merged.records).toHaveLength(3);
    const added = merged.records[2];
    expect(added).toMatchObject({
      ran: "SS/0900",
      kind: "Sealed Source",
      nuclide: "Ir-192",
      serialNumber: "A1",
    });
    // Source-only keys exist even when blank, so an added source is shaped like
    // an imported one and the summary can read it without a special case.
    expect(added).toHaveProperty("sealedCategory");
    expect([...merged.addedKeys]).toEqual(["SS/0900"]);
    expect(summarizeRaisInventory(merged.records).sealedSources).toBe(2);
  });

  it("gives an added generator no source-only fields", () => {
    const merged = mergeRaisInventory(BASELINE, [
      edit({
        key: "RG/1024",
        added: true,
        patch: { kind: "Radiation Generator", type: "CT scanner" },
      }),
    ]);
    expect(merged.records[2].nuclide).toBeUndefined();
  });

  it("keeps an addition out of the register once it is removed", () => {
    const merged = mergeRaisInventory(BASELINE, [
      edit({
        key: "RG/1024",
        added: true,
        removed: true,
        patch: { kind: "Radiation Generator" },
      }),
    ]);
    expect(merged.records).toHaveLength(2);
    expect(merged.removed.map((r) => r.ran)).toEqual(["RG/1024"]);
  });

  it("does not double-count an addition whose key later arrives in the seed", () => {
    // A record added by hand and then imported for real in the next RAIS export
    // must become a correction of the imported row, not a second copy of it.
    const merged = mergeRaisInventory(BASELINE, [
      edit({
        key: "RG/0376",
        added: true,
        patch: { kind: "Radiation Generator", serialNumber: "TYPED" },
      }),
    ]);
    expect(merged.records).toHaveLength(2);
    expect(merged.records[0].serialNumber).toBe("TYPED");
  });
});

describe("mergeVerifiedInventory", () => {
  const ROWS: VerifiedRecord[] = [
    {
      no: 1,
      facility: "Sali International Women's Hospital",
      equipmentType: "C-arm",
      serialNumber: "136831HLS",
      status: "In Use",
    },
    {
      no: 2,
      facility: "City Dental Lusaka",
      equipmentType: "Dental X-ray",
      serialNumber: "3001VA4475",
      status: "In Use",
    },
  ];

  it("keys corrections by the annex row number", () => {
    const merged = mergeVerifiedInventory(ROWS, [
      edit({ inventory: "verified", key: "2", patch: { status: "Not In Use" } }),
    ]);
    expect(merged.records[1].status).toBe("Not In Use");
    expect(merged.records[0].status).toBe("In Use");
  });

  it("numbers an added row from the key it was given", () => {
    const merged = mergeVerifiedInventory(ROWS, [
      edit({
        inventory: "verified",
        key: "216",
        added: true,
        patch: { facility: "Ndola Central", equipmentType: "Fixed X-ray" },
      }),
    ]);
    expect(merged.records[2]).toEqual({
      no: 216,
      facility: "Ndola Central",
      equipmentType: "Fixed X-ray",
      serialNumber: "",
      status: "",
    });
  });
});
