"use client";

/**
 * Ask for an account.
 *
 * The form collects what an administrator would otherwise have had to ask for
 * over the phone: your name, your work email, the section you fall under and —
 * if you are Nuclear Safety, Security & Safeguards — the inland office you are
 * posted to. Submitting creates the sign-in and files the request; an
 * administrator approves it before it can see anything.
 *
 * The inland office is the part that matters beyond access. An NSSS officer's
 * screening figures are filed against their office and no other, so the
 * national count is the sum of the offices rather than a number anyone can
 * enter anywhere. That is why the office is asked for here rather than left to
 * a picker on the capture screen.
 */

import { useMemo, useState } from "react";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import {
  MIN_PASSWORD_LENGTH,
  officeOptions,
  requiresInlandOffice,
  validateSignup,
  type SignupInput,
} from "@/lib/rules/signup";
import { SECTIONS, type Section } from "@/lib/rules/types";

const OTHER_OFFICE = "__other__";

export default function SignupPage() {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [section, setSection] = useState<Section | "">("");
  const [officeChoice, setOfficeChoice] = useState("");
  const [otherOffice, setOtherOffice] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offices = useMemo(() => officeOptions(), []);
  const needsOffice = requiresInlandOffice(section);
  const border =
    officeChoice === OTHER_OFFICE ? otherOffice : officeChoice;

  const input: SignupInput = {
    displayName,
    email,
    section,
    border,
    password,
    confirmPassword,
  };
  // Problems are only shown once the form has been submitted — a half-typed
  // password is not a mistake worth shouting about.
  const problems = validateSignup(input);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (problems.length) return;
    setLoading(true);
    setError(null);
    try {
      await signUp(input);
      // The auth provider moves us to the waiting screen from here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 py-8 sm:py-12">
      <div className="w-full max-w-md card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Logo size={56} />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
              Request an account
            </h1>
            <p className="caps text-[10px] text-gunmetal/60">
              Nuclear &amp; Radiation Safety Department
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-6 sm:mt-8 space-y-4">
          <div>
            <label className="field-label" htmlFor="su-name">
              Full name
            </label>
            <input
              id="su-name"
              required
              autoFocus
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
              placeholder="e.g. Mutale Banda"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="su-email">
              Work email
            </label>
            <input
              id="su-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="your.name@rpa.gov.zm"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="su-section">
              Which section do you fall under?
            </label>
            <select
              id="su-section"
              className="input"
              value={section}
              onChange={(e) => {
                setSection(e.target.value as Section | "");
                setOfficeChoice("");
                setOtherOffice("");
              }}
            >
              <option value="">Choose your section…</option>
              {SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {needsOffice ? (
            <div className="inset p-4 space-y-3">
              <div>
                <label className="field-label" htmlFor="su-office">
                  Which inland office are you posted to?
                </label>
                <select
                  id="su-office"
                  className="input"
                  value={officeChoice}
                  onChange={(e) => setOfficeChoice(e.target.value)}
                >
                  <option value="">Choose your office…</option>
                  {offices.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  <option value={OTHER_OFFICE}>Another office…</option>
                </select>
              </div>
              {officeChoice === OTHER_OFFICE ? (
                <div>
                  <label className="field-label" htmlFor="su-office-other">
                    Name of the office
                  </label>
                  <input
                    id="su-office-other"
                    className="input"
                    value={otherOffice}
                    onChange={(e) => setOtherOffice(e.target.value)}
                    placeholder="e.g. Kasumbalesa"
                  />
                  <p className="text-[11px] text-gunmetal/60 mt-1.5">
                    It will be added to the register when your account is
                    approved.
                  </p>
                </div>
              ) : null}
              <p className="text-[11px] text-gunmetal/60">
                Every vehicle you screen and every daily figure you post is
                recorded against this office, so the national total adds up
                office by office.
              </p>
            </div>
          ) : null}

          <div>
            <label className="field-label" htmlFor="su-password">
              Password
            </label>
            <input
              id="su-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="su-confirm">
              Confirm password
            </label>
            <input
              id="su-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </div>

          {submitted && problems.length ? (
            <ul role="alert" className="inset p-3 space-y-1">
              {problems.map((p) => (
                <li key={p} className="text-xs" style={{ color: "var(--status-stalled)" }}>
                  {p}
                </li>
              ))}
            </ul>
          ) : null}

          {error ? (
            <div role="alert" className="chip red w-full justify-center">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? "Sending the request…" : "Request an account"}
          </button>
        </form>

        <p className="mt-6 text-[11px] text-gunmetal/55 text-center">
          An administrator approves every request before it can see the
          register.{" "}
          <Link className="link-action" href="/login">
            Already have an account?
          </Link>
        </p>
      </div>
    </div>
  );
}
