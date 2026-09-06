/**
 * What one change to a reporting figure is worth recording, and how it reads.
 *
 * The reporting figures — the vehicles screened, the truck scans behind them,
 * the work plan's opening balances — are read as single numbers by people who
 * did not enter them. When one moves and nobody recognises the movement, the
 * record of why has to be one that could not have been skipped. So the audit
 * row is written by a Firestore trigger (`functions/src/audit.ts`), which sees
 * every write whatever made it: the app, a script run with the Admin SDK, an
 * edit typed into the Firebase console.
 *
 * This module is the part of that with no Firestore in it — what changed, who
 * changed it, and the one line a person reads in the panel. It is shared with
 * the Cloud Functions runtime by functions/scripts/sync-rules.js, so the
 * summary an officer reads on the NSSS tab is written by the same code that
 * recorded it. Keep it framework-free.
 */
import type { AuditEntry } from "./types";

export type AuditedCollection = AuditEntry["collection"];
export type AuditAction = AuditEntry["action"];

/** A Firestore document as the trigger hands it over. */
export type DocData = Record<string, unknown> | null;

/** Fields that say nothing about what a person changed. */
const NOISE = new Set(["createdAt", "updatedAt"]);

/**
 * Writers whose rows are not "somebody changed a figure".
 *
 * A bulk import is the baseline arriving, not an edit: the 2026 workbooks land
 * 1,615 screening figures and ~146,000 truck scans in one run, and auditing
 * each would bury the handful of rows a person actually needs to see under a
 * hundred thousand that say "the import imported something". What the import
 * did is recorded where it belongs — the generated report in docs/ and the
 * commit that carried the seed.
 *
 * Only the Admin SDK can write these: the security rules force `updatedBy` and
 * `officerUid` to equal the signed-in account on every client write, and no
 * account has one of these ids. A DELETE of an imported row is still audited,
 * because the row being deleted is not what identifies the person deleting it.
 */
const BULK_IMPORT_ACTORS = new Set(["seed", "import"]);

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** The fields that differ, with what each was and became. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (NOISE.has(key)) continue;
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) {
      changed[key] = { from: from ?? null, to: to ?? null };
    }
  }
  return changed;
}

/**
 * Who the document names as its writer. The security rules force `updatedBy`
 * (and `officerUid` on a scan) to match the signed-in account on every create
 * and update, so for those this is as good as an authenticated actor. A DELETE
 * is the exception — see `actorIsAuthor` on AuditEntry.
 */
export function actorOf(doc: DocData): { actor: string; actorName: string } {
  if (!doc) return { actor: "", actorName: "" };
  return {
    actor: str(doc.updatedBy) || str(doc.officerUid),
    actorName: str(doc.updatedByName) || str(doc.officerName),
  };
}

/** The one-line story of a change, written for the person reading the panel. */
export function summariseChange(
  collection: AuditedCollection,
  action: AuditAction,
  before: DocData,
  after: DocData,
): string {
  const doc = after || before || {};
  const who = str(doc.updatedByName) || str(doc.officerName) || "someone";

  if (collection === "dailyEntries") {
    const where = doc.border ? ` at ${str(doc.border)}` : "";
    const when = doc.date ? ` for ${str(doc.date)}` : "";
    const what = str(doc.label) || str(doc.kind) || "entry";
    if (action === "updated") {
      const from = num(before?.value);
      const to = num(after?.value);
      if (from !== null && to !== null && from !== to) {
        return `${who} changed ${what}${where}${when} from ${from} to ${to}`;
      }
      return `${who} edited ${what}${where}${when}`;
    }
    const value = num(doc.value);
    const figure = value === null ? "" : ` = ${value}`;
    // A delete does not name who did it - see actorIsAuthor - so the line must
    // not read as though the author removed their own figure. They usually did
    // not: a re-import supersedes a typed figure, and the officer who wrote it
    // is the last person who should be blamed for its removal.
    if (action === "deleted") {
      return `${what}${figure}${where}${when} was removed — last written by ${who}`;
    }
    return `${who} logged ${what}${figure}${where}${when}`;
  }

  if (collection === "truckScans") {
    const id = str(doc.vehicleId) || "a unit";
    const where = doc.border ? ` at ${str(doc.border)}` : "";
    const dose = num(doc.doseNSvH);
    const reading = dose === null ? "" : ` (${dose} nSv/h)`;
    if (action === "deleted") {
      return `the scan of ${id}${reading}${where} was removed — last logged by ${who}`;
    }
    return `${who} scanned ${id}${reading}${where}`;
  }

  // workPlanBaseline: the opening balances, which move every cumulative figure
  // at once without anyone logging a thing.
  const values = (after?.values || {}) as Record<string, number[]>;
  const previous = (before?.values || {}) as Record<string, number[]>;
  const moved = Object.keys({ ...previous, ...values }).filter(
    (id) =>
      JSON.stringify(previous[id] ?? null) !== JSON.stringify(values[id] ?? null),
  );
  if (!moved.length) return `${who} saved the work plan opening balance`;
  const shown = moved.slice(0, 6).join(", ");
  return (
    `${who} saved the work plan opening balance — ${moved.length} output` +
    `${moved.length === 1 ? "" : "s"} changed (${shown}${moved.length > 6 ? ", …" : ""})`
  );
}

