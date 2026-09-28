# The 2026 enforcement list

On **28 Sep 2026** the Inspectorate & Enforcement Division handed over its
**ENFORCEMENT LIST** (`Enforcement_List.docx`): the facilities on which
enforcement has been carried out, 116 numbered rows of *Facility / Entity* and,
for 33 of them, an *Enforcement Date*. It is in
[`seed/enforcement-2026.seed.json`](../seed/enforcement-2026.seed.json), row for
row, with the document's own spellings and dates.

## What was decided

The document names the facility but not the action. The section's instructions
(28 Sep 2026):

- **Every row is a Written Notice.** Stored as the workbook's "Written Warning"
  (`ENFORCEMENT_LIST_ACTION`), which the summary heads *Written Notice*, so all
  116 count in the Inspectorate summary's *Total Enforcements*. An officer can
  change any one of them on the Inspectorate tab (*Edit* on the row); a row of
  the seed can also carry its own `action`.
- **The list is inside the 193** enforcement actions the section reported for
  output 1.2.11. It is not added on top — see *Output 1.2.11* below.

## How it is laid on the register

The list follows the inspection register's own order for most of its length —
its rows 22–113 are the register's rows 1–55 and 168–205 (less 188, Chivuna
Mission Hospital, which the list skips). An enforcement is what an inspection
*led to*, so where the list names a register inspection the action is recorded
**on that inspection** (`register` in the seed), the way the log form records
one. The visit is not counted twice, and the action takes the inspection's date.

| | Rows |
|---|---|
| Action recorded on the register inspection it came out of | **99** |
| — of which the register dates the inspection | 37 |
| Action on a facility the register has no inspection for, recorded on its own | **17** |
| **Total** | **116** |

The 17 are stored as `Enforcement Action` records (`enf2026-…` ids): counted by
1.2.11, never by 1.2.4, and undated because the list gives them no date. Three
name a facility the register does not hold — **SES**, **Shachitari
construction** and **Zongmai** — and are kept by name; an officer can attach
them. Two were matched by hand where the spelling is too loose for the matcher
(`facility` in the seed): *Pearl of Health bwijimfumu* → Pearl of Health
Hospital Bwinjimfumu, *Our Lady Hospice* → Our Ladys Hospice.

Where the list's spelling differs from the register row it names, the seed's
`note` says which row it is (e.g. *Aspalt Roads* → register row 270, "Asphalt
Roads"; *Lifescан diagnostic*, typed with a Cyrillic "а", → row 17).

### Where the list and the register disagree

- **Rows 97–99** (Nyimba District, Minga Mission, Kalindawalo General) are dated
  **01/07/2026** on the list; the register dates those inspections
  **05/08/2026**, and so does the round they belong to (Eastern, 5–11 Aug). The
  list's date column looks shifted by a few rows here. The action is recorded on
  the register's inspection, so it counts in the week of 3 Aug.
- **Rows 77–80** (Chikankata, Victoria Mazabuka, Mazabuka General, Monze
  Mission) have no date on the list; the register dates them 24/06/2026, and
  that is the date they count under.
- An **unnumbered last row, "Levy Mwanawansa"**, is not imported: the list
  already has Levy Mwanawasa Hospital (row 22) and Levy Mwanawasa (row 32), and a
  row with no number reads as a stray. If it is a third action, add it to the
  seed with its own number.
- Repeated names are separate actions, as on the register: *Pearl of health
  Avondale* twice (rows 8, 9), and *Sunshine Dental* / *Makeni Islamic* in the
  list's first block as well as on the register (rows 43, 44).

## Output 1.2.11

1.2.11 is now part carried, part counted — the way 1.2.4 is. The 37 actions on
dated register inspections are counted off the register, so the opening balance
sheds them, quarter for quarter as the report attributes them (a week counts to
the quarter it starts in):

| | Q1 | Q2 | Q3 | Q4 | Total |
|---|---|---|---|---|---|
| Section's reported figure | 45 | 61 | 87 | — | **193** |
| Counted off the register (list) | — | 20 | 17 | — | 37 |
| Carried (`WORK_PLAN_OPENING_BALANCE["1.2.11"]`) | 45 | 41 | 70 | — | 156 |

The report still reads **193**, split 45 / 61 / 87. The list's 79 undated
actions stay inside the carried figure — nothing can say which quarter they
belong to. Actions logged from now on add on top, as they already did.

On the Inspectorate tab the list shows on the **Enforcement actions** panel: the
37 dated ones under the year, all 116 under *All time* (the panel says how many
undated ones a shorter period leaves out), and on each province's sheet and
summary row.

## Keeping officers' corrections

The seed writes each register inspection whole. Officers can now put a card or
change an action on any of them from the Inspectorate tab (undated rows
included), so a re-seed **merges** a register document an officer has worked on
(`mergeSeededInspection`): the register keeps the facility link, its province,
district and practice; the officer's day, type, outcome, notes, enforcement
action and inspection card stand. Each merge is printed.

## Re-seeding

The list rides on the inspection register — `--only inspections` writes the
register with the list laid on it, and nothing else:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run seed -- --only inspections
```

It prints how many actions went on register inspections and how many were
recorded on their own, any row it could not apply, and every officer-corrected
inspection it merged. It never prunes, so run it without `--prune`.

**If the inspection register is re-imported**, check the `register` numbers in
the enforcement seed still point at the same visits —
`tests/enforcementList.test.ts` fails when a referenced row no longer names the
same facility.

| Date | Was | Now | Note |
|---|---|---|---|
| 2026-09-28 | 193 carried (45 / 61 / 87) | 156 carried (45 / 41 / 70) + 37 counted | First import of the enforcement list. Reported figure unchanged at **193**. |
