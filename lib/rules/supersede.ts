/**
 * Status supersession — deciding when a newer RAIS email replaces the status a
 * facility/application currently shows, and resolving a facility's single
 * displayed status from its workflow records.
 *
 * The core requirement (spec §3): a facility always reflects the status from the
 * MOST RECENT applicable email. Forward progression replaces the shown status; a
 * stale or duplicate older email must not regress it; a genuine reset (rejection
 * / returned / declination / withdrawal / additional-info) legitimately moves it
 * backward when it is the newest event.
 *
 * Pure and framework-free so it is shared by the web store and copied into the
 * Cloud Functions bundle by functions/scripts/sync-rules.js.
 */
import { PHASE_RANK } from "./parseNotifications";
import { STATUS_TO_STAGE, type NewApplicationStatus } from "./raisTemplates";
import type { LicenceWorkflow, Stage, WorkflowPhase } from "./types";

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse the two date shapes extractFacility/extractDate emit into epoch ms:
 *  - `DD/MM/YYYY` — DAY-FIRST (Zambia/RAIS convention; getting this wrong inverts
 *    supersede ordering), and
 *  - `D-MMM-YYYY` (e.g. "27-May-2026").
 * Falls back to Date.parse for ISO strings. Returns NaN when unparseable.
 */
export function parseRaisDate(s: string): number {
  const t = (s || "").trim();
  if (!t) return NaN;

  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);

  m = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    return mon === undefined ? NaN : Date.UTC(+m[3], mon, +m[1]);
  }

  const iso = Date.parse(t);
  return Number.isNaN(iso) ? NaN : iso;
}

export interface SupersedeInput {
  /** Parsed email date as emitted by extractDate (DD/MM/YYYY or D-MMM-YYYY). */
  date?: string;
  /** ISO timestamp the connector stamped when the email arrived. */
  receivedAt?: string;
  phase: WorkflowPhase;
  currentStatus?: NewApplicationStatus;
  special?: "renewal-auto" | "form-i-prompt" | "reset";
  reviewStatus?: "applied" | "needs-review";
}

/** Best available recency for an input: receivedAt (exact) then parsed date. */
function recency(x: { receivedAt?: string; date?: string }): number {
  if (x.receivedAt) {
    const t = Date.parse(x.receivedAt);
    if (!Number.isNaN(t)) return t;
  }
  return parseRaisDate(x.date || "");
}

/**
 * Should `next` replace `prev` as the displayed status for the same application
 * (same RAN)? Licensed-agnostic — "never downgrade an already-licensed facility"
 * is enforced separately at the facility-write layer.
 */
export function shouldSupersede(
  prev: SupersedeInput | null,
  next: SupersedeInput,
): boolean {
  if (!prev) return true;

  // Same canonical status → no change. Covers exact duplicate re-sends regardless
  // of receivedAt (which the connector restamps on every delivery).
  if (next.currentStatus && next.currentStatus === prev.currentStatus) return false;

  const pt = recency(prev);
  const nt = recency(next);

  if (!Number.isNaN(pt) && !Number.isNaN(nt)) {
    if (nt < pt) return false; // stale older email — never regress
    if (nt > pt) return true; //  newer email — forward progression (incl. resets)
    // Same instant: a reset wins the tie, else the later pipeline phase wins.
    if (next.special === "reset") return true;
    return PHASE_RANK[next.phase] > PHASE_RANK[prev.phase];
  }

  // No reliable timestamps on one/both sides (date-less pastes): a reset still
  // moves it; otherwise advance only when the new phase is at least as far along.
  if (next.special === "reset") return true;
  return PHASE_RANK[next.phase] >= PHASE_RANK[prev.phase];
}

/**
 * Is workflow `a` more recent than `b`? When BOTH carry a comparable timestamp
 * (receivedAt → parsed date) the later one wins, ties broken by pipeline rank.
 * When a timestamp is missing on either side (e.g. a date-less pasted dashboard
 * notification), fall back to pipeline rank so a stale-but-dated email cannot
 * override a fresher, further-along paste; a present timestamp only breaks a rank
 * tie.
 */
function moreRecent(a: LicenceWorkflow, b: LicenceWorkflow): boolean {
  const at = recency({ receivedAt: a.receivedAt, date: a.lastSeen });
  const bt = recency({ receivedAt: b.receivedAt, date: b.lastSeen });
  const aHas = !Number.isNaN(at);
  const bHas = !Number.isNaN(bt);
  if (aHas && bHas && at !== bt) return at > bt;
  const ra = PHASE_RANK[a.phase];
  const rb = PHASE_RANK[b.phase];
  if (ra !== rb) return ra > rb;
  return aHas && !bHas; // same rank (and same/no comparable date): timestamp breaks the tie
}

/**
 * Resolve a facility's single displayed status from all of its workflow records:
 * the most recent applicable one (latest email by date, then pipeline rank). The
 * caller is responsible for the licensed guard (never downgrade a licensed one).
 */
export function resolveFacilityStatus(
  workflows: LicenceWorkflow[],
): { currentStatus?: NewApplicationStatus; stage: Stage } | null {
  let best: LicenceWorkflow | null = null;
  for (const w of workflows) {
    if (!best || moreRecent(w, best)) best = w;
  }
  if (!best) return null;
  const stage: Stage = best.currentStatus
    ? STATUS_TO_STAGE[best.currentStatus]
    : best.facilityStage;
  return { currentStatus: best.currentStatus, stage };
}
