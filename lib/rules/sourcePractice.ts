import { SEALED_SOURCES, type SourceCategory } from "./sourceCategories";

/**
 * What a sealed source is USED for — the practice type it sits under on the
 * inventory (Fixed Gauges, Gamma Radiography, Well Logging Sources …).
 *
 * Neither register records it. RAIS exports a source's nuclide, maker and model;
 * the field annex only its nuclide. So the use is read, in this order, from:
 *
 * 1. **the record itself** — a maker or model that only one kind of device
 *    uses (Troxler and Humboldt build portable moisture/density gauges;
 *    Endress+Hauser, Berthold, VEGA and Process Automation's NDG build fixed
 *    ones; Krones' Am-241 is a bottling-line fill-level gauge), or a nuclide
 *    with one use (Ni-63 is an electron capture detector; Ir-192 outside a
 *    hospital is a radiography camera);
 * 2. **who holds it** — the Authority's rule of thumb (October 2026): a gauge
 *    source at a construction or roads company is a portable moisture/density
 *    gauge, one at a mine or a process plant is a fixed gauge; a source at a
 *    wireline company is a logging source; check sources in a nuclear medicine
 *    or radiotherapy department are reference sources;
 * 3. otherwise it is **not determined**, and stays a worklist.
 *
 * The basis is returned with the answer, so the tab can say how much of a
 * figure the record supports and how much is the holder rule. As with the XRF
 * determinations, a source's own words always win, and nothing is written to
 * the seed: change the holder and the answer follows.
 */

export type PracticeBasis = "record" | "holder" | "undetermined";

export interface SourcePractice {
  category: SourceCategory;
  basis: PracticeBasis;
}

/** The fields the rules read. A RAIS record and an annex row both fit. */
export interface SourceEvidence {
  nuclide?: string;
  manufacturer?: string;
  model?: string;
}

/** Who holds it: the facility's name and, where RAIS has one, the department. */
export interface HolderEvidence {
  facility: string;
  department?: string;
}

const UNDETERMINED: SourcePractice = { category: SEALED_SOURCES, basis: "undetermined" };

const record = (category: SourceCategory): SourcePractice => ({ category, basis: "record" });
const holder = (category: SourceCategory): SourcePractice => ({ category, basis: "holder" });

// Makers and models of portable moisture/density gauges.
const PORTABLE_GAUGE =
  /troxler|humbol?dt|instro\s?tek|\bcpn\b|campbell pacific|^(3411|3430|3440|3450|3500|5000|5001)|xplorer|\bmc-?\d/;
// Makers of fixed process gauges (level, density, thickness, belt weighers,
// on-line analysers).
const FIXED_GAUGE =
  /process automation|\bndg|endress|berthold|\bvega\b|ramsey|krones|jasch|bicron|ronan|ohmart|gamma-?metrics|amdel|thermo electron|thermo quest|texas nuclear/;
// Instruments and X-ray sets that have been entered on the SOURCE register:
// they are not gauges, whoever holds them, so the holder rule must not file
// them as one.
const NOT_A_SOURCE =
  /vanta|olympus|xepos|spectro|malvern|panalytical|niton|bruker|fujifilm|ray co|astrophysics|rapiscan|smiths/;
const AFTERLOADER = /flexitron|microselectron|gammamed|varisource|afterloader|bebig/;
const RADIOGRAPHY_CAMERA = /gammatec|dual 120|sentinel|projector|gammamat|exposure device/;

// Nuclides a gauge is built around — the holder rule only applies to these
// (or to a source whose nuclide is not recorded). Spellings are the
// register's own, typos included: "Ce-137" and "Cs-132" are Cs-137.
const GAUGE_NUCLIDE = /cs-?13[27]|ce-?137|ba-137|co-60|am-241|cf-252|pu-238|sr-90|kr-85/;

const WIRELINE = /wireline|well logging|logging|schlumberger|halliburton|baker hughes|weatherford/;
const HOSPITAL = /hospital|cancer|clinic|medical|health|teaching hospital|\buth\b/;
const NUCLEAR_MEDICINE = /nuclear medicine/;
const CONSTRUCTION =
  /construct|\broads?\b|railway|engenharia|engineering|asphalt|sinohydro|const lab|civil|paving|bridge/;
const MINE_OR_PLANT =
  /\bmines?\b|mining|mineral|copper|zccm|kansanshi|trident|lumwana|mopani|konkola|cement|limestone|steel|brewer|ginner|dangote|smelter|refiner|sugar/;

/**
 * The practice type a sealed source sits under, and what that answer rests on.
 */
export function sourcePractice(
  source: SourceEvidence,
  held: HolderEvidence | null,
): SourcePractice {
  const nuclide = (source.nuclide || "").toLowerCase().trim();
  const maker = `${source.manufacturer || ""} ${source.model || ""}`.toLowerCase().trim();
  const model = (source.model || "").toLowerCase().trim();
  const where = held
    ? `${held.facility} ${held.department || ""}`.toLowerCase()
    : "";
  const atHospital = HOSPITAL.test(where);

  // 1. The record's own evidence.
  if (nuclide.includes("ni-63")) return record("Electron Capture Detectors");
  if (AFTERLOADER.test(maker)) return record("HDR/MDR Brachytherapy");
  if (/ir-192|se-75|yb-169/.test(nuclide) || RADIOGRAPHY_CAMERA.test(maker)) {
    // An Ir-192 source in a hospital is an afterloader's; anywhere else it is
    // an industrial radiography camera's.
    return atHospital && !RADIOGRAPHY_CAMERA.test(maker)
      ? holder("HDR/MDR Brachytherapy")
      : record("Gamma Radiography");
  }
  if (NOT_A_SOURCE.test(maker)) return UNDETERMINED;
  if (PORTABLE_GAUGE.test(maker) || PORTABLE_GAUGE.test(model)) {
    return record("Portable Gauges");
  }
  if (FIXED_GAUGE.test(maker)) return record("Fixed Gauges");
  // Kr-85 is a paper/film basis-weight gauge's nuclide.
  if (nuclide.includes("kr-85")) return record("Fixed Gauges");

  // 2. Who holds it.
  if (!held) return UNDETERMINED;
  if (WIRELINE.test(where)) return holder("Well Logging Sources");
  if (atHospital) {
    if (NUCLEAR_MEDICINE.test(where) && /i-131|lu-177|ra-223/.test(nuclide)) {
      return holder("Radionuclide Therapy");
    }
    // The long-lived check sources a dose calibrator, gamma camera or
    // ionisation chamber is tested against.
    if (/co-57|cs-137|ba-133|co-60|i-129|ge-68|na-22|sr-90/.test(nuclide)) {
      return holder("Calibration & Reference Sources");
    }
    return UNDETERMINED;
  }
  if (nuclide !== "" && !GAUGE_NUCLIDE.test(nuclide)) return UNDETERMINED;
  if (CONSTRUCTION.test(where)) return holder("Portable Gauges");
  if (MINE_OR_PLANT.test(where)) return holder("Fixed Gauges");
  return UNDETERMINED;
}
