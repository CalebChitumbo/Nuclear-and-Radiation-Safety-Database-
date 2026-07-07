/**
 * ingestRaisEmail — the automatic RAIS licensing-status connector.
 *
 * An inbound-email provider (CloudMailin / Mailgun / SendGrid …) is pointed at
 * this HTTPS endpoint and forwards every RAIS "assigned data form" notification
 * email to it. We run the SAME parser the Licensing Status tab uses on a manual
 * paste (lib/rules/parseNotifications), match each application to the register,
 * and queue every fresh record with reviewStatus = "needs-review" for an
 * officer to confirm on the tab. The connector NEVER writes to the register
 * itself — the officer's Accept action does, through the store and the R1–R6
 * rules — so nothing changes silently.
 *
 * Writes use the Admin SDK (security rules are bypassed), so the endpoint MUST
 * authenticate every request — see isAuthorized() / RAIS_WEBHOOK_SECRET. Set
 * RAIS_ALLOWED_SENDERS (comma-separated addresses or domains) to additionally
 * reject forwarded mail from unexpected senders.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";

import {
  addWorkflowsToRanMap,
  linkByRan,
  linkFacilities,
  parseNotifications,
  ranMapFromFacilities,
} from "./rules/parseNotifications";
import { shouldSupersede } from "./rules/supersede";
import type { Facility, LicenceWorkflow } from "./rules/types";
import {
  isAuthorized,
  pickEmailText,
  senderAllowed,
  type InboundRequest,
} from "./email";

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
  queued: number;
  skipped: number;
}

/** Firestore write batches cap at 500 ops; stay safely under it. */
const BATCH_LIMIT = 450;

async function ingest(text: string, subject: string): Promise<IngestSummary> {
  const db = getFirestore();

  const facSnap = await db.collection("facilities").get();
  const facilities = facSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as Facility,
  );

  // Load existing workflows once: needed to remember which facility a RAN belongs
  // to, and to supersede the pending inbox row per RAN.
  const wfSnap = await db.collection("licenceWorkflows").get();
  const allWorkflows = wfSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as LicenceWorkflow,
  );
  const existingById = new Map(allWorkflows.map((w) => [w.id, w]));

  // Real RAIS emails put the notification type in the SUBJECT and open the body
  // with "Hello,". The parser classifies on the first line, so prepend the
  // subject — that mirrors how the pasted dashboard leads with the title.
  const feed = subject ? `${subject}\n${text}` : text;

  // Classify + match. linkFacilities matches on the facility NAME; linkByRan then
  // rescues the payment / board-approval / internal "data form" emails that cite
  // only a RAN, using the facility the register (auths) or a previous
  // notification already tied to that RAN — so the officer doesn't re-match it.
  const ranMap = addWorkflowsToRanMap(
    ranMapFromFacilities(facilities),
    allWorkflows,
  );
  const records = linkByRan(
    linkFacilities(parseNotifications(feed), facilities),
    ranMap,
  ).filter((r) => !(r.stage === "Unrecognized" && !r.ran && !r.facilityName));

  const empty: IngestSummary = { parsed: 0, queued: 0, skipped: 0 };
  if (!records.length) return empty;

  // Batched in chunks: a single Firestore batch caps at 500 ops, and a big
  // multi-record feed forwarded as one email must not abort wholesale.
  let batch = db.batch();
  let batchOps = 0;
  const batches = [batch];
  const now = new Date().toISOString();
  const summary: IngestSummary = { ...empty, parsed: records.length };

  records.forEach((r) => {
    const ref = db.doc(`licenceWorkflows/${docId(r)}`);
    const prev = existingById.get(ref.id) || null;

    // Inherit a facility a prior notification already established for this RAN
    // (belt-and-braces alongside linkByRan).
    let rec = r;
    if (!r.facilityId && prev && prev.facilityId) {
      rec = {
        ...r,
        facilityId: prev.facilityId,
        facilityName: r.facilityName || prev.facilityName,
        facCode: r.facCode || prev.facCode,
        matchScore: Math.max(r.matchScore ?? 0, prev.matchScore ?? 0),
      };
    }

    // A stale or duplicate re-send must not overwrite a fresher pending row.
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

    // Everything is queued for the officer to ACCEPT. The connector never writes
    // to the register itself — the accept action does, through the store (and the
    // R1–R6 rules for the two licence-issuing cases). Nothing changes silently.
    if (batchOps >= BATCH_LIMIT) {
      batch = db.batch();
      batches.push(batch);
      batchOps = 0;
    }
    batchOps++;
    batch.set(
      ref,
      {
        ...rec,
        source: "email",
        reviewStatus: "needs-review",
        receivedAt: now,
        // The fallback start of the SOP's 44-working-day clock: the date this
        // RAN first entered the system. Never restamped on later emails.
        firstSeen: prev?.firstSeen ?? now.slice(0, 10),
        emailSubject: subject || "",
        updatedAt: now,
        updatedBy: BOT,
      },
      { merge: true },
    );
    summary.queued++;
  });

  for (const b of batches) await b.commit();
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

    const { subject, text, from } = pickEmailText(inbound.body);

    // Optional second gate: the provider forwards EVERY email delivered to the
    // ingest address, so restrict which senders may feed the register queue.
    const allowedSenders = (process.env.RAIS_ALLOWED_SENDERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!senderAllowed(from, allowedSenders)) {
      logger.warn("ingestRaisEmail: sender not on RAIS_ALLOWED_SENDERS", {
        from,
        subject,
      });
      // 200 so the provider marks it delivered and does not retry forever.
      res.status(200).json({ ok: true, ignored: "sender not allowed" });
      return;
    }

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
