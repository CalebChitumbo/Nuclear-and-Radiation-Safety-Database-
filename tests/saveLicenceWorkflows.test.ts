import { beforeEach, describe, expect, it } from "vitest";

import { mockStore, resetMockStore } from "../lib/store/mockStore";
import type { LicenceWorkflow } from "../lib/rules/types";

// A complete, applied workflow record keyed by RAN — the shape the accept action
// (applyReviewed / acceptAllReady) hands saveLicenceWorkflows.
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

describe("saveLicenceWorkflows — licence family drives where an update lands", () => {
  beforeEach(() => resetMockStore());

  it("records an issued non-Use/Possession application as a standalone authorisation without touching renewal status", async () => {
    const licensed = (await mockStore.listFacilities()).find((f) => f.licensed)!;
    const before = {
      licensed: licensed.licensed,
      stage: licensed.stage,
      currentStatus: licensed.currentStatus,
      auths: (licensed.auths || []).length,
    };

    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "AUTH/IMP/0099",
          ranType: "Import",
          facilityId: licensed.id,
          facilityName: licensed.name,
          facilityStage: "Licence / Certificate Issued",
          currentStatus: undefined,
        }),
      ],
      "u",
    );

    const after = (await mockStore.listFacilities()).find((f) => f.id === licensed.id)!;
    // Renewal status is untouched…
    expect(after.licensed).toBe(before.licensed);
    expect(after.stage).toBe(before.stage);
    expect(after.currentStatus).toBe(before.currentStatus);
    // …but the import is now a recorded authorisation + dated event.
    expect((after.auths || []).length).toBe(before.auths + 1);
    expect(
      (after.auths || []).some(
        (a) => a.type === "Importation Licence" && a.number === "AUTH/IMP/0099",
      ),
    ).toBe(true);
    const events = await mockStore.listLicenceEvents();
    expect(events.some((e) => e.type === "Importation Licence")).toBe(true);
  });

  it("does not record an authorisation for a non-issued import, and never moves the renewal stage", async () => {
    const unl = (await mockStore.listFacilities()).find((f) => !f.licensed)!;
    const originalStage = unl.stage;

    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "AUTH/IMP/0100",
          ranType: "Import",
          facilityId: unl.id,
          facilityName: unl.name,
          facilityStage: "Waiting for Payment",
          currentStatus:
            "Payment Pending - Awaiting Proof of Payment (POP) from Applicant",
        }),
      ],
      "u",
    );

    const after = (await mockStore.listFacilities()).find((f) => f.id === unl.id)!;
    expect((after.auths || []).length).toBe(0); // not issued → nothing recorded
    expect(after.stage).toBe(originalStage); // import never drives the renewal stage
  });

  it("holds an unclassified FORM-I number out of the register entirely", async () => {
    const unl = (await mockStore.listFacilities()).find((f) => !f.licensed)!;
    const originalStage = unl.stage;
    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "RPA/LIC/0700",
          ranType: "New Licence / Import",
          facilityId: unl.id,
          facilityName: unl.name,
          facilityStage: "Licence / Certificate Issued", // even when issued…
          // …with no officerType it must not touch the register.
        }),
      ],
      "u",
    );
    const after = (await mockStore.listFacilities()).find((f) => f.id === unl.id)!;
    expect((after.auths || []).length).toBe(0); // nothing recorded
    expect(after.stage).toBe(originalStage); // renewal stage untouched
    expect(after.licensed).toBe(false);
  });

  it("treats a FORM-I (RPA/LIC) number classified as Import as a standalone authorisation", async () => {
    const licensed = (await mockStore.listFacilities()).find((f) => f.licensed)!;
    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "RPA/LIC/0543",
          ranType: "New Licence / Import",
          facilityId: licensed.id,
          facilityName: licensed.name,
          facilityStage: "Licence / Certificate Issued",
          officerType: "Importation Licence", // officer's one-time classification
        }),
      ],
      "u",
    );
    const after = (await mockStore.listFacilities()).find((f) => f.id === licensed.id)!;
    expect(after.stage).toBe("Licensed"); // renewal status untouched
    expect(
      (after.auths || []).some(
        (a) => a.type === "Importation Licence" && a.number === "RPA/LIC/0543",
      ),
    ).toBe(true);
  });

  it("keeps the officer-assigned type when a later notification for the same number omits it", async () => {
    const unl = (await mockStore.listFacilities()).find((f) => !f.licensed)!;
    // First notification: classify the FORM-I number as Import (still mid-stage).
    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "RPA/LIC/0600",
          facilityId: unl.id,
          facilityName: unl.name,
          facilityStage: "Waiting for Payment",
          currentStatus:
            "Payment Pending - Awaiting Proof of Payment (POP) from Applicant",
          officerType: "Importation Licence",
        }),
      ],
      "u",
    );
    // Later notification for the same number, this time issued and WITHOUT a type.
    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "RPA/LIC/0600",
          facilityId: unl.id,
          facilityName: unl.name,
          facilityStage: "Licence / Certificate Issued",
          officerType: undefined,
        }),
      ],
      "u",
    );

    const rec = (await mockStore.listLicenceWorkflows()).find(
      (w) => w.ran === "RPA/LIC/0600",
    )!;
    expect(rec.officerType).toBe("Importation Licence"); // sticks to the number

    const after = (await mockStore.listFacilities()).find((f) => f.id === unl.id)!;
    expect(after.licensed).toBe(false); // import never licenses
    expect(
      (after.auths || []).some(
        (a) => a.number === "RPA/LIC/0600" && a.type === "Importation Licence",
      ),
    ).toBe(true);
  });

  it("rolls a Use/Possession renewal's status onto the facility (no authorisation until licensed)", async () => {
    const unl = (await mockStore.listFacilities()).find((f) => !f.licensed)!;

    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "AUTH/USE.REN/0500",
          facilityId: unl.id,
          facilityName: unl.name,
          facilityStage: "Waiting for Payment",
          currentStatus:
            "Payment Pending - Awaiting Proof of Payment (POP) from Applicant",
        }),
      ],
      "u",
    );

    const after = (await mockStore.listFacilities()).find((f) => f.id === unl.id)!;
    expect(after.stage).toBe("Waiting for Payment");
    expect(after.currentStatus).toBe(
      "Payment Pending - Awaiting Proof of Payment (POP) from Applicant",
    );
    expect(after.licensed).toBe(false);
    expect((after.auths || []).length).toBe(0); // recorded when issued, not mid-pipeline
  });

  it("licenses a facility when a confirmed Use/Possession certificate is issued (renewal)", async () => {
    const unl = (await mockStore.listFacilities()).find((f) => !f.licensed)!;

    const res = await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "AUTH/USE.REN/0500",
          facilityId: unl.id,
          facilityName: unl.name,
          facilityStage: "Licence / Certificate Issued",
          currentStatus: "Renewal Licence Approved - Licences can be downloaded",
        }),
      ],
      "u",
    );

    expect(res.facilitiesUpdated).toBe(1);
    const after = (await mockStore.listFacilities()).find((f) => f.id === unl.id)!;
    expect(after.licensed).toBe(true);
    expect(after.stage).toBe("Licensed");
    // The licence is logged once: a dated event + an authorisation on record.
    expect(
      (after.auths || []).some(
        (a) =>
          a.number === "AUTH/USE.REN/0500" &&
          a.type === "Renewal of Use/Possession Licence",
      ),
    ).toBe(true);
    const events = await mockStore.listLicenceEvents();
    expect(
      events.some(
        (e) => e.number === "AUTH/USE.REN/0500" && e.facilityId === unl.id,
      ),
    ).toBe(true);
  });

  it("licenses a facility when a confirmed new Use/Possession certificate is issued", async () => {
    const unl = (await mockStore.listFacilities()).find((f) => !f.licensed)!;

    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "AUTH/USE.NEW/0101",
          ranType: "New Use Authorization",
          facilityId: unl.id,
          facilityName: unl.name,
          facilityStage: "Licence / Certificate Issued",
          currentStatus: "Licence Approved (Use) - Licence available",
        }),
      ],
      "u",
    );

    const after = (await mockStore.listFacilities()).find((f) => f.id === unl.id)!;
    expect(after.licensed).toBe(true);
    expect(after.stage).toBe("Licensed");
    expect(
      (after.auths || []).some(
        (a) => a.number === "AUTH/USE.NEW/0101" && a.type === "New Use/Possession Licence",
      ),
    ).toBe(true);
  });

  it("licenses a facility for a FORM-I number an officer classified as Use/Possession", async () => {
    const unl = (await mockStore.listFacilities()).find((f) => !f.licensed)!;

    await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "RPA/LIC/0815",
          ranType: "New Licence / Import",
          facilityId: unl.id,
          facilityName: unl.name,
          facilityStage: "Licence / Certificate Issued",
          officerType: "New Use/Possession Licence", // officer's confirmation
        }),
      ],
      "u",
    );

    const after = (await mockStore.listFacilities()).find((f) => f.id === unl.id)!;
    expect(after.licensed).toBe(true);
    expect(after.stage).toBe("Licensed");
  });

  it("is idempotent — re-accepting the same issued Use/Possession email does not double-record", async () => {
    const unl = (await mockStore.listFacilities()).find((f) => !f.licensed)!;
    const issued = () =>
      wf({
        ran: "AUTH/USE.REN/0777",
        facilityId: unl.id,
        facilityName: unl.name,
        facilityStage: "Licence / Certificate Issued",
        currentStatus: "Renewal Licence Approved - Licences can be downloaded",
      });

    await mockStore.saveLicenceWorkflows([issued()], "u");
    const second = await mockStore.saveLicenceWorkflows([issued()], "u");

    expect(second.facilitiesUpdated).toBe(0); // already licensed + auth on record
    const after = (await mockStore.listFacilities()).find((f) => f.id === unl.id)!;
    expect(after.licensed).toBe(true);
    expect(
      (after.auths || []).filter((a) => a.number === "AUTH/USE.REN/0777").length,
    ).toBe(1);
    const events = await mockStore.listLicenceEvents();
    expect(events.filter((e) => e.number === "AUTH/USE.REN/0777").length).toBe(1);
  });

  it("does not auto-record a renewal on an already-licensed facility from an issued email", async () => {
    const licensed = (await mockStore.listFacilities()).find((f) => f.licensed)!;
    const before = {
      stage: licensed.stage,
      auths: (licensed.auths || []).length,
    };

    const res = await mockStore.saveLicenceWorkflows(
      [
        wf({
          ran: "AUTH/USE.REN/0900",
          facilityId: licensed.id,
          facilityName: licensed.name,
          facilityStage: "Licence / Certificate Issued",
          currentStatus: "Renewal Licence Approved - Licences can be downloaded",
        }),
      ],
      "u",
    );

    expect(res.facilitiesUpdated).toBe(0);
    const after = (await mockStore.listFacilities()).find((f) => f.id === licensed.id)!;
    expect(after.licensed).toBe(true);
    expect(after.stage).toBe(before.stage); // stays "Licensed", not downgraded
    expect((after.auths || []).length).toBe(before.auths); // renewal stays manual
  });

  it("stamps firstSeen once and preserves the checklist across re-imports (the 44-day clock)", async () => {
    // First import: firstSeen derived from the parsed RAIS date (DD/MM/YYYY).
    await mockStore.saveLicenceWorkflows(
      [wf({ ran: "AUTH/USE.NEW/0500", lastSeen: "10/06/2026" })],
      "u",
    );
    let saved = (await mockStore.listLicenceWorkflows()).find(
      (w) => w.ran === "AUTH/USE.NEW/0500",
    )!;
    expect(saved.firstSeen).toBe("2026-06-10");

    // Officer records the completeness checklist on the tracked application.
    await mockStore.updateLicenceWorkflow(
      saved.id,
      { checklist: { "form-i": true }, completeReceivedAt: "2026-06-12" },
      "u",
    );

    // A later notification for the same RAN must not restart the clock or drop
    // the checklist.
    await mockStore.saveLicenceWorkflows(
      [wf({ ran: "AUTH/USE.NEW/0500", lastSeen: "01/07/2026", phase: "Review & Assessment" })],
      "u",
    );
    saved = (await mockStore.listLicenceWorkflows()).find(
      (w) => w.ran === "AUTH/USE.NEW/0500",
    )!;
    expect(saved.firstSeen).toBe("2026-06-10");
    expect(saved.checklist).toEqual({ "form-i": true });
    expect(saved.completeReceivedAt).toBe("2026-06-12");
  });
});
