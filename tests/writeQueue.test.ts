import { beforeEach, describe, expect, it } from "vitest";

import { buildScan, emptyDraft } from "../lib/rules/borderScans";
import { mockStore, resetMockStore } from "../lib/store/mockStore";
import type { ScanWatch } from "../lib/store/types";
import {
  dismissWriteFailure,
  resetWriteQueue,
  subscribeWriteQueue,
  trackWrite,
  writeQueueState,
} from "../lib/store/writeQueue";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("writeQueue — what the offline queue tells the officer", () => {
  beforeEach(() => resetWriteQueue());

  it("counts a write in flight until the server answers, and forgets a success", async () => {
    let resolve!: () => void;
    trackWrite("ABC 1234 at 09:14", new Promise<void>((r) => (resolve = r)));
    expect(writeQueueState().inFlight).toBe(1);
    resolve();
    await tick();
    expect(writeQueueState()).toEqual({ inFlight: 0, failures: [] });
  });

  it("keeps a refusal, newest first, with the officer's label and the server's reason", async () => {
    const at = () => new Date("2026-09-21T15:30:00Z");
    trackWrite("ABC 1234 at 09:14", Promise.reject(new Error("PERMISSION_DENIED: Missing or insufficient permissions.")), at);
    trackWrite("DEF 5678 at 09:20", Promise.reject("network down"), at);
    await tick();
    const { inFlight, failures } = writeQueueState();
    expect(inFlight).toBe(0);
    expect(failures.map((f) => f.label)).toEqual(["DEF 5678 at 09:20", "ABC 1234 at 09:14"]);
    expect(failures[1]).toMatchObject({
      message: "PERMISSION_DENIED: Missing or insufficient permissions.",
      at: "2026-09-21T15:30:00.000Z",
    });
    expect(failures[0].message).toBe("network down");
  });

  it("notifies subscribers on every change and lets a refusal be dismissed", async () => {
    let calls = 0;
    const off = subscribeWriteQueue(() => calls++);
    trackWrite("ABC 1234", Promise.reject(new Error("no")));
    await tick();
    expect(calls).toBe(2); // in flight, then refused
    const [failure] = writeQueueState().failures;
    dismissWriteFailure(failure.id);
    expect(writeQueueState().failures).toEqual([]);
    expect(calls).toBe(3);
    dismissWriteFailure(failure.id); // already gone — no notification
    expect(calls).toBe(3);
    off();
    trackWrite("DEF", Promise.resolve());
    await tick();
    expect(calls).toBe(3);
  });

  it("never lets the in-flight count go negative", async () => {
    trackWrite("x", Promise.resolve());
    trackWrite("y", Promise.resolve());
    await tick();
    expect(writeQueueState().inFlight).toBe(0);
  });
});

describe("mock store — the live shift list", () => {
  beforeEach(() => resetMockStore());

  const scan = (vehicleId: string, time: string) =>
    buildScan(
      { ...emptyDraft("Inbound"), vehicleId, commodity: "Copper cathodes", transporter: "X", dose: "80" },
      { date: "2026-09-21", week: "Week 38", border: "Nakonde", time, officerUid: "demo-nakonde" },
    );

  it("delivers the post-day at once, then again after a scan is logged", async () => {
    const seen: ScanWatch[] = [];
    const off = mockStore.watchTruckScansFor("Nakonde", "2026-09-21", (w) => seen.push(w));
    await tick();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ pendingIds: [], fromCache: false });
    const before = seen[0].scans.length;

    await mockStore.addTruckScan(scan("ABC1234", "09:14"));
    // Outside a browser there is no change event; the next delivery is the
    // subscriber's own re-read — what the browser path does on the event.
    off();
    const again: ScanWatch[] = [];
    mockStore.watchTruckScansFor("Nakonde", "2026-09-21", (w) => again.push(w))();
    await tick();
    expect(again[0].scans.length).toBe(before + 1);
    expect(again[0].scans.some((s) => s.vehicleId === "ABC1234" && s.time === "09:14")).toBe(true);
  });

  it("is one post-day only", async () => {
    await mockStore.addTruckScan(scan("ABC1234", "09:14"));
    await mockStore.addTruckScan({ ...scan("ZZZ9999", "10:00"), border: "Chirundu" });
    await mockStore.addTruckScan({ ...scan("YYY8888", "10:00"), date: "2026-09-20" });
    const seen: ScanWatch[] = [];
    mockStore.watchTruckScansFor("Nakonde", "2026-09-21", (w) => seen.push(w))();
    await tick();
    const ids = seen[0].scans.map((s) => s.vehicleId);
    expect(ids).toContain("ABC1234");
    expect(ids).not.toContain("ZZZ9999");
    expect(ids).not.toContain("YYY8888");
  });
});
