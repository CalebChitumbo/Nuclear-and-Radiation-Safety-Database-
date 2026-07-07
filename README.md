# RPA Integrated Regulatory Information System

A production-grade, multi-user web application for the **Radiation Protection
Authority of Zambia (RPA) — Nuclear & Radiation Safety Department**. It
unifies the licensing register, authorisations, inspections, and weekly
sectional reporting into one system, backed by Firebase and pre-seeded with
the real register of 474 facilities.

This is the implementation of the build specification in `BUILD_SPEC.md`
(supplied with the project upload).

---

## The unifying principle

The **dated event is the atomic unit**.

- A licence issuance and an inspection are each stored once as a dated record.
- The **register** is a projection of those events (_what is the current state?_).
- The **weekly report** is another projection of the same events (_what
  happened in week W22?_).
- **Log once, both update.**

The full set of business rules (R1–R6) lives in `lib/rules/recordLicence.ts`
and is exercised by `tests/recordLicence.test.ts`. Do not bypass them.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + CSS variables for the RPA brand tokens |
| Backend data | Cloud Firestore (Native) |
| Auth | Firebase Authentication (email/password) + custom claims `{role, section}` |
| Server logic | Cloud Functions (2nd gen, TypeScript) |
| Hosting | **Vercel** (Next.js frontend) · Firebase backend (Firestore, Auth, Cloud Functions) |
| Tests | Vitest |

The Firestore SDK is loaded only when running in **Firebase mode**. The app
also ships with an in-memory **mock data store** that loads the 474-facility
seed at startup, so the system can be demoed and developed without Firebase
credentials.

---

## Running locally (mock mode — no Firebase needed)

```bash
cp .env.local.example .env.local
# set NEXT_PUBLIC_USE_MOCK=1 in .env.local to run the no-Firebase demo
npm install
npm run dev
# open http://localhost:3000
```

Sign in with any of the demo accounts — any non-empty password works:

| Account | Role |
|---|---|
| `admin@rpa.gov.zm` | Administrator (full access) |
| `as.officer@rpa.gov.zm` | Authorisation & Standards officer |
| `inspector@rpa.gov.zm` | Inspectorate officer |

Data persists to `localStorage`. **Settings → Reset mock data** wipes it back
to the seed.

---

## Running against Firebase

1. `firebase login` and create / choose a project. Enable Firestore (Native),
   Authentication (Email/Password), and App Hosting.
2. Copy your web app config into `.env.local` (see `.env.local.example`) and
   set `NEXT_PUBLIC_USE_MOCK=` (empty).
3. Deploy rules + indexes:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
4. Seed the project:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run seed
   # verify the dashboard reads 474 / 181 / 293 / 204
   ```
5. Create the first admin by manually calling the `setUserClaims` callable in
   the Firebase Console, then onboard the rest from `/admin/users`.
6. Build + deploy the app:
   ```bash
   firebase deploy --only functions,hosting
   ```

### Local Firebase emulators

```bash
firebase emulators:start
# in another terminal
NEXT_PUBLIC_USE_EMULATORS=1 NEXT_PUBLIC_USE_MOCK= npm run dev
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run seed:emulator
```

---

## Deploy to Vercel

The Next.js **frontend** is hosted on Vercel; the **backend stays on Firebase**
(Firestore, Authentication, Cloud Functions, security rules and the seeded
register — all unchanged). The browser talks to Firestore/Auth directly, so no
Firebase **secrets** ever touch a Vercel server — only the public
`NEXT_PUBLIC_FIREBASE_*` web config, which is designed to ship to the client.

### 1. Import the repository

In the Vercel dashboard: **Add New… → Project → Import** this Git repository.
Vercel auto-detects Next.js — leave the build & output settings at their
defaults (`vercel.json` pins the framework).

### 2. Add environment variables

Add these under **Project → Settings → Environment Variables** (Production **and**
Preview). Copy the values from Firebase Console → _Project settings → Your apps →
SDK setup and configuration_.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | ✅ | Web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ✅ | `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ✅ | |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | ✅ | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | ✅ | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | ✅ | |
| `NEXT_PUBLIC_USE_MOCK` | — | **Leave empty / unset.** `1` would force the localStorage demo. |
| `NEXT_PUBLIC_USE_EMULATORS` | — | **Leave empty / unset.** |

> ⚠️ `NEXT_PUBLIC_*` values are inlined at **build time**. If you add or change
> them, trigger a **redeploy** so the new values take effect.

### 3. Deploy

Click **Deploy**. After that, every push to the connected branch redeploys
automatically (Production for the production branch, Preview for others).

### 4. One-time Firebase settings for the new domain

- **Authorized domains** — Firebase Console → Authentication → Settings →
  Authorized domains: add your `*.vercel.app` domain and any custom domain.
  (Required for Google/OAuth or email-link sign-in; harmless for email/password.)
