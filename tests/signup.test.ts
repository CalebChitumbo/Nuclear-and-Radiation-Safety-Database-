import { describe, expect, it } from "vitest";

import {
  MIN_PASSWORD_LENGTH,
  approvalPatch,
  canLogForOffice,
  newAccountRequest,
  normaliseOfficeName,
  officeOptions,
  pendingRequests,
  postedOffice,
  requiresInlandOffice,
  settledAccounts,
  validateSignup,
  type SignupInput,
} from "../lib/rules/signup";
import type { UserDoc } from "../lib/rules/types";

const NSSS = "Nuclear Safety, Security & Safeguards" as const;

function input(over: Partial<SignupInput> = {}): SignupInput {
  return {
    displayName: "Mutale Banda",
    email: "mutale.banda@rpa.gov.zm",
    section: "Authorisation & Standards",
    border: "",
    password: "correct-horse",
    confirmPassword: "correct-horse",
    ...over,
  };
}

describe("validateSignup", () => {
  it("accepts a complete request", () => {
    expect(validateSignup(input())).toEqual([]);
  });

  it("wants a name, an email and a section", () => {
    const problems = validateSignup(
      input({ displayName: " ", email: "not-an-email", section: "" }),
    );
    expect(problems).toHaveLength(3);
  });

  it("holds the password to the minimum length, and to itself", () => {
    expect(validateSignup(input({ password: "short", confirmPassword: "short" })))
      .toHaveLength(1);
    expect(
      validateSignup(input({ confirmPassword: "something-else" })),
    ).toEqual(["The two passwords do not match."]);
    expect("x".repeat(MIN_PASSWORD_LENGTH).length).toBe(MIN_PASSWORD_LENGTH);
  });

  it("refuses the cross-section posting — that is an administrator's to grant", () => {
    const problems = validateSignup(
      input({ section: "All" as unknown as SignupInput["section"] }),
    );
    expect(problems).toEqual(["Choose one of the department's sections."]);
  });

  it("asks an NSSS officer which inland office they are posted to", () => {
    expect(validateSignup(input({ section: NSSS }))).toEqual([
      "Name the inland office you are posted to — your screening figures are filed against it.",
    ]);
    expect(validateSignup(input({ section: NSSS, border: "Nakonde" }))).toEqual(
      [],
    );
  });

  it("asks no other section for one", () => {
    expect(requiresInlandOffice("Inspectorate")).toBe(false);
    expect(requiresInlandOffice(NSSS)).toBe(true);
    expect(validateSignup(input({ section: "Inspectorate" }))).toEqual([]);
  });
});

describe("normaliseOfficeName", () => {
  it("folds spelling and spacing onto the known office", () => {
    expect(normaliseOfficeName("  nakonde ")).toBe("Nakonde");
    expect(normaliseOfficeName("KAPIRI   MPOSHI")).toBe("Kapiri Mposhi");
  });

  it("keeps an office the log has never seen, tidied", () => {
    expect(normaliseOfficeName("  Kasumbalesa  ")).toBe("Kasumbalesa");
  });

  it("matches against a caller's list when one is given", () => {
    expect(normaliseOfficeName("mwami", ["Mwami"])).toBe("Mwami");
  });
});

describe("newAccountRequest", () => {
  it("is always a pending officer of one section", () => {
    const doc = newAccountRequest(input(), "uid-1", "2026-09-03T08:00:00.000Z");
    expect(doc).toEqual({
      uid: "uid-1",
      email: "mutale.banda@rpa.gov.zm",
      displayName: "Mutale Banda",
      role: "officer",
      section: "Authorisation & Standards",
      pending: true,
      disabled: false,
      origin: "self",
      requestedAt: "2026-09-03T08:00:00.000Z",
    });
  });

  it("carries the inland office for NSSS, normalised", () => {
    const doc = newAccountRequest(
      input({ section: NSSS, border: " nakonde " }),
      "uid-2",
    );
    expect(doc.border).toBe("Nakonde");
  });

  it("attaches no office to a section that has none", () => {
    const doc = newAccountRequest(
      input({ section: "Inspectorate", border: "Nakonde" }),
      "uid-3",
    );
    expect(doc.border).toBeUndefined();
  });

  it("lower-cases the email so the account is found however it was typed", () => {
    const doc = newAccountRequest(
      input({ email: " Mutale.Banda@RPA.gov.zm " }),
      "uid-4",
    );
    expect(doc.email).toBe("mutale.banda@rpa.gov.zm");
  });
});

