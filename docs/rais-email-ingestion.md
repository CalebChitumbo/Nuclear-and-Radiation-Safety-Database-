# Automatic RAIS email ingestion

Keep the **Licensing Status** register current without anyone copy-pasting.

Every time an application moves stage in RAIS, the platform emails a
notification. This connector receives those emails and runs the **same parser**
the Licensing Status tab uses on a manual paste
(`lib/rules/parseNotifications.ts`), so the register updates itself.

```
RAIS notification email
        │  (Gmail filter forwards it)
        ▼
Inbound-email provider  ──HTTP POST──►  ingestRaisEmail  (Cloud Function)
 (CloudMailin / Mailgun)                       │
                                               ├─ classify (subject → status)
                                               ├─ link to a facility by name, else by RAN
                                               └─ queue every update in the "Incoming RAIS
                                                  updates" inbox (Licensing Status tab)
                                                       │
                                                       ▼
                                          officer ACCEPTS  → the status is rolled onto the
                                          (one row, or          facility in the register
                                           "Accept all")
```

The connector itself never writes to the register — nothing changes silently.
Accepting an update writes the facility, which triggers the existing
`onFacilityWrite` function to recompute `aggregates/dashboard`.

## What it does and does not do

- **Classifies by the email subject** against the authoritative RPA template
  mapping (`lib/rules/raisTemplates.ts`, generated from
  `rais-email-status-mapping.csv` — 64 templates). Each email yields a canonical
  `currentStatus` (the spreadsheet's `NewApplicationStatus`) and a coarse `Stage`
  it rolls up to. Dashboard-paste titles that aren't email subjects still fall
  back to the legacy regex rules. The classifier is pure/deterministic (no LLM).
- **Keeps one current status per facility, that supersedes the previous.** A
  facility shows the status of the **most recent applicable** email for its
  active application (`currentStatus` + the coarse `stage`). Forward progression
  replaces the shown status; a **stale or duplicate** older email never regresses
  it; a genuine **reset** (rejection / returned / declination / withdrawal /
  additional-info) moves it backward when it is the newest event. The ordering
  rule lives in `lib/rules/supersede.ts` (`shouldSupersede` / `resolveFacilityStatus`).
- **Review &amp; accept inbox:** every imported email is queued
  (`reviewStatus: "needs-review"`) in the **Incoming RAIS updates** inbox on the
  Licensing Status tab, showing its facility and status. An officer **Accepts** a
  row — or **Accept all recognised** — and only then is the status rolled onto the
  register. The connector applies nothing on its own.
- **Links a facility by name, then by RAN.** Payment, board-approval and internal
  "data form assigned" emails name only a RAN, never the facility. `linkByRan`
  resolves those from a RAN → facility map built from the register's recorded
  authorisation numbers (`auths[].number`) and from every previously-matched
  workflow — so once an application is tied to a facility, its later
  notifications link themselves. Genuinely new RANs get a one-time facility
  picker; matching one "teaches" it for next time.
- **Licenses on a confirmed Use/Possession certificate.** When an officer
  **accepts** an issued ("Licence / Certificate Issued") email that is confirmed
  to be **Use/Possession**, the facility is set officially **licensed** through
  the R1–R6 rules (`lib/rules/recordLicence.ts`), which also writes the dated
  `licenceEvent` that feeds the register's licensed count and the weekly report —
  no separate "Mark Licensed" step. Every other issued type (import, transfer,
  transit, variation, …) is recorded as a **standalone authorisation** instead,
  leaving licensed status untouched. The connector itself still writes nothing —
  nothing changes silently until an officer accepts — and an already-licensed
  facility is never downgraded (its renewals stay a manual action). A FORM-I
  number (`RPA/LIC/####`) must be classified first: only once an officer confirms
  it is Use/Possession does accepting it license the facility. The **Ready to
  license** panel remains as a manual fallback for the rare issued email the
  auto-path cannot record (e.g. one that carried no RAN).
- **Idempotent:** records are keyed by their workflow RAN, so the same email
  arriving twice updates the same row instead of duplicating it. A re-sent or
  stale email will **not** knock an already-applied (or officer-resolved) item
  back into the queue, nor regress its status.

## 1. Deploy the function

```bash
# Set the shared secret the provider must present (store it safely):
firebase functions:secrets:set RAIS_WEBHOOK_SECRET

# Deploy:
firebase deploy --only functions
```

Note the deployed URL, e.g.
`https://us-central1-<project-id>.cloudfunctions.net/ingestRaisEmail`.

## 2. Authenticate the webhook

Writes use the Admin SDK and bypass Firestore security rules, so the endpoint
**must** authenticate every request. It accepts either:

- **Shared secret** (works with any provider) — presented as the
  `X-Webhook-Secret` header, an HTTP basic-auth password, a `?secret=…` query
  param, or a `secret` form field. Must equal `RAIS_WEBHOOK_SECRET`.
- **Mailgun HMAC** (optional, recommended for Mailgun) — set the function env
  var `MAILGUN_SIGNING_KEY` to your Mailgun *HTTP webhook signing key*. When set,
  a valid `timestamp`+`token`+`signature` is accepted with no secret in the URL.
  Signatures older than 5 minutes are rejected, so a captured request cannot be
  replayed later.

  ```bash
  # optional, Mailgun only:
  firebase functions:secrets:set MAILGUN_SIGNING_KEY   # then redeploy
  ```

> Prefer the `X-Webhook-Secret` header (or basic auth) over `?secret=…` where
> your provider allows it — query strings end up in request logs.

### Optional: restrict which senders are ingested

The provider forwards **every** email delivered to the ingest address. To make
sure only genuine RAIS notifications can reach the review queue, set the
function env var `RAIS_ALLOWED_SENDERS` to a comma-separated list of addresses
and/or domains (a domain also admits its subdomains):

```bash
# functions/.env or the Functions console:
RAIS_ALLOWED_SENDERS=rpa.gov.zm
```

> **Match it to the real sender.** RAIS notifications come from
> `eLicensing@rpa.gov.zm`, and internal "… data form assigned" mail from other
> `rpa.gov.zm` addresses — so `rpa.gov.zm` is the entry that works. A domain
> entry admits **subdomains, not parents**: listing `rais.rpa.gov.zm` does *not*
> admit `eLicensing@rpa.gov.zm`, and silently rejects every real notification.

Mail from any other sender is acknowledged (HTTP 200, so the provider doesn't
retry) but ignored, and the rejection is logged with the address that was
rejected. Leave it unset to accept all senders (the previous behaviour).

The list can only be enforced against a payload that **carries** a sender. If
one arrives without a `from` field while the list is set, it is ingested anyway
and a warning is logged — dropping it instead would silently empty the review
inbox with no visible error. Keep `from` in whatever posts to the endpoint (the
Apps Script sends `msg.getFrom()`) so the list actually applies.

## 3. Point an inbound-email provider at it

> **Simplest for Gmail/Workspace:** skip inbound providers entirely and use the
> Google Apps Script in [`gmail-apps-script.gs`](gmail-apps-script.gs). It runs
> in your own Google account on a timer, finds new RAIS emails, and posts each
> to this function — no forwarding-address confirmation, no third party. Paste
> it in at <https://script.google.com>, set `ENDPOINT` + `SECRET`, run it once to
> authorize, then add a 15-minute time trigger. It matches the whole
> `rpa.gov.zm` domain (so internal "… data form assigned" notifications, which
> can come from a different address than `eLicensing@rpa.gov.zm`, are caught) and
> de-duplicates per **message** — so a new notification that lands in a thread it
> already touched is still forwarded.

If you prefer a true inbound webhook instead, point a provider at the endpoint:

### Option A — CloudMailin (simplest; posts clean JSON)

1. Create an address; set the **target** to the function URL with the secret in
   the query string, e.g. `…/ingestRaisEmail?secret=YOUR_SECRET`
   (or configure HTTP basic auth and use the password as the secret).
2. Set the POST **format** to *JSON (normalized)*.

### Option B — Mailgun

1. Add/verify a receiving domain.
2. **Receiving → Create Route**: match the recipient address, action
   `forward("https://…/ingestRaisEmail")`. Append `?secret=YOUR_SECRET` to the
   URL, or set `MAILGUN_SIGNING_KEY` (step 2) to authenticate by HMAC instead.
   Attachments aren't needed — the text body is enough.

### 4. Forward the RAIS emails in

RAIS sends its automated status emails from **`eLicensing@rpa.gov.zm`**. In the
Gmail/Workspace mailbox that receives them:

1. **Add the forwarding address.** Settings → *See all settings* → *Forwarding
   and POP/IMAP* → **Add a forwarding address** → paste the provider address
   from step 3. Gmail emails a confirmation code to it.
2. **Confirm it.** That code lands at the provider, not a normal inbox — read it
   from the provider's message log (CloudMailin *Message history* / Mailgun
   *Logs*) and enter it, or click the link there. (You can also temporarily log
   the request body in the function to read the code from the Cloud Functions
   logs.)
