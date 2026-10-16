# Source inventory — practice groups and equipment types (October 2026)

Both inventory tabs — **Source Inventory** (the RAIS register, 1,752 items) and
**Verified Source Inventory** (the 215 items confirmed in the field) — report
against **one two-level list**: thirteen practice groups, each holding the
machine or source types beneath it (`SOURCE_GROUPS` in
[`lib/rules/sourceCategories.ts`](../lib/rules/sourceCategories.ts)). This
replaces the flat 25-category list the Seniors' Monday Briefing set in
September 2026.

**Corrected 16 October 2026.** Nuclear Medicine is PET-CT · PET-MR · SPECT-CT ·
SPECT · Cyclotron (gamma camera reads as SPECT; radionuclide therapy and the
radiopharmacy are no longer types). Interventional is Mobile · Fixed ·
Ceiling-Mounted C-Arm Units. Diagnostic Radiology now holds dental and
veterinary imaging, and splits plain radiography by mounting (fixed, mobile)
and technology (conventional, digital, computed). The Dental and Veterinary
groups are gone, so there are thirteen groups, not fifteen.

## Checked against the IAEA

The IAEA publishes no single "list of source groups". What it does is divide
radiation protection by **practice**, one safety guide per practice, and the
groups follow that division:

| Group | IAEA guidance it lines up with |
| --- | --- |
| Radiotherapy · Nuclear Medicine · Interventional · Diagnostic (dental included) | SSG-46, *Radiation Protection and Safety in Medical Uses of Ionizing Radiation* (2018) — diagnostic radiology (dentistry included) and image-guided interventional procedures, nuclear medicine, radiation therapy |
| Veterinary imaging (inside Diagnostic) | Safety Reports Series No. 104, *Radiation Protection and Safety in Veterinary Medicine* (2021) |
| Blood Irradiators · Irradiation Facilities | SSG-8, *Radiation Safety of Gamma, Electron and X Ray Irradiation Facilities*; RS-G-1.9 lists blood/tissue irradiators beside the other irradiators |
| Industrial Radiography | SSG-11, *Radiation Safety in Industrial Radiography* |
| Nuclear Gauges | SSG-58, *Radiation Safety in the Use of Nuclear Gauges* (2020) — radioactive-source and X-ray gauges alike |
| Well Logging | SSG-57, *Radiation Safety in Well Logging* (2020) — sources and neutron generators |
| Security & Inspection | SSG-55, *X Ray Generators and Other Radiation Sources Used for Inspection Purposes and for Non-medical Human Imaging* (2020) |
| Other / Consumer Products | SSG-36, *Radiation Safety for Consumer Products* (2016); static eliminators and lightning preventors are RS-G-1.9 practices |

Where the list departs from the IAEA's own arrangement, on purpose:

- **Interventional is its own group.** SSG-46 treats it in one section with
  diagnostic radiology. Splitting it out is fine for an inventory and keeps
  cath labs and C-arms visible.
- **Kilovoltage X-ray therapy was added** under Radiotherapy. The list as
  handed over had no home for superficial/orthovoltage units, which SSG-46
  counts as external-beam therapy. RAIS holds two (`Deep Xray treatment`);
  they used to be filed as Teletherapy, which in the IAEA's usage means a
  Co-60 head.
- **Portal monitors were dropped.** They detect radiation; they are not
  sources. Nothing was registered under the old category.
- **This is not the IAEA source category 1–5** (RS-G-1.9). That ranks sealed
  sources by hazard, and stays withheld from the tab, as before.

## What the groups hold

### RAIS register — 963 radiation generators

