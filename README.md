# RPA Integrated Regulatory Information System

A production-grade, multi-user web application for the **Radiation Protection
Authority of Zambia (RPA) — Nuclear & Radiation Safety Department**. It
unifies the licensing register, authorisations, inspections, and daily/weekly
sectional reporting into one system, backed by Firebase and pre-seeded with
the real register of **538 facilities** from the *2026 Licensing Status*
workbook: 405 functional / 133 non-functional, 212 licensed, each classified
Medical or Non-Medical, and **332 licences on record** — the 327 the workbook
accounts for (225 use/possession, 73 import, 15 variation, 5 decommissioning,
3 export, 3 transit, 2 transfer, 1 transport), dated by quarter of issue (see
`docs/licensing-status-2026-import.md` for the full import log, and
`docs/register-2026-import.md` for the July 2026 register it replaced).

**Navigation** (sidebar, in order): Overview · Facilities · **Reports**
(`/reports` — live status × functional matrix, sector/category/province
breakdowns, every count deep-linking into the filtered register, CSV export)
· **Authorisations**
(`/licences` — authorisation statistics built from the register) ·
**Inspectorate** (`/inspectorate` — the section's inspection database, in the
format of its own workbook: the province summary with its INSPECTIONS /
ENGAGEMENTS / OTHER ENFORCEMENTS columns, a facility-per-row sheet per province
round, inspection cards falling due, the forward schedule, and the log) · **Nuclear Safety, Security &
Safeguards** (`/nsss` — the NSSS section's metrics dashboard: vehicle
screening, IAEA meetings, engagements, TWG) · **Smart Status Update**
(`/licence-status` — the self-updating RAIS workflow tracker) · Bulk Approval ·
Inspection Requests (the Licensing ↔ Inspectorate interface) · **Daily
Updates** (`/daily` — each section logs its day; the week totals itself).

This is the implementation of the build specification in `BUILD_SPEC.md`
(supplied with the project upload).

---

## The unifying principle

The **dated event is the atomic unit**.

- A licence issuance and an inspection are each stored once as a dated record.
- The **register** is a projection of those events (_what is the current state?_).
- The **sectional update** is another projection of the same events, in the
  format of the approved 2026 RPA work plan (_what did output 1.2.4 do in week
  W22, and where does that leave it against the 500 target?_).
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
also ships with an in-memory **mock data store** that loads the 538-facility
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
| `nsss@rpa.gov.zm` | Nuclear Safety, Security & Safeguards officer |

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
   # verify the dashboard reads 538 / 212 / 326 / 405 functional
   ```
   **Replacing an existing register** (e.g. applying the 2026 Licensing
   Status workbook over a previously seeded project):
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run seed:fresh
   ```
   `seed:fresh` first **deletes** `facilities`, `licenceEvents`,
   `inspections`, `inspectionRequests` and `licenceWorkflows` (the old
   register and the history recorded against it), then seeds the new
   register. Users, weeks, weekly metrics, the work plan notes and opening
   balance, daily entries, borders and activities are kept. Mock/demo browsers reset themselves automatically
   (the mock store's storage key was bumped).
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
| `facilities/{id}` | Master register row — projection of all licences held by that facility, plus its register-import axes: `functional`, `category` (Medical/Non-Medical, veterinary counts as Medical), `stalled`, `needsReview`/`reviewNote`, `statusDetail` |
| `licenceEvents/{id}` | The dated flow log — one document per licence ever recorded |
| `inspections/{id}` | The dated inspection log — type, outcome, the `enforcement` action it led to, the `phase` of the province round, and the `cardIssued` date of any inspection card. The Inspectorate's whole database (province sheets, summary, card list) is derived from these |
| `inspectionRequests/{id}` | The Licensing ↔ Inspectorate handoff — one document per pre-authorisation inspection request, with its status, assigned inspector, report reference and full audit trail |
| `weekMetrics/{week}` | Manual per-week figures, keyed by work plan output (plus the section's supporting figures) |
| `workPlanNotes/{outputId}` | The Status / Comments / Action Points an officer keeps against one 2026 work plan output — the only typed columns of the sectional update; the figures are always derived |
| `workPlanBaseline/{year}` | The plan year's **opening balance** — what each output had already achieved before the system started counting it. The report is cumulative, so every row counts up from here. Admin-writable only (it moves every section's figures at once) |
| `dailyEntries/{id}` | Daily Updates log — per-day, per-section counts (on the same metric keys the sectional update reads, optionally tagged with a `border`) and notes (incl. the NSSS `official` daily confirmation); a week's daily sums take precedence over typed weekly figures |
| `borders/{id}` | NSSS border posts (vehicle screening); managed by NSSS/admins, deactivation keeps history |
| `truckScans/{id}` | Border Scan Log — one document per truck scanned at a post (unit, cargo, transporter, dose, result, action taken); every daily and weekly tally is derived from these |
| `activities/{id}` | Free-form weekly activities, scoped per section |
| `licenceWorkflows/{ran}` | RAIS licensing-status tracker — one row per application RAN, imported by paste or the email connector (`source`, `reviewStatus`), carrying the application's append-only officer **notes & history** trail (`notes`) |
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

The Smart Status Update tab can update itself. Forward the RAIS status-change
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
feeds the licensed count and work plan output 1.1.4). Every other RAIS update —
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

