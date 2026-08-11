# Register import — 2026 Licensing Status workbook

Imported 2026-08-11 from `Licensing_Status.xlsx` (the Authorisation & Standards licensing status workbook), replacing the register seeded from the July 2026 Facility Status List. Regenerate with:

```
python3 scripts/convert-licensing-status-xlsx.py <Licensing_Status.xlsx>
```

## Result

| Metric | Count |
|---|---|
| Facilities | **538** |
| — from the workbook / carried over | 515 / 23 |
| Licensed / Unlicensed | 212 / 326 |
| Functional / Non-functional | 405 / 133 |
| Medical / Non-Medical | 350 / 188 |
| Licences recorded | **332** |
| — from the workbook / carried over | 327 / 5 |
| First-time licensees | 4 |
| Stalled applications | 23 |
| Flagged for review | 166 |

## Licences issued — reconciled against the workbook's Totals sheet

| Licence type | Workbook total | Imported |
|---|---|---|
| Decommissioning Licence | 5 | 5 |
| Export Licence | 3 | 3 |
| Importation Licence | 73 | 73 |
| Transfer Licence | 2 | 2 |
| Transit Licence | 3 | 3 |
| Transport Licence | 1 | 1 |
| Use/Possession | 225 | 225 |
| Variation of Terms and Conditions | 15 | 15 |

A further **5** licence(s) sit on the carried-over facilities below — they come from the previous register, not from this workbook, so they are outside its totals.

Per licence type as stored on the register:

| Licence type | Count |
|---|---|
| Renewal of Use/Possession Licence | 219 |
| Importation Licence | 73 |
| Variation of Terms and Conditions | 15 |
| New Use/Possession Licence | 11 |
| Decommissioning Licence | 5 |
| Export Licence | 3 |
| Transit Licence | 3 |
| Transfer Licence | 2 |
| Transport Licence | 1 |

By quarter of issue:

| Quarter | Licences |
|---|---|
| 2026-Q1 | 178 |
| 2026-Q2 | 139 |
| 2026-Q3 | 10 |
| carried over | 5 |

## Stage breakdown

| Stage | Facilities |
|---|---|
| No Application Submitted | 213 |
| Licensed | 212 |
| Waiting for Payment | 53 |
| Licence Expiring (Renewal Due) | 13 |
| Import Licence Only (Not yet Use/Possession) | 12 |
| Authorization Terms Issued | 9 |
| In Final Processing | 9 |
| Accounts Clearance Pending | 6 |
| Application Submitted | 5 |
| Under Review and Assessment | 3 |
| Draft Application | 3 |

## Was licensed, no current licence in the workbook (13)

Imported as unlicensed at stage *Licence Expiring (Renewal Due)* and flagged for review.

- Alistair Logistics Zambia Limited (FAC/0533)
- Chavuma District Hospital (FAC/0378)
- Choma General Hospital (FAC/0018)
- Express Diagnostic Services (FAC/0302)
- Innoray Medical Equipment Company (FAC/0538)
- Kalindawalo General Hospital (FAC/0373)
- Lusaka IVF And Fertility Clinic Limited (FAC/0581)
- Medcross Hospital (FAC/0072)
- Mum's Care Clinic Woodlands (FAC/0699)
- St. Johns Medical Centre Ltd Lusaka (FAC/0240)
- St. Johns Medical Centre Solwezi (FAC/0332)
- TMS Medical Services (FAC/0357)
- UNILABS – Solwezi (FAC/0549)

## Newly licensed (13)

Unlicensed in the previous register, licensed in the workbook.

- Chamboli Level 1 Hospital (FAC/0602) — was *No Application Submitted*
- Chilonga Mission General Hospital (FAC/0242) — was *Authorization Terms Issued*
- Dr. Dilobars Medical Centre (FAC/0483) — was *Application Submitted*
- Juflona Clinic (FAC/0269) — was *Authorization Terms Issued*
- Kapiri Mposhi District Hospital (FAC/0047) — was *Waiting for Payment*
- Kasims Medical Centre (FAC/0619) — was *Import Licence Only (Not yet Use/Possession)*
- Lumwana District Hospital (FAC/0289) — was *In Final Processing*
- Mother of Mercy Hospice (FAC/0329) — was *Application Submitted*
- Progress Medical Center - Town Branch (FAC/0543) — was *Waiting for Payment*
- Unilus Hospital (FAC/0389) — was *In Final Processing*
- Wireline Workshop Pty Limited (FAC/0397) — was *Application Submitted*
- Wusakile Mine Hospital (FAC/0118) — was *Waiting for Payment*
- ZRA Chanida (FAC/0251) — was *In Final Processing*

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

