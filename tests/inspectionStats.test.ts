import { describe, expect, it } from "vitest";
import {
  deriveInspectionSchedule,
  deriveInspectorateDashboard,
  inspectionInPeriod,
  type PeriodContext,
} from "../lib/rules/inspectionStats";
import { buildInspectionRequest } from "../lib/rules/inspectionRequests";
import {
  INSPECTION_OUTCOMES,
  inspectionOutcome,
  type Inspection,
  type InspectionRequest,
  type InspectionRequestStatus,
} from "../lib/rules/types";

const W22 = { label: "W22 — wk of 25 May 2026", start: "2026-05-25", end: "2026-05-29" };

const ctx: PeriodContext = { week: W22, today: "2026-05-27" };

const insp = (over: Partial<Inspection> = {}): Inspection => ({
  id: `i${Math.random()}`,
  date: "2026-05-27",
  week: W22.label,
  facilityId: "f1",
  facilityName: "Facility One",
  type: "Routine Inspection",
  outcome: "Compliant",
  province: "Lusaka",
  sector: "Private",
  notes: "",
  ...over,
});

describe("inspectionInPeriod", () => {
  it("matches the selected reporting week by label", () => {
    expect(inspectionInPeriod(insp(), "week", ctx)).toBe(true);
    expect(
      inspectionInPeriod(insp({ week: "W23 — wk of 01 Jun 2026" }), "week", ctx),
    ).toBe(false);
  });

  it("matches month and year by the inspection date", () => {
    const may = insp({ date: "2026-05-02" });
    const june = insp({ date: "2026-06-02" });
    const lastYear = insp({ date: "2025-05-27" });
    expect(inspectionInPeriod(may, "month", ctx)).toBe(true);
    expect(inspectionInPeriod(june, "month", ctx)).toBe(false);
    expect(inspectionInPeriod(june, "year", ctx)).toBe(true);
    expect(inspectionInPeriod(lastYear, "year", ctx)).toBe(false);
    expect(inspectionInPeriod(lastYear, "all", ctx)).toBe(true);
  });

  it("counts the 2026 register's undated rows in 2026, and in no week or month", () => {
    const undated = insp({ date: "", week: "" });
    expect(inspectionInPeriod(undated, "year", ctx)).toBe(true);
    expect(inspectionInPeriod(undated, "month", ctx)).toBe(false);
    expect(inspectionInPeriod(undated, "week", ctx)).toBe(false);
    expect(inspectionInPeriod(undated, "year", { week: null, today: "2027-02-01" })).toBe(false);
  });
});

describe("deriveInspectorateDashboard", () => {
  const inspections = [
    insp({ type: "Pre-Authorisation", facilityId: "f1" }),
    insp({ type: "Routine Inspection", facilityId: "f1" }),
    insp({ type: "Investigation", facilityId: "f2", outcome: "Major findings" }),
    insp({
      type: "Enforcement Action",
      facilityId: "f3",
      outcome: "Non-compliant",
      date: "2026-05-26",
    }),
    // Outside the year — must be excluded below.
    insp({ type: "Routine Inspection", facilityId: "f9", date: "2025-11-01" }),
  ];

  it("counts totals, types, outcomes and distinct facilities in the period", () => {
    const d = deriveInspectorateDashboard(inspections, "year", ctx);
    expect(d.total).toBe(4);
    expect(d.facilities).toBe(3);
    expect(d.byType["Pre-Authorisation"]).toBe(1);
    expect(d.byType["Routine Inspection"]).toBe(1);
    expect(d.byType.Investigation).toBe(1);
    expect(d.byType["Enforcement Action"]).toBe(1);
    expect(d.byOutcome.Compliant).toBe(2);
    // "Major findings" is a retired grade — it reads as Non-compliant.
    expect(d.byOutcome["Non-compliant"]).toBe(2);
    expect(d.needsFollowUp).toBe(2);
  });

  it("reads only Compliant / Non-compliant, and counts the rows with no outcome", () => {
    const d = deriveInspectorateDashboard(
      [
        insp({ outcome: "Minor findings" }),
        insp({ outcome: "N/A" }),
        insp({ outcome: "Compliant" }),
      ],
      "year",
      ctx,
    );
    expect(Object.keys(d.byOutcome)).toEqual(["Compliant", "Non-compliant"]);
    expect(d.byOutcome).toEqual({ Compliant: 1, "Non-compliant": 1 });
    expect(d.outcomeNotRecorded).toBe(1);
  });

  it("lists enforcement actions newest first", () => {
    const withNewer = [
      ...inspections,
      insp({
        type: "Enforcement Action",
        facilityId: "f4",
        date: "2026-05-28",
      }),
    ];
    const d = deriveInspectorateDashboard(withNewer, "year", ctx);
    expect(d.enforcement.map((e) => e.date)).toEqual([
      "2026-05-28",
      "2026-05-26",
    ]);
  });

  it("respects the all-time period", () => {
    const d = deriveInspectorateDashboard(inspections, "all", ctx);
    expect(d.total).toBe(5);
  });
});

