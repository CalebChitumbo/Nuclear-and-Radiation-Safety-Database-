import { describe, expect, it } from "vitest";

import {
  enforcementByFacility,
  enforcementSeverity,
  severityCoverage,
  standingLabel,
} from "../lib/rules/enforcementStatus";
import {
  LICENSING_BUCKETS,
  bucketLabel,
  deriveFunctionalDashboard,
  functionalWorkbook,
  isFunctional,
  licensingBucket,
  standingRows,
  unbucketedStages,
} from "../lib/rules/functionalFacilities";
import { ENFORCEMENT_ACTIONS } from "../lib/rules/inspectionDatabase";
import { STAGES, type Facility, type Inspection } from "../lib/rules/types";

function fac(p: Partial<Facility> & { id: string }): Facility {
  return {
    no: 0,
    name: p.id,
    nameLower: p.id.toLowerCase(),
    district: "",
    province: "Lusaka",
    practice: "",
    sector: "Private",
    functional: true,
    category: "Medical",
    licensed: false,
    stage: "No Application Submitted",
    facCode: "",
    auths: [],
    ...p,
  };
}

function insp(p: Partial<Inspection> & { id: string }): Inspection {
  return {
    date: "2026-07-01",
    week: "W27",
    facilityId: null,
    facilityName: "",
    type: "Routine Inspection",
    outcome: "Non-compliant",
    province: "Lusaka",
    sector: "Private",
    notes: "",
    ...p,
  };
}

