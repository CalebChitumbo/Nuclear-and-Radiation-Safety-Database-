# Register import — 2026 Facility Status List

Imported 2026-07-24 from “Facility Licensing Status — Actual Current 2026 Position” (prepared 23 July 2026), replacing the previous seeded register.

## Result

| Metric | Count |
|---|---|
| Facilities | **458** |
| Functional / Non-functional | 399 / 59 |
| Licensed / Unlicensed | 214 / 244 |
| Medical / Non-Medical | 314 / 144 |
| Stalled applications | 25 |
| Flagged for review | 90 |

Doc sections were 383 functional + 82 non-functional rows (the doc's
own heading says 83, but row #18 of that table is absent from the
document). 22 non-functional rows annotated “NOW FUNCTIONAL” were
imported as functional, and duplicate rows were merged, giving the
totals above.

## Stage breakdown

| Stage | Facilities |
|---|---|
| Licensed | 214 |
| No Application Submitted | 131 |
| Waiting for Payment | 57 |
| Import Licence Only (Not yet Use/Possession) | 13 |
| In Final Processing | 12 |
| Authorization Terms Issued | 11 |
| Application Submitted | 8 |
| Accounts Clearance Pending | 6 |
| Under Review and Assessment | 3 |
| Draft Application | 3 |

## Merged duplicate rows

- "Mahatima Gandhi Clinic" (F #241) merged into "Mahatma Gandhi Clinic" (NF #4) — kept status "In Final Processing", functional=Yes
- "Mwami Adventist Hospital" (F #368) merged into "Mwami Adventist Hospital, Chipata" (NF #71) — kept status "Waiting for Payment", functional=Yes
- "St. Josph Chamilalamini Mission Hospital" (NF #46) merged into "St. Joseph Chamilalamini Mission Hospital" (NF #44) — kept status "No Application Submitted", functional=No
- "Progress Medical Centre" (F #128) merged into "Progress Medical Centre Solwezi" (F #129) — kept status "Licensed — 2026 licence", functional=Yes
- "Nganda Bilonda Level 1 Hospital" (F #300) merged into "Ng'anga Bilonda Level 1 Hospital" (F #299) — kept status "No Application Submitted", functional=Yes
- "Livingstone UT Hospital" (F #354) merged into "Livingstone Teaching Hospital (livingstone central)" (F #353) — kept status "Waiting for Payment", functional=Yes
- "Zambia Revenue Authority Katima Mulilo" (F #164) merged into "ZRA Katima Mulilo" (F #173) — kept status "Licensed — 2026 licence", functional=Yes

## Renames / fixes

- Renamed "Livingstone Teaching Hospital (livingstone central)" → "Livingstone Teaching Hospital"
- Renamed "Mwami Adventist Hospital, Chipata" → "Mwami Adventist Hospital"
- Mingomba Mining Limited: district set to Chililabombwe (carried from the register's duplicate "Mingoba Mining Limited" entry)
- Chifubu District Hospital: status cell in the doc had spilled from the facility name; imported as Under Review and Assessment per its detail column, flagged for review.
- Drug Enforcement Commission - Ndola: district reads “Lusaka” in both the doc and the previous register despite the name — kept as-is.

## Old facilities removed (absent from the 2026 list)

- Drug Enforcement Commission - Lusaka (Lusaka, Public, No Application Submitted)
- Africorp Healthcare Systems Ltd (Lusaka, Private, No Application Submitted)
- Asian Medicos Enterprise (Lusaka, Private, No Application Submitted)
- Asthetic Dental Edge (Lusaka, Private, No Application Submitted)
- Const Lab Zambia Limited (Lusaka, Private, No Application Submitted)
- K.G Dental Surgery (Lusaka, Private, No Application Submitted)
- Lusaka Imaging Limited (Lusaka, Private, No Application Submitted)
- Lusaka Mobile Imaging (Lusaka, Private, No Application Submitted)
- Rocinantes Zambia (Lusaka, Private, No Application Submitted)
- Free Slot Former Fly Doc (—, Private, No Application Submitted)
- Hightech Diagnostic Centre (—, Private, No Application Submitted)
- Ivory Dental Clinic RR (Chingola, Private, No Application Submitted)
- Mwami Adventist Hospital (—, Public, Waiting for Payment)
- St. Josph Chamilalamini Mission Hospital (—, Private, No Application Submitted)
- Zambia Revenue Authority Katima Mulilo (—, Public, licensed)
- Drug Enforcement Commission Livingstone Airport (Livingstone, Public, No Application Submitted)
- Mahatima Gandhi Clinic (—, Public, No Application Submitted)
- Livingstone Central Hospital (Livingstone, Public, No Application Submitted)
- Mudachi Medical Solutions (Livingstone, Private, No Application Submitted)
- Chibuluma Mines Plc (Kalulushi, Private, No Application Submitted)
- Mingoba Mining Limited (Chililabombwe, Private, No Application Submitted)
- Nganda Bilonda Level 1 Hospital (Mwansabombwe, Public, No Application Submitted)
- Progress Medical Centre (Solwezi, Private, licensed)

## New facilities with no previous-register match

- K.G.P Dental Surgery (Lusaka) — sector assumed Private
- Zambart (Lusaka) — sector assumed Private
- Mediheal Diagnostic Centre (Lusaka) — sector assumed Private
- Tandem Construction Mining Limited (Lumwana) — sector assumed Private
- Nsangu Investments Limited (Lusaka) — sector assumed Private
- North Way Dental Clinic (Mpika) — sector assumed Private
- Thomson District Hospital (Luanshya) — sector assumed Public

## Possible duplicates kept separate

- "St. Joseph Rural Mini Hospital" vs "St. Joseph Chamilalamini Mission Hospital" (both Nyimba) — kept separate, verify
- "K.G.P Dental Surgery" vs "KG Dental Surgery" (both Lusaka) — kept separate, verify