describe("approvalPatch", () => {
  it("clears pending and records who granted it", () => {
    const patch = approvalPatch(
      { role: "officer", section: "Inspectorate" },
      "admin-1",
      "2026-09-04T09:00:00.000Z",
    );
    expect(patch).toEqual({
      role: "officer",
      section: "Inspectorate",
      border: "",
      pending: false,
      disabled: false,
      approvedAt: "2026-09-04T09:00:00.000Z",
      approvedBy: "admin-1",
    });
  });

  it("keeps the office only where the section has one", () => {
    expect(
      approvalPatch({ role: "officer", section: NSSS, border: "chirundu" }, "a")
        .border,
    ).toBe("Chirundu");
    expect(
      approvalPatch(
        { role: "officer", section: "Inspectorate", border: "Chirundu" },
        "a",
      ).border,
    ).toBe("");
  });

  it("lets an administrator correct what was asked for", () => {
    const patch = approvalPatch({ role: "admin", section: "All" }, "admin-1");
    expect(patch.role).toBe("admin");
    expect(patch.section).toBe("All");
    expect(patch.border).toBe("");
  });
});

describe("the office an account files against", () => {
  const posted: UserDoc = {
    uid: "u",
    email: "a@b.c",
    displayName: "Coordinator",
    role: "officer",
    section: NSSS,
    border: "Nakonde",
  };
  const headOffice: UserDoc = { ...posted, border: undefined };

  it("pins a posted coordinator to their own office", () => {
    expect(postedOffice(posted)).toBe("Nakonde");
    expect(canLogForOffice(posted, "Nakonde")).toBe(true);
    expect(canLogForOffice(posted, " nakonde ")).toBe(true);
    expect(canLogForOffice(posted, "Chirundu")).toBe(false);
  });

  it("leaves a head-office account free to file for any post", () => {
    expect(postedOffice(headOffice)).toBeNull();
    expect(canLogForOffice(headOffice, "Chirundu")).toBe(true);
    expect(canLogForOffice(null, "Chirundu")).toBe(true);
  });
});

describe("the approval queue", () => {
  const users: UserDoc[] = [
    {
      uid: "b",
      email: "b@rpa.gov.zm",
      displayName: "Second",
      role: "officer",
      section: "Inspectorate",
      pending: true,
      requestedAt: "2026-09-02T00:00:00.000Z",
    },
    {
      uid: "a",
      email: "a@rpa.gov.zm",
      displayName: "First",
      role: "officer",
      section: NSSS,
      pending: true,
      requestedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      uid: "c",
      email: "c@rpa.gov.zm",
      displayName: "Approved",
      role: "officer",
      section: "Inspectorate",
    },
    {
      uid: "d",
      email: "d@rpa.gov.zm",
      displayName: "Declined",
      role: "officer",
      section: "Inspectorate",
      pending: false,
      disabled: true,
    },
  ];

  it("is worked oldest first", () => {
    expect(pendingRequests(users).map((u) => u.uid)).toEqual(["a", "b"]);
  });

  it("keeps decided accounts out of it, declined ones included", () => {
    expect(settledAccounts(users).map((u) => u.uid)).toEqual(["c", "d"]);
  });

  it("treats an account written before sign-up existed as settled", () => {
    const legacy: UserDoc = {
      uid: "old",
      email: "old@rpa.gov.zm",
      displayName: "Existing Officer",
      role: "officer",
      section: "Authorisation & Standards",
    };
    expect(pendingRequests([legacy])).toEqual([]);
    expect(settledAccounts([legacy])).toEqual([legacy]);
  });
});

describe("officeOptions", () => {
  it("offers the eight inland offices of the screening log", () => {
    expect(officeOptions()).toEqual([
      "Chingola",
      "Chirundu",
      "Kapiri Mposhi",
      "Katete",
      "Livingstone",
      "Mongu",
      "Nakonde",
      "Ndola",
    ]);
  });

  it("folds in a register the caller supplies, without duplicating", () => {
    const options = officeOptions(["Kasumbalesa", "nakonde"]);
    expect(options).toContain("Kasumbalesa");
    expect(options.filter((o) => o === "Nakonde")).toHaveLength(1);
  });
});
