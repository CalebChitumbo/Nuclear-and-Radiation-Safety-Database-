import { describe, expect, it } from "vitest";

import {
  buildReport,
  classifyNotification,
  extractFacility,
  linkFacilities,
  parseNotifications,
  ranTypeLabel,
  splitBlocks,
} from "../lib/rules/parseNotifications";
import type { Facility } from "../lib/rules/types";

const mk = (name: string, facCode = ""): Facility => ({
  id: facCode ? facCode.toLowerCase().replace(/\W+/g, "-") : name.toLowerCase().replace(/\W+/g, "-"),
  no: 0,
  name,
  nameLower: name.toLowerCase(),
  district: "",
  province: "Lusaka",
  practice: "",
  sector: "Private",
  functional: true,
  category: "Medical",
  licensed: false,
  stage: "No Application Submitted",
  facCode,
  auths: [],
});

describe("classifyNotification", () => {
  it("maps CEO approval to a critical approval phase", () => {
    const m = classifyNotification("Licence Approval CEO data form assigned");
    expect(m.phase).toBe("Approval (CEO/Board)");
    expect(m.priority).toBe("CRITICAL");
    expect(m.stage).toBe("CEO Approval");
  });

  it("maps board approval", () => {
    expect(classifyNotification("RPA Board Licence Approval data form assigned").stage).toBe(
      "Board Approval",
    );
  });

  it("maps payment-pending to an outstanding-payment applicant task", () => {
    const m = classifyNotification("Payment Pending");
    expect(m.phase).toBe("Payment");
    expect(m.outstandingPayment).toBe(true);
    expect(m.priority).toBe("APPLICANT");
  });

  it("accounts clearance clears payment", () => {
    expect(classifyNotification("Accounts Clearance data form assigned").clearsPayment).toBe(true);
  });

  it("review-and-assessment report is a bottleneck", () => {
    expect(
      classifyNotification("Review and Assessment Report data form assigned").bottleneck,
    ).toBe(true);
  });

  it("blank and contentless titles are unrecognized", () => {
    expect(classifyNotification("").unrecognized).toBe(true);
    // The empty RAIS "data form assigned" rows carry no workflow signal.
    expect(classifyNotification("data form assigned").unrecognized).toBe(true);
    // But a real titled notification classifies to a concrete stage.
    expect(classifyNotification("Accounts Clearance data form assigned").stage).toBe(
      "Accounts Clearance",
    );
  });
});

describe("ranTypeLabel", () => {
  it("labels the common formats", () => {
    expect(ranTypeLabel("AUTH/USE.REN/0872")).toBe("Use Authorization Renewal");
    expect(ranTypeLabel("AUTH/PAY/0980")).toBe("Payment");
    expect(ranTypeLabel("AUTH/VAR/0064")).toBe("Variation of Terms");
    expect(ranTypeLabel("RPA/LIC/0550")).toBe("New Licence / Import");
    expect(ranTypeLabel("RA/0797")).toBe("Review & Assessment");
    expect(ranTypeLabel("INSP/AUTH/0017")).toBe("Inspection");
    expect(ranTypeLabel("AUTH-DEC-0022")).toBe("Decommission");
  });
});

describe("extractFacility", () => {
  it("reads the 'data form of <RAN> <NAME> process' shape", () => {
    expect(
      extractFacility(
        "Licence Approval CEO data form of AUTH/USE.REN/0872 NFC Africa Mining Plc process has been assigned to you.",
      ).name,
    ).toBe("NFC Africa Mining Plc");
  });

  it("reads 'Facility Name - <NAME>'", () => {
    expect(extractFacility("Facility Name - CANCER DISEASES HOSPITAL").name).toBe(
      "CANCER DISEASES HOSPITAL",
    );
  });

  it("reads 'Facillity Name and RAN: <NAME> - FAC/####' and the FAC code", () => {
    const f = extractFacility(
      "Facillity Name and RAN: KING SALMAN BIN ABDUL-AZIZ SPECIALIST HOSPITAL - FAC/0679",
    );
    expect(f.name).toBe("KING SALMAN BIN ABDUL-AZIZ SPECIALIST HOSPITAL");
    expect(f.facCode).toBe("FAC/0679");
  });

  it("reads 'working in <NAME> Facility on'", () => {
    expect(
      extractFacility(
        "A new Form I Request has been received from Phaniso Mwale working in CHIFUBU LEVEL 1 HOSPITAL Facility on 07/01/2026.",
      ).name,
    ).toBe("CHIFUBU LEVEL 1 HOSPITAL");
  });

  it("normalises doubled quotes", () => {
    expect(extractFacility("Facility Name - ST. LUKE''S MISSION HOSPITAL").name).toBe(
      "ST. LUKE'S MISSION HOSPITAL",
    );
  });
});

describe("splitBlocks", () => {
  it("splits on + Show More", () => {
    expect(splitBlocks("a\n+ Show More\nb\n+ Show More\nc")).toEqual(["a", "b", "c"]);
  });
});

