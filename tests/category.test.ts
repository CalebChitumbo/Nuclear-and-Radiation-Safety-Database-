import { describe, expect, it } from "vitest";
import { categoriseFacility } from "../lib/rules/category";
import { facilitiesToCsv, csvEscape } from "../lib/rules/exportCsv";
import { mapSeedFacility } from "../lib/store/seeding";

describe("categoriseFacility — Medical vs Non-Medical", () => {
  it("classifies clinical practices as Medical", () => {
    expect(categoriseFacility("Diagnostic Imaging (X-ray)", "A")).toBe("Medical");
    expect(categoriseFacility("Computed Tomography", "A")).toBe("Medical");
    expect(categoriseFacility("Dental X-ray", "A")).toBe("Medical");
    expect(categoriseFacility("Nuclear Medicine, Radiotherapy", "A")).toBe(
      "Medical",
    );
  });

  it("veterinary counts as Medical", () => {
    expect(categoriseFacility("Veterinary Diagnostics", "A")).toBe("Medical");
    expect(categoriseFacility("", "Chelston Veterinary Clinic")).toBe("Medical");
  });

  it("industrial / screening practices are Non-Medical", () => {
    expect(categoriseFacility("Nuclear Gauges", "A")).toBe("Non-Medical");
    expect(categoriseFacility("Analytical Techniques", "A")).toBe("Non-Medical");
    expect(
      categoriseFacility("Baggage Screening, Cargo Screening", "A"),
    ).toBe("Non-Medical");
    expect(categoriseFacility("Industrial Irradiation", "A")).toBe("Non-Medical");
  });

  it("falls back to the name when the practice is blank", () => {
    expect(categoriseFacility("", "Kamoto Mission Hospital")).toBe("Medical");
    expect(categoriseFacility("", "ZNS Kabwe")).toBe("Non-Medical");
  });
});

describe("mapSeedFacility — 2026 status-list fields", () => {
  const base = {
    n: 1,
    name: "Test Facility",
    dist: "Lusaka",
    prov: "Lusaka",
    prac: "Diagnostic Imaging (X-ray)",
    sec: "Public",
    lic: "No",
    stage: "In Final Processing",
    auth: "",
    fac: "",
    ln: "",
  };

  it("maps functional/category/stalled/review/detail", () => {
    const f = mapSeedFacility({
      ...base,
      func: "No",
      cat: "Non-Medical",
      stalled: "Yes",
      review: "Confirm this record",
      detail: "RPA official use · 2026-06-26",
    });
    expect(f.functional).toBe(false);
    expect(f.category).toBe("Non-Medical");
    expect(f.stalled).toBe(true);
    expect(f.needsReview).toBe(true);
    expect(f.reviewNote).toBe("Confirm this record");
    expect(f.statusDetail).toBe("RPA official use · 2026-06-26");
    expect(f.stage).toBe("In Final Processing");
  });

  it("defaults rows without the new fields to functional Medical, no flags", () => {
    const f = mapSeedFacility(base);
    expect(f.functional).toBe(true);
    expect(f.category).toBe("Medical");
    expect(f.stalled).toBeUndefined();
    expect(f.needsReview).toBeUndefined();
    expect(f.statusDetail).toBeUndefined();
  });

  it("accepts the stages added for the 2026 import", () => {
    expect(mapSeedFacility({ ...base, stage: "Draft Application" }).stage).toBe(
      "Draft Application",
    );
    expect(
      mapSeedFacility({ ...base, stage: "Not A Real Stage" }).stage,
    ).toBe("No Application Submitted");
  });
});

describe("facilitiesToCsv", () => {
  it("escapes commas/quotes and flattens the register columns", () => {
    expect(csvEscape('a "b", c')).toBe('"a ""b"", c"');
    const f = mapSeedFacility({
      n: 1,
      name: 'Clinic "A", Lusaka',
      dist: "Lusaka",
      prov: "Lusaka",
      prac: "Diagnostic Imaging (X-ray)",
      sec: "Private",
      lic: "Yes",
      stage: "Licensed",
      auth: "Renewal",
      fac: "FAC/0001",
      ln: "AUTH/USE.REN/0001",
      func: "Yes",
      cat: "Medical",
    });
    const csv = facilitiesToCsv([f]);
    const [header, row] = csv.split("\r\n");
    expect(header).toContain("Functional");
    expect(header).toContain("Category");
    expect(row).toContain('"Clinic ""A"", Lusaka"');
    expect(row).toContain("AUTH/USE.REN/0001");
  });
});
