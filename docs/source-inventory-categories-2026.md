# Source inventory — the reported equipment categories (September 2026)

The Seniors' Monday Briefing on the inventory exercise asked for the inventory's
equipment categories to be split further. This is that split: what was asked,
what each category now holds in the two registers, and what the change exposed.

Both inventory tabs — **Source Inventory** (the RAIS register, 1,752 items) and
**Verified Source Inventory** (the 215 items confirmed in the field) — now
report against **one list**, `SOURCE_CATEGORIES` in
[`lib/rules/sourceCategories.ts`](../lib/rules/sourceCategories.ts). Before this
they had a list each, in different words for the same machines, so the register
and the field exercise could not be read line against line. They can now.

## What the briefing asked for

| # | Asked | Done as |
| --- | --- | --- |
| 1 | Fixed and digital X-ray split; a category for Conventional Fixed Digital Radiography | **Fixed X-Ray Machines** · **Conventional Fixed Digital Radiography** |
| 2 | Dental split | **General Dental X-Ray** · **Dental CBCT** |
| 3 | Radiotherapy split | **Brachytherapy** · **Teletherapy** |
| 4 | Linear accelerators standalone, medical and industrial | **Linear Accelerators** |
| 5 | CT split | **General CT** · **PET-CT** · **SPECT-CT** |
| 6 | Fluoroscopy and angiography split | **Fluoroscopy** · **Angiography & Cath Lab** |
| 7 | Security screening split | **Cargo Scanners** · **Baggage Scanners** · **Portal Monitors** |
| 8 | XRF split | **Portable XRF** · **Fixed XRF** (· *XRF (Type Not Specified)* — see below) |
| 9 | Sealed sources split by type of source | by **nuclide**, on both tabs |
| 10 | Other specialised equipment | **Other Specialised Equipment** |
| 11 | Say what "other specialised" covers | the equipment is **listed under the row** on both tabs |

Categories nothing is registered under yet — Dental CBCT, SPECT-CT, Portal
Monitors — still exist. They are the vocabulary officers file against, not a
summary of what is on the books today, so the pages name them under the
breakdown ("Nothing registered yet under …") rather than hiding them.

Unchanged, because the briefing did not ask and the registers use them:
Mobile & Portable X-Ray, Mammography Systems, C-Arm Units, and
Industrial X-Ray & Gauging (thickness gauges, industrial radiography and
NDT fluoroscopy — what is left of the old *Industrial & Analytical X-Ray* once
XRF became its own family).

## What the categories hold

### RAIS register — 963 radiation generators

| Category | Count | RAIS `Type` entries folded into it |
| --- | ---: | --- |
| Mobile & Portable X-Ray | 191 | Portable Xray radiography 86 · Digital Mobile X-ray 77 · Mobile X-Ray Machine 20 · Portable Conventional Xray generator 8 |
| Fixed X-Ray Machines | 172 | Fixed Xray radiography 138 · Conventional Xray generator 34 |
| Type Not Recorded | 109 | *(blank)* |
| Conventional Fixed Digital Radiography | 108 | Digital radiography DR x-ray 108 |
| XRF (Type Not Specified) | 64 | XRF 64 |
| General Dental X-Ray | 53 | Conventional dental 27 · Panoramic 15 · Portable Dental 9 · Cephalometric 2 |
| C-Arm Units | 52 | C-arm Xray generator 40 · Digital C-arm X-ray 12 |
| General CT | 50 | CT scanner 50 |
| Baggage Scanners | 36 | Baggage Scanner 36 |
| Fluoroscopy | 33 | Fluoroscopic Xray generator 20 · Digital Fluoroscopy X-ray 13 |
| Industrial X-Ray & Gauging | 29 | Xray thickness gauge 16 · Industrial Xray fluoroscopy 13 |
| Mammography Systems | 26 | Mammography generator 13 · Digital Mammography 13 |
| Other Specialised Equipment | 13 | Calibration Xray generator 10 · Bone densitometer 1 · Cyclotron 1 · Other type of particle radiation generators 1 |
| Cargo Scanners | 10 | Cargo Scanner 10 |
| Linear Accelerators | 6 | Linear accelerator 6 |
| Angiography & Cath Lab | 5 | Angiography generator 3 · Cathlab 2 |
| Brachytherapy | 2 | Brachytherapy Afterloader 2 |
| Teletherapy | 2 | Deep Xray treatment 2 |
| PET-CT | 2 | PET-CT 2 |

