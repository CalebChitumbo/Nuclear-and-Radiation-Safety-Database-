import { describe, expect, it } from "vitest";

import {
  isAmbiguousLicenceRan,
  isUsePossessionWorkflow,
  needsTypeClassification,
  workflowIssueDate,
  workflowLicenceType,
} from "../lib/rules/licenceFamily";

describe("workflowLicenceType", () => {
  it("reads the type straight off an unambiguous RAN", () => {
    expect(workflowLicenceType({ ran: "AUTH/USE.REN/0872" })).toBe(
      "Renewal of Use/Possession Licence",
    );
    expect(workflowLicenceType({ ran: "AUTH/USE.NEW/0101" })).toBe(
      "New Use/Possession Licence",
    );
    expect(workflowLicenceType({ ran: "AUTH/IMP/0099" })).toBe(
      "Importation Licence",
    );
    expect(workflowLicenceType({ ran: "AUTH/TRF/0008" })).toBe("Transfer Licence");
    expect(workflowLicenceType({ ran: "AUTH/VAR/0068" })).toBe(
      "Variation of Terms and Conditions",
    );
    expect(workflowLicenceType({ ran: "AUTH/EXP/0003" })).toBe("Export Licence");
  });

  it("falls back to the canonical status when the RAN carries no type token", () => {
    expect(
      workflowLicenceType({
        ran: "RPA/LIC/0543",
        currentStatus: "Import Application Received",
      }),
    ).toBe("Importation Licence");
    expect(
      workflowLicenceType({
        ran: "",
        currentStatus: "Transfer Approved - Certificate available",
      }),
    ).toBe("Transfer Licence");
  });

  it("defaults an ambiguous record to a (new) Use/Possession application", () => {
    // RPA/LIC FORM-I path with a type-agnostic status keeps driving the register.
    expect(
      workflowLicenceType({
        ran: "RPA/LIC/0606",
        currentStatus: "Payment Pending - Awaiting Proof of Payment (POP) from Applicant",
      }),
    ).toBe("New Use/Possession Licence");
    expect(workflowLicenceType({})).toBe("New Use/Possession Licence");
  });
});

describe("isUsePossessionWorkflow", () => {
  it("is true only for new/renewal Use/Possession applications", () => {
    expect(isUsePossessionWorkflow({ ran: "AUTH/USE.REN/0872" })).toBe(true);
    expect(isUsePossessionWorkflow({ ran: "AUTH/USE.NEW/0101" })).toBe(true);
    // Ambiguous FORM-I / generic pipeline emails default into the U/P pipeline.
    expect(isUsePossessionWorkflow({ ran: "RPA/LIC/0606" })).toBe(true);
  });

  it("is false for every standalone authorisation family", () => {
    for (const ran of [
      "AUTH/IMP/0099",
      "AUTH/EXP/0003",
      "AUTH/TRF/0008",
      "AUTH/TRANSP/0010",
      "AUTH/TRANSIT/0011",
      "AUTH/VAR/0068",
      "AUTH/DCL/0001",
      "AUTH/DEC/0002",
    ]) {
      expect(isUsePossessionWorkflow({ ran })).toBe(false);
    }
    expect(
      isUsePossessionWorkflow({
        ran: "RPA/LIC/0543",
        currentStatus: "Import Application Received",
      }),
    ).toBe(false);
  });
});

describe("officer-assigned type wins", () => {
  it("officerType overrides the RAN and status guess (both directions)", () => {
    // A FORM-I number the officer classified as an import.
    expect(
      workflowLicenceType({ ran: "RPA/LIC/0543", officerType: "Importation Licence" }),
    ).toBe("Importation Licence");
    expect(
      isUsePossessionWorkflow({
        ran: "RPA/LIC/0543",
        officerType: "Importation Licence",
      }),
    ).toBe(false);
    // And a number the officer pinned to Use/Possession stays in the pipeline.
    expect(
      isUsePossessionWorkflow({
        ran: "RPA/LIC/0543",
        officerType: "New Use/Possession Licence",
      }),
    ).toBe(true);
  });
});

describe("isAmbiguousLicenceRan", () => {
  it("flags RPA/LIC FORM-I numbers only", () => {
    expect(isAmbiguousLicenceRan("RPA/LIC/0543")).toBe(true);
    expect(isAmbiguousLicenceRan("RPA-LIC-0543")).toBe(true);
    expect(isAmbiguousLicenceRan("AUTH/USE.REN/0872")).toBe(false);
    expect(isAmbiguousLicenceRan("AUTH/IMP/0099")).toBe(false);
    expect(isAmbiguousLicenceRan("")).toBe(false);
  });
});

describe("needsTypeClassification", () => {
  it("flags an unclassified FORM-I number, and only that", () => {
    expect(needsTypeClassification({ ran: "RPA/LIC/0543" })).toBe(true);
    expect(
      needsTypeClassification({
        ran: "RPA/LIC/0543",
        officerType: "Importation Licence",
      }),
    ).toBe(false);
    expect(needsTypeClassification({ ran: "AUTH/IMP/0099" })).toBe(false);
    expect(needsTypeClassification({ ran: "AUTH/USE.REN/0872" })).toBe(false);
  });
});

describe("workflowIssueDate", () => {
  it("prefers the RAIS notification date (day-first)", () => {
    expect(workflowIssueDate({ lastSeen: "27/05/2026" })).toBe("2026-05-27");
    expect(workflowIssueDate({ lastSeen: "27-May-2026" })).toBe("2026-05-27");
  });

  it("falls back to the arrival timestamp, then today", () => {
    expect(
      workflowIssueDate({ lastSeen: "", receivedAt: "2026-06-03T08:00:00.000Z" }),
    ).toBe("2026-06-03");
    const today = new Date().toISOString().slice(0, 10);
    expect(workflowIssueDate({})).toBe(today);
  });
});
