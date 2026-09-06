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
3. **Re-balance 1.2.4.** Its opening balance carries the work the register does
   NOT hold, so subtract the newly dated rows in `WORK_PLAN_OPENING_BALANCE
   ["1.2.4"]` and update the pinned assertion in `tests/workPlan.test.ts`.
   Subtract from the quarter each row's **reporting week** starts in, not the
   one its date falls in — that is how the report counts it — and neither the
   reported total nor its quarterly split should move.
4. Note the change in `docs/inspection-register-2026-import.md` under
   **Re-baselines**, and in `docs/inspectorate-work-plan-2026-update.md` and
   `docs/subprogrammes-2026-cumulative-update.md` if 1.2.4 moved.
5. Deploy, then re-seed the live project. **Use `--prune`**: ids are the
   facility + type + which repeat a row is, so a corrected spelling or type
   re-keys that row and the old document would report the same visit twice.
   Only documents the seed itself wrote are ever considered, so an inspection an
   officer logged in the app is never touched.

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run seed -- --prune
   ```

**Watch out:** most of the register's rows have no date, and they are stored
undated on purpose — a placeholder day would file the inspection into a
reporting period at random. They show on the Inspectorate tab under *All time*
and on the province sheets, and are counted by no week, month, year or quarter.
That is also why `validInspection` in `firestore.rules` accepts `date: ""`; the
Log inspection form and the Daily Updates wizard both require one, so only this
import creates them.

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
