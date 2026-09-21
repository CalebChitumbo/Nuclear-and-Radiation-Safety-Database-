/**
 * The inspection card register — every card the Inspectorate has issued, read
 * as one list whichever way it was recorded.
 *
 * A card reaches the system by one of two routes:
 *
 * 1. **Stamped on a logged inspection.** Ticking *Inspection card issued* on
 *    the log form, the Daily Updates wizard or the request drawer sets
 *    `cardIssued` on that inspection. This is the route for a visit made now.
 * 2. **Recorded on its own** (`inspectionCards`). The cards the section issued
 *    before the log carried them — and any card from a visit that was never
 *    logged here — are put on the register for the record: the day issued,
 *    the facility, the non-compliances written on the card. This route
 *    creates NO inspection, so it moves no output figure and no province
 *    sheet; that is the point of keeping it separate. The back-imported 2026
 *    register already carries those visits, and logging them again would
 *    count them twice.
 *
 * Both are folded into `CardRecord`s here, so the *Inspection cards due* list
 * and the card register on the Inspectorate tab read one thing. Expiry and
 * status stay derived (+30 days, Active / Expiring Soon / Expired against
 * today) exactly as inspectionDatabase.ts derives them for the sheet — the
 * section asked to see which past cards have run out and which are still
 * running, and that is a matter of the date, never a stored flag.
 */
import {
  cardExpiry,
  cardStatus,
  isEnforcementAction,
  type CardStatus,
  type EnforcementAction,
} from "./inspectionDatabase";
import { inspectionInPeriod, type InspectionPeriod, type PeriodContext } from "./inspectionStats";
import { norm } from "./matching";
import type { Facility, Inspection, InspectionCard, WeekDef } from "./types";
import { weekLabelForDate } from "./week";

export type CardSource = "inspection" | "record";

/** One card on the register, whichever way it was recorded. */
export interface CardRecord {
  /** Unique across both sources — `insp:<id>` or `card:<id>`. */
  key: string;
  source: CardSource;
  /** The inspection's id, or the recorded card's. */
  id: string;
  facilityId: string | null;
  facility: string;
  province: string;
  district: string;
  issued: string;
  expiry: string;
  status: CardStatus;
  /**
   * What the card was issued against — the recorded card's non-compliances,
   * or the logged inspection's notes.
   */
  findings: string;
  /** The recorded card's own number; "" for a card stamped on an inspection. */
  reference: string;
  /** The action taken at the logged visit; "" for a recorded card. */
  enforcement: EnforcementAction | "";
}

function facilityKey(r: { facilityId: string | null; facility: string }): string {
  return r.facilityId || `name:${norm(r.facility)}`;
}

/**
 * Every card, newest issued first. A recorded card and a logged inspection are
 * two records even when they name the same facility and day — the officer who
 * put the past card on the register did so because the visit was not logged,
 * so nothing here guesses that they are one.
 */
export function cardRegister(
  inspections: Inspection[],
  cards: InspectionCard[],
  facilities: Facility[],
  today: string,
): CardRecord[] {
  const byId = new Map(facilities.map((f) => [f.id, f]));
  const out: CardRecord[] = [];

  for (const i of inspections) {
    if (!i.cardIssued) continue;
    const facility = i.facilityId ? byId.get(i.facilityId) : undefined;
    out.push({
      key: `insp:${i.id}`,
      source: "inspection",
      id: i.id,
      facilityId: i.facilityId,
      facility: facility?.name || i.facilityName,
      province: facility?.province || i.province || "",
      district: facility?.district || i.district || "",
      issued: i.cardIssued,
      expiry: cardExpiry(i.cardIssued),
      status: cardStatus(i.cardIssued, today) || "Active",
      findings: i.notes || "",
      reference: "",
      enforcement:
        i.enforcement && isEnforcementAction(i.enforcement) ? i.enforcement : "",
    });
  }

  for (const c of cards) {
    if (!c.issued) continue;
    const facility = c.facilityId ? byId.get(c.facilityId) : undefined;
    out.push({
      key: `card:${c.id}`,
      source: "record",
      id: c.id,
      facilityId: c.facilityId,
      facility: facility?.name || c.facilityName,
      province: facility?.province || c.province || "",
      district: facility?.district || c.district || "",
      issued: c.issued,
      expiry: cardExpiry(c.issued),
      status: cardStatus(c.issued, today) || "Active",
      findings: c.nonCompliances || "",
      reference: c.reference || "",
      enforcement: "",
    });
  }

  return out.sort(
    (a, b) => b.issued.localeCompare(a.issued) || a.facility.localeCompare(b.facility),
  );
}

