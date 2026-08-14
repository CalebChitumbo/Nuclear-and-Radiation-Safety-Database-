import { describe, expect, it } from "vitest";
import {
  buildInspectionDatabase,
  cardExpiry,
  cardStatus,
  cardsDue,
  databaseCsvRows,
  roundLabel,
  summariseInspectionDatabase,
  summaryCsvRows,
  DATABASE_CSV_HEADER,
  ENFORCEMENT_COLUMNS,
  INSPECTION_COLUMNS,
} from "../lib/rules/inspectionDatabase";
import { toCsv } from "../lib/rules/exportCsv";
import type { Facility, Inspection } from "../lib/rules/types";

const TODAY = "2026-08-14";

const insp = (over: Partial<Inspection> = {}): Inspection => ({
  id: `i${Math.random()}`,
  date: "2026-07-15",
  week: "W29 — wk of 13 Jul 2026",
  facilityId: "f1",
  facilityName: "Braceline Centre",
  type: "Routine Inspection",
  outcome: "Compliant",
  province: "Lusaka",
  sector: "Private",
  notes: "",
  ...over,
});

const fac = (over: Partial<Facility> = {}): Facility => ({
  id: "f1",
  no: 1,
  name: "Braceline Centre",
  nameLower: "braceline centre",
  district: "Lusaka",
  province: "Lusaka",
  practice: "Diagnostic Imaging (X-ray)",
  sector: "Private",
  functional: true,
  category: "Medical",
  licensed: true,
  stage: "Licensed",
  facCode: "FAC/0001",
  auths: [],
  ...over,
});

describe("inspection cards", () => {
  it("expires 30 days after issue, as the workbook's formula does", () => {
    expect(cardExpiry("2026-07-15")).toBe("2026-08-14");
    expect(cardExpiry("2026-06-24")).toBe("2026-07-24");
    expect(cardExpiry("")).toBe("");
    expect(cardExpiry(undefined)).toBe("");
  });

  it("reads Active / Expiring Soon / Expired off the expiry date", () => {
    // Issued today: expires in 30 days, so it is comfortably active.
    expect(cardStatus("2026-08-14", TODAY)).toBe("Active");
    // Expires 2026-08-14 — today is the expiry date, so not yet expired.
    expect(cardStatus("2026-07-15", TODAY)).toBe("Expiring Soon");
    // Inside the last fortnight (expires 2026-08-20).
    expect(cardStatus("2026-07-21", TODAY)).toBe("Expiring Soon");
    // Expired on 2026-07-24.
    expect(cardStatus("2026-06-24", TODAY)).toBe("Expired");
    expect(cardStatus(undefined, TODAY)).toBe("");
  });

  it("does not depend on the timezone the browser runs in", () => {
    // A UTC-anchored shift: the same answer from either side of the date line.
    expect(cardExpiry("2026-12-31")).toBe("2027-01-30");
    expect(cardExpiry("2026-02-28")).toBe("2026-03-30");
  });
});

describe("roundLabel", () => {
  it("names an unphased province by itself", () => {
    expect(roundLabel("Lusaka")).toBe("Lusaka");
    expect(roundLabel("Lusaka", "  ")).toBe("Lusaka");
  });

  it("appends the phase, and leaves one that already names its province", () => {
    expect(roundLabel("Copperbelt", "Phase 2")).toBe("Copperbelt Phase 2");
    expect(roundLabel("Copperbelt", "Copperbelt Phase 3")).toBe(
      "Copperbelt Phase 3",
    );
  });
});

