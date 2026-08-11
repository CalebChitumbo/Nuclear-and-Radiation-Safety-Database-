import { describe, expect, it } from "vitest";

import {
  resolveCommodity,
  resolveTransporter,
  searchCommodities,
} from "../lib/rules/borderCargo";
import {
  buildScan,
  doseResult,
  emptyDraft,
  findNearDuplicates,
  findSameDayScan,
  knownTransporters,
  lastSeenDetails,
  normaliseVehicleId,
  scanWriteErrorMessage,
  scansToCsv,
  summariseScans,
  summariseWeek,
  summaryToCsv,
  validateScan,
  vehicleIdKind,
  weeklyNarrative,
  type ScanDraft,
} from "../lib/rules/borderScans";
import { scanLogCountEntry, scanLogEntriesFor } from "../lib/rules/daily";
import type { DailyEntry, TruckScan } from "../lib/rules/types";

const WEEK = "W23 — wk of 01 Jun 2026";

function scan(over: Partial<TruckScan> = {}): TruckScan {
  return {
    id: Math.random().toString(36).slice(2),
    date: "2026-06-01",
    week: WEEK,
    border: "Nakonde",
    vehicleId: "T470ENT",
    vehicleIdKind: "Plate",
    cargoClass: "Goods of Interest",
    commodity: "Sulphur",
    transporter: "Busokelo",
    doseNSvH: 70,
    result: "Normal",
    ...over,
  };
}

describe("commodity vocabulary", () => {
  it("folds the workbook's spelling variants onto one canonical name", () => {
    // Six spellings of sulphur appear in a single month of one post's log.
    for (const raw of [
      "SULPHUR",
      "sulpur",
      "SULLPHUR",
      "SURLPHER",
      "SULPHUIR",
      "SULPHUR'",
    ]) {
      expect(resolveCommodity(raw)?.name).toBe("Sulphur");
    }
    expect(resolveCommodity("MAGENESIA")?.name).toBe("Magnesia");
    expect(resolveCommodity("MAGANESE")?.name).toBe("Manganese");
    expect(resolveCommodity("COPPER ANODES")?.name).toBe("Copper Anode");
    expect(resolveCommodity("ZINC CONC")?.name).toBe("Zinc Concentrate");
  });

  it("derives the cargo class from the commodity", () => {
    expect(resolveCommodity("Sulphur")?.class).toBe("Goods of Interest");
    expect(resolveCommodity("soya")?.class).toBe("Food");
    expect(resolveCommodity("TAXI")?.class).toBe("Other");
  });

  it("keeps an unknown commodity rather than dropping or guessing it", () => {
    const r = resolveCommodity("PLATINUM SPONGE", "Goods of Interest");
    expect(r).not.toBeNull();
    expect(r?.known).toBe(false);
    expect(r?.name).toBe("Platinum Sponge");
    expect(r?.class).toBe("Goods of Interest");
  });

  it("rejects values that are not cargo at all", () => {
    // A dose reading and a chassis number, both typed a column across in the
    // June workbook.
    expect(resolveCommodity("80.0")).toBeNull();
    expect(resolveCommodity("ITB21A-9307414")).toBeNull();
    expect(resolveCommodity("   ")).toBeNull();
  });

  it("ranks type-ahead matches exact, then prefix, then substring", () => {
    const names = searchCommodities("sul").map((c) => c.name);
    expect(names[0]).toBe("Sulphur");
    expect(names).toContain("Organo-Sulphur");
    // A short exact match must win over the longer names containing it —
    // "IT" is 59% of the traffic and must never resolve to "Titanium Dioxide".
    expect(searchCommodities("IT")[0].name).toBe("IT");
  });

  it("corrects known transporter misspellings but keeps unknown names", () => {
    expect(resolveTransporter("BUSEKELO")).toBe("Busokelo");
    expect(resolveTransporter("johnmuss")).toBe("Johmuss");
    expect(resolveTransporter("Kalulu Haulage")).toBe("Kalulu Haulage");
  });
});

describe("vehicle identifiers", () => {
  it("normalises the spacing officers type inconsistently", () => {
    expect(normaliseVehicleId("T 361 DVG")).toBe("T361DVG");
    expect(normaliseVehicleId("t361dvg")).toBe("T361DVG");
    expect(normaliseVehicleId(" kdh201-0226320 ")).toBe("KDH201-0226320");
  });

  it("classifies plates, chassis numbers and VINs by shape", () => {
    expect(vehicleIdKind("T470ENT")).toBe("Plate");
    expect(vehicleIdKind("BAL 5421 ZM")).toBe("Plate");
    expect(vehicleIdKind("KDH201-0226320")).toBe("Chassis");
    expect(vehicleIdKind("JTELB71J80B003753")).toBe("VIN");
    expect(vehicleIdKind("???")).toBe("Other");
  });
});

