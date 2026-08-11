import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

import {
  pickEmailText,
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

  // The allowlist that shipped in the docs blocked every real notification:
  // a domain entry admits SUBdomains, not parents, so "rais.rpa.gov.zm" never
  // matches the address RAIS actually sends from.
  it("admits the address RAIS really sends from via the rpa.gov.zm domain", () => {
    expect(senderAllowed("eLicensing@rpa.gov.zm", ["rpa.gov.zm"])).toBe(true);
    expect(senderAllowed("Melody.Mwewa@rpa.gov.zm", ["rpa.gov.zm"])).toBe(true);
    expect(senderAllowed("eLicensing@rpa.gov.zm", ["rais.rpa.gov.zm"])).toBe(
      false,
    );
  });
});

describe("pickEmailText sender extraction", () => {
  // Regression: the Apps Script used to post {subject, plain} with no sender.
  // With RAIS_ALLOWED_SENDERS configured that made senderAllowed("") reject
  // every email at a 200, so the review inbox stayed permanently empty.
  it("reads the sender the Apps Script now posts", () => {
    const { subject, text, from } = pickEmailText({
      subject: "Ionising Radiation Licence Application Approved",
      plain: "Hello,\nWorkflow RAN - RPA/LIC/0593",
      from: "RAIS eLicensing <eLicensing@rpa.gov.zm>",
    });
    expect(subject).toBe("Ionising Radiation Licence Application Approved");
    expect(text).toContain("RPA/LIC/0593");
    expect(from).toBe("RAIS eLicensing <eLicensing@rpa.gov.zm>");
    expect(senderAllowed(from, ["rpa.gov.zm"])).toBe(true);
  });

  it("falls back to header and SMTP-envelope senders", () => {
    expect(pickEmailText({ headers: { from: "a@rpa.gov.zm" } }).from).toBe(
      "a@rpa.gov.zm",
    );
    expect(pickEmailText({ headers: { From: "b@rpa.gov.zm" } }).from).toBe(
      "b@rpa.gov.zm",
    );
    expect(pickEmailText({ envelope: { from: "c@rpa.gov.zm" } }).from).toBe(
      "c@rpa.gov.zm",
    );
  });

  it("still reports no sender when the payload genuinely carries none", () => {
    expect(pickEmailText({ subject: "s", plain: "b" }).from).toBe("");
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
