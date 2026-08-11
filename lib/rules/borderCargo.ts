/**
 * The controlled cargo vocabulary the border scan log captures against.
 *
 * The monthly border workbook (one sheet per day, one row per scanned truck)
 * recorded cargo as free text in one of three side-by-side columns — "GOODS OF
 * INTEREST", "FOOD" and "OTHER" — and the officer decided which column to type
 * in. In a month of Nakonde traffic that produced 195 distinct spellings for
 * roughly 60 real commodities: SULPHUR was also typed SULPUR, SULLPHUR,
 * SURLPHER, SULPHUIR, SULPHURT and SULPHUR'; MAGNESIA as MAGENESIA and
 * MANGESIA; COPPER ANODE as ANODE, ANODES and COPPER ANOD. Tallying that by
 * hand at the end of the day is what the summary blocks on each sheet were for,
 * and it is why those tallies never quite reconcile.
 *
 * So the UI inverts the workbook's shape: the officer picks ONE commodity and
 * its class is derived here, instead of choosing a column and then typing.
 * Anything genuinely new can still be typed — it is kept verbatim, classed by
 * hand once, and shows up in the day's "new commodity" list so the vocabulary
 * below can grow deliberately rather than by accident.
 *
 * `norm` marks cargo that commonly carries naturally occurring radioactive
 * material (mineral concentrates, refractories, ceramics, fertiliser, heavy
 * mineral sands). It is guidance for the officer at the lane, not a
 * classification: it explains an above-background reading, it does not excuse
 * one, and every elevated reading is still recorded and actioned.
 */

export const CARGO_CLASSES = ["Goods of Interest", "Food", "Other"] as const;
export type CargoClass = (typeof CARGO_CLASSES)[number];

export interface Commodity {
  /** Canonical name — what gets stored and tallied. */
  name: string;
  class: CargoClass;
  /** Commonly NORM-bearing, so an above-background reading is expected. */
  norm?: boolean;
  /** Shown under the name in the picker when the term needs explaining. */
  hint?: string;
}

/**
 * The canonical list, ordered so the most-scanned cargo sits at the top of the
 * picker. Frequencies are from the June 2026 Nakonde workbook (9,198 scans).
 */
