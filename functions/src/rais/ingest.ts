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

  // Never clobber a record an officer has already resolved (or one we already
  // auto-applied): a resend must not knock it back into the review queue.
  const refs = records.map((r) => db.doc(`licenceWorkflows/${docId(r)}`));
  const existing = await db.getAll(...refs);
  const appliedAlready = new Set(
    existing
      .filter((s) => s.exists && s.get("reviewStatus") === "applied")
      .map((s) => s.id),
  );

  const facById = new Map(facilities.map((f) => [f.id, f]));
  const batch = db.batch();
  const now = new Date().toISOString();
  const summary: IngestSummary = { ...empty, parsed: records.length };

  records.forEach((r, i) => {
    if (appliedAlready.has(refs[i].id)) {
      summary.skipped++;
      return;
    }

    const decision = ingestDecision(r);
    const reviewStatus = decision === "auto" ? "applied" : "needs-review";
    batch.set(
      refs[i],
      {
        ...r,
        source: "email",
        reviewStatus,
        receivedAt: now,
        emailSubject: subject || "",
        updatedAt: now,
        updatedBy: BOT,
      },
      { merge: true },
    );

    if (decision !== "auto") {
      summary.queued++;
      return;
    }
    summary.applied++;

    // Roll the stage onto the matched facility (never downgrade a licensed one).
    const fac = r.facilityId ? facById.get(r.facilityId) : undefined;
    if (fac && !fac.licensed && fac.stage !== r.facilityStage) {
      batch.set(
        db.doc(`facilities/${fac.id}`),
        { ...fac, stage: r.facilityStage, updatedAt: now, updatedBy: BOT },
        { merge: true },
      );
      summary.facilitiesUpdated++;
    }
  });

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
      res.status(500).json({ error: "ingest failed" });
    }
  },
);
