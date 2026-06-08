/**
 * RAIS → Licensing Database sync (Google Apps Script)
 * ---------------------------------------------------
 * The simplest way to feed real RAIS notification emails into the
 * ingestRaisEmail Cloud Function when the emails already arrive in a Gmail /
 * Google Workspace inbox — no third-party inbound-email provider needed.
 *
 * On a timer it finds RAIS notification emails and posts each one's subject +
 * body to the function. It de-duplicates per MESSAGE (so a new notification
 * arriving in a thread it has already touched is still sent) and labels
 * processed threads "RAIS-Synced" for visibility. The function is also
 * idempotent by RAN, so an occasional re-send is harmless.
 *
 * SETUP
 *  1. https://script.google.com  →  New project. Paste this in.
 *  2. Fill ENDPOINT (the deployed Function URL) and SECRET (RAIS_WEBHOOK_SECRET).
 *  3. Run `forwardRaisEmails` once and approve the Gmail/UrlFetch permissions.
 *  4. Triggers (⏰) → Add Trigger → forwardRaisEmails, Time-driven, every 15 min.
 *
 * See docs/rais-email-ingestion.md for the full walkthrough.
 */

const ENDPOINT = "https://us-central1-YOUR_PROJECT.cloudfunctions.net/ingestRaisEmail";
const SECRET   = "YOUR_WEBHOOK_SECRET";

// Which emails to sync. RAIS sends applicant emails from eLicensing@rpa.gov.zm,
// but internal "… data form assigned" notifications can come from a DIFFERENT
// rpa.gov.zm address — so by default we match the whole domain to catch them all.
// Narrow this (e.g. "from:eLicensing@rpa.gov.zm") if it ever picks up unrelated
// mail; the function ignores anything it cannot classify anyway.
const SENDER_QUERY   = "from:rpa.gov.zm";
const LABEL          = "RAIS-Synced";
const WINDOW         = "newer_than:60d"; // first run catches up recent history
const MAX_THREADS    = 100;
const PROP_KEY       = "raisSyncedMessageIds";
const MAX_REMEMBERED = 400; // bound the stored id list (PropertiesService size limit)

function forwardRaisEmails() {
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const props = PropertiesService.getScriptProperties();
  const seen = new Set((props.getProperty(PROP_KEY) || "").split(",").filter(Boolean));

  // IMPORTANT: do NOT exclude by "-label:RAIS-Synced". Labels are per-THREAD, so
  // that would skip a fresh notification that lands in a thread we already
  // touched. We de-dupe per MESSAGE id instead.
  const query = SENDER_QUERY + " " + WINDOW;
  const threads = GmailApp.search(query, 0, MAX_THREADS);

  let sent = 0;
  threads.forEach(function (thread) {
    let touched = false;
    thread.getMessages().forEach(function (msg) {
      const id = msg.getId();
      if (seen.has(id)) return; // already forwarded this message

      const res = UrlFetchApp.fetch(ENDPOINT, {
        method: "post",
        contentType: "application/json",
        headers: { "X-Webhook-Secret": SECRET },
        payload: JSON.stringify({
          subject: msg.getSubject(),
          plain: msg.getPlainBody(),
        }),
        muteHttpExceptions: true,
      });
      Logger.log(msg.getSubject() + "  ->  " + res.getResponseCode() + "  " + res.getContentText());

      seen.add(id);
      sent++;
      touched = true;
    });
    if (touched) thread.addLabel(label); // visibility only — not used for filtering
  });

  // Persist the processed-message set, trimmed so the property never overflows.
  const ids = Array.from(seen);
  props.setProperty(
    PROP_KEY,
    ids.slice(Math.max(0, ids.length - MAX_REMEMBERED)).join(","),
  );

  Logger.log(
    "Done. Forwarded " + sent + " new message(s) from " + threads.length + " thread(s).",
  );
}