## Merged duplicate rows (9)

The previous register held several spellings of one RAIS facility; each of these merges into the workbook row named, carrying its licence numbers with it.

- Barrick Lumwana Mine → Lumwana Mining Company Limited (FAC/0170)
- KCM Smelter Co Limited Nchanga → Konkola Copper Mine Plc (FAC/0169)
- Konkola Copper Mines – Nchanga → Konkola Copper Mine Plc (FAC/0169)
- Konkola Mineral Resources Limited → Konkola Copper Mine Plc (FAC/0169)
- Konkola Mineral Resources Limited - Konkola → Konkola Copper Mine - Konkola (FAC/0272)
- Konkola Mineral Resources Ltd - Nchanga South Hospital → Nchanga South Hospital (FAC/0577)
- Lewanika Central Hospital → Lewanika General Hospital (FAC/0054)
- Lumwana 1st Level Hospital → Lumwana District Hospital (FAC/0289)
- Mwandi District Hospital → Mwandi Mission Hospital (FAC/0086)

## Fuzzy matches (13)

- ISOKA DISTRICT HOSPTAL (FAC/0034) ← Isoka District Hospital — fuzzy 0.86
- KAMOTO MISSION HOSPITAL MAMBWE (FAC/0238) ← Kamoto Mission Hospital — fuzzy 0.86
- LIVINGSTONE UNIVERSITY TEACHING HOSPITAL (FAC/0055) ← Livingstone Teaching Hospital — fuzzy 0.88
- MAAMBA GENRAL HOSPITAL (FAC/0062) ← Maamba General Hospital — fuzzy 0.86
- MAINA SOKO MILLITARY HOSPITAL (FAC/0147) ← Maina Soko Military Hospital — fuzzy 0.93
- MICHEAL CHILUFYA SATA HOSPITAL (FAC/0442) ← Michael Chilufya Sata Hospital — fuzzy 0.84
- MWAMI ADVENTIST HOSPITAL, CHIPATA. (FAC/0235) ← Mwami Adventist Hospital — fuzzy 0.85
- NCHELENGE DISTRICT HOSIPTAL (FAC/0461) ← Nchelenge District Hospital — fuzzy 0.83
- NORTHERN COMMAND MILLITARY HOSPITAL (FAC/0218) ← Northern Command Military Hospital — fuzzy 0.95
- PROGRESS MEDIAL CENTRE (FAC/0098) ← Progress Medical Centre — fuzzy 0.86
- SANJEEVANI HEALH CARE (FAC/0416) ← Sanjeevani Health Care — fuzzy 0.86
- ST DOROTHY RURAL HEALTH CENTRES (FAC/0440) ← St Dorothy Rural Health Centre — fuzzy 0.98
- STEFANUTTI STOCKS CONSTRUCTION ZAMBIA LIMITED (FAC/0594) ← Steffanutti Stocks Construction Ltd — fuzzy 0.85

## New to the register (89)

Sector, practice and category are unknown for these — each is flagged for review.