// The full real dashboard the officer pasted, trimmed to the cases we assert on
// but kept verbatim so the parser is exercised against true RAIS text.
const REAL = `Licence Approval CEO data form assigned
Licence Approval CEO data form of AUTH/USE.REN/0872 NFC Africa Mining Plc process has been assigned to you.
+ Show More
Conditions for Renewal Licence Application
This is to inform you that the Radiation Protection Authority has issued Authorization Terms for this application.
Facility Name - NFC Africa Mining Plc
Workflow RAN - AUTH/USE.REN/0872
+ Show More
Internal Review Remarks data form assigned
Internal Review Remarks data form of RA/0794 KING SALMAN BIN ABDUL-AZIZ SPECIALIST HOSPITAL process has been assigned to you.
+ Show More
Submission of Invoice for Payment of Authorization
Facillity Name and RAN: KING SALMAN BIN ABDUL-AZIZ SPECIALIST HOSPITAL - FAC/0679
RAN of Authorization: RPA/LIC/0543
+ Show More
Payment Pending
Your payment for Authorization application having RAN RPA/LIC/0543 is pending. You can download the Invoice attached in Payment Workflow having RAN - AUTH/PAY/0978
+ Show More
RPA Board Licence Approval data form assigned
RPA Board Licence Approval data form of RPA/LIC/0345 KASIMS MEDICAL CENTER process has been assigned to you.
+ Show More
Confirm Payment data form assigned
Confirm Payment data form of AUTH/PAY/0980 St. DOMINICS MISSION HOSPITAL process has been assigned to you.
+ Show More
Submission of Invoice for Payment of Authorization
Facillity Name and RAN: St. DOMINICS MISSION HOSPITAL - FAC/0050
RAN of Authorization: AUTH/VAR/0064
+ Show More
Payment Pending
Your payment for Authorization application having RAN AUTH/VAR/0064 is pending. You can download the Invoice attached in Payment Workflow having RAN - AUTH/PAY/0980
+ Show More
Accounts Clearance data form assigned
Accounts Clearance data form of AUTH/VAR/0068 UNIVERSITY TEACHING HOSPITAL- NUCLEAR MEDICINE process has been assigned to you.
+ Show More
Review and Assessment Report data form assigned
Review and Assessment Report data form of RA/0900 SOME BOTTLENECK HOSPITAL process has been assigned to you.
+ Show More
data form assigned
data form of process has been assigned to you.
+ Show More
Inspection Scope data form assigned
Inspection Scope data form of INSP/AUTH/0017 MEDIHEAL DIAGNOSTIC CENTRE process has been assigned to you.`;

describe("parseNotifications — real dashboard", () => {
  const records = parseNotifications(REAL);
  const byRan = (ran: string) => records.find((r) => r.ran === ran);

  it("groups CEO approval + its conditions into one AUTH/USE.REN/0872 record at the approval phase", () => {
    const r = byRan("AUTH/USE.REN/0872");
    expect(r).toBeTruthy();
    expect(r!.phase).toBe("Approval (CEO/Board)");
    expect(r!.stage).toBe("CEO Approval");
    expect(r!.facilityName).toBe("NFC Africa Mining Plc");
    // both notifications captured
    expect(r!.notifications.length).toBeGreaterThanOrEqual(2);
  });

  it("flags KING SALMAN's review as payment-blocked (CRITICAL + wait alert)", () => {
    const r = byRan("RA/0794");
    expect(r).toBeTruthy();
    expect(r!.priority).toBe("CRITICAL");
    expect(r!.alerts.join(" ")).toMatch(/wait for payment clearance/i);
  });

  it("treats St Dominic's as awaiting proof of payment", () => {
    const r = byRan("AUTH/VAR/0064");
    expect(r).toBeTruthy();
    expect(r!.outstandingPayment).toBe(true);
    expect(r!.phase).toBe("Payment");
  });

  it("recognises the board approval", () => {
    expect(byRan("RPA/LIC/0345")!.stage).toBe("Board Approval");
  });

  it("marks the evaluation report as a bottleneck", () => {
    expect(byRan("RA/0900")!.bottleneck).toBe(true);
  });

  it("buckets the blank 'data form of process' block as unrecognized without throwing", () => {
    const unrec = records.filter((r) => r.stage === "Unrecognized");
    expect(unrec.length).toBeGreaterThanOrEqual(1);
  });

  it("parses inspection RANs", () => {
    expect(byRan("INSP/AUTH/0017")!.phase).toBe("Inspection");
  });
});

describe("linkFacilities", () => {
  it("links by exact FAC code and by fuzzy name", () => {
    const facilities = [
      mk("King Salman Bin Abdul-Aziz Specialist Hospital", "FAC/0679"),
      mk("NFC Africa Mining Plc", "FAC/0100"),
    ];
    const records = parseNotifications(REAL);
    const linked = linkFacilities(records, facilities);
    const ks = linked.find((r) => r.ran === "RA/0794");
    expect(ks?.facilityId).toBe("fac-0679");
    const nfc = linked.find((r) => r.ran === "AUTH/USE.REN/0872");
    expect(nfc?.facilityId).toBe("fac-0100");
  });
});

describe("buildReport", () => {
  it("counts by priority and surfaces alerts", () => {
    const report = buildReport(parseNotifications(REAL));
    expect(report.byPriority.CRITICAL.length).toBeGreaterThan(0);
    expect(report.alerts.some((a) => /wait for payment/i.test(a))).toBe(true);
    expect(report.roleTasks.some((t) => t.role === "CEO")).toBe(true);
  });
});
