# Working notes for this repo

Next.js + Firestore app for the Radiation Protection Authority of Zambia. The
README is the long-form reference; this file holds the routines that recur.

## Checks before a PR

```bash
npm run typecheck && npm test
```

`npm run test:rules` needs the Firestore emulator and JDK 21+ (the default
Java 17 makes it silently no-op).

## Routine: the Inspectorate hands over a new inspection total

The Inspectorate periodically gives a new **total routine and follow-up
inspections conducted** figure (e.g. 288 → 295 on 4 Sep 2026). That total is
the **opening balance** of work plan output **1.2.4**, and the inspections the
section logs afterwards on Daily Updates / the Inspectorate tab add on top of
it. Nothing is imported — the figure is a constant.

1. Open `lib/rules/workPlan.ts` and find `WORK_PLAN_OPENING_BALANCE["1.2.4"]`
   (four quarters, e.g. `[40, 123, 132, 0]`, summing to the total).
2. Put the difference into the **latest quarter that has work in it** so the
   earlier quarters keep the figures the workbook reported. Update the comment
   above the line with the new total and date.
3. Update the pinned assertion in `tests/workPlan.test.ts` (search for
   `WORK_PLAN_OPENING_BALANCE["1.2.4"]`).
4. Note the change in `docs/inspectorate-work-plan-2026-update.md` under
   **Re-baselines** (date · was · now · quarters), and in
   `docs/subprogrammes-2026-cumulative-update.md` if it mentions 1.2.4.
5. Run the checks above, commit on a `claude/...` branch, open a PR for the
   user to test and merge.

**Watch out:** a saved `workPlanBaseline/{year}` document in Firestore
*replaces* the code constant wholesale. If the report still shows the old
figure after deploy, an officer has saved a baseline — correct 1.2.4 on the
Opening balance panel on `/weekly` instead (or as well).

**Watch out:** 1.2.4 is now part carried, part counted. The 2026 facility
inspection register (below) gave it 42 dated inspections of its own, and the
balance was reduced by exactly those. Never back-import the same inspections as
dated records without taking them off 1.2.4's balance, or they count twice —
and if an officer dates one of the register's 255 undated rows, take one off the
balance's latest quarter with work in it, because the balance is still carrying
that row.

## Routine: the Inspectorate hands over its facility inspection register

The division periodically hands over `inspected facilities.docx` — the *COMPLETE
FACILITY INSPECTION REGISTER*, one row per inspection with province, facility,
type and (where the section still has it) date. A repeated facility name is a
separate visit, never a duplicate to collapse. It **replaces** the previous
import rather than adding to it.

1. Put the document's rows into `seed/inspections-2026.seed.json` verbatim —
   its own province spellings, its own type wordings, its own DD/MM/YYYY dates.
   Everything is normalised in `mapAllSeedInspections`
   (`lib/store/seeding.ts`), so the seed file stays checkable against the
   document. A cell the document leaves blank stays blank; where the section
   fills one in later, put the answer in and say where it came from in `note`.
2. Update the pinned figures in `tests/inspectionSeed.test.ts` (row count,
   imported count, per-type split, dated count and quarters, linked/unlinked).
3. **Move `INSPECTION_REGISTER_HANDOVER`** (`lib/store/seeding.ts`) to the day
   the new register was handed over. It is the date the supersession rule turns
   on — see step 5.
4. **Re-balance 1.2.4.** Its opening balance carries the work the register does
   NOT hold, so subtract the newly dated rows in `WORK_PLAN_OPENING_BALANCE
   ["1.2.4"]` and update the pinned assertion in `tests/workPlan.test.ts`.
   Subtract from the quarter each row's **reporting week** starts in, not the
   one its date falls in — that is how the report counts it — and neither the
   reported total nor its quarterly split should move.
5. Note the change in `docs/inspection-register-2026-import.md` under
   **Re-baselines**, and in `docs/inspectorate-work-plan-2026-update.md` and
   `docs/subprogrammes-2026-cumulative-update.md` if 1.2.4 moved.
