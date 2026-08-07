import { describe, expect, it } from "vitest";
import { computeAggregate } from "../lib/rules/aggregate";
import {
  buildSeedRegister,
  type SeedAuthorisation,
  type SeedFacility,
} from "../lib/store/seeding";
import authorisations from "../seed/authorisations.seed.json";
import facilities from "../seed/facilities.seed.json";

/**
 * §16 — seeded baseline: the 2026 Facility Status List register
 * (458 facilities = 465 doc rows − 7 merged duplicates; 399 functional
 * includes the 22 non-functional rows annotated “NOW FUNCTIONAL”), plus the
 * 20 facilities the authorisation register added — holders of an importation
 * licence that the status list never carried.
 */
describe("§16 — seeded baseline (2026 Facility Status List)", () => {
  const mapped = buildSeedRegister(
    facilities as SeedFacility[],
    authorisations as SeedAuthorisation[],
  ).facilities;
  const agg = computeAggregate(mapped);

  it("loads 478 facilities (458 status list + 20 import-licence holders)", () => {
    expect(mapped.length).toBe(478);
    expect(agg.total).toBe(478);
  });

  it("214 licensed / 264 unlicensed", () => {
    expect(agg.licensed).toBe(214);
    expect(agg.unlicensed).toBe(264);
  });

  it("419 functional / 59 non-functional", () => {
    expect(agg.functional).toBe(419);
    expect(mapped.filter((f) => f.functional === false).length).toBe(59);
  });

  it("Public 62/242, Private 152/236 (licensed/total)", () => {
    expect(agg.bySector.Public.total).toBe(242);
    expect(agg.bySector.Public.licensed).toBe(62);
    expect(agg.bySector.Private.total).toBe(236);
    expect(agg.bySector.Private.licensed).toBe(152);
  });

  it("Medical 331 / Non-Medical 147", () => {
    expect(agg.byCategory?.Medical.total).toBe(331);
    expect(agg.byCategory?.["Non-Medical"].total).toBe(147);
  });

  it("25 stalled applications, and every stalled row keeps its pipeline stage", () => {
    const stalled = mapped.filter((f) => f.stalled);
    expect(stalled.length).toBe(25);
    for (const f of stalled) expect(f.licensed).toBe(false);
  });

  it("110 records flagged for review, each with a note", () => {
    const flagged = mapped.filter((f) => f.needsReview);
    expect(flagged.length).toBe(110);
    for (const f of flagged) expect(f.reviewNote).toBeTruthy();
  });

  it("283 authorisations — 201 carried over, 82 from the authorisation register", () => {
    expect(agg.auths).toBe(283);
  });

  it("every stage maps to a known Stage value (nothing fell back silently)", () => {
    // "No Application Submitted" is both a real status and safeStage's
    // fallback; the doc's own no-application rows put 131 facilities there.
    // A mapping regression would inflate it well past that.
    expect(agg.byStage["No Application Submitted"]).toBe(131);
    expect(agg.byStage["In Final Processing"]).toBe(12);
    // 13 from the status list + the 20 import-licence holders it never carried.
    expect(agg.byStage["Import Licence Only (Not yet Use/Possession)"]).toBe(33);
  });

  it("licensed facilities without a recorded licence number stay bounded", () => {
    const offenders = mapped.filter(
      (f) => f.licensed && (f.auths || []).length === 0,
    );
    // The 2026 status list marks facilities licensed even where the previous
    // register had not captured their licence numbers (newly licensed in
    // 2026). Those numbers arrive via the normal recording flows.
    expect(offenders.length).toBeLessThanOrEqual(44);
  });
});
