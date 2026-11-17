import { beforeEach, describe, expect, it } from "vitest";

import {
  activeSealIndex,
  candidatesAtFacility,
  describeRaisItem,
  isSealingAction,
  sealedWithoutRow,
  sealKey,
  sealLabel,
  searchCandidates,
  sortSealedSources,
  summariseSeals,
  validateSealedSource,
  type NewSealedSource,
  type SealedSource,
} from "../lib/rules/sealedSources";
import { loadSourceHolders, type SourceHoldersSeed } from "../lib/rules/sourceHolders";
import type { RaisRecord } from "../lib/rules/raisInventory";
import type { VerifiedRecord } from "../lib/rules/verifiedInventory";
import { mockStore, resetMockStore } from "../lib/store/mockStore";

const draft = (over: Partial<NewSealedSource> = {}): NewSealedSource => ({
  inventory: "rais",
  key: "SS/0639",
  description: "Cs-137 · Sealed source · Troxler 3440",
  serialNumber: "36211",
  facilityId: "f1",
  facilityName: "Copperbelt Roads Ltd",
  action: "Suspension of Practice",
  sealedOn: "2026-11-10",
  notes: "",
  ...over,
});

const rec = (over: Partial<SealedSource> = {}): SealedSource => ({
  id: `s${Math.random()}`,
  ...draft(),
  ...over,
});

const RAIS: RaisRecord[] = [
  {
    no: 1,
    ran: "SS/0639",
    kind: "Sealed Source",
    type: "",
    manufacturer: "Troxler",
    model: "3440",
    serialNumber: "36211",
    nuclide: "Cs-137",
  },
  {
    no: 2,
    ran: "SS/0640",
    kind: "Sealed Source",
    type: "",
    manufacturer: "Troxler",
    model: "3440",
    serialNumber: "36211-B",
    nuclide: "Am-241/Be",
  },
  {
    no: 3,
    ran: "RG/0100",
    kind: "Radiation Generator",
    type: "Dental X-ray",
    manufacturer: "Planmeca",
    model: "",
    serialNumber: "PX1",
  },
];

const HOLDERS = loadSourceHolders({
  meta: {} as SourceHoldersSeed["meta"],
  holders: [
    { ran: "SS/0639", facility: "COPPERBELT ROADS", facCode: "FAC/0100", department: "", status: "In Use", statusDate: "" },
    { ran: "SS/0640", facility: "COPPERBELT ROADS", facCode: "FAC/0100", department: "", status: "In Use", statusDate: "" },
    { ran: "RG/0100", facility: "Smile Dental", facCode: "FAC/0200", department: "", status: "In Use", statusDate: "" },
  ],
  facilities: [],
});

const VERIFIED: VerifiedRecord[] = [
  { no: 7, facility: "Copperbelt Roads Limited", equipmentType: "Source: Cs-137", serialNumber: "36211", status: "In Use" },
  { no: 8, facility: "Lusaka Teaching Hospital", equipmentType: "CT Scanner", serialNumber: "CT9", status: "In Use" },
];

describe("which actions seal an item", () => {
  it("is Sealed (Suspension of Practice) and Seized (Seizure of Device) only", () => {
    expect(isSealingAction("Suspension of Practice")).toBe(true);
    expect(isSealingAction("Seizure of Device")).toBe(true);
    expect(isSealingAction("Written Warning")).toBe(false);
    expect(isSealingAction(undefined)).toBe(false);
    expect(sealLabel("Suspension of Practice")).toBe("Sealed");
    expect(sealLabel("Seizure of Device")).toBe("Seized");
  });
});

describe("validating a record", () => {
  it("accepts an inventoried item, and one on neither inventory that says what it is", () => {
    expect(validateSealedSource(draft())).toBeNull();
    expect(
      validateSealedSource(draft({ inventory: "", key: "", description: "Am-241 gauge" })),
    ).toBeNull();
  });

  it("refuses a missing item, facility, day or an early lift", () => {
    expect(validateSealedSource(draft({ key: "" }))).toMatch(/Pick the item/);
    expect(validateSealedSource(draft({ inventory: "", key: "", description: "" }))).toMatch(
      /Say what the item is/,
    );
    expect(validateSealedSource(draft({ facilityName: " " }))).toMatch(/facility/);
    expect(validateSealedSource(draft({ sealedOn: "" }))).toMatch(/day the seal/);
    expect(
      validateSealedSource(draft({ action: "Written Warning" as NewSealedSource["action"] })),
    ).toMatch(/Sealed or Seized/);
    expect(validateSealedSource(draft({ liftedOn: "2026-11-01" }))).toMatch(/before it was applied/);
    expect(validateSealedSource(draft({ liftedOn: "2026-11-12" }))).toBeNull();
  });
});