/**
 * Movement in the reported figure. The panel reads this off the row rather
 * than re-deriving it from the before/after documents.
 */
export function figureDelta(before: DocData, after: DocData): number | undefined {
  const from = num(before?.value) ?? 0;
  const to = num(after?.value) ?? 0;
  if (from === 0 && to === 0) return undefined;
  return to - from;
}

/**
 * The audit row for one change, or null when the write changed nothing a
 * person did — the store rewrites `createdAt` when it replaces a figure, and a
 * no-op write would otherwise fill the log with rows that say nothing.
 */
export function buildAuditEntry(
  collection: AuditedCollection,
  docId: string,
  before: DocData,
  after: DocData,
  at: string = new Date().toISOString(),
): Omit<AuditEntry, "id"> | null {
  if (!before && !after) return null;
  const action: AuditAction = !before ? "created" : !after ? "deleted" : "updated";

  const changed = before && after ? diffFields(before, after) : undefined;
  if (changed && Object.keys(changed).length === 0) return null;

  const source = after || before;
  // A row the import wrote or rewrote. A delete still counts: `after` is null
  // there, so this only skips creates and updates made BY the importer.
  if (after && BULK_IMPORT_ACTORS.has(actorOf(after).actor)) return null;
  const entry: Omit<AuditEntry, "id"> = {
    at,
    collection,
    docId,
    action,
    ...actorOf(source),
    actorIsAuthor: action !== "deleted",
    summary: summariseChange(collection, action, before, after),
    before,
    after,
  };
  if (changed) entry.changed = changed;

  if (source?.section) entry.section = source.section as AuditEntry["section"];
  if (source?.border) entry.border = str(source.border);
  if (source?.date) entry.date = str(source.date);
  if (source?.metricKey) entry.metricKey = str(source.metricKey);
  if (collection === "dailyEntries" && source?.kind === "count") {
    const delta = figureDelta(before, after);
    if (delta !== undefined) entry.delta = delta;
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------

/**
 * Rows worth a second look, newest first — the movements somebody should be
 * able to account for. A figure being logged for the first time is ordinary;
 * one being replaced, removed, or moved by more than `bigMove` is not.
 */
export function notableChanges(
  entries: AuditEntry[],
  bigMove = 1000,
): AuditEntry[] {
  return entries
    .filter(
      (e) =>
        e.action !== "created" ||
        (typeof e.delta === "number" && Math.abs(e.delta) >= bigMove),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Net movement in the reported figures across a set of rows. */
export function netMovement(entries: AuditEntry[]): number {
  return entries.reduce((total, e) => total + (e.delta || 0), 0);
}

export interface AuditActorSummary {
  actor: string;
  name: string;
  changes: number;
  net: number;
  last: string;
}

/** Who has been changing figures, and by how much on balance. */
export function auditByActor(entries: AuditEntry[]): AuditActorSummary[] {
  const groups = new Map<string, AuditEntry[]>();
  for (const e of entries) {
    const key = e.actor || "(unknown)";
    groups.set(key, [...(groups.get(key) || []), e]);
  }
  return [...groups.entries()]
    .map(([actor, rows]) => ({
      actor,
      name: rows.find((r) => r.actorName)?.actorName || "(no name)",
      changes: rows.length,
      net: netMovement(rows),
      last: rows.map((r) => r.at).sort().reverse()[0] || "",
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.changes - a.changes);
}