- 64 Armoured Hospital (FAC/0621) — Lusaka, Lusaka
- African Mechanical Superlift Limited (FAC/0371) — —, Lusaka
- African Power Coal Limited (FAC/0698) — Lusaka, Lusaka
- Africorp Healthcare Systems Ltd (FAC/0492) — Lusaka, Lusaka
- All Africa Tranport (FAC/0584) — —, Lusaka
- Asthetic Dental Edge (FAC/0510) — Lusaka, Lusaka
- Australian Laboratory Group (Z) Ltd (FAC/0528) — —, Lusaka
- Bibagry Limited (FAC/0633) — —, Lusaka
- CIDRZ Kanyama, Chawama (FAC/0312) — Lusaka, Lusaka
- CJ Nyirenda Training School (FAC/0676) — —, Lusaka
- Cecil Chams Limited (FAC/0583) — —, Lusaka
- Chainama Hills College Hospital (FAC/0009) — Lusaka, Lusaka
- Chelston Health Center (FAC/0012) — Lusaka, Lusaka
- Chibuluma Mines Plc (FAC/0165) — Kalulushi, Copperbelt
- Chimanga Clinic (FAC/0537) — Lusaka, Lusaka
- Chindwin Garrison Camp Hospital (FAC/0636) — —, Lusaka
- Chivuna Mission Rural Health Center (FAC/0534) — Mazabuka, Southern
- Const Lab Zambia Limited (FAC/0582) — Lusaka, Lusaka
- Corpmed Medical Centre (FAC/0132) — Lusaka, Lusaka
- Defence School of Health Sciences (FAC/0658) — Lusaka, Lusaka
- Drug Enforcement Commission - Lusaka (FAC/0188) — Lusaka, Lusaka
- Drug Enforcement Commission Livingstone Airport (FAC/0254) — Livingstone, Southern
- Eastwest Investment Limited (FAC/0599) — —, Lusaka
- Emerged Railways Properties (Pvt) Limited (ERP) (FAC/0597) — Lusaka, Lusaka
- Emmaron Investments Limited (FAC/0642) — —, Lusaka
- Exclusive Dental Care (FAC/0504) — Kafue, Lusaka
- Golden Mark Resources (FAC/0686) — Lusaka, Lusaka
- Government Communication Division (FAC/0620) — Lusaka, Lusaka
- Hightech Diagnostic Centre (FAC/0644) — Kitwe, Copperbelt
- Hillview Medical Center (FAC/0525) — Lusaka, Lusaka
- Information and Communication University (FAC/0615) — Lusaka, Lusaka
- Inyatsi Roads Zambia Limmited (FAC/0207) — Lusaka, Lusaka
- Kabwe Training School Clinic (FAC/0640) — —, Lusaka
- Kazungula District Hospital (FAC/0618) — Kazungula, Southern
- King Salman Bin Abdul-Aziz Specialist Hospital (FAC/0679) — —, Lusaka
- Luampa Mission Hospital (FAC/0600) — Kaoma, Western
- Lubambe Medical and Child Welfare Centre (FAC/0647) — Chililabombwe, Copperbelt
- Lusaka Correctional Facility Clinic (FAC/0131) — Lusaka, Lusaka
- Lusaka Imaging Limited (FAC/0395) — Lusaka, Lusaka
- Matero General Hospital (FAC/0560) — —, Lusaka
- Max Clinic Limited (FAC/0603) — Lusaka, Lusaka
- Mikango Camp Hospital (FAC/0635) — —, Lusaka
- Minexec (PTY) Limited (FAC/0691) — Lusaka, Lusaka
- Mudachi Medical Solutions (FAC/0479) — Livingstone, Southern
- Mumana Mineral Resources Limited (FAC/0542) — Lusaka, Lusaka
- Nature Mining Resources Zambia (FAC/0631) — —, Lusaka
- Needs Care Trust Hospital (FAC/0531) — Lusaka, Lusaka
- Nett Healthcare Limited (FAC/0690) — —, Lusaka
- Newcreast Lime Limited (FAC/0692) — Chilanga, Lusaka
- Newlands Dental Clinic (FAC/0702) — Lusaka, Lusaka
- Nutrident Clinic (FAC/0682) — Chilanga, Lusaka
- On Track Welding & NDE Solutions (FAC/0500) — Lusaka, Lusaka
- Quicklog geophysics PTY Ltd (FAC/0256) — —, Lusaka
- RT Development Corporation Limited (FAC/0535) — Lusaka, Lusaka
- Rehan Hospital Limited (FAC/0622) — Lusaka, Lusaka
- Rocinantes Zambia (FAC/0435) — Lusaka, Lusaka
- Royal Diagnostic Centre (FAC/0393) — —, Lusaka
- Sons of Thunder Clinic (FAC/0638) — Kazungula, Southern
- Sparkle Dental Clinic and Wellness Centre (FAC/0641) — Lusaka, Lusaka
- Specialised Emergency Services (FAC/0368) — Lusaka, Lusaka
- Spectech Inspection Limited (FAC/0553) — Lusaka, Lusaka
- St Luke'S Mission Hospital (FAC/0554) — Lusaka, Lusaka
- St. Fidelis Mission Hospital (FAC/0308) — Kasama, Northern
- Stratum Laboratories Limited (FAC/0700) — Lumwana, North-Western
- Suntrion Healthcare Services Ltd (FAC/0595) — —, Lusaka
- TCCC Metals Trading Limited (FAC/0693) — Lusaka, Lusaka
- Tobbaco Board of Zambia (FAC/0688) — Lusaka, Lusaka
- Tonawanda Procurement Limited (FAC/0697) — —, Lusaka
- Trust Medical Services Hospital Limited (FAC/0075) — Lusaka, Lusaka
- United Capital Fertilizer (FAC/0545) — —, Lusaka
- University of Zambia Ridgeway Campus (FAC/0469) — Lusaka, Lusaka
- WRC Consultants Limited (FAC/0260) — Lusaka, Lusaka
- Wumi Mini Hospital (FAC/0689) — Kalumbila, North-Western
- Yearning Investments Limited (FAC/0625) — —, Lusaka
- ZA Arackan (FAC/0660) — Lusaka, Lusaka
- ZA L85 (Apollo) (FAC/0661) — Chilanga, Lusaka
- ZA Mikango (FAC/0665) — Chongwe, Lusaka
- ZAF Kabwe (FAC/0668) — Livingstone, Southern
- ZAF Lusaka (FAC/0664) — Chongwe, Lusaka
- ZAF Mt Eugen (FAC/0662) — Chilanga, Lusaka
- ZAF Mt Eugenia (FAC/0671) — Lusaka, Lusaka
- ZNS CJ Nyirenda (FAC/0659) — Lusaka, Lusaka
- ZNS Chamba Valley HQ Garrison Clinic (FAC/0628) — —, Lusaka
- ZNS Kafue (FAC/0663) — Kafue, Lusaka
- Zambia Air Force (FAC/0370) — Lusaka, Lusaka
- Zambia Medicines and Medical Supplies Agency (FAC/0592) — Lusaka, Lusaka
- Zambia National Service - Tom Fara Hospital (FAC/0589) — Mpika, Muchinga
- Zn Chowoko (FAC/0649) — Katete, Eastern
- Zorret Timber Limited (FAC/0695) — Chingola, Copperbelt

