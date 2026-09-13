# Register import — 2026 Licensing Status workbook

Imported 2026-09-13 from `Licensing Status-4.xlsx` (the Authorisation & Standards licensing status workbook), replacing the register the previous import left behind. Regenerate with:

```
python3 scripts/convert-licensing-status-xlsx.py <Licensing_Status.xlsx>
```

## Result

| Metric | Count |
|---|---|
| Facilities | **538** |
| — from the workbook / carried over | 501 / 37 |
| Licensed / Unlicensed | 228 / 310 |
| Functional / Non-functional | 392 / 146 |
| Medical / Non-Medical | 350 / 188 |
| Licences recorded | **383** |
| — from the workbook / carried over | 379 / 4 |
| First-time licensees | 4 |
| Stalled applications | 23 |
| Flagged for review | 161 |

## Applying it to the live project

```
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run seed -- --only facilities
```

A facility an officer has edited in the app is **merged, not replaced**: the workbook decides whether it is licensed and with which licences; the officer's stage on an application the workbook has unlicensed, their dated licences (a dated record stands in for the workbook's quarter-dated entry of the same type) and their corrections to the record itself all stand. `mergeSeededFacility` (`lib/store/seeding.ts`) is the rule; the seed prints what it kept, facility by facility. Work plan output **1.1.4** carries the workbook's total *less* the dated licences the app already counts as `licenceEvents` — re-baseline it when this changes (see `docs/subprogrammes-2026-cumulative-update.md`).

## Licences issued — reconciled against the workbook's Totals sheet

| Licence type | Workbook total | Imported |
|---|---|---|
| Decommissioning Licence | 5 | 5 |
| Export Licence | 3 | 3 |
| Importation Licence | 91 | 90 ⚠ (-1) |
| Transfer Licence | 7 | 7 |
| Transit Licence | 3 | 3 |
| Transport Licence | 1 | 1 |
| Use/Possession | 248 | 248 |
| Variation of Terms and Conditions | 22 | 22 |

A further **4** licence(s) sit on the carried-over facilities below — they come from the previous register, not from this workbook, so they are outside its totals.

Per licence type as stored on the register:

| Licence type | Count |
|---|---|
| Renewal of Use/Possession Licence | 240 |
| Importation Licence | 90 |
| Variation of Terms and Conditions | 22 |
| New Use/Possession Licence | 12 |
| Transfer Licence | 7 |
| Decommissioning Licence | 5 |
| Export Licence | 3 |
| Transit Licence | 3 |
| Transport Licence | 1 |

By quarter of issue:

| Quarter | Licences |
|---|---|
| 2026-Q1 | 198 |
| 2026-Q2 | 142 |
| 2026-Q3 | 39 |
| carried over | 4 |

## Stage breakdown

| Stage | Facilities |
|---|---|
| Licensed | 228 |
| No Application Submitted | 212 |
| Waiting for Payment | 46 |
| Import Licence Only (Not yet Use/Possession) | 12 |
| Authorization Terms Issued | 9 |
| Licence Expiring (Renewal Due) | 8 |
| In Final Processing | 7 |
| Accounts Clearance Pending | 6 |
| Application Submitted | 5 |
| Draft Application | 3 |
| Under Review and Assessment | 2 |

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

## Carried over — not in the workbook (37)

The workbook's register sheet has no row for these, but they are kept on the register with their previous status and flagged for review. CIDRZ - Ibex Campus, K.G.P Dental Surgery do appear on its licence sheets, which is why they are kept rather than removed.

