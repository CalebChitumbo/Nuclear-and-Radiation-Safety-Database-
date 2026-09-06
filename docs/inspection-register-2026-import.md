# Inspection register import — 2026 Inspectorate hand-over

Imported 2026-09-07 from **`inspected facilities.docx`**, the Inspectorate &
Enforcement Division's *COMPLETE FACILITY INSPECTION REGISTER* — one row per
inspection, with the province, the facility, the type of inspection and, where
the section still had it, the date.

The register is held verbatim in `seed/inspections-2026.seed.json` (the
document's own province spellings, type wordings and DD/MM/YYYY dates) and
turned into inspections by `mapAllSeedInspections` in `lib/store/seeding.ts`, so
the seed file stays checkable line-for-line against the document. `npm run seed`
writes them to the `inspections` collection, which is what the Inspectorate tab,
its province sheets and Summary, the weekly report and work plan output **1.2.4**
all read. Officers log new inspections on top of them in the ordinary way.

Duplicate facility names in the document are deliberate — the section's own note
says a repeated name is a separate visit on another occasion — so the import
keeps every one of them.

## Result

| | Count |
|---|---|
| Rows in the document | **298** |
| Imported as inspections | **297** |
| Held back (no type of inspection) | **1** |
| Matched to a facility on the register | **185** |
| Carried by name and province only | **112** |
| Rows the document dates | **42** |

The document's own heading says "307 facility records"; its table holds 298
rows. The count is the section's, reported here rather than reconciled away.

### By province and type

| Province | Pre-Auth | Routine | Follow-up | Investigative | Total | Dated |
|---|---|---|---|---|---|---|
| Lusaka | 25 | 51 | 5 | 3 | 84 | 1 |
| Copperbelt | 14 | 43 | 1 | 0 | 58 | 0 |
| North-Western | 2 | 24 | 0 | 0 | 26 | 0 |
| Central | 8 | 5 | 0 | 0 | 13 | 3 |
| Northern | 0 | 11 | 0 | 0 | 11 | 0 |
| Luapula | 0 | 11 | 0 | 0 | 11 | 0 |
| Eastern | 0 | 20 | 12 | 0 | 32 | 17 |
| Western | 8 | 11 | 1 | 0 | 20 | 0 |
| Southern | 2 | 21 | 0 | 0 | 23 | 21 |
| Muchinga | 0 | 9 | 0 | 0 | 9 | 0 |
| _(none recorded)_ | 5 | 5 | 0 | 0 | 10 | 0 |
| **All** | **64** | **211** | **19** | **3** | **297** | **42** |

Ten rows leave the PROVINCE cell blank. They are imported under their own name
with no province, and land on the Inspectorate tab's **Unassigned** sheet until
an officer attaches them to a facility.

### The rows the document dates

| Month | Inspections |
|---|---|
| June 2026 | 18 |
| July 2026 | 4 |
| August 2026 | 17 |
| September 2026 | 3 |

Southern (21 of 23 rows), Eastern (17 of 32) and the three Central rows of
2–3 September carry dates; the rest of the register does not.

## What the import does not do

**It invents no dates.** 255 of the 297 rows are stored with an empty `date` and
`week`. They appear on the Inspectorate tab under **All time**, on the province
sheets and in the Summary, and they are counted by no reporting week, month,
year or quarter — because nothing can say which one they belong to. Giving them
a placeholder day would have filed 255 inspections into a period at random.

This is why `firestore.rules` now accepts an inspection whose `date` is `""`. A
dated one must still be a real ISO date and must still name its reporting week;
the Log inspection form and the Daily Updates wizard both require a date, so the
app never creates an undated inspection — only this import holds them.

**It records no outcome.** The document has no outcome column, so every row is
stored as **N/A** rather than assumed compliant.

**It records no enforcement action.** The document has no enforcement column
either, so output **1.2.11** still carries its whole figure as an opening
balance and no inspection here counts toward it.

**It links a facility only when the province agrees.** A row is attached to a
register facility at `classifyMatch`'s own "auto" bar, searching only facilities
in the province the row names. The register holds a Hilltop Hospital in Lusaka,
Solwezi and Kasama; on name alone all three register rows would have gone to
whichever scored highest, and an inspection written into the wrong facility's
history is not something a later import corrects. With the province, each goes
to its own. Where no facility clears the bar the row still reports under its own
name and province — only the link is missing, and an officer can attach it.

## Output 1.2.4 — carried and counted

Work plan output 1.2.4 counts inspections off the register. Its opening balance
carries the work the register does **not** hold, so importing rows that carry
their own date means the balance has to shed exactly those rows, or they are
reported twice.

| | Q1 | Q2 | Q3 | Q4 | Total |
|---|---|---|---|---|---|
| Balance before this import | 40 | 123 | 132 | 0 | **295** |
| Rows the register now dates | 0 | 21 | 21 | 0 | **42** |
| Balance after this import | 40 | 102 | 111 | 0 | **253** |

253 carried + 42 counted = **295**, the figure the section re-baselined to on
4 September 2026, split the way the section's own workbook split it. Neither the
total nor the quarters move; what changes is that 42 of the figure is now
evidenced row by row. The register's other 255 rows stay inside the carried
figure, because they belong to no quarter.

The subtraction is 21 / 21, not the 18 / 24 the calendar gives, because the
report attributes a record to the quarter its **reporting week** starts in. The
three inspections of 1 July 2026 fall in W27, the week of 29 June, and count to
Q2. Shed by the calendar instead and the total would still be 295, but Q2 and Q3
would each move by three against the section's workbook.

**Watch out.** If an officer later fills in the date on one of those 255 rows,
that row starts counting and 1.2.4 goes up by one without any new work having
happened — the balance is still carrying it. Take one off the balance's latest
quarter with work in it whenever a register row is dated after the fact. The
`--since` tracer for the screening figure has no equivalent here; the
**What changed** panel of the audit log is where a moved figure is explained.

A saved `workPlanBaseline/{year}` document in Firestore **replaces** the code
constant wholesale. If 1.2.4 still reads 337 (295 + 42) after this is deployed,
an officer has saved a baseline — correct 1.2.4 on the Opening balance panel on
`/weekly` to the same [40, 102, 111, 0].

## The inspections the section had already typed

The register is not the section's first record of its year. Officers had been
logging inspections on `/inspectorate` for months before it arrived — 15 of them
on the live project, dated 28 March to 11 August 2026 — and the register
accounts for that work as well. Counted alongside it, the same visit is reported
twice: at the first seeding 1.2.4 read **309** rather than 295, over by exactly
the 14 inspection visits among those 15 records.

Eleven of the fifteen are plainly the same visit as a register row, several by
an exact name match (Mambilima, Mansa General, Senama, Mbereshi, St. Pauls,
Kawambwa, Zambezi, Chama District Hospital) and the rest under a different
spelling ("Makeni Islamic Society Clinic" for the register's "Makeni Islami
hospital", "Ng'anga Bilonda" for "Nganda Bilonda"). The other four — Mansa
Airport, China Civil Engineering Construction Corp, Nchelenge District Hospital,
Mobrin Solutions Limited — appear nowhere in the document, and are inside the
section's 295 all the same: the register's 298 rows never did add up to the
307 records its own heading claims.

So the rule is the date, not the name:

> An inspection **typed in the app** and dated **on or before the hand-over** is
> work the register carries. An inspection dated after it is work the register
> never reached, and is kept. An undated one predates nothing we can be sure of,
> and is kept.

Matching record to row by name would only be a guess, and would have missed
those four. `supersededByRegister` in `lib/store/seeding.ts` is the rule;
`npm run seed` reports what it finds on every run and deletes it with `--prune`,
exactly as the screening seed treats a post-day the workbook has since covered.

**This takes output 1.2.11 with it.** Those records carry the only ten
enforcement actions in the project, so pruning them returns 1.2.11 to its
carried 193 from 203. That is the same correction, not a loss: the section
reported 193 enforcement actions in the same breath as the 295 inspections, and
these ten written warnings are March and April work sitting inside it. The
register has no enforcement column, so nothing replaces them row by row — if the
193 turns out **not** to include them, the ten need re-entering after the prune,
or 1.2.11's balance dropping to 183.

## Left for the section

**One row has no type of inspection** and is held back rather than guessed at:

| Row | Province | Facility |
|---|---|---|
| 245 | Copperbelt | Ndola Cancer Disease Hospital |

The document leaves five other Type of Inspection cells blank; the section
supplied those on 7 September 2026 (Levy Mwanawasa and both Cancer Diseases
Hospital rows pre-authorisation, Medcorp Hospital Ndola and Michael Chilufya
Sata Dental School routine), and they carry that provenance in the seed file's
`note` and in the inspection's own notes. Add the type to the row in
`seed/inspections-2026.seed.json` and re-seed when the section says what this
one was.

**56 rows name a facility the register probably holds** under a different
spelling, but not closely enough to attach automatically. They are imported by
name; attaching them is an officer's call:

| Register row | Province | Probable facility | Score |
|---|---|---|---|
| Levy Mwanawasa Hospital | Lusaka | Levy Mwanawasa University Teaching Hospital | 0.64 |
| Elite Dental clinic | Lusaka | Elite Dental Care Limited | 0.68 |
| Reliance dental clinic | Lusaka | Reliance Dental Services Ltd | 0.68 |
| Chipata Level 1 | Lusaka | Chipata First Level Hospital | 0.47 |
| Lifescаn diagnostic | Lusaka | Life Scan Diagnostics Limited | 0.65 |
| Care for You – Closed | Lusaka | Care for You Medical Clinic | 0.59 |
| Zambia Breweries | Copperbelt | Zambian Breweries Plc Ndola | 0.55 |
| Kakoso Level 1 | Copperbelt | Chamboli Level 1 Hospital | 0.47 |
| African Medical Care | Copperbelt | African Medicare Services Limited | 0.55 |
| Kansashi mine hospital | North-Western | Kansanshi Mine Hospital | 0.71 |
| Katondo Mission Hospital | — | Katondwe Mission Hospital | 0.66 |
| Progress Medical Center Kitwe | Copperbelt | Progress Medical Centre | 0.63 |
| Northway Dental | — | North Way Dental Clinic | 0.64 |
| Mina Soko Medical Centre | Lusaka | Ameer Medical Centre | 0.50 |
| ZAF MT Euginia | — | ZAF Mt Eugenia | 0.56 |
| Occupational Health Solwezi | North-Western | Occupational Health and Safety Institute (Solwezi) | 0.59 |
| Tiina Medical Center | — | Bernaka Medical Center | 0.56 |
| Isoka District Hosptal | Muchinga | Isoka District Hospital | 0.69 |
| Micheal Chilufya Sata Hospita | — | Michael Chilufya Sata Hospital | 0.65 |
| Micheal Chilufya Sata Dental Clinic | — | Michael Chilufya Sata Dental Clinic | 0.70 |
| Chilenje Hospital | Lusaka | Chilenje First Level Hospital | 0.51 |
| Biet Cure Chirldrens Hospital | Lusaka | Beit Cure Children's Hospital | 0.61 |
| Lewanika Central Hospital | Western | Lewanika General Hospital | 0.57 |
| Mwandi District Hospital | Western | Mwandi Mission Hospital | 0.68 |
| Kaleni Mission Hospital | Northern | St. Fidelis Mission Hospital | 0.51 |
| Solwezi Genral Hospital | North-Western | Solwezi General Hospital | 0.70 |
| CHIKANKATA MISSION HOSPITAL | Southern | Chikuni Mission Hospital | 0.56 |
| MAHATMA GHANDI CLINIC | Southern | Mahatma Gandhi Clinic | 0.56 |
| LIVINGSTONE UNIVERSITY TEACHIING HOSPITAL | Southern | Livingstone Teaching Hospital | 0.57 |
| HARRY MWAAGA NKUMBULA INTERNATIONA AIRPORT | Southern | Harry Mwaanga Nkumbula International Airport | 0.70 |
| MACHA MISSION HOSITAL | Southern | Macha Mission Hospital | 0.69 |
| CHIVUNA MISSION HOSPITAL | Southern | Macha Mission Hospital | 0.59 |
| KOMOTO MISSION HOSPITAL MAMBWE | Eastern | Kamoto Mission Hospital | 0.62 |
| CHAMA DISTRICT HOSPITAL | Eastern | Chadiza District Hospital | 0.66 |
| Mungwi rural health clinic | Northern | Mungwi Baptist Rural Health Centre | 0.50 |
| Senga hill district hospital | Northern | Senga District Hospital | 0.65 |
| St fedelis mission hospital | Northern | St. Fidelis Mission Hospital | 0.69 |
| Bernaka hospital | — | Bernaka Medical Center | 0.53 |
| Lumwana Mine | North-Western | Lumwana Mining Company Limited | 0.64 |
| Kansashi Mine | North-Western | Kansanshi Mining Plc | 0.51 |
| Micheal Chilufya Sata Dental School | — | Michael Chilufya Sata Dental Clinic | 0.55 |
| Beit CURE International Hospital | Lusaka | International Hospital Of Zambia | 0.56 |
| Luampa Mini Hospital | Western | Luampa Mission Hospital | 0.55 |
| Well Spring Specialist Hospital | Lusaka | Wellspring Speciality Hospital | 0.68 |
| Katondwe Mission Hospital | Eastern | Nyanje Mission Hospital | 0.56 |
| Friends Care Hospital | Lusaka | Friends Care Medical Centre | 0.59 |
| WRC Construction | Lusaka | Unik Construction | 0.59 |
| Care You Medical Centre | Lusaka | Friends Care Medical Centre | 0.52 |
| Lilayi Clinic | Lusaka | Lilayi Family Clinic | 0.57 |
| Mums Care Woodlands | Lusaka | Mum's Care Clinic Woodlands | 0.58 |
| University Teaching Adult Hospital | Lusaka | University Teaching Hospital - Radiology | 0.57 |
| University Teaching Children Hospital | Lusaka | University Teaching Hospitals Children's Hospital | 0.67 |
| University of Lusaka Hospital | Lusaka | Lusaka Trust Hospital | 0.59 |
| Sanket Diagnostics Lusaka | Lusaka | Sanket Diagnostics Zambia Limited | 0.57 |
| Cancer disease hospital | Lusaka | Cancer Diseases Hospital | 0.70 |
| Itezhi -tezhi district hospital | Central | Mkushi District Hospital | 0.62 |

Some of these are plainly the same facility typed differently ("Isoka District
Hosptal", "Solwezi Genral Hospital", "MACHA MISSION HOSITAL", "St fedelis
mission hospital"). Others are plainly not ("CHIKANKATA MISSION HOSPITAL" is not
Chikuni; "CHAMA DISTRICT HOSPITAL" is not Chadiza; "Itezhi -tezhi district
hospital" is not Mkushi) — which is why none of them was attached automatically.

## Re-baselines

| Date | Was | Now | Note |
|---|---|---|---|
| 2026-09-07 | — | 297 inspections | First import of the 2026 facility inspection register. 1.2.4's opening balance shed the 42 dated rows (Q2 −21, Q3 −21, as the report attributes them); the reported figure stays 295, split 40 / 123 / 132. |
| 2026-09-07 | 309 | **295** | The 15 inspections officers had typed before the hand-over were pruned as work the register carries. No balance moved — the figure was over by exactly those records. 1.2.11 returned from 203 to its carried 193 with them. |

## Re-importing

The section hands the register over as a whole document, so a later one replaces
this import rather than adding to it. Document ids are the facility, the type
and which repeat the row is — **not** the row number, so a row inserted in the
middle of the next document does not re-key every row below it.

A corrected spelling or a corrected type does re-key its own row, and the old
document would then report the same visit twice. `npm run seed` reports those on
every run and deletes them with `--prune`:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run seed -- --prune
```

The same run reports the typed inspections the register supersedes (above).
Both lists print on every run whether or not `--prune` is given, so a plain
`npm run seed` is the dry run — read the list, then re-run with the flag.

**Move `INSPECTION_REGISTER_HANDOVER` when a new register arrives.** It is the
date the supersession rule turns on, so leaving it behind would keep every
inspection the section logged since the last hand-over, and re-importing would
count them twice.

The figures pinned in `tests/inspectionSeed.test.ts` are this document's own —
update them with the register.
