# Border Scan Log — what the posts record, restructured

The Nuclear Safety, Security & Safeguards section's border offices screen every
truck that crosses at a manned post. Until now the record was a monthly Excel
workbook — one sheet per day, one row per scanned truck, and a tally block the
officer retyped at the end of each shift.

This note is the mapping between that workbook and the `/border` tab: what is
still asked, what is now derived, and what was added because the weekly report
needs it.

The reference book used throughout is `JUNE_NKD_2026.xlsx` — Nakonde, June
2026, 30 day sheets, **9,198 scans**.

---

## The old sheet

Each day sheet had six columns and a tally block beside them:

| Col | Header | Filled on |
|-----|--------|-----------|
| A | `REG. NUMBER / CHASSIS NUMBER` | every row |
| B | `GOODS OF INTEREST` | 9,025 of 9,198 rows |
| C | `FOOD` | 24 rows |
| D | `OTHER` | 45 rows |
| E | `TRANSPORTER / DECLARANT` | every row |
| F | `DOSE (nSv/h)` | every row |
| G–L | hand-typed tallies: commodity + count, once per class | end of shift |

B, C and D are three columns but one question — only 7 rows of 9,198 had more
than one filled. The officer was choosing a *class*, then typing a *commodity*.

### What went wrong in a single month

| Problem | Count | Why it happens |
|---|---|---|
| Spellings of one commodity | 195 distinct terms for ~60 commodities | free text |
| — sulphur alone | `SULPHUR`, `SULPUR`, `SULPHUIR`, `SURLPHER`, `SULLPHUR`, `SULPHURT`, `SULPHUR'` | free text |
| — copper anode | `ANODE`, `ANODES`, `COPPER ANODE`, `COPPER ANODES`, `COPPER ANOD` | free text |
| Unparseable dose readings | `4O` (letter O), `8-`, `90]`, `90'90` | free text, no validation |
| Doses run together | `7090`, `8090` — two readings in one cell | no validation |
| Rows with no cargo recorded | 97 | nothing required it |
| Rows with no dose recorded | 9 | nothing required it |
| Values typed a column across | `80.0`, `EMB`, `DATSO`, `ITB21A-9307414` in a cargo column | adjacent columns |
| Transporter spellings | 640 distinct for far fewer firms (`BUSOKELO`/`BUSEKELO`) | free text |
| Tally vs row count disagree | 19 of 30 days | hand-tallying 300+ rows |

And two things the sheet simply could not answer, because it never asked:
**was any reading above background, and what was done about it?** That is the
question a weekly report exists to answer.

---

## The new record

One `TruckScan` per scanned unit. The officer answers **five** things; the rest
is carried from the shift header or derived.

### Answered once per shift (the header)

| Field | How |
|---|---|
| Border post | picked from the Border register; remembered per device |
| Date | defaults to today |
| Direction | Inbound / Outbound / Transit — a default for the shift, overridable per scan |
| Officer | from the signed-in account |
| Reporting week | derived from the date |

### Asked for every truck

| # | Field | Input | Replaces |
|---|---|---|---|
| 1 | Registration / chassis number | text, normalised on save | column A |
| 2 | Cargo | one type-ahead over the controlled commodity list | columns B, C **and** D |
| 3 | Transporter / declarant | type-ahead over what the post has logged before | column E |
| 4 | Dose rate (nSv/h) | number + one-tap chips for 20–100 | column F |
| 5 | Action taken | dropdown — **only shown when the reading is above background** | *(new)* |

Remarks are one tap away and optional.

### Derived — never typed

| Field | Derived from |
|---|---|
| ID type (Plate / Chassis / VIN / Other) | the shape of the number |
| Cargo class (Goods of Interest / Food / Other) | the commodity picked |
| NORM-bearing | the commodity's entry in the vocabulary |
| Result (Normal / Elevated / Alarm) | the dose against the review thresholds |
| Time | stamped on save |
| Every tally in columns G–L | the rows themselves |

The class question survives in one place only: when an officer types a
commodity the vocabulary has never seen, three chips appear so they can class it
once. That commodity then shows up in the day's **New commodities** list, so the
standard list grows deliberately rather than by accident.

---

## Validation at the point of entry

