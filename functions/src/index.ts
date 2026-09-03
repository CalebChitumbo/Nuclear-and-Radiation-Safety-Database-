/**
 * RPA Regulatory System — Cloud Functions (2nd gen)
 *
 * 1. onFacilityWrite — maintain aggregates/dashboard.
 * 2. setUserClaims — callable, admin-only: create Auth user + users/{uid} +
 *    custom claims {role, section}.
 * 3. onUserDocWrite — keep custom claims in sync with the account document, and
 *    withhold them entirely from an account that is pending approval, declined
 *    or disabled. This is what lets anyone sign themselves up without that
 *    granting them anything until an administrator approves it.
 * 4. ingestRaisEmail — inbound-email connector that auto-updates the licensing
 *    status from forwarded RAIS notification emails (see ./rais/ingest).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
// The RAIS parser leaves some optional fields (e.g. paymentRan, matchScore)
// undefined when absent. The Admin SDK rejects undefined values unless told to
// ignore them, so configure that once here before any Firestore access.
getFirestore().settings({ ignoreUndefinedProperties: true });

export { ingestRaisEmail } from "./rais/ingest";

// Single source of truth for the province list: lib/rules/types.ts, copied in
// by functions/scripts/sync-rules.js at build time. A locally re-declared copy
// here would silently drop a newly added province from the dashboard rollup.
import { PROVINCES } from "./rais/rules/types";

interface AggBucket {
  total: number;
  licensed: number;
}

interface FacilityShape {
  licensed?: boolean;
  functional?: boolean;
  category?: string;
  province?: string;
  sector?: string;
  stage?: string;
  auths?: unknown[];
}

async function recomputeAggregate() {
  const db = getFirestore();
  // Stamped BEFORE the register scan starts. Concurrent invocations (e.g. a
  // bulk approval writing 30 facilities) finish in no guaranteed order, so a
  // scan that started earlier — and therefore counted an older register —
  // must never overwrite the result of one that started later.
  const countedAt = Date.now();
  const snap = await db.collection("facilities").get();
  const byProvince: Record<string, AggBucket> = {};
  for (const p of PROVINCES) byProvince[p] = { total: 0, licensed: 0 };
  const bySector = {
    Public: { total: 0, licensed: 0 },
    Private: { total: 0, licensed: 0 },
  };
  const byCategory = {
    Medical: { total: 0, licensed: 0 },
    "Non-Medical": { total: 0, licensed: 0 },
  };
  const byStage: Record<string, number> = {};
  let total = 0;
  let licensed = 0;
  let functional = 0;
  let auths = 0;

  snap.forEach((doc) => {
    const f = doc.data() as FacilityShape;
    total += 1;
    if (f.licensed) licensed += 1;
    // Docs written before the functional flag existed count as operating,
    // mirroring mapSeedFacility / computeAggregate in the app.
    if (f.functional !== false) functional += 1;
    auths += Array.isArray(f.auths) ? f.auths.length : 0;
    if (f.province && PROVINCES.includes(f.province as (typeof PROVINCES)[number])) {
      byProvince[f.province].total += 1;
      if (f.licensed) byProvince[f.province].licensed += 1;
    }
    const s = f.sector === "Public" ? bySector.Public : bySector.Private;
    s.total += 1;
    if (f.licensed) s.licensed += 1;
    const c =
      f.category === "Non-Medical" ? byCategory["Non-Medical"] : byCategory.Medical;
    c.total += 1;
    if (f.licensed) c.licensed += 1;
    if (f.stage) byStage[f.stage] = (byStage[f.stage] || 0) + 1;
  });

  // Transactional last-count-wins guard: drop this write if a count that
  // STARTED later has already landed, so the dashboard can't regress to a
  // stale total until the next facility write.
  const ref = db.doc("aggregates/dashboard");
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const prev = (cur.exists ? cur.data() : {}) as { countedAt?: number };
    if (typeof prev.countedAt === "number" && prev.countedAt > countedAt) {
      return;
    }
    tx.set(ref, {
      total,
      licensed,
      unlicensed: total - licensed,
      functional,
      auths,
      bySector,
      byCategory,
      byProvince,
      byStage,
      countedAt,
      updatedAt: new Date().toISOString(),
    });
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
    border,
  } = request.data as {
    email?: string;
    password?: string;
    displayName?: string;
    role?: string;
    section?: string;
    border?: string;
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
  // The inland office an NSSS officer is posted to. It is a claim, not just a
  // profile field, because the security rules enforce it: an officer with a
  // posting may only file screening figures against that office.
  const office = (border || "").trim().slice(0, 80);
  if (office && section !== "Nuclear Safety, Security & Safeguards") {
    throw new HttpsError(
      "invalid-argument",
      "only NSSS officers are posted to an inland office",
    );
  }

  const auth = getAuth();
  const db = getFirestore();
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    // Existing account: this call doubles as the admin's "reset password /
    // rename" path, so apply the submitted credentials rather than silently
    // dropping them.
    userRecord = await auth.updateUser(userRecord.uid, {
      password,
      displayName: displayName || email,
    });
  } catch (err) {
    // Only a missing account should fall through to creation; anything else
    // (network, quota, invalid password) must surface to the caller.
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    userRecord = await auth.createUser({
      email,
      password,
      displayName: displayName || email,
    });
  }

  await auth.setCustomUserClaims(userRecord.uid, {
    role,
    section,
    ...(office ? { border: office } : {}),
  });
  await db.doc(`users/${userRecord.uid}`).set(
    {
      uid: userRecord.uid,
      email,
      displayName: displayName || email,
      role,
      section,
      border: office,
      // Provisioned accounts are live the moment they are made — the approval
      // queue is for the requests officers file themselves.
      pending: false,
      disabled: false,
      origin: "provisioned",
    },
    { merge: true },
  );
  return { uid: userRecord.uid };
});

/**
 * Mirror an account document onto the Auth user's custom claims — and, just as
 * importantly, refuse to when it should hold none.
 *
 * This is the single gate that makes self-service sign-up safe. A person can
 * create their own sign-in and file their own account request, but the request
 * is stored `pending`, and a pending account gets an EMPTY claim set: no role,
 * no section, and therefore — since every rule in firestore.rules is gated on
 * approved() — no access to anything. Clearing `pending` is an administrator's
 * write, and that write is what mints the claims. A disabled account is treated
 * the same way, and its Auth user is disabled too so it cannot even sign in.
 */
