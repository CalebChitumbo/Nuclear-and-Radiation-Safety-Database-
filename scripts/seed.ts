/**
 * Seed script — writes the 474-facility register, the 2026 reporting-week
 * calendar, and the initial aggregates/dashboard document to Firestore.
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
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mapAllSeed, type SeedFacility } from "../lib/store/seeding";
import { computeAggregate } from "../lib/rules/aggregate";

const SEED_DIR = join(process.cwd(), "seed");

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

  const facilities = mapAllSeed(facilitiesRaw);
  console.log(`Seeding ${facilities.length} facilities…`);

  await chunkedBatchWrite(facilities, 400, (f, batch) => {
    batch.set(db.doc(`facilities/${f.id}`), f);
  });

  console.log("Writing reference lists + week calendar…");
  await db.doc("config/referenceLists").set({
    provinces: [
      "Lusaka",
      "Copperbelt",
      "North-Western",
      "Central",
      "Northern",
      "Luapula",
      "Eastern",
      "Western",
      "Southern",
      "Muchinga",
    ],
    sectors: ["Public", "Private"],
    stages: [
      "Licensed",
      "No Application Submitted",
      "Invoice Generation Pending",
      "Waiting for Payment",
      "Accounts Clearance Pending",
      "Waiting for Review and Assessment",
      "Under Internal Review (Further Information Required)",
      "CEO Licence Approval Required",
      "Import Licence Only (Not yet Use/Possession)",
    ],
    licenceTypes: [
      "New Use/Possession Licence",
      "Renewal of Use/Possession Licence",
      "Importation Licence",
      "Export Licence",
      "Transfer Licence",
      "Transport Licence",
      "Transit Licence",
      "Variation of Terms and Conditions",
      "Design and Construction Licence",
      "Decommissioning Licence",
    ],
    inspectionTypes: [
      "Routine Inspection",
      "Follow-up",
      "Pre-Authorisation",
      "Investigation",
      "Enforcement Action",
    ],
    weeks,
  });

  console.log("Computing dashboard aggregate…");
  const agg = computeAggregate(facilities);
  await db.doc("aggregates/dashboard").set(agg);
  console.log(
    `Done. total=${agg.total} licensed=${agg.licensed} unlicensed=${agg.unlicensed} auths=${agg.auths}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