describe("what the inventory shows as sealed", () => {
  it("indexes the items still under seal, latest seal winning", () => {
    const index = activeSealIndex([
      rec({ key: "SS/0639", sealedOn: "2026-10-01", liftedOn: "2026-10-05" }),
      rec({ id: "late", key: "SS/0639", sealedOn: "2026-11-10" }),
      rec({ id: "early", key: "SS/0639", sealedOn: "2026-11-01" }),
      rec({ inventory: "verified", key: "7", action: "Seizure of Device" }),
      rec({ inventory: "", key: "", description: "Unregistered gauge" }),
    ]);
    expect(index.get(sealKey("rais", "SS/0639"))?.id).toBe("late");
    expect(index.get(sealKey("verified", "7"))?.action).toBe("Seizure of Device");
    expect(index.size).toBe(2);
  });

  it("drops an item from the index once its seal is lifted", () => {
    expect(activeSealIndex([rec({ liftedOn: "2026-11-12" })]).size).toBe(0);
  });

  it("names the seals a tab has no row for", () => {
    const records = [
      rec({ id: "gone", key: "SS/9999" }),
      rec({ id: "here", key: "SS/0639" }),
      rec({ id: "typed", inventory: "", key: "", description: "Unregistered gauge" }),
      rec({ id: "v-gone", inventory: "verified", key: "999" }),
      rec({ id: "lifted", key: "SS/8888", liftedOn: "2026-11-12" }),
    ];
    expect(sealedWithoutRow(records, "rais", new Set(["SS/0639"])).map((r) => r.id).sort()).toEqual([
      "gone",
      "typed",
    ]);
    expect(sealedWithoutRow(records, "verified", new Set(["7"])).map((r) => r.id)).toEqual(["v-gone"]);
  });

  it("summarises and sorts the register", () => {
    const records = [
      rec({ id: "a", sealedOn: "2026-10-01", liftedOn: "2026-10-20" }),
      rec({ id: "b", sealedOn: "2026-11-01" }),
      rec({ id: "c", sealedOn: "2026-11-05", action: "Seizure of Device", facilityId: "f2" }),
    ];
    expect(summariseSeals(records)).toEqual({ sealed: 1, seized: 1, lifted: 1, facilities: 2 });
    expect(sortSealedSources(records).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("picking the item", () => {
  it("describes a register item on one line", () => {
    expect(describeRaisItem(RAIS[0])).toBe("Cs-137 · Sealed source · Troxler 3440");
    expect(describeRaisItem(RAIS[2])).toBe("Dental X-ray · Planmeca");
  });

  it("offers what the inventories place at the facility, by FAC code and by name", () => {
    const c = candidatesAtFacility(
      { facCode: "FAC/0100", name: "Copperbelt Roads Ltd" },
      RAIS,
      HOLDERS,
      VERIFIED,
    );
    expect(c.map((x) => `${x.inventory}:${x.key}`)).toEqual(["rais:SS/0639", "rais:SS/0640", "verified:7"]);
    // A facility the holdings export files under no code still matches by name.
    const byName = candidatesAtFacility({ name: "Smile Dental" }, RAIS, HOLDERS, VERIFIED);
    expect(byName.map((x) => x.key)).toEqual(["RG/0100"]);
  });

  it("finds any item by RAN, serial or nuclide", () => {
    expect(searchCandidates("ss/0640", RAIS, HOLDERS, VERIFIED).map((c) => c.key)).toEqual(["SS/0640"]);
    expect(searchCandidates("36211", RAIS, HOLDERS, VERIFIED).map((c) => c.key)).toEqual([
      "SS/0639",
      "SS/0640",
      "7",
    ]);
    expect(searchCandidates("x", RAIS, HOLDERS, VERIFIED)).toEqual([]);
  });
});

describe("the store", () => {
  beforeEach(() => resetMockStore());

  it("records a seal, lifts it and puts it back", async () => {
    const created = await mockStore.addSealedSource(draft(), "u1");
    expect((await mockStore.listSealedSources()).map((r) => r.id)).toEqual([created.id]);

    const lifted = await mockStore.updateSealedSource(
      created.id,
      { liftedOn: "2026-11-15", liftNote: "Licence renewed" },
      "u1",
    );
    expect(lifted.liftedOn).toBe("2026-11-15");
    expect(activeSealIndex(await mockStore.listSealedSources()).size).toBe(0);

    const back = await mockStore.updateSealedSource(
      created.id,
      { liftedOn: undefined, liftNote: undefined },
      "u1",
    );
    expect("liftedOn" in back).toBe(false);
    expect(activeSealIndex(await mockStore.listSealedSources()).size).toBe(1);

    await mockStore.deleteSealedSource(created.id);
    expect(await mockStore.listSealedSources()).toEqual([]);
  });

  it("refuses an invalid record", async () => {
    await expect(mockStore.addSealedSource(draft({ key: "" }))).rejects.toThrow(/Pick the item/);
  });
});
