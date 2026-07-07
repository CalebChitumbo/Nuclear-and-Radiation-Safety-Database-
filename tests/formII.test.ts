import { describe, expect, it } from "vitest";
import {
  applyFormIIAction,
  buildFurtherParticulars,
  formIIState,
  formIIStats,
} from "../lib/rules/formII";
import { addWorkingDays } from "../lib/rules/workingDays";
import type { FurtherParticularsRecord } from "../lib/rules/types";

const actor = { uid: "u1", name: "A&S Officer" };
const NOW = "2026-06-10T08:00:00.000Z";

function fresh(issued = "2026-06-10"): FurtherParticularsRecord {
  return {
    id: "fp1",
    ...buildFurtherParticulars(
      {
        ran: "AUTH/USE.NEW/0100",
        facilityId: "f1",
        facilityName: "Kitwe Imaging Centre",
        facCode: "FAC/0001",
        details: "Missing RPO appointment letter and layout plan.",
        issuedDate: issued,
      },
      actor,
      NOW,
    ),
  };
}

describe("buildFurtherParticulars", () => {
  it("computes the 14-working-day response due date", () => {
    const r = fresh("2026-06-10");
    expect(r.status).toBe("Awaiting Response");
    expect(r.dueDate).toBe(addWorkingDays("2026-06-10", 14));
  });

  it("rejects an empty request", () => {
    expect(() =>
      buildFurtherParticulars(
        {
          facilityId: null,
          facilityName: "X",
          details: "   ",
          issuedDate: "2026-06-10",
        },
        actor,
        NOW,
      ),
    ).toThrow();
  });
});

describe("formIIState", () => {
  it("walks awaiting → due-soon → expired", () => {
    const r = fresh("2026-06-10");
    expect(formIIState(r, "2026-06-11")).toBe("awaiting");
    expect(formIIState(r, addWorkingDays("2026-06-10", 11))).toBe("due-soon");
    expect(formIIState(r, addWorkingDays(r.dueDate, 1))).toBe("expired");
  });

  it("marks responses on time and late", () => {
    const onTime = applyFormIIAction(
      fresh(),
      { kind: "respond", date: "2026-06-15" },
      actor,
      NOW,
    );
    expect(onTime.status).toBe("Responded");
    expect(formIIState(onTime, "2026-08-01")).toBe("responded");

    const late = applyFormIIAction(
      fresh(),
      { kind: "respond", date: "2026-08-01" },
      actor,
      NOW,
    );
    expect(formIIState(late, "2026-08-02")).toBe("responded-late");
  });

  it("only an awaiting record can be actioned", () => {
    const done = applyFormIIAction(
      fresh(),
      { kind: "respond", date: "2026-06-15" },
      actor,
      NOW,
    );
    expect(() =>
      applyFormIIAction(done, { kind: "withdraw" }, actor, NOW),
    ).toThrow(/already/);
  });
});

describe("formIIStats", () => {
  it("summarises the queue with expired highlighted", () => {
    const awaiting = fresh("2026-06-10");
    const expired = fresh("2026-01-05");
    const responded = applyFormIIAction(
      fresh("2026-06-10"),
      { kind: "respond", date: "2026-06-12" },
      actor,
      NOW,
    );
    const stats = formIIStats([awaiting, expired, responded], "2026-06-11");
    expect(stats.total).toBe(3);
    expect(stats.awaiting).toBe(1);
    expect(stats.expired).toBe(1);
    expect(stats.responded).toBe(1);
  });
});
