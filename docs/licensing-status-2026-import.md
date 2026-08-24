# Register import — 2026 Licensing Status workbook

Imported 2026-08-22 from `Licensing_Status2.xlsx` (the Authorisation & Standards licensing status workbook), replacing the register the previous import left behind. Regenerate with:

```
python3 scripts/convert-licensing-status-xlsx.py <Licensing_Status.xlsx>
```

## Result

| Metric | Count |
|---|---|
| Facilities | **538** |
| — from the workbook / carried over | 511 / 27 |
| Licensed / Unlicensed | 220 / 318 |
| Functional / Non-functional | 401 / 137 |
| Medical / Non-Medical | 350 / 188 |
| Licences recorded | **361** |
| — from the workbook / carried over | 357 / 4 |
| First-time licensees | 4 |
| Stalled applications | 23 |
| Flagged for review | 160 |

## Licences issued — reconciled against the workbook's Totals sheet

| Licence type | Workbook total | Imported |
|---|---|---|
| Decommissioning Licence | 5 | 5 |
| Export Licence | 3 | 3 |
| Importation Licence | 82 | 82 |
| Transfer Licence | 7 | 7 |
| Transit Licence | 3 | 3 |
| Transport Licence | 1 | 1 |
| Use/Possession | 238 | 238 |
| Variation of Terms and Conditions | 18 | 18 |

A further **4** licence(s) sit on the carried-over facilities below — they come from the previous register, not from this workbook, so they are outside its totals.

Per licence type as stored on the register:

| Licence type | Count |
|---|---|
| Renewal of Use/Possession Licence | 230 |
| Importation Licence | 82 |
| Variation of Terms and Conditions | 18 |
| New Use/Possession Licence | 12 |
| Transfer Licence | 7 |
| Decommissioning Licence | 5 |
| Export Licence | 3 |
| Transit Licence | 3 |
| Transport Licence | 1 |

By quarter of issue:

| Quarter | Licences |
|---|---|
| 2026-Q1 | 196 |
| 2026-Q2 | 142 |
| 2026-Q3 | 19 |
| carried over | 4 |

## Stage breakdown

| Stage | Facilities |
|---|---|
| Licensed | 220 |
| No Application Submitted | 213 |
| Waiting for Payment | 52 |
| Import Licence Only (Not yet Use/Possession) | 12 |
| Authorization Terms Issued | 9 |
| Licence Expiring (Renewal Due) | 8 |
| In Final Processing | 8 |
| Accounts Clearance Pending | 6 |
| Application Submitted | 5 |
| Draft Application | 3 |
| Under Review and Assessment | 2 |

## Was licensed, no current licence in the workbook (1)

Imported as unlicensed at stage *Licence Expiring (Renewal Due)* and flagged for review.

- Kapiri Mposhi District Hospital (FAC/0047)

## Newly licensed (9)

Unlicensed in the previous register, licensed in the workbook.

- Express Diagnostic Services (FAC/0302) — was *Licence Expiring (Renewal Due)*
- Medcross Hospital (FAC/0072) — was *Licence Expiring (Renewal Due)*
- Parrogate Ginneries Limited (FAC/0261) — was *In Final Processing*
- St. Johns Medical Centre Ltd Lusaka (FAC/0240) — was *Licence Expiring (Renewal Due)*
- St. Johns Medical Centre Solwezi (FAC/0332) — was *Licence Expiring (Renewal Due)*
- TMS Medical Services (FAC/0357) — was *Licence Expiring (Renewal Due)*
- Tinna Medical Centre (FAC/0627) — was *Under Review and Assessment*
- UNILABS – Solwezi (FAC/0549) — was *Licence Expiring (Renewal Due)*
- Zambia Flying Doctor Services (FAC/0451) — was *Waiting for Payment*

## Curated matches (10)

Renames, branch spellings and previous-register duplicates.

- Chifubu District Hospital → CHIFUBU LEVEL 1 HOSPITAL (FAC/0573)
- Michael Chilufya Sata Dental Clinic → MICHEAL CHILUFYA SATA SCHOOL OF MEDICINE, DENTAL CLINIC, COPPERBELT UNIVERSITY (FAC/0327)
- Mum's Care Clinic Bwinjimfumu → MUM'S CARE CLINIC (FAC/0088)
- Munyumbwe First Level Hospital → MUNYUMBWE LEVEL ONE HOSPITAL (FAC/0587)
- Occupational Health and Safety Institute (Solwezi) → OCCUPATIONAL HEALTH AND SAFETY INSITUTE Occupational Health and Safety Institute - Solwezi (FAC/0430)
- Occupational Health and Safety Institute Kitwe → OCCUPATIONAL HEALTH AND SAFETY INSTITUTE (FAC/0094)
- Occupational Health and Safety Institute Lusaka → OCCUPATIONAL HEALTH AND SAFETY INSTITUTE LUSAKA (FAC/0437)
- Sarovar Hotel → NEELKANTH SAROVAR PREMIERE (FAC/0415)
- Yuka Mission Hospital → Yuka Adventist Mission Hospital (FAC/0120)
- Zhongding Jv Wah Kong Co Ltd (Cerium) → CERIUM ZAMBIA LIMITED (FAC/0541)

