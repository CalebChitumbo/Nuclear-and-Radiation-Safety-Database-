import { describe, expect, it } from "vitest";

import { facilitiesToCsv } from "../lib/rules/exportCsv";
import {
  countServiceProviders,
  isRecognisedProvider,
  matchesSpFilter,
  parseSpFilter,
  recognitionPatch,
  serviceProviderPatch,
  serviceProviderSuggestions,
} from "../lib/rules/serviceProviders";
import { mapAllSeed, mergeSeededFacility, type SeedFacility } from "../lib/store/seeding";
import type { Facility } from "../lib/rules/types";
import facilitiesSeed from "../seed/facilities.seed.json";

const FACILITIES = mapAllSeed(facilitiesSeed as SeedFacility[]);
const AT = "2026-11-24T08:00:00.000Z";
const TODAY = "2026-11-24";
const BY = { name: "C. Officer" };

const plain = { serviceProvider: undefined, spRecognised: undefined };
const pending = { serviceProvider: true, spRecognised: false };
const recognised = { serviceProvider: true, spRecognised: true };

describe("the service-provider filter", () => {
  it("splits providers into recognised and not yet recognised", () => {
    expect([plain, pending, recognised].map((f) => matchesSpFilter(f, "sp"))).toEqual([
      false,
      true,
      true,
    ]);
    expect([plain, pending, recognised].map((f) => matchesSpFilter(f, "recognised"))).toEqual([
      false,
      false,
      true,
    ]);
    expect([plain, pending, recognised].map((f) => matchesSpFilter(f, "unrecognised"))).toEqual([
      false,
      true,
      false,
    ]);
    expect([plain, pending, recognised].every((f) => matchesSpFilter(f, "all"))).toBe(true);
    expect(countServiceProviders([plain, pending, recognised, pending])).toEqual({
      sp: 3,
      recognised: 1,
      unrecognised: 2,
    });
  });

  it("never counts a recognition left on a facility that is no longer a provider", () => {
    const unmarked = { serviceProvider: false, spRecognised: true };
    expect(isRecognisedProvider(unmarked)).toBe(false);
    expect(matchesSpFilter(unmarked, "recognised")).toBe(false);
  });

  it("reads a deep link back as All when it names no filter", () => {
    expect(parseSpFilter("recognised")).toBe("recognised");
    expect(parseSpFilter("yes")).toBe("all");
    expect(parseSpFilter(null)).toBe("all");
  });

  it("starts with nobody marked — the imports set nothing", () => {
    expect(countServiceProviders(FACILITIES)).toEqual({ sp: 0, recognised: 0, unrecognised: 0 });
  });
});

describe("marking and recognising", () => {
  it("takes the recognition off with the mark, keeping its day and note", () => {
    expect(serviceProviderPatch(true, BY, AT)).toEqual({ serviceProvider: true });
    const off = serviceProviderPatch(false, BY, AT);
    expect(off).toEqual({
      serviceProvider: false,
      spRecognised: false,
      spRecognitionBy: "C. Officer",
      spRecognitionAt: AT,
    });
    expect("spRecognisedOn" in off).toBe(false);
  });

  it("records who, when, the day and the note — every value set for updateDoc", () => {
    const patch = recognitionPatch(
      pending,
      { recognised: true, on: "2026-11-20", note: "  Letter RPA/SP/12. " },
      BY,
      AT,
      TODAY,
    );
    expect(patch).toEqual({
      spRecognised: true,
      spRecognisedOn: "2026-11-20",
      spRecognitionNote: "Letter RPA/SP/12.",
      spRecognitionBy: "C. Officer",
      spRecognitionAt: AT,
    });
    expect(Object.values(patch).some((v) => v === undefined)).toBe(false);
    // Withdrawn: the day goes, the note stays as written.
    expect(
      recognitionPatch(recognised, { recognised: false, on: "2026-11-20", note: "Lapsed." }, BY, AT, TODAY),
    ).toMatchObject({ spRecognised: false, spRecognisedOn: "", spRecognitionNote: "Lapsed." });
  });

  it("refuses what the security rules would", () => {
    expect(() => recognitionPatch(plain, { recognised: true }, BY, AT, TODAY)).toThrow(
      /service provider first/,
    );
    expect(() => recognitionPatch(pending, { recognised: true, on: "20/11/2026" }, BY, AT, TODAY)).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() => recognitionPatch(pending, { recognised: true, on: "2026-11-25" }, BY, AT, TODAY)).toThrow(
      /future/,
    );
    expect(() =>
      recognitionPatch(pending, { recognised: true, note: "x".repeat(501) }, BY, AT, TODAY),
    ).toThrow(/500/);
  });

  it("survives a register re-import on a facility an officer has marked", () => {
    const seeded = FACILITIES.find((f) => f.id === "fac-0670")!;
    const live: Facility = {
      ...seeded,
      serviceProvider: true,
      spRecognised: true,
      spRecognisedOn: "2026-11-20",
      updatedBy: "u-as",
    };
    const { facility } = mergeSeededFacility(seeded, live);
    expect(facility.serviceProvider).toBe(true);
    expect(facility.spRecognised).toBe(true);
    expect(facility.spRecognisedOn).toBe("2026-11-20");
  });

  it("is in the register export", () => {
    const f: Facility = { ...FACILITIES[0], ...recognised, spRecognisedOn: "2026-11-20" };
    const [header, row] = facilitiesToCsv([f]).split("\r\n");
    expect(header).toContain("Service Provider,Recognised by the Authority,Recognised On");
    expect(row).toContain(",Yes,Yes,2026-11-20,");
    // Blank for a facility that is not a provider.
    const [, plainRow] = facilitiesToCsv([{ ...f, ...plain }]).split("\r\n");
    expect(plainRow).not.toContain("2026-11-20");
  });
});

describe("what the imported data suggests", () => {
  it("names the seven facilities the 2026 register describes as service providers", () => {
    const s = serviceProviderSuggestions(FACILITIES);
    expect(s.map((x) => x.name)).toEqual([
      "Ace Pharmaceuticals",
      "Alistair Logistics Zambia Limited",
      "Innoray Medical Equipment Company",
      "Nsangu Investments Limited",
      "Quicklog geophysics PTY Ltd",
      "Zambia Gold Company Limited",
      "Zambia Medicines and Medical Supplies Agency",
    ]);
    expect(s.find((x) => x.id === "fac-0592")?.reason).toBe(
      'Licensing Status workbook: "Service provider"',
    );
  });

  it("drops a facility once an officer has decided either way", () => {
    const decided = FACILITIES.map((f) =>
      f.id === "fac-0474" ? { ...f, serviceProvider: false } : f.id === "fac-0670" ? { ...f, serviceProvider: true } : f,
    );
    const ids = serviceProviderSuggestions(decided).map((x) => x.id);
    expect(ids).not.toContain("fac-0474");
    expect(ids).not.toContain("fac-0670");
    expect(ids.length).toBe(5);
  });
});