describe("dose triage", () => {
  it("treats the posts' normal background as normal", () => {
    expect(doseResult(20)).toBe("Normal");
    expect(doseResult(90)).toBe("Normal");
    expect(doseResult(299)).toBe("Normal");
  });

  it("flags elevated and alarm readings", () => {
    expect(doseResult(300)).toBe("Elevated");
    expect(doseResult(999)).toBe("Elevated");
    expect(doseResult(1000)).toBe("Alarm");
  });
});

describe("validation", () => {
  const good: ScanDraft = {
    ...emptyDraft("Inbound"),
    vehicleId: "T470ENT",
    commodity: "Sulphur",
    transporter: "Busokelo",
    dose: "70",
  };

  it("accepts a complete scan", () => {
    expect(validateScan(good).ok).toBe(true);
  });

  it("rejects the dose typos the workbook is full of", () => {
    // "4O" (letter O), "8-" and "90]" are all real entries in the June book.
    for (const dose of ["4O", "8-", "90]", "90'90", ""]) {
      const v = validateScan({ ...good, dose });
      expect(v.ok).toBe(false);
      expect(v.errors.dose).toBeTruthy();
    }
  });

  it("queries an implausible reading but lets the officer stand by it", () => {
    // "7090" and "8090" are in the June book — two readings run together. A
    // reading that high is queried, but a real detection must still be
    // recordable, so confirming it leaves only the ordinary alarm requirements.
    const draft = { ...good, dose: "7090000" };
    expect(validateScan(draft).errors.dose).toBeTruthy();
    const confirmed = validateScan(draft, { confirmedImplausible: true });
    expect(confirmed.errors.dose).toBeUndefined();
    expect(confirmed.result).toBe("Alarm");
    expect(
      validateScan(
        { ...draft, action: "Escalated to RPA Head Office" },
        { confirmedImplausible: true },
      ).ok,
    ).toBe(true);
  });

  it("requires every field the workbook allowed to be left blank", () => {
    expect(validateScan({ ...good, vehicleId: "" }).errors.vehicleId).toBeTruthy();
    expect(validateScan({ ...good, commodity: "" }).errors.commodity).toBeTruthy();
    expect(validateScan({ ...good, transporter: "" }).errors.transporter).toBeTruthy();
  });

  it("demands an action once a reading is above background", () => {
    const elevated = { ...good, dose: "1200" };
    expect(validateScan(elevated).errors.action).toBeTruthy();
    expect(
      validateScan({ ...elevated, action: "Referred for secondary inspection" }).ok,
    ).toBe(true);
  });
});

describe("buildScan", () => {
  it("derives everything derivable from what was typed", () => {
    const built = buildScan(
      {
        ...emptyDraft("Inbound"),
        vehicleId: "t 470 ent",
        commodity: "sulpur",
        cargoClass: "Other",
        transporter: "BUSEKELO",
        dose: "70",
      },
      { date: "2026-06-01", week: WEEK, border: "Nakonde", time: "08:15" },
    );

    expect(built.vehicleId).toBe("T470ENT");
    expect(built.vehicleIdKind).toBe("Plate");
    // The class follows the commodity, not the chip that happened to be set.
    expect(built.commodity).toBe("Sulphur");
    expect(built.cargoClass).toBe("Goods of Interest");
    expect(built.norm).toBe(true);
    expect(built.transporter).toBe("Busokelo");
    expect(built.result).toBe("Normal");
  });

  it("omits empty optional fields (Firestore rejects undefined)", () => {
    const built = buildScan(
      {
        ...emptyDraft(),
        vehicleId: "T470ENT",
        commodity: "Sulphur",
        transporter: "Busokelo",
        dose: "70",
        remarks: "   ",
      },
      { date: "2026-06-01", week: WEEK, border: "Nakonde" },
    );
    expect(Object.values(built).every((v) => v !== undefined)).toBe(true);
    expect("remarks" in built).toBe(false);
    expect("action" in built).toBe(false);
  });
});

