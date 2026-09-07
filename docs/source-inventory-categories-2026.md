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
| Fixed XRF | 23 | XRF 23 — determined from the model, see below |
| Portable XRF | 18 | XRF 18 — determined from the model, see below |
| XRF (Type Not Specified) | 23 | XRF 23 |
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

## The XRF split, and the one worklist left

The briefing wants portable and fixed XRF counted apart. RAIS types all 64
analysers the same way — the bare word `XRF` — so the split cannot come from the
type column. It comes from the **instrument**: the model the register names,
read against that manufacturer's own product line. An `X – MET 7000` is a
hand-held alloy analyser; a `Courier 5X SL` is bolted over a slurry line.

**41 of the 64 are determined this way** — 18 portable, 23 fixed:

| Determined | Read from |
| --- | --- |
| **Portable, 18** | Oxford Instruments `X – MET 7000` ×14 · Olympus `Vanta` ×2 · Niton `XL2` (the model is in the serial, not the model column) · SciAps (hand-helds only) |
| **Fixed, 23** | Malvern Panalytical `ZETIUM`, `PW 4400/25`, `EPSILON 3X` and four more on the same DY-prefixed serials · Thermo `ARL 9900`, `Quant'X` · Spectro `Xepos` ×3 · Oxford `X-SUPREME 8000` · Rigaku `MiniFlex` · Outotec `Courier 5X SL` ×3 and Dutotel `Courier 6X SL` · Baltic Scientific `CON-X` ×2 · IMA `con 100` · Outotec and Thermo Gamma-Metrics on-line analysers |

The determinations are a table keyed by **RAN** in
[`lib/rules/xrfDeterminations.ts`](../lib/rules/xrfDeterminations.ts), not an
edit to the seed. The distinction matters:

- the seed stays checkable against the RAIS export, line for line — this is the
  Authority's determination, not something RAIS said;
- a determination only ever **fills a gap**. `generatorFamilyOf` consults the
  table only for a record whose own text still says nothing but `XRF`, so an
  officer's correction, or a future export that spells the type out, wins over
  it; and
- keyed by RAN, it survives a re-export, and an item whose RAN is gone simply
  stops being consulted.

The tab says where the figure came from: the Portable and Fixed XRF rows carry
*"n determined from the instrument's model — RAIS types them only as XRF"*, and
the CSV's Family column reports the determined family beside the verbatim `XRF`
type.

### The 23 still unspecified

Their entry names no model, and their manufacturer sells both forms — Thermo
Scientific sell the Niton hand-helds and the ARL benchtops alike — so there is
nothing to read. They stay in *XRF (Type Not Specified)* and are counted on the
register-gaps panel until the register itself says which they are; classify one
and it moves on its own.

| Manufacturer / model | RANs |
| --- | --- |
| Thermo Scientific — no model (8) | RG/0336–RG/0340, RG/0373, RG/0374, RG/0375 |
| Jiangsu Kyray — no model (3) | RG/0399, RG/0400, RG/0401 |
| Thermofisher — no model (2) | RG/0366, RG/0368 |
| Bruker — no model | RG/0177 |
| Scanray `DOP-200/242` | RG/0201 |
| Varian — no model | RG/0208 |
| Oxford Instruments Analytical Systems — no model | RG/0209 |
| Innovex Olympus `VMR GE2` | RG/0210 |
| Philips `MRS` | RG/0556 |
| Sias — no model | RG/0593 |
| Nuctech — no model | RG/0794 |
| Olympus Corp `VMR` | RG/0840 |
| No manufacturer, no model | RG/1014 |

The field annex's one XRF row (`XRF-3000`) is undetermined for the same reason:
a bare model number with no manufacturer behind it. The annex is keyed by row
number rather than RAN, so it has no determination table of its own.

**Type Not Recorded — 109 generators** is the other worklist: a registered
generator whose type RAIS never captured at all. Both buckets are shown muted
and counted on the register-gaps panel.

## Judgement calls worth knowing

- **"Deep Xray treatment" → Teletherapy.** Orthovoltage external-beam treatment.
  The two rows are RAIS' own wording and are not corrected.
- **The XRF forms are determined, not guessed at random, and never overwrite.**
  See the section above: model first, manufacturer only where that maker's whole
  XRF line is one form, and the record's own words always win.
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
3. If a new RAIS export names a model for one of the 23 undetermined analysers,
   nothing needs doing: the type text wins on its own. If it names one for a row
   the table already covers, drop that row from `XRF_FORM_BY_RAN` — a
   determination should not sit under an answer the register now gives.
4. Update the tables above, and the Source Inventory section of the README.
5. `npm run typecheck && npm test`.

Nothing is stored per category — every figure is derived from the registers'
own text at read time — so a category change needs no re-seed and no migration,
and officers' corrections in `inventoryEdits` are untouched by it.
