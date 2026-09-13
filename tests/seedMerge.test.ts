import { describe, expect, it } from "vitest";
import { mergeSeededFacility } from "../lib/store/seeding";
import type { Authorisation, Facility } from "../lib/rules/types";

/**
 * A register re-import over the officers' work. The cases are the ones the
 * 13 Sep 2026 re-import met on the live project: 28 stages moved in the app,
 * 8 facilities licensed in the app with a dated renewal, 4 dated standalone
 * licences — see docs/licensing-status-2026-import.md.
 */
function facility(over: Partial<Facility>): Facility {
  return {
    id: "fac-0043",
    no: 1,
    name: "Kalene Mission Hospital",
    nameLower: "kalene mission hospital",
    district: "Ikelenge",
    province: "North-Western",
    practice: "Diagnostic X-ray",
    sector: "Public",
    functional: true,
    category: "Medical",
    licensed: false,
    stage: "Waiting for Payment",
    facCode: "FAC/0043",
    auths: [],
    ...over,
  };
}

const renewalQ1: Authorisation = {
  type: "Renewal of Use/Possession Licence",
  number: "",
  date: "",
  quarter: "2026-Q1",
};
const renewalDated: Authorisation = {
  type: "Renewal of Use/Possession Licence",
  number: "AUTH/USE.REN/1138",
  date: "2026-09-07",
  eventId: "ubMi0R6CAqYuk33bz7vA",
};

