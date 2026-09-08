import { describe, expect, it } from "vitest";

import {
  HOLDER_NOT_RECORDED,
  LOCATION_NOT_RECORDED,
  holderFor,
  holderSearchText,
  loadSourceHolders,
  locationLabel,
  summariseHolders,
  type SourceHoldersSeed,
} from "../lib/rules/sourceHolders";
import { loadRaisInventory, type RaisInventorySeed } from "../lib/rules/raisInventory";
import holderSeed from "../seed/rais-source-holders.seed.json";
import registerSeed from "../seed/rais-source-inventory.seed.json";
import facilities from "../seed/facilities.seed.json";

const SEED = holderSeed as SourceHoldersSeed;
const HOLDERS = loadSourceHolders(SEED);
const REGISTER = loadRaisInventory(registerSeed as RaisInventorySeed);

// A small hand-built seed for the shape rules, so a change to the real export
// cannot quietly turn one of these into a tautology.
const fixture: SourceHoldersSeed = {
  meta: {
    title: "t",
    sourceDocument: "d",
    exportedOn: "2026-09-08",
    system: "RAIS",
    department: "NRSD",
    coverage: "c",
    totalHoldings: 4,
    generators: 2,
    sealedSources: 2,
    facilities: 3,
  },
  holders: [
    {
      ran: "RG/0001",
      facility: "Kitwe Teaching Hospital",
      facCode: "FAC/0100",
      department: "Radiology Department",
      status: "In Use",
      statusDate: "2024-10-21",
    },
    {
      ran: "RG/0002",
      facility: "KITWE TEACHING HOSPITAL",
      facCode: "FAC/0100",
      department: "",
      status: "In Storage",
      statusDate: "2024-10-22",
    },
    {
      ran: "SS/0001",
      facility: "Kansanshi Mining Plc",
      facCode: "FAC/0168",
      department: "",
      status: "In Use",
      statusDate: "2024-12-23",
    },
    {
      ran: "SS/0002",
      facility: "RPA Clinic",
      facCode: "FAC/0330",
      department: "",
      status: "Unknown",
      statusDate: "",
    },
  ],
  facilities: [
    {
      facCode: "FAC/0100",
      name: "Kitwe Teaching Hospital",
      district: "Kitwe",
      province: "Copperbelt",
    },
    {
      facCode: "FAC/0168",
      name: "Kansanshi Mining Plc",
      district: "Solwezi",
      province: "North-Western",
    },
  ],
};

const FIXTURE = loadSourceHolders(fixture);
const items = (...rans: string[]) => rans.map((ran) => ({ ran }));

describe("loadSourceHolders", () => {
  it("joins the facility's district and province onto each holding", () => {
    const h = holderFor(FIXTURE, "RG/0001")!;
    expect(h.facility).toBe("Kitwe Teaching Hospital");
    expect(h.district).toBe("Kitwe");
    expect(h.province).toBe("Copperbelt");
    expect(h.onRegister).toBe(true);
  });

  it("keeps a facility the register does not hold, with no location", () => {
    const h = holderFor(FIXTURE, "SS/0002")!;
    expect(h.facility).toBe("RPA Clinic");
    expect(h.onRegister).toBe(false);
    expect(h.district).toBe("");
    expect(locationLabel(h)).toBe(LOCATION_NOT_RECORDED);
  });

  it("has nothing for an item the exports never named", () => {
    expect(holderFor(FIXTURE, "RG/9999")).toBeNull();
    expect(holderSearchText(null)).toBe("");
  });
});

describe("locationLabel", () => {
  const at = (district: string, province: string) =>
    locationLabel({ district, province, onRegister: true });

  it("names the district and the province", () => {
    expect(at("Solwezi", "North-Western")).toBe("Solwezi · North-Western");
  });

  it("says a city once when the district and province share its name", () => {
    expect(at("Lusaka", "Lusaka")).toBe("Lusaka");
  });

  it("falls back to whichever of the two it has", () => {
    expect(at("", "Muchinga")).toBe("Muchinga");
    expect(at("Mongu", "")).toBe("Mongu");
    expect(at("", "")).toBe("");
  });
});

describe("summariseHolders", () => {
  it("counts the items with a holder and the items without", () => {
    const s = summariseHolders(
      items("RG/0001", "RG/0002", "SS/0001", "SS/0002", "RG/9999"),
      FIXTURE,
    );
    expect(s.withHolder).toBe(4);
    expect(s.withoutHolder).toBe(1);
  });

  it("folds two spellings of one facility together on its code", () => {
    const s = summariseHolders(items("RG/0001", "RG/0002"), FIXTURE);
    expect(s.facilities).toBe(1);
    expect(s.byFacility[0]).toMatchObject({
      facCode: "FAC/0100",
      count: 2,
      province: "Copperbelt",
    });
  });

  it("counts by province, commonest first, and leaves the unlocated out", () => {
    const s = summariseHolders(
      items("RG/0001", "RG/0002", "SS/0001", "SS/0002"),
      FIXTURE,
    );
    expect(s.byProvince).toEqual([
      { label: "Copperbelt", count: 2 },
      { label: "North-Western", count: 1 },
    ]);
  });

  it("counts a facility the facilities register does not hold apart", () => {
    const s = summariseHolders(items("RG/0001", "SS/0002"), FIXTURE);
    expect(s.facilitiesOffRegister).toBe(1);
    expect(s.itemsOffRegister).toBe(1);
  });

  it("counts RAIS' own status wording", () => {
    const s = summariseHolders(
      items("RG/0001", "RG/0002", "SS/0001", "SS/0002"),
      FIXTURE,
    );
    expect(s.byStatus).toEqual([
      { label: "In Use", count: 2 },
      { label: "In Storage", count: 1 },
      { label: "Unknown", count: 1 },
    ]);
  });

  it("reads an empty register without inventing a holder", () => {
    const s = summariseHolders([], FIXTURE);
    expect(s).toMatchObject({ withHolder: 0, withoutHolder: 0, facilities: 0 });
    expect(HOLDER_NOT_RECORDED).toBe("Holder not recorded");
  });
});