## Carried over — not in the workbook (23)

The workbook's register sheet has no row for these, but they are kept on the register with their previous status and flagged for review. Two of them do appear on its licence sheets (K.G.P Dental Surgery, CIDRZ – Ibex Campus), which is why they are kept rather than removed.

- Asphalt Roads Zambia Limited (FAC/0250, Lusaka, Private, licensed)
- K.G.P Dental Surgery (no RAN, Lusaka, Private, licensed)
- Kenneth Kaunda International Airport (no RAN, Lusaka, Public, licensed)
- KG Dental Surgery (FAC/0623, Lusaka, Private, licensed)
- CIDRZ - Ibex Campus (no RAN, Lusaka, Private, licensed)
- Roads and Pavings Zambia Ltd (no RAN, Lusaka, Private, No Application Submitted)
- Tropical Diseases Research Centre (no RAN, —, Public, No Application Submitted)
- Zambia Airports (no RAN, Lusaka, Public, No Application Submitted)
- Vubwi District Hospital (no RAN, Mambwe, Public, No Application Submitted)
- Build Trust Construction Limited (no RAN, Lusaka, Private, No Application Submitted)
- Buildcon Investments Limited (no RAN, Ndola, Private, No Application Submitted)
- China Habour Engineering Company Ltd (no RAN, Lusaka, Private, No Application Submitted)
- Healing Touch Clinic (no RAN, Lusaka, Private, Import Licence Only (Not yet Use/Possession))
- Kagem Mining Limited (no RAN, Lufwanyama, Private, No Application Submitted)
- Kitwe Training School (no RAN, —, Public, No Application Submitted)
- Mungwi Baptist Rural Health Centre (no RAN, Mungwi, Private, No Application Submitted)
- Mvuu Resources Limited (no RAN, Solwezi, Private, No Application Submitted)
- Premium Health Medical Centre (no RAN, Luanshya, Private, No Application Submitted)
- Proctor Engineering Limited (no RAN, Lusaka, Private, No Application Submitted)
- Redachem Zambia (no RAN, Kitwe, Private, No Application Submitted)
- St. Joseph Rural Mini Hospital (no RAN, Nyimba, Private, No Application Submitted)
- ZALAWI Haulage Ltd (no RAN, —, Public, No Application Submitted)
- Zango Healthcare Ltd (no RAN, —, Private, No Application Submitted)

## Repeated names in the workbook (8)

Imported as separate facilities because each carries its own RAN; flagged for review.

- LUAMPA MISSION HOSPITAL (FAC/0057)
- LUAMPA MISSION HOSPITAL (FAC/0600)
- ST FIDELIS MISSION HOSPITAL (FAC/0561)
- ST LUKE'S MISSION HOSPITAL (FAC/0554)
- ST. FIDELIS MISSION HOSPITAL (FAC/0308)
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
