/**
 * Self-service sign-up — the rules an account request is held to.
 *
 * Accounts used to be typed in one at a time by an administrator. There are
 * more officers than that scales to, so anyone may now ask for an account
 * themselves; what an administrator does is approve it. The request therefore
 * has to be able to say everything the administrator would otherwise have had
 * to ask: who you are, which section you report under, and — for the Nuclear
 * Safety, Security & Safeguards section — which inland office you are posted
 * to, because that is the office your screening figures will be filed against.
 *
 * Two rules make this safe to leave open:
 *
 * 1. A request is always for an ordinary officer of ONE section. There is no
 *    way to ask for `admin`, and no way to ask for the cross-section "All"
 *    posting — those stay an administrator's to grant.
 * 2. A request grants nothing on its own. It is stored `pending`, and while it
 *    is pending the account carries no role or section claims at all, so the
 *    security rules deny it every collection (see firestore.rules).
 *
 * Everything here is pure so the same checks run on the form, in the store, and
 * in tests.
 */

import { NSSS_SECTION } from "./daily";
import { INLAND_OFFICES, SECTIONS, type Section, type UserDoc } from "./types";

/**
 * Shortest password a self-registered account may set. Firebase Auth's own
 * floor is six; this is a regulatory register, so the form asks for more.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** What the sign-up form collects. */
export interface SignupInput {
  email: string;
  displayName: string;
  section: Section | "";
  /** The inland office — required for NSSS, ignored for every other section. */
  border?: string;
  password: string;
  confirmPassword: string;
}

/**
 * Does an officer of this section have to name an inland office? Only NSSS
 * runs the posts, so only NSSS is asked.
 */
export function requiresInlandOffice(section: Section | "" | "All"): boolean {
  return section === NSSS_SECTION;
}

/**
 * Tidy an office name so "nakonde ", "NAKONDE" and "Nakonde" are one office
 * rather than three columns in the screening report. A name that matches a
 * known office (or one already in the register, when the caller passes it in)
 * takes that office's spelling; anything else keeps the officer's own words,
 * trimmed and with its inner spacing collapsed.
 */
export function normaliseOfficeName(
  raw: string,
  known: readonly string[] = INLAND_OFFICES,
): string {
  const tidy = raw.trim().replace(/\s+/g, " ");
  const match = known.find((k) => k.toLowerCase() === tidy.toLowerCase());
  return match || tidy;
}

/** A workable email address — deliberately loose, Auth does the real check. */
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Everything wrong with a request, in the order the form asks it. An empty
 * list means the request may be submitted.
 */
export function validateSignup(input: SignupInput): string[] {
  const problems: string[] = [];

  if (!input.displayName.trim() || input.displayName.trim().length < 2) {
    problems.push("Give your full name, as it should appear on your entries.");
  }
  if (!looksLikeEmail(input.email)) {
    problems.push("Enter a valid work email address.");
  }
  if (!input.section) {
    problems.push("Choose the section you fall under.");
  } else if (!SECTIONS.includes(input.section as Section)) {
    // "All" and anything else invented are an administrator's to grant.
    problems.push("Choose one of the department's sections.");
  }
  if (
    input.section &&
    requiresInlandOffice(input.section) &&
    !normaliseOfficeName(input.border || "")
  ) {
    problems.push(
      "Name the inland office you are posted to — your screening figures are filed against it.",
    );
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    problems.push(
      `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  if (input.password !== input.confirmPassword) {
    problems.push("The two passwords do not match.");
  }

  return problems;
}

/**
 * The account document a validated request becomes: an ordinary officer of the
 * one section asked for, held pending, with the inland office attached when the
 * section has one. Callers must have run `validateSignup` first — this only
 * shapes the record, it does not re-judge it.
 */
export function newAccountRequest(
  input: SignupInput,
  uid: string,
  now: string = new Date().toISOString(),
): UserDoc {
  const section = input.section as Section;
  const office = requiresInlandOffice(section)
    ? normaliseOfficeName(input.border || "")
    : "";
  return {
    uid,
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName.trim(),
    role: "officer",
    section,
    pending: true,
    disabled: false,
    origin: "self",
    requestedAt: now,
    ...(office ? { border: office } : {}),
  };
}

/**
 * The account requests waiting on an administrator, oldest first — the queue is
 * worked in the order people asked.
 */
export function pendingRequests(users: UserDoc[]): UserDoc[] {
  return users
    .filter((u) => u.pending)
    .sort((a, b) => (a.requestedAt || "").localeCompare(b.requestedAt || ""));
}

/** The accounts that are actually in use — approved, whether active or not. */
export function settledAccounts(users: UserDoc[]): UserDoc[] {
  return users.filter((u) => !u.pending);
}

/**
 * The patch that approves a request. An administrator may correct what was
 * asked for on the way through — a section chosen in error, an officer who
 * should hold the cross-section posting, an office spelled differently — so
 * approval takes the final values rather than trusting the request's.
 */
export function approvalPatch(
  decision: {
    role: UserDoc["role"];
    section: UserDoc["section"];
    border?: string;
  },
  actorUid: string,
  now: string = new Date().toISOString(),
): Partial<UserDoc> {
  const office = requiresInlandOffice(decision.section)
    ? normaliseOfficeName(decision.border || "")
    : "";
  return {
    role: decision.role,
    section: decision.section,
    border: office,
    pending: false,
    disabled: false,
    approvedAt: now,
    approvedBy: actorUid,
  };
}

/**
 * Whether an account may log for a given inland office. An officer posted to
 * one office may only file against that office; an account with no posting
 * (head office, an administrator, a cross-section "All") may file for any.
 * This is the client's half of the lock — the security rules enforce the same
 * thing against the `border` claim.
 */
export function canLogForOffice(
  user: Pick<UserDoc, "border"> | null,
  office: string,
): boolean {
  if (!user?.border) return true;
  return user.border.toLowerCase() === office.trim().toLowerCase();
}

/**
 * The office an account logs for, or null when it may choose. Screens use this
 * to answer the shift header once and then stay out of the way.
 */
export function postedOffice(user: Pick<UserDoc, "border"> | null): string | null {
  return user?.border ? user.border : null;
}

/**
 * The offices to offer on the sign-up form: the ones the log already knows,
 * plus any the caller supplies (the register, once it is readable), in name
 * order and without duplicates.
 */
export function officeOptions(extra: readonly string[] = []): string[] {
  const seen = new Map<string, string>();
  for (const name of [...INLAND_OFFICES, ...extra]) {
    const tidy = normaliseOfficeName(name);
    if (tidy) seen.set(tidy.toLowerCase(), tidy);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
