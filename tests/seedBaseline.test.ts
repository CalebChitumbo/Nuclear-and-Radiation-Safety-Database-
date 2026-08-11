import { describe, expect, it } from "vitest";
import { computeAggregate } from "../lib/rules/aggregate";
import { computeLicenceStats } from "../lib/rules/licenceStats";
import { mapAllSeed, type SeedFacility } from "../lib/store/seeding";
import { isUseP } from "../lib/rules/types";
import facilities from "../seed/facilities.seed.json";

/**
 * §16 — seeded baseline: the 2026 Licensing Status workbook register
 * (538 facilities = the workbook's 515 rows + 23 previous-register rows the
 * workbook does not carry, kept and flagged for review). See
 * docs/licensing-status-2026-import.md.
 */
describe("§16 — seeded baseline (2026 Licensing Status workbook)", () => {
  const mapped = mapAllSeed(facilities as SeedFacility[]);
  const agg = computeAggregate(mapped);

  it("loads 538 facilities", () => {
    expect(mapped.length).toBe(538);
    expect(agg.total).toBe(538);
  });

  it("212 licensed / 326 unlicensed", () => {
    expect(agg.licensed).toBe(212);
    expect(agg.unlicensed).toBe(326);
  });

  it("405 functional / 133 non-functional", () => {
    expect(agg.functional).toBe(405);
    expect(mapped.filter((f) => f.functional === false).length).toBe(133);
  });

  it("Public 65/250, Private 147/288 (licensed/total)", () => {
    expect(agg.bySector.Public.total).toBe(250);
    expect(agg.bySector.Public.licensed).toBe(65);
    expect(agg.bySector.Private.total).toBe(288);
    expect(agg.bySector.Private.licensed).toBe(147);
  });

  it("Medical 350 / Non-Medical 188", () => {
    expect(agg.byCategory?.Medical.total).toBe(350);
    expect(agg.byCategory?.["Non-Medical"].total).toBe(188);
  });

  it("23 stalled applications, and every stalled row keeps its pipeline stage", () => {
    const stalled = mapped.filter((f) => f.stalled);
    expect(stalled.length).toBe(23);
    for (const f of stalled) expect(f.licensed).toBe(false);
  });

  it("166 records flagged for review, each with a note", () => {
    const flagged = mapped.filter((f) => f.needsReview);
    expect(flagged.length).toBe(166);
    for (const f of flagged) expect(f.reviewNote).toBeTruthy();
  });

  it("332 authorisations on record", () => {
    expect(agg.auths).toBe(332);
  });

  it("every stage maps to a known Stage value (nothing fell back silently)", () => {
    // "No Application Submitted" is both a real status and safeStage's
    // fallback; a mapping regression would inflate it well past the register's
    // own count.
    expect(agg.byStage["No Application Submitted"]).toBe(213);
    expect(agg.byStage["Waiting for Payment"]).toBe(53);
    expect(agg.byStage["Import Licence Only (Not yet Use/Possession)"]).toBe(12);
    // The 13 facilities the previous register showed licensed and the
    // workbook leaves blank.
    expect(agg.byStage["Licence Expiring (Renewal Due)"]).toBe(13);
  });

  it("every licensed facility carries at least one licence", () => {
    const offenders = mapped.filter(
      (f) => f.licensed && (f.auths || []).length === 0,
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * The licence counts the workbook's own "Totals" sheet reports for 2026 —
 * 327 licences across eight types. The five further authorisations are the
 * ones the carried-over facilities already held (no quarter on those).
 */
describe("§16 — licences issued (2026 Licensing Status workbook)", () => {
  const mapped = mapAllSeed(facilities as SeedFacility[]);
  const stats = computeLicenceStats(mapped, 2026);
  const workbook = mapped
    .flatMap((f) => f.auths || [])
    .filter((a) => (a.quarter || "").startsWith("2026-"));

  it("327 licences issued in 2026, 5 carried over from the previous register", () => {
    expect(workbook.length).toBe(327);
    expect(stats.totalIssued).toBe(332);
  });

  it("matches the workbook's Totals sheet, type by type", () => {
    const count = (type: string) =>
      workbook.filter((a) => a.type === type).length;
    expect(workbook.filter((a) => isUseP(a.type)).length).toBe(225);
    expect(count("Importation Licence")).toBe(73);
    expect(count("Variation of Terms and Conditions")).toBe(15);
    expect(count("Decommissioning Licence")).toBe(5);
    expect(count("Export Licence")).toBe(3);
    expect(count("Transit Licence")).toBe(3);
    expect(count("Transfer Licence")).toBe(2);
    expect(count("Transport Licence")).toBe(1);
  });

  it("splits by quarter of issue: Q1 178, Q2 139, Q3 10", () => {
    const byQuarter = (q: string) =>
      workbook.filter((a) => a.quarter === q).length;
    expect(byQuarter("2026-Q1")).toBe(178);
    expect(byQuarter("2026-Q2")).toBe(139);
    expect(byQuarter("2026-Q3")).toBe(10);
  });

  it("counts quarter-dated use licences as current for 2026", () => {
    // The workbook dates licences by quarter, not by day; licensedThisYear
    // reads the quarter's year (authYear) so these are not "unconfirmed".
    expect(stats.licensedThisYear).toBe(207);
    expect(stats.licensedYearUnconfirmed).toBe(5);
    expect(stats.licensedTotal).toBe(212);
  });
});