Each rule below exists because of a specific failure in the workbooks:

- **Dose must be a plain number.** `4O`, `8-` and `90]` are rejected as typed.
- **A reading at or above 100,000 nSv/h is queried,** not blocked — a genuine
  detection can be very high, so the officer can confirm and record it. This is
  what catches `7090`/`8090`-style run-together readings.
- **Cargo, transporter and dose are required.** No more blank rows.
- **Above background ⇒ an action is required.** The scan cannot be saved
  without saying what happened to the truck.
- **A unit already scanned at this post today is flagged** with the earlier
  scan's time, cargo and reading. Saving is blocked until the officer confirms
  it is a genuine second pass — 111 units repeated in the June book with no way
  to tell a double entry from a second crossing.
- **Registration numbers are normalised** (`T 361 DVG` and `T361DVG` are the
  same truck), so duplicate detection and history lookups actually work.

## Dose thresholds

Operational review triggers, **not regulatory limits** — they decide when a
truck gets a second look. Set in `lib/rules/borderScans.ts`:

| Band | Range (nSv/h) | Meaning |
|---|---|---|
| Normal | below 300 | background — the June book is almost entirely 20–100 |
| Elevated | 300 – 999 | re-scan, confirm the cargo, record the action |
| Alarm | 1,000 and above | refer for secondary inspection |

Change them in that one place and the form, the tallies, the daily figures and
the weekly paragraph all re-triage together.

---

## What the day and the week now produce

Nothing below is typed by anyone.

**Per day, per post** — the three tally blocks exactly as the workbook kept
them, plus: total scanned, dose spread (highest / typical / lowest), the
readings above background with the action taken against each, the transporter
tally, and a **Worth a look** panel listing new commodities, repeated units and
transporter names that look like the same firm typed two ways.

**Per reporting week, all posts** — scans by day, a per-post table (scanned,
days reported, above background, highest reading), the full tallies, and a
ready-to-paste paragraph:

> 9,198 trucks were scanned for radiation at the border posts during
> W23 — Nakonde 9,198. The main goods of interest were IT (5,424), Sulphur
> (1,788), Copper Anode (409)… All readings were at background (highest 100
> nSv/h, typical 80 nSv/h). No consignment required further action.

**Exports** — the rows as CSV (the file the post keeps) and the summary as CSV
(the tally block in the shape the section already reads).

## How the weekly figure stays single-sourced

The section's weekly report has always read one metric, *Vehicle Screening
(units)*, from the Daily Updates log. A post that logs truck by truck does not
type that figure: **Post day total to Daily Updates** writes it as a single
count entry marked `source: "scan-log"`.

Posting again *replaces* that entry rather than adding to it, so a late scan
corrects the day instead of doubling it. Figures typed by hand at other posts
are untouched, and the weekly report keeps reading the same metric it always
has.

---

## Before the posts can use it: deploy the rules

`truckScans` is a **new Firestore collection**. Firestore denies every write to
a collection no deployed rule mentions — regardless of the account, because the
`admin` role in this app is a custom claim the rules read, not a bypass. Nothing
in CI deploys rules, so after merging:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Until that runs, the tab loads and reads fine (every read degrades to empty) but
saving a scan fails. The capture screen says so and gives the command rather
than repeating Firestore's "Missing or insufficient permissions", which reads as
an account problem and is not one.

---

## Working with no signal

Most inland posts have no signal for hours at a time, and a truck at the
barrier cannot wait for it. Before this the capture form waited for the
server's acknowledgement on every save — a spinner until the request timed
out, then "Could not save" — and the app itself would not open unless there
was a connection. Now:

- **A save never waits for the server.** `addTruckScan` writes to Firestore's
  local cache and returns; the SDK's promise (which settles only when the
  server answers) is handed to `lib/store/writeQueue.ts` rather than awaited.
  The form clears at once, with or without signal.
- **The queue survives a reload.** `lib/firebase.ts` initialises Firestore
  with `persistentLocalCache` (multi-tab), so queued writes live in
  IndexedDB and go, in order, when the SDK next has a connection — after a
  page reload, a phone restart, an afternoon. Reads fall back to what the
  device last saw.
