import { describe, expect, it } from "vitest";
import {
  APPLICATION_AT_RISK_AFTER,
  NEW_LICENCE_TARGET,
  PRE_AUTH_INSPECTION_TARGET,
  applicationAgeing,
  inspectionGate,
  inspectionRequestSla,
  isRenewalRan,
  overdueInspectionRequests,
  slaPhrase,
  slaStatus,
  workflowStartDate,
} from "../lib/rules/sla";
import { addWorkingDays } from "../lib/rules/workingDays";
import type { InspectionRequest, LicenceWorkflow } from "../lib/rules/types";

function request(over: Partial<InspectionRequest>): InspectionRequest {
  return {
    id: "r1",
    facilityId: "f1",
    facilityName: "Kitwe Imaging Centre",
    facCode: "FAC/0001",
    province: "Copperbelt",
    sector: "Private",
    type: "Pre-Authorisation",
    priority: "Normal",
    status: "Requested",
    reason: "New use/possession licence",
    requestedBy: "u1",
    requestedByName: "A&S Officer",
    requestedAt: "2026-06-01T08:00:00.000Z",
    requestedWeek: "W23",
    timeline: [],
    ...over,
  };
}

function workflow(over: Partial<LicenceWorkflow>): LicenceWorkflow {
  return {
    id: "w1",
    ran: "AUTH/USE.NEW/0100",
    ranType: "USE.NEW",
    facilityId: "f1",
    facilityName: "Kitwe Imaging Centre",
    facCode: "FAC/0001",
    notificationTitle: "Application Submitted",
    stage: "Review",
    phase: "Review & Assessment",
    responsibleParty: "RPA",
    priority: "NORMAL",
    outstandingPayment: false,
    bottleneck: false,
    alerts: [],
    notifications: [],
    facilityStage: "Under Review and Assessment",
    lastSeen: "01/06/2026",
    ...over,
  };
}

describe("slaStatus", () => {
  it("tracks a running clock", () => {
    const s = slaStatus("2026-06-01", 26, "2026-06-10");
    expect(s.dueDate).toBe(addWorkingDays("2026-06-01", 26));
    expect(s.state).toBe("on-track");
    expect(s.daysLeft).toBeGreaterThan(5);
  });

  it("flags due-soon then overdue", () => {
    const due = addWorkingDays("2026-06-01", 26); // 2026-07-09
    expect(slaStatus("2026-06-01", 26, "2026-07-03").state).toBe("due-soon");
    expect(slaStatus("2026-06-01", 26, addWorkingDays(due, 1)).state).toBe(
      "overdue",
    );
  });

  it("freezes at the completion date: met and met-late", () => {
    expect(slaStatus("2026-06-01", 26, "2026-08-01", "2026-07-01").state).toBe(
      "met",
    );
    expect(slaStatus("2026-06-01", 26, "2026-08-01", "2026-07-20").state).toBe(
      "met-late",
    );
  });

  it("phrases the remaining window", () => {
    expect(slaPhrase(slaStatus("2026-06-01", 1, "2026-06-02"))).toBe(
      "due today",
    );
  });
});

