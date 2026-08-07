# Authorisation import — standalone licences

Imported 2026-08-07 from the Authority's authorisation extract (82 rows:
importation, variation, transfer, transport and transit licences). These are
the licences a facility holds *alongside* its use/possession licence, and they
were missing from the register entirely — the 2026 Facility Status List only
carried AUTH/USE.* numbers, so the Authorisations tab's "standalone" view was
empty.

The extract lives verbatim in `seed/authorisations.seed.json` (one row per
licence, keeping the source spreadsheet's columns including the empty
date-issued / valid-from / valid-to cells). `applySeedAuthorisations` in
`lib/store/seeding.ts` merges it onto the register at seed time, for both the
Firestore seed script and the mock store.

## Result

| Metric | Count |
|---|---|
| Authorisations recorded | **82** |
| … on facilities already in the register | 62 |
| … on facilities the import had to add | 20 |
| Facilities that gained a FAC code | 30 |
| Register size | 458 → **478** |
| Authorisations on record (all types) | 201 → **283** |

### By licence type

| Type | Count |
|---|---|
| Importation Licence | 64 |
| Variation of Terms and Conditions | 9 |
| Transfer Licence | 6 |
| Transit Licence | 2 |
| Transport Licence | 1 |

Standalone authorisations do not confer licensed status, so no facility's
`licensed` flag or pipeline `stage` was changed by the merge — the licensed /
unlicensed split is still 214 / 264 over the larger register.

## How a licence finds its facility

`resolveHolder` matches on the FAC code first (46 rows), then on an exact
normalised facility name (36 rows). Where a key is ambiguous the row's own
name and province break the tie; anything still ambiguous is reported as
unmatched rather than recorded against a guess. All 82 rows resolve — a
regression shows up as a failure in `tests/seedAuthorisations.test.ts` and as a
`!` warning from `npm run seed`.

Facilities matched by name that carried no FAC code take the code from the
licence they hold (30 of them). The facility's document id is **not** rebuilt
from it — ids are fixed when the status list is mapped, so filling the code in
afterwards cannot fork an existing Firestore document.

## Facilities added by this import (20)

All 20 hold an importation licence but had no use/possession application on
record, so they enter at stage *Import Licence Only (Not yet Use/Possession)*,
unlicensed, and are flagged for review — practice and category are inferred
from what the licence authorises, and district is left blank unless the
facility's own name states it.

| FAC | Facility | Province | From licence |
|---|---|---|---|
| FAC/0012 | Chelston Health Center | Lusaka | RPA/LIC/0265 |
| FAC/0597 | Emerged Railways Properties (PVT) Limited (ERP) | Lusaka | RPA/LIC/0220 |
| FAC/0603 | Max Clinic Limited | Lusaka | RPA/LIC/0224 |
| FAC/0628 | ZNS Chamba Valley HQ Garrison Clinic | Lusaka | RPA/LIC/0498 |
| FAC/0635 | Mikango Camp Hospital | Lusaka | RPA/LIC/0524 |
| FAC/0636 | Chindwin Garrison Camp Hospital | Central | RPA/LIC/0515 |
| FAC/0638 | Sons of Thunder Clinic | Lusaka | RPA/LIC/0395 |
| FAC/0641 | Sparkle Dental Clinic and Wellness Centre | Lusaka | RPA/LIC/0426 |
| FAC/0644 | Hightech Diagnostic Centre | Lusaka | RPA/LIC/0464 |
| FAC/0659 | ZNS CJ Nyirenda | Lusaka | RPA/LIC/0507 |
| FAC/0660 | ZA Arackan | Lusaka | RPA/LIC/0522 |
| FAC/0661 | ZA L85 (Apollo) | Lusaka | RPA/LIC/0523 |
| FAC/0664 | ZAF Lusaka | Lusaka | RPA/LIC/0511 |
| FAC/0668 | ZAF Livingstone | Southern | RPA/LIC/0512 |
| FAC/0671 | ZAF Mt Eugenia | Lusaka | RPA/LIC/0514 |
| FAC/0676 | CJ Nyirenda Training School | Lusaka | RPA/LIC/0533 |
| FAC/0679 | King Salman Bin Abdul-Aziz Specialist Hospital | Lusaka | RPA/LIC/0543 |
| FAC/0686 | Golden Mark Resources | Lusaka | RPA/LIC/0576 |
| FAC/0688 | Tobacco Board of Zambia | Lusaka | RPA/LIC/0585 |
| FAC/0692 | Newcreast Lime Limited | Lusaka | RPA/LIC/0595 |

Near misses that were deliberately **not** merged into an existing row:

- *Chelston Health Center* vs the register's *Chelston Veterinary Clinic* (FAC/0386)
- *Max Clinic Limited* vs *Maxcare Hospital* (FAC/0438)
- *Hightech Diagnostic Centre* vs *Hitech Diagnostics Zambia* (FAC/0507) —
  the old (pre-2026) register held both names separately
- *ZAF Lusaka* vs *ZAF Hospital* (Lusaka, no FAC code) — verify whether these
  are one facility
- *ZNS CJ Nyirenda* (FAC/0659) vs *CJ Nyirenda Training School* (FAC/0676) —
  separate FAC codes in the source, kept separate here

## Discrepancies between the extract and the register

The register stays authoritative on facility attributes; the extract is
authoritative on the licence. Where the two disagree the licence was still
recorded, and the register row was left untouched:

| Row | Extract | Register | Kept |
|---|---|---|---|
| 4 | Occupational Health and Safety Institute, Lusaka | three sites share FAC/0094 | attached to the **Lusaka** site (province tie-break) |
| 9 | NFC Africa Mining Plc | NFCA Mining Plc (FAC/0173) | register name |
| 20 | Sanket Sunsol Imaging Services Limited - Kitwe | Sanket Sunsol Imaging Services Limited (FAC/0384) | register name |
| 26 | Olivine Clinic, **Central** | Olivine Clinic, **Lusaka** | register province |
| 32 | KGP Dental Surgery | KG Dental Surgery (FAC/0623) | register name — note the register also holds a separate *K.G.P Dental Surgery* row with no FAC code; likely the same facility |
| 54 | ZNS Chowoko, **Lusaka** | ZNS Chowoko, **Eastern** | register province |
| 63 | "TOBBACO Board of Zambia" | — | corrected to *Tobacco Board of Zambia* |
| 74 | Ace Pharmacueticals | Ace Pharmaceuticals (FAC/0474) | register name |

*Newcreast Lime Limited* (row 64) is recorded with the extract's spelling — it
was not corrected because the intended name is not obvious.

## Known register defect this import exposed

Three FAC codes are held by more than one register row, and the seed derives a
facility's document id from that code — so those rows collapse onto a single
Firestore document:

- FAC/0094 — Occupational Health and Safety Institute: Solwezi, Kitwe, Lusaka
- FAC/0169 — Konkola Copper Mine PLC / Konkola Mineral Resources Limited
- FAC/0272 — Konkola Copper Mine – Konkola / Konkola Mineral Resources Limited - Konkola

The merge works around it (it resolves holders by row, not by id, so a licence
lands on one site only), but the underlying rows still need an officer to
decide whether to merge them or issue distinct FAC codes.

## Not recorded

Every row in the extract has an empty *Date Issued*, *Valid From* and *Valid
To* cell, so the authorisations are seeded undated. The Authorisations tab
sorts undated entries to the bottom of its log, and licence-year statistics
read use/possession dates only, so nothing is misreported — but these dates are
worth backfilling from RAIS. `Authorisation.validFrom` / `validTo` and the
seed's `from` / `to` columns are already in place for when they are.