- **The shift list is live and local.** `watchTruckScansFor` is an
  `onSnapshot` on the post-day with metadata changes included: a scan shows
  the moment it is typed, carries a *waiting* chip while
  `hasPendingWrites` is set, and the chip clears the moment the server
  acknowledges it. The pending count on the strip above the form comes from
  the same metadata — never from a counter in memory, which a reload would
  zero while the SDK's queue is still full.
- **The app opens without signal.** `app/sw.ts` (built by `@serwist/next`
  into `public/sw.js` on `next build`; off in development) precaches the
  static bundles and keeps the pages an officer has opened. Network-first
  with a five-second limit, so a phone showing a bar of signal and no
  throughput still gets the page. Firebase's own hosts are excluded from the
  worker's caches — Firestore keeps its own.
- **A refusal is reported, not swallowed.** A queued write the server rejects
  (rules not deployed, an account revoked in the meantime) is rolled back by
  the SDK without a word. The tracker keeps it — the officer's own label
  ("ABC 1234 at 09:14") and the reason — on a red strip above the form until
  dismissed, with a toast when it lands, so the truck can be logged again.

What it does not cover:

- **Signing in needs signal** — once. A signed-in officer stays signed in
  (Firebase Auth persists the session) and the token refreshes on reconnect
  before the queue flushes; but a fresh sign-in, and the first load of the
  app on a new phone, need a connection.
- **The duplicate check is per device.** Two phones at one post, both
  offline, each see only their own scans until they sync.
- **A refusal from before a reload cannot be caught.** The SDK retries the
  queue after a reload on its own; if the server refuses one of *those*
  writes, only the console hears it. The scan simply disappears from the
  list. This is rare (rules and accounts do not change under a shift) and
  the reconciliation against the post's paper tally would show it.
- **A private window with IndexedDB blocked** falls back to a memory cache:
  writes still queue while the tab is open, but a reload loses what has not
  reached the server. The *waiting* count is the officer's warning before
  closing the tab.
- **Posting the day total** to Daily Updates still waits for the server. It
  is an end-of-shift action, once a day, and it replaces a document rather
  than adding one — the coordinator does it where there is signal. A day
  that was never posted, or was posted before late scans came in, is listed
  under *Other days this week not yet on Daily Updates* with a *Post* per
  day, so a two-day gap is two taps rather than changing the header date
  back and forth. Days in an earlier week are reached through the header.

---

## Keeping the vocabulary honest

`lib/rules/borderCargo.ts` holds the commodity list, the alias table and the
seed transporter names. To check it against a new month's workbook before
extending it:

```bash
python3 scripts/check-border-vocabulary.py JULY_NKD_2026.xlsx
```

It parses the vocabulary out of the TypeScript (one source of truth), replays
every row through it, and reports what resolved, what folded together, and what
is genuinely new. Against the June 2026 Nakonde book:

```
Scan rows                         9,198
Resolved to the standard list     9,077 of 9,102 (99.7%)
Distinct canonical commodities    107
Spellings folded together         43 commodities
New — not yet in the list         24 distinct, 25 rows
```

The 25 remaining rows are genuine one-offs (specialist chemicals) and a handful
of transporter names typed into the cargo column — exactly the cases the
"new commodity" flow is for.

### On transporter names

Transporter aliases are deliberately conservative. Only unambiguous typos are
merged (`BUSEKELO` → `Busokelo`, `JOHNMUSS` → `Johmuss`). Pairs like
`ANK` / `ANK HEAVENLY` and `SPOT ON` / `SPOT ON CARGO` may be two real firms, so
they are **listed for a human to settle**, never merged automatically —
collapsing two real companies is a worse error than carrying both.

---

## Open questions for the section

1. **`IT`** — 5,424 of 9,198 scans (59%), always against a chassis number or
   VIN. It is recorded exactly as the workbook does and described in the picker
   as "vehicle imports". If it stands for something else, change the `hint` on
   the `IT` entry in `borderCargo.ts`.
2. **The dose thresholds** above are a starting point drawn from the readings in
   the June book. If the section works to different trigger levels, change the
   three constants.
3. **Historical import.** The workbooks are not loaded into the app — the
   checker reads them but writes nothing. If the section wants the back
   history in the database, that is a separate import path.
