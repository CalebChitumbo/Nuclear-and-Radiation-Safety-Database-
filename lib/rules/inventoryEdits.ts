import { RAIS_KINDS, type RaisKind, type RaisRecord } from "./raisInventory";
import type { VerifiedRecord } from "./verifiedInventory";

/**
 * Corrections officers make to the two source inventories.
 *
 * Both inventories arrive as fixed seeds — the RAIS register export and Annex I
 * of the field verification report. Neither seed is edited in place, because
 * both have an outside source of truth to reconcile against: RAIS is re-exported
 * periodically, and the annex belongs to a published report. So a correction is
 * stored as an OVERLAY — one small document per changed record, keyed by the
 * record's own identity — and the page merges baseline + overlay when it reads.
 *
 * That buys three things a mutable copy of the seed would lose:
 *
 *   * a re-import refreshes all 1,752 RAIS rows without discarding a single
 *     correction (the overlay is keyed by RAN, not by row position);
 *   * only the records someone actually touched cost a document, so the tabs
 *     keep loading their register from the page bundle rather than from 1,752
 *     Firestore reads; and
 *   * every correction keeps the value it replaced, so the page can still show
 *     what the register said before an officer disagreed with it.
 *
 * Removal is a tombstone, never a destructive write. An accession register that
 * silently loses a record loses the fact that it was ever registered, so a
 * removed item drops out of the counts and the table but stays recoverable.
 */

export const INVENTORY_KINDS = ["rais", "verified"] as const;
export type InventoryKind = (typeof INVENTORY_KINDS)[number];

/**
 * The fields an officer may correct, per inventory. Everything else on a record
 * is either derived (the family, the status group) or is the record's identity,
 * and neither is an officer's to retype.
 *
 * `ran` is absent from the RAIS list on purpose: it is the key the overlay is
 * stored under, so changing it would orphan the correction rather than rename
 * the record. A new record supplies its RAN once, when it is added.
 */
export const EDITABLE_FIELDS: Record<InventoryKind, readonly string[]> = {
  rais: [
    "kind",
    "type",
    "manufacturer",
    "model",
    "serialNumber",
    "nuclide",
    "activity",
    "activityDate",
    "sealedCategory",
    "securityLevel",
    "isoCompliance",
    "workingLife",
  ],
  verified: ["facility", "equipmentType", "serialNumber", "status"],
};

/** Fields a newly added record cannot be saved without. */
const REQUIRED_ON_ADD: Record<InventoryKind, readonly string[]> = {
  rais: ["kind"],
  verified: ["facility", "equipmentType"],
};

/** One officer's correction to one record. */
export interface InventoryEdit {
  /** `${inventory}:${key}` — also the Firestore document id. */
  id: string;
  inventory: InventoryKind;
  /**
   * The record's identity within its inventory: the RAN for the RAIS register,
   * the annex row number for the verified one. A record added in-app that has
   * no natural key carries a generated one.
   */
  key: string;
  /** Field overrides — only the fields that actually differ from the seed. */
  patch: Record<string, string>;
  /** Soft-removed: out of the register and its counts, but recoverable. */
  removed?: boolean;
  /** Recorded in-app, with no row behind it in the seed. */
  added?: boolean;
  updatedBy: string;
  updatedByName?: string;
  /** ISO timestamp of the last change to this correction. */
  updatedAt: string;
  /** Why the record was corrected or removed. */
  note?: string;
}

/** What the store is asked to save. The audit fields are stamped on for it. */
export interface InventoryEditInput {
  inventory: InventoryKind;
  key: string;
  patch: Record<string, string>;
  removed?: boolean;
  added?: boolean;
  note?: string;
}

/** The Firestore document id for a record's correction. */
export function editId(inventory: InventoryKind, key: string): string {
  return `${inventory}:${key}`;
}

/**
 * Keep only the fields this inventory allows, as trimmed strings. Anything
 * else an over-eager caller passes is dropped rather than stored — the overlay
 * must never be able to introduce a field the record shape does not have.
 */
export function sanitizePatch(
  inventory: InventoryKind,
  patch: Record<string, unknown>,
): Record<string, string> {
  const allowed = EDITABLE_FIELDS[inventory];
  const clean: Record<string, string> = {};
  for (const field of allowed) {
    const value = patch[field];
    if (value === undefined || value === null) continue;
    clean[field] = String(value).trim();
  }
  return clean;
}

/** RAIS accession numbers are RG/nnnn (generators) or SS/nnnn (sealed sources). */
export const RAN_PATTERN = /^(RG|SS)\/\d{1,6}$/;

/**
 * Check a correction before it is saved. Returns an operator-facing message, or
 * null when the edit is sound. Kept pure so the form and the store can run the
 * same check — the form to show the officer, the store to refuse a bad write.
 */
export function validateEdit(
  input: InventoryEditInput,
  takenKeys: ReadonlySet<string>,
): string | null {
  const { inventory, key, patch, added } = input;

  if (!INVENTORY_KINDS.includes(inventory)) {
    return `Unknown inventory "${inventory}".`;
  }
  if (!key.trim()) return "A record needs a key.";

  if (inventory === "rais") {
    // The RAN is the identity: an added record supplies it, and it must not
    // collide with one already in the register.
    if (added && !RAN_PATTERN.test(key)) {
      return "The RAN must look like RG/0376 or SS/0639.";
    }
    if (added && takenKeys.has(key)) {
      return `${key} is already in the register.`;
    }
    const kind = patch.kind;
    if (kind !== undefined && kind !== "" && !RAIS_KINDS.includes(kind as RaisKind)) {
      return `"${kind}" is not a radiation generator or a sealed source.`;
    }
  }

  if (added) {
    for (const field of REQUIRED_ON_ADD[inventory]) {
      if (!(patch[field] || "").trim()) {
        return `${field} is required to add a record.`;
      }
    }
  }

  if (input.note !== undefined && input.note.length > 500) {
    return "Keep the note under 500 characters.";
  }
  return null;
}

