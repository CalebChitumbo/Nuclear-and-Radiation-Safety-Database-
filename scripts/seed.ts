/**
 * Seed script — writes the facility register (2026 Licensing Status), the
 * 2026 reporting-week calendar, the inland offices and their 2026 daily
 * screening log, and the initial aggregates/dashboard document to Firestore.
 *
 * Usage (Admin SDK against the live project):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     npm run seed
 *
 * Usage (against the local emulator):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *     FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *     npm run seed:emulator
 *
 * The script is idempotent — facility doc IDs are stable (the FAC/#### code, or
 * the facility's name where RAIS has issued none), and so are the border and
 * daily screening IDs (post name, and post + date), so re-running updates in
 * place. A screening figure an officer has since corrected is overwritten by
 * the workbook's; nothing is ever added twice.
 *
 * PRUNING (`--prune`): a register re-import can supersede a facility document
 * rather than update it (the workbook dropped it, or RAIS has since issued it a
 * RAN and its id changed). Those are reported on every run and deleted only
 * with this flag — and only when they carry no `updatedBy`, so a facility added
 * or edited in the app is never removed by a seed.
 *
 * FRESH START (`npm run seed:fresh`, i.e. `--fresh`): first DELETES the whole
 * register and its linked history — facilities, licenceEvents, inspections,
 * inspectionRequests, licenceWorkflows — then seeds the new register. Use for
 * a register replacement like the 2026 Licensing Status import, where the
 * old facility list (and the history recorded against it) must not linger.
 * Users, weeks, weekly metrics, daily entries, borders and activities are
 * kept.
 */

import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { initAdminApp } from "./adminApp";
import {
  mapAllSeed,
  mapSeedBorders,
  mapSeedScreening,
  type SeedFacility,
  type SeedScreening,
} from "../lib/store/seeding";
import { computeAggregate } from "../lib/rules/aggregate";
import {
  CATEGORIES,
  INSPECTION_TYPES,
  LICENCE_TYPES,
  PROVINCES,
  SECTORS,
  STAGES,
} from "../lib/rules/types";

const SEED_DIR = join(process.cwd(), "seed");
const FRESH = process.argv.includes("--fresh");
const PRUNE = process.argv.includes("--prune");

/** Collections wiped by --fresh: the register + everything keyed to it. */
const FRESH_WIPE_COLLECTIONS = [
  "facilities",
  "licenceEvents",
  "inspections",
  "inspectionRequests",
  "licenceWorkflows",
];

async function wipeCollection(name: string) {
  const db = getFirestore();
  let deleted = 0;
  for (;;) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
  }
  console.log(`  wiped ${name} (${deleted} docs)`);
}

async function chunkedBatchWrite<T>(
  items: T[],
  size: number,
  apply: (item: T, batch: FirebaseFirestore.WriteBatch) => void,
) {
  const db = getFirestore();
  for (let i = 0; i < items.length; i += size) {
    const batch = db.batch();
    items.slice(i, i + size).forEach((it) => apply(it, batch));
    await batch.commit();
    process.stdout.write(
      `  wrote batch ${i + 1}-${Math.min(i + size, items.length)}/${items.length}\n`,
    );
  }
}

/**
 * Facility documents the project holds that this seed does not produce.
 *
 * A register re-import can supersede a document rather than update it — a
 * facility the workbook has dropped, or one whose id changed because RAIS has
 * since issued it a RAN. Left behind, it shows on the register twice.
 *
 * Deleting is opt-in (`--prune`) and only ever touches documents that carry no
 * `updatedBy`, i.e. ones a previous seed wrote and nobody has touched in the
 * app. A facility an officer added or edited is always reported and kept — the
 * workbook is not authoritative over their work.
 */