- CIDRZ - Ibex Campus (no RAN, Lusaka, Private, licensed)
- K.G.P Dental Surgery (no RAN, Lusaka, Private, licensed)
- Kenneth Kaunda International Airport (no RAN, Lusaka, Public, licensed)
- KG Dental Surgery (FAC/0623, Lusaka, Private, licensed)
- 64 Armoured Hospital (FAC/0621, Lusaka, Public, No Application Submitted)
- African Mechanical Superlift Limited (FAC/0371, —, Private, No Application Submitted)
- All Africa Tranport (FAC/0584, —, Private, No Application Submitted)
- Australian Laboratory Group (Z) Ltd (FAC/0528, —, Private, No Application Submitted)
- Build Trust Construction Limited (no RAN, Lusaka, Private, No Application Submitted)
- Buildcon Investments Limited (no RAN, Ndola, Private, No Application Submitted)
- Care for You Medical Clinic (FAC/0299, Lusaka, Private, No Application Submitted)
- Cecil Chams Limited (FAC/0583, —, Private, No Application Submitted)
- China Habour Engineering Company Ltd (no RAN, Lusaka, Private, No Application Submitted)
- Emmaron Investments Limited (FAC/0642, —, Private, No Application Submitted)
- Healing Touch Clinic (no RAN, Lusaka, Private, Import Licence Only (Not yet Use/Possession))
- Kagem Mining Limited (no RAN, Lufwanyama, Private, No Application Submitted)
- Kitwe Training School (no RAN, —, Public, No Application Submitted)
- Luampa Mission Hospital (FAC/0600, Kaoma, Private, No Application Submitted)
- Matero General Hospital (FAC/0560, —, Public, No Application Submitted)
- Mumana Mineral Resources Limited (FAC/0542, Lusaka, Private, No Application Submitted)
- Mungwi Baptist Rural Health Centre (no RAN, Mungwi, Private, No Application Submitted)
- Mvuu Resources Limited (no RAN, Solwezi, Private, No Application Submitted)
- Mwansabombwe District Hospital (FAC/0481, Mwansabombwe, Public, No Application Submitted)
- Nature Mining Resources Zambia (FAC/0631, —, Private, No Application Submitted)
- Premium Health Medical Centre (no RAN, Luanshya, Private, No Application Submitted)
- Proctor Engineering Limited (no RAN, Lusaka, Private, No Application Submitted)
- Redachem Zambia (no RAN, Kitwe, Private, No Application Submitted)
- Roads and Pavings Zambia Ltd (no RAN, Lusaka, Private, No Application Submitted)
- St. Fidelis Mission Hospital (FAC/0561, Kasama, Public, Waiting for Payment)
- St. Joseph Rural Mini Hospital (no RAN, Nyimba, Private, No Application Submitted)
- Suntrion Healthcare Services Ltd (FAC/0595, —, Private, No Application Submitted)
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

## Curated licence-sheet matches (16)

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
- ZAMBIA REVENUE AUTHORITY KASU → ZAMBIA REVENUE AUTHORITY KASUMBALESA (Variation of Terms and Conditions)
- ZAMBIA REVENUE AUTHORITY-KAPIRI MPOSHI → ZRA KAPIRI MPOSHI (Decommissioning Licence)
- ZNS CHAMBA VALLEY GARRISON → ZNS CHAMBA VALLEY HQ GARRISON CLINIC (Importation Licence)

## Sector — the workbook disagrees (42, not applied)

The workbook's *Facility Type* column gives a different sector from the one the register holds. The column is not taken over the register — some of its readings are plainly wrong — so these are a worklist for an officer, who corrects the facility in the app where the workbook is right. Register → workbook:

