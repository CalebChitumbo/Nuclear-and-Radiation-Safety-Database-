/**
 * Rebuild the staff directory from the account documents.
 *
 * `directory/{uid}` is the slice of `users/{uid}` every approved officer may
 * read — name, section, grade, who the account reports to — and it is what
 * the Tasks desk (and firestore.rules) read to say who may give work to whom.
 * onUserDocWrite keeps it in step from the moment it is deployed, but the
 * accounts that already existed then have no directory line until they are
 * next written. This writes one for every account, once.
 *
 * Safe to re-run: it writes what the account documents say now, and removes
 * directory lines whose account is gone.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run sync:directory
 */
import { getFirestore } from "firebase-admin/firestore";
import { initAdminApp } from "./adminApp";
import { directoryEntry } from "../lib/rules/tasks";
import type { UserDoc } from "../lib/rules/types";

async function main() {
  initAdminApp();
  const db = getFirestore();
  const users = await db.collection("users").get();
  const existing = await db.collection("directory").get();
  const batch = db.batch();
  const kept = new Set<string>();
  let placed = 0;
  for (const d of users.docs) {
    const user = { ...(d.data() as Omit<UserDoc, "uid">), uid: d.id };
    const entry = directoryEntry(user);
    batch.set(db.doc(`directory/${d.id}`), entry);
    kept.add(d.id);
    if (entry.grade || entry.reportsTo) placed += 1;
    console.log(
      `${entry.active ? "  " : "x "}${entry.displayName.padEnd(32)} ${String(entry.section).padEnd(40)} ${
        entry.grade || "(no grade)"
      }${entry.reportsTo ? `  → ${entry.reportsTo}` : ""}`,
    );
  }
  let removed = 0;
  for (const d of existing.docs) {
    if (!kept.has(d.id)) {
      batch.delete(d.ref);
      removed += 1;
    }
  }
  await batch.commit();
  console.log(
    `\n${users.size} accounts written to the directory (${placed} placed on the reporting line), ${removed} stale lines removed.`,
  );
  if (placed < users.size) {
    console.log(
      "Accounts with no grade or supervisor can be given work by nobody but themselves and an administrator — place them on the Users desk.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
