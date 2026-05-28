import { describe, expect, it } from "vitest";
import {
  classifyMatch,
  jaccard,
  matchOne,
  norm,
  parseBulkLine,
  scoreMatch,
} from "../lib/rules/matching";
import type { Facility } from "../lib/rules/types";

const mk = (name: string, facCode = "", licensed = false): Facility => ({
  id: name.replace(/\s+/g, "-").toLowerCase(),
  no: 0,
  name,
  nameLower: name.toLowerCase(),
  district: "",
  province: "Lusaka",
  practice: "",
  sector: "Private",
  licensed,
  stage: licensed ? "Licensed" : "No Application Submitted",
  facCode,
  auths: [],
});

describe("norm + jaccard", () => {
  it("normalises company suffixes away", () => {
    expect(norm("Acme Ltd.")).toBe("acme");
    expect(norm("Acme, Inc")).toBe("acme");
  });

  it("jaccard handles overlap", () => {
    expect(jaccard("a b c", "b c d")).toBeCloseTo(2 / 4);
    expect(jaccard("", "x")).toBe(0);
  });
});

describe("scoreMatch", () => {
  it("returns 1 for exact match", () => {
    expect(scoreMatch("Acme Hospital", mk("Acme Hospital"))).toBe(1);
  });

  it("matches FAC code exactly", () => {
    expect(scoreMatch("FAC/0344", mk("Whatever", "FAC/0344"))).toBe(1);
  });

  it("guards against short generic substrings", () => {
    expect(scoreMatch("Clinic", mk("Lusaka Clinic"))).toBeLessThan(0.9);
  });

  it("0.9 for solid substring containment", () => {
    expect(
      scoreMatch("Friends Care Medical", mk("Friends Care Medical Centre")),
    ).toBe(0.9);
  });
});

describe("matchOne / classify", () => {
  const facilities = [
    mk("Friends Care Medical Centre", "FAC/0459", true),
    mk("Bauleni Urban Health Center"),
    mk("Hitachi Construction Machinery Zambia", "FAC/0429", true),
  ];

  it("classifies an auto match", () => {
    const r = matchOne(
      { name: "Friends Care Medical", number: "" },
      facilities,
    );
    expect(r.classification).toBe("auto");
    expect(r.best?.name).toBe("Friends Care Medical Centre");
    expect(r.alreadyLicensed).toBe(true);
  });

  it("classifies an unrelated query as none", () => {
    const r = matchOne(
      { name: "Completely Unrelated Garage", number: "" },
      facilities,
    );
    expect(r.classification).toBe("none");
  });

  it("classifyMatch boundaries", () => {
    expect(classifyMatch(0.72)).toBe("auto");
    expect(classifyMatch(0.7199)).toBe("review");
    expect(classifyMatch(0.45)).toBe("review");
    expect(classifyMatch(0.449)).toBe("none");
  });
});

describe("parseBulkLine", () => {
  it("pipe always splits", () => {
    expect(parseBulkLine("Acme | AUTH/USE.REN/0701")).toEqual({
      name: "Acme",
      number: "AUTH/USE.REN/0701",
    });
  });

  it("comma splits only on AUTH-looking tail", () => {
    expect(parseBulkLine("Acme, AUTH/USE.REN/0701")).toEqual({
      name: "Acme",
      number: "AUTH/USE.REN/0701",
    });
  });

  it("comma in facility name is preserved", () => {
    expect(parseBulkLine("Acme, Inc")).toEqual({ name: "Acme, Inc", number: "" });
  });

  it("empty line", () => {
    expect(parseBulkLine("")).toEqual({ name: "", number: "" });
  });
});
