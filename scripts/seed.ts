/**
 * Seed script — writes the facility register (2026 Facility Status List), the
 * 2026 reporting-week calendar, and the initial aggregates/dashboard document
 * to Firestore.
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
 * The script is idempotent — facility doc IDs are stable (derived from the
 * FAC/#### code or the seed sequence number), so re-running updates in place.
 *
 * FRESH START (`npm run seed:fresh`, i.e. `--fresh`): first DELETES the whole
 * register and its linked history — facilities, licenceEvents, inspections,
 * inspectionRequests, licenceWorkflows — then seeds the new register. Use for
 * a register replacement like the 2026 Facility Status List import, where the
 * old facility list (and the history recorded against it) must not linger.
 * Users, weeks, weekly metrics, daily entries, borders and activities are
 * kept.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mapAllSeed, type SeedFacility } from "../lib/store/seeding";
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

function init() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    const sa = JSON.parse(readFileSync(credPath, "utf-8"));
    initializeApp({ credential: cert(sa) });
  } else {
    initializeApp();
  }
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

async function main() {
  init();
  const db = getFirestore();

  const facilitiesRaw = JSON.parse(
    readFileSync(join(SEED_DIR, "facilities.seed.json"), "utf-8"),
  ) as SeedFacility[];
  const weeks = JSON.parse(
    readFileSync(join(SEED_DIR, "weeks-2026.seed.json"), "utf-8"),
  );

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
