import { describe, expect, it } from "vitest";

import { sourcePractice } from "../lib/rules/sourcePractice";

/**
 * What a sealed source is used for — read from the record first, then from
 * who holds it (October 2026: construction and roads → portable gauges, mines
 * and plants → fixed gauges), and otherwise left as a worklist.
 */
describe("sourcePractice", () => {
  const at = (facility: string, department = "") => ({ facility, department });

  it("reads the record's maker or model before the holder", () => {
    // A Troxler at a mine is still a portable gauge.
    expect(
      sourcePractice(
        { nuclide: "Cs-137", manufacturer: "Troxler", model: "3440" },
        at("TANDEM CONSTRUCTION MINING LIMITED"),
      ),
    ).toEqual({ category: "Portable Gauges", basis: "record" });
    expect(
      sourcePractice({ nuclide: "Cs-137", model: "5001" }, at("ROAD DEVELOPMENT AGENCY")),
    ).toEqual({ category: "Portable Gauges", basis: "record" });
    expect(
      sourcePractice(
        { nuclide: "Cs-137/Ba-137m", manufacturer: "ENDRESS + HAUSER" },
        at("PARROGATE GINNERIES LIMITED"),
      ),
    ).toEqual({ category: "Fixed Gauges", basis: "record" });
    expect(
      sourcePractice({ nuclide: "Am-241", manufacturer: "Krones" }, null),
    ).toEqual({ category: "Fixed Gauges", basis: "record" });
  });

  it("files a gauge source by who holds it when the record is silent", () => {
    expect(
      sourcePractice({ nuclide: "Cs-137" }, at("ZCCM INVESTMENT HOLDINGS PLC")),
    ).toEqual({ category: "Fixed Gauges", basis: "holder" });
    expect(
      sourcePractice({ nuclide: "Cs-137" }, at("KANSANSHI MINING PLC")),
    ).toEqual({ category: "Fixed Gauges", basis: "holder" });
    expect(
      sourcePractice({ nuclide: "Cf-252" }, at("CHILANGA CEMENT PLC NDOLA")),
    ).toEqual({ category: "Fixed Gauges", basis: "holder" });
    expect(
      sourcePractice({ nuclide: "" }, at("ANHUISHUI  CONSTRUCTION GROUP")),
    ).toEqual({ category: "Portable Gauges", basis: "holder" });
    expect(
      sourcePractice({ nuclide: "Cs-137" }, at("WIRELINE WORKSHOP PTY LIMITED")),
    ).toEqual({ category: "Well Logging Sources", basis: "holder" });
  });

  it("does not make a gauge of a nuclide no gauge uses", () => {
    expect(
      sourcePractice({ nuclide: "Ra-226" }, at("ZCCM INVESTMENT HOLDINGS PLC")),
    ).toEqual({ category: "Sealed Source (Use Not Determined)", basis: "undetermined" });
  });

  it("does not make a gauge of an instrument entered as a source", () => {
    expect(
      sourcePractice(
        { manufacturer: "Innovex Olympus", model: "vanta c series" },
        at("Mimbula Minerals Limited"),
      ).basis,
    ).toBe("undetermined");
  });

  it("tells radiography from brachytherapy by where the Ir-192 is", () => {
    expect(
      sourcePractice({ nuclide: "Ir-192" }, at("ON TRACK WELDING & NDE SOLUTIONS")),
    ).toEqual({ category: "Gamma Radiography", basis: "record" });
    expect(
      sourcePractice({ nuclide: "Ir-192" }, at("CANCER DISEASES HOSPITAL", "Radiotherapy")),
    ).toEqual({ category: "HDR/MDR Brachytherapy", basis: "holder" });
    expect(
      sourcePractice({ manufacturer: "Elekta", model: "Flexitron" }, null),
    ).toEqual({ category: "HDR/MDR Brachytherapy", basis: "record" });
  });

  it("reads a hospital's check sources and a GC's detector", () => {
    const nm = at("University Teaching Hospital - Nuclear Medicine");
    expect(sourcePractice({ nuclide: "Co-57" }, nm).category).toBe(
      "Calibration & Reference Sources",
    );
    expect(sourcePractice({ nuclide: "I-131" }, nm).category).toBe(
      "Radionuclide Therapy",
    );
    expect(
      sourcePractice({ nuclide: "Ni-63", manufacturer: "Thermo scientific" }, null),
    ).toEqual({ category: "Electron Capture Detectors", basis: "record" });
  });

  it("leaves a source with no evidence and no holder undetermined", () => {
    expect(sourcePractice({ nuclide: "Cs-137" }, null).basis).toBe("undetermined");
  });
});
