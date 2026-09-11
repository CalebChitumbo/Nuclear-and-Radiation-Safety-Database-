# Management's five system changes — September 2026

What Management asked for after the September 2026 review of the reporting
system, in priority order, and what was built for each. Nothing here is stored
that was not stored before: every new figure is derived when a page is read
from the registers the system already holds, so no re-seed and no migration
follows this change.

## 1. Excel export for SharePoint

**Asked for.** NSSS and the inland offices need to export the border-screening
records and totals to Excel for upload to SharePoint. The reporting system
stays the data-entry platform; SharePoint keeps the exported file. Include the
office, the reporting period, the daily totals and the underlying entries.

**Built.** An **Export to Excel for SharePoint** panel on the NSSS dashboard
(`/nsss` — any office or all of them) and on the Border Scan Log (`/border` — a
posted officer's own office, fixed). Pick the period (the selected reporting
week, a month, a quarter, the year, or all time) and, for a week to a quarter,
whether to include the truck scans. The download is a real `.xlsx` workbook:

| Sheet | Holds |
|---|---|
| Summary | Office, reporting period, from/to, vehicles screened, days with a figure, offices reporting, who generated it and when; then one line per office (days · vehicles) and a total |
| Daily totals | One row per day, a column per office, the day's total; a Total row |
| Entries | Every figure behind the totals: date, week, office, vehicles, how it got there (typed on Daily Updates · daily summary workbook · posted from scan log), who logged it, who corrected it, remark, recorded-at, entry id |
| Truck scans | The scan rows for the period, when asked for — plate, direction, cargo, commodity, transporter, dose, result, action, officer |

The figures are the same `dailyEntries` the sectional update sums for output
1.3.12, filtered the same way (`lib/rules/screeningExport.ts`), so the
workbook's total is the report's total for that period.

The workbook is written by a small dependency-free writer
(`lib/rules/xlsx.ts`): the Office Open XML parts a workbook of text and
numbers needs, zipped uncompressed. Excel, SharePoint's preview and openpyxl
all open it; the header row is bold and frozen and the columns are sized.
It is deterministic, so the same records give byte-identical files.

**Verify.** `/nsss` → *Export to Excel for SharePoint* → choose *Month*, tick
the scans, download; open in Excel and check the Summary's *Vehicles screened*
against the NSSS dashboard's month column for 1.3.12. Tests:
`tests/xlsx.test.ts`, `tests/screeningExport.test.ts`.

## 2. Functional-facilities dashboard

**Asked for.** A licensing-status breakdown for functional facilities only.
The existing pipeline covered all 541 facilities; Management wanted the 404
functional ones.

**Built.** A **Functional Facilities** tab (`/functional-facilities`, Register
group, open to Licensing and the Inspectorate). Every figure on it excludes the
non-functional facilities, and the header says how many were left out of what.
The Overview's *Unlicensed pipeline* panel is now titled *whole register* and
links across. Logic in `lib/rules/functionalFacilities.ts`.

**Verify.** The tab's *Functional facilities* KPI should equal the Overview's
*Functional* KPI; its *Licensed* + *Unlicensed* should equal it. Marking a
facility non-functional on its record takes it off this tab at once.

## 3. Public / private licensing breakdown

**Asked for.** Within the functional view, public and private separately, with
licensed · no application submitted · application submitted · awaiting payment
and the other stages — and, in particular, the number and list of private
functional facilities without licences.

**Built.** The tab's main table is *Stage × Public / Private / Functional*, in
Management's eight stages. Each stage folds the RAIS statuses it contains and
names them underneath, each a link into the register filtered to those
facilities (functional, that status). The mapping is one table,
`LICENSING_BUCKETS`, and a test asserts it covers every RAIS stage exactly
once:

| Management's stage | RAIS statuses it folds |
|---|---|
| Licensed | Licensed |
| No application submitted | No Application Submitted |
| Application submitted | Draft Application · Application Submitted |
| Awaiting payment | Invoice Generation Pending · Waiting for Payment · Accounts Clearance Pending |
| Under review and assessment | Waiting for Review and Assessment · Under Review and Assessment · Under Internal Review (Further Information Required) · Inspection in Progress · Application Returned / Rejected |
| Approval and issue in progress | Authorization Terms Issued · CEO Licence Approval Required · Board Licence Approval Required · In Final Processing · Licence / Certificate Issued |
| Licence expiring (renewal due) | Licence Expiring (Renewal Due) |
| Import licence only | Import Licence Only (Not yet Use/Possession) |

