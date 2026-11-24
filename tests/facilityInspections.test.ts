import { beforeEach, describe, expect, it } from "vitest";

import { enforcementByFacility } from "../lib/rules/enforcementStatus";
import {
  belongsToFacility,
  facilityInspectionsHref,
  recordsOfFacility,
} from "../lib/rules/facilityInspections";
import { mockStore, resetMockStore } from "../lib/store/mockStore";
import {
  mapAllSeed,
  mapAllSeedInspections,
  type SeedFacility,
  type SeedInspection,
} from "../lib/store/seeding";
import type { WeekDef } from "../lib/rules/types";
import facilitiesSeed from "../seed/facilities.seed.json";
import registerSeed from "../seed/inspections-2026.seed.json";
import weeksSeed from "../seed/weeks-2026.seed.json";

const FACILITIES = mapAllSeed(facilitiesSeed as SeedFacility[]);
const { inspections: REGISTER } = mapAllSeedInspections(
  registerSeed as SeedInspection[],
  FACILITIES,
  weeksSeed as WeekDef[],
);
const byName = (name: string) => FACILITIES.find((f) => f.name === name)!;

describe("a facility's inspection records", () => {
  const f = { id: "fac-1", name: "Chama District Hospital", nameLower: "chama district hospital" };

  it("takes the records linked to it, and unlinked ones under its name", () => {
    expect(belongsToFacility({ facilityId: "fac-1", facilityName: "Anything" }, f)).toBe(true);
    expect(belongsToFacility({ facilityId: null, facilityName: "CHAMA DISTRICT HOSPITAL" }, f)).toBe(true);
    // Linked to another facility: never this one, even under the same name.
    expect(belongsToFacility({ facilityId: "fac-2", facilityName: "Chama District Hospital" }, f)).toBe(
      false,
    );
    expect(belongsToFacility({ facilityId: null, facilityName: "Chama Mission Hospital" }, f)).toBe(false);
  });

  it("finds the 2026 register's unlinked rows the name matches", () => {
    // The register gives Chama a province ours disagrees with, so the import
    // left its row unlinked — the facility's page still has to show it.
    const chama = byName("Chama District Hospital");
    const own = recordsOfFacility(REGISTER, chama);
    expect(own.length).toBeGreaterThan(0);
    expect(own.some((i) => i.facilityId === null)).toBe(true);
  });

  it("counts what the register's enforcement chip counts", () => {
    // enforcementByFacility matches the same way; a facility with an
    // enforcement standing always has inspection records to link to.
    const standing = enforcementByFacility(REGISTER, FACILITIES);
    for (const id of standing.keys()) {
      const facility = FACILITIES.find((x) => x.id === id)!;
      expect(recordsOfFacility(REGISTER, facility).length).toBeGreaterThan(0);
    }
  });

  it("links to the Inspectorate tab opened on the facility", () => {
    expect(facilityInspectionsHref("fac-0592")).toBe(
      "/inspectorate?facility=fac-0592#facility-inspections",
    );
    expect(facilityInspectionsHref("seed-a b")).toBe(
      "/inspectorate?facility=seed-a%20b#facility-inspections",
    );
  });
});

describe("listInspectionsOfFacility (mock store)", () => {
  beforeEach(() => resetMockStore());

  it("reads the same records as the rule, newest first", async () => {
    const all = await mockStore.listInspections();
    const facilities = await mockStore.listFacilities();
    const chama = facilities.find((x) => x.name === "Chama District Hospital")!;
    const listed = await mockStore.listInspectionsOfFacility(chama);
    expect(listed.map((i) => i.id).sort()).toEqual(
      recordsOfFacility(all, chama).map((i) => i.id).sort(),
    );
    expect(listed.length).toBeGreaterThanOrEqual(
      (await mockStore.listInspectionsFor(chama.id)).length,
    );
    const dates = listed.map((i) => i.date || "");
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  it("is empty for a facility nobody has inspected", async () => {
    const facilities = await mockStore.listFacilities();
    const all = await mockStore.listInspections();
    const untouched = facilities.find((x) => recordsOfFacility(all, x).length === 0)!;
    expect(untouched).toBeTruthy();
    expect(await mockStore.listInspectionsOfFacility(untouched)).toEqual([]);
  });
});
