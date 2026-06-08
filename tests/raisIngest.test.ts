import { describe, it, expect } from "vitest";

import {
  ingestDecision,
  linkFacilities,
  parseNotifications,
} from "../lib/rules/parseNotifications";
import { recordLicence } from "../lib/rules/recordLicence";
import type { Facility, LicenceWorkflow, WeekDef } from "../lib/rules/types";

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

  it("auto-applies a 'Request Submitted successfully' email as Invoice Request Generation Pending", () => {
    // Per the RPA template mapping (row 119) a successfully submitted request
    // means the applicant must next generate the invoice request — the canonical
    // status is "Invoice Request Generation Pending", not the old coarse
    // "Application Submitted".
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
    expect(r.phase).toBe("Payment");
    expect(r.facilityStage).toBe("Invoice Generation Pending");
    expect(r.currentStatus).toBe("Invoice Request Generation Pending");
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

  it("maps 'Invoice Request Generator' to Invoice Generation Pending", () => {
    const f = feed(
      "INVOICE REQUEST GENERATOR",
      "Facility Name - KONKOLA COPPER MINE PLC\nWorkflow RAN - AUTH/USE.REN/0700",
    );
    const [r] = parseNotifications(f);
    expect(r.phase).toBe("Payment");
    expect(r.facilityStage).toBe("Invoice Generation Pending");
  });

  it("maps 'Additional Information Required' to Further Information Required", () => {
    const f = feed(
      "Additional Information Required",
      "Facility Name - KONKOLA COPPER MINE PLC\nWorkflow RAN - AUTH/USE.REN/0701",
    );
    const [r] = parseNotifications(f);
    expect(r.phase).toBe("Review & Assessment");
    expect(r.facilityStage).toBe(
      "Under Internal Review (Further Information Required)",
    );
  });
});

// ---------------------------------------------------------------------------
// The two licence-issuing special cases (spec §4) — parsed flag → recordLicence.
// The connector never flips `licensed`; that happens through R1–R6 when the
// officer approves in the Ready-to-license panel.
// ---------------------------------------------------------------------------

const weeks: WeekDef[] = [
  { label: "W23 — wk of 1 Jun 2026", start: "2026-06-01", end: "2026-06-05" },
];
const konkola = [fac({ id: "kcm", name: "KONKOLA COPPER MINE PLC" })];
const feed = (subject: string, body: string) => `${subject}\n${body}`;

describe("Renewal Approved → Licensed via recordLicence (§4a)", () => {
  it("flags the record renewal-auto and records as a Use/Possession renewal", () => {
    const f = feed(
      "Renewal Ionising Radiation Licence Application Approved",
      "Your Application for a renewal Ionising Radiation Licence has been Approved.\nFacility Name - KONKOLA COPPER MINE PLC\nWorkflow RAN - AUTH/USE.REN/0935",
    );
    const [r] = linkFacilities(parseNotifications(f), konkola);
    expect(r.special).toBe("renewal-auto");
    expect(r.currentStatus).toBe("Renewal Licence Approved - Licences can be downloaded");
    expect(r.facilityStage).toBe("Licence / Certificate Issued");
    expect(ingestDecision(r)).toBe("auto");

    const m = recordLicence({
      facility: fac({ id: "kcm", name: "KONKOLA COPPER MINE PLC" }),
      number: r.ran,
      type: "Renewal of Use/Possession Licence",
      date: "2026-06-03",
      weeks,
      uid: "u",
      newEventId: "e1",
    });
    expect(m.effect).toBe("becomes-licensed");
    expect(m.facilityWrite.licensed).toBe(true);
    expect(m.facilityWrite.stage).toBe("Licensed");
    expect(m.event.type).toBe("Renewal of Use/Possession Licence");
  });
});

describe("Form I Approved → officer confirms the type (§4b)", () => {
  const parsed = () => {
    const f = feed(
      "Ionising Radiation Licence Application Approved",
      "Your Application for an Ionising Radiation Licence has been Approved.\nFacility Name - KONKOLA COPPER MINE PLC\nWorkflow RAN - AUTH/USE.NEW/0101",
    );
    return linkFacilities(parseNotifications(f), konkola)[0];
  };

  it("flags the record form-i-prompt", () => {
    const r = parsed();
    expect(r.special).toBe("form-i-prompt");
    expect(r.currentStatus).toBe("Licence Approved (Use) - Licence available");
    expect(r.facilityStage).toBe("Licence / Certificate Issued");
  });

  it("Yes → New Use/Possession → Licensed", () => {
    const r = parsed();
    const m = recordLicence({
      facility: fac({ id: "kcm", name: "KONKOLA COPPER MINE PLC" }),
      number: r.ran,
      type: "New Use/Possession Licence",
      date: "2026-06-03",
      weeks,
      uid: "u",
      newEventId: "e2",
    });
    expect(m.effect).toBe("becomes-licensed");
    expect(m.facilityWrite.licensed).toBe(true);
  });

  it("No → Import → authorisation recorded, NOT licensed", () => {
    const r = parsed();
    const m = recordLicence({
      facility: fac({ id: "kcm", name: "KONKOLA COPPER MINE PLC" }),
      number: r.ran,
      type: "Importation Licence",
      date: "2026-06-03",
      weeks,
      uid: "u",
      newEventId: "e3",
    });
    expect(m.facilityWrite.licensed).toBe(false);
    expect(m.facilityWrite.auths.some((a) => a.type === "Importation Licence")).toBe(true);
  });
});

describe("resets and weak matches", () => {
  it("classifies a rejection as a reset and queues it when no facility matches", () => {
    const f = feed(
      "Use Authorization Application Rejected",
      "Your Application for Use Authorization has been rejected.\nWorkflow RAN - AUTH/USE.NEW/0202",
    );
    const [r] = linkFacilities(parseNotifications(f), konkola);
    expect(r.special).toBe("reset");
    expect(r.currentStatus).toBe("Application Rejected (Use)");
    expect(r.facilityStage).toBe("Application Returned / Rejected");
    expect(r.facilityId).toBeNull();
    expect(ingestDecision(r)).toBe("review");
  });
});
