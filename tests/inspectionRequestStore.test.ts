import { beforeEach, describe, expect, it } from "vitest";

import { mockStore, resetMockStore } from "../lib/store/mockStore";
import type { RequestActor } from "../lib/rules/inspectionRequests";

const AS: RequestActor = {
  uid: "u-as",
  name: "A&S Officer",
  section: "Authorisation & Standards",
};
const INSP: RequestActor = {
  uid: "u-insp",
  name: "Inspector Zulu",
  section: "Inspectorate",
};

describe("mock store — inspection request lifecycle (the integration seam)", () => {
  beforeEach(() => resetMockStore());

  it("raises, works and completes a request, recording a linked inspection", async () => {
    const facilities = await mockStore.listFacilities();
    const fac = facilities[0];

    const req = await mockStore.addInspectionRequest(
      {
        facilityId: fac.id,
        facilityName: fac.name,
        facCode: fac.facCode,
        province: fac.province,
        sector: fac.sector,
        reason: "Pre-authorisation inspection for a new licence",
        workflowRan: "AUTH/USE.NEW/0203",
      },
      AS,
    );
    expect(req.status).toBe("Requested");

    // It shows up on the facility's request list.
    const forFacility = await mockStore.listInspectionRequestsFor(fac.id);
    expect(forFacility).toHaveLength(1);

    // Inspectorate works it through the pipeline.
    await mockStore.updateInspectionRequest(req.id, { kind: "acknowledge" }, INSP);
    await mockStore.updateInspectionRequest(
      req.id,
      { kind: "assign", inspector: "Inspector Zulu", targetDate: "2026-06-10" },
      INSP,
    );
    await mockStore.updateInspectionRequest(req.id, { kind: "start" }, INSP);
    const completed = await mockStore.updateInspectionRequest(
      req.id,
      {
        kind: "complete",
        outcome: "Compliant",
        reportRef: "RPA/INSP/2026/044",
        completedDate: "2026-06-10",
        findings: "All sources accounted for.",
      },
      INSP,
    );

    expect(completed.status).toBe("Report Ready");
    expect(completed.assignedInspector).toBe("Inspector Zulu");
    expect(completed.inspectionId).toBeTruthy();

    // Completing recorded a dated inspection in the Inspectorate log, linked
    // back to the request — this is the whole point of the integration.
    const inspections = await mockStore.listInspectionsFor(fac.id);
    const created = inspections.find((i) => i.id === completed.inspectionId);
    expect(created).toBeTruthy();
    expect(created?.requestId).toBe(req.id);
    expect(created?.type).toBe("Pre-Authorisation");
    expect(created?.outcome).toBe("Compliant");
    expect(created?.date).toBe("2026-06-10");
    expect(created?.week).not.toBe("");

    // Licensing closes the loop.
    const closed = await mockStore.updateInspectionRequest(
      req.id,
      { kind: "close" },
      AS,
    );
    expect(closed.status).toBe("Closed");
    // created + acknowledge + assign + start + complete + close = 6 entries.
    expect(closed.timeline).toHaveLength(6);

    // The SOP's gate: a satisfactory pre-authorisation close files the
    // application for TECHCOM with the inspection report bundled.
    const submissions = await mockStore.listCommitteeSubmissions();
    expect(submissions).toHaveLength(1);
    expect(submissions[0].status).toBe("Awaiting TECHCOM");
    expect(submissions[0].inspectionRequestId).toBe(req.id);
    expect(submissions[0].ran).toBe("AUTH/USE.NEW/0203");
    expect(submissions[0].reportRef).toBe("RPA/INSP/2026/044");
  });

  it("does NOT file for TECHCOM when the inspection was unsatisfactory", async () => {
    const facilities = await mockStore.listFacilities();
    const fac = facilities[0];
    const req = await mockStore.addInspectionRequest(
      {
        facilityId: fac.id,
        facilityName: fac.name,
        facCode: fac.facCode,
        province: fac.province,
        sector: fac.sector,
        reason: "pre-auth",
      },
      AS,
    );
    await mockStore.updateInspectionRequest(req.id, { kind: "acknowledge" }, INSP);
    await mockStore.updateInspectionRequest(
      req.id,
      {
        kind: "complete",
        outcome: "Non-compliant",
        reportRef: "R/9",
        completedDate: "2026-05-01",
      },
      INSP,
    );
    await mockStore.updateInspectionRequest(req.id, { kind: "close" }, AS);

    // Unsatisfactory outcome routes back (Form II / rejection) — never TECHCOM.
    expect(await mockStore.listCommitteeSubmissions()).toHaveLength(0);
  });

  it("keeps the request out of the register's licensed status (no side effects)", async () => {
    const facilities = await mockStore.listFacilities();
    const fac = facilities.find((f) => !f.licensed) || facilities[0];
    const before = fac.licensed;

    const req = await mockStore.addInspectionRequest(
      {
        facilityId: fac.id,
        facilityName: fac.name,
        facCode: fac.facCode,
        province: fac.province,
        sector: fac.sector,
        reason: "routine pre-auth",
      },
      AS,
    );
    await mockStore.updateInspectionRequest(req.id, { kind: "acknowledge" }, INSP);
    await mockStore.updateInspectionRequest(
      req.id,
      {
        kind: "complete",
        outcome: "Minor findings",
        reportRef: "R/2",
        completedDate: "2026-05-01",
      },
      INSP,
    );

    const after = await mockStore.getFacility(fac.id);
    // An inspection request never flips licensing status — that stays with the
    // Use/Possession licence flow.
    expect(after?.licensed).toBe(before);
  });
});