| Group | Total | Types (RAIS `Type` entries folded in) |
| --- | ---: | --- |
| Radiotherapy | 10 | Linear Accelerators 6 · Kilovoltage X-Ray Therapy 2 (`Deep Xray treatment`) · HDR/MDR Brachytherapy 2 (`Brachytherapy Afterloader`) |
| Nuclear Medicine | 3 | PET-CT 2 · Cyclotron 1 |
| Interventional Radiology & Cardiology | 57 | Mobile C-Arm Units 52 (`C-arm Xray generator` 40 · `Digital C-arm X-ray` 12) · Fixed C-Arm Units 5 (`Angiography generator` 3 · `Cathlab` 2) |
| Diagnostic Radiology | 634 | Fixed Conventional Radiography 172 (`Fixed Xray radiography` 138 · `Conventional Xray generator` 34) · Fixed Digital Radiography 108 (`Digital radiography DR x-ray`) · Mobile Conventional Radiography 114 (`Portable Xray radiography` 86 · `Mobile X-Ray Machine` 20 · `Portable Conventional Xray generator` 8) · Mobile Digital Radiography 77 (`Digital Mobile X-ray`) · General CT 50 · Fixed X-Ray Fluoroscopy 33 · Mammography 26 · Bone Densitometry (DXA) 1 · Intraoral Dental 27 (`Conventional dental`) · Panoramic & Cephalometric Dental 17 · Handheld Dental X-Ray 9 (`Portable Dental X Ray`) |
| Industrial Radiography | 13 | Industrial X-Ray Radiography 13 (`Industrial Xray fluoroscopy`) |
| Nuclear Gauges | 16 | Fixed Gauges 16 (`Xray thickness gauge`) |
| Security & Inspection | 46 | Baggage Scanners 36 · Cargo & Vehicle Scanners 10 |
| Analytical Instruments | 64 | Fixed XRF 23 · Portable XRF 18 · *XRF (Type Not Specified)* 23 |
| Research, Education & Calibration | 11 | Calibration X-Ray Generators 10 · Research Accelerators 1 (`Other type of particle radiation generators`) |
| *Not Classified* | 109 | *Type Not Recorded* 109 |

Empty today: Blood Irradiators, Irradiation Facilities, Well Logging, Other /
Consumer Products — named under the breakdown on the tab. Nothing in either
register says *computed* radiography (CR), so the two CR types are empty too;
veterinary sets are registered as plain X-ray and are not told apart.

### RAIS register — 789 sealed sources, by what they are used for

