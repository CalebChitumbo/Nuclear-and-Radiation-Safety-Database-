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