The **Authorisations** page (`/licences`) reports the totals this produces:
authorisations issued by type (renewal + new use + import + transit + …), and —
derived from each facility's most recent Use/Possession licence date — which
facilities hold a current use licence **for a chosen year** versus those whose
renewal is still in the pipeline (and at which stage). `lib/rules/licenceStats.ts`
computes it; the Overview surfaces a summary.

---

## Application notes & history — the officer handover

Different officers touch the same application at different times, and the
background used to leave the building with whoever stepped out. Every tracked
application (each `licenceWorkflows` RAN) now carries an **append-only notes &
history trail** so the next officer picks it up warm:

- **Officer comments** — free text ("applicant promised POP by Friday — don't
  regenerate the invoice"). Any signed-in officer of any section may comment;
  the entry records who, which section, and when.
- **Automatic history** — `saveLicenceWorkflows` appends a dated entry whenever
  a save changes what the application shows: first tracking, every status move,
  an officer accepting an incoming email, a FORM-I type classification. Nobody
  has to write the log — working the application writes it
  (`lib/rules/workflowNotes.ts`, unit-tested).

**Where it surfaces.** On **Smart Status Update**, every pipeline card is
clickable and the review table, incoming-email inbox and Ready-to-license
panels carry a 💬 *Notes & history* control — the inbox and approval rows also
show the latest comment inline, so the background is read *before* Accept /
Approve. The drawer shows the full trail (newest first), the raw RAIS
notifications seen for the application, and the composer. Cross-section, the
**facility view** — the register's slide-in drawer and its permalink page
`/facilities/[id]`, both rendered from `components/facility/FacilityDetail.tsx`
— lists each facility's applications with the same expandable trail, so an
inspector or NSSS officer sees what Licensing knows without leaving their view.

Storage is clobber-proof by construction: imports never write the `notes`
array wholesale — new entries append via `arrayUnion`, so a re-paste or a
concurrent commenter can't erase a colleague's note. Security rules let any
signed-in officer **append** (`notes`/`updatedAt`/`updatedBy` only, never
shrinking the list) while everything else on the record stays A&S-only, and
deletes stay admin-only.

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
   **report reference** (a RAIS ref or a document link), any findings, the
   **enforcement action** it led to and whether an **inspection card** was
   issued. This moves the request to **Report Ready**, and — the key integration
   — records a dated `inspection` in the Inspectorate's log (linked by
   `inspectionId`/`requestId`) so output 1.2.4, the "inspections conducted"
   totals and the province sheet pick it up automatically.
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
admin-only. The Overview and the Inspectorate tab surface the resulting totals
— the Inspectorate tab's **schedule** panel lists every active request by its
target / needed-by date so the pipeline between the two sections stays
trackable — and the facility drawer lists every request a facility has had.