describe("buildInspectionDatabase", () => {
  it("counts each type into its workbook column and totals the row", () => {
    const rows = buildInspectionDatabase(
      [
        insp({ type: "Pre-Authorisation" }),
        insp({ type: "Routine Inspection" }),
        insp({ type: "Routine Inspection" }),
        insp({ type: "Follow-up" }),
        insp({ type: "Investigation" }),
      ],
      [fac()],
      { today: TODAY },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].counts).toEqual({
      preAuth: 1,
      planned: 2,
      followUp: 1,
      investigative: 1,
    });
    expect(rows[0].total).toBe(5);
    // District and practice are read off the register, never retyped.
    expect(rows[0].district).toBe("Lusaka");
    expect(rows[0].practice).toBe("Diagnostic Imaging (X-ray)");
  });

  it("does not count an enforcement action as an inspection", () => {
    const rows = buildInspectionDatabase(
      [insp({ type: "Enforcement Action", enforcement: "Seizure of Device" })],
      [fac()],
      { today: TODAY },
    );
    expect(rows[0].total).toBe(0);
    expect(rows[0].enforcement).toBe("Seizure of Device");
  });

  it("shows the most recent enforcement action and keeps the rest", () => {
    const rows = buildInspectionDatabase(
      [
        insp({ date: "2026-05-04", enforcement: "Written Warning" }),
        insp({ date: "2026-07-15", enforcement: "Suspension of Practice" }),
      ],
      [fac()],
      { today: TODAY },
    );
    expect(rows[0].enforcement).toBe("Suspension of Practice");
    expect(rows[0].enforcements).toEqual([
      "Suspension of Practice",
      "Written Warning",
    ]);
  });

  it("carries the most recent card, with its derived expiry and status", () => {
    const rows = buildInspectionDatabase(
      [
        insp({ date: "2026-06-24", cardIssued: "2026-06-24" }),
        insp({ date: "2026-07-15", cardIssued: "2026-07-15" }),
      ],
      [fac()],
      { today: TODAY },
    );
    expect(rows[0].cardIssued).toBe("2026-07-15");
    expect(rows[0].cardExpiry).toBe("2026-08-14");
    expect(rows[0].cardStatus).toBe("Expiring Soon");
    expect(cardsDue(rows)).toHaveLength(1);
  });

  it("gives each phase of a province its own row, as the workbook does sheets", () => {
    const rows = buildInspectionDatabase(
      [
        insp({
          facilityId: "c1",
          facilityName: "Mine Clinic",
          province: "Copperbelt",
          phase: "Phase 1",
        }),
        insp({
          facilityId: "c2",
          facilityName: "Smelter Lab",
          province: "Copperbelt",
          phase: "Phase 2",
        }),
      ],
      [],
      { today: TODAY },
    );
    expect(rows.map((r) => r.round)).toEqual([
      "Copperbelt Phase 1",
      "Copperbelt Phase 2",
    ]);
  });

  it("numbers rows from 1 within each round and orders provinces canonically", () => {
    const rows = buildInspectionDatabase(
      [
        insp({ facilityId: "s1", facilityName: "Zeta", province: "Southern" }),
        insp({ facilityId: "s2", facilityName: "Alpha", province: "Southern" }),
        insp({ facilityId: "l1", facilityName: "Lusaka One", province: "Lusaka" }),
      ],
      [],
      { today: TODAY },
    );
    // Lusaka leads the register's province order; rows within a round are by name.
    expect(rows.map((r) => `${r.round}#${r.no} ${r.facility}`)).toEqual([
      "Lusaka#1 Lusaka One",
      "Southern#1 Alpha",
      "Southern#2 Zeta",
    ]);
  });

  it("lists the round's uninspected facilities at zero when asked", () => {
    const rows = buildInspectionDatabase(
      [insp()],
      [fac(), fac({ id: "f2", name: "City Dental", nameLower: "city dental" })],
      { today: TODAY, province: "Lusaka", includeUninspected: true },
    );
    expect(rows).toHaveLength(2);
    const dental = rows.find((r) => r.facility === "City Dental");
    expect(dental?.total).toBe(0);
    expect(dental?.cardStatus).toBe("");
  });

  it("keeps a free-text facility out of the register's provinces", () => {
    const rows = buildInspectionDatabase(
      [insp({ facilityId: null, facilityName: "Roadside gauge", province: "" })],
      [],
      { today: TODAY },
    );
    expect(rows[0].round).toBe("Unassigned");
  });
});

