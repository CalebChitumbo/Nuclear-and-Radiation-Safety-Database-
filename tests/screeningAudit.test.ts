import { describe, expect, it } from "vitest";

import { vehicleScreeningKey, VEHICLE_SCREENING_LABEL } from "../lib/rules/daily";
import {
  auditScreening,
  backdatedEntries,
  byActor,
  changesBetween,
  duplicatePostDays,
  outlyingEntries,
  screeningEntries,
  screeningEntriesToCsv,
  totalAsOf,
} from "../lib/rules/screeningAudit";
import type { DailyEntry } from "../lib/rules/types";

const KEY = vehicleScreeningKey();
const SECTION = "Nuclear Safety, Security & Safeguards" as const;

let seq = 0;

function entry(patch: Partial<DailyEntry> = {}): DailyEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    date: "2026-09-01",
    week: "W36 — wk of 31 Aug 2026",
    section: SECTION,
    kind: "count",
    metricKey: KEY,
    label: VEHICLE_SCREENING_LABEL,
    value: 200,
    border: "Ndola",
    updatedBy: "officer-1",
    updatedByName: "N. Banda",
    createdAt: "2026-09-01T15:00:00.000Z",
    ...patch,
  };
}

/** A post's ordinary run of days, so the outlier check has a median to work on. */
function ordinaryDays(border: string, value: number, count = 8): DailyEntry[] {
  return Array.from({ length: count }, (_, i) =>
    entry({
      border,
      value,
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      createdAt: `2026-08-${String(i + 1).padStart(2, "0")}T15:00:00.000Z`,
    }),
  );
}

describe("screeningEntries", () => {
  it("keeps only the screening counts", () => {
    const entries = [
      entry(),
      entry({ kind: "note", text: "Officers trained", value: undefined }),
      entry({ metricKey: "nsss::Something else" }),
    ];
    expect(screeningEntries(entries)).toHaveLength(1);
  });
});

describe("totalAsOf and changesBetween", () => {
  const entries = [
    // Imported at handover: no createdAt, so always counted.
    entry({ value: 1000, updatedBy: "seed", createdAt: undefined }),
    entry({ value: 300, createdAt: "2026-09-03T08:00:00.000Z" }),
    entry({ value: 9000, createdAt: "2026-09-04T16:20:00.000Z" }),
  ];

  it("counts imported entries as always present", () => {
    expect(totalAsOf(entries, "2026-01-01T00:00:00.000Z")).toBe(1000);
  });

  it("reports the total at a moment", () => {
    expect(totalAsOf(entries, "2026-09-03T12:00:00.000Z")).toBe(1300);
  });

  it("names the entries behind a jump", () => {
    const change = changesBetween(
      entries,
      "2026-09-03T12:00:00.000Z",
      "2026-09-05T00:00:00.000Z",
    );
    expect(change.totalBefore).toBe(1300);
    expect(change.addedTotal).toBe(9000);
    expect(change.totalAfter).toBe(10300);
    expect(change.added.map((e) => e.value)).toEqual([9000]);
  });
});

describe("duplicatePostDays", () => {
  it("finds a day the workbook and an officer both hold", () => {
    const seeded = entry({
      date: "2026-08-10",
      value: 180,
      updatedBy: "seed",
      createdAt: undefined,
    });
    const logged = entry({ date: "2026-08-10", value: 175 });
    const [dup] = duplicatePostDays([seeded, logged, entry({ date: "2026-08-11" })]);

    expect(dup.border).toBe("Ndola");
    expect(dup.date).toBe("2026-08-10");
    expect(dup.includesSeeded).toBe(true);
    // The day is worth its largest single figure; the rest is over-count.
    expect(dup.excess).toBe(175);
  });

  it("keeps a post name that has a space in it", () => {
    const dups = duplicatePostDays([
      entry({ border: "Kapiri Mposhi", date: "2026-08-10" }),
      entry({ border: "Kapiri Mposhi", date: "2026-08-10" }),
    ]);
    expect(dups[0].border).toBe("Kapiri Mposhi");
    expect(dups[0].date).toBe("2026-08-10");
  });

  it("does not group two posts' figures for the same day together", () => {
    expect(
      duplicatePostDays([
        entry({ border: "Mongu", date: "2026-08-10" }),
        entry({ border: "Ndola", date: "2026-08-10" }),
      ]),
    ).toEqual([]);
  });
});

