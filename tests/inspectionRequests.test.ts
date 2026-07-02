import { describe, expect, it } from "vitest";

import {
  allowedActions,
  applyInspectionRequestAction,
  buildInspectionRequest,
  canApplyAction,
  deriveInspectionInbox,
  inspectionRequestStats,
  isActiveRequest,
  type RequestActor,
} from "../lib/rules/inspectionRequests";
import type { InspectionRequest } from "../lib/rules/types";

const AS_ACTOR: RequestActor = {
  uid: "u-as",
  name: "A&S Officer",
  section: "Authorisation & Standards",
};
const INSP_ACTOR: RequestActor = {
  uid: "u-insp",
  name: "Inspector Zulu",
  section: "Inspectorate",
};

function seedRequest(): InspectionRequest {
  const draft = buildInspectionRequest(
    {
      facilityId: "fac-1",
      facilityName: "Kitwe General Hospital",
      facCode: "FAC/0101",
      province: "Copperbelt",
      sector: "Public",
      reason: "Pre-authorisation for a new use/possession licence",
      workflowRan: "AUTH/USE.NEW/0203",
    },
    AS_ACTOR,
    "2026-06-01T08:00:00.000Z",
    "W23 (2026)",
  );
  return { ...draft, id: "req-1" };
}

describe("buildInspectionRequest", () => {
  it("opens in Requested with a created timeline entry and defaults", () => {
    const r = seedRequest();
    expect(r.status).toBe("Requested");
    expect(r.type).toBe("Pre-Authorisation");
    expect(r.priority).toBe("Normal");
    expect(r.requestedBy).toBe("u-as");
    expect(r.requestedWeek).toBe("W23 (2026)");
    expect(r.timeline).toHaveLength(1);
    expect(r.timeline[0].kind).toBe("created");
    expect(r.timeline[0].bySection).toBe("Authorisation & Standards");
  });
});

describe("state machine — the happy path", () => {
  it("walks Requested → Acknowledged → Assigned → In Progress → Report Ready → Closed", () => {
    let r = seedRequest();

    r = applyInspectionRequestAction(
      r,
      { kind: "acknowledge" },
      INSP_ACTOR,
      "2026-06-02T08:00:00.000Z",
    );
    expect(r.status).toBe("Acknowledged");
    expect(r.acknowledgedAt).toBe("2026-06-02T08:00:00.000Z");

    r = applyInspectionRequestAction(
      r,
      { kind: "assign", inspector: "Inspector Zulu", targetDate: "2026-06-10" },
      INSP_ACTOR,
      "2026-06-03T08:00:00.000Z",
    );
    expect(r.status).toBe("Assigned");
    expect(r.assignedInspector).toBe("Inspector Zulu");
    expect(r.targetDate).toBe("2026-06-10");

    r = applyInspectionRequestAction(
      r,
      { kind: "start" },
      INSP_ACTOR,
      "2026-06-10T08:00:00.000Z",
    );
    expect(r.status).toBe("In Progress");
    expect(r.startedAt).toBe("2026-06-10T08:00:00.000Z");

    r = applyInspectionRequestAction(
      r,
      {
        kind: "complete",
        outcome: "Compliant",
        reportRef: "RPA/INSP/2026/044",
        completedDate: "2026-06-10",
        findings: "All sources accounted for.",
      },
      INSP_ACTOR,
      "2026-06-11T08:00:00.000Z",
    );
    expect(r.status).toBe("Report Ready");
    expect(r.outcome).toBe("Compliant");
    expect(r.reportRef).toBe("RPA/INSP/2026/044");
    expect(r.completedDate).toBe("2026-06-10");

    r = applyInspectionRequestAction(
      r,
      { kind: "close" },
      AS_ACTOR,
      "2026-06-12T08:00:00.000Z",
    );
    expect(r.status).toBe("Closed");
    // created + 5 actions
    expect(r.timeline).toHaveLength(6);
    expect(r.timeline.map((e) => e.kind)).toEqual([
      "created",
      "acknowledged",
      "assigned",
      "started",
      "completed",
      "closed",
    ]);
  });

  it("assigning straight from Requested implies acknowledgement", () => {
    let r = seedRequest();
    r = applyInspectionRequestAction(
      r,
      { kind: "assign", inspector: "Inspector Banda" },
      INSP_ACTOR,
      "2026-06-02T08:00:00.000Z",
    );
    expect(r.status).toBe("Assigned");
    expect(r.acknowledgedAt).toBe("2026-06-02T08:00:00.000Z");
  });
});

