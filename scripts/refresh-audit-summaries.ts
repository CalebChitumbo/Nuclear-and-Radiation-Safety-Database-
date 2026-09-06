/**
 * Re-render the one-line summary on existing audit rows.
 *
 * An audit row stores two things: what the document was and what it became
 * (`before` / `after`), and a sentence describing that for a person reading
 * the panel. The first is the record; the second is a rendering of it, written
 * by `summariseChange`.
 *
 * When the rendering is wrong, the rows already written keep saying the wrong
 * thing. That is not academic: the first version made a deletion read as
 * "Luuma Michelo removed Vehicles screened = 210", when what actually happened
 * was that a workbook re-import superseded her typed figure. A Firestore
 * trigger is never told who deleted a document, so no delete can name its
 * author — and a log that misattributes one is worse than a log that says it
 * does not know.
 *
 * This recomputes `summary` from each row's OWN untouched `before`/`after`. It
 * changes no record of what happened, only the sentence describing it, and it
 * is reproducible: run it again and nothing moves. Everything else on the row,
 * `at` included, is left exactly as written.
 *
 * Usage — reports and writes nothing without --apply:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     npx tsx scripts/refresh-audit-summaries.ts
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     npx tsx scripts/refresh-audit-summaries.ts --apply
 */
import { getFirestore } from "firebase-admin/firestore";

import { initAdminApp } from "./adminApp";
import { summariseChange, type AuditedCollection } from "../lib/rules/auditLog";
import type { AuditEntry } from "../lib/rules/types";

const APPLY = process.argv.includes("--apply");
const BATCH = 400;

async function main() {
  initAdminApp();
  const db = getFirestore();

  const snap = await db.collection("auditLog").get();
  console.log(`${snap.size.toLocaleString()} audit rows.\n`);

  let batch = db.batch();
  let inBatch = 0;
  let changed = 0;
  const samples: Array<[string, string]> = [];

  for (const doc of snap.docs) {
    const row = doc.data() as Omit<AuditEntry, "id">;
    const fresh = summariseChange(
      row.collection as AuditedCollection,
      row.action,
      (row.before as Record<string, unknown>) ?? null,
      (row.after as Record<string, unknown>) ?? null,
    );
    if (fresh === row.summary) continue;
    changed += 1;
    if (samples.length < 5) samples.push([row.summary, fresh]);
    batch.update(doc.ref, { summary: fresh });
    inBatch += 1;
    if (inBatch >= BATCH) {
      if (APPLY) await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch && APPLY) await batch.commit();

  if (!changed) {
    console.log("Every summary already reads as the current wording would write it.");
    return;
  }
  console.log(`${changed.toLocaleString()} row(s) ${APPLY ? "re-rendered" : "would change"}:\n`);
  for (const [was, now] of samples) {
    console.log(`  was: ${was}\n  now: ${now}\n`);
  }
  if (!APPLY) console.log("Nothing written. Re-run with --apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
