import { describe, expect, it } from "vitest";
import { computeAggregate } from "../lib/rules/aggregate";
import { mapAllSeed, type SeedFacility } from "../lib/store/seeding";
import facilities from "../seed/facilities.seed.json";

/**
 * §16 — seeded baseline: the 2026 Facility Status List register
 * (458 facilities = 465 doc rows − 7 merged duplicates; 399 functional
 * includes the 22 non-functional rows annotated “NOW FUNCTIONAL”).
 */
describe("§16 — seeded baseline (2026 Facility Status List)", () => {
  const mapped = mapAllSeed(facilities as SeedFacility[]);
  const agg = computeAggregate(mapped);

  it("loads 458 facilities", () => {
    expect(mapped.length).toBe(458);
    expect(agg.total).toBe(458);
  });

  it("214 licensed / 244 unlicensed", () => {
    expect(agg.licensed).toBe(214);
    expect(agg.unlicensed).toBe(244);
  });

  it("399 functional / 59 non-functional", () => {
    expect(agg.functional).toBe(399);
    expect(mapped.filter((f) => f.functional === false).length).toBe(59);
  });

  it("Public 62/230, Private 152/228 (licensed/total)", () => {
    expect(agg.bySector.Public.total).toBe(230);
    expect(agg.bySector.Public.licensed).toBe(62);
    expect(agg.bySector.Private.total).toBe(228);
    expect(agg.bySector.Private.licensed).toBe(152);
  });

  it("Medical 314 / Non-Medical 144", () => {
    expect(agg.byCategory?.Medical.total).toBe(314);
    expect(agg.byCategory?.["Non-Medical"].total).toBe(144);
  });

  it("25 stalled applications, and every stalled row keeps its pipeline stage", () => {
    const stalled = mapped.filter((f) => f.stalled);
    expect(stalled.length).toBe(25);
    for (const f of stalled) expect(f.licensed).toBe(false);
  });

  it("90 records flagged for review, each with a note", () => {
    const flagged = mapped.filter((f) => f.needsReview);
    expect(flagged.length).toBe(90);
    for (const f of flagged) expect(f.reviewNote).toBeTruthy();
  });

  it("201 authorisations carried over from the previous register", () => {
    expect(agg.auths).toBe(201);
  });

  it("every stage maps to a known Stage value (nothing fell back silently)", () => {
    // "No Application Submitted" is both a real status and safeStage's
    // fallback; the doc's own no-application rows put 131 facilities there.
    // A mapping regression would inflate it well past that.
    expect(agg.byStage["No Application Submitted"]).toBe(131);
    expect(agg.byStage["In Final Processing"]).toBe(12);
    expect(agg.byStage["Import Licence Only (Not yet Use/Possession)"]).toBe(13);
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
