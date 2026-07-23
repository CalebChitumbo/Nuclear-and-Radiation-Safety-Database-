import { beforeEach, describe, expect, it } from "vitest";

import {
  buildWorkflowComment,
  latestWorkflowComment,
  sortedNotes,
  workflowCommentCount,
  workflowHistoryOnSave,
  workflowStatusLabel,
} from "../lib/rules/workflowNotes";
import { mockStore, resetMockStore } from "../lib/store/mockStore";
import type { LicenceWorkflow } from "../lib/rules/types";
import type { RequestActor } from "../lib/rules/inspectionRequests";

const ACTOR: RequestActor = {
  uid: "u-banda",
  name: "M. Banda",
  section: "Authorisation & Standards",
};
const NOW = "2026-07-20T09:00:00.000Z";

function wf(p: Partial<LicenceWorkflow>): LicenceWorkflow {
  return {
    id: p.ran || "wf",
    ran: "AUTH/USE.REN/0001",
    ranType: "Use Authorization Renewal",
    facilityId: null,
    facilityName: "",
    facCode: "",
    notificationTitle: "",
    stage: "",
    phase: "Payment",
    responsibleParty: "Applicant",
    priority: "APPLICANT",
    outstandingPayment: false,
    bottleneck: false,
    alerts: [],
    notifications: [],
    facilityStage: "Waiting for Payment",
    lastSeen: "10/06/2026",
    reviewStatus: "applied",
    source: "email",
    ...p,
  };
}

describe("workflowStatusLabel", () => {
  it("prefers the canonical RAIS status, then the sub-stage, then the register stage", () => {
    expect(
      workflowStatusLabel(
        wf({
          currentStatus:
            "Payment Pending - Awaiting Proof of Payment (POP) from Applicant",
          stage: "Payment",
        }),
      ),
    ).toBe("Payment Pending - Awaiting Proof of Payment (POP) from Applicant");
    expect(workflowStatusLabel(wf({ stage: "CEO Approval" }))).toBe(
      "CEO Approval",
    );
    expect(workflowStatusLabel(wf({}))).toBe("Waiting for Payment");
  });
});

describe("buildWorkflowComment", () => {
  it("stamps the officer and trims the text", () => {
    const n = buildWorkflowComment("  Call the RPO on Monday.  ", ACTOR, NOW);
    expect(n.kind).toBe("comment");
    expect(n.text).toBe("Call the RPO on Monday.");
    expect(n.by).toBe("u-banda");
    expect(n.byName).toBe("M. Banda");
    expect(n.bySection).toBe("Authorisation & Standards");
    expect(n.at).toBe(NOW);
    expect(n.id).toBeTruthy();
  });

  it("rejects an empty note", () => {
    expect(() => buildWorkflowComment("   ", ACTOR, NOW)).toThrow();
  });
});

