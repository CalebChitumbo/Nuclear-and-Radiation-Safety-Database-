/**
 * RAIS → Licensing Database sync (Google Apps Script)
 * ---------------------------------------------------
 * The simplest way to feed real RAIS notification emails into the
 * ingestRaisEmail Cloud Function when the emails already arrive in a Gmail /
 * Google Workspace inbox — no third-party inbound-email provider needed.
 *
 * On a timer it finds new emails from the RAIS sender, posts each one's subject
 * + body to the function, and labels it "RAIS-Synced" so it is never sent twice
 * (the function is also idempotent by RAN, so re-sends are harmless anyway).
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

// Gmail search for the emails to sync. Adjust the sender or window as needed.
const SENDER     = "eLicensing@rpa.gov.zm";
const LABEL      = "RAIS-Synced";
const WINDOW     = "newer_than:60d"; // first run catches up recent history
const MAX_THREADS = 50;

function forwardRaisEmails() {
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const query = "from:" + SENDER + " -label:" + LABEL + " " + WINDOW;
  const threads = GmailApp.search(query, 0, MAX_THREADS);

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
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
    });
    thread.addLabel(label); // mark the whole thread done
  });

  Logger.log("Done. Processed " + threads.length + " new email thread(s).");
}