- **API key restrictions** — Google Cloud Console → APIs & Services → Credentials:
  if you restricted the Web API key by **HTTP referrer**, add
  `https://your-app.vercel.app/*` (and your custom domain), otherwise Firebase
  calls will be blocked from the new origin.

### Notes

- The dashboard rollup (`aggregates/dashboard`) is maintained by the deployed
  `onFacilityWrite` Cloud Function. **Keep Functions deployed on Firebase** — the
  Vercel frontend never writes that document (the rules forbid it), it only reads
  it.
- `firebase.json`, `firestore.rules`, `firestore.indexes.json` and `functions/`
  stay in the repo for your Firebase backend; Vercel ignores them.

---

## Data model

| Collection | Purpose |
|---|---|
| `facilities/{id}` | Master register row — projection of all licences held by that facility |
| `licenceEvents/{id}` | The dated flow log — one document per licence ever recorded |
| `inspections/{id}` | The dated inspection log |
| `inspectionRequests/{id}` | The Licensing ↔ Inspectorate handoff — one document per pre-authorisation inspection request, with its status, assigned inspector, report reference and full audit trail |
| `committeeSubmissions/{id}` | The TECHCOM / Board tracker — the digital "complete applications awaiting TECHCOM" file, through Board approval, Form III rejection or licence issuance |
| `furtherParticulars/{id}` | Form II (request for further particulars) tracker with its 14-working-day response window |
| `reconciliations/{YYYY-MM}` | Monthly Accounts reconciliation ticks (SOP: by the 5th of the following month) |
| `weekMetrics/{week}` | Manual per-week metric inputs (engagements, TWG meetings, NSSS, NSI) |
| `activities/{id}` | Free-form weekly activities, scoped per section |
| `licenceWorkflows/{ran}` | RAIS licensing-status tracker — one row per application RAN, imported by paste or the email connector (`source`, `reviewStatus`) |
| `aggregates/dashboard` | Single rollup document — read by the Overview page so it never scans the full register |
| `config/referenceLists` | Editable lists (provinces, stages, licence types) |
| `users/{uid}` | Staff accounts; role + section mirrored into Auth custom claims |

Composite indexes are declared in `firestore.indexes.json`. Security rules
live in `firestore.rules` and enforce all role/section logic — never trust the
UI.

---

## The two patterns that keep Firestore cheap

1. **Aggregate document.** The dashboard always reads exactly one document.
   The Cloud Function `onFacilityWrite` recomputes `aggregates/dashboard`
   whenever a facility changes — so writers stay simple and correctness is
   centralised.
2. **Per-week event field.** Every licence event and inspection stores its
   `week` label up front, so weekly queries are an indexed
   `where("week","==", selected)` — never a scan of the whole history.

Bulk approval commits everything in a single `writeBatch()` so a 30-line
paste is atomic — if any write fails, none apply.

---

## Automatic RAIS email ingestion

The Licensing Status tab can update itself. Forward the RAIS status-change
emails to the `ingestRaisEmail` Cloud Function (via an inbound-email provider
such as CloudMailin or Mailgun) and it runs the same parser the tab uses on a
manual paste: confident facility matches are applied to the register
automatically, and anything weak/ambiguous waits in the **Needs review** panel
for an officer to confirm. Accepting an update rolls the facility's *pipeline
stage* forward; a **confirmed Use/Possession certificate** (the approval /
"Licence Issued" email) goes one step further — accepting it records the licence
through the R1–R6 rules and sets the facility **Licensed** automatically. Every
other issued application is recorded as a standalone authorisation, and an
already-licensed facility is never downgraded.

Setup, security and provider steps: **[`docs/rais-email-ingestion.md`](docs/rais-email-ingestion.md)**.

### Renewal status vs standalone authorisations

The facilities register tracks **one** thing: a facility's Use/Possession
licensing state — is it licensed, and if not, where is its renewal in the
pipeline. So only **Use/Possession** applications (a new FORM-I licence or a
renewal) move a facility's register status: while one is in flight the register
shows its pipeline stage, and when its **certificate is issued**, accepting that
email flips the facility to **Licensed** (recording the dated licence event that
feeds the licensed count and the weekly report). Every other RAIS update —
import, export, transfer, transport, transit, variation, design & construction,
decommissioning — is a **standalone authorisation**: when its email is
accepted (and the authorisation has been issued) it is recorded on the facility
and counted toward the licences-issued totals, but it never changes the renewal
status shown on the register. The classifier lives in
`lib/rules/licenceFamily.ts` (`isUsePossessionWorkflow` /
`workflowLicenceType`); accepting an email applies it in
`saveLicenceWorkflows`.