export const COMMODITIES: Commodity[] = [
  // ----- Goods of Interest: the bulk of the traffic ------------------------
  {
    name: "IT",
    class: "Goods of Interest",
    hint: "Vehicle imports — the unit is identified by its chassis number",
  },
  { name: "Sulphur", class: "Goods of Interest", norm: true },
  { name: "Copper Anode", class: "Goods of Interest" },
  { name: "Copper Concentrate", class: "Goods of Interest", norm: true },
  { name: "Copper Cathode", class: "Goods of Interest" },
  { name: "Copper Ore", class: "Goods of Interest", norm: true },
  { name: "Copper", class: "Goods of Interest" },
  { name: "Manganese", class: "Goods of Interest", norm: true },
  { name: "Zinc", class: "Goods of Interest" },
  { name: "Zinc Concentrate", class: "Goods of Interest", norm: true },
  { name: "Magnesia", class: "Goods of Interest", norm: true },
  { name: "Cobalt Alloy", class: "Goods of Interest" },
  { name: "Anode Slag", class: "Goods of Interest", norm: true },
  { name: "Ore", class: "Goods of Interest", norm: true },
  { name: "Concentrate", class: "Goods of Interest", norm: true },

  // Machinery and rolling stock
  {
    name: "Self-Propelled Machinery",
    class: "Goods of Interest",
    hint: "Self-propelled work trucks and plant",
  },
  { name: "Machinery", class: "Goods of Interest" },
  { name: "Bulldozer", class: "Goods of Interest" },
  { name: "Excavator", class: "Goods of Interest" },
  { name: "Grinding Machine", class: "Goods of Interest" },
  { name: "Crushing Machine", class: "Goods of Interest" },
  { name: "Concrete Mixer", class: "Goods of Interest" },
  { name: "Road Roller", class: "Goods of Interest" },
  { name: "Wheel Loader", class: "Goods of Interest" },
  { name: "Backhoe Loader", class: "Goods of Interest" },
  { name: "Grader", class: "Goods of Interest" },
  { name: "Forklift", class: "Goods of Interest" },
  { name: "Crane", class: "Goods of Interest" },
  { name: "Combine Harvester", class: "Goods of Interest" },
  { name: "Plough", class: "Goods of Interest" },
  { name: "Trucks", class: "Goods of Interest" },
  { name: "Vehicles", class: "Goods of Interest" },

  // Ceramics, refractories and construction minerals — the usual NORM cargo
  { name: "Ceramic Tiles", class: "Goods of Interest", norm: true },
  { name: "Ceramics", class: "Goods of Interest", norm: true },
  { name: "Tiles", class: "Goods of Interest", norm: true },
  { name: "Porcelain", class: "Goods of Interest", norm: true },
  { name: "Refractory Bricks", class: "Goods of Interest", norm: true },
  { name: "Refractory Cement", class: "Goods of Interest", norm: true },
  { name: "Refractory Tiles", class: "Goods of Interest", norm: true },
  { name: "Silica Bricks", class: "Goods of Interest", norm: true },
  { name: "Prefabricated Buildings", class: "Goods of Interest" },
  { name: "Cement", class: "Goods of Interest", norm: true },
  { name: "Bricks", class: "Goods of Interest", norm: true },
  { name: "Gypsum", class: "Goods of Interest", norm: true },
  { name: "Natural Stones", class: "Goods of Interest", norm: true },
  { name: "Marble & Travertine", class: "Goods of Interest", norm: true },
  { name: "Quartz", class: "Goods of Interest", norm: true },
  { name: "Silica", class: "Goods of Interest", norm: true },
  { name: "Calcium Carbonate", class: "Goods of Interest" },
  { name: "Carbonate", class: "Goods of Interest" },
  { name: "Natural Graphite", class: "Goods of Interest" },
  { name: "Grinding Balls", class: "Goods of Interest" },

  // Chemicals and fertiliser
  { name: "Bitumen", class: "Goods of Interest" },
  { name: "Organo-Sulphur", class: "Goods of Interest" },
  { name: "Sodium Compounds", class: "Goods of Interest" },
  { name: "Sodium Sulphites", class: "Goods of Interest" },
  { name: "Sodium Sulphides", class: "Goods of Interest" },
  { name: "Sodium Silicate", class: "Goods of Interest" },
  { name: "Disodium Carbonate", class: "Goods of Interest" },
  { name: "Sodium Hydroxide", class: "Goods of Interest" },
  { name: "Ammonium Nitrate", class: "Goods of Interest" },
  { name: "Fertiliser", class: "Goods of Interest", norm: true },
  { name: "Ferro Alloy", class: "Goods of Interest" },
  { name: "Silico Manganese", class: "Goods of Interest", norm: true },
  { name: "Aluminium Silicate Fibre", class: "Goods of Interest" },
  { name: "Aluminium Chloride", class: "Goods of Interest" },
  { name: "Titanium Dioxide", class: "Goods of Interest", norm: true },
  { name: "Iron Oxide", class: "Goods of Interest" },
  { name: "Barium Sulphate", class: "Goods of Interest", norm: true },
  { name: "Barium Nitrate", class: "Goods of Interest" },
  { name: "Calcium Oxide", class: "Goods of Interest" },
  { name: "Water-Absorbing Polymer", class: "Goods of Interest" },
  { name: "Acid", class: "Goods of Interest" },
  { name: "Ethanol", class: "Goods of Interest" },
  {
    name: "X-Ray Generator",
    class: "Goods of Interest",
    hint: "Radiation-emitting device — check for an RPA import authorisation",
  },

  // ----- Food -------------------------------------------------------------
  { name: "Soya Beans", class: "Food" },
  { name: "Maize", class: "Food" },
  { name: "Maize Seed", class: "Food" },
  { name: "Millet", class: "Food" },
  { name: "Rice", class: "Food" },
  { name: "Wheat", class: "Food" },
  { name: "Groundnuts", class: "Food" },
  { name: "Beans", class: "Food" },
  { name: "Sugar", class: "Food" },
  { name: "Coffee", class: "Food" },
  { name: "Cooking Oil", class: "Food" },
  { name: "Margarine", class: "Food" },
  { name: "Chicken", class: "Food" },
  { name: "Meat", class: "Food" },
  { name: "Meat Offals", class: "Food" },
  { name: "Fish", class: "Food" },
  { name: "Tilapia", class: "Food" },
  { name: "Fruits", class: "Food" },
  { name: "Vegetables", class: "Food" },
  { name: "Alcohol", class: "Food" },

  // ----- Other ------------------------------------------------------------
  { name: "Empty", class: "Other", hint: "Empty trailer or container" },
  { name: "Tanker", class: "Other" },
  { name: "Taxi", class: "Other" },
  { name: "Private Vehicle", class: "Other" },
  { name: "Assorted Goods", class: "Other" },
  { name: "Pipes", class: "Other" },
  { name: "Flat Iron", class: "Other" },
  { name: "Articles of Iron", class: "Other" },
  { name: "Metals", class: "Other" },
  { name: "Tyres", class: "Other" },
  { name: "PVC", class: "Other" },
  { name: "Polyethylene", class: "Other" },
  { name: "Acrylic Polymers", class: "Other" },
  { name: "Carbon Dioxide", class: "Other" },
  { name: "Accumulators", class: "Other", hint: "Batteries" },
  { name: "Medicaments", class: "Other" },
  { name: "Dextrins", class: "Other" },
  { name: "Cutting Oil", class: "Other" },
  { name: "Crude Oil", class: "Other" },
  { name: "Cotton", class: "Other" },
  { name: "Clothing", class: "Other" },
  { name: "Building Materials", class: "Other" },
  { name: "Textiles", class: "Other" },
];