The register's **789 sealed sources** keep their own axes — by nuclide (Cs-137
618, Am-241 23, Co-60 14, …) and by IAEA category — which is the type-of-source
split the briefing asked for at item 9.

### Field verification annex — 215 items

Fixed X-Ray Machines 51 · General Dental X-Ray 46 · Mobile & Portable X-Ray 32 ·
C-Arm Units 28 · General CT 21 · Sealed Sources 14 · Mammography Systems 12 ·
Fluoroscopy 4 · Industrial X-Ray & Gauging 2 · Other Specialised Equipment 2 ·
Conventional Fixed Digital Radiography 1 · Baggage Scanners 1 ·
XRF (Type Not Specified) 1.

Its 14 sealed sources now break down by type of source as well: Co-57 5 ·
Cs-137 4 · Co-60 2 · Ba-133 1 · I-129 1 · I-131 1. *Other Specialised* holds a
`Dexter` and an `X-ray Tube` — both as the annex wrote them.

## Two categories that are worklists, not machine families

The finer split asks the registers questions they cannot yet answer, and the
tabs say so rather than guessing:

- **XRF (Type Not Specified) — 64 generators.** The briefing wants portable and
  fixed XRF counted apart, and RAIS records all 64 as plain `XRF`. Some model
  names hint at it (an Oxford X-MET or an Olympus Vanta is handheld, a Panalytical
  ZETIUM or a Courier 5X SL is not), but a category is not inferred from a
  manufacturer's model name. The 64 sit here until the register says which they
  are; classify a row and it moves on its own.
- **Type Not Recorded — 109 generators.** As before: a registered generator whose
  type RAIS never captured.

Both are shown muted, and both are counted on the *register gaps* panel.

## Judgement calls worth knowing

- **"Deep Xray treatment" → Teletherapy.** Orthovoltage external-beam treatment.
  The two rows are RAIS' own wording and are not corrected.
- **A cyclotron is not a linac.** Item 4 made linear accelerators standalone; a
  cyclotron and RAIS' "Other type of particle radiation generators" are named
  under *Other Specialised Equipment* rather than counted as radiotherapy, which
  is where they sat before.
- **A C-arm is a C-arm wherever it stands.** The annex's `C-arm (Cath Lab)` is a
  C-arm, not an angiography suite; RAIS' `Cathlab` and `Angiography generator`
  are.
- **Industrial fluoroscopy is NDT kit**, not a fluoroscopy suite, so it is
  claimed by Industrial X-Ray & Gauging before the fluoroscopy test.
- **Nuclear gauges moved.** The annex's two `Industrial Nuclear Gauge` rows were
  under the old *Other Specialized / Gauge Equipment*; they are now
  Industrial X-Ray & Gauging, which is why *Other Specialised* on that tab
  reads 2 rather than 6.

## Changing the categories again

1. Edit `SOURCE_CATEGORIES` and `sourceCategory` in
   `lib/rules/sourceCategories.ts` — one list and one classifier serve both
   tabs, the CSV exports and the filter dropdowns.
   **Order is the logic**: a specific machine must be tested before the generic
   X-ray word its entries also contain.
2. Update `tests/sourceCategories.test.ts` (the pinned list, and a case for each
   new split), then the pinned per-category counts in
   `tests/raisInventory.test.ts` and `tests/verifiedInventory.test.ts`.
3. Update the tables above, and the Source Inventory section of the README.
4. `npm run typecheck && npm test`.

Nothing is stored per category — every figure is derived from the registers'
own text at read time — so a category change needs no re-seed and no migration,
and officers' corrections in `inventoryEdits` are untouched by it.
