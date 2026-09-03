import { beforeEach, describe, expect, it } from "vitest";

import { mockStore, resetMockStore } from "../lib/store/mockStore";
import { dailyEntryScope } from "../lib/rules/access";
import type { TruckScan } from "../lib/rules/types";

const NSSS = "Nuclear Safety, Security & Safeguards" as const;

function scan(over: Partial<Omit<TruckScan, "id">>): Omit<TruckScan, "id"> {
  return {
    date: "2026-09-01",
    week: "W36 2026",
    border: "Nakonde",
    direction: "Inbound",
    vehicleId: "T361DVG",
    vehicleIdKind: "Plate",
    cargoClass: "Food",
    commodity: "Maize",
    transporter: "Simba Logistics",
    doseNSvH: 40,
    result: "Normal",
    officerUid: "u-nakonde",
    officerName: "Nakonde Coordinator",
    ...over,
  } as Omit<TruckScan, "id">;
}

describe("mock store — the scoped reads the security rules require", () => {
  beforeEach(() => resetMockStore());

  it("hands a section its own daily log and a post its own post's", async () => {
    const nakonde = dailyEntryScope({ role: "officer", section: NSSS, border: "Nakonde" });
    const desk = dailyEntryScope({ role: "officer", section: NSSS });
    const all = await mockStore.listDailyEntries();
    const nsss = await mockStore.listDailyEntries(desk);
    const post = await mockStore.listDailyEntries(nakonde);

    // The seeded 2026 screening log is NSSS's and spread over eight posts.
    expect(nsss.length).toBeGreaterThan(0);
    expect(nsss.length).toBeLessThanOrEqual(all.length);
    expect(nsss.every((e) => e.section === NSSS)).toBe(true);
    expect(post.length).toBeGreaterThan(0);
    expect(post.length).toBeLessThan(nsss.length);
    expect(post.every((e) => e.section === NSSS && e.border === "Nakonde")).toBe(true);
  });

  it("hands a posted officer their own post's scans only", async () => {
    await mockStore.addTruckScan(scan({}));
    await mockStore.addTruckScan(scan({ vehicleId: "ABC1234", border: "Chirundu" }));
    await mockStore.addTruckScan(scan({ vehicleId: "DEF5678", week: "W35 2026" }));

    expect((await mockStore.listTruckScans()).length).toBe(3);
    const own = await mockStore.listTruckScans("Nakonde");
    expect(own.length).toBe(2);
    expect(own.every((s) => s.border === "Nakonde")).toBe(true);

    expect((await mockStore.listTruckScansForWeek("W36 2026")).length).toBe(2);
    const ownWeek = await mockStore.listTruckScansForWeek("W36 2026", "Nakonde");
    expect(ownWeek.map((s) => s.vehicleId)).toEqual(["T361DVG"]);
  });
});
