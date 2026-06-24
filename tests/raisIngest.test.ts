import { describe, it, expect } from "vitest";

import {
  addWorkflowsToRanMap,
  ingestDecision,
  linkByRan,
  linkFacilities,
  parseNotifications,
  ranMapFromFacilities,
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
// officer accepts the issued email (saveLicenceWorkflows licenses a confirmed
// Use/Possession certificate), with the Ready-to-license panel as a fallback.
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

describe("RAN-based linking (rescues no-facility emails)", () => {
  it("ranMapFromFacilities maps each recorded authorisation RAN to its facility", () => {
    const facilities = [
      fac({
        id: "brace",
        name: "Braceline",
        facCode: "FAC/0344",
        auths: [
          { type: "Renewal of Use/Possession Licence", number: "AUTH/USE.REN/0692", date: "" },
        ],
      }),
    ];
    const map = ranMapFromFacilities(facilities);
    expect(map.get("AUTH/USE.REN/0692")?.id).toBe("brace");
  });

  it("linkByRan fills a no-facility record from its RAN, leaving matched ones untouched", () => {
    const map = new Map([
      ["AUTH/USE.REN/0914", { id: "kcm", name: "KONKOLA COPPER MINE PLC", facCode: "" }],
    ]);
    const unmatched: LicenceWorkflow = { ...baseRecord, id: "a", ran: "AUTH/USE.REN/0914", facilityId: null, facilityName: "" };
    const matched: LicenceWorkflow = { ...baseRecord, id: "b", ran: "AUTH/USE.REN/0001", facilityId: "other", facilityName: "Other" };
    const [u, m] = linkByRan([unmatched, matched], map);
    expect(u.facilityId).toBe("kcm");
    expect(u.facilityName).toBe("KONKOLA COPPER MINE PLC");
    expect(u.matchScore).toBe(1);
    expect(m.facilityId).toBe("other"); // a real match is never overwritten
  });

  it("remembers a facility by application RAN and payment RAN from prior workflows", () => {
    const prior: LicenceWorkflow = {
      ...baseRecord,
      ran: "AUTH/USE.REN/1098",
      paymentRan: "AUTH/PAY/1042",
      facilityId: "kcm",
      facilityName: "KONKOLA",
    };
    const map = addWorkflowsToRanMap(new Map(), [prior]);
    expect(map.get("AUTH/USE.REN/1098")?.id).toBe("kcm");
    expect(map.get("AUTH/PAY/1042")?.id).toBe("kcm");
    // A later payment-only notification (cites only AUTH/PAY/1042) links itself.
    const pay: LicenceWorkflow = { ...baseRecord, id: "p", ran: "AUTH/PAY/1042", paymentRan: "AUTH/PAY/1042", facilityId: null, facilityName: "" };
    expect(linkByRan([pay], map)[0].facilityId).toBe("kcm");
  });

  it("rescues a board-approval email that names only a RAN (end to end)", () => {
    const facilities = [
      fac({
        id: "brace",
        name: "Braceline",
        facCode: "FAC/0344",
        auths: [
          { type: "Renewal of Use/Possession Licence", number: "AUTH/USE.REN/0692", date: "" },
        ],
      }),
    ];
    const f = feed(
      "BOARD APPROVAL REQUEST OF IONISING RADIATION LICENCE",
      "Hello,\nBOARD approval data form of AUTH/USE.REN/0692 has been assigned to you.",
    );
    const parsed = linkFacilities(parseNotifications(f), facilities);
    expect(parsed[0].facilityId).toBeNull(); // no facility name in the body
    const linked = linkByRan(parsed, ranMapFromFacilities(facilities));
    expect(linked[0].facilityId).toBe("brace");
    expect(linked[0].currentStatus).toBe("Pending Board Approval (FORM I)");
  });
});

describe("facility name extraction tolerates line-wrapped bodies", () => {
  it("extracts a facility name split across a hard-wrapped line", () => {
    // Gmail's getPlainBody() wraps long lines, which had split the name and
    // produced "(no facility name in email)".
    const f = feed(
      "Application Submission Form I data form assigned",
      "Hi,\n\nApplication Submission Form I data form of RPA/LIC/0606 MINEXEC (PTY)\nLIMITED process has been assigned to you. Please fill in the required information.",
    );
    const r = parseNotifications(f).find((x) => x.ran === "RPA/LIC/0606");
    expect(r?.facilityName).toBe("MINEXEC (PTY) LIMITED");
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