3. **Create the filter.** Search `from:(eLicensing@rpa.gov.zm)` → *Create
   filter* → tick **Forward it to** the address from step 1 → *Create filter*.
   Optionally tick "also apply to matching conversations" to back-fill.

From then on, every new RAIS email is forwarded to the function automatically.

> If the forwarding-confirmation step proves fiddly, the alternative "Gmail-native
> push" design (Gmail API `watch` → Pub/Sub → function) avoids forwarding
> entirely — ask and it can be wired up instead.

## Test it

Post the sample feed straight at the endpoint (a raw `text/plain` body is
treated as the email body):

```bash
curl -X POST "https://us-central1-<project-id>.cloudfunctions.net/ingestRaisEmail" \
  -H "X-Webhook-Secret: YOUR_SECRET" \
  -H "Content-Type: text/plain" \
  --data-binary $'Licence Approval CEO data form assigned\nLicence Approval CEO data form of AUTH/USE.REN/0872 NFC Africa Mining Plc process has been assigned to you.'
```

Expected response:

```json
{ "ok": true, "parsed": 1, "applied": 1, "queued": 0, "skipped": 0, "facilitiesUpdated": 1 }
```

(`facilitiesUpdated` is `1` only if *NFC Africa Mining Plc* is in the register
and not already licensed.) An unauthorized request returns `401`; an email with
no readable body returns `200` with `"ignored"`.

