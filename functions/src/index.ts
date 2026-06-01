/**
 * RPA Regulatory System — Cloud Functions (2nd gen)
 *
 * 1. onFacilityWrite — maintain aggregates/dashboard.
 * 2. setUserClaims — callable, admin-only: create Auth user + users/{uid} +
 *    custom claims {role, section}.
 * 3. onUserDocWrite — keep custom claims in sync if an admin edits a user.
 * 4. ingestRaisEmail — inbound-email connector that auto-updates the licensing
 *    status from forwarded RAIS notification emails (see ./rais/ingest).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();

export { ingestRaisEmail } from "./rais/ingest";

const PROVINCES = [
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
] as const;

interface AggBucket {
  total: number;
  licensed: number;
}

interface FacilityShape {
  licensed?: boolean;
  province?: string;
  sector?: string;
  stage?: string;
  auths?: unknown[];
}

async function recomputeAggregate() {
  const db = getFirestore();
  const snap = await db.collection("facilities").get();
  const byProvince: Record<string, AggBucket> = {};
  for (const p of PROVINCES) byProvince[p] = { total: 0, licensed: 0 };
  const bySector = {
    Public: { total: 0, licensed: 0 },
    Private: { total: 0, licensed: 0 },
  };
  const byStage: Record<string, number> = {};
  let total = 0;
  let licensed = 0;
  let auths = 0;

  snap.forEach((doc) => {
    const f = doc.data() as FacilityShape;
    total += 1;
    if (f.licensed) licensed += 1;
    auths += Array.isArray(f.auths) ? f.auths.length : 0;
    if (f.province && PROVINCES.includes(f.province as (typeof PROVINCES)[number])) {
      byProvince[f.province].total += 1;
      if (f.licensed) byProvince[f.province].licensed += 1;
    }
    const s = f.sector === "Public" ? bySector.Public : bySector.Private;
    s.total += 1;
    if (f.licensed) s.licensed += 1;
    if (f.stage) byStage[f.stage] = (byStage[f.stage] || 0) + 1;
  });

  await db.doc("aggregates/dashboard").set({
    total,
    licensed,
    unlicensed: total - licensed,
    auths,
    bySector,
    byProvince,
    byStage,
    updatedAt: new Date().toISOString(),
  });
}

export const onFacilityWrite = onDocumentWritten(
  { document: "facilities/{id}", region: "us-central1" },
  async () => {
    try {
      await recomputeAggregate();
    } catch (err) {
      console.error("Failed to recompute aggregate", err);
    }
  },
);

export const setUserClaims = onCall(async (request) => {
  const caller = request.auth;
  if (!caller || caller.token.role !== "admin") {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const {
    email,
    password,
    displayName,
    role,
    section,
  } = request.data as {
    email?: string;
    password?: string;
    displayName?: string;
    role?: string;
    section?: string;
  };
  if (!email || !password) {
    throw new HttpsError("invalid-argument", "email + password required");
  }
  const allowedRoles = ["admin", "officer"];
  const allowedSections = [
    "Authorisation & Standards",
    "Inspectorate",
    "Nuclear Safety, Security & Safeguards",
    "National Source Inventory",
    "All",
  ];
  if (!role || !allowedRoles.includes(role)) {
    throw new HttpsError("invalid-argument", "invalid role");
  }
  if (!section || !allowedSections.includes(section)) {
    throw new HttpsError("invalid-argument", "invalid section");
  }

  const auth = getAuth();
  const db = getFirestore();
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
  } catch {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: displayName || email,
    });
  }

  await auth.setCustomUserClaims(userRecord.uid, { role, section });
  await db.doc(`users/${userRecord.uid}`).set(
    {
      email,
      displayName: displayName || email,
      role,
      section,
    },
    { merge: true },
  );
  return { uid: userRecord.uid };
});

export const onUserDocWrite = onDocumentWritten(
  { document: "users/{uid}", region: "us-central1" },
  async (event) => {
    const uid = event.params.uid as string;
    const after = event.data?.after?.data() as
      | { role?: string; section?: string }
      | undefined;
    if (!after) return;
    try {
      await getAuth().setCustomUserClaims(uid, {
        role: after.role || "officer",
        section: after.section || "All",
      });
    } catch (err) {
      console.error("Failed to sync custom claims for", uid, err);
    }
  },
);