describe("outlyingEntries", () => {
  it("flags a month-sized figure against the post's own usual day", () => {
    const entries = [
      ...ordinaryDays("Ndola", 175),
      entry({ border: "Ndola", date: "2026-08-31", value: 9000 }),
    ];
    const [outlier] = outlyingEntries(entries);
    expect(outlier.entry.value).toBe(9000);
    expect(outlier.median).toBe(175);
    expect(outlier.factor).toBeCloseTo(9000 / 175);
  });

  it("judges each post against itself, not the department", () => {
    // Katete's ordinary 65 must not read as an outlier beside Kapiri Mposhi.
    const entries = [
      ...ordinaryDays("Kapiri Mposhi", 386),
      ...ordinaryDays("Katete", 65),
    ];
    expect(outlyingEntries(entries)).toEqual([]);
  });

  it("says nothing about a post with too few days to judge", () => {
    expect(outlyingEntries([entry({ value: 9000 }), entry({ value: 10 })])).toEqual([]);
  });
});

describe("backdatedEntries", () => {
  it("measures the lag between the day and the write", () => {
    const [late] = backdatedEntries([
      entry({ date: "2026-08-01", createdAt: "2026-09-04T16:00:00.000Z" }),
      entry({ date: "2026-09-04", createdAt: "2026-09-04T16:00:00.000Z" }),
    ]);
    expect(late.lagDays).toBe(34);
  });

  it("ignores imported entries, which have no write time", () => {
    expect(
      backdatedEntries([
        entry({ date: "2026-01-05", updatedBy: "seed", createdAt: undefined }),
      ]),
    ).toEqual([]);
  });
});

describe("byActor", () => {
  it("totals each account's figures and its last write", () => {
    const actors = byActor([
      entry({ updatedBy: "u1", updatedByName: "A. Phiri", value: 100 }),
      entry({
        updatedBy: "u1",
        updatedByName: "A. Phiri",
        value: 50,
        border: "Mongu",
        createdAt: "2026-09-04T16:26:00.000Z",
      }),
      entry({ updatedBy: "seed", updatedByName: "2026 workbook", value: 20 }),
    ]);
    expect(actors[0]).toMatchObject({
      uid: "u1",
      name: "A. Phiri",
      entries: 2,
      total: 150,
      lastWrite: "2026-09-04T16:26:00.000Z",
      borders: ["Mongu", "Ndola"],
    });
    expect(actors[1].total).toBe(20);
  });
});

describe("auditScreening", () => {
  const entries = [
    entry({ value: 1000, updatedBy: "seed", updatedByName: "2026 workbook", createdAt: undefined }),
    entry({ value: 9000, createdAt: "2026-09-04T16:20:00.000Z" }),
    entry({ kind: "note", text: "not a count", value: undefined }),
  ];

  it("splits the cumulative figure into where each part came from", () => {
    const audit = auditScreening({
      entries,
      openingBalance: [0, 0, 9832, 0],
      since: "2026-09-04T00:00:00.000Z",
    });
    expect(audit.entries).toHaveLength(2);
    expect(audit.seededTotal).toBe(1000);
    expect(audit.loggedTotal).toBe(9000);
    expect(audit.openingBalance).toBe(9832);
    expect(audit.grandTotal).toBe(19832);
    expect(audit.change?.addedTotal).toBe(9000);
  });

  it("has no window when none was asked for", () => {
    expect(auditScreening({ entries }).change).toBeNull();
  });
});

describe("screeningEntriesToCsv", () => {
  it("writes the trail newest write first, naming the source of each row", () => {
    const csv = screeningEntriesToCsv([
      entry({ value: 1000, updatedBy: "seed", updatedByName: "2026 workbook", createdAt: undefined }),
      entry({ value: 9000, createdAt: "2026-09-04T16:20:00.000Z" }),
    ]).split("\n");

    expect(csv[0]).toBe(
      "Written at,Day reported,Week,Post,Vehicles,Source,Officer,Account,Remark,Entry id",
    );
    expect(csv[1]).toContain("2026-09-04T16:20:00.000Z");
    expect(csv[1]).toContain("Typed in");
    expect(csv[2]).toContain("(imported)");
    expect(csv[2]).toContain("Workbook import");
  });
});