## Coverage (confirmed against real `eLicensing@rpa.gov.zm` emails)

Real emails open the body with "Hello," and carry the notification type in the
**subject**, so the connector prepends the subject before parsing. Behaviour by
email type:

| Subject | Tracked as | Auto-applies? |
|---|---|---|
| …Application **Approved** | Licence / Certificate Issued | ✅ when the named facility matches the register |
| …Request **Submitted successfully** | Application Submitted | ✅ when the named facility matches |
| **Payment Pending** | Awaiting Proof of Payment | ⏳ queued — the email body carries no facility name |
| **Additional Information Required** | Application (applicant to act) | ⏳ queued unless a facility/RAN is present |
| **Invoice Request Generator** | — (generic blast, no RAN) | ignored |
| **…Withdrawal** | not classified | ⏳ queued for an officer to decide |

"Approved" moves the facility's **stage** to *Licence / Certificate Issued*; for
a confirmed **Use/Possession** application, accepting that email also flips the
facility to officially `licensed` through the R1–R6 rules (other issued types are
recorded as standalone authorisations instead). New subject phrasings can be
added to the `RULES` / `extractFacility` patterns in
`lib/rules/parseNotifications.ts` (`tests/raisIngest.test.ts` covers the shapes
above).

## Local testing with the emulator

```bash
cd functions && npm run build
# provide the secret to the emulator, then:
firebase emulators:start --only functions,firestore
# POST to the printed local ingestRaisEmail URL with the X-Webhook-Secret header
```