export const onUserDocWrite = onDocumentWritten(
  { document: "users/{uid}", region: "us-central1" },
  async (event) => {
    const uid = event.params.uid as string;
    const after = event.data?.after?.data() as
      | {
          role?: string;
          section?: string;
          border?: string;
          pending?: boolean;
          disabled?: boolean;
        }
      | undefined;
    try {
      if (!after) {
        // The user doc was deleted: revoke the mirrored claims so the Auth
        // account loses all role/section access instead of keeping it forever.
        await getAuth().setCustomUserClaims(uid, {});
        return;
      }
      if (after.pending || after.disabled) {
        // Waiting on approval, declined, or switched off: hold nothing.
        await getAuth().setCustomUserClaims(uid, {});
      } else {
        // Fail closed: a doc missing role/section must not inherit the broadest
        // section ("All" passes both isAS() and isInsp() in firestore.rules).
        await getAuth().setCustomUserClaims(uid, {
          role: after.role || "officer",
          section: after.section || "",
          ...(after.border ? { border: after.border } : {}),
        });
      }
      // Disabling an account has to reach Auth as well, or the sign-in itself
      // keeps working and only the claims go quiet.
      await getAuth().updateUser(uid, { disabled: !!after.disabled });
    } catch (err) {
      console.error("Failed to sync custom claims for", uid, err);
    }
  },
);
