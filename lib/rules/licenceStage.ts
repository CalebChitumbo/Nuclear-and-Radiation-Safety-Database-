import { isUseP, type Facility, type Stage } from "./types";

/**
 * Where a facility stands on the road to a Use/Possession licence, read off
 * what it holds — the Director's question "who has only ever been given an
 * import licence and never come back for Use/Possession?".
 *
 * The register's `stage` cannot answer it alone. The Licensing Status import
 * records an import licence as an authorisation the facility holds and leaves
 * the stage at wherever its Use/Possession application sits ("No Application
 * Submitted", "Waiting for Payment" …): in the Sep 2026 seed 41 unlicensed
 * facilities hold an import licence and no Use/Possession licence, and only one
 * of them carries the "Import Licence Only" stage. The other 11 facilities on
 * that stage have no import licence on record — the workbook flagged them
 * import-only without listing the licence. Both are import-only here; which
 * evidence put a facility there is `importOnlyBasis`.
 *
 * Pure and framework-free, like the rest of lib/rules.
 */

/** The register stage the workbook gives an import-only facility. */
export const IMPORT_ONLY_STAGE: Stage = "Import Licence Only (Not yet Use/Possession)";

export const LICENCE_STAGES = [
  "use-possession",
  "import-only",
  "other-only",
  "in-application",
  "no-application",
] as const;
export type LicenceStage = (typeof LICENCE_STAGES)[number];

export const LICENCE_STAGE_META: Record<
  LicenceStage,
  { label: string; hint: string }
> = {
  "use-possession": {
    label: "Use/Possession licence",
    hint: "Licensed — holds a current Use/Possession licence",
  },
  "import-only": {
    label: "Import licence only",
    hint: "Holds an import licence (or the register marks it import-only) and no Use/Possession licence",
  },
  "other-only": {
    label: "Other authorisation only",
    hint: "Holds a transfer, export, transport or other standalone authorisation, but no import and no Use/Possession licence",
  },
  "in-application": {
    label: "Application in progress",
    hint: "Unlicensed, no authorisation held, with a Use/Possession application somewhere in the pipeline",
  },
  "no-application": {
    label: "No application",
    hint: "Unlicensed, no authorisation held and no application on record",
  },
};

type StageFacts = Pick<Facility, "licensed" | "stage" | "auths">;

function holdsUseP(f: StageFacts): boolean {
  return (f.auths || []).some((a) => isUseP(a.type));
}

function holdsImport(f: StageFacts): boolean {
  return (f.auths || []).some((a) => a.type === "Importation Licence");
}

/**
 * Why an import-only facility is import-only: it holds an import licence on
 * record ("licence"), or only the register's stage says so ("register").
 * Null for a facility that is not import-only.
 */
export function importOnlyBasis(f: StageFacts): "licence" | "register" | null {
  if (f.licensed || holdsUseP(f)) return null;
  if (holdsImport(f)) return "licence";
  if (f.stage === IMPORT_ONLY_STAGE) return "register";
  return null;
}

/**
 * The one licence stage a facility is in. Checked in this order, so each
 * facility lands in exactly one:
 *
 *   1. licensed → Use/Possession licence
 *   2. no Use/Possession licence on record, and an import licence on record or
 *      the import-only stage → Import licence only
 *   3. no Use/Possession licence, some other standalone authorisation →
 *      Other authorisation only
 *   4. an application stage → Application in progress
 *   5. otherwise → No application
 *
 * A facility whose Use/Possession licence has lapsed (unlicensed, an old
 * Use/Possession licence still on record) has progressed past import-only, so
 * it falls to 4 or 5 by its stage.
 */
export function licenceStageOf(f: StageFacts): LicenceStage {
  if (f.licensed) return "use-possession";
  const useP = holdsUseP(f);
  if (!useP && importOnlyBasis(f)) return "import-only";
  if (!useP && (f.auths || []).length > 0) return "other-only";
  if (
    f.stage &&
    f.stage !== "No Application Submitted" &&
    f.stage !== "Licensed" &&
    f.stage !== IMPORT_ONLY_STAGE
  ) {
    return "in-application";
  }
  return "no-application";
}

/** How many facilities are in each licence stage. */
export function countLicenceStages(
  facilities: StageFacts[],
): Record<LicenceStage, number> {
  const out = Object.fromEntries(LICENCE_STAGES.map((s) => [s, 0])) as Record<
    LicenceStage,
    number
  >;
  for (const f of facilities) out[licenceStageOf(f)] += 1;
  return out;
}

/** A `?licstage=` value read back, or "" when it names no stage. */
export function parseLicenceStage(v: string | null | undefined): LicenceStage | "" {
  return (LICENCE_STAGES as readonly string[]).includes(v || "")
    ? (v as LicenceStage)
    : "";
}