/**
 * Spellings seen in the workbooks, mapped onto the canonical name. Keys are
 * matched after `normaliseTerm`, so case, punctuation and spacing do not
 * matter here — only the letters.
 *
 * This exists for two jobs: the picker resolves what an officer types to the
 * name everyone else used, and the historical import folds a month of variant
 * spellings into one tally.
 */
export const COMMODITY_ALIASES: Record<string, string> = {
  // Sulphur — six spellings in one month
  SULPUR: "Sulphur",
  SULLPHUR: "Sulphur",
  SURLPHER: "Sulphur",
  SULPHUIR: "Sulphur",
  SULPHURT: "Sulphur",
  SULPHER: "Sulphur",
  SULPHITIES: "Sodium Sulphites",
  SULPHIDES: "Sodium Sulphides",

  // Copper family
  ANODE: "Copper Anode",
  ANODES: "Copper Anode",
  "COPPER ANODES": "Copper Anode",
  "COPPER ANOD": "Copper Anode",
  "ANODE SLUG": "Anode Slag",
  CATHODE: "Copper Cathode",
  "COPPER CONC": "Copper Concentrate",
  "COPPER C": "Copper Concentrate",
  "COPPER CON": "Copper Concentrate",
  "COBALT COPPER ALLOY": "Cobalt Alloy",
  "COLBALT ALLOY": "Cobalt Alloy",
  COBALT: "Cobalt Alloy",

  // Zinc / manganese / magnesia
  "ZINC CONC": "Zinc Concentrate",
  "ZINC CON": "Zinc Concentrate",
  "ZINC C": "Zinc Concentrate",
  ZXINC: "Zinc",
  MAGANESE: "Manganese",
  MANGENESE: "Manganese",
  MAGENESIA: "Magnesia",
  MANGESIA: "Magnesia",
  "FERRO SILLICO": "Ferro Alloy",
  FERRO: "Ferro Alloy",
  FERROUS: "Ferro Alloy",
  "SPONGY FEROUS": "Ferro Alloy",
  SILICO: "Silico Manganese",

  // Machinery
  "SELF PROPELLED": "Self-Propelled Machinery",
  "SELF PROPLLED": "Self-Propelled Machinery",
  "SELF PROPELLRD": "Self-Propelled Machinery",
  "SELF PROPELLED WORKTRUCK": "Self-Propelled Machinery",
  "WORK TRUCKS": "Self-Propelled Machinery",
  "WORKS TRUCKS": "Self-Propelled Machinery",
  MACHINE: "Machinery",
  "MAC HINE": "Machinery",
  MACHINES: "Machinery",
  "MACHINE ZM": "Machinery",
  "MACHINES EARTH": "Machinery",
  "EXCVSTING MACHINERY": "Excavator",
  EXCAVATORS: "Excavator",
  "USED EXCAVATOR": "Excavator",
  BULLDOZERS: "Bulldozer",
  BULDOZER: "Bulldozer",
  "GRINDING MACHINES": "Grinding Machine",
  "CRUSHING MACHINES": "Crushing Machine",
  "BORING MACHINE": "Machinery",
  FORKLIFTS: "Forklift",
  DERRICKS: "Crane",
  PLOUGHS: "Plough",
  TRUCK: "Trucks",
  "DUMP TRUCK": "Trucks",
  "MIXER LORRIES": "Concrete Mixer",

  // Ceramics, refractories, construction
  CERAMIC: "Ceramics",
  CEREMIC: "Ceramics",
  "CERAMIC BLOCKS": "Ceramics",
  "CERAMIC SINK": "Ceramics",
  "CERAMIC SINKS": "Ceramics",
  "REFRACTORY CERAMICS": "Ceramics",
  REFRACTORY: "Refractory Bricks",
  "REFRACTORY CEMENTS": "Refractory Cement",
  TILE: "Tiles",
  "TILES ZM": "Tiles",
  "PORCELAIN ARTICLES": "Porcelain",
  PREFABRICATED: "Prefabricated Buildings",
  "PREFABRICATED BUILDING": "Prefabricated Buildings",
  "PREFRICATED BUILDINGS": "Prefabricated Buildings",
  CEMET: "Cement",
  "PORTLAND CEMENT": "Cement",
  "WHITE PORTLAND CEMENT": "Cement",
  "GYPSUM BOARDS": "Gypsum",
  "BOARD OF PLASTER": "Gypsum",
  MARBLES: "Marble & Travertine",
  "MARBLE TRAVERTINE": "Marble & Travertine",
  "MARBLE TRAVRTINE": "Marble & Travertine",
  SILLICA: "Silica",
  SILICON: "Silica",
  "SILICON DIOXIDE": "Silica",
  BITUMINIOUS: "Bitumen",
  BITUMINOUS: "Bitumen",

  // Chemicals
  "ORGANO SULPHUR": "Organo-Sulphur",
  "ORGANO SULPBUR": "Organo-Sulphur",
  "ORGAN0 SULPHUR": "Organo-Sulphur",
  "ORGANO SULPHURCOMPOUNDS": "Organo-Sulphur",
  SODIUM: "Sodium Compounds",
  MONOSODIUM: "Sodium Compounds",
  "SODIUM AMYL": "Sodium Compounds",
  DISODIUM: "Disodium Carbonate",
  "SODIUM SILICATES": "Sodium Silicate",
  "SILICATES OF SODIUM": "Sodium Silicate",
  AMMONIUM: "Ammonium Nitrate",
  FERTILIZER: "Fertiliser",
  FERTILIZERS: "Fertiliser",
  FERTILISERS: "Fertiliser",
  "NPK FERTILIZER": "Fertiliser",
  "ALUMINUM SILICATE FIBER": "Aluminium Silicate Fibre",
  "ALUMINIUM SILICATE FIBER": "Aluminium Silicate Fibre",
  "TITANIUM DIOXIDES": "Titanium Dioxide",
  "IRON OXIDES": "Iron Oxide",
  "NATURAL BARIUM SULPHATE": "Barium Sulphate",
  "WATER ABSORPTION": "Water-Absorbing Polymer",
  "WATER ABSSORPTION": "Water-Absorbing Polymer",
  "WATER ABSORPTIPN": "Water-Absorbing Polymer",
  POLYTHYLENE: "Polyethylene",
  POLYMER: "Acrylic Polymers",
  POLYETHERS: "Acrylic Polymers",

  // Food
  SOYA: "Soya Beans",
  "SOYA BEAN": "Soya Beans",
  OFFALS: "Meat Offals",
  "MEAT OFFAL": "Meat Offals",

  // Other
  "FLAT IRON RODS": "Flat Iron",
  ASSORTED: "Assorted Goods",
  BATTERIES: "Accumulators",
};

