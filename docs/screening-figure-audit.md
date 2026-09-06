# Tracing a movement in the vehicles-screened figure

The cumulative *vehicles screened* figure (work plan output **1.3.12**) is not
stored anywhere. It is added up, every time the report is drawn, out of three
things:

```
opening balance carried in   +   the 2026 workbook import   +   what the app has logged
```

- **Opening balance** — `WORK_PLAN_OPENING_BALANCE["1.3.12"]` in
  `lib/rules/workPlan.ts` (9,832 at handover), *unless* a
  `workPlanBaseline/2026` document exists in Firestore, which replaces the code
  figures wholesale.
- **The workbook import** — 1,484 `dailyEntries` documents seeded from
  `2026_Daily_Summary__All_Inland_Offices.xlsx`, 331,177 vehicles to
  21 Aug 2026. They carry `updatedBy: "seed"` and no `createdAt`. See
  [daily-screening-2026-import.md](daily-screening-2026-import.md).
- **What the app has logged** — one `dailyEntries` count per post per day,
  either typed on Daily Updates or posted from the border scan log. Each one
  records `updatedBy`, `updatedByName` and `createdAt`.

So the figure moves when somebody writes a daily entry, or when somebody saves a
baseline. Nothing else touches it.

## Running the audit

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run audit:screening -- --since 2026-09-03
```

Read-only — it reads `dailyEntries` and `workPlanBaseline` and writes nothing,
so it is safe against the live project at any time.

`--since` is the question "it read X on Tuesday and Y on Wednesday": set it to
Tuesday and the report gives the total before that moment, the total now, and
every figure written in between with the officer and the minute they wrote it.

Other options:

| Option | What it does |
| --- | --- |
| `--post "Ndola"` | Restrict to one inland office |
| `--csv trail.csv` | Write the whole trail to a file (one row per entry) |
| `--limit 40` | Rows per listing |
| `--include-imported` | Also list the workbook's own outsized days |

Beyond the `--since` window it always reports:

- **By post** and **by account** — where the total sits, and who wrote what.
- **Post-days counted more than once** — the same post and day carrying two
  figures. `excess` is what the total is inflated by if the second one was not a
  deliberate correction.
- **Figures far above that post's usual day** — measured against the post's own
  median, because Katete does ~65 a day and Kapiri Mposhi ~386. This is the
  shape a month-to-date total makes when it is typed into a form asking for one
  day.
- **Logged well after the day they report** — legitimate catch-up work, but the
  thing that moves a figure for weeks already signed off.

## The four ways the figure moves

1. **An ordinary day is logged.** Expected; a few hundred per post.
2. **A cumulative total is typed into a daily field.** A coordinator enters
   their month-to-date or year-to-date figure where the form asks for one day.
   Shows up under *figures far above that post's usual day*.
3. **A day is counted twice.** The workbook import already holds every post-day
   to 21 Aug 2026 (Mongu only from July, Ndola only 40 scattered days — those
   two posts have real gaps a coordinator may legitimately fill). A figure
   logged for a day the import already covers adds on top of it. Shows up under
   *post-days counted more than once*.
4. **The baseline is re-saved.** An admin saving the opening balance panel on
   `/weekly` replaces the carried-in figures for every output at once. The
   script prints the saved baseline's `updatedBy`, `updatedAt` and note whenever
   one exists.

## What the audit cannot see

`deleteDailyEntry` is a hard delete: a removed entry leaves nothing behind, so a
total that went **down** cannot be traced this way. Nor can a figure that was
corrected by deleting and re-adding — only the new entry survives. Closing that
gap needs an append-only audit log written on every change; until there is one,
this script works from what the surviving entries remember about themselves.