---

## The inspection database — the Inspectorate's own workbook

The Inspectorate keeps its year in one workbook: a sheet per province round, a
consolidated Database sheet, and a Summary sheet that Management reads. That
**is** the Inspectorate tab now (`/inspectorate`,
`lib/rules/inspectionDatabase.ts`) — same columns, same wording, same two
headline figures — except that nothing in it is typed twice. Every figure is
derived from the dated inspection register, so logging one inspection moves the
facility row, the province summary, the card list and the weekly report at once.

**The Summary sheet.** One row per province round, with the workbook's three
bands across the top:

| | INSPECTIONS | | | | | ENGAGEMENTS | | | OTHER ENFORCEMENTS | | | | | | |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Province** | Pre-Auth | Planned | Follow-Up | Investigative | **Total** | Facility Level | District Level | Provincial Level | Practices Suspended | Devices Seized | Written Warnings | Enforcement Notices | License Suspensions | License Cancellations | **Total** |

with a **Total** row and, underneath, *Total Inspections Conducted* and *Total
Enforcements*. Tapping a province opens its sheet.

**A province sheet.** One row per facility — `NO. · FACILITY NAME · DISTRICT ·
PRACTICE · PRE-AUTH · PLANNED · FOLLOW-UP · INVESTIGATIVE · TOTAL · ENFORCEMENT
ACTION TAKEN · DATE INSP CARD ISSUED · INSP CARD EXPIRY DATE · INSP CARD
STATUS`. District and practice are read off the register, never retyped. A
sheet is also the round's **coverage list**, so it can show the facilities still
at zero (`Inspected · Not yet inspected · All`) — which is the question a
half-finished round actually raises.

**Inspection cards.** A card runs **30 days** from the day it is issued; its
expiry and status are derived, never stored, on the workbook's own thresholds —
*Expired* once today is past the expiry date, *Expiring Soon* inside the last
fortnight, otherwise *Active*. The dashboard's **Cards due** panel is that
column sorted by soonest expiry.

