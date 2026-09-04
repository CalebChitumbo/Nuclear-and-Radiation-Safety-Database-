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
Opening balance panel on `/weekly` instead (or as well). Never back-import the
same inspections as dated records without zeroing 1.2.4's balance, or they
count twice.

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
