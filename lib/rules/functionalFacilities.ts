/**
 * The functional-facilities view of the licensing register.
 *
 * The Overview's pipeline counts the whole register — 541 facilities at the
 * September 2026 meeting, non-functional ones included. Management wanted the
 * same breakdown for the facilities that are actually operating (404 that day),
 * split public / private, with the stages named the way the meeting named them
 * (licensed · no application submitted · application submitted · awaiting
 * payment · …) rather than RAIS's twenty, and with the private functional
 * facilities that hold no licence listed by name.
 *
 * Everything is derived from the register the app already loads, plus the
 * inspection register for the enforcement standing (`enforcementStatus.ts`),
 * so nothing here is stored and nothing needs re-seeding when a facility's
 * operating status or stage changes.
 */
import {
  enforcementByFacility,
  standingLabel,
  type FacilityEnforcement,
} from "./enforcementStatus";
import {
  SECTORS,
  STAGES,
  type Facility,
  type Inspection,
  type Sector,
  type Stage,
} from "./types";
import type { CellValue, WorkbookSheet } from "./xlsx";

/** A facility is functional unless the register says it is not. */
export function isFunctional(f: Pick<Facility, "functional">): boolean {
  return f.functional !== false;
}

/**
 * Management's stages. Every RAIS stage folds into exactly one of these — the
 * test checks the cover — and the order is the order the pipeline runs in.
 */
