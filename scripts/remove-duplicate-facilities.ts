/**
 * Collapse facilities the live register holds twice.
 *
 * A register re-import can write a facility under a new id (a `seed-…` slug
 * where an earlier seed used `fac-NN`). The seed prunes the old document only
 * if nobody touched it in the app — an officer clearing its review flag is
 * enough to keep it — so the same facility, with the same licences, sits on
 * the register twice, and every licences-issued figure reads high by exactly
 * its authorisations. Sep 2026: three of them put the dashboard at 400 where
 * output 1.1.4 reported 392.
 *
 * This finds each live document that is NOT in the current seed but shares
 * its name with one that is, shows the pair, and — with `--apply` — deletes
 * the off-seed document after carrying the officer's review (`needsReview`,
 * `updatedBy`, `updatedAt`) onto the surviving one. Nothing else is moved: the
 * surviving document is the register's, and the pair is only collapsed when
 * the two hold the same licences, so no authorisation is lost. A pair whose
 * licences differ is reported and left for an officer.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     npm run fix:duplicate-facilities            # dry run
 *     npm run fix:duplicate-facilities -- --apply # write
 */
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { initAdminApp } from "./adminApp";
import type { Authorisation, Facility } from "../lib/rules/types";
import { mapAllSeed, type SeedFacility } from "../lib/store/seeding";

const APPLY = process.argv.includes("--apply");

const authKey = (a: Authorisation) =>
  `${a.type}|${a.number || ""}|${a.date || ""}|${a.quarter || ""}`;
const sameAuths = (a: Authorisation[] = [], b: Authorisation[] = []) =>
  a.length === b.length &&
  [...a].map(authKey).sort().join("\n") === [...b].map(authKey).sort().join("\n");

async function main() {
  initAdminApp();
  const db = getFirestore();

  const seed = JSON.parse(
    readFileSync(join(process.cwd(), "seed", "facilities.seed.json"), "utf8"),
  ) as SeedFacility[];
  const seededIds = new Set(mapAllSeed(seed).map((f) => f.id));

  const snap = await db.collection("facilities").get();
  const live = snap.docs.map((d) => ({ ref: d.ref, ...(d.data() as Facility) }));
  const onSeedByName = new Map<string, (typeof live)[number]>();
  for (const f of live) {
    if (seededIds.has(f.id)) onSeedByName.set(f.name.trim().toLowerCase(), f);
  }

  const pairs = live
    .filter((f) => !seededIds.has(f.id))
    .map((old) => ({ old, keep: onSeedByName.get(old.name.trim().toLowerCase()) }))
    .filter((p): p is { old: (typeof live)[number]; keep: (typeof live)[number] } =>
      !!p.keep,
    );

  if (!pairs.length) {
    console.log("No facility is on the register twice.");
    return;
  }

  console.log(`${pairs.length} facility(ies) on the register twice:\n`);
  const batch = db.batch();
  let collapsing = 0;
  for (const { old, keep } of pairs) {
    const same = sameAuths(old.auths, keep.auths);
    console.log(`${old.name}`);
    console.log(
      `  remove ${old.id.padEnd(14)} ${old.auths?.length ?? 0} licence(s)` +
        `  edited by ${old.updatedBy || "-"} ${old.updatedAt || ""}`,
    );
    console.log(
      `  keep   ${keep.id.padEnd(14)} ${keep.auths?.length ?? 0} licence(s)` +
        `  needsReview=${!!keep.needsReview}`,
    );
    if (!same) {
      console.log("  ⚠ the two hold different licences — left for an officer\n");
      continue;
    }
    collapsing++;
    const carry: Partial<Facility> = {};
    if (old.updatedBy) {
      carry.updatedBy = old.updatedBy;
      if (old.updatedAt) carry.updatedAt = old.updatedAt;
      // The officer's review of the old record was a review of this facility.
      if (old.needsReview === false && keep.needsReview) {
        carry.needsReview = false;
        console.log("  carry  review cleared by the officer → surviving record");
      }
    }
    if (APPLY) {
      if (Object.keys(carry).length) batch.set(keep.ref, carry, { merge: true });
      batch.delete(old.ref);
    }
    console.log("");
  }

  if (!APPLY) {
    console.log(
      `Dry run — ${collapsing} would be collapsed. Re-run with --apply to write.`,
    );
    return;
  }
  await batch.commit();
  console.log(`Collapsed ${collapsing} duplicate facility document(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