**FORM-I numbers (`RPA/LIC/####`)** encode no licence type — they may be
use/possession, import, transport, transit or design & construction. The
Incoming-updates inbox **requires** the officer to classify these rows: a type
selector appears, Accept is disabled until a type is chosen, and the choice is
stored on the workflow (`officerType`) and reused for every later notification
with the same RAN, so an import keeps being treated as an import. Until it is
classified, the number is held out of the register entirely — it drives no
renewal stage and records no authorisation, so the system never guesses what a
`RPA/LIC/####` licence is (`needsTypeClassification`).

The **Licences** page (`/licences`) reports the totals this produces:
authorisations issued by type (renewal + new use + import + transit + …), and —
derived from each facility's most recent Use/Possession licence date — which
facilities hold a current use licence **for a chosen year** versus those whose
renewal is still in the pipeline (and at which stage). `lib/rules/licenceStats.ts`
computes it; the Overview surfaces a summary.

---

## Inspectorate ↔ Licensing integration

Licensing (Authorisation & Standards) and the Inspectorate now share one workflow
for the inspections a licence depends on — typically the **pre-authorisation
inspection** a facility needs before its licence can be issued. It closes the
loop that used to happen over email/phone: a request is raised, worked, reported
and actioned, all on one tracked record.

**The handoff** (`/inspection-requests`, `lib/rules/inspectionRequests.ts`):

1. **Licensing raises a request** — from the Inspection Requests board or straight
   from a facility's drawer ("Request pre-authorisation inspection"). It captures
   the facility, type, priority, an optional linked application RAN and a needed-by
   date. The request opens in **Requested**.
2. **The Inspectorate picks it up** — the board shows an amber badge and an
   "incoming requests" banner. An inspector **acknowledges** it (→ Acknowledged),
   **assigns** a named inspector and target date (→ Assigned), and **starts** it
   (→ In Progress).
3. **The inspection is completed** — the inspector records the outcome, the
   **report reference** (a RAIS ref or a document link) and any findings. This
   moves the request to **Report Ready**, and — the key integration — records a
   dated `inspection` in the Inspectorate's log (linked by `inspectionId`/
   `requestId`) so the weekly report and the "inspections conducted" totals pick
   it up automatically.
4. **Licensing is notified and actions it** — a green "reports ready" signal
   surfaces for A&S. The officer opens the request, follows the report reference,
   and **closes** it once the licensing step is actioned (→ Closed). Either side
   can **cancel** while active, and both can **comment** — every action is written
   to the request's timeline, so the conversation and history live on the record.

**The state machine** (`Requested → Acknowledged → Assigned → In Progress →
Report Ready → Closed`, plus `Cancelled`), the capability gating (who may take
which action), the two cross-section **inbox notifications** that drive the
sidebar badge, and the summary stats are all pure and unit-tested in
`tests/inspectionRequests.test.ts`. The store's `updateInspectionRequest` applies
a transition and, on completion, writes the dated inspection atomically.

Security rules let **either** section write an `inspectionRequests` document
(they collaborate on the same record) behind a shape check; deletes stay
admin-only. The Overview and the Inspections page surface the resulting totals,
and the facility drawer lists every request a facility has had.

---

## The SOP's statutory clocks (working days)

The RPA licensing SOP measures every deadline in **working days** — weekends
and Zambian public holidays excluded (`lib/rules/workingDays.ts` computes the
holiday calendar, including Easter and the moveable Monday holidays). The app
enforces the four clocks end-to-end:

| Clock | SOP target | Where it lives |
|---|---|---|
| Pre-authorisation inspection | **26 working days** from the recommendation | Inspection Requests board + drawer: due date, countdown, overdue banner |
| New licence issued | **44 working days** from a *complete* application | Licensing Process page + Overview "SOP timelines" panel; age chips on the Licensing Status board |
| Renewal issued | **15 working days** from a complete renewal | Renewal-season panel on Licences; renewals auto-detected by RAN (`USE.REN`) |
| Form II response | **14 working days** for the client | Form II tracker on Licensing Process; expired = rejection candidate |

**The verification gate.** The inspection outcome routes the application, per
the SOP (`lib/rules/sla.ts` → `inspectionGate`): a **satisfactory** outcome
(Compliant / Minor findings) means closing the request files the application
in the **TECHCOM queue** automatically, with the report reference bundled; an
**unsatisfactory** one offers "Issue Form II" straight off the report.

**The Licensing Process page** (`/licensing-process`) is the section's
internal cockpit:

1. **Applications vs the 44-day target** — every in-flight application aged
   in working days (at risk from day 30), with the **Form I completeness
   checklist** (`lib/rules/checklist.ts`) per application: ticking every
   required SOP attachment records the application COMPLETE and starts the
   clock from that date (until then the first-seen date is used).
2. **TECHCOM & Board** (`lib/rules/committee.ts`) — the digital "complete
   applications awaiting TECHCOM" file: TECHCOM recommendation → Board
   approval → licence issued (Form IV), or rejection with the Form III
   reference recorded; full audit trail per submission.