describe("inspectionRequestSla", () => {
  it("starts the 26-working-day clock at the request", () => {
    const s = inspectionRequestSla(request({}), "2026-06-02");
    expect(s?.dueDate).toBe(addWorkingDays("2026-06-01", PRE_AUTH_INSPECTION_TARGET));
    expect(s?.state).toBe("on-track");
  });

  it("goes overdue past the SOP window", () => {
    const s = inspectionRequestSla(request({}), "2026-08-01");
    expect(s?.state).toBe("overdue");
  });

  it("an earlier neededBy tightens the clock", () => {
    const s = inspectionRequestSla(
      request({ neededBy: "2026-06-10" }),
      "2026-06-02",
    );
    expect(s?.dueDate).toBe("2026-06-10");
  });

  it("a later neededBy does NOT relax the SOP due date", () => {
    const s = inspectionRequestSla(
      request({ neededBy: "2026-12-01" }),
      "2026-06-02",
    );
    expect(s?.dueDate).toBe(addWorkingDays("2026-06-01", PRE_AUTH_INSPECTION_TARGET));
  });

  it("freezes on completion", () => {
    const s = inspectionRequestSla(
      request({ status: "Report Ready", completedDate: "2026-06-20" }),
      "2026-09-01",
    );
    expect(s?.state).toBe("met");
  });

  it("has no clock when cancelled", () => {
    expect(inspectionRequestSla(request({ status: "Cancelled" }), "2026-06-02")).toBeNull();
  });

  it("lists overdue open requests", () => {
    const requests = [
      request({ id: "a" }), // overdue by August
      request({ id: "b", status: "Report Ready", completedDate: "2026-06-20" }),
      request({ id: "c", status: "Cancelled" }),
    ];
    const overdue = overdueInspectionRequests(requests, "2026-08-15");
    expect(overdue.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("inspectionGate", () => {
  it("routes satisfactory outcomes to TECHCOM", () => {
    expect(inspectionGate("Compliant")?.route).toBe("techcom");
    expect(inspectionGate("Minor findings")?.satisfactory).toBe(true);
  });

  it("routes unsatisfactory outcomes back for further particulars", () => {
    expect(inspectionGate("Major findings")?.route).toBe("further-particulars");
    expect(inspectionGate("Non-compliant")?.satisfactory).toBe(false);
  });

  it("makes no decision for N/A or missing outcomes", () => {
    expect(inspectionGate("N/A")).toBeNull();
    expect(inspectionGate(undefined)).toBeNull();
  });
});

describe("application ageing (44-working-day target)", () => {
  it("prefers the complete-application date, then firstSeen, then receipt", () => {
    expect(
      workflowStartDate(
        workflow({ completeReceivedAt: "2026-06-03", firstSeen: "2026-06-01" }),
      ),
    ).toBe("2026-06-03");
    expect(workflowStartDate(workflow({ firstSeen: "2026-06-01" }))).toBe(
      "2026-06-01",
    );
    expect(
      workflowStartDate(workflow({ receivedAt: "2026-06-02T08:00:00Z" })),
    ).toBe("2026-06-02");
    // Falls back to the parsed RAIS notification date (DD/MM/YYYY).
    expect(workflowStartDate(workflow({}))).toBe("2026-06-01");
  });

  it("buckets active applications by age", () => {
    const fresh = workflow({ id: "fresh", ran: "AUTH/USE.NEW/1", firstSeen: "2026-06-01" });
    const old = workflow({ id: "old", ran: "AUTH/USE.NEW/2", firstSeen: "2026-01-05" });
    const issued = workflow({
      id: "done",
      ran: "AUTH/USE.NEW/3",
      firstSeen: "2026-01-05",
      facilityStage: "Licence / Certificate Issued",
    });
    const pending = workflow({
      id: "queued",
      ran: "AUTH/USE.NEW/4",
      firstSeen: "2026-01-05",
      reviewStatus: "needs-review",
    });
    const summary = applicationAgeing([fresh, old, issued, pending], "2026-06-05");
    expect(summary.rows.map((r) => r.workflow.id)).toEqual(["old", "fresh"]);
    expect(summary.rows[0].state).toBe("overdue");
    expect(summary.rows[1].state).toBe("on-track");
    expect(summary.overdue).toBe(1);
    expect(summary.onTrack).toBe(1);
  });

  it("flags at-risk before the 44-day line", () => {
    // APPLICATION_AT_RISK_AFTER working days before 2026-06-05 — walk back.
    const start = "2026-04-20";
    const summary = applicationAgeing(
      [workflow({ firstSeen: start })],
      addWorkingDays(start, APPLICATION_AT_RISK_AFTER),
    );
    expect(summary.rows[0].state).toBe("at-risk");
    expect(summary.rows[0].ageDays).toBe(APPLICATION_AT_RISK_AFTER);
    expect(summary.rows[0].dueDate).toBe(addWorkingDays(start, NEW_LICENCE_TARGET));
  });

  it("runs renewals on the 15-working-day clock", () => {
    expect(isRenewalRan("AUTH/USE.REN/1097")).toBe(true);
    const summary = applicationAgeing(
      [workflow({ ran: "AUTH/USE.REN/1097", firstSeen: "2026-06-01" })],
      addWorkingDays("2026-06-01", 16),
    );
    expect(summary.rows[0].state).toBe("overdue");
  });

  it("counts undated active applications instead of dropping them silently", () => {
    const summary = applicationAgeing(
      [workflow({ lastSeen: "", receivedAt: undefined })],
      "2026-06-05",
    );
    expect(summary.rows).toHaveLength(0);
    expect(summary.undated).toBe(1);
  });
});