/**
 * The card each facility currently holds — its most recently issued one. A
 * card is re-issued at a follow-up visit, and the new card supersedes the old
 * on the workbook's sheet; the register keeps both, the standing reads the
 * latest.
 */
export function currentCards(register: CardRecord[]): CardRecord[] {
  const seen = new Set<string>();
  const out: CardRecord[] = [];
  for (const r of [...register].sort((a, b) => b.issued.localeCompare(a.issued))) {
    const k = facilityKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/**
 * The cards that need attention — each facility's current card where it has
 * expired or is inside its last fortnight — soonest expiry first, which puts
 * the most overdue at the top by construction.
 */
export function cardsNeedingAttention(register: CardRecord[]): CardRecord[] {
  return currentCards(register)
    .filter((r) => r.status === "Expired" || r.status === "Expiring Soon")
    .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.facility.localeCompare(b.facility));
}

/** Active / Expiring Soon / Expired counts for a panel's caption. */
export function countCardStatuses(register: CardRecord[]): Record<CardStatus, number> {
  const out: Record<CardStatus, number> = { Active: 0, "Expiring Soon": 0, Expired: 0 };
  for (const r of register) out[r.status] += 1;
  return out;
}

/**
 * Whether a card belongs to the dashboard's period — the same week / month /
 * year test the inspections get, applied to the day the card was issued. A
 * recorded card stores no week, so its week is looked up from the calendar.
 */
export function cardInPeriod(
  card: CardRecord,
  period: InspectionPeriod,
  ctx: PeriodContext,
  weeks: WeekDef[],
): boolean {
  return inspectionInPeriod(
    { date: card.issued, week: weekLabelForDate(card.issued, weeks, "") } as Inspection,
    period,
    ctx,
  );
}

// ---------------------------------------------------------------------------
// Recording a card
// ---------------------------------------------------------------------------

export interface InspectionCardInput {
  issued: string;
  facilityId: string | null;
  facilityName: string;
  district?: string;
  reference?: string;
  nonCompliances: string;
  notes: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Why a card cannot be recorded as typed, or null when it can. The form shows
 * the message; the store refuses the write on the same test so a bypassed
 * form gets the same answer.
 */
export function inspectionCardProblem(
  input: InspectionCardInput,
  today: string,
): string | null {
  if (!input.facilityName.trim()) return "Please choose or type the facility the card was issued to.";
  if (!ISO_DATE.test(input.issued)) return "Please give the date the card was issued.";
  if (input.issued > today) return "A card cannot be recorded as issued on a day that has not come yet.";
  return null;
}

/**
 * The record a form's input becomes: trimmed, the facility's own province and
 * district when it is on the register, the typed district when it is not, and
 * the optional fields dropped rather than stored blank.
 */
export function buildInspectionCard(
  input: InspectionCardInput,
  facilities: Facility[],
): Omit<InspectionCard, "id"> {
  const facility = input.facilityId
    ? facilities.find((f) => f.id === input.facilityId) || null
    : null;
  const district = facility ? facility.district : (input.district || "").trim();
  const reference = (input.reference || "").trim();
  return {
    issued: input.issued,
    facilityId: facility ? facility.id : null,
    facilityName: facility ? facility.name : input.facilityName.trim(),
    province: facility ? facility.province : "",
    ...(district ? { district } : {}),
    ...(reference ? { reference } : {}),
    nonCompliances: input.nonCompliances.trim(),
    notes: input.notes.trim(),
  };
}