6. Deploy, then re-seed the live project. Run it once WITHOUT `--prune` and read
   the two lists it prints, then re-run with the flag:

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run seed -- --prune
   ```

   It prunes two things. **Superseded register rows** — ids are the facility +
   type + which repeat a row is, so a corrected spelling or type re-keys that
   row and the old document would report the same visit twice. And
   **inspections officers typed before the hand-over**, which the register
   accounts for as well; without this 1.2.4 reads high by exactly the overlap
   (it read 309 instead of 295 at the first import). Work logged after the
   hand-over is kept — that is work the register never reached.

**Watch out:** most of the register's rows have no date, and they are stored
undated on purpose — a placeholder day would file the inspection into a
reporting period at random. They show on the Inspectorate tab under *All time*
and on the province sheets, and are counted by no week, month, year or quarter.
That is also why `validInspection` in `firestore.rules` accepts `date: ""`; the
Log inspection form and the Daily Updates wizard both require one, so only this
import creates them.

**Watch out:** pruning the typed inspections takes their enforcement actions
with them, so 1.2.11 moves too — it returned to its carried 193 from 203 at the
first import. That is the same correction (the section reported both figures in
one breath), but say so when it happens, because the register has no enforcement
column and nothing replaces those records row by row.

## Routine: the section supplies a new daily summary workbook

The NSSS section periodically hands over a fresh
`2026 Daily Summary - All Inland Offices.xlsx` — one sheet per inland office, a
row per day, plus a Summary sheet. It is the authoritative source for output
**1.3.12** (screened vehicles), and it replaces the previous import rather than
adding to it.

1. Convert it. This rewrites the seed AND the import doc, and reconciles every
   post against the Summary sheet — a mismatch is reported, never absorbed:

   ```bash
   npm run convert:summary -- <workbook>.xlsx
   ```

2. Update the pinned figures in `tests/screeningSeed.test.ts` (per-post
   `SUMMARY` map, `GRAND_TOTAL`, the entry count, and the status if the total
   has crossed the 350,000 target).
3. **Check `WORK_PLAN_OPENING_BALANCE["1.3.12"]` is still `[0, 0, 0, 0]`.** It
   is zero because the workbook's Summary sheet and its dated rows now agree:
   every vehicle is a dated post-day the log holds. Carry a figure here only if
   a future workbook's headline again exceeds its own rows, and say why.
4. Update the totals in `README.md` and
   `docs/subprogrammes-2026-cumulative-update.md` (1.3.12 row + its section).
5. Deploy, then re-seed the live project. **Use `--prune`**: coordinators will
   have typed figures by hand for days the new book now covers, and those were
   written with random ids, so they sit BESIDE the workbook's rather than under
   them. The seed reports them on every run and deletes them only with the flag:

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run seed -- --prune
   ```

   Figures for days the workbook does not reach (a post that reported after the
   book was cut) are left alone — they are new work, not duplicates.
6. Confirm with `npm run audit:screening`: opening balance 0, the workbook total
   as "imported", and "no post-day holds more than one figure".

## Routine: the posts send their detailed monthly assessment books

Separate from the daily summary: a folder per post of monthly workbooks, one
sheet per day, one row per truck (`INLAND DAILY ASSESSMENTS`, git-ignored —
190MB of workbooks and scanned returns). These are the Border Scan Log's data,
not the reported figure's.

```bash
npm run reconcile:inland
npm run extract:inland
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run import:scans -- --apply
```

These wrap a project-local `.venv` (`npm run py` makes it) because the
workbook importers need `openpyxl` and macOS's own Python has neither it nor
any business being installed into.

- Reconciling first is the point: it says which of the summary's days the detail
  actually evidences, and separates a blank day sheet from a genuine
  disagreement. At the 6 Sep 2026 hand-over, 510 days matched to the truck
  (127,562 vehicles), 287 day sheets were blank, 79 genuinely disagreed, and
  739 days had no workbook at all.
- Only the shared template is read (REG. NUMBER / GOODS OF INTEREST / FOOD /
  OTHER / TRANSPORTER / DOSE, sheets named 1st, 2nd …). Livingstone's early
  plate lists, Chirundu's "ASSESSEMENTS" books and the Monthly Summary/Master
  Data layouts are reported as unread rather than guessed at.
- **Importing scans moves no reported figure** — 1.3.12 counts `dailyEntries`.
  Scans carry `officerUid: "import"`, which the audit log treats as a bulk load
  rather than 146,000 people changing figures.

## Routine: a reporting figure moved and nobody knows why

Usually the screened-vehicles total (output 1.3.12). It is not stored anywhere —
it is opening balance + the workbook import + every `dailyEntries` count, added
up fresh each time the report is drawn. Only two things move it: somebody
writing a daily entry, or an admin re-saving the opening balance on `/weekly`.

1. Officers answer it themselves on the **What changed** panel of `/nsss`
   (the audit log). Point them there first.
2. For "it read X on Tuesday and Y on Wednesday", run the tracer with `--since`
   set to Tuesday — it gives the total before that moment and every figure
   written since, with the officer and the minute:

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json      npm run audit:screening -- --since 2026-09-03
   ```

   It also flags post-days counted twice, figures far above that post's usual
   day, late back-fills, and prints a saved `workPlanBaseline` if there is one.
3. `npm run fix:duplicate-screening` collapses post-days that hold more than one
   figure (dry-run; `--apply` to write).

Watch out: Mongu and Ndola have thin workbook data (Mongu from July only, Ndola
40 scattered days), so a real back-fill from those two posts can legitimately
add thousands. `docs/screening-figure-audit.md` and `docs/audit-log.md` have the
detail.

## Routine: RAIS hands over a fresh "History of a …" pair

The two exports — `History of a Radiation Generator.xlsx` and `History of a
Sealed Source.xlsx` — say which facility each registered item is held by, its
department, RAIS' status for it and the date that status was set. They
**replace** the previous import rather than adding to it.

```bash
npm run convert:holders -- <History_of_a_Radiation_Generator.xlsx> \
  <History_of_a_Sealed_Source.xlsx> --exported-on YYYY-MM-DD