describe("summariseScans", () => {
  const scans = [
    scan({ commodity: "Sulphur", norm: true }),
    scan({ vehicleId: "T550EPP", commodity: "Sulphur", norm: true, doseNSvH: 90 }),
    scan({
      vehicleId: "KDH201-0226320",
      vehicleIdKind: "Chassis",
      commodity: "IT",
      transporter: "Prisha",
      doseNSvH: 50,
    }),
    scan({
      vehicleId: "T873BBD",
      cargoClass: "Food",
      commodity: "Soya Beans",
      transporter: "Zawadi",
      doseNSvH: 80,
    }),
    scan({
      vehicleId: "AIG5555",
      cargoClass: "Other",
      commodity: "Taxi",
      transporter: "Zawadi",
      doseNSvH: 1200,
      result: "Alarm",
      action: "Referred for secondary inspection",
      norm: false,
    }),
  ];

  it("reproduces the workbook's three tally blocks", () => {
    const s = summariseScans(scans);
    expect(s.total).toBe(5);
    expect(s.byClass).toEqual({ "Goods of Interest": 3, Food: 1, Other: 1 });
    expect(s.commodities["Goods of Interest"]).toEqual([
      { name: "Sulphur", count: 2 },
      { name: "IT", count: 1 },
    ]);
    expect(s.commodities.Food).toEqual([{ name: "Soya Beans", count: 1 }]);
    expect(s.commodities.Other).toEqual([{ name: "Taxi", count: 1 }]);
  });

  it("answers what the tally blocks could not", () => {
    const s = summariseScans(scans);
    expect(s.byResult).toEqual({ Normal: 4, Elevated: 0, Alarm: 1 });
    expect(s.aboveBackground.map((x) => x.vehicleId)).toEqual(["AIG5555"]);
    expect(s.actions).toEqual([
      { name: "Referred for secondary inspection", count: 1 },
    ]);
    expect(s.dose.max).toBe(1200);
    expect(s.dose.median).toBe(80);
    expect(s.transporters[0]).toEqual({ name: "Busokelo", count: 2 });
  });

  it("counts elevated readings on NORM-bearing cargo separately", () => {
    const s = summariseScans([
      ...scans,
      scan({ vehicleId: "T111AAA", commodity: "Ceramic Tiles", norm: true, doseNSvH: 400, result: "Elevated", action: "Re-scanned & released" }),
    ]);
    expect(s.byResult.Elevated).toBe(1);
    expect(s.aboveBackgroundOnNorm).toBe(1);
  });

  it("surfaces new commodities and repeated units for review", () => {
    const s = summariseScans([
      ...scans,
      scan({ vehicleId: "T470ENT", commodity: "Platinum Sponge" }),
    ]);
    expect(s.newCommodities).toEqual([{ name: "Platinum Sponge", count: 1 }]);
    expect(s.repeatedVehicles).toEqual([{ name: "T470ENT", count: 2 }]);
  });

  it("handles an empty day without dividing by zero", () => {
    const s = summariseScans([]);
    expect(s.total).toBe(0);
    expect(s.dose).toEqual({ min: 0, max: 0, mean: 0, median: 0 });
  });
});

describe("near-duplicate transporter names", () => {
  it("pairs a typo and a longer form of the same name", () => {
    const pairs = findNearDuplicates(["Busokelo", "Busekelo", "Spot On", "Spot On Cargo"]);
    expect(pairs).toContainEqual(["Busokelo", "Busekelo"]);
    expect(pairs).toContainEqual(["Spot On", "Spot On Cargo"]);
  });

  it("leaves genuinely different names alone", () => {
    expect(findNearDuplicates(["Busokelo", "Zawadi", "Prisha"])).toEqual([]);
    // Too short to tell a typo from a different firm — never guessed at.
    expect(findNearDuplicates(["KOJ", "KOB"])).toEqual([]);
  });
});

describe("week rollup", () => {
  const weekScans = [
    scan({ date: "2026-06-01" }),
    scan({ date: "2026-06-01", vehicleId: "T550EPP" }),
    scan({ date: "2026-06-02", vehicleId: "T620ELN", border: "Chirundu" }),
    scan({
      date: "2026-06-02",
      vehicleId: "T947DKH",
      border: "Chirundu",
      doseNSvH: 1500,
      result: "Alarm",
      action: "Held pending investigation",
    }),
    scan({ date: "2026-06-08", week: "W24 — wk of 08 Jun 2026" }),
  ];

  it("splits the week by day and by post, ignoring other weeks", () => {
    const s = summariseWeek(weekScans, WEEK);
    expect(s.total).toBe(4);
    expect(s.byDay).toEqual([
      { date: "2026-06-01", total: 2 },
      { date: "2026-06-02", total: 2 },
    ]);
    expect(s.byBorder).toEqual([
      { border: "Chirundu", total: 2, elevated: 0, alarms: 1, maxDose: 1500, daysReported: 1 },
      { border: "Nakonde", total: 2, elevated: 0, alarms: 0, maxDose: 70, daysReported: 1 },
    ]);
  });

  it("writes the weekly paragraph from the rows", () => {
    const text = weeklyNarrative(summariseWeek(weekScans, WEEK));
    expect(text).toContain("4 trucks were scanned");
    expect(text).toContain("Chirundu 2");
    expect(text).toContain("1 reading was above background (1 at alarm level)");
    expect(text).toContain("held pending investigation (1)");
    // Classes that carried nothing are left out of the sentence entirely.
    expect(text).not.toContain("0 of other goods");
  });

  it("says so plainly when nothing was scanned", () => {
    expect(weeklyNarrative(summariseWeek([], WEEK))).toContain("No trucks were scanned");
  });
});