- Arthur Davison Children's Hospital (FAC/0002) — Public → Private
- Asphalt Roads Zambia Limited (FAC/0250) — Private → Public
- CJ Nyirenda Training School (FAC/0676) — Private → Public
- Chainama Hills College Hospital (FAC/0009) — Private → Public
- Chelston Veterinary Clinic (FAC/0386) — Private → Public
- Chibuluma Mines Plc (FAC/0165) — Private → Public
- Chimanga Clinic (FAC/0537) — Private → Public
- Chipata Airport (FAC/0408) — Public → Private
- Defence School of Health Sciences (FAC/0658) — Private → Public
- Harry Mwaanga Nkumbula International Airport (FAC/0351) — Public → Private
- Ikelenge Rural Health Centre (FAC/0687) — Private → Public
- International Organisation For Migration (FAC/0450) — Public → Private
- Kabwe Training School Clinic (FAC/0640) — Private → Public
- Kafue Gorge Lower Clinic (FAC/0124) — Public → Private
- King Salman Bin Abdul-Aziz Specialist Hospital (FAC/0679) — Private → Public
- Mahatma Gandhi Clinic (FAC/0410) — Private → Public
- Mansa Airport (FAC/0404) — Public → Private
- Mbala Airport (FAC/0406) — Public → Private
- Mfuwe International Airport (FAC/0352) — Public → Private
- Mikango Camp Hospital (FAC/0635) — Private → Public
- Mother of Mercy Hospice (FAC/0329) — Private → Public
- Mwami Adventist Hospital (FAC/0235) — Private → Public
- Nathan Mulenga Institute (FAC/0375) — Private → Public
- Occupational Health and Safety Institute (Solwezi) (FAC/0430) — Public → Private
- Occupational Health and Safety Institute Kitwe (FAC/0094) — Public → Private
- Occupational Health and Safety Institute Lusaka (FAC/0437) — Public → Private
- Our Ladys Hospice (FAC/0478) — Private → Public
- Simon Mwansa Kapwepwe International Airport (FAC/0349) — Public → Private
- Solwezi Airport (FAC/0405) — Public → Private
- South Luangwa Conservation Animal Health Center (FAC/0590) — Public → Private
- St Luke'S Mission Hospital (FAC/0554) — Private → Public
- St. Fidelis Mission Hospital (FAC/0308) — Private → Public
- Tusekelemo Community Medical Centre (FAC/0114) — Public → Private
- United Nations Development Programme (FAC/0470) — Public → Private
- ZCCM Investment Holdings Plc (FAC/0186) — Public → Private
- Zambezi Portland Cement (FAC/0499) — Public → Private
- Zambia Airports Corporation Mongu Airport (FAC/0407) — Public → Private
- Zambia Flying Doctor Services (FAC/0451) — Public → Private
- Zambia Gold Company Limited (FAC/0491) — Public → Private
- Zambia Helpers Society Hospital (FAC/0121) — Private → Public
- Zambia Medicines and Medical Supplies Agency (FAC/0592) — Private → Public
- Zn Chowoko (FAC/0649) — Private → Public

## Category — the workbook disagrees (49, not applied)

The workbook's *Facility Type* column gives a different category from the one the register holds. The column is not taken over the register — some of its readings are plainly wrong — so these are a worklist for an officer, who corrects the facility in the app where the workbook is right. Register → workbook:

- Ace Pharmaceuticals (FAC/0474) — Non-Medical → Medical
- Arthur Davison Children's Hospital (FAC/0002) — Medical → Non-Medical
- Asphalt Roads Zambia Limited (FAC/0250) — Non-Medical → Medical
- CIDRZ Kanyama, Chawama (FAC/0312) — Non-Medical → Medical
- CJ Nyirenda Training School (FAC/0676) — Non-Medical → Medical
- Chibuluma Mines Plc (FAC/0165) — Non-Medical → Medical
- Copperbelt University (CBU) (FAC/0190) — Non-Medical → Medical
- Dental Training School (FAC/0296) — Non-Medical → Medical
- Drug Enforcement Commission - Lusaka (FAC/0188) — Non-Medical → Medical
- Drug Enforcement Commission - Ndola (FAC/0185) — Non-Medical → Medical
- Drug Enforcement Commission Livingstone Airport (FAC/0254) — Non-Medical → Medical
- Emerged Railways Properties (Pvt) Limited (ERP) (FAC/0597) — Non-Medical → Medical
- Government Communication Division (FAC/0620) — Non-Medical → Medical
- Innoray Medical Equipment Company (FAC/0538) — Non-Medical → Medical
- Kasama Airport (FAC/0403) — Non-Medical → Medical
- Max Clinic Limited (FAC/0603) — Medical → Non-Medical
- Medcop (FAC/0031) — Non-Medical → Medical
- Mulungushi University (FAC/0354) — Non-Medical → Medical
- Nsangu Investments Limited (FAC/0670) — Non-Medical → Medical
- Rocinantes Zambia (FAC/0435) — Non-Medical → Medical
- Specialised Emergency Services (FAC/0368) — Non-Medical → Medical
- Steffanutti Stocks Construction Ltd (FAC/0594) — Medical → Non-Medical
- ZA 1 Commando (FAC/0656) — Non-Medical → Medical
- ZA Arackan (FAC/0660) — Non-Medical → Medical
- ZA Gondar (FAC/0650) — Non-Medical → Medical
- ZA Kalewa (FAC/0654) — Non-Medical → Medical
- ZA L85 (Apollo) (FAC/0661) — Non-Medical → Medical
- ZA Mikango (FAC/0665) — Non-Medical → Medical
- ZA Tug-Argan (FAC/0655) — Non-Medical → Medical
- ZA ZCCF (FAC/0653) — Non-Medical → Medical
- ZAF Kabwe (FAC/0668) — Non-Medical → Medical
- ZAF Kabwe (FAC/0673) — Non-Medical → Medical
- ZAF Lusaka (FAC/0664) — Non-Medical → Medical
- ZAF Mbala (FAC/0667) — Non-Medical → Medical
- ZAF Mt Eugen (FAC/0662) — Non-Medical → Medical
- ZAF Mt Eugenia (FAC/0671) — Non-Medical → Medical
- ZAF Mumbwa (FAC/0674) — Non-Medical → Medical
- ZAF Samora AFB (FAC/0672) — Non-Medical → Medical
- ZNS CJ Nyirenda (FAC/0659) — Non-Medical → Medical
- ZNS Chowoko (FAC/0669) — Non-Medical → Medical
- ZNS Kabwe (FAC/0677) — Non-Medical → Medical
- ZNS Kafue (FAC/0663) — Non-Medical → Medical
- ZNS Kamitonte (FAC/0666) — Non-Medical → Medical
- ZNS Kitwe (FAC/0652) — Non-Medical → Medical
- ZNS Musakamba (FAC/0675) — Non-Medical → Medical
- Zambia Air Force (FAC/0370) — Non-Medical → Medical
- Zambia Flying Doctor Services (FAC/0451) — Non-Medical → Medical
- Zambia Police Hospital (FAC/0156) — Medical → Non-Medical
- Zn Chowoko (FAC/0649) — Non-Medical → Medical