async function reportSupersededFacilities(seededIds: Set<string>) {
  const db = getFirestore();
  const snap = await db.collection("facilities").select("updatedBy", "name").get();
  const extras = snap.docs.filter((d) => !seededIds.has(d.id));
  if (extras.length === 0) {
    console.log("  no superseded facility documents");
    return;
  }

  const stale = extras.filter((d) => !d.get("updatedBy"));
  const touched = extras.filter((d) => d.get("updatedBy"));

  if (touched.length) {
    console.log(
      `  ${touched.length} facility document(s) not in this register were ` +
        "added or edited in the app — keeping them:",
    );
    for (const d of touched) console.log(`    ${d.id}  ${d.get("name") || ""}`);
  }
  if (stale.length === 0) return;

  console.log(
    `  ${stale.length} facility document(s) superseded by this register ` +
      "(written by a previous seed, never touched in the app):",
  );
  for (const d of stale) console.log(`    ${d.id}  ${d.get("name") || ""}`);

  if (!PRUNE) {
    console.log(
      "  Left in place. Re-run with --prune to delete them " +
        "(npm run seed -- --prune).",
    );
    return;
  }
  await chunkedBatchWrite(stale, 400, (d, batch) => batch.delete(d.ref));
  console.log(`  pruned ${stale.length} superseded facility document(s)`);
}

async function main() {
  initAdminApp();
  const db = getFirestore();

  const facilitiesRaw = JSON.parse(
    readFileSync(join(SEED_DIR, "facilities.seed.json"), "utf-8"),
  ) as SeedFacility[];
  const weeks = JSON.parse(
    readFileSync(join(SEED_DIR, "weeks-2026.seed.json"), "utf-8"),
  );
  const screening = JSON.parse(
    readFileSync(join(SEED_DIR, "daily-screening-2026.seed.json"), "utf-8"),
  ) as SeedScreening;

  if (FRESH) {
    console.log(
      "FRESH START — wiping the register and its linked history first…",
    );
    for (const c of FRESH_WIPE_COLLECTIONS) await wipeCollection(c);
  }

  const facilities = mapAllSeed(facilitiesRaw);
  console.log(`Seeding ${facilities.length} facilities…`);

  await chunkedBatchWrite(facilities, 400, (f, batch) => {
    batch.set(db.doc(`facilities/${f.id}`), f);
  });

  await reportSupersededFacilities(new Set(facilities.map((f) => f.id)));

  // The inland offices and their daily screening figures. Seeded as ordinary
  // daily entries so the NSSS tab, the weekly report and work plan output
  // 1.3.12 all count them — see docs/daily-screening-2026-import.md.
  const borders = mapSeedBorders(screening);
  const screeningEntries = mapSeedScreening(screening, weeks);
  console.log(
    `Seeding ${borders.length} border posts and ` +
      `${screeningEntries.length} daily screening entries…`,
  );
  // A post the section has since deactivated stays deactivated — the seed
  // supplies the register of posts, not their current state.
  const existingBorders = new Set(
    (await db.collection("borders").select().get()).docs.map((d) => d.id),
  );
  const newBorders = borders.filter((b) => !existingBorders.has(b.id));
  await chunkedBatchWrite(newBorders, 400, (b, batch) => {
    batch.set(db.doc(`borders/${b.id}`), b);
  });
  await chunkedBatchWrite(screeningEntries, 400, (e, batch) => {
    const { id, ...rest } = e;
    batch.set(db.doc(`dailyEntries/${id}`), rest);
  });

  console.log("Writing reference lists + week calendar…");
  // Single source of truth: lib/rules/types.ts — hardcoding these here once
  // silently dropped newly added stages from the reference doc.
  await db.doc("config/referenceLists").set({
    provinces: [...PROVINCES],
    sectors: [...SECTORS],
    categories: [...CATEGORIES],
    stages: [...STAGES],
    licenceTypes: [...LICENCE_TYPES],
    inspectionTypes: [...INSPECTION_TYPES],
    weeks,
  });

  console.log("Computing dashboard aggregate…");
  const agg = computeAggregate(facilities);
  await db.doc("aggregates/dashboard").set(agg);
  console.log(
    `Done. total=${agg.total} licensed=${agg.licensed} unlicensed=${agg.unlicensed} ` +
      `functional=${agg.functional} auths=${agg.auths}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
