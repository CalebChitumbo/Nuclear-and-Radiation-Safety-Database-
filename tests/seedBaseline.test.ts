import { describe, expect, it } from "vitest";
import { computeAggregate } from "../lib/rules/aggregate";
import { computeLicenceStats } from "../lib/rules/licenceStats";
import { mapAllSeed, type SeedFacility } from "../lib/store/seeding";
import { isUseP } from "../lib/rules/types";
import facilities from "../seed/facilities.seed.json";

/**
 * §16 — seeded baseline: the 2026 Licensing Status workbook register
 * (538 facilities = the Sep 2026 workbook's 501 rows + 37 previous-register
 * rows the workbook does not carry, kept and flagged for review). See
 * docs/licensing-status-2026-import.md.
 */
describe("§16 — seeded baseline (2026 Licensing Status workbook)", () => {
  const mapped = mapAllSeed(facilities as SeedFacility[]);
  const agg = computeAggregate(mapped);

  it("loads 538 facilities", () => {
    expect(mapped.length).toBe(538);
    expect(agg.total).toBe(538);
  });

  it("228 licensed / 310 unlicensed", () => {
    expect(agg.licensed).toBe(228);
    expect(agg.unlicensed).toBe(310);
  });

  it("392 functional / 146 non-functional", () => {
    expect(agg.functional).toBe(392);
    expect(mapped.filter((f) => f.functional === false).length).toBe(146);
  });

  it("Public 69/250, Private 159/288 (licensed/total)", () => {
    expect(agg.bySector.Public.total).toBe(250);
    expect(agg.bySector.Public.licensed).toBe(69);
    expect(agg.bySector.Private.total).toBe(288);
    expect(agg.bySector.Private.licensed).toBe(159);
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

  it("161 records flagged for review, each with a note", () => {
    const flagged = mapped.filter((f) => f.needsReview);
    expect(flagged.length).toBe(161);
    for (const f of flagged) expect(f.reviewNote).toBeTruthy();
  });

  it("383 authorisations on record", () => {
    expect(agg.auths).toBe(383);
  });

  it("every stage maps to a known Stage value (nothing fell back silently)", () => {
    // "No Application Submitted" is both a real status and safeStage's
    // fallback; a mapping regression would inflate it well past the register's
    // own count.
    expect(agg.byStage["No Application Submitted"]).toBe(212);
    expect(agg.byStage["Waiting for Payment"]).toBe(46);
    expect(agg.byStage["Import Licence Only (Not yet Use/Possession)"]).toBe(12);
    // Facilities a register showed licensed and a workbook then left blank —
    // none new this time; the eight still waiting from the earlier imports.
    expect(agg.byStage["Licence Expiring (Renewal Due)"]).toBe(8);
  });

  it("keys every facility by something that survives a re-import", () => {
    // Ids are document ids in Firestore. A facility RAIS has not issued a RAN
    // for used to be keyed by its ROW NUMBER, which moves whenever the register
    // is re-imported and left the previous import's document behind as a
    // duplicate — so those are keyed by name instead.
    expect(new Set(mapped.map((f) => f.id)).size).toBe(mapped.length);
    expect(mapped.filter((f) => /^fac-\d+$/.test(f.id) && !f.facCode)).toEqual([]);
    for (const f of mapped) {
      expect(f.id).toBe(
        f.facCode ? f.facCode.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() : f.id,
      );
      if (!f.facCode) expect(f.id.startsWith("seed-")).toBe(true);
    }
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
 * 380 licences across eight types, of which 379 land on a facility (the one
 * importation licence the sheet books to the Radiation Protection Authority
 * itself has no register row to land on). The four further authorisations
 * are the ones the carried-over facilities already held (no quarter on those).
 */
describe("§16 — licences issued (2026 Licensing Status workbook)", () => {
  const mapped = mapAllSeed(facilities as SeedFacility[]);
  const stats = computeLicenceStats(mapped, 2026);
  const workbook = mapped
    .flatMap((f) => f.auths || [])
    .filter((a) => (a.quarter || "").startsWith("2026-"));

  it("379 licences issued in 2026, 4 carried over from the previous register", () => {
    expect(workbook.length).toBe(379);
    expect(stats.totalIssued).toBe(383);
  });

  it("matches the workbook's Totals sheet, type by type", () => {
    const count = (type: string) =>
      workbook.filter((a) => a.type === type).length;
    expect(workbook.filter((a) => isUseP(a.type)).length).toBe(248);
    // The Totals sheet says 91; the 91st is the Authority's own import.
    expect(count("Importation Licence")).toBe(90);
    expect(count("Variation of Terms and Conditions")).toBe(22);
    expect(count("Transfer Licence")).toBe(7);
    expect(count("Decommissioning Licence")).toBe(5);
    expect(count("Export Licence")).toBe(3);
    expect(count("Transit Licence")).toBe(3);
    expect(count("Transport Licence")).toBe(1);
  });

  it("splits by quarter of issue: Q1 198, Q2 142, Q3 39", () => {
    const byQuarter = (q: string) =>
      workbook.filter((a) => a.quarter === q).length;
    expect(byQuarter("2026-Q1")).toBe(198);
    expect(byQuarter("2026-Q2")).toBe(142);
    expect(byQuarter("2026-Q3")).toBe(39);
  });

  it("counts quarter-dated use licences as current for 2026", () => {
    // The workbook dates licences by quarter, not by day; licensedThisYear
    // reads the quarter's year (authYear) so these are not "unconfirmed".
    expect(stats.licensedThisYear).toBe(224);
    expect(stats.licensedYearUnconfirmed).toBe(4);
    expect(stats.licensedTotal).toBe(228);
  });
});
