import type { SourceCategory } from "./sourceCategories";

/**
 * Which of the register's XRF analysers are portable and which are fixed.
 *
 * The Seniors' Monday Briefing asked for the two to be counted apart. RAIS
 * records all 64 with the same `Type`, the bare word "XRF", so the split cannot
 * come from the type column. It comes from the instrument itself: the model the
 * register names, read against the manufacturer's own product line. An X-MET
 * 7000 is a handheld analyser; a Courier 5X SL is bolted over a slurry line.
 *
 * This is a determination by the Authority, not a reading of RAIS, so it is
 * kept here rather than written into `seed/rais-source-inventory.seed.json`.
 * Three things follow from that, and they are the reason for the shape:
 *
 * - the seed stays checkable against the RAIS export, line for line;
 * - a determination only ever **fills a gap**. `generatorFamilyOf` consults this
 *   table only for a record whose own text still says nothing more than "XRF",
 *   so a corrected record, or a future export that says "Portable XRF" itself,
 *   wins over anything written here; and
 * - it is keyed by RAN, so a re-export keeps it, and an item whose RAN is gone
 *   simply stops being consulted.
 *
 * The 23 analysers not listed below stay in *XRF (Type Not Specified)*: their
 * register entry names no model, and their manufacturer sells both forms
 * (Thermo Scientific sell the Niton handhelds and the ARL benchtops alike), so
 * there is nothing to read. They are the remaining worklist, counted on the
 * register-gaps panel. `docs/source-inventory-categories-2026.md` lists them.
 */
export const XRF_FORM_BY_RAN: Readonly<
  Record<string, Extract<SourceCategory, "Portable XRF" | "Fixed XRF">>
> = {
  // Handheld analysers, named by their model.
  // Oxford Instruments X-MET 7000 — a hand-held alloy analyser.
  "RG/0128": "Portable XRF",
  "RG/0142": "Portable XRF",
  "RG/0143": "Portable XRF",
  "RG/0144": "Portable XRF",
  "RG/0146": "Portable XRF",
  "RG/0148": "Portable XRF",
  "RG/0152": "Portable XRF",
  "RG/0153": "Portable XRF",
  "RG/0154": "Portable XRF",
  "RG/0155": "Portable XRF",
  "RG/0157": "Portable XRF",
  "RG/0161": "Portable XRF",
  "RG/0163": "Portable XRF",
  "RG/0164": "Portable XRF",
  // Olympus Vanta — hand-held. RG/1010's model is written "0lympus Vanta".
  "RG/0790": "Portable XRF",
  "RG/1010": "Portable XRF",
  // Niton XL2 — hand-held. The model is in the serial ("XL2 96565"), not the
  // model column, which is blank.
  "RG/0134": "Portable XRF",
  // SciAps sell hand-held analysers only; the model column is blank.
  "RG/0795": "Portable XRF",

  // Benchtop, floor-standing and on-line analysers, named by their model.
  // Outotec Courier 5X SL / Dutotel Courier 6X SL — on-line stream analysers.
  "RG/0205": "Fixed XRF",
  "RG/0206": "Fixed XRF",
  "RG/0207": "Fixed XRF",
  "RG/0967": "Fixed XRF",
  // IMA con 100 and Baltic Scientific CON-X — conveyor analysers.
  "RG/0722": "Fixed XRF",
  "RG/0819": "Fixed XRF",
  "RG/0820": "Fixed XRF",
  // Laboratory instruments: Panalytical Zetium (floor-standing WDXRF),
  // PW 4400/25 and Epsilon 3X; Thermo ARL 9900 and Quant'X; Spectro Xepos;
  // Oxford X-Supreme 8000; Rigaku MiniFlex.
  "RG/0817": "Fixed XRF",
  "RG/0965": "Fixed XRF",
  "RG/0966": "Fixed XRF",
  "RG/0940": "Fixed XRF",
  "RG/0941": "Fixed XRF",
  "RG/0964": "Fixed XRF",
  "RG/0968": "Fixed XRF",
  "RG/0969": "Fixed XRF",
  "RG/0942": "Fixed XRF",
  "RG/0970": "Fixed XRF",
  // Model blank, but the manufacturer's XRF line is one form throughout:
  // Malvern Panalytical (laboratory instruments — and these four carry the
  // same DY-prefixed serials as their named PW 4400 and Epsilon 3X above),
  // Outotec (the Courier on-line analysers) and Thermo Gamma-Metrics (on-line
  // bulk-material analysers).
  "RG/0156": "Fixed XRF",
  "RG/0176": "Fixed XRF",
  "RG/0679": "Fixed XRF",
  "RG/0680": "Fixed XRF",
  "RG/0204": "Fixed XRF",
  "RG/0211": "Fixed XRF",
};
