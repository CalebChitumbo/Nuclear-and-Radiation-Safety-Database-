import { describe, expect, it } from "vitest";
import {
  deriveWeekly,
  metricKey,
} from "../lib/rules/weeklyDerivation";
import type { Inspection, LicenceEvent } from "../lib/rules/types";

const ev = (
  type: LicenceEvent["type"],
  i = 1,
): LicenceEvent => ({
  id: `e${i}`,
  date: "2026-05-27",
  week: "W22 — wk of 25 May 2026",
  facilityId: "f",
  facilityName: "F",
  sector: "Private",
  province: "Lusaka",
  type,
  number: "",
  facCode: "",
});

const insp = (
  type: Inspection["type"],
  i = 1,
): Inspection => ({
  id: `i${i}`,
  date: "2026-05-27",
  week: "W22 — wk of 25 May 2026",
  facilityId: "f",
  facilityName: "F",
  type,
  outcome: "Compliant",
  province: "Lusaka",
  sector: "Private",
  notes: "",
});

describe("weekly derivation", () => {
  it("rolls up A&S 1-9 from licence events and sums total", () => {
    const events = [
      ev("New Use/Possession Licence", 1),
      ev("Renewal of Use/Possession Licence", 2),
      ev("Importation Licence", 3),
      ev("Importation Licence", 4),
      ev("Export Licence", 5),
    ];
    const rep = deriveWeekly(events, [], {});
    const as = rep.find((s) => s.section === "Authorisation & Standards")!;
    const possession = as.metrics.find(
      (m) => m.label === "Possession Licences issued",
    )!;
    const imp = as.metrics.find((m) => m.label === "Importation Licences")!;
    const exp = as.metrics.find((m) => m.label === "Export Licences")!;
    expect(possession.value).toBe(2);
    expect(imp.value).toBe(2);
    expect(exp.value).toBe(1);
    expect(as.total?.value).toBe(5);
  });

  it("rolls up Inspectorate 1-5 from inspections", () => {
    const inspections = [
      insp("Routine Inspection", 1),
      insp("Routine Inspection", 2),
      insp("Investigation", 3),
    ];
    const rep = deriveWeekly([], inspections, {});
    const i = rep.find((s) => s.section === "Inspectorate")!;
    expect(i.metrics.find((m) => m.label === "Routine Inspections")?.value).toBe(2);
    expect(i.metrics.find((m) => m.label === "Investigations")?.value).toBe(1);
    expect(i.total?.value).toBe(3);
  });

  it("returns manual sections (NSSS, NSI) with values from manual map", () => {
    const manual = {
      [metricKey(
        "Nuclear Safety, Security & Safeguards",
        "Vehicle Screening (units)",
      )]: 12,
      [metricKey("National Source Inventory", "Sources verified")]: 7,
    };
    const rep = deriveWeekly([], [], manual);
    const nsss = rep.find(
      (s) => s.section === "Nuclear Safety, Security & Safeguards",
    )!;
    const nsi = rep.find((s) => s.section === "National Source Inventory")!;
    expect(
      nsss.metrics.find((m) => m.label === "Vehicle Screening (units)")?.value,
    ).toBe(12);
    expect(
      nsi.metrics.find((m) => m.label === "Sources verified")?.value,
    ).toBe(7);
  });
});