## District — the workbook disagrees (2, not applied)

The workbook's *District* column gives a different district from the one the register holds. The column is not taken over the register — some of its readings are plainly wrong — so these are a worklist for an officer, who corrects the facility in the app where the workbook is right. Register → workbook:

- Batoka Hospital (FAC/0608) — Livingstone → Batoka
- Mungwi District Hospital (FAC/0610) — Mungwi → Kasama

## Province — the workbook disagrees (16, not applied)

The workbook's *Province* column gives a different province from the one the register holds. The column is not taken over the register — some of its readings are plainly wrong — so these are a worklist for an officer, who corrects the facility in the app where the workbook is right. Register → workbook:

- Bernaka Medical Center (FAC/0462) — Northern → Muchinga
- Bibagry Limited (FAC/0633) — Lusaka → Copperbelt
- Chama District Hospital (FAC/0010) — Muchinga → Eastern
- Chilubi Island District Hospital (FAC/0493) — Northern → Luapula
- Chindwin Garrison Camp Hospital (FAC/0636) — Lusaka → Central
- Chongwe District Hospital (FAC/0019) — Lusaka → Central
- Hilltop Hospital Solwezi (FAC/0033) — North-Western → Copperbelt
- Itezhi-Tezhi District Hospital (FAC/0035) — Southern → Copperbelt
- Mbala Airport (FAC/0406) — Northern → Muchinga
- Mbala General Hospital (FAC/0071) — Northern → Muchinga
- Mpulungu District Hospital (FAC/0290) — Northern → Muchinga
- Santa Maria Mission Hospital (FAC/0102) — Northern → Luapula
- Yearning Investments Limited (FAC/0625) — Lusaka → Copperbelt
- ZAF Mbala (FAC/0667) — Northern → Muchinga
- ZAF Samora AFB (FAC/0672) — Northern → Muchinga
- ZRA Chirundu (FAC/0183) — Lusaka → Southern

## Licences with no facility in the workbook (1)

These rows appear on a licence-type sheet but no row of the register sheet matches them, so they are **not** counted on any facility.

- RADIATION PROTECTION AUTHORITY — Importation Licence, Q3 ×1 (closest: ZAMBIA REVENUE AUTHORITY KATIMA MULILO 0.29)