RAIS does not record what a sealed source is used for, so
[`lib/rules/sourcePractice.ts`](../lib/rules/sourcePractice.ts) reads it, in
this order, and says which it was (the CSV's *Practice Basis* column):

1. **The record** (477): a maker or model only one kind of device uses —
   Troxler, Humboldt, Instrotek, CPN and their 3430/3440/5001 models are
   portable moisture/density gauges; Process Automation NDG, Endress+Hauser,
   Berthold, VEGA, Thermo Ramsey/Electron, Krones and Jasch are fixed gauges;
   Elekta Flexitron is an afterloader; Ni-63 is an electron capture detector;
   Ir-192 outside a hospital is a radiography camera; Kr-85 is a basis-weight
   gauge.
2. **The holder** (290), the section's rule of thumb of October 2026: a gauge
   source at a **construction or roads** company is a portable gauge, one at a
   **mine or process plant** is a fixed gauge; a wireline company's source is a
   logging source; a hospital's check sources are reference sources and an
   Ir-192 there is brachytherapy. It only fires for a nuclide a gauge uses (or
   none recorded), so ZCCM's Ra-226, U-238 and Ac-225 are not made into gauges.
3. **Neither** (22): a worklist, *Sealed Source (Use Not Determined)*.

| Type | Sources | of which placed by the holder |
| --- | ---: | ---: |
| Fixed Gauges | 670 | 275 |
| Portable Gauges | 79 | 4 |
| Gamma Radiography | 5 | — |
| Well Logging Sources | 5 | 5 |
| Calibration & Reference Sources | 4 | 4 |
| HDR/MDR Brachytherapy | 3 | 2 |
| Electron Capture Detectors | 1 | — |
| *Sealed Source (Use Not Determined)* | 22 | |

**ZCCM is most of the holder figure.** ZCCM Investment Holdings holds 233
sources with no maker or model, and the facilities register lists it under
*radioactive waste storage*: it is the store of disused sources from the old
mines. Read by the mine rule they are fixed gauges, which is what they were in
service; whether they should count while disused is the section's call.

**The 22 left over:** ZCCM's Ra-226 ×3, U-238 ×2 and Ac-225; six with no
holder recorded (Thermo Pu-238 ×2, Cs-137 ×2, two Cf-252); NISIR's Co-60
(CEA-ORIS); the RPA Clinic, Proctor Engineering and ZRA Nakonde rows with
nothing recorded; and **six that look like X-ray instruments entered on the
source register** — an Olympus Vanta and a Spectro Xepos at Mimbula, a Malvern
Panalytical at Mopani, a Fujifilm GXR-V32 at Express Diagnostic, a RAY Co. unit
at Smile Dental and an Astrophysics scanner at ZRA Nakonde. Those belong on the
generator register and should be corrected there.

The sources also keep their nuclide breakdown (Cs-137 618, Am-241 23, Co-60
14, …).

### Field verification annex — 215 items

Diagnostic Radiology 167 (Fixed Conventional 51 · Fixed Digital 1 · Mobile
Conventional 30 · Mobile Digital 2 · General CT 21 · Mammography 12 ·
Fluoroscopy 4 · Intraoral Dental 30 · Handheld Dental 10 · Panoramic &
Cephalometric Dental 6) · Interventional 28 (Mobile C-Arm 27 · Fixed C-Arm 1,
the `C-arm (Cath Lab)`) · Nuclear Gauges 2 (Fixed) · Security & Inspection 1
(Baggage) · Analytical 1 (*XRF unspecified*) · Research, Education &
Calibration 13 (Calibration & Reference Sources) · *Not Classified* 3 (one
sealed source whose use is not determined; *Unrecognised Type*: `Dexter`,
`X-ray Tube`).

Its 14 sealed sources are all at UTH Nuclear Medicine, so the holder rule reads
them as the department's check sources (Co-57 5 · Cs-137 4 · Co-60 2 · Ba-133 1
· I-129 1). The I-131 is left undetermined: the list has no therapy type.

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

- **Unqualified radiography reads as conventional.** RAIS' `Fixed Xray
  radiography` (138) and `Portable Xray radiography` (86) name no technology;
  they are filed conventional, as the September briefing filed them. Digital
  needs "digital" or "DR" in the entry, computed needs "computed" or "CR".
- **Mobile C-arms are interventional only** (16 Oct 2026). The corrected list
  named them under both Interventional and Diagnostic; a machine counts once.
- **Angiography and cath-lab systems are fixed C-arms**, the annex's
  `C-arm (Cath Lab)` included; *Ceiling-Mounted* takes only an entry that says
  "ceiling". Every other C-arm is mobile.
- **"Portable dental" is read as handheld dental.** RAIS' `Portable Dental X
  Ray` (9) and the annex's portable/mobile dental rows. If some are wheeled
  units rather than hand-held, they belong under Intraoral.
- **A bare "Dental X-ray" is intraoral** — the commonest set; a bare `OPD` or
  `DPG` is a misspelt OPG, but `Dental X-ray (OPD)` is an out-patient
  department's dental set.
- **An unqualified nuclear gauge is fixed** unless the entry says portable,
  moisture or Troxler. The annex's two `Industrial Nuclear Gauge` rows are
  filed Fixed.
- **X-ray thickness gauges are nuclear gauges** (SSG-58 covers X-ray gauges),
  and **industrial fluoroscopy is industrial X-ray radiography** (NDT).
- **RAIS' "Other type of particle radiation generators" is a research
  accelerator** — the only group that fits a non-medical particle machine.
- **A cyclotron is nuclear medicine** (PET radiopharmaceutical production).
- **The annex's `Dexter` is not guessed.** It may be a DEXA scanner; until an
  officer corrects the row it sits in *Unrecognised Type*.

## Changing the categories again

1. Edit `SOURCE_GROUPS` and `sourceCategory` in
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