3. **Form II tracker** (`lib/rules/formII.ts`) — every request for further
   particulars with its response window; expired requests are flagged as the
   SOP's candidates for rejection.

The Licences page adds the **renewal season** panel (cycle opens 1 October;
in-flight renewals against the 15-day clock) and the **monthly reconciliation
with Accounts** checklist (due the 5th of the following month).

---

## Tests

```bash
npm test
```

261 tests across `lib/rules/*` and the seed baseline, including:

- `detectType` — auto-detects all ten licence type codes
- `matching` — Jaccard + substring + FAC code matching, with short-string guard
- `recordLicence` — full R1–R6 worked expectation
- `inspectionRequests` — request state machine, capability gating, inbox
  notifications and stats for the Inspectorate ↔ Licensing handoff
- `workingDays` — the Zambian holiday calendar (Easter computus, moveable
  Mondays, Sunday observance) and working-day arithmetic
- `sla` — the SOP clocks (26 / 44 / 15 / 14 working days), the inspection
  outcome gate, and application ageing
- `committee` / `formII` / `checklist` — the TECHCOM/Board state machine,
  Form II response windows, and Form I completeness
- `weeklyDerivation` — A&S 1–9 and Inspectorate 1–5 roll-ups
- `aggregate` — sector / province / stage breakdowns
- `week` — date → week-label mapping
- `seedBaseline` — verifies the §16 numbers (474 / 181 / 293 / 53 / 128 / 204)

Add Firestore rules tests with the emulator in a follow-up.

---

## Project layout

```
.
├── app/                    Next.js App Router (one folder per route)
│   ├── login/
│   ├── page.tsx            Overview / Dashboard
│   ├── facilities/         Register + deep-linkable detail
│   ├── bulk-approval/      Paste → match → review → commit
│   ├── inspections/        Inspection log + "conducted" totals
│   ├── inspection-requests/ Licensing ↔ Inspectorate pre-auth handoff board
│   ├── licensing-process/  SOP clocks · TECHCOM & Board · Form II · checklists
│   ├── weekly/             Weekly sectional report
│   ├── admin/users/
│   └── settings/
├── components/             UI primitives — Logo, Sidebar, Topbar, Drawer, Kpi, Bars, Gauge, Toast …
├── lib/
│   ├── rules/              PURE business logic — fully unit-tested
│   ├── store/              DataStore interface + mockStore + firebaseStore
│   ├── auth.tsx            Auth context (mock + Firebase aware)
│   ├── firebase.ts         Client init
│   └── weekContext.tsx     Global reporting-week selector
├── functions/              Cloud Functions (separate package)
├── scripts/seed.ts         Seeds Firestore from seed/*.json
├── seed/                   facilities.seed.json (474), weeks-2026.seed.json (52)
├── public/                 favicon, manifest
├── firestore.rules         Security rules — the real backend
├── firestore.indexes.json
└── firebase.json
```

---

## Brand discipline

The Tailwind theme and CSS variables encode the official RPA palette and
typography (Arial, varied by weight/case; warm Mist canvas with a subtle
dot-grid; gunmetal sidebar; quiet status pills). **Yellow appears at most
once per view as an accent.** Never on white, never as body text.

The Zambian-flag footer band only renders on the printed weekly report
cover — never in the app chrome.

If you receive the official PNG logo assets (`rpa-logo.png`,
`apple-touch-icon.png`, PWA `icon-*.png`), drop them into `public/` and they
will be served alongside the inline SVG fallback in `components/Logo.tsx`.

---

## Acceptance criteria (from §16 of the spec)

- [x] Seeded dashboard shows **474 total, 181 licensed, 293 unlicensed,
      Public 53/236, Private 128/238, 204 authorisations** — verified by
      `tests/seedBaseline.test.ts`.
- [x] The §6 worked expectation passes — `tests/recordLicence.test.ts`.
- [x] Authorisations-on-Record increments on every recorded licence with or
      without an AUTH number.
- [x] Importation and other non-Use/Possession authorisations show on the
      facility (drawer "Other authorisations" group + register "N auth."
      badge) without changing licensed status.
- [x] Bulk approval commits atomically and updates both the register and the
      correct reporting week.
- [x] Weekly report auto-derives Authorisation & Standards 1–9 and
      Inspectorate 1–5 from that week's events; manual metrics persist.
- [x] Security rules enforce that Inspectorate officers cannot flip licensed
      status, aggregates are not client-writable, and non-admins cannot
      manage users.
- [x] Dashboard reads a single aggregate document.
- [x] The UI carries the RPA logo and palette, is responsive, and respects
      the brand checklist.

---

## License

Internal — Radiation Protection Authority of Zambia.
