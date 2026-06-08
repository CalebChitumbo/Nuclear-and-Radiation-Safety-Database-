import { describe, expect, it } from "vitest";

import {
  parseRaisDate,
  resolveFacilityStatus,
  shouldSupersede,
  type SupersedeInput,
} from "../lib/rules/supersede";
import type { LicenceWorkflow, NewApplicationStatus } from "../lib/rules/types";

// ISO timestamps in ascending order (email arrival order).
const T1 = "2026-06-01T08:00:00.000Z";
const T2 = "2026-06-02T08:00:00.000Z";
const T3 = "2026-06-03T08:00:00.000Z";

const inv: SupersedeInput = {
  receivedAt: T1,
  phase: "Payment",
  currentStatus: "Invoice Request Generation Pending",
};
const pay: SupersedeInput = {
  receivedAt: T2,
  phase: "Payment",
  currentStatus: "Payment Pending - Awaiting Proof of Payment (POP) from Applicant",
};
const acc: SupersedeInput = {
  receivedAt: T3,
  phase: "Accounts Clearance",
  currentStatus: undefined,
};

describe("parseRaisDate", () => {
  it("parses DD/MM/YYYY as day-first (Zambia/RAIS convention)", () => {
    // 02/01 = 2 Jan must be earlier than 01/02 = 1 Feb.
    expect(parseRaisDate("02/01/2026")).toBeLessThan(parseRaisDate("01/02/2026"));
    expect(parseRaisDate("13/01/2026")).toBe(Date.UTC(2026, 0, 13));
  });

  it("parses D-MMM-YYYY", () => {
    expect(parseRaisDate("27-May-2026")).toBe(Date.UTC(2026, 4, 27));
  });

  it("returns NaN for empty/garbage", () => {
    expect(Number.isNaN(parseRaisDate(""))).toBe(true);
    expect(Number.isNaN(parseRaisDate("not a date"))).toBe(true);
  });
});

describe("shouldSupersede", () => {
  it("first sighting always supersedes", () => {
    expect(shouldSupersede(null, inv)).toBe(true);
  });

  it("advances Invoice → Payment → Accounts on each newer email", () => {
    expect(shouldSupersede(inv, pay)).toBe(true);
    expect(shouldSupersede(pay, acc)).toBe(true);
  });

  it("does not regress on a stale earlier email", () => {
    expect(shouldSupersede(acc, inv)).toBe(false); // Accounts already shown
    expect(shouldSupersede(pay, inv)).toBe(false);
  });

  it("treats a same-status re-send as an idempotent duplicate", () => {
    // Even with a later receivedAt (the connector restamps every delivery).
    expect(shouldSupersede(pay, { ...pay, receivedAt: T3 })).toBe(false);
  });

  it("honours a genuine reset that is the newest event", () => {
    const approved: SupersedeInput = {
      receivedAt: T2,
      phase: "Licence Issued",
      currentStatus: "Licence Approved (Use) - Licence available",
    };
    const rejection: SupersedeInput = {
      receivedAt: T3,
      phase: "Other",
      currentStatus: "Application Rejected (Use)",
      special: "reset",
    };
    expect(shouldSupersede(approved, rejection)).toBe(true);
    // …but an older reset must not pull a newer status backward.
    expect(
      shouldSupersede(approved, { ...rejection, receivedAt: T1 }),
    ).toBe(false);
  });

  it("breaks a same-instant tie by pipeline rank (reset wins outright)", () => {
    const a: SupersedeInput = { receivedAt: T2, phase: "Payment", currentStatus: "Invoice Request Generation Pending" };
    const later: SupersedeInput = { receivedAt: T2, phase: "Approval (CEO/Board)", currentStatus: "CEO approval pending" };
    expect(shouldSupersede(a, later)).toBe(true); // later phase, same instant
    const reset: SupersedeInput = { receivedAt: T2, phase: "Other", currentStatus: "Workflow Withdrawn", special: "reset" };
    expect(shouldSupersede(later, reset)).toBe(true); // reset wins the tie
  });
});

// ---------------------------------------------------------------------------
// resolveFacilityStatus
// ---------------------------------------------------------------------------

let n = 0;
function wf(p: Partial<LicenceWorkflow> & { currentStatus?: NewApplicationStatus }): LicenceWorkflow {
  return {
    id: `wf-${n++}`,
    ran: "AUTH/USE/0001",
    ranType: "New Use Authorization",
    facilityId: "fac-1",
    facilityName: "Acme Hospital",
    facCode: "",
    notificationTitle: "",
    stage: p.currentStatus || "",
    phase: "Payment",
    responsibleParty: "Applicant",
    priority: "APPLICANT",
    outstandingPayment: false,
    bottleneck: false,
    alerts: [],
    notifications: [],
    facilityStage: "Waiting for Payment",
    lastSeen: "",
    ...p,
  };
}

describe("resolveFacilityStatus", () => {
  it("picks the most recent applicable workflow by receivedAt", () => {
    const workflows = [
      wf({ receivedAt: T1, currentStatus: "Invoice Request Generation Pending", facilityStage: "Invoice Generation Pending" }),
      wf({ receivedAt: T3, phase: "Accounts Clearance", facilityStage: "Accounts Clearance Pending" }),
      wf({ receivedAt: T2, currentStatus: "Payment Pending - Awaiting Proof of Payment (POP) from Applicant", facilityStage: "Waiting for Payment" }),
    ];
    const r = resolveFacilityStatus(workflows);
    expect(r?.stage).toBe("Accounts Clearance Pending"); // T3 wins
  });

  it("surfaces the canonical status + its mapped Stage", () => {
    const r = resolveFacilityStatus([
      wf({ receivedAt: T2, currentStatus: "Payment Pending - Awaiting Proof of Payment (POP) from Applicant" }),
      wf({ receivedAt: T1, currentStatus: "Invoice Request Generation Pending" }),
    ]);
    expect(r?.currentStatus).toBe("Payment Pending - Awaiting Proof of Payment (POP) from Applicant");
    expect(r?.stage).toBe("Waiting for Payment");
  });

  it("returns null for an empty set", () => {
    expect(resolveFacilityStatus([])).toBeNull();
  });
});
