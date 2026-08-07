import { describe, expect, it } from "vitest";

import { computeLicenceStats } from "../lib/rules/licenceStats";
import { isUseP, LICENCE_TYPES } from "../lib/rules/types";
import {
  applySeedAuthorisations,
  buildSeedRegister,
  mapAllSeed,
  type SeedAuthorisation,
  type SeedFacility,
} from "../lib/store/seeding";
import authorisations from "../seed/authorisations.seed.json";
import facilities from "../seed/facilities.seed.json";

const facilityRows = facilities as SeedFacility[];
const authRows = authorisations as SeedAuthorisation[];

/**
 * §17 — the standalone authorisation register: the importation, transit,
 * transfer, transport and variation licences facilities hold alongside their
 * use/possession licence. Every row must land on exactly one facility.
 */
describe("§17 — seeded authorisation register", () => {
  const register = buildSeedRegister(facilityRows, authRows);

  it("attaches all 82 authorisations, leaving none unmatched", () => {
    expect(authRows.length).toBe(82);
    expect(register.attached).toBe(82);
    expect(register.unmatched).toEqual([]);
  });

  it("records each licence exactly once, against one holder", () => {
    for (const row of authRows) {
      const holders = register.facilities.filter((f) =>
        (f.auths || []).some((a) => a.number === row.num),
      );
      expect(
        holders.length,
        `${row.num} (${row.name}) landed on ${holders.length} facilities`,
      ).toBe(1);
      const hits = (holders[0].auths || []).filter(
        (a) => a.number === row.num,
      );
      expect(hits.length).toBe(1);
      expect(hits[0].type).toBe(row.type);
      expect(hits[0].scope || "").toBe(row.scope);
    }
  });

  it("every row names a known licence type", () => {
    for (const row of authRows) {
      expect(LICENCE_TYPES as readonly string[]).toContain(row.type);
    }
  });

  it("holds 64 import, 9 variation, 6 transfer, 2 transit and 1 transport licence", () => {
    const stats = computeLicenceStats(register.facilities, 2026);
    // The 2026 status list carried no standalone authorisations at all, so
    // every one of these comes from the authorisation register.
    expect(stats.issuedByType["Importation Licence"]).toBe(64);
    expect(stats.issuedByType["Variation of Terms and Conditions"]).toBe(9);
    expect(stats.issuedByType["Transfer Licence"]).toBe(6);
    expect(stats.issuedByType["Transit Licence"]).toBe(2);
    expect(stats.issuedByType["Transport Licence"]).toBe(1);
    expect(stats.otherTotal).toBe(82);
  });

  it("does not license anyone — standalone authorisations only", () => {
    const before = mapAllSeed(facilityRows);
    expect(register.facilities.filter((f) => f.licensed).length).toBe(
      before.filter((f) => f.licensed).length,
    );
    for (let i = 0; i < before.length; i++) {
      expect(register.facilities[i].stage).toBe(before[i].stage);
      expect(register.facilities[i].licensed).toBe(before[i].licensed);
    }
  });

  it("fills the FAC code on 30 facilities the status list left blank", () => {
    expect(register.facCodesFilled).toBe(30);
    // …and never invents a code that another facility already answers to.
    const before = mapAllSeed(facilityRows);
    const taken = new Set(before.map((f) => f.facCode).filter(Boolean));
    register.facilities.forEach((f, i) => {
      if (before[i].facCode || !f.facCode) return;
      expect(taken.has(f.facCode)).toBe(false);
    });
  });

  it("keeps the register the same size — no facility is created by the merge", () => {
    expect(register.facilities.length).toBe(facilityRows.length);
  });

  it("re-applying the same rows changes nothing (idempotent re-seed)", () => {
    const again = applySeedAuthorisations(register.facilities, authRows);
    expect(again.attached).toBe(0);
    expect(again.unmatched).toEqual([]);
    expect(JSON.stringify(again.facilities)).toBe(
      JSON.stringify(register.facilities),
    );
  });

  it("splits a shared FAC code by province instead of licensing every namesake", () => {
    // Three Occupational Health and Safety Institute sites share FAC/0094;
    // RPA/LIC/0550 was issued to the Lusaka one.
    const ohsi = register.facilities.filter((f) => f.facCode === "FAC/0094");
    expect(ohsi.length).toBe(3);
    const holders = ohsi.filter((f) =>
      f.auths.some((a) => a.number === "RPA/LIC/0550"),
    );
    expect(holders.map((f) => f.province)).toEqual(["Lusaka"]);
  });

  it("stacks several authorisations on one facility", () => {
    // Coptic Church Hospital holds an import licence and two variations on top
    // of its use/possession renewal.
    const coptic = register.facilities.find((f) => f.facCode === "FAC/0023");
    expect(coptic?.auths.map((a) => a.number).sort()).toEqual([
      "AUTH/USE.REN/1055",
      "AUTH/VAR/0083",
      "AUTH/VAR/0094",
      "RPA/LIC/0547",
    ]);
    // Innoray's five transfer licences all land on the one dealer.
    const innoray = register.facilities.find((f) => f.facCode === "FAC/0538");
    expect(
      innoray?.auths.filter((a) => a.type === "Transfer Licence").length,
    ).toBe(5);
  });

  it("reports rows it cannot place rather than guessing a holder", () => {
    const stray: SeedAuthorisation = {
      n: 999,
      date: "",
      name: "Facility That Does Not Exist",
      sec: "Private",
      prov: "Lusaka",
      type: "Importation Licence",
      num: "RPA/LIC/9999",
      from: "",
      to: "",
      fac: "FAC/9999",
      scope: "IMPORT ONE (1) X-RAY MACHINE",
    };
    const r = applySeedAuthorisations(mapAllSeed(facilityRows), [stray]);
    expect(r.attached).toBe(0);
    expect(r.unmatched).toEqual([stray]);
  });

  it("carries the validity window when a licence states one", () => {
    const dated: SeedAuthorisation = {
      ...authRows[0],
      date: "2026-05-04",
      from: "2026-05-04",
      to: "2027-05-03",
      num: "RPA/LIC/9998",
    };
    const r = applySeedAuthorisations(mapAllSeed(facilityRows), [dated]);
    const a = r.facilities
      .flatMap((f) => f.auths)
      .find((x) => x.number === "RPA/LIC/9998");
    expect(a).toMatchObject({
      date: "2026-05-04",
      validFrom: "2026-05-04",
      validTo: "2027-05-03",
    });
  });

  it("leaves no standalone authorisation without a scope except the transfers", () => {
    const noScope = authRows.filter((r) => !r.scope);
    expect(noScope.every((r) => r.type === "Transfer Licence")).toBe(true);
    expect(noScope.length).toBe(6);
  });

  it("none of the imported rows is a use/possession licence", () => {
    // Use/possession is what confers licensed status and is recorded through
    // the licensing workflow, not this register.
    for (const row of authRows) {
      expect(isUseP(row.type as never)).toBe(false);
    }
  });
});
