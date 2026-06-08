import { describe, expect, it } from "vitest";
import { computeAggregate } from "../lib/rules/aggregate";
import type { Facility } from "../lib/rules/types";

const facs: Facility[] = [
  {
    id: "1",
    no: 1,
    name: "A",
    nameLower: "a",
    district: "",
    province: "Lusaka",
    practice: "",
    sector: "Public",
    licensed: true,
    stage: "Licensed",
    facCode: "",
    auths: [
      {
        type: "Renewal of Use/Possession Licence",
        number: "AUTH/USE.REN/0001",
        date: "",
      },
    ],
  },
  {
    id: "2",
    no: 2,
    name: "B",
    nameLower: "b",
    district: "",
    province: "Copperbelt",
    practice: "",
    sector: "Private",
    licensed: false,
    stage: "No Application Submitted",
    facCode: "",
    auths: [],
  },
  {
    id: "3",
    no: 3,
    name: "C",
    nameLower: "c",
    district: "",
    province: "Lusaka",
    practice: "",
    sector: "Private",
    licensed: true,
    stage: "Licensed",
    facCode: "",
    auths: [
      {
        type: "New Use/Possession Licence",
        number: "AUTH/USE.NEW/0002",
        date: "",
      },
      {
        type: "Importation Licence",
        number: "AUTH/IMP/0050",
        date: "",
      },
    ],
  },
];

describe("computeAggregate", () => {
  const agg = computeAggregate(facs);

  it("counts totals correctly", () => {
    expect(agg.total).toBe(3);
    expect(agg.licensed).toBe(2);
    expect(agg.unlicensed).toBe(1);
  });

  it("sums all auths across facilities (R3)", () => {
    expect(agg.auths).toBe(3);
  });

  it("breaks down by sector", () => {
    expect(agg.bySector.Public.total).toBe(1);
    expect(agg.bySector.Public.licensed).toBe(1);
    expect(agg.bySector.Private.total).toBe(2);
    expect(agg.bySector.Private.licensed).toBe(1);
  });

  it("breaks down by province", () => {
    expect(agg.byProvince.Lusaka).toEqual({ total: 2, licensed: 2 });
    expect(agg.byProvince.Copperbelt).toEqual({ total: 1, licensed: 0 });
    expect(agg.byProvince["Northern"]).toEqual({ total: 0, licensed: 0 });
  });

  it("breaks down by stage", () => {
    expect(agg.byStage["Licensed"]).toBe(2);
    expect(agg.byStage["No Application Submitted"]).toBe(1);
  });
});

describe("byStage with the new RAIS status buckets", () => {
  it("counts facilities sitting on a newly-added Stage (e.g. a returned application)", () => {
    const withNewStages: Facility[] = [
      ...facs,
      {
        id: "4",
        no: 4,
        name: "D",
        nameLower: "d",
        district: "",
        province: "Lusaka",
        practice: "",
        sector: "Private",
        licensed: false,
        stage: "Application Returned / Rejected",
        currentStatus: "Transfer Application Rejected",
        facCode: "",
        auths: [],
      },
    ];
    const agg = computeAggregate(withNewStages);
    expect(agg.total).toBe(4);
    expect(agg.byStage["Application Returned / Rejected"]).toBe(1);
  });
});
