/**
 * ingestRaisEmail — the automatic RAIS licensing-status connector.
 *
 * An inbound-email provider (CloudMailin / Mailgun / SendGrid …) is pointed at
 * this HTTPS endpoint and forwards every RAIS "assigned data form" notification
 * email to it. We run the SAME parser the Licensing Status tab uses on a manual
 * paste (lib/rules/parseNotifications), match each application to the register,
 * then:
 *   • auto-apply confident facility matches (score ≥ 0.72) — the workflow record
 *     is saved and the matched facility's pipeline stage is rolled forward; and
 *   • queue everything else (weak/no match, unclassifiable) with
 *     reviewStatus = "needs-review" for an officer to confirm on the tab.
 *
 * Writes use the Admin SDK (security rules are bypassed), so the endpoint MUST
 * authenticate every request — see isAuthorized() / RAIS_WEBHOOK_SECRET.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";

import {
  ingestDecision,
  linkFacilities,
  parseNotifications,
} from "./rules/parseNotifications";
import { resolveFacilityStatus, shouldSupersede } from "./rules/supersede";
import type { Facility, LicenceWorkflow } from "./rules/types";
import { isAuthorized, pickEmailText, type InboundRequest } from "./email";

/** Shared secret the provider must present. Set with:
 *  firebase functions:secrets:set RAIS_WEBHOOK_SECRET */
const RAIS_WEBHOOK_SECRET = defineSecret("RAIS_WEBHOOK_SECRET");

const BOT = "rais-email-bot";

/** Same deterministic doc id the web app uses, so a re-sent email upserts. */
function docId(w: LicenceWorkflow): string {
  return (w.ran || w.id).replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
}

interface IngestSummary {
  parsed: number;
  applied: number;
  queued: number;
  skipped: number;
  facilitiesUpdated: number;
}