describe("exports", () => {
  it("writes one CSV row per scan, quoting what needs quoting", () => {
    const csv = scansToCsv([scan({ remarks: 'Re-scanned, "clear"' })]);
    const [header, row] = csv.split("\n");
    expect(header).toContain("Reg / chassis number");
    expect(row).toContain('"Re-scanned, ""clear"""');
  });

  it("writes the tally block as CSV in the shape the section reads", () => {
    const csv = summaryToCsv(summariseScans([scan(), scan({ vehicleId: "T2" })]));
    expect(csv).toContain("Totals,Trucks scanned,2");
    expect(csv).toContain("Goods of Interest,Sulphur,2");
  });
});

describe("capture-screen helpers", () => {
  it("spots a unit already scanned at this post today", () => {
    const today = [scan({ vehicleId: "T470ENT" })];
    expect(findSameDayScan(today, "t 470 ent", "Nakonde", "2026-06-01")).toBeTruthy();
    // Same unit, different post — not a duplicate.
    expect(findSameDayScan(today, "T470ENT", "Chirundu", "2026-06-01")).toBeNull();
    expect(findSameDayScan(today, "T470ENT", "Nakonde", "2026-06-02")).toBeNull();
  });

  it("offers what a returning unit carried last time", () => {
    const history = [
      scan({ date: "2026-05-30", commodity: "Magnesia" }),
      scan({ date: "2026-06-01", commodity: "Sulphur", transporter: "Busokelo" }),
    ];
    expect(lastSeenDetails(history, "T470ENT")).toEqual({
      commodity: "Sulphur",
      cargoClass: "Goods of Interest",
      transporter: "Busokelo",
    });
    expect(lastSeenDetails(history, "NEVER-SEEN-0001")).toBeNull();
  });

  it("puts the post's own transporters ahead of the seed list", () => {
    const list = knownTransporters(
      [scan({ transporter: "Kalulu Haulage" }), scan({ transporter: "Kalulu Haulage" })],
      ["Busokelo", "Kalulu Haulage"],
      "Nakonde",
    );
    expect(list[0]).toBe("Kalulu Haulage");
    expect(list).toContain("Busokelo");
    // Seeded duplicates of a used name are not listed twice.
    expect(list.filter((t) => t === "Kalulu Haulage")).toHaveLength(1);
  });
});

describe("write failures", () => {
  it("explains a permission denial instead of blaming the account", () => {
    // truckScans is a new collection: Firestore denies every write to one no
    // deployed rule mentions, admin or not. The raw SDK text sends people to
    // the Users tab; the command is what they actually need.
    const message = scanWriteErrorMessage(
      new Error("Missing or insufficient permissions."),
    );
    expect(message).toContain("firebase deploy --only firestore:rules");
    expect(message).toContain("not deployed yet");
    expect(message).not.toContain("Missing or insufficient permissions");
  });

  it("passes any other failure through unchanged", () => {
    expect(scanWriteErrorMessage(new Error("Network request failed"))).toBe(
      "Network request failed",
    );
  });
});

describe("posting the day total to the daily log", () => {
  const entry = (over: Partial<DailyEntry> = {}): DailyEntry => ({
    id: "d1",
    date: "2026-06-01",
    week: WEEK,
    section: "Nuclear Safety, Security & Safeguards",
    kind: "count",
    ...over,
  });

  it("builds a replaceable count carrying the post and the scan-log source", () => {
    const posted = scanLogCountEntry({
      date: "2026-06-01",
      week: WEEK,
      border: "Nakonde",
      total: 367,
    });
    expect(posted.value).toBe(367);
    expect(posted.border).toBe("Nakonde");
    expect(posted.source).toBe("scan-log");
    expect(posted.label).toBe("Vehicle Screening (units)");
  });

  it("finds only this post's own scan-log count for the day", () => {
    const posted = scanLogCountEntry({
      date: "2026-06-01",
      week: WEEK,
      border: "Nakonde",
      total: 367,
    });
    const entries: DailyEntry[] = [
      entry({ id: "a", ...posted }),
      entry({ id: "b", ...posted, border: "Chirundu" }),
      entry({ id: "c", ...posted, date: "2026-06-02" }),
      // A figure typed by hand is left alone — only scan-log counts are replaced.
      entry({ id: "d", ...posted, source: undefined }),
    ];
    expect(scanLogEntriesFor(entries, "Nakonde", "2026-06-01").map((e) => e.id)).toEqual([
      "a",
    ]);
  });
});
