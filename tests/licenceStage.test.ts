import { describe, expect, it } from "vitest";

import {
  IMPORT_ONLY_STAGE,
  LICENCE_STAGES,
  countLicenceStages,
  importOnlyBasis,
  licenceStageOf,
  parseLicenceStage,
} from "../lib/rules/licenceStage";
import { facilitiesToCsv } from "../lib/rules/exportCsv";
import { mapAllSeed, type SeedFacility } from "../lib/store/seeding";
import type { Authorisation, Facility, LicenceType, Stage } from "../lib/rules/types";
import facilitiesSeed from "../seed/facilities.seed.json";

const auth = (type: LicenceType): Authorisation => ({ type, number: "", date: "" });
const fac = (
  licensed: boolean,
  stage: Stage,
  auths: LicenceType[] = [],
): Pick<Facility, "licensed" | "stage" | "auths"> => ({
  licensed,
  stage,
  auths: auths.map(auth),
});

describe("licenceStageOf", () => {
  it("puts a licensed facility at Use/Possession, whatever else it holds", () => {
    expect(
      licenceStageOf(fac(true, "Licensed", ["Renewal of Use/Possession Licence", "Importation Licence"])),
    ).toBe("use-possession");
  });

  it("reads import-only off the licences held, not the stage", () => {
    // The usual case in the 2026 seed: an import licence, stage left at
    // wherever the Use/Possession application sits.
    const f = fac(false, "No Application Submitted", ["Importation Licence"]);
    expect(licenceStageOf(f)).toBe("import-only");
    expect(importOnlyBasis(f)).toBe("licence");
    // An application in flight does not take it out of import-only — it has
    // still not reached Use/Possession.
    expect(licenceStageOf(fac(false, "Waiting for Payment", ["Importation Licence"]))).toBe(
      "import-only",
    );
    expect(
      licenceStageOf(fac(false, "No Application Submitted", ["Importation Licence", "Transfer Licence"])),
    ).toBe("import-only");
  });

  it("takes the register's import-only stage when no import licence is recorded", () => {
    const f = fac(false, IMPORT_ONLY_STAGE);
    expect(licenceStageOf(f)).toBe("import-only");
    expect(importOnlyBasis(f)).toBe("register");
  });

  it("does not call a facility import-only once it has held Use/Possession", () => {
    // A lapsed licence: unlicensed, the old Use/Possession licence on record.
    const lapsed = fac(false, "Licence Expiring (Renewal Due)", [
      "Renewal of Use/Possession Licence",
      "Importation Licence",
    ]);
    expect(importOnlyBasis(lapsed)).toBeNull();
    expect(licenceStageOf(lapsed)).toBe("in-application");
    expect(
      licenceStageOf(fac(false, "No Application Submitted", ["New Use/Possession Licence"])),
    ).toBe("no-application");
  });

  it("separates other standalone authorisations, applications and nothing at all", () => {
    expect(licenceStageOf(fac(false, "No Application Submitted", ["Transit Licence"]))).toBe(
      "other-only",
    );
    expect(licenceStageOf(fac(false, "Under Review and Assessment"))).toBe("in-application");
    expect(licenceStageOf(fac(false, "No Application Submitted"))).toBe("no-application");
  });

  it("reads a deep link back, ignoring what it does not know", () => {
    expect(parseLicenceStage("import-only")).toBe("import-only");
    expect(parseLicenceStage("import")).toBe("");
    expect(parseLicenceStage(null)).toBe("");
  });
});

describe("the 2026 register's licence stages", () => {
  const FACILITIES = mapAllSeed(facilitiesSeed as SeedFacility[]);

  it("puts every facility in exactly one stage", () => {
    const counts = countLicenceStages(FACILITIES);
    expect(Object.keys(counts)).toEqual([...LICENCE_STAGES]);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(FACILITIES.length);
  });

  it("finds 52 import-only facilities: 41 by their licence, 11 by the register's stage", () => {
    expect(countLicenceStages(FACILITIES)).toEqual({
      "use-possession": 235,
      "import-only": 52,
      "other-only": 4,
      "in-application": 75,
      "no-application": 172,
    });
    const basis = { licence: 0, register: 0 };
    for (const f of FACILITIES) {
      const b = importOnlyBasis(f);
      if (b) basis[b] += 1;
    }
    expect(basis).toEqual({ licence: 41, register: 11 });
    // The register's licensed count is the Use/Possession stage.
    expect(FACILITIES.filter((f) => f.licensed).length).toBe(235);
  });

  it("is a column of the register export", () => {
    const f = FACILITIES.find((x) => importOnlyBasis(x) === "licence")!;
    const [header, row] = facilitiesToCsv([f]).split("\r\n");
    expect(header).toContain("Stage,Licence Stage,");
    expect(row).toContain(",Import licence only,");
  });
});