describe("mergeSeededFacility — a re-import over the officers' work", () => {
  it("replaces a document nobody has touched in the app", () => {
    const seeded = facility({ stage: "No Application Submitted" });
    const live = facility({ stage: "Inspection in Progress" }); // no updatedBy
    expect(mergeSeededFacility(seeded, live)).toEqual({ facility: seeded });
    expect(mergeSeededFacility(seeded, undefined)).toEqual({ facility: seeded });
  });

  it("keeps the officer's stage and RAIS status on an application the workbook still has unlicensed", () => {
    const seeded = facility({ stage: "Authorization Terms Issued" });
    const live = facility({
      stage: "Waiting for Payment",
      currentStatus: "Invoice Issued to Applicant - Awaiting Proof of Payment (POP)",
      updatedBy: "officer-1",
      updatedAt: "2026-09-07T15:18:42.740Z",
    });
    const { facility: f, note } = mergeSeededFacility(seeded, live);
    expect(f.licensed).toBe(false);
    expect(f.stage).toBe("Waiting for Payment");
    expect(f.currentStatus).toBe(
      "Invoice Issued to Applicant - Awaiting Proof of Payment (POP)",
    );
    expect(f.updatedBy).toBe("officer-1");
    expect(note?.stageKept).toBe("Waiting for Payment");
  });

  it("licenses a facility the workbook now shows licensed, whatever stage the officer had it at", () => {
    const seeded = facility({
      licensed: true,
      stage: "Licensed",
      auths: [{ ...renewalQ1, quarter: "2026-Q3" }],
    });
    const live = facility({
      stage: "Board Licence Approval Required",
      currentStatus: "Review Remarks Issued - Applicant to act",
      updatedBy: "officer-1",
    });
    const { facility: f, note } = mergeSeededFacility(seeded, live);
    expect(f.licensed).toBe(true);
    expect(f.stage).toBe("Licensed");
    expect(f.currentStatus).toBeUndefined();
    expect(f.auths).toEqual([{ ...renewalQ1, quarter: "2026-Q3" }]);
    expect(note?.stageKept).toBeUndefined();
  });

  it("lets a licence the officer dated stand for the workbook's undated entry of that type", () => {
    // Kalene: licensed in the app on 7 Sep with its number; the workbook lists
    // one renewal, Q1, no number. Same licence — the dated record stays.
    const seeded = facility({ licensed: true, stage: "Licensed", auths: [renewalQ1] });
    const live = facility({
      licensed: true,
      stage: "Licensed",
      auths: [renewalDated],
      updatedBy: "officer-1",
    });
    const { facility: f, note } = mergeSeededFacility(seeded, live);
    expect(f.auths).toEqual([renewalDated]);
    expect(note?.datedKept).toBe(1);
    expect(note?.datedExtra).toBe(0);
  });

  it("matches a dated licence to the workbook's by number before by type", () => {
    // ZRA Chirundu: two numbered Q1 renewals from the workbook, plus a
    // variation the officer dated. The variation stands for the workbook's
    // Q3 variation; the renewals are untouched.
    const ren1 = { ...renewalQ1, number: "AUTH/USE.REN/0732" };
    const ren2 = { ...renewalQ1, number: "AUTH/USE.REN/0733" };
    const varQ3: Authorisation = {
      type: "Variation of Terms and Conditions",
      number: "",
      date: "",
      quarter: "2026-Q3",
    };
    const varDated: Authorisation = {
      type: "Variation of Terms and Conditions",
      number: "AUTH/VAR/0112",
      date: "2026-09-07",
      eventId: "ZNr64o2yssmwPDbtWan3",
    };
    const seeded = facility({ licensed: true, stage: "Licensed", auths: [ren1, ren2, varQ3] });
    const live = facility({
      licensed: true,
      stage: "Licensed",
      auths: [ren1, ren2, varDated],
      updatedBy: "officer-1",
    });
    const { facility: f, note } = mergeSeededFacility(seeded, live);
    expect(f.auths).toEqual([ren1, ren2, varDated]);
    expect(note?.datedKept).toBe(1);
  });

  it("keeps a dated licence the workbook has no entry for on top", () => {
    // Company Clinic: a transfer recorded in the app; the workbook's transfer
    // sheet does not list the facility.
    const ren = { ...renewalQ1, number: "AUTH/USE.REN/1017", quarter: "2026-Q2" };
    const transfer: Authorisation = {
      type: "Transfer Licence",
      number: "AUTH/TRF/0054",
      date: "2026-09-07",
      eventId: "NNUtvFs7xyABaX561tnu",
    };
    const seeded = facility({ licensed: true, stage: "Licensed", auths: [ren] });
    const live = facility({
      licensed: true,
      stage: "Licensed",
      auths: [ren, transfer],
      updatedBy: "officer-1",
    });
    const { facility: f, note } = mergeSeededFacility(seeded, live);
    expect(f.auths).toEqual([ren, transfer]);
    expect(note?.datedKept).toBe(0);
    expect(note?.datedExtra).toBe(1);
  });

  it("does not let one dated licence stand for two workbook entries", () => {
    const seeded = facility({
      licensed: true,
      stage: "Licensed",
      auths: [renewalQ1, { ...renewalQ1, quarter: "2026-Q2" }],
    });
    const live = facility({
      licensed: true,
      stage: "Licensed",
      auths: [renewalDated],
      updatedBy: "officer-1",
    });
    const { facility: f } = mergeSeededFacility(seeded, live);
    expect(f.auths).toEqual([renewalDated, { ...renewalQ1, quarter: "2026-Q2" }]);
  });

  it("drops an undated licence the app held that the workbook no longer lists", () => {
    // Only a DATED record is the officer's own; an undated, unnumbered entry
    // is a previous seed's, and the workbook is the account of those.
    const seeded = facility({ licensed: true, stage: "Licensed", auths: [renewalQ1] });
    const live = facility({
      licensed: true,
      stage: "Licensed",
      auths: [renewalQ1, { type: "Importation Licence", number: "", date: "", quarter: "2026-Q1" }],
      updatedBy: "officer-1",
    });
    expect(mergeSeededFacility(seeded, live).facility.auths).toEqual([renewalQ1]);
  });

  it("takes the workbook's word when the app has a facility licensed and the workbook does not", () => {
    const seeded = facility({ stage: "Waiting for Payment" });
    const live = facility({
      licensed: true,
      stage: "Licensed",
      auths: [renewalDated],
      updatedBy: "officer-1",
    });
    const { facility: f, note } = mergeSeededFacility(seeded, live);
    expect(f.licensed).toBe(false);
    expect(f.stage).toBe("Licence Expiring (Renewal Due)");
    expect(f.needsReview).toBe(true);
    expect(f.reviewNote).toMatch(/Licensed in the app/);
    // The officer's dated record is still kept — it is their evidence.
    expect(f.auths).toEqual([renewalDated]);
    expect(note?.licenceLost).toBe(true);
  });

  it("leaves the officer's corrections to the record itself alone", () => {
    const seeded = facility({
      district: "",
      practice: "",
      functional: false,
      needsReview: true,
      reviewNote: "No practice recorded — category assumed Medical, confirm",
      statusDetail: "2026 Licensing Status · no current use/possession licence",
    });
    const live = facility({
      district: "Ikelenge",
      practice: "Diagnostic X-ray",
      functional: true,
      category: "Medical",
      updatedBy: "officer-1",
    });
    const { facility: f } = mergeSeededFacility(seeded, live);
    expect(f.district).toBe("Ikelenge");
    expect(f.practice).toBe("Diagnostic X-ray");
    expect(f.functional).toBe(true);
    expect(f.needsReview).toBeUndefined();
    // The import's provenance line is the workbook's to set.
    expect(f.statusDetail).toBe(
      "2026 Licensing Status · no current use/possession licence",
    );
  });
});
