import { describe, expect, it } from "vitest";
import { detectType } from "../lib/rules/detectType";

describe("detectType", () => {
  it("picks renewal from USE.REN", () => {
    expect(detectType("AUTH/USE.REN/0692", "New Use/Possession Licence")).toBe(
      "Renewal of Use/Possession Licence",
    );
  });

  it("picks new use from USE.NEW", () => {
    expect(
      detectType(
        "AUTH/USE.NEW/0101",
        "Renewal of Use/Possession Licence",
      ),
    ).toBe("New Use/Possession Licence");
  });

  it("picks importation", () => {
    expect(detectType("AUTH/IMP/0099", "New Use/Possession Licence")).toBe(
      "Importation Licence",
    );
  });

  it("picks export, transfer, transport, transit", () => {
    expect(detectType("AUTH/EXP/01", "New Use/Possession Licence")).toBe(
      "Export Licence",
    );
    expect(detectType("AUTH/TRANSF/01", "New Use/Possession Licence")).toBe(
      "Transfer Licence",
    );
    expect(detectType("AUTH/TRANSP/01", "New Use/Possession Licence")).toBe(
      "Transport Licence",
    );
    expect(detectType("AUTH/TRANSIT/01", "New Use/Possession Licence")).toBe(
      "Transit Licence",
    );
  });

  it("picks variation, design/construction, decommissioning", () => {
    expect(detectType("AUTH/VAR/01", "New Use/Possession Licence")).toBe(
      "Variation of Terms and Conditions",
    );
    expect(detectType("AUTH/DCL/01", "New Use/Possession Licence")).toBe(
      "Design and Construction Licence",
    );
    expect(detectType("AUTH/DCM/01", "New Use/Possession Licence")).toBe(
      "Decommissioning Licence",
    );
  });

  it("falls back when nothing matches", () => {
    expect(detectType("", "Renewal of Use/Possession Licence")).toBe(
      "Renewal of Use/Possession Licence",
    );
    expect(detectType("XYZ/123", "New Use/Possession Licence")).toBe(
      "New Use/Possession Licence",
    );
  });
});
