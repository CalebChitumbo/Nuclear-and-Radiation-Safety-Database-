import { describe, it, expect } from "vitest";

import {
  ingestDecision,
  linkFacilities,
  parseNotifications,
} from "../lib/rules/parseNotifications";
import type { Facility, LicenceWorkflow } from "../lib/rules/types";

function fac(p: Partial<Facility> & { id: string; name: string }): Facility {
  return {
    no: 0,
    nameLower: p.name.toLowerCase(),
    district: "",
    province: "Lusaka",
    practice: "",
    sector: "Private",
    licensed: false,
    stage: "No Application Submitted",
    facCode: "",
    auths: [],
    ...p,
  } as Facility;
}

const baseRecord: LicenceWorkflow = {
  id: "wf-x",
  ran: "AUTH/USE.REN/1",
  ranType: "Use Authorization Renewal",
  facilityId: null,
  facilityName: "X",
  facCode: "",
  notificationTitle: "t",
  stage: "CEO Approval",
  phase: "Approval (CEO/Board)",
  responsibleParty: "CEO",
  priority: "CRITICAL",
  outstandingPayment: false,
  bottleneck: false,
  alerts: [],
  notifications: [],
  facilityStage: "CEO Licence Approval Required",
  lastSeen: "",
};

describe("ingestDecision", () => {
  it("queues when there is no facility match", () => {
    expect(ingestDecision({ ...baseRecord, facilityId: null })).toBe("review");
  });

  it("queues a weak match below the auto threshold", () => {
    expect(
      ingestDecision({ ...baseRecord, facilityId: "f1", matchScore: 0.5 }),
    ).toBe("review");
  });

  it("auto-applies a confident match", () => {
    expect(
      ingestDecision({ ...baseRecord, facilityId: "f1", matchScore: 0.95 }),
    ).toBe("auto");
  });

  it("queues an unclassified notification even if a facility was guessed", () => {
    expect(
      ingestDecision({
        ...baseRecord,
        facilityId: "f1",
        matchScore: 0.95,
        stage: "Unrecognized",
      }),
    ).toBe("review");
  });
});

describe("email feed partitioning", () => {
  const facilities = [
    fac({ id: "nfc", name: "NFC Africa Mining Plc", facCode: "FAC/0001" }),
  ];
  const feed = `Licence Approval CEO data form assigned
Licence Approval CEO data form of AUTH/USE.REN/0872 NFC Africa Mining Plc process has been assigned to you.
+ Show More
Submission of Invoice for Payment of Authorization
Facillity Name and RAN: KING SALMAN BIN ABDUL-AZIZ SPECIALIST HOSPITAL - FAC/0679
RAN of Authorization: RPA/LIC/0543`;

  const linked = linkFacilities(parseNotifications(feed), facilities);

  it("auto-applies the application whose facility is in the register", () => {
    const nfc = linked.find((r) => r.ran === "AUTH/USE.REN/0872");
    expect(nfc).toBeTruthy();
    expect(nfc!.facilityId).toBe("nfc");
    expect(ingestDecision(nfc!)).toBe("auto");
  });

  it("queues the application whose facility is not in the register", () => {
    const ks = linked.find((r) => r.facilityName.startsWith("KING SALMAN"));
    expect(ks).toBeTruthy();
    expect(ks!.facilityId).toBeNull();
    expect(ingestDecision(ks!)).toBe("review");
  });
});

// Real RAIS automated emails (sender eLicensing@rpa.gov.zm). The connector
// prepends the SUBJECT to the body before parsing, because the email's first
// line is "Hello," and the notification type lives in the subject.
describe("real RAIS email shapes", () => {
  const konkola = [fac({ id: "kcm", name: "KONKOLA COPPER MINE PLC" })];
  const feed = (subject: string, body: string) => `${subject}\n${body}`;

  it("auto-applies an 'Application Approved' email as Licence Issued", () => {
    const f = feed(
      "Renewal Ionising Radiation Licence Application Approved",
      [
        "Hello,",
        "Your Application for a renewal Ionising Radiation Licence has been Approved.",
        "Facility Name - KONKOLA COPPER MINE PLC",
        "Workflow RAN - AUTH/USE.REN/0935",
        "How to Access Your Certificate:",
        "Open your web browser and go to: https://rais.rpa.gov.zm/idp",
      ].join("\n"),
    );
    const [r] = linkFacilities(parseNotifications(f), konkola);
    expect(r.facilityName).toBe("KONKOLA COPPER MINE PLC");
    expect(r.ran).toBe("AUTH/USE.REN/0935");
    expect(r.phase).toBe("Licence Issued");
    expect(r.facilityStage).toBe("Licence / Certificate Issued");
    expect(r.facilityId).toBe("kcm");
    expect(ingestDecision(r)).toBe("auto");
  });

  it("auto-applies a 'Request Submitted successfully' email as Application Submitted", () => {
    const f = feed(
      "Renewal Ionising Radiation Licence Request Submitted successfully",
      [
        "Hello,",
        "Your application request for Renewal has been submitted successfully. Please wait for response from Authority.",
        "Facility Name - KONKOLA COPPER MINE PLC",
        "Workflow RAN - AUTH/USE.REN/0556",
        "Thank you,",
      ].join("\n"),
    );
    const [r] = linkFacilities(parseNotifications(f), konkola);
    expect(r.phase).toBe("Application");
    expect(r.facilityStage).toBe("Application Submitted");
    expect(ingestDecision(r)).toBe("auto");
  });

  it("queues a 'Payment Pending' email (no facility name in the body)", () => {
    const f = feed(
      "Payment Pending",
      [
        "Hello,",
        "Your payment for Ionising Radiation Licence application having RAN AUTH/USE.REN/0926 is pending.",
        "How to Access Your Invoice:",
      ].join("\n"),
    );
    const [r] = linkFacilities(parseNotifications(f), konkola);
    expect(r.ran).toBe("AUTH/USE.REN/0926");
    expect(r.phase).toBe("Payment");
    expect(r.outstandingPayment).toBe(true);
    expect(r.facilityId).toBeNull();
    expect(ingestDecision(r)).toBe("review");
  });
});