**Phased rounds.** A province covered in more than one visit ("Copperbelt Phase
2") gets its own summary row and its own sheet, exactly as the workbook gives
it its own tab. The phase is one optional field on the inspection.

**What an inspector types.** The logging form (and the one-question-at-a-time
wizard on Daily Updates) asks only for what the columns need: the facility,
date, type, outcome, the **enforcement action** if one was taken — from the
workbook's nine-value list, "None" first — the phase if the province is being
covered in phases, and whether an **inspection card** was issued. Everything
else the system already knows.

The enforcement vocabulary is stored with the workbook's own spelling
("Suspension of License"), not the British spelling used for licences
elsewhere in this codebase, so an exported database pastes straight back into
the workbook's validated column.

**Exports.** *Export summary* and *Export database* write the two sheets in the
workbook's own layouts — the Summary with its banded head and footer figures,
the Database with its thirteen columns.

**On the weekly report.** The sectional update carries the same summary under
the work plan (following the report's own Year-to-date / This-week switch), so
the Monday pack reads exactly as it always has. Output **1.2.11** counts every
inspection that led to an enforcement action — expand it for the nine-action
split, the same columns the summary bands.

---

## The sectional update — the 2026 RPA work plan format

Management's standing instruction is that *"sectional updates in our Monday
meeting shall be in this format as they appear in the approved 2026 RPA work
plan"*. `/weekly` **is** that format. The plan itself — every subprogramme,
output, key indicator and target — lives in `lib/rules/workPlan.ts`, which is
the single place to change if Management revises the plan.

Each subprogramme is one table with the workbook's own columns:

| Output ID | Output Description | Key Indicator | 2026 Target | **This week** | Q1 | Q2 | Q3 | Q4 | Total Actual | % Achieved | Status | Comments | Action Points |

**This week** is the one addition — the report is still produced for a Monday
meeting, so the week column is what the section did and the quarter columns are
what that adds up to. The output id and its description stay pinned while the
rest scrolls sideways.

### Cumulative for the year, with a filter for the week

The plan is measured over the whole year, so **Year to date** is what the report
opens on: the quarter columns and Total Actual are the year's position, and the
week column is not shown. A `Showing` filter switches between three column sets,
and the choice is remembered:

| View | Columns | For |
|---|---|---|
| **Year to date 2026** (default) | Target · Q1–Q4 · Total Actual · % · Status · Comments · Actions | the report Management reads — the workbook's own columns |
| **This week only** | Target · This week · Total Actual · % · Status · Comments · Actions | what the section did this week, still beside where the year stands; fits a screen without scrolling, so it is also the easiest view to type figures into |
| **Week + year** | everything | reconciling one against the other |

### The opening balance — where the cumulative count starts

The sections did not start the year on this system, so every output counts up
from an **opening balance**: what it had already achieved before the system
began recording it. A section at 125 licences when it came onto the system
reports 126 once the next one is logged, not 1.

The figures ship with the approved workbook's actuals at handover
(`WORK_PLAN_OPENING_BALANCE` in `lib/rules/workPlan.ts`), so the report is right
from the first day. **Opening balance — 2026** on `/weekly` shows what is in
force and, for an admin, how to change it: paste rows straight out of the plan
spreadsheet (`parseOpeningBalance` reads the workbook's column order, or a
looser *id then Q1–Q4*), or type into the per-quarter grid, then save. Buttons
reset to the workbook figures or clear the year to zero.

A saved baseline **replaces** the shipped figures rather than merging with
them, so an output an officer zeroed stays zero. Pasting a few rows only
touches those outputs — the rest of the grid keeps what it was showing.

> The opening balance covers work the registers do **not** hold. Back-importing
> the same licences or inspections would count them twice; zero that output's
> opening figures first if you ever do. Expanding a row shows the split —
> *Total actual = opening balance + recorded since* — so the two are always
> separable, and the CSV carries them as trailing columns.

### Nothing on the plan is retyped that the system already knows

| Output | Filled from |
|---|---|
| 1.1.4 Issuance of Ionising Radiation Licences | every licence on the `licenceEvents` register — expand the row for the split by licence type |
| 1.2.4 Routine, follow-up, pre-authorization & investigative inspections | every `inspections` record except enforcement — expand for the routine / follow-up / pre-authorisation / investigation split |
| 1.2.11 Conduct Enforcement Actions | `inspections` of type *Enforcement Action* |
| 1.3.12 Monitoring of illicit trafficking (ZRA Asycuda) | the border scan log and the coordinators' daily counts — expand for the split by border post |

Logging an inspection still records **what kind** it was; the work plan reports
the total the plan asks for and keeps the breakdown one click away. Everything
else is a figure an officer logs on Daily Updates or types into the row's
*This week* box, and the quarter, total and % achieved follow from it.

### Quarters, status and the narrative columns

A record counts toward the quarter its **reporting week starts in**, so a week
that straddles a quarter boundary (W14, 30 Mar → 3 Apr) is never split or double
counted, and an auto figure and a typed figure logged in the same week always
land in the same column. **% Achieved** is Total Actual (opening balance
included) ÷ 2026 Target; outputs the workbook targets with "-" show "—"
instead.

**Status** derives itself — *Not Started* / *In Progress* / *Achieved* — until an
officer says otherwise; opening a row lets the owning section override it
(including the workbook's *Pending*) and write the **Comments** and **Action
Points**. Those three columns are the only typed narrative in the report and are
stored per output in `workPlanNotes`, not per week, because they describe where
the output stands, not what happened in one week.

**Supporting figures** are listed under their subprogramme, below a divider:
figures a section tracks that the plan has no output for (the A&S and
Inspectorate stakeholder/TWG counts, the National Source Inventory team's field
figures behind 1.2.9). They carry no target, % or status.

**Export sheet** writes the table as CSV in the workbook's own column order, so
a section can paste its update straight into the plan spreadsheet; **Generate
brief** writes the same thing as a plain-text briefing, and **Print / PDF**
produces the printed report with the Zambian-flag cover.

> `workPlanNotes` and `workPlanBaseline` are new collections — **the rules
> must be deployed** before officers can save a Status, Comment or Action
> Point, or an admin can re-baseline the year. Firestore denies writes to a
> collection no deployed rule mentions, admin account or not. Until then the
> report reads fine — the figures come from collections that already exist,
> and the opening balance falls back to the approved workbook's — and saving
> reports the failure. See [Deploying the security rules](#deploying-the-security-rules).

---

## Daily Updates → the sectional update

The **Daily Updates** tab (`/daily`) replaces once-a-week data entry: each
section logs its day as it happens and the week totals itself. Logging is a
**one-question-at-a-time guided flow built for a phone in the field** — big
tap targets, no dropdowns, the numeric keypad for numbers, and a "logged ✓"
screen with one-tap "log another" (`components/daily/QuickLogWizard.tsx`).
Sections share one account each (Licensing, Inspectorate, NSSS — created by
the admin under Users), and each account lands directly on its own flow.

- **Inspectorate** taps through *which facility → what type → outcome →
  confirm* — the entry goes straight into the dated `inspections` register, so
  the dashboard, output 1.2.4 and the facility history all update from the
  same record.
- **Licensing (A&S)** sees the licences recorded that day plus the
  issued-certificate suggestions waiting for confirmation on Smart Status
  Update ("these facilities appear licensed — confirm it"), and logs its
  work plan figures (safety guides, regulations, awareness meetings …) in two
  taps.
- **NSSS** is border-aware: vehicle-screening counts ask *which border post*
  first. Each border coordinator logs their own daily figure on the shared
  NSSS account; the Daily Updates page shows the **live per-border breakdown
  and grand total**, and the senior officer taps **Confirm official total** —
  stored as an auditable `official` note so the numbers stay single-sourced
  from the coordinators' entries. Border posts live in the `borders`
  collection, managed by NSSS/admins on the NSSS tab (deactivating keeps
  history); the NSSS dashboard adds a screening-by-border breakdown.
- **NSI** logs the source inventory exercise and its field figures (facilities
  visited, sources inventoried and verified, discrepancies) the same way.
- A border post that logs **truck by truck** on the Border Scan Log (below)
  does not type its daily figure at all — it posts the count of what it
  scanned.

Every choice on the count flow is a **work plan output** — it says which one
(*"Work plan output 1.1.6"*) right under the label — and the entry is stored in
`dailyEntries` on the **same metric key** the sectional update reads
(`lib/rules/daily.ts` + `manualOutputsForSection`). So the row shows the week's
daily sum, marked **daily** and read-only there; outputs with no daily entries
keep the direct weekly input. Figures a section logged under its earlier metric
names still count toward the output that replaced them (`alsoCount` in
`workPlan.ts`), and vehicle screening deliberately keeps its original key —
changing it would orphan every figure the border posts have recorded.

"Open the sectional update" on the daily tab jumps to `/weekly` for the selected
week; the "Week so far" panel beside the flow already shows the week's
contribution per output and where that leaves it against the annual target.

---

## Deploying the security rules

Firestore denies every write to a collection **no deployed rule mentions**,
admin account or not. So any release that adds one — `workPlanNotes` and
`workPlanBaseline` for the sectional update, `dailyEntries` and `borders` for
Daily Updates, `truckScans` for the border log — reads fine but cannot save
until `firestore.rules` is published. Three ways, pick one:

**From GitHub (nothing to install).** The `Deploy Firestore Rules` workflow
publishes `firestore.rules` and `firestore.indexes.json` automatically when
either changes on the production branch. To run it now: repo → **Actions** →
*Deploy Firestore Rules* → **Run workflow**. It uses the same `FIREBASE_TOKEN`
secret as *Deploy Functions*.

**From the Firebase Console (no CLI, no secret).** Open
[Firestore → Rules](https://console.firebase.google.com/project/nrsd-imformation-management/firestore/rules),
paste the whole of `firestore.rules` over what is there, and press
**Publish**. Fastest one-off, but it is a copy-paste — the repo stays the
source of truth, so re-paste after every rules change.

**From your own machine.**

```bash
npm install -g firebase-tools
firebase login
npm run deploy:rules        # firebase deploy --only firestore:rules,firestore:indexes
```

Check it worked by saving a Comment on any output of the sectional update: it
either saves, or the toast names the permission error.

---

## Border Scan Log

The **Border Scan Log** tab (`/border`) is the border offices' capture screen:
one record per scanned truck, replacing the monthly Excel workbook the posts
kept (a sheet per day, a row per truck, and a tally block retyped by hand at
the end of every shift).

The shift header — post, date, direction — is answered once. Each truck is
five short answers:

1. **Registration / chassis number** — normalised on save, so `T 361 DVG` and
   `T361DVG` are one truck.
2. **Cargo** — one type-ahead over a controlled commodity list
   (`lib/rules/borderCargo.ts`). The workbook's three cargo columns (goods of
   interest / food / other) collapse into this single question: the **class is
   derived from the commodity**. A commodity the list has never seen is still
   accepted, classed once, and reported as new so the list grows on purpose.
3. **Transporter / declarant** — type-ahead over what the post has logged
   before, seeded with the names the northern posts see most.
4. **Dose rate (nSv/h)** — number plus one-tap chips for the common readings.
5. **Action taken** — asked **only** when the reading is above background.

Everything else derives: identifier type (plate / chassis / VIN), cargo class,
NORM-bearing, result (Normal / Elevated / Alarm from the thresholds in
`lib/rules/borderScans.ts`), the time, and every tally.

Validation comes from what actually went wrong in the workbooks — doses typed
as `4O`, `8-` or `90]` are rejected; a reading at or above 100,000 nSv/h is
queried but can be confirmed (a real detection must stay recordable); a unit
already scanned at the post that day is flagged with the earlier reading before
it can be saved again.

The day view computes the workbook's three tally blocks, the dose spread, the
readings above background with their actions, and a **Worth a look** panel (new
commodities, repeated units, transporter names that look like duplicates). The
week view adds scans by day, a per-post table and a ready-to-paste weekly
paragraph. Rows and summary both export as CSV.

**Post day total to Daily Updates** writes the day's count as a single
`dailyEntries` count marked `source: "scan-log"`; posting again replaces it
rather than adding, so work plan output 1.3.12's screening figure
can never be double counted.

`truckScans` is a new collection, so **deploy the rules and indexes before the
posts can log** (`firebase deploy --only firestore:rules,firestore:indexes`) —
Firestore denies writes to a collection no deployed rule mentions, admin
account or not. Until then the tab reads fine and saving reports the command.

`scripts/check-border-vocabulary.py` replays a monthly workbook through the
vocabulary and reports coverage — 99.7% of the June 2026 Nakonde book's 9,198
scans resolve to the standard list, folding 43 commodities' worth of spelling
variants. Full mapping in [`docs/border-scan-log.md`](docs/border-scan-log.md).

---

## Tests

```bash
npm test
```

349 tests across `lib/rules/*` and the seed baseline, including:

- `detectType` — auto-detects all ten licence type codes
- `matching` — Jaccard + substring + FAC code matching, with short-string guard
- `recordLicence` — full R1–R6 worked expectation
- `inspectionRequests` — request state machine, capability gating, inbox
  notifications and stats for the Inspectorate ↔ Licensing handoff
- `workflowNotes` — the application notes & history trail: comment building,
  the automatic history entries a save produces, and that officer comments
  survive re-imports
- `inspectionStats` — Inspectorate dashboard period filters (week/month/year),
  per-type and outcome counts, and the schedule ordering
- `inspectionDatabase` — the Inspectorate workbook reproduced from the register:
  the 30-day inspection card (expiry, Active / Expiring Soon / Expired, and that
  the arithmetic does not move with the browser's timezone), the four
  inspection-type columns and their row total, the enforcement action carried on
  a row, phased province rounds getting their own sheet and summary row, sheet
  numbering and province order, the coverage list of facilities still at zero,
  the Summary roll-up and its two headline figures, and both CSV layouts
- `daily` — daily-entry sums, the daily-over-weekly precedence rule, that
  daily metric keys match the sectional update's exactly, and the per-border
  screening sums + official-total text
- `borderScans` — the border capture rules: the workbook's spelling variants
  folding onto canonical commodities, cargo class derived from the commodity,
  the dose typos it rejects and the high reading it lets an officer confirm,
  the day/week tallies, and that a posted day total replaces rather than
  duplicates
- `workPlan` — the 2026 work plan report: that the plan carries the workbook's
  outputs and targets, week → quarter mapping (including the week that straddles
  a quarter boundary), the auto-filled rows (1.1.4 licences, 1.2.4 inspections
  excluding enforcement, 1.2.11 every inspection that led to an enforcement
  action — split by action — 1.3.12 screening on the border log's
  own metric key), figures logged under pre-work-plan metric names still counting,
  the **opening balance** the cumulative count starts from (the workbook's
  handover actuals, a saved baseline replacing them outright, % and status
  measured on the combined total), the spreadsheet paste parser, and the export
  columns
- `aggregate` — sector / province / stage breakdowns
- `week` — date → week-label mapping
- `seedBaseline` — verifies the register baseline (538 / 212 / 326 / 405 functional /
  Medical 350) and that the licences on record reconcile with the Licensing
  Status workbook's own totals, type by type and quarter by quarter
- `category` — Medical vs Non-Medical classification, seed-field mapping, CSV export

Add Firestore rules tests with the emulator in a follow-up.

---

## Project layout

```
.
├── app/                    Next.js App Router (one folder per route)
│   ├── login/
│   ├── page.tsx            Overview / Dashboard
│   ├── facilities/         Register + deep-linkable detail
│   ├── licences/           Authorisations tab — statistics from the register
│   ├── inspectorate/       Inspection database — summary, province sheets, cards, log
│   ├── inspections/        (moved) redirects to /inspectorate
│   ├── nsss/               Nuclear Safety, Security & Safeguards dashboard
│   ├── border/             Border Scan Log — one record per scanned truck
│   ├── licence-status/     Smart Status Update — RAIS workflow tracker
│   ├── bulk-approval/      Paste → match → review → commit
│   ├── inspection-requests/ Licensing ↔ Inspectorate pre-auth handoff board
│   ├── daily/              Daily Updates — per-section daily logging
│   ├── weekly/             Sectional update — the 2026 work plan report
│   ├── admin/users/
│   └── settings/
├── components/weekly/      OpeningBalancePanel — where the cumulative count starts
├── components/inspectorate/ InspectionSummaryTable + InspectionDatabaseTable — the
│                           workbook's Summary and province sheets, shared by the
│                           Inspectorate dashboard and the weekly report
├── components/             UI primitives — Section (Panel/PageHeader/Field), Segmented,
│                           Sidebar, Topbar, MobileNav, Drawer, Kpi, Bars, Gauge, Toast …
├── components/facility/    FacilityDetail — shared by the drawer and /facilities/[id]
├── lib/
│   ├── rules/              PURE business logic — fully unit-tested
│   ├── store/              DataStore interface + mockStore + firebaseStore
│   ├── auth.tsx            Auth context (mock + Firebase aware)
│   ├── firebase.ts         Client init
│   └── weekContext.tsx     Global reporting-week selector
├── functions/              Cloud Functions (separate package)
├── scripts/seed.ts         Seeds Firestore from seed/*.json
├── scripts/check-border-vocabulary.py  Replays a border workbook through the cargo vocabulary
├── seed/                   facilities.seed.json (538), weeks-2026.seed.json (52)
├── public/                 favicon, manifest
├── firestore.rules         Security rules — the real backend
├── firestore.indexes.json
└── firebase.json
```

---

## Brand discipline

The Tailwind theme and CSS variables encode the official RPA palette and
typography (Arial, varied by weight/case; warm canvas; gunmetal sidebar;
quiet status pills). **Yellow appears at most once per view as an accent.**
Never on white, never as body text.

The Zambian-flag footer band only renders on the printed sectional update
cover — never in the app chrome.

### Layout system

Three surfaces do all the work, defined in `app/globals.css`: a warm
`--canvas`, a white `--surface` sheet that sits on it, and a `--sunken` tint
for blocks nested inside a sheet. There are no drop shadows or outlines on
content — hairlines and space separate things instead, so a page reads as one
document rather than a pile of floating boxes. Shadows are reserved for things
that genuinely float (`.popover`, drawers).

The primitives live in `components/Section.tsx`:

- `Panel` — one white sheet with a titled head. Related figures and lists live
  *inside* one panel, separated by hairlines, instead of each getting a card.
  `flush` drops the padding for a table or an edge-to-edge divided list.
- `PageHeader`, `SectionTitle`, `Field`, `DataRow` for the content inside.
- `.stat-grid` + `<Kpi>` — a row of figures as one strip divided by hairlines
  (the 1px grid gap shows the container colour through), not N separate cards.
- `.bleed` runs a full-width sheet edge to edge on phones.
- `Segmented` (`components/Segmented.tsx`) is the shared filter control; it
  wraps instead of overflowing a narrow screen.

`@tailwind utilities` is imported at the *bottom* of `globals.css`, so a
one-off utility class always overrides these component styles.

### Mobile

Every page is built for a phone as well as a desk:

- A bottom tab bar (`components/MobileNav.tsx`) carries the four screens
  officers live in, with "More" opening the full navigation drawer. `.app-main`
  reserves its height (plus the home indicator) so nothing hides beneath it.
- Wide registers render as a table from `md` up and as a list of rows below it
  — a seven-column table is unusable at 390px.
- `.input` is 16px on small screens so iOS Safari does not zoom on focus, and
  buttons carry a 40px minimum height.
- Drawers portal to `<body>`: pages animate in behind a `transform`, which
  would otherwise make them the containing block for `position: fixed`.

If you receive the official PNG logo assets (`rpa-logo.png`,
`apple-touch-icon.png`, PWA `icon-*.png`), drop them into `public/` and they
will be served alongside the inline SVG fallback in `components/Logo.tsx`.

---

## Acceptance criteria (from §16 of the spec)

- [x] Seeded dashboard shows **538 total, 212 licensed, 326 unlicensed,
      405 functional, Public 65/250, Private 147/288, 332 authorisations** —
      verified by `tests/seedBaseline.test.ts` (2026 Licensing Status workbook).
- [x] The §6 worked expectation passes — `tests/recordLicence.test.ts`.
- [x] Authorisations-on-Record increments on every recorded licence with or
      without an AUTH number.
- [x] Importation and other non-Use/Possession authorisations show on the
      facility ("Authorisations held → Other authorisations" group + register
      "N auth." badge) without changing licensed status.
- [x] Bulk approval commits atomically and updates both the register and the
      correct reporting week.
- [x] The sectional update reproduces the approved 2026 work plan's columns,
      auto-derives outputs 1.1.4, 1.2.4, 1.2.11 and 1.3.12 from the registers
      and the border/daily logs, and reports every output **cumulatively for
      the year** from its opening balance — with a filter for the week alone;
      typed figures, the opening balance and the Status / Comments / Action
      Points columns persist.
- [x] The Inspectorate tab reproduces the section's inspection database — the
      province Summary with its INSPECTIONS / ENGAGEMENTS / OTHER ENFORCEMENTS
      columns, a facility-per-row sheet per round, and the 30-day inspection
      card's expiry and status — all derived from the dated register, exported
      in the workbook's own layouts, and carried onto the weekly report.
- [x] Security rules enforce that Inspectorate officers cannot flip licensed
      status, aggregates are not client-writable, and non-admins cannot
      manage users.
- [x] Dashboard reads a single aggregate document.
- [x] The UI carries the RPA logo and palette, is responsive, and respects
      the brand checklist.

---

## License

Internal — Radiation Protection Authority of Zambia.