/** Apply an overlay's field overrides to one record. */
function patched<T extends object>(
  record: T,
  patch: Record<string, string>,
  fields: readonly string[],
): T {
  const next = { ...record } as Record<string, unknown>;
  for (const field of fields) {
    if (patch[field] !== undefined) next[field] = patch[field];
  }
  return next as T;
}

export interface MergedInventory<T> {
  /** The live register: baseline + additions, corrected, tombstones excluded. */
  records: T[];
  /** Soft-removed records, so the page can list and restore them. */
  removed: T[];
  /** Keys carrying a field correction (additions are not corrections). */
  editedKeys: Set<string>;
  /** Keys recorded in-app rather than imported. */
  addedKeys: Set<string>;
}

/**
 * Merge a seed baseline with the corrections stored against it.
 *
 * Shape-specific behaviour comes in through `keyOf` and `fromPatch`, so the two
 * inventories share one merge with one set of tests rather than each growing
 * its own near-copy.
 */
export function mergeInventory<T extends object>(
  baseline: readonly T[],
  edits: readonly InventoryEdit[],
  opts: {
    inventory: InventoryKind;
    keyOf: (record: T) => string;
    /** Build a record for an addition, given its key and position. */
    fromPatch: (key: string, patch: Record<string, string>, index: number) => T;
  },
): MergedInventory<T> {
  const { inventory, keyOf, fromPatch } = opts;
  const fields = EDITABLE_FIELDS[inventory];

  const byKey = new Map<string, InventoryEdit>();
  for (const edit of edits) {
    if (edit.inventory === inventory) byKey.set(edit.key, edit);
  }

  const records: T[] = [];
  const removed: T[] = [];
  const editedKeys = new Set<string>();
  const addedKeys = new Set<string>();

  for (const record of baseline) {
    const key = keyOf(record);
    const edit = byKey.get(key);
    if (!edit) {
      records.push(record);
      continue;
    }
    const next = patched(record, edit.patch, fields);
    if (Object.keys(edit.patch).length > 0) editedKeys.add(key);
    if (edit.removed) removed.push(next);
    else records.push(next);
  }

  // Additions have no baseline row, so they are built from their patch and
  // appended after it — the imported register keeps its own numbering.
  const seen = new Set(baseline.map(keyOf));
  let index = 0;
  for (const edit of byKey.values()) {
    if (!edit.added || seen.has(edit.key)) continue;
    const record = fromPatch(edit.key, edit.patch, baseline.length + index);
    index += 1;
    addedKeys.add(edit.key);
    if (edit.removed) removed.push(record);
    else records.push(record);
  }

  return { records, removed, editedKeys, addedKeys };
}

/** Merge the RAIS register with its corrections. */
export function mergeRaisInventory(
  baseline: readonly RaisRecord[],
  edits: readonly InventoryEdit[],
): MergedInventory<RaisRecord> {
  return mergeInventory(baseline, edits, {
    inventory: "rais",
    keyOf: (r) => r.ran,
    fromPatch: (key, patch, index) => {
      const kind = (
        RAIS_KINDS.includes(patch.kind as RaisKind)
          ? patch.kind
          : "Radiation Generator"
      ) as RaisKind;
      const record: RaisRecord = {
        no: index + 1,
        ran: key,
        kind,
        type: patch.type || "",
        manufacturer: patch.manufacturer || "",
        model: patch.model || "",
        serialNumber: patch.serialNumber || "",
      };
      // Source-only fields exist on a source record even when left blank, so an
      // added source is shaped exactly like an imported one.
      if (kind === "Sealed Source") {
        record.nuclide = patch.nuclide || "";
        record.activity = patch.activity || "";
        record.activityDate = patch.activityDate || "";
        record.sealedCategory = patch.sealedCategory || "";
        record.securityLevel = patch.securityLevel || "";
        record.isoCompliance = patch.isoCompliance || "";
        record.workingLife = patch.workingLife || "";
      }
      return record;
    },
  });
}

/** Merge the field-verified inventory with its corrections. */
export function mergeVerifiedInventory(
  baseline: readonly VerifiedRecord[],
  edits: readonly InventoryEdit[],
): MergedInventory<VerifiedRecord> {
  return mergeInventory(baseline, edits, {
    inventory: "verified",
    keyOf: (r) => String(r.no),
    fromPatch: (key, patch, index) => ({
      no: Number(key) || index + 1,
      facility: patch.facility || "",
      equipmentType: patch.equipmentType || "",
      serialNumber: patch.serialNumber || "",
      status: patch.status || "",
    }),
  });
}

/**
 * The fields that actually differ between a record and a proposed set of
 * values. Storing only these keeps a correction readable — the overlay says
 * what an officer changed, not what the form happened to be showing.
 */
export function diffPatch(
  inventory: InventoryKind,
  record: object | null,
  values: Record<string, string>,
): Record<string, string> {
  const clean = sanitizePatch(inventory, values);
  if (!record) return clean;
  // Read-only widening: the two record shapes have no index signature, and
  // making callers cast at every use would be noise for a lookup that only
  // ever reads the whitelisted field names.
  const source = record as Record<string, unknown>;
  const patch: Record<string, string> = {};
  for (const [field, value] of Object.entries(clean)) {
    if (String(source[field] ?? "") !== value) patch[field] = value;
  }
  return patch;
}