## Carried over — not in the workbook (27)

The workbook's register sheet has no row for these, but they are kept on the register with their previous status and flagged for review. CIDRZ - Ibex Campus, K.G.P Dental Surgery do appear on its licence sheets, which is why they are kept rather than removed.

- CIDRZ - Ibex Campus (no RAN, Lusaka, Private, licensed)
- K.G.P Dental Surgery (no RAN, Lusaka, Private, licensed)
- Kenneth Kaunda International Airport (no RAN, Lusaka, Public, licensed)
- KG Dental Surgery (FAC/0623, Lusaka, Private, licensed)
- Build Trust Construction Limited (no RAN, Lusaka, Private, No Application Submitted)
- Buildcon Investments Limited (no RAN, Ndola, Private, No Application Submitted)
- China Habour Engineering Company Ltd (no RAN, Lusaka, Private, No Application Submitted)
- Healing Touch Clinic (no RAN, Lusaka, Private, Import Licence Only (Not yet Use/Possession))
- Kagem Mining Limited (no RAN, Lufwanyama, Private, No Application Submitted)
- Kitwe Training School (no RAN, —, Public, No Application Submitted)
- Luampa Mission Hospital (FAC/0600, Kaoma, Private, No Application Submitted)
- Matero General Hospital (FAC/0560, —, Public, No Application Submitted)
- Mumana Mineral Resources Limited (FAC/0542, Lusaka, Private, No Application Submitted)
- Mungwi Baptist Rural Health Centre (no RAN, Mungwi, Private, No Application Submitted)
- Mvuu Resources Limited (no RAN, Solwezi, Private, No Application Submitted)
- Premium Health Medical Centre (no RAN, Luanshya, Private, No Application Submitted)
- Proctor Engineering Limited (no RAN, Lusaka, Private, No Application Submitted)
- Redachem Zambia (no RAN, Kitwe, Private, No Application Submitted)
- Roads and Pavings Zambia Ltd (no RAN, Lusaka, Private, No Application Submitted)
- St. Fidelis Mission Hospital (FAC/0561, Kasama, Public, Waiting for Payment)
- St. Joseph Rural Mini Hospital (no RAN, Nyimba, Private, No Application Submitted)
- Tropical Diseases Research Centre (no RAN, —, Public, No Application Submitted)
- University of Zambia Ridgeway Campus (FAC/0469, Lusaka, Public, No Application Submitted)
- Vubwi District Hospital (no RAN, Mambwe, Public, No Application Submitted)
- ZALAWI Haulage Ltd (no RAN, —, Public, No Application Submitted)
- Zambia Airports (no RAN, Lusaka, Public, No Application Submitted)
- Zango Healthcare Ltd (no RAN, —, Private, No Application Submitted)

## Repeated names in the workbook (4)

Imported as separate facilities because each carries its own RAN; flagged for review.

- ST LUKE'S MISSION HOSPITAL (FAC/0554)
- ST. LUKE'S MISSION HOSPITAL (FAC/0078)
- ZAF KABWE (FAC/0668)
- ZAF KABWE (FAC/0673)

## Curated licence-sheet matches (15)

Licence rows whose holder is spelt differently on the licence sheet than on the register sheet.

- ALFRED H KNIGHT → ALFRED H KNIGHT (Z) LTD (Export Licence)
- ALFRED H KNIGHT → ALFRED H KNIGHT (Z) LTD (Importation Licence)
- CHILANGA CEMENT → CHILANGA CEMENT PLC LUSAKA (Variation of Terms and Conditions)
- CHILANGA CEMENT PLC → CHILANGA CEMENT PLC LUSAKA (Transport Licence)
- CHILANGA CEMENT PLC LUSAKA → CHILANGA CEMENT PLC LUSAKA (Importation Licence)
- CHILANGA CEMENT-NDOLA → CHILANGA CEMENT PLC NDOLA (Importation Licence)
- CIDRZ-IBEX → CIDRZ - Ibex Campus (Export Licence)
- KGP DENTAL → K.G.P Dental Surgery (Importation Licence)
- NORTHWAY DENTAL → NORTH WAY DENTAL CLINIC (Importation Licence)
- OLIVINE → OLIVINE CLINIC (Importation Licence)
- UNIVERSITY TEACHING HOSPITAL-NUCLEAR MEDICINE → UNIVERSITY TEACHING HOSPITAL- NUCLEAR MEDICINE (Variation of Terms and Conditions)
- ZAF LIVINGSTONE → ZAF KABWE (Importation Licence)
- ZAF SAMORA → ZAF SAMORA AFB (Importation Licence)
- ZAMBIA REVENUE AUTHORITY-KAPIRI MPOSHI → ZRA KAPIRI MPOSHI (Decommissioning Licence)
- ZNS CHAMBA VALLEY GARRISON → ZNS CHAMBA VALLEY HQ GARRISON CLINIC (Importation Licence)
