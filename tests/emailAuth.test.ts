import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

import {
  senderAllowed,
  verifyMailgunSignature,
} from "../functions/src/rais/email";
import { todayISO } from "../lib/rules/week";

describe("senderAllowed", () => {
  it("admits everyone when no allowlist is configured", () => {
    expect(senderAllowed("anyone@evil.example", [])).toBe(true);
    expect(senderAllowed("", [])).toBe(true);
  });

  it("matches a bare domain, including subdomains", () => {
    const allow = ["rais.rpa.gov.zm"];
    expect(senderAllowed("noreply@rais.rpa.gov.zm", allow)).toBe(true);
    expect(senderAllowed("noreply@mail.rais.rpa.gov.zm", allow)).toBe(true);
    expect(senderAllowed("noreply@rpa.gov.zm", allow)).toBe(false);
    expect(senderAllowed("noreply@rais.rpa.gov.zm.evil.example", allow)).toBe(
      false,
    );
  });

  it("matches a full address exactly and parses display-name headers", () => {
    const allow = ["noreply@rais.rpa.gov.zm"];
    expect(
      senderAllowed('"RAIS System" <noreply@rais.rpa.gov.zm>', allow),
    ).toBe(true);
    expect(senderAllowed("other@rais.rpa.gov.zm", allow)).toBe(false);
  });

  it("rejects when a sender cannot be parsed but a list is configured", () => {
    expect(senderAllowed("", ["rais.rpa.gov.zm"])).toBe(false);
    expect(senderAllowed("not-an-email", ["rais.rpa.gov.zm"])).toBe(false);
  });
});

describe("verifyMailgunSignature freshness", () => {
  const key = "test-signing-key";
  const sign = (timestamp: string, token = "tok") => ({
    timestamp,
    token,
    signature: createHmac("sha256", key)
      .update(timestamp + token)
      .digest("hex"),
  });

  it("accepts a fresh, correctly signed request", () => {
    const now = 1_750_000_000_000;
    const sig = sign(String(Math.floor(now / 1000)));
    expect(verifyMailgunSignature(sig, key, now)).toBe(true);
  });

  it("rejects a replayed signature outside the freshness window", () => {
    const now = 1_750_000_000_000;
    const sig = sign(String(Math.floor(now / 1000) - 3600));
    expect(verifyMailgunSignature(sig, key, now)).toBe(false);
  });

  it("rejects a bad signature even when fresh", () => {
    const now = 1_750_000_000_000;
    const sig = {
      ...sign(String(Math.floor(now / 1000))),
      signature: "0".repeat(64),
    };
    expect(verifyMailgunSignature(sig, key, now)).toBe(false);
  });
});

describe("todayISO", () => {
  it("formats the LOCAL calendar date", () => {
    // 23:30 local on the 15th must stay the 15th regardless of what UTC says.
    const d = new Date(2026, 5, 15, 23, 30, 0);
    expect(todayISO(d)).toBe("2026-06-15");
  });

  it("pads single-digit months and days", () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
