/**
 * Collapse post-days that carry more than one screening figure.
 *
 * From here on a post's figure for a day is written to that post-day's own
 * document (`screeningEntryId`), so logging it again corrects it rather than
 * adding a second figure. That rule cannot reach backwards: post-days already
 * holding two or three figures keep counting all of them, and the cumulative
 * screened total (output 1.3.12) stays inflated by the difference.
 *
 * This is the one-off that fixes those. For each post-day holding more than one
 * figure it keeps ONE — the most recently written, which is the correction
 * somebody made last — moves it to the post-day's own document id, and removes
 * the rest.
 *
 * Usage — LOOK FIRST. Nothing is written without --apply:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     npx tsx scripts/collapse-duplicate-screening.ts
 *
 *   ... then, once the plan reads correctly:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     npx tsx scripts/collapse-duplicate-screening.ts --apply
 *
 * Options
 *   --apply       Actually write. Without it this only reports.
 *   --post "<n>"  Restrict to one inland office.
 *
 * Every write goes through the audit trigger, so what this removes is on the
 * record with the figure it removed — run scripts/screening-audit.ts afterwards
 * to see the collapse itself in the trail.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

import { screeningEntryId, vehicleScreeningKey } from "../lib/rules/daily";
import { duplicatePostDays, screeningEntries } from "../lib/rules/screeningAudit";
import type { DailyEntry } from "../lib/rules/types";

const APPLY = process.argv.includes("--apply");

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function init() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, "utf-8"))) });
  } else {
    initializeApp();
  }
}

/**
 * The figure to keep: the one written last. An imported workbook figure has no
 * `createdAt`, so it sorts oldest — which is right, since anything an officer
 * logged afterwards was them correcting it.
 */
function keeper(entries: DailyEntry[]): DailyEntry {
  return [...entries].sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || ""),
  )[entries.length - 1];
}

async function main() {
  init();
  const db = getFirestore();
  const post = arg("post");

  const snap = await db.collection("dailyEntries").get();
  const all: DailyEntry[] = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<DailyEntry, "id">) }),
  );
  const entries = screeningEntries(all, vehicleScreeningKey()).filter(
    (e) => !post || e.border === post,
  );

  // A post-day with no post on it (head office / other) can legitimately hold
  // more than one figure, and has no derived id to collapse to.
  const duplicates = duplicatePostDays(entries).filter((d) => d.border !== "(no post)");

  if (!duplicates.length) {
    console.log("No post-day holds more than one screening figure. Nothing to do.");
    return;
  }

  let removed = 0;
  let reclaimed = 0;
  const plan: Array<{ keep: DailyEntry; drop: DailyEntry[]; targetId: string }> = [];

  for (const dup of duplicates) {
    const keep = keeper(dup.entries);
    const targetId = screeningEntryId(dup.date, dup.border);
    const drop = dup.entries.filter((e) => e.id !== keep.id);
    plan.push({ keep, drop, targetId });
    removed += drop.length;
    reclaimed += drop.reduce(
      (total, e) => total + (typeof e.value === "number" ? e.value : 0),
      0,
    );
  }

  console.log(
    `${duplicates.length} post-days hold more than one figure.\n` +
      `Keeping the most recent of each, removing ${removed} others, ` +
      `taking ${reclaimed.toLocaleString()} off the cumulative total.\n`,
  );

  for (const { keep, drop, targetId } of plan) {
    const at = keep.createdAt ? ` written ${keep.createdAt.slice(0, 16).replace("T", " ")}` : " (imported)";
    console.log(
      `${keep.border} ${keep.date}: keep ${keep.value}${at} by ${
        keep.updatedByName || keep.updatedBy || "?"
      }` + (keep.id === targetId ? "" : ` → ${targetId}`),
    );
    for (const e of drop) {
      // The figure sitting at the post-day's own id is overwritten by the
      // keeper rather than deleted - same outcome for the total, but saying
      // "drop" of a document that survives reads as a mistake.
      const verb = e.id === targetId ? "replace" : "drop   ";
      console.log(
        `    ${verb} ${String(e.value).padStart(6)}  ${e.id}  ${
          e.updatedByName || e.updatedBy || "?"
        }`,
      );
    }
  }

  if (!APPLY) {
    console.log("\nNothing written. Re-run with --apply to make these changes.");
    return;
  }

  for (const { keep, drop, targetId } of plan) {
    // Write the keeper to the post-day's own id first, so a failure part way
    // through can only ever leave the day counted twice - never zero.
    if (keep.id !== targetId) {
      const { id: _id, ...body } = keep;
      await db.doc(`dailyEntries/${targetId}`).set(body);
    }
    for (const e of drop) {
      if (e.id === targetId) continue;
      await db.doc(`dailyEntries/${e.id}`).delete();
    }
    if (keep.id !== targetId) await db.doc(`dailyEntries/${keep.id}`).delete();
  }

  console.log(
    `\nDone. ${removed} duplicate figures removed; the cumulative screened ` +
      `total drops by ${reclaimed.toLocaleString()}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
