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
    expect((after.auths || []).length).toBe(0); // recorded only at Mark Licensed
  });
});