```

1. Read what it prints before committing: the row counts, the status split, the
   provinces, the facilities NOT in `seed/facilities.seed.json` (a worklist, not
   an error) and the register coverage line. It refuses outright if a holding
   names an item `seed/rais-source-inventory.seed.json` does not hold — run
   `scripts/convert-rais-inventory.py` first in that case: the two pairs of
   exports are of the same register, and the register one is the newer.
2. Update the pinned figures in `tests/sourceHolders.test.ts` under **the 2026
   holdings export** (holdings, generators/sources, items with no holder,
   facilities and how many are off-register, the top provinces and statuses,
   and the size of the location index).
3. Update the counts in `README.md` (the *Who holds each item* section and the
   Source Inventory KPI/gaps bullets).

**Watch out:** district and province are NOT in these exports. The seed carries
an index of them for the facilities the exports name, taken from
`seed/facilities.seed.json` at conversion time — so **re-run the converter after
the facilities register changes**, or the tab shows a facility in the district
it used to be in. The test that compares the index against the register is what
catches it.

**Watch out:** nothing here corrects the register. The exports carry a type and
a nuclide of their own and they disagree with the register export in places;
the converter reads neither. An item's type is `rais-source-inventory.seed.json`'s
to say.

## Routine: the source inventory's equipment categories

Both inventory tabs — Source Inventory (RAIS) and Verified Source Inventory
(the field annex) — report against **one list**, `SOURCE_CATEGORIES` in
`lib/rules/sourceCategories.ts`, folded from each register's free-form text by
`sourceCategory`. The split follows the Seniors' Monday Briefing of Sep 2026;
`docs/source-inventory-categories-2026.md` holds the memo, the mapping and the
counts.

1. Edit the list and the classifier in `lib/rules/sourceCategories.ts`. **Order
   is the logic** — nearly every entry contains a generic X-ray word, so each
   specific machine must be tested before the generic test that would also
   match it.
2. Update `tests/sourceCategories.test.ts` (the pinned list, a case per split),
   then the pinned per-category counts in `tests/raisInventory.test.ts` and
   `tests/verifiedInventory.test.ts`.
3. Update the tables in `docs/source-inventory-categories-2026.md` and the
   Source Inventory section of the README.

**Watch out:** nothing is stored per category — every figure is derived when the
page is read — so a category change needs no re-seed and no migration, and the
`inventoryEdits` overlay is untouched by it.

**Watch out:** this is the *equipment* category (`SOURCE_CATEGORIES`), not the
IAEA source category 1–5. That second one is **deliberately not reported** on
the Source Inventory tab as of Sep 2026 — RAIS derives it from the declared
activity and too many activities are inaccurate — but it is still stored,
summarised and tested. Do not "fix" the missing panel; see *The IAEA source
category — withheld for now* in the README before putting it back.

**Watch out:** RAIS types all 64 XRF analysers as the bare word `XRF`, so the
portable/fixed split comes from a RAN-keyed determination table,
`XRF_FORM_BY_RAN` in `lib/rules/xrfDeterminations.ts` — never from an edit to
the seed, which stays checkable against the export. `generatorFamilyOf` consults
it only for a record whose own text still says nothing but `XRF`, so a
correction or a later export wins over it; if an export names the model for a
row the table covers, drop that row. The 23 it cannot read, and the 109 with no
type at all, are worklists counted on the register-gaps panel.

## Routine: the Summary sheet's enforcement columns

The Inspectorate tab's Summary (`components/inspectorate/InspectionSummaryTable.tsx`,
data from `lib/rules/inspectionDatabase.ts`) bands **Management's six
enforcement actions** after the inspection columns:

Written Notice · Suspension of Practice · Seizure of Device · Enforcement
Notice · Suspension of License · Cancellation of License

- The columns live in `ENFORCEMENT_COLUMNS`; the summary's *Total Enforcements*
  counts those keys only (`isSummarisedEnforcement`). The CSV export, the
  weekly report panel and the 1.2.11 breakdown all read the same array, so a
  column change is made once there.
- The stored vocabulary (`ENFORCEMENT_ACTIONS`) is the workbook's — "Written
  Warning" is *stored* and shown as "Written Notice" on the summary; the
  spelling is "License" (workbook), not "Licence". Do not rename stored values;
  existing `inspections.enforcement` records would stop counting.
- The three **engagement** actions are still recordable and appear on the
  province sheet (amber chip), but are not summary columns and do not count
  toward *Total Enforcements*. Output 1.2.11 still counts them, shown as one
  "Engagements" line in its split.
- To change the format again: edit `ENFORCEMENT_COLUMNS`, then update
  `tests/inspectionDatabase.test.ts` (columns + band), `tests/workPlan.test.ts`
  (1.2.11 split labels) and the README's Summary-sheet table.