describe("workflowHistoryOnSave — the automatic history trail", () => {
  it("records first tracking of an application", () => {
    const next = wf({ stage: "Waiting for Payment" });
    const out = workflowHistoryOnSave(null, next, ACTOR, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("status");
    expect(out[0].text).toContain("Application tracked");
    expect(out[0].status).toBe("Waiting for Payment");
    expect(out[0].byName).toBe("M. Banda");
    expect(out[0].source).toBe("email");
  });

  it("returns nothing when a re-save changes no visible status", () => {
    const prev = wf({ stage: "Waiting for Payment" });
    const next = wf({ stage: "Waiting for Payment" });
    expect(workflowHistoryOnSave(prev, next, ACTOR, NOW)).toHaveLength(0);
  });

  it("records a status move", () => {
    const prev = wf({ stage: "Waiting for Payment" });
    const next = wf({ stage: "CEO Approval" });
    const out = workflowHistoryOnSave(prev, next, ACTOR, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("Status updated — CEO Approval");
    expect(out[0].status).toBe("CEO Approval");
  });

  it("records the officer accepting an incoming email even when the status label is unchanged", () => {
    const prev = wf({ stage: "Payment", reviewStatus: "needs-review" });
    const next = wf({ stage: "Payment", reviewStatus: "applied" });
    const out = workflowHistoryOnSave(prev, next, ACTOR, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain("Incoming update accepted");
  });

  it("records a FORM-I classification, alongside a status move when both happen", () => {
    const prev = wf({ ran: "RPA/LIC/0543", stage: "Payment" });
    const next = wf({
      ran: "RPA/LIC/0543",
      stage: "Licence Issued",
      officerType: "Importation Licence",
    });
    const out = workflowHistoryOnSave(prev, next, ACTOR, NOW);
    expect(out).toHaveLength(2);
    expect(out[0].text).toBe("Status updated — Licence Issued");
    expect(out[1].text).toBe("Licence type classified — Importation Licence");
  });

  it("does not repeat the classification entry when the type is merely preserved", () => {
    const prev = wf({ ran: "RPA/LIC/0543", officerType: "Importation Licence" });
    const next = wf({ ran: "RPA/LIC/0543", officerType: "Importation Licence" });
    expect(workflowHistoryOnSave(prev, next, ACTOR, NOW)).toHaveLength(0);
  });
});

describe("note helpers", () => {
  it("counts comments (not status lines) and finds the latest comment", () => {
    const w = wf({
      notes: [
        {
          id: "a",
          at: "2026-07-01T08:00:00Z",
          by: "u1",
          byName: "A",
          bySection: "",
          kind: "status",
          text: "Application tracked — Payment",
        },
        {
          id: "b",
          at: "2026-07-03T08:00:00Z",
          by: "u2",
          byName: "B",
          bySection: "",
          kind: "comment",
          text: "Newest note",
        },
        {
          id: "c",
          at: "2026-07-02T08:00:00Z",
          by: "u3",
          byName: "C",
          bySection: "",
          kind: "comment",
          text: "Older note",
        },
      ],
    });
    expect(workflowCommentCount(w)).toBe(2);
    expect(latestWorkflowComment(w)?.text).toBe("Newest note");
    expect(sortedNotes(w).map((n) => n.id)).toEqual(["a", "c", "b"]);
    expect(workflowCommentCount(wf({}))).toBe(0);
    expect(latestWorkflowComment(wf({}))).toBeNull();
  });
});

describe("mockStore — the notes trail on saved applications", () => {
  beforeEach(() => resetMockStore());

  it("appends automatic history on save and keeps officer comments across re-imports", async () => {
    const fac = (await mockStore.listFacilities()).find((f) => !f.licensed)!;

    // First import: tracking starts.
    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "AUTH/USE.REN/0500",
          facilityId: fac.id,
          facilityName: fac.name,
          facilityStage: "Waiting for Payment",
          currentStatus:
            "Payment Pending - Awaiting Proof of Payment (POP) from Applicant",
        }),
      ],
      ACTOR.uid,
      ACTOR,
    );

    let rec = (await mockStore.listLicenceWorkflows()).find(
      (w) => w.ran === "AUTH/USE.REN/0500",
    )!;
    expect(rec.notes).toHaveLength(1);
    expect(rec.notes![0].text).toContain("Application tracked");
    expect(rec.notes![0].byName).toBe("M. Banda");

    // An officer leaves the background for the next person.
    const note = await mockStore.addWorkflowNote(
      "AUTH/USE.REN/0500",
      "Applicant promised POP by Friday — don't regenerate the invoice.",
      { uid: "u-mwila", name: "T. Mwila", section: "Authorisation & Standards" },
    );
    expect(note.kind).toBe("comment");

    // A later import moves the status — the comment must survive, in order.
    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "AUTH/USE.REN/0500",
          facilityId: fac.id,
          facilityName: fac.name,
          facilityStage: "CEO Licence Approval Required",
          currentStatus: "Pending CEO Approval (FORM I)",
        }),
      ],
      ACTOR.uid,
      ACTOR,
    );

    rec = (await mockStore.listLicenceWorkflows()).find(
      (w) => w.ran === "AUTH/USE.REN/0500",
    )!;
    expect(rec.notes).toHaveLength(3);
    expect(rec.notes![0].text).toContain("Application tracked");
    expect(rec.notes![1].text).toContain("promised POP by Friday");
    expect(rec.notes![2].text).toContain("Status updated");
    expect(workflowCommentCount(rec)).toBe(1);

    // Re-importing the same status adds no noise.
    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "AUTH/USE.REN/0500",
          facilityId: fac.id,
          facilityName: fac.name,
          facilityStage: "CEO Licence Approval Required",
          currentStatus: "Pending CEO Approval (FORM I)",
        }),
      ],
      ACTOR.uid,
      ACTOR,
    );
    rec = (await mockStore.listLicenceWorkflows()).find(
      (w) => w.ran === "AUTH/USE.REN/0500",
    )!;
    expect(rec.notes).toHaveLength(3);
  });

  it("refuses a note on an application that is not tracked", async () => {
    await expect(
      mockStore.addWorkflowNote("AUTH/NOPE/9999", "hello", ACTOR),
    ).rejects.toThrow();
  });

  it("lists a facility's applications for the facility drawer", async () => {
    const fac = (await mockStore.listFacilities()).find((f) => !f.licensed)!;
    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "AUTH/USE.REN/0501",
          facilityId: fac.id,
          facilityName: fac.name,
        }),
        wf({ ran: "AUTH/IMP/0300", ranType: "Import", facilityId: null }),
      ],
      ACTOR.uid,
      ACTOR,
    );
    const list = await mockStore.listLicenceWorkflowsFor(fac.id);
    expect(list).toHaveLength(1);
    expect(list[0].ran).toBe("AUTH/USE.REN/0501");
  });

  it("works without an actor (uid-only callers) — history still recorded", async () => {
    const fac = (await mockStore.listFacilities()).find((f) => !f.licensed)!;
    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "AUTH/USE.REN/0502",
          facilityId: fac.id,
          facilityName: fac.name,
        }),
      ],
      "plain-uid",
    );
    const rec = (await mockStore.listLicenceWorkflows()).find(
      (w) => w.ran === "AUTH/USE.REN/0502",
    )!;
    expect(rec.notes).toHaveLength(1);
    expect(rec.notes![0].by).toBe("plain-uid");
    expect(rec.notes![0].byName).toBe("");
  });
});