describe("state machine — invalid transitions are rejected", () => {
  it("cannot start a request that is still Requested", () => {
    const r = seedRequest();
    expect(() =>
      applyInspectionRequestAction(r, { kind: "start" }, INSP_ACTOR, "now"),
    ).toThrow(/Cannot start/);
  });

  it("cannot close a request that has no report yet", () => {
    const r = seedRequest();
    expect(() =>
      applyInspectionRequestAction(r, { kind: "close" }, AS_ACTOR, "now"),
    ).toThrow(/Cannot close/);
  });

  it("cannot cancel a request that is already Closed", () => {
    const r = { ...seedRequest(), status: "Closed" as const };
    expect(canApplyAction(r.status, "cancel")).toBe(false);
    expect(() =>
      applyInspectionRequestAction(
        r,
        { kind: "cancel", reason: "duplicate" },
        AS_ACTOR,
        "now",
      ),
    ).toThrow(/Cannot cancel/);
  });

  it("allows a comment from any status", () => {
    const r = { ...seedRequest(), status: "Cancelled" as const };
    const after = applyInspectionRequestAction(
      r,
      { kind: "comment", note: "reopening under a new RAN" },
      AS_ACTOR,
      "now",
    );
    expect(after.status).toBe("Cancelled");
    expect(after.timeline.at(-1)?.text).toContain("reopening");
  });
});

describe("capability gating", () => {
  it("offers the Inspectorate the accept/assign actions on a new request", () => {
    const r = seedRequest();
    const actions = allowedActions(r, { canEditAS: false, canEditInsp: true });
    expect(actions).toContain("acknowledge");
    expect(actions).toContain("assign");
    expect(actions).toContain("cancel");
    expect(actions).toContain("comment");
    // No report yet → nothing to close.
    expect(actions).not.toContain("close");
  });

  it("offers Licensing the close action once a report is ready", () => {
    const r = { ...seedRequest(), status: "Report Ready" as const };
    const asActions = allowedActions(r, { canEditAS: true, canEditInsp: false });
    expect(asActions).toContain("close");
    // Licensing cannot drive the inspection itself.
    expect(asActions).not.toContain("start");
    expect(asActions).not.toContain("complete");
  });
});

describe("deriveInspectionInbox", () => {
  const requests: InspectionRequest[] = [
    { ...seedRequest(), id: "a", status: "Requested" },
    { ...seedRequest(), id: "b", status: "Requested" },
    { ...seedRequest(), id: "c", status: "In Progress" },
    { ...seedRequest(), id: "d", status: "Report Ready" },
    { ...seedRequest(), id: "e", status: "Closed" },
  ];

  it("alerts the Inspectorate to new incoming requests", () => {
    const inbox = deriveInspectionInbox(requests, {
      canEditAS: false,
      canEditInsp: true,
    });
    expect(inbox.incoming).toHaveLength(2);
    expect(inbox.count).toBe(2);
  });

  it("alerts Licensing to reports that are ready to action", () => {
    const inbox = deriveInspectionInbox(requests, {
      canEditAS: true,
      canEditInsp: false,
    });
    expect(inbox.reportsReady).toHaveLength(1);
    expect(inbox.count).toBe(1);
  });

  it("shows an admin (both caps) both queues", () => {
    const inbox = deriveInspectionInbox(requests, {
      canEditAS: true,
      canEditInsp: true,
    });
    expect(inbox.count).toBe(3);
    expect(inbox.inProgress).toHaveLength(1);
  });
});

describe("inspectionRequestStats", () => {
  it("counts by status, open, completed and distinct facilities", () => {
    const requests: InspectionRequest[] = [
      { ...seedRequest(), id: "a", status: "Requested" },
      { ...seedRequest(), id: "b", status: "In Progress" },
      {
        ...seedRequest(),
        id: "c",
        status: "Report Ready",
        completedDate: "2026-05-02",
      },
      {
        ...seedRequest(),
        id: "d",
        status: "Closed",
        facilityId: "fac-2",
        completedDate: "2026-05-09",
      },
      {
        ...seedRequest(),
        id: "e",
        status: "Closed",
        facilityId: "fac-2",
        completedDate: "2025-11-01",
      },
    ];
    const stats = inspectionRequestStats(requests, 2026);
    expect(stats.total).toBe(5);
    expect(stats.open).toBe(2);
    expect(stats.byStatus["Report Ready"]).toBe(1);
    expect(stats.reportsReady).toBe(1);
    expect(stats.completed).toBe(3);
    expect(stats.completedThisYear).toBe(2);
    // fac-1 (from c) and fac-2 (d & e collapse to one) → 2 distinct.
    expect(stats.facilitiesInspected).toBe(2);
  });

  it("treats only pipeline statuses as active", () => {
    expect(isActiveRequest({ ...seedRequest(), status: "Requested" })).toBe(true);
    expect(isActiveRequest({ ...seedRequest(), status: "Report Ready" })).toBe(
      false,
    );
    expect(isActiveRequest({ ...seedRequest(), status: "Cancelled" })).toBe(
      false,
    );
  });
});
