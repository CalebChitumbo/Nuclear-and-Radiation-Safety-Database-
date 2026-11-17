/**
 * The sources and devices an enforcement put out of use — which item, not
 * just which facility.
 *
 * The enforcement column says a facility was sealed ("Suspension of Practice",
 * shown as *Sealed*) or had a device seized; it cannot say WHICH source. A
 * facility holding six gauges may have had one sealed. So each item an
 * inspector seals or seizes is recorded on its own, here, naming it by the
 * inventory's own key — the RAN on the RAIS register, the row number on the
 * field-verified annex — and the two inventory tabs read these records to
 * show the item as Sealed (or Seized) until the seal is lifted.
 *
 * Why a collection of its own rather than a field on the inspection: the
 * inventory tabs are the National Source Inventory section's, and that section
 * does not read the inspection register (it is Licensing's and the
 * Inspectorate's). A small `sealedSources` collection both can read keeps the
 * inventory's read to the handful of items under seal, never the whole
 * inspection log. The inspection the seal was applied at is linked by id.
 *
 * Nothing here moves a reported figure. Output 1.2.11 counts the enforcement
 * ACTION on the inspection, once per inspection, whatever number of items it
 * reached; these records only say which items those were.
 *
 * An item the inspector found that is on neither inventory (common at an
 * unlicensed facility) is still recorded, with its description and serial,
 * and the Source Inventory tab lists it as a worklist — a sealed source the
 * register has never heard of is exactly what that section needs to know.
 */
import { norm, weightedTokenSim } from "./matching";
import type { RaisRecord } from "./raisInventory";
import type { SourceHolderIndex } from "./sourceHolders";
import type { VerifiedRecord } from "./verifiedInventory";

/**
 * The two enforcement actions that take a particular item out of use. Their
 * stored values are the workbook's (see ENFORCEMENT_ACTIONS); a seal reads
 * "Sealed" on screen, the way the summary heads the column.
 */
export const SEALING_ACTIONS = ["Suspension of Practice", "Seizure of Device"] as const;
export type SealingAction = (typeof SEALING_ACTIONS)[number];

export function isSealingAction(v: string | undefined | null): v is SealingAction {
  return (SEALING_ACTIONS as readonly string[]).includes(v || "");
}

/** How an item under this action reads in the inventory: Sealed or Seized. */
export function sealLabel(action: SealingAction | string): "Sealed" | "Seized" {
  return action === "Seizure of Device" ? "Seized" : "Sealed";
}

/** Which inventory names the item; "" for an item on neither. */
export const SEALED_INVENTORIES = ["rais", "verified", ""] as const;
export type SealedInventory = (typeof SEALED_INVENTORIES)[number];

