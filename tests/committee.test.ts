import { describe, expect, it } from "vitest";
import {
  allowedCommitteeActions,
  applyCommitteeAction,
  buildCommitteeSubmission,
  canApplyCommitteeAction,
  committeeStats,
} from "../lib/rules/committee";
import type { CommitteeSubmission } from "../lib/rules/types";

const actor = { uid: "u1", name: "A&S Officer" };
const NOW = "2026-06-10T08:00:00.000Z";

function fresh(): CommitteeSubmission {
  return {
    id: "c1",
    ...buildCommitteeSubmission(
      {
        ran: "AUTH/USE.NEW/0100",
        facilityId: "f1",
        facilityName: "Kitwe Imaging Centre",
        facCode: "FAC/0001",
        province: "Copperbelt",
        sector: "Private",
        inspectionRequestId: "req1",
        inspectionOutcome: "Compliant",
        reportRef: "RPA/INSP/2026/044",
      },
      actor,
      NOW,
    ),
  };
}

describe("buildCommitteeSubmission", () => {
  it("opens Awaiting TECHCOM with the inspection bundled", () => {
    const s = fresh();
    expect(s.status).toBe("Awaiting TECHCOM");
    expect(s.inspectionRequestId).toBe("req1");
    expect(s.reportRef).toBe("RPA/INSP/2026/044");
    expect(s.timeline).toHaveLength(1);
    expect(s.timeline[0].kind).toBe("created");
    expect(s.timeline[0].text).toMatch(/pre-authorisation inspection/i);
  });
});

describe("the committee path", () => {
  it("walks TECHCOM → Board → issued", () => {
    let s = fresh();
    s = applyCommitteeAction(
      s,
      { kind: "techcom-approve", date: "2026-06-20" },
      actor,
      NOW,
    );
    expect(s.status).toBe("Awaiting Board");
    expect(s.techcomDate).toBe("2026-06-20");

    s = applyCommitteeAction(
      s,
      { kind: "board-approve", date: "2026-07-01" },
      actor,
      NOW,
    );
    expect(s.status).toBe("Board Approved");
    expect(s.boardDate).toBe("2026-07-01");

    s = applyCommitteeAction(
      s,
      { kind: "issue", licenceNumber: "RPA/LIC/2026/0456", date: "2026-07-03" },
      actor,
      NOW,
    );
    expect(s.status).toBe("Licence Issued");
    expect(s.licenceNumber).toBe("RPA/LIC/2026/0456");
    expect(s.timeline).toHaveLength(4);
  });

  it("rejects at either committee stage with a Form III reference", () => {
    const atTechcom = applyCommitteeAction(
      fresh(),
      { kind: "reject", date: "2026-06-20", formIIIRef: "FORM-III/2026/07" },
      actor,
      NOW,
    );
    expect(atTechcom.status).toBe("Rejected (Form III)");
    expect(atTechcom.formIIIRef).toBe("FORM-III/2026/07");
    expect(atTechcom.timeline[1].text).toMatch(/TECHCOM/);

    let s = applyCommitteeAction(
      fresh(),
      { kind: "techcom-approve", date: "2026-06-20" },
      actor,
      NOW,
    );
    s = applyCommitteeAction(s, { kind: "reject", date: "2026-07-01" }, actor, NOW);
    expect(s.status).toBe("Rejected (Form III)");
    expect(s.timeline[2].text).toMatch(/the Board/);
  });

  it("guards invalid transitions", () => {
    const s = fresh();
    expect(canApplyCommitteeAction(s.status, "board-approve")).toBe(false);
    expect(() =>
      applyCommitteeAction(
        s,
        { kind: "issue", licenceNumber: "X", date: "2026-07-01" },
        actor,
        NOW,
      ),
    ).toThrow(/Cannot issue/);
    expect(() =>
      applyCommitteeAction(
        applyCommitteeAction(s, { kind: "withdraw", reason: "duplicate" }, actor, NOW),
        { kind: "techcom-approve", date: "2026-06-20" },
        actor,
        NOW,
      ),
    ).toThrow();
  });

  it("requires a licence number to issue", () => {
    let s = fresh();
    s = applyCommitteeAction(s, { kind: "techcom-approve", date: "2026-06-20" }, actor, NOW);
    s = applyCommitteeAction(s, { kind: "board-approve", date: "2026-07-01" }, actor, NOW);
    expect(() =>
      applyCommitteeAction(s, { kind: "issue", licenceNumber: "  ", date: "2026-07-03" }, actor, NOW),
    ).toThrow(/licence number/i);
  });

  it("offers only the valid actions per status", () => {
    expect(allowedCommitteeActions(fresh())).toEqual([
      "techcom-approve",
      "reject",
      "withdraw",
      "comment",
    ]);
  });
});

describe("committeeStats", () => {
  it("summarises the queue", () => {
    const a = fresh();
    const b = applyCommitteeAction(
      { ...fresh(), id: "c2" },
      { kind: "techcom-approve", date: "2026-06-20" },
      actor,
      NOW,
    );
    const c = applyCommitteeAction(
      { ...fresh(), id: "c3" },
      { kind: "reject", date: "2026-06-20" },
      actor,
      NOW,
    );
    const stats = committeeStats([a, b, c]);
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(2);
    expect(stats.awaitingTechcom).toBe(1);
    expect(stats.rejected).toBe(1);
  });
});
