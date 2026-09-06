import { describe, expect, it } from "vitest";

import {
  actorOf,
  auditByActor,
  buildAuditEntry,
  diffFields,
  figureDelta,
  netMovement,
  notableChanges,
  summariseChange,
} from "../lib/rules/auditLog";
import type { AuditEntry } from "../lib/rules/types";

const AT = "2026-09-04T16:20:00.000Z";

const figure = {
  date: "2026-09-04",
  week: "W36 — wk of 31 Aug 2026",
  section: "Nuclear Safety, Security & Safeguards",
  kind: "count",
  metricKey: "nsss::Vehicle Screening (units)",
  label: "Vehicle Screening (units)",
  value: 180,
  border: "Ndola",
  updatedBy: "u-ndola",
  updatedByName: "M. Zulu",
  createdAt: AT,
};

describe("diffFields", () => {
  it("reports only what a person changed", () => {
    const changed = diffFields(
      { ...figure },
      { ...figure, value: 6400, createdAt: "2026-09-05T08:00:00.000Z" },
    );
    // createdAt moves on every replace and says nothing about the change.
    expect(Object.keys(changed)).toEqual(["value"]);
    expect(changed.value).toEqual({ from: 180, to: 6400 });
  });

  it("treats a field appearing or vanishing as a change", () => {
    expect(diffFields({ a: 1 }, { a: 1, text: "late entry" })).toEqual({
      text: { from: null, to: "late entry" },
    });
  });
});

describe("actorOf", () => {
  it("reads the writer off a daily entry and off a scan", () => {
    expect(actorOf(figure)).toEqual({ actor: "u-ndola", actorName: "M. Zulu" });
    expect(actorOf({ officerUid: "u-1", officerName: "C. Tembo" })).toEqual({
      actor: "u-1",
      actorName: "C. Tembo",
    });
    expect(actorOf(null)).toEqual({ actor: "", actorName: "" });
  });
});

describe("summariseChange", () => {
  it("names the figure a replacement moved from and to", () => {
    expect(
      summariseChange("dailyEntries", "updated", figure, { ...figure, value: 6400 }),
    ).toBe(
      "M. Zulu changed Vehicle Screening (units) at Ndola for 2026-09-04 from 180 to 6400",
    );
  });

  it("reads a first entry and a removal", () => {
    expect(summariseChange("dailyEntries", "created", null, figure)).toBe(
      "M. Zulu logged Vehicle Screening (units) = 180 at Ndola for 2026-09-04",
    );
    // A delete never names who did it, so the line must not read as though the
    // author removed their own figure — a re-import supersedes typed figures,
    // and 114 of Luuma Michelo's read "Luuma Michelo removed…" before this.
    expect(summariseChange("dailyEntries", "deleted", figure, null)).toBe(
      "Vehicle Screening (units) = 180 at Ndola for 2026-09-04 was removed — last written by M. Zulu",
    );
  });

  it("describes a scan by its unit and reading", () => {
    expect(
      summariseChange(
        "truckScans",
        "created",
        null,
        {
          vehicleId: "T361DVG",
          doseNSvH: 90,
          border: "Nakonde",
          officerName: "A. Phiri",
        },
      ),
    ).toBe("A. Phiri scanned T361DVG (90 nSv/h) at Nakonde");
  });

  it("names the outputs a re-baseline moved", () => {
    const before = { values: { "1.3.12": [0, 0, 9832, 0], "1.2.4": [40, 123, 132, 0] } };
    const after = {
      values: { "1.3.12": [0, 0, 20000, 0], "1.2.4": [40, 123, 132, 0] },
      updatedByName: "Demo Administrator",
    };
    expect(summariseChange("workPlanBaseline", "updated", before, after)).toBe(
      "Demo Administrator saved the work plan opening balance — 1 output changed (1.3.12)",
    );
  });
});

describe("figureDelta", () => {
  it("measures the movement a change makes to the reported figure", () => {
    expect(figureDelta(figure, { ...figure, value: 6400 })).toBe(6220);
    expect(figureDelta(null, figure)).toBe(180);
    expect(figureDelta(figure, null)).toBe(-180);
    // Nothing numeric on either side: a note, not a figure.
    expect(figureDelta({ kind: "note" }, { kind: "note", text: "x" })).toBeUndefined();
  });
});

describe("buildAuditEntry", () => {
  it("records a replacement with what it was and what it became", () => {
    const entry = buildAuditEntry(
      "dailyEntries",
      "screen-2026-09-04-ndola",
      figure,
      { ...figure, value: 6400, updatedByName: "M. Zulu" },
      AT,
    );
    expect(entry).toMatchObject({
      at: AT,
      collection: "dailyEntries",
      docId: "screen-2026-09-04-ndola",
      action: "updated",
      actor: "u-ndola",
      actorIsAuthor: true,
      border: "Ndola",
      date: "2026-09-04",
      section: "Nuclear Safety, Security & Safeguards",
      delta: 6220,
    });
    expect(entry?.changed).toEqual({ value: { from: 180, to: 6400 } });
  });

  it("marks a delete as not attributable to whoever did it", () => {
    const entry = buildAuditEntry("dailyEntries", "d1", figure, null, AT);
    expect(entry).toMatchObject({ action: "deleted", actorIsAuthor: false });
  });

  it("says nothing about a write that changed nothing a person did", () => {
    expect(
      buildAuditEntry(
        "dailyEntries",
        "d1",
        figure,
        { ...figure, createdAt: "2026-09-05T09:00:00.000Z" },
        AT,
      ),
    ).toBeNull();
  });

  it("has nothing to record when there is no document either side", () => {
    expect(buildAuditEntry("dailyEntries", "d1", null, null, AT)).toBeNull();
  });
});

describe("reading the log back", () => {
  const rows: AuditEntry[] = [
    {
      id: "1",
      at: "2026-09-04T10:00:00.000Z",
      collection: "dailyEntries",
      docId: "a",
      action: "created",
      actor: "u1",
      actorName: "M. Zulu",
      actorIsAuthor: true,
      summary: "logged 180",
      delta: 180,
    },
    {
      id: "2",
      at: "2026-09-04T16:00:00.000Z",
      collection: "dailyEntries",
      docId: "b",
      action: "updated",
      actor: "u1",
      actorName: "M. Zulu",
      actorIsAuthor: true,
      summary: "changed 180 to 6400",
      delta: 6220,
    },
    {
      id: "3",
      at: "2026-09-04T17:00:00.000Z",
      collection: "dailyEntries",
      docId: "c",
      action: "created",
      actor: "u2",
      actorName: "C. Tembo",
      actorIsAuthor: true,
      summary: "logged 9000",
      delta: 9000,
    },
  ];

  it("keeps replacements and big moves, and hides routine logging", () => {
    const notable = notableChanges(rows, 1000);
    // The 180 first entry is ordinary; the replacement and the 9,000 are not.
    expect(notable.map((r) => r.id)).toEqual(["3", "2"]);
  });

  it("totals the movement and attributes it", () => {
    expect(netMovement(rows)).toBe(15400);
    const actors = auditByActor(rows);
    expect(actors[0]).toMatchObject({ actor: "u2", net: 9000, changes: 1 });
    expect(actors[1]).toMatchObject({
      actor: "u1",
      net: 6400,
      changes: 2,
      last: "2026-09-04T16:00:00.000Z",
    });
  });
});