/** One item sealed or seized at one facility. */
export interface SealedSource {
  id: string;
  /** Which inventory the item is on — "" when it is on neither. */
  inventory: SealedInventory;
  /** The RAN (RAIS) or annex row number (verified); "" when on neither. */
  key: string;
  /**
   * What the item is, written when it was sealed — "Cs-137 · Troxler 3440"
   * — so the record still reads if the inventory is corrected later, and so
   * an item on no inventory says what it is at all.
   */
  description: string;
  serialNumber: string;
  facilityId: string | null;
  facilityName: string;
  action: SealingAction;
  /** The day the seal was applied (ISO). */
  sealedOn: string;
  /** The inspection the action was recorded on, when there is one. */
  inspectionId?: string;
  notes: string;
  /** The day the seal was lifted (ISO). Absent while the item is under seal. */
  liftedOn?: string;
  /** Why or on whose authority the seal was lifted. */
  liftNote?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type NewSealedSource = Omit<SealedSource, "id">;

/** The overlay key an inventory uses for a record: `${inventory}:${key}`. */
export function sealKey(inventory: SealedInventory, key: string): string {
  return `${inventory}:${(key || "").trim()}`;
}

/** Whether the item is still under seal (or still held, if seized). */
export function isUnderSeal(r: Pick<SealedSource, "liftedOn">): boolean {
  return !r.liftedOn;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Check a record before it is written. Returns an officer-facing message, or
 * null when it is sound. The form and the store run the same check; the
 * Firestore rule repeats the shape.
 */
export function validateSealedSource(r: NewSealedSource): string | null {
  if (!r.facilityName.trim()) return "Name the facility the item was sealed at.";
  if (!isSealingAction(r.action)) return "Pick Sealed or Seized.";
  if (!ISO_DAY.test(r.sealedOn)) return "Give the day the seal was applied.";
  if (!(SEALED_INVENTORIES as readonly string[]).includes(r.inventory)) {
    return `Unknown inventory "${r.inventory}".`;
  }
  if (r.inventory && !r.key.trim()) return "Pick the item from the inventory.";
  if (!r.inventory && !r.description.trim()) {
    return "Say what the item is — it is on neither inventory.";
  }
  if (r.description.length > 200) return "Keep the description under 200 characters.";
  if (r.notes.length > 500) return "Keep the notes under 500 characters.";
  if (r.liftedOn !== undefined) {
    if (!ISO_DAY.test(r.liftedOn)) return "Give the day the seal was lifted.";
    if (r.liftedOn < r.sealedOn) return "A seal cannot be lifted before it was applied.";
  }
  if (r.liftNote !== undefined && r.liftNote.length > 500) {
    return "Keep the note under 500 characters.";
  }
  return null;
}

/**
 * Every inventoried item that is under seal now, keyed `${inventory}:${key}`.
 * An item sealed twice without the first being lifted shows its latest seal.
 * Items on neither inventory are not in here — see `sealedWithoutRow`.
 */
export function activeSealIndex(
  records: readonly SealedSource[],
): Map<string, SealedSource> {
  const index = new Map<string, SealedSource>();
  for (const r of records) {
    if (!r.inventory || !r.key || !isUnderSeal(r)) continue;
    const k = sealKey(r.inventory, r.key);
    const prev = index.get(k);
    if (!prev || r.sealedOn > prev.sealedOn) index.set(k, r);
  }
  return index;
}

/**
 * Items under seal that an inventory tab should name but has no row to put a
 * chip on: its own records whose key it no longer holds (a removed or re-keyed
 * row) and — on the RAIS tab, the register of record — items on neither
 * inventory. Listed on the tab so nothing under seal goes unseen.
 */
export function sealedWithoutRow(
  records: readonly SealedSource[],
  inventory: "rais" | "verified",
  knownKeys: ReadonlySet<string>,
): SealedSource[] {
  return records
    .filter((r) => {
      if (!isUnderSeal(r)) return false;
      if (r.inventory === inventory) return !knownKeys.has(r.key);
      return inventory === "rais" && r.inventory === "";
    })
    .sort((a, b) => b.sealedOn.localeCompare(a.sealedOn));
}

/** Under seal first (newest first), then lifted (most recently lifted first). */
export function sortSealedSources(records: readonly SealedSource[]): SealedSource[] {
  return [...records].sort((a, b) => {
    const la = isUnderSeal(a) ? 0 : 1;
    const lb = isUnderSeal(b) ? 0 : 1;
    if (la !== lb) return la - lb;
    if (la === 0) return b.sealedOn.localeCompare(a.sealedOn);
    return (b.liftedOn || "").localeCompare(a.liftedOn || "");
  });
}

export interface SealSummary {
  sealed: number;
  seized: number;
  lifted: number;
  facilities: number;
}

/** The counts the register panel heads itself with. */
export function summariseSeals(records: readonly SealedSource[]): SealSummary {
  const open = records.filter(isUnderSeal);
  return {
    sealed: open.filter((r) => r.action === "Suspension of Practice").length,
    seized: open.filter((r) => r.action === "Seizure of Device").length,
    lifted: records.length - open.length,
    facilities: new Set(
      open.map((r) => r.facilityId || `name:${norm(r.facilityName)}`),
    ).size,
  };
}

// ---------------------------------------------------------------------------
// Picking the item
// ---------------------------------------------------------------------------

/** An item the form offers for sealing. */
export interface SealCandidate {
  inventory: "rais" | "verified";
  key: string;
  description: string;
  serialNumber: string;
  /** Where the inventory says it is — shown so the inspector can tell twins apart. */
  location: string;
}

/** "Cs-137 · Sealed source · Troxler 3440" — what a RAIS item is, on one line. */
export function describeRaisItem(r: RaisRecord): string {
  const what =
    r.kind === "Sealed Source"
      ? [r.nuclide?.trim() || "Nuclide not recorded", "Sealed source"]
      : [r.type?.trim() || "Radiation device"];
  const make = [r.manufacturer, r.model].map((s) => (s || "").trim()).filter(Boolean);
  return [...what, ...(make.length ? [make.join(" ")] : [])].join(" · ");
}

/** What an annex row is, on one line. */
export function describeVerifiedItem(r: VerifiedRecord): string {
  return r.equipmentType.trim() || "Equipment not recorded";
}

export function raisCandidate(
  r: RaisRecord,
  holders: SourceHolderIndex,
): SealCandidate {
  const h = holders.get(r.ran);
  return {
    inventory: "rais",
    key: r.ran,
    description: describeRaisItem(r),
    serialNumber: (r.serialNumber || "").trim(),
    location: h ? h.facility : "",
  };
}

export function verifiedCandidate(r: VerifiedRecord): SealCandidate {
  return {
    inventory: "verified",
    key: String(r.no),
    description: describeVerifiedItem(r),
    serialNumber: (r.serialNumber || "").trim(),
    location: r.facility,
  };
}

/** How close an annex establishment name must be to count as the facility. */
const FACILITY_NAME_MATCH = 0.6;

/**
 * The items the inventories place at one facility — what the inspector most
 * likely sealed. RAIS items join on the facility's FAC code through the
 * holdings export (and on the name, for a holding filed under a code the
 * register does not hold); annex rows join on the establishment name, which is
 * all the annex records.
 */
export function candidatesAtFacility(
  facility: { facCode?: string; name: string },
  raisRecords: readonly RaisRecord[],
  holders: SourceHolderIndex,
  verifiedRecords: readonly VerifiedRecord[],
): SealCandidate[] {
  const code = (facility.facCode || "").trim();
  const name = norm(facility.name);
  const out: SealCandidate[] = [];
  if (name || code) {
    for (const r of raisRecords) {
      const h = holders.get(r.ran);
      if (!h) continue;
      const byCode = !!code && h.facCode === code;
      const byName = !!name && norm(h.facility) === name;
      if (byCode || byName) out.push(raisCandidate(r, holders));
    }
  }
  if (name) {
    for (const r of verifiedRecords) {
      const other = norm(r.facility);
      if (
        other === name ||
        weightedTokenSim(other, name) >= FACILITY_NAME_MATCH
      ) {
        out.push(verifiedCandidate(r));
      }
    }
  }
  return out;
}

/**
 * Search both inventories for an item by RAN, serial, nuclide, type or holder —
 * for the item the holdings export places elsewhere, or nowhere.
 */
export function searchCandidates(
  q: string,
  raisRecords: readonly RaisRecord[],
  holders: SourceHolderIndex,
  verifiedRecords: readonly VerifiedRecord[],
  limit = 12,
): SealCandidate[] {
  const needle = norm(q);
  if (needle.length < 2) return [];
  const out: SealCandidate[] = [];
  for (const r of raisRecords) {
    const c = raisCandidate(r, holders);
    const hay = norm([c.key, c.description, c.serialNumber, c.location].join(" "));
    if (hay.includes(needle)) out.push(c);
    if (out.length >= limit) return out;
  }
  for (const r of verifiedRecords) {
    const c = verifiedCandidate(r);
    const hay = norm([`row ${c.key}`, c.description, c.serialNumber, c.location].join(" "));
    if (hay.includes(needle)) out.push(c);
    if (out.length >= limit) return out;
  }
  return out;
}

/** The line a record reads as on the inventory tabs and the register. */
export function sealLine(r: SealedSource): string {
  const parts = [
    `${sealLabel(r.action)} ${r.sealedOn}`,
    `at ${r.facilityName}`,
  ];
  if (r.liftedOn) parts.push(`lifted ${r.liftedOn}`);
  return parts.join(" · ");
}
