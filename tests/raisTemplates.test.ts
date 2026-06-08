import { describe, expect, it } from "vitest";

import { classifyEmail } from "../lib/rules/parseNotifications";
import {
  RAIS_TEMPLATES,
  STATUS_TO_STAGE,
  UNCLEAN_STATUSES,
  normalizeSubject,
} from "../lib/rules/raisTemplates";

const COMMON = RAIS_TEMPLATES.filter((t) => t.commonlyReceived);

describe("RAIS template table", () => {
  it("has 64 templates: 29 commonly received + 35 rare", () => {
    expect(RAIS_TEMPLATES).toHaveLength(64);
    expect(COMMON).toHaveLength(29);
    expect(RAIS_TEMPLATES.filter((t) => !t.commonlyReceived)).toHaveLength(35);
  });

  // The core acceptance test: each commonly-received subject classifies to its
  // exact canonical NewApplicationStatus.
  it.each(COMMON.map((t) => [t.subject, t.status] as const))(
    "classifies %j → %j",
    (subject, status) => {
      const m = classifyEmail({ subject, body: "" });
      expect(m.currentStatus).toBe(status);
    },
  );

  it("maps every template's stage consistently via STATUS_TO_STAGE", () => {
    for (const t of RAIS_TEMPLATES) {
      expect(t.stage).toBe(STATUS_TO_STAGE[t.status]);
    }
  });

  it("keeps the reviewed set of statuses without a clean Stage home", () => {
    expect([...UNCLEAN_STATUSES].sort()).toEqual(
      [
        "Data Form Assigned - Pending action by assigned party (stage = data-form name)",
        "Decommissioning Notice Form Assigned - Pending action",
        "Workflow Amended - New instance created",
        "Workflow Renewed - New instance created",
      ].sort(),
    );
  });
});

describe("normalizeSubject", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeSubject("  CEO APPROVAL: Request — IONISING!  ")).toBe(
      "ceo approval request ionising",
    );
  });

  it("collapses the double space in the Form I subject", () => {
    expect(normalizeSubject("New FORM I  Application request received")).toBe(
      "new form i application request received",
    );
  });
});

describe("the two 'Application Approved' templates (body collision)", () => {
  it("Form I vs Renewal are distinct on the exact subject alone", () => {
    expect(
      classifyEmail({
        subject: "Ionising Radiation Licence Application Approved",
        body: "",
      }).special,
    ).toBe("form-i-prompt");
    expect(
      classifyEmail({
        subject: "Renewal Ionising Radiation Licence Application Approved",
        body: "",
      }).special,
    ).toBe("renewal-auto");
  });

  it("the RAN type corrects a subject/RAN disagreement (USE.REN ⇒ renewal)", () => {
    const m = classifyEmail({
      subject: "Ionising Radiation Licence Application Approved",
      body: "",
      primaryRan: "AUTH/USE.REN/0935",
    });
    expect(m.special).toBe("renewal-auto");
    expect(m.currentStatus).toBe("Renewal Licence Approved - Licences can be downloaded");
  });

  it("a plain USE RAN keeps the Form I (new) row", () => {
    const m = classifyEmail({
      subject: "Renewal Ionising Radiation Licence Application Approved",
      body: "",
      primaryRan: "AUTH/USE.NEW/0101",
    });
    expect(m.special).toBe("form-i-prompt");
    expect(m.currentStatus).toBe("Licence Approved (Use) - Licence available");
  });
});

describe("withdrawal subjects (leading placeholder)", () => {
  it("matches a realized '<instance> Withdrawal' subject by suffix", () => {
    const m = classifyEmail({
      subject: "AUTH/USE/0123 Withdrawal",
      body: "The workflow instance has been withdrawn.",
    });
    expect(m.currentStatus).toBe("Workflow Withdrawn");
    expect(m.special).toBe("reset");
  });
});

describe("classifyEmail fallback seam", () => {
  it("falls back to the legacy regex rules for dashboard-paste titles", () => {
    // Not an email subject in the table — must still classify via RULES.
    const m = classifyEmail({
      subject: "Licence Approval CEO data form assigned",
      body: "Licence Approval CEO data form of AUTH/USE.REN/0872 process has been assigned to you.",
    });
    expect(m.phase).toBe("Approval (CEO/Board)");
    expect(m.stage).toBe("CEO Approval");
    expect(m.currentStatus).toBeUndefined();
  });

  it("returns UNRECOGNIZED for pure noise", () => {
    const m = classifyEmail({ subject: "Thank you, RAIS team", body: "" });
    expect(m.unrecognized).toBe(true);
  });
});