/**
 * Values seen in a cargo column that are not cargo at all — a dose reading, a
 * transporter name or a chassis number typed one column across. They are never
 * offered as commodities and the importer counts them as unclassified rather
 * than inventing a commodity from them.
 */
const NON_CARGO = /^(?:\d+(?:[.,]\d+)?|[A-Z0-9]{2,}-\d{4,}|IR)$/;

/** Uppercase, strip punctuation and collapse whitespace — the match key. */
export function normaliseTerm(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9&]+/g, " ")
    .replace(/\s*&\s*/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const BY_KEY = new Map<string, Commodity>();
for (const c of COMMODITIES) BY_KEY.set(normaliseTerm(c.name), c);

export interface ResolvedCommodity {
  /** Canonical name if known, otherwise the officer's text, tidied. */
  name: string;
  class: CargoClass;
  norm: boolean;
  /** False when the term is not in the vocabulary (a new commodity). */
  known: boolean;
  /** True when an alias or spelling correction was applied. */
  corrected: boolean;
}

/**
 * Resolve free text to a canonical commodity. Unknown terms come back
 * title-cased and unknown — deliberately: an officer is never blocked from
 * recording what is actually on the truck, and the day summary lists what was
 * new so the vocabulary can be extended on purpose.
 */
export function resolveCommodity(
  raw: string,
  fallbackClass: CargoClass = "Other",
): ResolvedCommodity | null {
  const key = normaliseTerm(raw);
  // NON_CARGO is tested before normalisation, which strips the punctuation
  // ("80.0" → "80 0") that makes a stray dose reading recognisable.
  const tidied = String(raw ?? "").toUpperCase().trim().replace(/\s+/g, " ");
  if (!key || NON_CARGO.test(tidied)) return null;

  const direct = BY_KEY.get(key);
  if (direct) {
    return {
      name: direct.name,
      class: direct.class,
      norm: !!direct.norm,
      known: true,
      corrected: normaliseTerm(raw) !== normaliseTerm(direct.name),
    };
  }

  const aliased = COMMODITY_ALIASES[key];
  if (aliased) {
    const c = BY_KEY.get(normaliseTerm(aliased));
    if (c) {
      return {
        name: c.name,
        class: c.class,
        norm: !!c.norm,
        known: true,
        corrected: true,
      };
    }
  }

  return {
    name: titleCase(key),
    class: fallbackClass,
    norm: false,
    known: false,
    corrected: false,
  };
}

function titleCase(key: string): string {
  return key
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(" ");
}

/** The vocabulary of one class, in picker order. */
export function commoditiesForClass(cls: CargoClass): Commodity[] {
  return COMMODITIES.filter((c) => c.class === cls);
}

/**
 * Type-ahead over the whole vocabulary: exact, then prefix, then substring, so
 * "sul" offers Sulphur before Organo-Sulphur and Barium Sulphate. Aliases match
 * too, so typing the old misspelling still lands on the canonical name.
 */
export function searchCommodities(query: string, limit = 8): Commodity[] {
  const q = normaliseTerm(query);
  if (!q) return COMMODITIES.slice(0, limit);

  const exact: Commodity[] = [];
  const prefix: Commodity[] = [];
  const contains: Commodity[] = [];
  for (const c of COMMODITIES) {
    const key = normaliseTerm(c.name);
    if (key === q) exact.push(c);
    else if (key.startsWith(q)) prefix.push(c);
    else if (key.includes(q)) contains.push(c);
  }

  const out = [...exact, ...prefix, ...contains];
  if (out.length < limit) {
    // Fall back to the alias table so an old spelling still finds its home.
    for (const [alias, canonical] of Object.entries(COMMODITY_ALIASES)) {
      if (!alias.includes(q)) continue;
      const c = BY_KEY.get(normaliseTerm(canonical));
      if (c && !out.includes(c)) out.push(c);
    }
  }
  return out.slice(0, limit);
}

/**
 * Transporter / declarant names seen most often at the northern posts, seeded
 * so the picker is useful on day one. The live list is built from what the post
 * has actually logged — see `knownTransporters` in borderScans.ts — and this is
 * only the starting point.
 *
 * Deliberately NOT alias-collapsed: "ANK" and "ANK HEAVENLY", "SM" and "SM
 * BURHANI", "SPOT ON" and "SPOT ON CARGO" may well be different firms, and
 * merging two real companies is a worse error than carrying both. The picker
 * shows near-matches so officers converge on one spelling, and the day summary
 * flags names that look like duplicates for a human to settle.
 */
export const SEED_TRANSPORTERS: string[] = [
  "Busokelo",
  "Zawadi",
  "CBBS",
  "Prisha",
  "KOJ",
  "Cargo Management",
  "EMB",
  "ANK Heavenly",
  "SM Burhani",
  "Allmol",
  "Datso",
  "Racjose",
  "Johmuss",
  "ANK",
  "Rutmos",
  "Rider",
  "Stesim",
  "Nector",
  "Barthsam",
  "Muwamu",
  "Ultimate",
  "Smartlog",
  "Access",
  "MJS",
  "Swiza",
  "Rehoboth",
  "Divine",
  "Jamadas",
  "Connex Africa",
  "Kartrock",
  "Charipe",
  "Free Simba",
  "Impala",
  "Simplified",
  "Spot On Cargo",
  "SLS",
  "Grotech",
  "Kingstar",
  "Keda",
  "Mircape",
  "Gezich",
  "Honam",
  "Intake",
  "Kuweza",
  "CML",
  "Idol",
  "EMD",
  "AGL",
  "Bertkan",
  "Eastgate",
  "Reign Freight",
  "Principal",
  "Inara",
  "Dumezweni",
  "Next Star",
  "Demands",
  "Vintamel",
  "Chavit",
  "Mimshack",
  "Transtra",
  "Thin Line",
  "Beltex",
  "Beprecious",
  "J.N.S",
  "Beyadah",
  "Janack",
  "Dansil",
  "Hillbay",
  "Pokela",
  "Levite",
  "Mpebes",
  "Fenko Investment",
  "Companion",
  "Flopel",
  "Vinelove",
  "Chalen",
  "Ntasu",
  "Simpex Cargo",
  "Charomaps",
  "Reload",
  "Langsons",
  "Freight House",
  "C.Steinweg",
  "Triangular Gates",
  "Stenel Express",
  "Antclans",
  "Wings of the World",
];

/** Spelling corrections for transporter names seen in the workbooks. */
export const TRANSPORTER_ALIASES: Record<string, string> = {
  BUSEKELO: "Busokelo",
  JOHNMUSS: "Johmuss",
  MIRACAPE: "Mircape",
  BERKAN: "Bertkan",
  VINLOVE: "Vinelove",
  CONNEXAFRICA: "Connex Africa",
  CHALLEN: "Chalen",
};

/** Apply the transporter spelling corrections; otherwise keep what was typed. */
export function resolveTransporter(raw: string): string {
  const trimmed = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const key = normaliseTerm(trimmed);
  const fixed = TRANSPORTER_ALIASES[key];
  if (fixed) return fixed;
  const seeded = SEED_TRANSPORTERS.find((t) => normaliseTerm(t) === key);
  return seeded || trimmed;
}
