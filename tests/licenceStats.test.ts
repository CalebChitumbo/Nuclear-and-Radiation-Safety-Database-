import { describe, expect, it } from "vitest";

import { computeLicenceStats, licenceYear } from "../lib/rules/licenceStats";
import type { Facility } from "../lib/rules/types";

function fac(p: Partial<Facility> & { id: string }): Facility {
  return {
    no: 0,
    name: p.id,
    nameLower: p.id,
    district: "",
    province: "Lusaka",
    practice: "",
    sector: "Private",
    licensed: false,
    stage: "No Application Submitted",
    facCode: "",
    auths: [],
    ...p,
  } as Facility;
}

describe("licenceYear", () => {
  it("reads the year from an ISO date and tolerates undated/garbage", () => {
    expect(licenceYear("2026-06-03")).toBe(2026);
    expect(licenceYear("")).toBeNull();
    expect(licenceYear("not a date")).toBeNull();
  });
});

describe("computeLicenceStats", () => {
  const facilities = [
    // Licensed this year (2026) — dated renewal.
    fac({
      id: "renewed-2026",
      licensed: true,
      stage: "Licensed",
      auths: [
        { type: "Renewal of Use/Possession Licence", number: "AUTH/USE.REN/1", date: "2026-02-01" },
      ],
    }),
    // Licensed, but the only U/P licence is undated (seed) → unconfirmed for 2026.
    fac({
      id: "seed-licensed",
      licensed: true,
      stage: "Licensed",
      auths: [
        { type: "Renewal of Use/Possession Licence", number: "AUTH/USE.REN/2", date: "" },
        // A standalone authorisation it also holds — counted, but not Use/Possession.
        { type: "Importation Licence", number: "AUTH/IMP/9", date: "2026-03-01" },
      ],
    }),
    // Licensed, but the latest U/P licence is from a prior year → renewal due.
    fac({
      id: "old-licence",
      licensed: true,
      stage: "Licensed",
      auths: [
        { type: "New Use/Possession Licence", number: "AUTH/USE.NEW/3", date: "2024-09-09" },
      ],
    }),
    // Not licensed, mid-pipeline.
    fac({ id: "in-review", licensed: false, stage: "Under Review and Assessment" }),
    // Not licensed, nothing started.
    fac({ id: "none", licensed: false, stage: "No Application Submitted" }),
  ];

  const s = computeLicenceStats(facilities, 2026);

  it("counts total authorisations and splits Use/Possession vs other", () => {
    expect(s.totalIssued).toBe(4); // 3 U/P + 1 import
    expect(s.useTotal).toBe(3);
    expect(s.otherTotal).toBe(1);
  });

  it("breaks authorisations down by type", () => {
    expect(s.issuedByType["Renewal of Use/Possession Licence"]).toBe(2);
    expect(s.issuedByType["New Use/Possession Licence"]).toBe(1);
    expect(s.issuedByType["Importation Licence"]).toBe(1);
    expect(s.issuedByType["Transfer Licence"]).toBe(0);
  });

  it("separates licensed-for-the-year from renewal-due (date-derived)", () => {
    expect(s.licensedTotal).toBe(3);
    expect(s.licensedThisYear).toBe(1); // only the 2026-dated renewal
    expect(s.licensedYearUnconfirmed).toBe(2); // undated + prior-year
  });

  it("reports the renewal pipeline stage of unlicensed facilities", () => {
    expect(s.notLicensed).toBe(2);
    expect(s.notLicensedByStage["Under Review and Assessment"]).toBe(1);
    expect(s.notLicensedByStage["No Application Submitted"]).toBe(1);
  });
});
