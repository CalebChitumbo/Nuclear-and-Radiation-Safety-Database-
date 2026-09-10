/**
 * What the Authority has done about each facility — the enforcement standing
 * read off the inspection register and hung on the facility.
 *
 * Management's question at the September 2026 meeting was that a facility
 * listed under "No application submitted" says nothing about whether the
 * Authority has acted: a practice that was suspended, a device that was
 * seized, a licence cancelled — those facilities are not unlicensed by
 * neglect, and the licensing breakdown should not leave them unexplained.
 *
 * The inspection register already carries every action (`Inspection.enforcement`,
 * from the Inspectorate workbook's vocabulary). This module reads it back per
 * facility: the most recent action, when, and whether it RESTRICTS the facility
 * (a suspension, seizure or cancellation) or merely puts it on notice. It never
 * stores anything — the standing is derived when a page is read, so recording
 * an action on the Inspectorate tab moves the facility's standing at once.
 */
import {
  ENFORCEMENT_ACTIONS,
  isEnforcementAction,
  type EnforcementAction,
} from "./inspectionDatabase";
import { norm } from "./matching";
import type { Facility, Inspection } from "./types";

/**
 * The actions that take something away from the facility — its practice, its
 * device, its licence. A facility under one of these is operating restricted
 * (or not at all), which is why "no application" is the wrong last word on it.
 */
export const RESTRICTIVE_ACTIONS = [
  "Suspension of Practice",
  "Seizure of Device",
  "Suspension of License",
  "Cancellation of License",
] as const satisfies ReadonlyArray<EnforcementAction>;

/** The formal notices — the Authority has written, but nothing is withdrawn. */
export const NOTICE_ACTIONS = [
  "Written Warning",
  "Enforcement Notice",
] as const satisfies ReadonlyArray<EnforcementAction>;

const RESTRICTIVE = new Set<string>(RESTRICTIVE_ACTIONS);
const NOTICES = new Set<string>(NOTICE_ACTIONS);

export type EnforcementSeverity = "restricted" | "notice" | "engagement";

/** How firm an action is — see RESTRICTIVE_ACTIONS and NOTICE_ACTIONS. */
export function enforcementSeverity(action: string): EnforcementSeverity {
  if (RESTRICTIVE.has(action)) return "restricted";
  if (NOTICES.has(action)) return "notice";
  return "engagement";
}

/** Every action, by how firm it is — the vocabulary must cover all nine. */
export function severityCoverage(): Record<EnforcementSeverity, EnforcementAction[]> {
  const out: Record<EnforcementSeverity, EnforcementAction[]> = {
    restricted: [],
    notice: [],
    engagement: [],
  };
  for (const a of ENFORCEMENT_ACTIONS) out[enforcementSeverity(a)].push(a);
  return out;
}

/** The latest enforcement action recorded against one facility. */
export interface FacilityEnforcement {
  action: EnforcementAction;
  severity: EnforcementSeverity;
  /** ISO date of the inspection it was recorded on; "" for an undated row. */
  date: string;
  inspectionId: string;
  /** Every action on record for the facility, most recent first. */
  history: Array<{ action: EnforcementAction; date: string; inspectionId: string }>;
}

/**
 * Rank actions so the standing shown is the one that matters: the most recent
 * dated action wins; an undated register row (the 2026 import) only speaks
 * when nothing dated does. Two on one day — the firmer.
 */
function later(
  a: { date: string; action: string },
  b: { date: string; action: string },
): number {
  if (a.date && !b.date) return -1;
  if (!a.date && b.date) return 1;
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  const rank = (s: EnforcementSeverity) =>
    s === "restricted" ? 0 : s === "notice" ? 1 : 2;
  return rank(enforcementSeverity(a.action)) - rank(enforcementSeverity(b.action));
}

/**
 * The enforcement standing of every facility that has one, keyed by facility
 * id. An inspection logged against a facility by name alone (free text) is
 * matched to the register by that name, so a typed log still counts.
 */
export function enforcementByFacility(
  inspections: Inspection[],
  facilities: Facility[],
): Map<string, FacilityEnforcement> {
  const byName = new Map<string, string>();
  for (const f of facilities) byName.set(f.nameLower || norm(f.name), f.id);

  const buckets = new Map<string, FacilityEnforcement["history"]>();
  for (const i of inspections) {
    if (!i.enforcement || !isEnforcementAction(i.enforcement)) continue;
    const id = i.facilityId || byName.get(norm(i.facilityName));
    if (!id) continue;
    const list = buckets.get(id) || [];
    list.push({ action: i.enforcement, date: i.date || "", inspectionId: i.id });
    buckets.set(id, list);
  }

  const out = new Map<string, FacilityEnforcement>();
  for (const [id, history] of buckets) {
    history.sort(later);
    const top = history[0];
    out.set(id, {
      action: top.action,
      severity: enforcementSeverity(top.action),
      date: top.date,
      inspectionId: top.inspectionId,
      history,
    });
  }
  return out;
}

/**
 * The one line the licensing breakdown shows against a facility: what its
 * stage says, qualified by what the Authority has done. A licensed facility
 * under a suspension is still "Licensed — Suspension of License", because the
 * register is the register; the qualification is what Management asked for.
 */
export function standingLabel(
  facility: Pick<Facility, "licensed" | "stage" | "currentStatus">,
  enforcement: FacilityEnforcement | undefined,
): string {
  const base = facility.licensed
    ? "Licensed"
    : facility.currentStatus || facility.stage;
  if (!enforcement) return base;
  const when = enforcement.date ? ` (${enforcement.date})` : "";
  return `${base} — ${enforcement.action}${when}`;
}