async function ingest(text: string, subject: string): Promise<IngestSummary> {
  const db = getFirestore();

  const facSnap = await db.collection("facilities").get();
  const facilities = facSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as Facility,
  );

  // Real RAIS emails put the notification type in the SUBJECT and open the body
  // with "Hello,". The parser classifies on the first line, so prepend the
  // subject — that mirrors how the pasted dashboard leads with the title.
  const feed = subject ? `${subject}\n${text}` : text;

  // Drop pure footer/noise blocks; keep unclassified-but-real ones for review.
  const records = linkFacilities(parseNotifications(feed), facilities).filter(
    (r) => !(r.stage === "Unrecognized" && !r.ran && !r.facilityName),
  );
  const empty: IngestSummary = {
    parsed: 0,
    applied: 0,
    queued: 0,
    skipped: 0,
    facilitiesUpdated: 0,
  };
  if (!records.length) return empty;

  const refs = records.map((r) => db.doc(`licenceWorkflows/${docId(r)}`));
  const existingSnaps = await db.getAll(...refs);
  const existingById = new Map<string, LicenceWorkflow>();
  existingSnaps.forEach((s) => {
    if (s.exists) existingById.set(s.id, s.data() as LicenceWorkflow);
  });

  const facById = new Map(facilities.map((f) => [f.id, f]));
  const batch = db.batch();
  const now = new Date().toISOString();
  const summary: IngestSummary = { ...empty, parsed: records.length };

  // Facilities whose displayed status may need recomputing, with the records we
  // wrote for them this round (overlaid on the stored set when resolving).
  const writtenByFacility = new Map<string, LicenceWorkflow[]>();

  records.forEach((r, i) => {
    const prev = existingById.get(refs[i].id) || null;

    // Preserve an officer-confirmed (or previously auto-matched) facility when a
    // later email for the same RAN arrives without a confident match of its own
    // (e.g. a body-less "Payment Pending" resend).
    let rec = r;
    if (prev && prev.reviewStatus === "applied" && prev.facilityId && !r.facilityId) {
      rec = {
        ...r,
        facilityId: prev.facilityId,
        facilityName: r.facilityName || prev.facilityName,
        facCode: r.facCode || prev.facCode,
        matchScore: Math.max(r.matchScore ?? 0, prev.matchScore ?? 0),
      };
    }

    // Does this email move the application forward (or a genuine reset/newer)?
    // A stale or duplicate re-send must not regress the resolved record.
    const supersedes = shouldSupersede(
      prev
        ? {
            date: prev.lastSeen,
            receivedAt: prev.receivedAt,
            phase: prev.phase,
            currentStatus: prev.currentStatus,
            special: prev.special,
            reviewStatus: prev.reviewStatus,
          }
        : null,
      {
        date: rec.lastSeen,
        receivedAt: now,
        phase: rec.phase,
        currentStatus: rec.currentStatus,
        special: rec.special,
      },
    );

    if (!supersedes) {
      summary.skipped++;
      return;
    }

    const decision = ingestDecision(rec);
    const reviewStatus = decision === "auto" ? "applied" : "needs-review";
    const toWrite: LicenceWorkflow = {
      ...rec,
      source: "email",
      reviewStatus,
      receivedAt: now,
      emailSubject: subject || "",
      updatedAt: now,
      updatedBy: BOT,
    };
    batch.set(refs[i], toWrite, { merge: true });

    if (decision !== "auto") {
      summary.queued++;
      return;
    }
    summary.applied++;

    if (rec.facilityId) {
      const arr = writtenByFacility.get(rec.facilityId) || [];
      arr.push(toWrite);
      writtenByFacility.set(rec.facilityId, arr);
    }
  });

  // Resolve each touched facility's single displayed status from ALL of its
  // workflows (most recent applicable wins), never downgrading a licensed one.
  for (const [facilityId, written] of writtenByFacility) {
    const fac = facById.get(facilityId);
    if (!fac || fac.licensed) continue;

    const byId = new Map<string, LicenceWorkflow>();
    const stored = await db
      .collection("licenceWorkflows")
      .where("facilityId", "==", facilityId)
      .get();
    stored.forEach((s) => byId.set(s.id, s.data() as LicenceWorkflow));
    for (const w of written) byId.set(docId(w), w); // overlay this batch's writes

    const resolved = resolveFacilityStatus([...byId.values()]);
    if (!resolved) continue;
    if (fac.stage !== resolved.stage || fac.currentStatus !== resolved.currentStatus) {
      batch.set(
        db.doc(`facilities/${facilityId}`),
        {
          ...fac,
          stage: resolved.stage,
          currentStatus: resolved.currentStatus,
          updatedAt: now,
          updatedBy: BOT,
        },
        { merge: true },
      );
      summary.facilitiesUpdated++;
    }
  }

  await batch.commit();
  return summary;
}

/** Normalize whatever the provider POSTed into a plain object body. */
function normalizeBody(raw: unknown): Record<string, unknown> {
  let body: unknown = raw;
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      // A raw text/plain POST of the feed itself — treat it as the email body.
      body = { plain: body };
    }
  }
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

export const ingestRaisEmail = onRequest(
  {
    region: "us-central1",
    secrets: [RAIS_WEBHOOK_SECRET],
    invoker: "public", // the shared secret / HMAC is the real gate
    cors: false,
    timeoutSeconds: 60,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Use POST" });
      return;
    }

    const inbound: InboundRequest = {
      headers: req.headers as Record<string, string | undefined>,
      query: req.query as Record<string, unknown>,
      body: normalizeBody(req.body),
    };

    if (
      !isAuthorized(inbound, {
        secret: RAIS_WEBHOOK_SECRET.value(),
        mailgunSigningKey: process.env.MAILGUN_SIGNING_KEY,
      })
    ) {
      logger.warn("ingestRaisEmail: rejected unauthorized request");
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const { subject, text } = pickEmailText(inbound.body);
    if (!text) {
      // 200 so the provider marks it delivered and does not retry forever.
      res.status(200).json({ ok: true, ignored: "no readable email body" });
      return;
    }

    try {
      const summary = await ingest(text, subject);
      logger.info("ingestRaisEmail processed an email", { subject, ...summary });
      res.status(200).json({ ok: true, ...summary });
    } catch (err) {
      logger.error("ingestRaisEmail failed", err);
      res.status(500).json({
        error: "ingest failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  },
);