describe("summariseInspectionDatabase", () => {
  const rows = () =>
    buildInspectionDatabase(
      [
        insp({ type: "Pre-Authorisation" }),
        insp({ type: "Routine Inspection", enforcement: "Engagement at Facility Level" }),
        insp({
          facilityId: "f2",
          facilityName: "City Dental",
          type: "Routine Inspection",
          enforcement: "Seizure of Device",
        }),
        insp({
          facilityId: "s1",
          facilityName: "Choma Clinic",
          province: "Southern",
          type: "Investigation",
        }),
      ],
      [fac()],
      { today: TODAY },
    );

  it("rolls each round up into the Summary sheet's columns", () => {
    const s = summariseInspectionDatabase(rows());
    const lusaka = s.rows.find((r) => r.round === "Lusaka");
    expect(lusaka?.inspections).toEqual({
      preAuth: 1,
      planned: 2,
      followUp: 0,
      investigative: 0,
    });
    expect(lusaka?.inspectionsTotal).toBe(3);
    expect(lusaka?.enforcement["Engagement at Facility Level"]).toBe(1);
    expect(lusaka?.enforcement["Seizure of Device"]).toBe(1);
    expect(lusaka?.enforcementTotal).toBe(2);
    expect(lusaka?.facilities).toBe(2);
  });

  it("totals the two headline figures the workbook prints", () => {
    const s = summariseInspectionDatabase(rows());
    expect(s.total.inspectionsTotal).toBe(4);
    expect(s.total.enforcementTotal).toBe(2);
    expect(s.total.facilities).toBe(3);
  });

  it("drops rounds with nothing recorded", () => {
    const withZeros = buildInspectionDatabase([insp()], [fac(), fac({ id: "f9", name: "Idle" })], {
      today: TODAY,
      includeUninspected: true,
    });
    const s = summariseInspectionDatabase(withZeros);
    expect(s.rows.map((r) => r.round)).toEqual(["Lusaka"]);
    expect(s.total.inspectionsTotal).toBe(1);
  });
});

describe("exports", () => {
  it("writes the Database sheet's thirteen columns", () => {
    const rows = buildInspectionDatabase(
      [insp({ enforcement: "Seizure of Device", cardIssued: "2026-07-15" })],
      [fac()],
      { today: TODAY },
    );
    expect(DATABASE_CSV_HEADER).toHaveLength(13);
    const line = databaseCsvRows(rows)[0];
    expect(line).toEqual([
      "Lusaka",
      "Braceline Centre",
      "Lusaka",
      "Diagnostic Imaging (X-ray)",
      "",
      "1",
      "",
      "",
      "1",
      "Seizure of Device",
      "2026-07-15",
      "2026-08-14",
      "Expiring Soon",
    ]);
    // A practice listing several modalities carries commas — the CSV writer
    // has to quote it or the sheet loses a column.
    const multi = buildInspectionDatabase(
      [insp()],
      [fac({ practice: "Diagnostic Imaging (CT, X-ray), Nuclear Medicine" })],
      { today: TODAY },
    );
    expect(toCsv(DATABASE_CSV_HEADER, databaseCsvRows(multi))).toContain(
      '"Diagnostic Imaging (CT, X-ray), Nuclear Medicine"',
    );
  });

  it("writes the Summary sheet with its banded head and footer figures", () => {
    const s = summariseInspectionDatabase(
      buildInspectionDatabase([insp()], [fac()], { today: TODAY }),
    );
    const lines = summaryCsvRows(s);
    // Band row, header row, one province, Total, blank, headline figures.
    expect(lines[0][1]).toBe("INSPECTIONS");
    expect(lines[0]).toContain("ENGAGEMENTS");
    expect(lines[0]).toContain("OTHER ENFORCEMENTS");
    expect(lines[1]).toEqual([
      "PROVINCE",
      ...INSPECTION_COLUMNS.map((c) => c.label),
      "TOTAL",
      ...ENFORCEMENT_COLUMNS.map((c) => c.label),
      "TOTAL",
    ]);
    expect(lines[2][0]).toBe("Lusaka");
    expect(lines[3][0]).toBe("Total");
    expect(lines[lines.length - 1]).toEqual([
      "Total Inspections Conducted",
      "1",
      "",
      "Total Enforcements",
      "0",
    ]);
  });
});
