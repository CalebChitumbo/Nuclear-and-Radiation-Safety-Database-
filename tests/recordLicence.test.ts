import { describe, expect, it } from "vitest";
import {
  applyStatusOverride,
  recordLicence,
} from "../lib/rules/recordLicence";
import type {
  Facility,
  LicenceType,
  WeekDef,
} from "../lib/rules/types";

const weeks: WeekDef[] = [
  { label: "W22 — wk of 25 May 2026", start: "2026-05-25", end: "2026-05-29" },
];

const newFac = (overrides: Partial<Facility> = {}): Facility => ({
  id: "fac-1",
  no: 1,
  name: "Acme Hospital",
  nameLower: "acme hospital",
  district: "Lusaka",
  province: "Lusaka",
  practice: "Diagnostic Imaging (X-ray)",
  sector: "Private",
  functional: true,
  category: "Medical",
  licensed: false,
  stage: "No Application Submitted",
  facCode: "FAC/0001",
  auths: [],
  ...overrides,
});

describe("R1 — one AUTH number = one authorisation entry", () => {
  it("each call appends exactly one auth, even with empty number", () => {
    const f = newFac();
    const a = recordLicence({
      facility: f,
      number: "",
      defaultType: "New Use/Possession Licence",
      date: "2026-05-27",
      weeks,
      uid: "u",
      newEventId: "e1",
    });
    expect(a.facilityWrite.auths).toHaveLength(1);
    expect(a.facilityWrite.auths[0].number).toBe("");
  });
});

describe("R2 — only Use/Possession sets licensed", () => {
  const otherTypes: LicenceType[] = [
    "Importation Licence",
    "Export Licence",
    "Transfer Licence",
    "Transport Licence",
    "Transit Licence",
    "Variation of Terms and Conditions",
    "Design and Construction Licence",
    "Decommissioning Licence",
  ];

  for (const t of otherTypes) {
    it(`does not flip licensed for ${t}`, () => {
      const f = newFac({ licensed: false, stage: "No Application Submitted" });
      const r = recordLicence({
        facility: f,
        number: "",
        type: t,
        defaultType: t,
        date: "2026-05-27",
        weeks,
        uid: "u",
        newEventId: "e",
      });
      expect(r.facilityWrite.licensed).toBe(false);
      expect(r.facilityWrite.stage).toBe("No Application Submitted");
      expect(r.effect).toBe("authorisation-only");
    });
  }

  it("Use/Possession on unlicensed → becomes licensed", () => {
    const f = newFac({ licensed: false });
    const r = recordLicence({
      facility: f,
      number: "AUTH/USE.NEW/0101",
      defaultType: "New Use/Possession Licence",
      date: "2026-05-27",
      weeks,
      uid: "u",
      newEventId: "e",
    });
    expect(r.facilityWrite.licensed).toBe(true);
    expect(r.facilityWrite.stage).toBe("Licensed");
    expect(r.effect).toBe("becomes-licensed");
  });

  it("Renewal on already licensed → renewal-logged", () => {
    const f = newFac({ licensed: true, stage: "Licensed" });
    const r = recordLicence({
      facility: f,
      number: "AUTH/USE.REN/0701",
      defaultType: "Renewal of Use/Possession Licence",
      date: "2026-05-27",
      weeks,
      uid: "u",
      newEventId: "e",
    });
    expect(r.effect).toBe("renewal-logged");
    expect(r.facilityWrite.licensed).toBe(true);
  });
});

describe("R5 — new facility creation from non-UseP licences", () => {
  it("Importation → unlicensed at 'Import Licence Only ...'", () => {
    const r = recordLicence({
      facility: null,
      newFacilityDraft: {
        name: "New Importer",
        province: "Lusaka",
        sector: "Private",
        functional: true,
        category: "Medical",
      },
      number: "AUTH/IMP/0099",
      defaultType: "Importation Licence",
      date: "2026-05-27",
      weeks,
      uid: "u",
      newFacilityId: "new-1",
      newEventId: "e",
    });
    expect(r.facilityWrite.licensed).toBe(false);
    expect(r.facilityWrite.stage).toBe(
      "Import Licence Only (Not yet Use/Possession)",
    );
    expect(r.effect).toBe("new-import-only");
  });

  it("Use/Possession → new licensed facility", () => {
    const r = recordLicence({
      facility: null,
      newFacilityDraft: { name: "New Clinic", province: "Lusaka", sector: "Private" },
      number: "AUTH/USE.NEW/0202",
      defaultType: "New Use/Possession Licence",
      date: "2026-05-27",
      weeks,
      uid: "u",
      newFacilityId: "new-2",
      newEventId: "e",
    });
    expect(r.facilityWrite.licensed).toBe(true);
    expect(r.facilityWrite.stage).toBe("Licensed");
    expect(r.effect).toBe("new-licensed");
  });

  it("Other non-UseP → new unlicensed at 'No Application Submitted'", () => {
    const r = recordLicence({
      facility: null,
      newFacilityDraft: { name: "X", province: "Lusaka", sector: "Private" },
      number: "AUTH/VAR/01",
      defaultType: "Variation of Terms and Conditions",
      date: "2026-05-27",
      weeks,
      uid: "u",
      newFacilityId: "new-3",
      newEventId: "e",
    });
    expect(r.facilityWrite.licensed).toBe(false);
    expect(r.facilityWrite.stage).toBe("No Application Submitted");
    expect(r.effect).toBe("new-unlicensed");
  });
});

describe("R6 — manual status toggle does not create events", () => {
  it("applyStatusOverride only changes status fields", () => {
    const f = newFac({ licensed: false, stage: "No Application Submitted" });
    const flipped = applyStatusOverride(
      f,
      { licensed: true, stage: "Licensed" },
      "admin",
    );
    expect(flipped.licensed).toBe(true);
    expect(flipped.stage).toBe("Licensed");
    expect(flipped.auths.length).toBe(0);
  });
});

describe("§6 worked expectation", () => {
  it("two renewals on one already-licensed facility → still one row, two auths", () => {
    const f0 = newFac({ licensed: true, stage: "Licensed" });
    const r1 = recordLicence({
      facility: f0,
      number: "AUTH/USE.REN/0701",
      defaultType: "Renewal of Use/Possession Licence",
      date: "2026-05-27",
      weeks,
      uid: "u",
      newEventId: "e1",
    });
    const r2 = recordLicence({
      facility: r1.facilityWrite,
      number: "AUTH/USE.REN/0702",
      defaultType: "Renewal of Use/Possession Licence",
      date: "2026-05-27",
      weeks,
      uid: "u",
      newEventId: "e2",
    });
    expect(r2.facilityWrite.licensed).toBe(true);
    expect(r2.facilityWrite.auths).toHaveLength(2);
    expect(r2.facilityWrite.auths.map((a) => a.number)).toEqual([
      "AUTH/USE.REN/0701",
      "AUTH/USE.REN/0702",
    ]);
  });

  it("importation on unlicensed facility → still unlicensed, +1 auth", () => {
    const f = newFac({ licensed: false, stage: "No Application Submitted" });
    const r = recordLicence({
      facility: f,
      number: "AUTH/IMP/0050",
      defaultType: "Importation Licence",
      date: "2026-05-27",
      weeks,
      uid: "u",
      newEventId: "e",
    });
    expect(r.facilityWrite.licensed).toBe(false);
    expect(r.facilityWrite.auths).toHaveLength(1);
    expect(r.event.type).toBe("Importation Licence");
    expect(r.event.week).toBe("W22 — wk of 25 May 2026");
  });
});