describe("the licensing buckets", () => {
  it("cover every RAIS stage exactly once", () => {
    expect(unbucketedStages()).toEqual([]);
    const all = LICENSING_BUCKETS.flatMap((b) => [...b.stages]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual([...STAGES].sort());
  });

  it("put a licensed facility under Licensed whatever its stage says", () => {
    expect(licensingBucket({ licensed: true, stage: "Waiting for Payment" })).toBe("licensed");
    expect(licensingBucket({ licensed: false, stage: "Waiting for Payment" })).toBe("awaiting-payment");
    expect(licensingBucket({ licensed: false, stage: "Application Submitted" })).toBe("application-submitted");
    expect(licensingBucket({ licensed: false, stage: "No Application Submitted" })).toBe("no-application");
    expect(bucketLabel("awaiting-payment")).toBe("Awaiting payment");
  });

  it("treat a record with no operating flag as functional", () => {
    expect(isFunctional({ functional: undefined as unknown as boolean })).toBe(true);
    expect(isFunctional({ functional: false })).toBe(false);
  });
});

describe("enforcement standing", () => {
  it("grades all nine actions", () => {
    const cover = severityCoverage();
    expect(cover.restricted).toEqual([
      "Seizure of Device",
      "Suspension of Practice",
      "Suspension of License",
      "Cancellation of License",
    ]);
    expect(cover.notice).toEqual(["Written Warning", "Enforcement Notice"]);
    expect(cover.engagement).toHaveLength(3);
    expect(
      cover.restricted.length + cover.notice.length + cover.engagement.length,
    ).toBe(ENFORCEMENT_ACTIONS.length);
    expect(enforcementSeverity("nonsense")).toBe("engagement");
  });

  it("hangs the latest dated action on the facility, by id or by name", () => {
    const facilities = [fac({ id: "f1", name: "Kabwe Clinic", nameLower: "kabwe clinic" }), fac({ id: "f2" })];
    const map = enforcementByFacility(
      [
        insp({ id: "a", facilityId: "f1", date: "2026-03-01", enforcement: "Written Warning" }),
        insp({ id: "b", facilityId: "f1", date: "2026-06-15", enforcement: "Suspension of Practice" }),
        // Undated register row — never outranks a dated action.
        insp({ id: "c", facilityId: "f1", date: "", enforcement: "Cancellation of License" }),
        // Free-text log against the same facility, matched on the name.
        insp({ id: "d", facilityName: "Kabwe  Clinic", date: "2026-02-01", enforcement: "Engagement at Facility Level" }),
        insp({ id: "e", facilityId: "f2", date: "2026-05-01" }),
        insp({ id: "f", facilityName: "Nobody Knows", date: "2026-05-01", enforcement: "Seizure of Device" }),
      ],
      facilities,
    );
    expect(map.size).toBe(1);
    const f1 = map.get("f1")!;
    expect(f1.action).toBe("Suspension of Practice");
    expect(f1.severity).toBe("restricted");
    expect(f1.date).toBe("2026-06-15");
    expect(f1.inspectionId).toBe("b");
    expect(f1.history.map((h) => h.inspectionId)).toEqual(["b", "a", "d", "c"]);
  });

  it("speaks from an undated row when nothing dated exists, and prefers the firmer of a day", () => {
    const map = enforcementByFacility(
      [
        insp({ id: "u", facilityId: "f1", date: "", enforcement: "Enforcement Notice" }),
        insp({ id: "x", facilityId: "f2", date: "2026-04-04", enforcement: "Engagement at District Level" }),
        insp({ id: "y", facilityId: "f2", date: "2026-04-04", enforcement: "Seizure of Device" }),
      ],
      [fac({ id: "f1" }), fac({ id: "f2" })],
    );
    expect(map.get("f1")).toMatchObject({ action: "Enforcement Notice", date: "", severity: "notice" });
    expect(map.get("f2")).toMatchObject({ action: "Seizure of Device", inspectionId: "y" });
  });

  it("qualifies the stage with the action", () => {
    const f = fac({ id: "f1", stage: "No Application Submitted" });
    expect(standingLabel(f, undefined)).toBe("No Application Submitted");
    expect(
      standingLabel(f, {
        action: "Suspension of Practice",
        severity: "restricted",
        date: "2026-06-15",
        inspectionId: "b",
        history: [],
      }),
    ).toBe("No Application Submitted — Suspension of Practice (2026-06-15)");
    expect(
      standingLabel(fac({ id: "l", licensed: true, stage: "Licensed" }), {
        action: "Written Warning",
        severity: "notice",
        date: "",
        inspectionId: "z",
        history: [],
      }),
    ).toBe("Licensed — Written Warning");
    expect(
      standingLabel(fac({ id: "s", stage: "Waiting for Payment", currentStatus: "Invoice Generated" as never }), undefined),
    ).toBe("Invoice Generated");
  });
});

describe("deriveFunctionalDashboard", () => {
  const facilities: Facility[] = [
    fac({ id: "pub-lic", sector: "Public", licensed: true, stage: "Licensed" }),
    fac({ id: "pub-none", sector: "Public", province: "Copperbelt" }),
    fac({ id: "pub-pay", sector: "Public", stage: "Waiting for Payment" }),
    fac({ id: "pub-closed", sector: "Public", province: "Eastern" }),
    fac({ id: "priv-lic", licensed: true, stage: "Licensed" }),
    fac({ id: "priv-none-b", name: "B Dental", province: "Lusaka" }),
    fac({ id: "priv-none-a", name: "A Dental", province: "Lusaka" }),
    fac({ id: "priv-applied", stage: "Application Submitted" }),
    fac({ id: "priv-draft", stage: "Draft Application" }),
    fac({ id: "priv-warned", stage: "No Application Submitted", province: "Southern" }),
    // Non-functional — outside the view entirely, licensed or not.
    fac({ id: "dead-lic", functional: false, licensed: true, stage: "Licensed" }),
    fac({ id: "dead-none", functional: false, sector: "Public" }),
  ];
  const inspections: Inspection[] = [
    insp({ id: "i1", facilityId: "pub-closed", date: "2026-05-05", enforcement: "Suspension of Practice" }),
    insp({ id: "i2", facilityId: "priv-warned", date: "2026-05-06", enforcement: "Written Warning" }),
    insp({ id: "i3", facilityId: "priv-none-a", date: "2026-05-07", enforcement: "Engagement at Facility Level" }),
    // An action on a licensed facility — shown on its standing, not a pipeline split.
    insp({ id: "i4", facilityId: "priv-lic", date: "2026-05-08", enforcement: "Enforcement Notice" }),
  ];
  const d = deriveFunctionalDashboard(facilities, inspections);

  it("counts functional facilities only, and says how many it left out", () => {
    expect(d.registerTotal).toBe(12);
    expect(d.functional).toBe(10);
    expect(d.nonFunctional).toBe(2);
    expect(d.licensed).toBe(2);
    expect(d.unlicensed).toBe(8);
    expect(d.coverage).toBe(20);
  });

  it("splits public and private, each with Management's stages", () => {
    expect(d.sectors.Public).toMatchObject({ total: 4, licensed: 1, unlicensed: 3 });
    expect(d.sectors.Private).toMatchObject({ total: 6, licensed: 1, unlicensed: 5 });
    const pub = Object.fromEntries(d.sectors.Public.buckets.map((b) => [b.key, b.total]));
    expect(pub).toEqual({
      licensed: 1,
      "no-application": 2,
      "application-submitted": 0,
      "awaiting-payment": 1,
      "under-review": 0,
      "awaiting-approval": 0,
      "renewal-due": 0,
      "import-only": 0,
    });
    const priv = Object.fromEntries(d.sectors.Private.buckets.map((b) => [b.key, b.total]));
    expect(priv).toMatchObject({ licensed: 1, "no-application": 3, "application-submitted": 2 });
    // The bucket says which RAIS stages are inside it.
    expect(
      d.sectors.Private.buckets.find((b) => b.key === "application-submitted")!.stages,
    ).toEqual([
      { stage: "Application Submitted", total: 1 },
      { stage: "Draft Application", total: 1 },
    ]);
    // Buckets always sum to the sector.
    expect(d.sectors.Public.buckets.reduce((n, b) => n + b.total, 0)).toBe(4);
    expect(d.buckets.reduce((n, b) => n + b.total, 0)).toBe(10);
  });

  it("explains 'no application submitted' with the enforcement register", () => {
    expect(d.noApplication).toEqual({
      total: 5,
      restricted: 1,
      notice: 1,
      engagement: 1,
      unexplained: 2,
    });
    expect(d.sectors.Public.noApplication).toEqual({
      total: 2,
      restricted: 1,
      notice: 0,
      engagement: 0,
      unexplained: 1,
    });
    expect(d.sectors.Private.noApplication).toEqual({
      total: 3,
      restricted: 0,
      notice: 1,
      engagement: 1,
      unexplained: 1,
    });
  });

  it("lists the private functional facilities without a licence, province then name", () => {
    expect(d.sectors.Private.rows.map((r) => r.facility.id)).toEqual([
      "priv-none-a",
      "priv-none-b",
      "priv-applied",
      "priv-draft",
      "priv-warned",
    ]);
    const warned = d.sectors.Private.rows.find((r) => r.facility.id === "priv-warned")!;
    expect(warned.standing).toBe("No Application Submitted — Written Warning (2026-05-06)");
    expect(warned.enforcement?.severity).toBe("notice");
    const closed = d.rows.find((r) => r.facility.id === "pub-closed")!;
    expect(closed.standing).toBe("No Application Submitted — Suspension of Practice (2026-05-05)");
    // Public rows come first in the combined list, then private.
    expect(d.rows.map((r) => r.facility.sector)).toEqual([
      "Public",
      "Public",
      "Public",
      "Private",
      "Private",
      "Private",
      "Private",
      "Private",
    ]);
    // A licensed facility never appears in the unlicensed list, action or not.
    expect(d.rows.some((r) => r.facility.id === "priv-lic")).toBe(false);
  });

  it("writes the list and the breakdown as sheets", () => {
    const rows = standingRows(d.sectors.Private.rows);
    expect(rows[0]).toEqual([
      "A Dental",
      "",
      "Private",
      "Medical",
      "Lusaka",
      "",
      "",
      "No application submitted",
      "No Application Submitted",
      "Engagement at Facility Level",
      "2026-05-07",
      "No Application Submitted — Engagement at Facility Level (2026-05-07)",
    ]);
    const sheets = functionalWorkbook(d);
    expect(sheets.map((s) => s.name)).toEqual([
      "Functional breakdown",
      "Private unlicensed",
      "Public unlicensed",
    ]);
    const breakdown = sheets[0].rows;
    expect(breakdown[0]).toEqual(["Stage", "Public", "Private", "Functional total"]);
    expect(breakdown[1]).toEqual(["Licensed", 1, 1, 2]);
    expect(breakdown[2]).toEqual(["No application submitted", 2, 3, 5]);
    expect(breakdown[9]).toEqual(["Total functional", 4, 6, 10]);
    expect(breakdown).toContainEqual(["Restricted (suspended / seized / cancelled)", 1, 0, 1]);
    expect(breakdown).toContainEqual(["Non-functional (excluded)", 2]);
    expect(sheets[1].rows).toHaveLength(6);
    expect(sheets[2].rows).toHaveLength(4);
  });
});