// ---------------------------------------------------------------------------
// The seed itself — the figures the tab prints, pinned to the RAIS exports of
// 8 Sep 2026. Re-run scripts/convert-source-holders.py and update these.
// ---------------------------------------------------------------------------

describe("the 2026 holdings export", () => {
  it("carries the exports' own row counts", () => {
    expect(SEED.holders.length).toBe(1533);
    expect(SEED.meta.generators).toBe(797);
    expect(SEED.meta.sealedSources).toBe(736);
    expect(SEED.holders.filter((h) => h.ran.startsWith("RG")).length).toBe(797);
    expect(SEED.holders.filter((h) => h.ran.startsWith("SS")).length).toBe(736);
  });

  it("names every item once, and every item is on the register", () => {
    const rans = SEED.holders.map((h) => h.ran);
    expect(new Set(rans).size).toBe(rans.length);
    const known = new Set(REGISTER.map((r) => r.ran));
    expect(rans.filter((r) => !known.has(r))).toEqual([]);
  });

  it("leaves 219 of the register's items with no holder", () => {
    const summary = summariseHolders(REGISTER, HOLDERS);
    expect(REGISTER.length).toBe(1752);
    expect(summary.withHolder).toBe(1533);
    expect(summary.withoutHolder).toBe(219);
  });

  it("holds them across 303 facilities, 7 of them not on the register", () => {
    const summary = summariseHolders(REGISTER, HOLDERS);
    expect(summary.facilities).toBe(303);
    expect(summary.facilitiesOffRegister).toBe(7);
    expect(summary.itemsOffRegister).toBe(13);
  });

  it("puts them in the provinces the facilities register puts them in", () => {
    const summary = summariseHolders(REGISTER, HOLDERS);
    expect(summary.byProvince.slice(0, 3)).toEqual([
      { label: "Lusaka", count: 541 },
      { label: "Copperbelt", count: 516 },
      { label: "North-Western", count: 333 },
    ]);
    // Every located item is in one province, and nothing is double counted.
    const located = summary.byProvince.reduce((n, p) => n + p.count, 0);
    expect(located).toBe(summary.withHolder - summary.itemsOffRegister);
  });

  it("reports RAIS' standing for each item", () => {
    const summary = summariseHolders(REGISTER, HOLDERS);
    expect(summary.byStatus.slice(0, 3)).toEqual([
      { label: "In Use", count: 716 },
      { label: "In Storage", count: 299 },
      { label: "Not Imported", count: 275 },
    ]);
    const counted = summary.byStatus.reduce((n, s) => n + s.count, 0);
    expect(counted).toBe(summary.withHolder);
  });

  it("dates every status the export dated, day-first and as ISO", () => {
    for (const h of SEED.holders) {
      if (h.statusDate) expect(h.statusDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(SEED.holders.filter((h) => !h.statusDate).length).toBe(0);
  });

  it("splits the FAC code off every facility name", () => {
    for (const h of SEED.holders) {
      expect(h.facility).not.toMatch(/\(FAC\//);
      expect(h.facCode).toMatch(/^FAC\/\d+$/);
    }
  });

  /**
   * The location index is a slice of the facilities register carried in this
   * seed so the Source Inventory route need not bundle all 538 facilities. It
   * has to keep agreeing with the register it was taken from — a facility that
   * moves district is exactly what this catches.
   */
  it("carries locations that still agree with the facilities register", () => {
    const register = new Map(
      (facilities as { fac?: string; name?: string; dist?: string; prov?: string }[])
        .filter((f) => f.fac)
        .map((f) => [f.fac as string, f]),
    );
    expect(SEED.facilities.length).toBe(296);
    for (const f of SEED.facilities) {
      const source = register.get(f.facCode);
      expect(source, `${f.facCode} is no longer in the facilities register`).toBeTruthy();
      expect(f.name).toBe(source?.name);
      expect(f.district).toBe(source?.dist);
      expect(f.province).toBe(source?.prov);
    }
  });

  it("indexes only facilities the exports actually name", () => {
    const named = new Set(SEED.holders.map((h) => h.facCode));
    for (const f of SEED.facilities) expect(named.has(f.facCode)).toBe(true);
  });
});