describe("deriveInspectionSchedule", () => {
  const req = (
    status: InspectionRequestStatus,
    over: Partial<InspectionRequest> = {},
  ): InspectionRequest => ({
    ...buildInspectionRequest(
      {
        facilityId: "f1",
        facilityName: "Facility One",
        reason: "Licence pending",
      },
      { uid: "u1", name: "Officer", section: "Authorisation & Standards" },
      "2026-05-20T08:00:00.000Z",
      W22.label,
    ),
    id: `r${Math.random()}`,
    status,
    ...over,
  });

  it("keeps only pipeline-active requests", () => {
    const schedule = deriveInspectionSchedule([
      req("Requested"),
      req("Report Ready"),
      req("Closed"),
      req("Cancelled"),
      req("In Progress"),
    ]);
    expect(schedule).toHaveLength(2);
    expect(schedule.every((r) => ["Requested", "In Progress"].includes(r.status))).toBe(
      true,
    );
  });

  it("orders dated requests soonest first, then undated by priority then age", () => {
    const late = req("Assigned", { targetDate: "2026-06-10", facilityName: "Late" });
    const soon = req("Assigned", { targetDate: "2026-05-30", facilityName: "Soon" });
    const byNeed = req("Requested", {
      neededBy: "2026-06-01",
      facilityName: "NeededBy",
    });
    const urgentUndated = req("Requested", {
      priority: "Urgent",
      facilityName: "Urgent",
    });
    const oldNormal = req("Requested", {
      facilityName: "OldNormal",
      requestedAt: "2026-05-01T08:00:00.000Z",
    });
    const newNormal = req("Requested", {
      facilityName: "NewNormal",
      requestedAt: "2026-05-19T08:00:00.000Z",
    });

    const names = deriveInspectionSchedule([
      newNormal,
      late,
      urgentUndated,
      soon,
      oldNormal,
      byNeed,
    ]).map((r) => r.facilityName);

    expect(names).toEqual([
      "Soon",
      "NeededBy",
      "Late",
      "Urgent",
      "OldNormal",
      "NewNormal",
    ]);
  });
});

describe("inspectionOutcome", () => {
  it("reads the retired findings grades as Non-compliant", () => {
    expect(inspectionOutcome("Compliant")).toBe("Compliant");
    expect(inspectionOutcome("Non-compliant")).toBe("Non-compliant");
    expect(inspectionOutcome("Minor findings")).toBe("Non-compliant");
    expect(inspectionOutcome("Major findings")).toBe("Non-compliant");
    expect(inspectionOutcome("N/A")).toBeNull();
    expect(INSPECTION_OUTCOMES).toEqual(["Compliant", "Non-compliant"]);
  });
});