export const LICENSING_BUCKETS = [
  { key: "licensed", label: "Licensed", stages: ["Licensed"] },
  {
    key: "no-application",
    label: "No application submitted",
    stages: ["No Application Submitted"],
  },
  {
    key: "application-submitted",
    label: "Application submitted",
    stages: ["Draft Application", "Application Submitted"],
  },
  {
    key: "awaiting-payment",
    label: "Awaiting payment",
    stages: [
      "Invoice Generation Pending",
      "Waiting for Payment",
      "Accounts Clearance Pending",
    ],
  },
  {
    key: "under-review",
    label: "Under review and assessment",
    stages: [
      "Waiting for Review and Assessment",
      "Under Review and Assessment",
      "Under Internal Review (Further Information Required)",
      "Inspection in Progress",
      "Application Returned / Rejected",
    ],
  },
  {
    key: "awaiting-approval",
    label: "Approval and issue in progress",
    stages: [
      "Authorization Terms Issued",
      "CEO Licence Approval Required",
      "Board Licence Approval Required",
      "In Final Processing",
      "Licence / Certificate Issued",
    ],
  },
  {
    key: "renewal-due",
    label: "Licence expiring (renewal due)",
    stages: ["Licence Expiring (Renewal Due)"],
  },
  {
    key: "import-only",
    label: "Import licence only",
    stages: ["Import Licence Only (Not yet Use/Possession)"],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  stages: readonly Stage[];
}>;

export type LicensingBucketKey = (typeof LICENSING_BUCKETS)[number]["key"];

const BUCKET_OF_STAGE = new Map<Stage, LicensingBucketKey>();
for (const b of LICENSING_BUCKETS) {
  for (const s of b.stages) BUCKET_OF_STAGE.set(s, b.key);
}

/** The bucket a facility reports under: licensed, else by its stage. */
export function licensingBucket(
  f: Pick<Facility, "licensed" | "stage">,
): LicensingBucketKey {
  if (f.licensed) return "licensed";
  return BUCKET_OF_STAGE.get(f.stage) ?? "no-application";
}

export function bucketLabel(key: LicensingBucketKey): string {
  return LICENSING_BUCKETS.find((b) => b.key === key)?.label ?? key;
}

/** Stages the bucket table does not know — should always be empty. */
export function unbucketedStages(): Stage[] {
  return STAGES.filter((s) => !BUCKET_OF_STAGE.has(s));
}

export interface BucketCount {
  key: LicensingBucketKey;
  label: string;
  total: number;
  /** The RAIS stages inside the bucket that have facilities in them. */
  stages: Array<{ stage: Stage; total: number }>;
}

/**
 * Why a "no application submitted" facility is where it is. Management's
 * point: a suspended or closed practice is not simply "no application".
 */
export interface NoApplicationSplit {
  total: number;
  /** Practice suspended, device seized, or licence suspended / cancelled. */
  restricted: number;
  /** A written warning or enforcement notice served. */
  notice: number;
  /** Only an engagement (facility / district / provincial level) on record. */
  engagement: number;
  /** Nothing on the inspection register explains it. */
  unexplained: number;
}

/** One unlicensed functional facility, with its standing. */
export interface FacilityStanding {
  facility: Facility;
  bucket: LicensingBucketKey;
  enforcement?: FacilityEnforcement;
  /** Stage, qualified by the latest enforcement action — see standingLabel. */
  standing: string;
}

export interface SectorView {
  sector: Sector;
  total: number;
  licensed: number;
  unlicensed: number;
  buckets: BucketCount[];
  noApplication: NoApplicationSplit;
  /** The unlicensed functional facilities of this sector, province then name. */
  rows: FacilityStanding[];
}

export interface FunctionalDashboard {
  registerTotal: number;
  functional: number;
  nonFunctional: number;
  licensed: number;
  unlicensed: number;
  /** Licensed as a percentage of functional. */
  coverage: number;
  buckets: BucketCount[];
  noApplication: NoApplicationSplit;
  sectors: Record<Sector, SectorView>;
  /** Every unlicensed functional facility, sector, province then name. */
  rows: FacilityStanding[];
}

function emptyBuckets(): Map<LicensingBucketKey, BucketCount> {
  const m = new Map<LicensingBucketKey, BucketCount>();
  for (const b of LICENSING_BUCKETS) {
    m.set(b.key, { key: b.key, label: b.label, total: 0, stages: [] });
  }
  return m;
}

function countBucket(
  buckets: Map<LicensingBucketKey, BucketCount>,
  key: LicensingBucketKey,
  stage: Stage,
): void {
  const b = buckets.get(key)!;
  b.total += 1;
  const s = b.stages.find((x) => x.stage === stage);
  if (s) s.total += 1;
  else b.stages.push({ stage, total: 1 });
}

function finishBuckets(buckets: Map<LicensingBucketKey, BucketCount>): BucketCount[] {
  return [...buckets.values()].map((b) => ({
    ...b,
    stages: [...b.stages].sort((x, y) => y.total - x.total),
  }));
}

function emptySplit(): NoApplicationSplit {
  return { total: 0, restricted: 0, notice: 0, engagement: 0, unexplained: 0 };
}

function countSplit(split: NoApplicationSplit, e: FacilityEnforcement | undefined): void {
  split.total += 1;
  if (!e) split.unexplained += 1;
  else if (e.severity === "restricted") split.restricted += 1;
  else if (e.severity === "notice") split.notice += 1;
  else split.engagement += 1;
}

const SECTOR_RANK = new Map<string, number>(SECTORS.map((s, i) => [s, i]));

function byPlace(a: FacilityStanding, b: FacilityStanding): number {
  return (
    (SECTOR_RANK.get(a.facility.sector) ?? 9) - (SECTOR_RANK.get(b.facility.sector) ?? 9) ||
    a.facility.province.localeCompare(b.facility.province) ||
    a.facility.name.localeCompare(b.facility.name)
  );
}

/** Derive the whole view from the two registers. */
export function deriveFunctionalDashboard(
  facilities: Facility[],
  inspections: Inspection[],
): FunctionalDashboard {
  const enforcement = enforcementByFacility(inspections, facilities);
  const allBuckets = emptyBuckets();
  const allSplit = emptySplit();
  const sectors = {} as Record<Sector, SectorView>;
  const sectorBuckets = {} as Record<Sector, Map<LicensingBucketKey, BucketCount>>;
  for (const s of SECTORS) {
    sectorBuckets[s] = emptyBuckets();
    sectors[s] = {
      sector: s,
      total: 0,
      licensed: 0,
      unlicensed: 0,
      buckets: [],
      noApplication: emptySplit(),
      rows: [],
    };
  }

  let functional = 0;
  let licensed = 0;
  const rows: FacilityStanding[] = [];

  for (const f of facilities) {
    if (!isFunctional(f)) continue;
    functional += 1;
    const sector: Sector = f.sector === "Public" ? "Public" : "Private";
    const view = sectors[sector];
    view.total += 1;
    const bucket = licensingBucket(f);
    countBucket(allBuckets, bucket, f.licensed ? "Licensed" : f.stage);
    countBucket(sectorBuckets[sector], bucket, f.licensed ? "Licensed" : f.stage);

    if (f.licensed) {
      licensed += 1;
      view.licensed += 1;
      continue;
    }
    view.unlicensed += 1;
    const e = enforcement.get(f.id);
    const row: FacilityStanding = {
      facility: f,
      bucket,
      enforcement: e,
      standing: standingLabel(f, e),
    };
    rows.push(row);
    view.rows.push(row);
    if (bucket === "no-application") {
      countSplit(allSplit, e);
      countSplit(view.noApplication, e);
    }
  }

  for (const s of SECTORS) {
    sectors[s].buckets = finishBuckets(sectorBuckets[s]);
    sectors[s].rows.sort(byPlace);
  }
  rows.sort(byPlace);

  return {
    registerTotal: facilities.length,
    functional,
    nonFunctional: facilities.length - functional,
    licensed,
    unlicensed: functional - licensed,
    coverage: functional ? (licensed / functional) * 100 : 0,
    buckets: finishBuckets(allBuckets),
    noApplication: allSplit,
    sectors,
    rows,
  };
}

/** The list Management asked for, as a sheet (or CSV rows) — one facility per line. */
export const STANDING_COLUMNS = [
  "Facility",
  "FAC Code",
  "Sector",
  "Category",
  "Province",
  "District",
  "Practice",
  "Licensing stage",
  "RAIS status",
  "Latest enforcement action",
  "Action date",
  "Standing",
] as const;

export function standingRows(rows: FacilityStanding[]): CellValue[][] {
  return rows.map((r) => [
    r.facility.name,
    r.facility.facCode || "",
    r.facility.sector,
    r.facility.category === "Non-Medical" ? "Non-Medical" : "Medical",
    r.facility.province,
    r.facility.district || "",
    r.facility.practice || "",
    bucketLabel(r.bucket),
    r.facility.currentStatus || r.facility.stage,
    r.enforcement?.action || "",
    r.enforcement?.date || "",
    r.standing,
  ]);
}

/**
 * The workbook for the meeting: the functional breakdown by sector, then the
 * unlicensed lists — private first, because that is the one Management asked
 * for by name.
 */
export function functionalWorkbook(d: FunctionalDashboard): WorkbookSheet[] {
  const breakdown: CellValue[][] = [
    ["Stage", "Public", "Private", "Functional total"],
    ...LICENSING_BUCKETS.map((b) => [
      b.label,
      d.sectors.Public.buckets.find((x) => x.key === b.key)?.total || 0,
      d.sectors.Private.buckets.find((x) => x.key === b.key)?.total || 0,
      d.buckets.find((x) => x.key === b.key)?.total || 0,
    ]),
    ["Total functional", d.sectors.Public.total, d.sectors.Private.total, d.functional],
    [],
    ["No application submitted — why", "Public", "Private", "Functional total"],
    [
      "Restricted (suspended / seized / cancelled)",
      d.sectors.Public.noApplication.restricted,
      d.sectors.Private.noApplication.restricted,
      d.noApplication.restricted,
    ],
    [
      "Notice served",
      d.sectors.Public.noApplication.notice,
      d.sectors.Private.noApplication.notice,
      d.noApplication.notice,
    ],
    [
      "Engagement only",
      d.sectors.Public.noApplication.engagement,
      d.sectors.Private.noApplication.engagement,
      d.noApplication.engagement,
    ],
    [
      "No action recorded",
      d.sectors.Public.noApplication.unexplained,
      d.sectors.Private.noApplication.unexplained,
      d.noApplication.unexplained,
    ],
    [],
    ["Register total", d.registerTotal],
    ["Non-functional (excluded)", d.nonFunctional],
  ];
  return [
    { name: "Functional breakdown", rows: breakdown },
    {
      name: "Private unlicensed",
      rows: [[...STANDING_COLUMNS], ...standingRows(d.sectors.Private.rows)],
    },
    {
      name: "Public unlicensed",
      rows: [[...STANDING_COLUMNS], ...standingRows(d.sectors.Public.rows)],
    },
  ];
}