Below it, the list: **Private functional facilities without a licence**, with
a *Private, no licence* KPI in the strip. Filter by sector (Private / Public /
Both), by stage (no application / application in progress) and by enforcement
standing; export the list as CSV, or the whole view — breakdown plus both
lists — as an Excel workbook from the header.

## 4. Enforcement status linked to facilities

**Asked for.** Show what enforcement action has been taken against each
unlicensed or non-compliant facility. Closed, suspended or otherwise
restricted facilities should not remain unexplained under "No application
submitted".

**Built.** The inspection register already records the action each inspection
led to (`Inspection.enforcement`, the Inspectorate workbook's nine-value
vocabulary). `lib/rules/enforcementStatus.ts` reads it back per facility — the
latest dated action wins; an undated register row speaks only when nothing
dated does — and grades it:

| Standing | Actions |
|---|---|
| Restricted | Suspension of Practice · Seizure of Device · Suspension of License · Cancellation of License |
| Notice served | Written Warning · Enforcement Notice |
| Engagement only | Engagement at Facility / District / Provincial Level |

It shows in four places:

- **Functional Facilities** — a *No application submitted — why* table
  (restricted · notice · engagement · no action recorded, by sector), each
  row a filter on the list; and an *Enforcement standing* column on every
  listed facility, with the date and how many actions are on record.
- **Facilities register** — a red (enforcement) or amber (engagement) chip on
  the row and the phone card; the CSV export gains *Latest Enforcement Action*
  and *Enforcement Date* columns.
- **Facility record** — an *Enforcement standing* field and a chip in the
  identity strip.
- **Inspectorate tab** — the last action on each due card (below).

A free-text inspection (a facility typed rather than picked) is matched to the
register by name, so a typed log still counts. Nothing is written: record the
action on the Inspectorate tab or the Daily Updates wizard and the standing
moves everywhere at once.

**Verify.** Log an inspection with *Suspension of Practice* against an
unlicensed functional facility; on Functional Facilities it moves from *No
action recorded* to *Restricted*, and its register row shows the chip.

## 5. Inspection-card follow-up

**Asked for.** Confirm that issuing an inspection card starts the 30-day
timer, that expired cards appear in an overdue list, and that the
Inspectorate can record the next enforcement action.

**Confirmed.** All three already held, and were tightened:

- **The timer.** Ticking *Inspection card issued* on the log form, the Daily
  Updates wizard or the request drawer stamps the inspection's date as
  `cardIssued`; expiry is derived as +30 days and the status (Active /
  Expiring Soon inside the last fortnight / Expired) is derived against today,
  never stored. `tests/inspectionDatabase.test.ts` pins the arithmetic,
  including that it does not move with the browser's timezone.
- **The overdue list.** *Inspection cards due* on the Inspectorate tab lists
  every expired card first, most overdue first, then the ones inside their
  last fortnight — now with *Expired N days ago*, the facility's last
  inspection date, the last enforcement action taken (or *No action on
  record*), and a one-line suggestion of the next step.
- **Recording the next action.** Each due card has **Record follow-up →** (or
  **Record next action →** once a notice has already been served): it fills
  the log form with the facility and the suggested type and scrolls to it, so
  the follow-up is one tap plus the outcome and the action taken.
- **Correcting a card.** The inspection editor on Daily Updates now carries
  the card and its issue date, so a card logged without one, or on the wrong
  day, can be fixed — the timer follows the corrected date.

**Verify.** Log an inspection dated more than 30 days ago with the card
ticked; it appears under *Inspection cards due* as Expired with the days
overdue, and *Record follow-up* prefills the form.

## What did not change

- No collection, field or security rule changed. The functional view, the
  enforcement standing and the card list are all read off `facilities` and
  `inspections` as they are.
- The Overview still counts the whole register; the functional view is
  beside it, not instead of it.
- Output 1.3.12 and the screening figures are untouched — the export reads
  them, it never writes.
