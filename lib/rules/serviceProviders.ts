import type { Facility } from "./types";

/**
 * Service providers on the facilities register.
 *
 * Some facilities on the register are not users of radiation in a practice of
 * their own but SERVICE PROVIDERS — dealers and suppliers, transporters,
 * dosimetry and maintenance services. Among them, some are RECOGNISED by the
 * Authority and some are not yet. Both are marks an officer sets on the
 * facility (`serviceProvider`, `spRecognised` and the recognition's day, note,
 * who and when); no import sets them, and nothing is marked in bulk.
 *
 * The mark sits BESIDE the Medical/Non-Medical category rather than replacing
 * it: the category feeds the dashboard rollup (`aggregates/dashboard`), the
 * Reports page and the weekly report, and a facility that is a service
 * provider is still one or the other. So marking one moves no reported figure.
 *
 * Pure and framework-free.
 */

type SpFacts = Pick<Facility, "serviceProvider" | "spRecognised">;

/** The register's service-provider filter. */
export const SP_FILTERS = ["all", "sp", "recognised", "unrecognised"] as const;
export type SpFilter = (typeof SP_FILTERS)[number];

export function isServiceProvider(f: SpFacts): boolean {
  return f.serviceProvider === true;
}

/** A service provider the Authority has recognised. Never true for a non-provider. */
export function isRecognisedProvider(f: SpFacts): boolean {
  return f.serviceProvider === true && f.spRecognised === true;
}

export function matchesSpFilter(f: SpFacts, filter: SpFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "sp":
      return isServiceProvider(f);
    case "recognised":
      return isRecognisedProvider(f);
    case "unrecognised":
      return isServiceProvider(f) && !isRecognisedProvider(f);
  }
}

export function countServiceProviders(facilities: SpFacts[]): {
  sp: number;
  recognised: number;
  unrecognised: number;
} {
  let sp = 0;
  let recognised = 0;
  for (const f of facilities) {
    if (!isServiceProvider(f)) continue;
    sp += 1;
    if (isRecognisedProvider(f)) recognised += 1;
  }
  return { sp, recognised, unrecognised: sp - recognised };
}

/** A `?sp=` value read back; anything unknown is "all". */
export function parseSpFilter(v: string | null | undefined): SpFilter {
  return (SP_FILTERS as readonly string[]).includes(v || "")
    ? (v as SpFilter)
    : "all";
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const RECOGNITION_NOTE_MAX = 500;

/**
 * The patch that marks a facility a service provider, or takes the mark off.
 * Taking it off clears the recognition too — a facility that is not a
 * provider cannot be a recognised one — but keeps the recognition's day and
 * note, so putting the mark back does not lose them.
 */
export function serviceProviderPatch(
  on: boolean,
  by: { name: string },
  at: string,
): Partial<Facility> {
  if (on) return { serviceProvider: true };
  return {
    serviceProvider: false,
    spRecognised: false,
    spRecognitionBy: by.name,
    spRecognitionAt: at,
  };
}

/**
 * The patch that records the Authority's recognition of a service provider,
 * or withdraws it. Every value is set (an empty string, never undefined), so
 * the patch can go to Firestore's updateDoc as it is.
 *
 * Throws on a facility that is not a service provider, a malformed day, a day
 * in the future, or an over-long note — the same conditions firestore.rules
 * holds the document to.
 */
export function recognitionPatch(
  facility: SpFacts,
  input: { recognised: boolean; on?: string; note?: string },
  by: { name: string },
  at: string,
  /** Today as the officer's calendar has it (YYYY-MM-DD), for the future-day check. */
  today: string,
): Partial<Facility> {
  if (!isServiceProvider(facility)) {
    throw new Error("Mark the facility as a service provider first.");
  }
  const on = (input.on || "").trim();
  const note = (input.note || "").trim();
  if (on && !DATE.test(on)) throw new Error("The recognition date must be a day (YYYY-MM-DD).");
  if (on && on > today) throw new Error("The recognition date cannot be in the future.");
  if (note.length > RECOGNITION_NOTE_MAX) {
    throw new Error(`Keep the note under ${RECOGNITION_NOTE_MAX} characters.`);
  }
  return {
    spRecognised: input.recognised,
    spRecognisedOn: input.recognised ? on : "",
    spRecognitionNote: note,
    spRecognitionBy: by.name,
    spRecognitionAt: at,
  };
}

/**
 * Facilities the imported data already describes as a service provider —
 * offered to an officer to review and mark one by one, never applied. The
 * evidence, strongest first:
 *
 *  - the Licensing Status workbook's operating column says "Service provider"
 *    or "Transporter" (kept as the last part of `statusDetail`);
 *  - the practice is Dealer/Supplier, Transportation or Dosimetry Services.
 *
 * "Training Services" is not taken as evidence: in the Sep 2026 register it is
 * on a university and a cancer centre, which provide training beside a
 * practice of their own.
 */
export function serviceProviderSuggestions(
  facilities: Array<Pick<Facility, "id" | "name" | "practice" | "statusDetail" | "serviceProvider">>,
): Array<{ id: string; name: string; reason: string }> {
  const out: Array<{ id: string; name: string; reason: string }> = [];
  for (const f of facilities) {
    if (f.serviceProvider !== undefined) continue; // an officer has decided
    const tail = (f.statusDetail || "").split(" · ").pop()?.trim() || "";
    let reason = "";
    if (/^(service provider|transporter)$/i.test(tail)) {
      reason = `Licensing Status workbook: "${tail}"`;
    } else {
      const m = (f.practice || "").match(
        /dealer\s*\/\s*supplier|transportation|dosimetry services/i,
      );
      if (m) reason = `Practice: ${m[0]}`;
    }
    if (reason) out.push({ id: f.id, name: f.name, reason });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
