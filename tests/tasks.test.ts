/**
 * The Tasks desk — the reporting line, the state machine, the derived standing.
 */
import { describe, expect, it } from "vitest";

import {
  allowedTaskActions,
  applyTaskAction,
  assignableFor,
  assignerSummary,
  assignmentBlocker,
  buildTask,
  chainAbove,
  daysBetween,
  deskFor,
  directoryEntry,
  inTaskScope,
  orgChart,
  peersOf,
  reviewQueue,
  sharedSupervisor,
  taskBadge,
  taskScopeFor,
  taskStanding,
  taskStats,
  turnaroundDays,
  workingDaysBetween,
  zambianPublicHolidays,
} from "../lib/rules/tasks";
import type { DirectoryEntry, Task, TaskParty, UserDoc } from "../lib/rules/types";

// The department: Director → Manager → a Senior Officer per section → officers.
const DIR: DirectoryEntry[] = [
  { uid: "dnrs", displayName: "The Director", section: "All", grade: "Director", active: true },
  { uid: "mnrs", displayName: "The Manager", section: "All", grade: "Manager", reportsTo: "dnrs", active: true },
  { uid: "sn-as", displayName: "Senior A&S", section: "Authorisation & Standards", grade: "Senior Officer", reportsTo: "mnrs", active: true },
  { uid: "sn-insp", displayName: "Senior Insp", section: "Inspectorate", grade: "Senior Officer", reportsTo: "mnrs", active: true },
  { uid: "sn-nsss", displayName: "Senior NSSS", section: "Nuclear Safety, Security & Safeguards", grade: "Senior Officer", reportsTo: "mnrs", active: true },
  { uid: "of-as", displayName: "Officer A&S", section: "Authorisation & Standards", grade: "Officer", reportsTo: "sn-as", active: true },
  { uid: "of-as2", displayName: "Officer A&S Two", section: "Authorisation & Standards", grade: "Officer", reportsTo: "sn-as", active: true },
  { uid: "of-insp", displayName: "Officer Insp", section: "Inspectorate", grade: "Officer", reportsTo: "sn-insp", active: true },
  { uid: "tech-as", displayName: "Technologist A&S", section: "Authorisation & Standards", grade: "Technologist", reportsTo: "of-as", active: true },
  { uid: "nakonde", displayName: "Nakonde Coordinator", section: "Nuclear Safety, Security & Safeguards", border: "Nakonde", grade: "Officer", reportsTo: "sn-nsss", active: true },
  { uid: "gone", displayName: "Left The Authority", section: "Inspectorate", grade: "Officer", reportsTo: "sn-insp", active: false },
  { uid: "new", displayName: "Not Yet Placed", section: "Inspectorate", active: true },
];

const party = (uid: string): TaskParty => {
  const e = DIR.find((d) => d.uid === uid)!;
  return { uid, name: e.displayName, section: e.section, ...(e.grade ? { grade: e.grade } : {}) };
};
const entry = (uid: string) => DIR.find((d) => d.uid === uid)!;

const T0 = "2026-09-14T08:00:00.000Z"; // a Monday
const give = (by: string, to: string, dueDate = "2026-09-18", extra: Partial<Parameters<typeof buildTask>[0]> = {}): Task => ({
  ...buildTask({ title: "Respond to MoH letter", category: "Letter response", dueDate, assignTo: entry(to), ...extra }, party(by), DIR, T0),
  id: `t-${by}-${to}`,
});

describe("the directory", () => {
  it("projects an account to its directory line, active only when approved and enabled", () => {
    const u: UserDoc = { uid: "x", email: "x@rpa.gov.zm", displayName: "X", role: "officer", section: "Inspectorate", grade: "Officer", reportsTo: "sn-insp" };
    expect(directoryEntry(u)).toEqual({ uid: "x", displayName: "X", section: "Inspectorate", grade: "Officer", reportsTo: "sn-insp", active: true });
    expect(directoryEntry({ ...u, pending: true }).active).toBe(false);
    expect(directoryEntry({ ...u, disabled: true }).active).toBe(false);
    // A cleared grade is not carried.
    expect(directoryEntry({ ...u, grade: "", reportsTo: "" })).not.toHaveProperty("grade");
  });

  it("reads the line above an account and stops at the top", () => {
    expect(chainAbove("tech-as", DIR).map((d) => d.uid)).toEqual(["of-as", "sn-as", "mnrs", "dnrs"]);
    expect(chainAbove("dnrs", DIR)).toEqual([]);
  });

  it("survives a loop in a mis-set directory", () => {
    const loop: DirectoryEntry[] = [
      { uid: "a", displayName: "A", section: "All", reportsTo: "b", active: true },
      { uid: "b", displayName: "B", section: "All", reportsTo: "a", active: true },
    ];
    expect(chainAbove("a", loop).map((d) => d.uid)).toEqual(["b"]);
    expect(orgChart(loop).length).toBeGreaterThan(0);
  });

  it("draws the org chart top down, name order", () => {
    const chart = orgChart(DIR);
    expect(chart.map((n) => n.entry.uid)).toEqual(["new", "dnrs"]);
    const dnrs = chart.find((n) => n.entry.uid === "dnrs")!;
    expect(dnrs.reports.map((n) => n.entry.uid)).toEqual(["mnrs"]);
    expect(dnrs.reports[0].reports.map((n) => n.entry.uid)).toEqual(["sn-as", "sn-insp", "sn-nsss"]);
  });

  it("knows peers — the same supervisor, active, not oneself", () => {
    expect(peersOf("sn-as", DIR).map((d) => d.uid)).toEqual(["sn-insp", "sn-nsss"]);
    expect(peersOf("of-insp", DIR).map((d) => d.uid)).toEqual([]); // "gone" is inactive
    expect(peersOf("dnrs", DIR)).toEqual([]);
  });
});

describe("who may give work to whom", () => {
  it("is a direct report, a peer, one's own supervisor — or oneself", () => {
    expect(assignmentBlocker("sn-as", "of-as", DIR)).toBe("");
    expect(assignmentBlocker("sn-as", "sn-insp", DIR)).toBe("");
    expect(assignmentBlocker("sn-as", "mnrs", DIR)).toBe("");
    expect(assignmentBlocker("sn-as", "sn-as", DIR)).toBe("");
  });

  it("refuses an officer in another line and names the supervisor to go through", () => {
    expect(assignmentBlocker("sn-as", "of-insp", DIR)).toBe(
      "Officer Insp reports to Senior Insp. Assign it to Senior Insp, who can pass it on.",
    );
    // Two levels down one's own line is still through the person between.
    expect(assignmentBlocker("mnrs", "of-as", DIR)).toMatch(/Assign it to Senior A&S/);
    // A technologist under an officer, from that officer's supervisor.
    expect(assignmentBlocker("sn-as", "tech-as", DIR)).toMatch(/Assign it to Officer A&S/);
  });

  it("refuses inactive and unplaced accounts, and an actor the directory does not hold", () => {
    expect(assignmentBlocker("sn-insp", "gone", DIR)).toMatch(/not active/);
    expect(assignmentBlocker("sn-insp", "new", DIR)).toMatch(/no supervisor placed/);
    expect(assignmentBlocker("nobody", "of-as", DIR)).toMatch(/not in the staff directory yet/);
    expect(assignmentBlocker("sn-as", "ghost", DIR)).toMatch(/not in the staff directory/);
  });

  it("lets an administrator reach anyone active", () => {
    expect(assignmentBlocker("dnrs", "tech-as", DIR, true)).toBe("");
    expect(assignmentBlocker("dnrs", "gone", DIR, true)).toMatch(/not active/);
  });

  it("groups the picker by the line", () => {
    expect(assignableFor("sn-as", DIR).map((g) => [g.heading, g.entries.map((e) => e.uid)])).toEqual([
      ["Myself", ["sn-as"]],
      ["My team", ["of-as", "of-as2"]],
      ["Peers", ["sn-insp", "sn-nsss"]],
      ["My supervisor", ["mnrs"]],
    ]);
    // The top of the line has no peers and no supervisor; an administrator sees the rest.
    expect(assignableFor("dnrs", DIR).map((g) => g.heading)).toEqual(["Myself", "My team"]);
    const adminGroups = assignableFor("dnrs", DIR, true);
    expect(adminGroups.at(-1)?.heading).toBe("Everyone else");
    expect(adminGroups.at(-1)?.entries.map((e) => e.uid)).not.toContain("gone");
  });

  it("puts the shared supervisor in the loop when peers task each other", () => {
    expect(sharedSupervisor("sn-as", "sn-insp", DIR)?.uid).toBe("mnrs");
    expect(sharedSupervisor("sn-as", "of-as", DIR)).toBeNull();
    const t = give("sn-as", "sn-insp");
    expect(t.watcherUids).toEqual(["mnrs"]);
    expect(give("sn-as", "of-as").watcherUids).toEqual([]);
  });
});

describe("building a task", () => {
  it("opens Assigned, to the officer, filed under their section, with a created event", () => {
    const t = give("sn-as", "of-as");
    expect(t.status).toBe("Assigned");
    expect(t.assignedToUid).toBe("of-as");
    expect(t.assignedByUid).toBe("sn-as");
    expect(t.section).toBe("Authorisation & Standards");
    expect(t.self).toBe(false);
    expect(t.dueDate).toBe("2026-09-18");
    expect(t.originalDueDate).toBe("2026-09-18");
    expect(t.seenAt).toBeUndefined();
    expect(t.events).toHaveLength(1);
    expect(t.events[0]).toMatchObject({ kind: "created", by: "sn-as", status: "Assigned", dueDate: "2026-09-18" });
    expect(t.events[0].text).toBe("Assigned to Officer A&S, due 2026-09-18.");
  });

  it("marks a self-assigned task seen, and never writes undefined fields", () => {
    const t = give("of-as", "of-as", "");
    expect(t.self).toBe(true);
    expect(t.seenAt).toBe(T0);
    expect(t.events[0].text).toBe("Added to own desk.");
    for (const [k, v] of Object.entries(t)) expect(v, k).not.toBeUndefined();
  });

  it("refuses an empty title, an off-line officer and a malformed date", () => {
    expect(() => give("sn-as", "of-as", "2026-09-18", { title: "  " })).toThrow(/title/);
    expect(() => give("sn-as", "of-insp")).toThrow(/Senior Insp/);
    expect(() => give("sn-as", "of-as", "18/09/2026")).toThrow(/YYYY-MM-DD/);
  });

  it("links a passed-on task to its parent", () => {
    const parent = give("mnrs", "sn-as");
    const child = buildTask(
      { title: parent.title, category: parent.category, dueDate: parent.dueDate, assignTo: entry("of-as") },
      party("sn-as"),
      DIR,
      T0,
      { parent: { id: parent.id, title: parent.title } },
    );
    expect(child.parentId).toBe(parent.id);
    expect(child.parentTitle).toBe(parent.title);
  });
});

describe("the lifecycle", () => {
  const officer = { uid: "of-as" };
  const boss = { uid: "sn-as" };
  const later = (n: number) => `2026-09-${String(14 + n).padStart(2, "0")}T10:00:00.000Z`;

  it("start → hand back → accept, each an event, each party its own moves", () => {
    let t = give("sn-as", "of-as");
    expect(allowedTaskActions(t, officer)).toEqual(["start", "submit", "request-extension", "comment"]);
    expect(allowedTaskActions(t, boss)).toEqual(["deadline", "reassign", "cancel", "comment"]);
    expect(allowedTaskActions(t, { uid: "of-insp" })).toEqual([]);

    t = applyTaskAction(t, { kind: "seen" }, party("of-as"), later(0));
    expect(t.seenAt).toBe(later(0));
    // Seen is once, by the officer only.
    expect(applyTaskAction(t, { kind: "seen" }, party("of-as"), later(1))).toBe(t);

    t = applyTaskAction(t, { kind: "start" }, party("of-as"), later(1), officer);
    expect(t.status).toBe("In Progress");
    expect(t.startedAt).toBe(later(1));

    t = applyTaskAction(t, { kind: "submit", outcome: "Done", note: "Sent 16 Sep" }, party("of-as"), later(2), officer);
    expect(t.status).toBe("Submitted");
    expect(t.outcome).toBe("Done");
    expect(t.submittedAt).toBe(later(2));
    expect(allowedTaskActions(t, officer)).toEqual(["comment"]);
    expect(allowedTaskActions(t, boss)).toEqual(["close", "return", "cancel", "comment"]);

    t = applyTaskAction(t, { kind: "close" }, party("sn-as"), later(3), boss);
    expect(t.status).toBe("Closed");
    expect(t.closedAt).toBe(later(3));
    expect(t.events.map((e) => e.kind)).toEqual(["created", "seen", "started", "submitted", "closed"]);
    expect(allowedTaskActions(t, boss)).toEqual(["comment"]);
  });

  it("returns a handed-back task to the officer with comments, counting the return", () => {
    let t = give("sn-as", "of-as");
    t = applyTaskAction(t, { kind: "submit", outcome: "Done" }, party("of-as"), later(1), officer);
    expect(() => applyTaskAction(t, { kind: "return", note: " " }, party("sn-as"), later(2), boss)).toThrow(/comment/);
    t = applyTaskAction(t, { kind: "return", note: "Missing the annex", dueDate: "2026-09-22" }, party("sn-as"), later(2), boss);
    expect(t.status).toBe("In Progress");
    expect(t.returns).toBe(1);
    expect(t.dueDate).toBe("2026-09-22");
    expect(t.originalDueDate).toBe("2026-09-18");
    expect(t).not.toHaveProperty("outcome");
    expect(t).not.toHaveProperty("submittedAt");
  });

  it("insists on a reason when it could not be done", () => {
    const t = give("sn-as", "of-as");
    expect(() => applyTaskAction(t, { kind: "submit", outcome: "Not done" }, party("of-as"), later(1), officer)).toThrow(/why/);
  });

  it("lets the officer ask for more time and the assigner answer", () => {
    let t = give("sn-as", "of-as");
    expect(() =>
      applyTaskAction(t, { kind: "request-extension", dueDate: "2026-09-17", reason: "x" }, party("of-as"), later(1), officer),
    ).toThrow(/after the current deadline/);
    t = applyTaskAction(t, { kind: "request-extension", dueDate: "2026-09-25", reason: "Awaiting MoH" }, party("of-as"), later(1), officer);
    expect(t.extensionRequest).toEqual({ dueDate: "2026-09-25", reason: "Awaiting MoH", at: later(1) });
    expect(allowedTaskActions(t, officer)).not.toContain("request-extension");
    expect(allowedTaskActions(t, boss)).toContain("approve-extension");

    const declined = applyTaskAction(t, { kind: "decline-extension", note: "Needed for the Board" }, party("sn-as"), later(2), boss);
    expect(declined.dueDate).toBe("2026-09-18");
    expect(declined).not.toHaveProperty("extensionRequest");

    const approved = applyTaskAction(t, { kind: "approve-extension" }, party("sn-as"), later(2), boss);
    expect(approved.dueDate).toBe("2026-09-25");
    expect(approved.originalDueDate).toBe("2026-09-18");
    expect(approved).not.toHaveProperty("extensionRequest");
  });

  it("records a moved deadline with its reason, and refuses a no-op", () => {
    let t = give("sn-as", "of-as");
    expect(() => applyTaskAction(t, { kind: "deadline", dueDate: "2026-09-18", reason: "x" }, party("sn-as"), later(1), boss)).toThrow(/already/);
    t = applyTaskAction(t, { kind: "deadline", dueDate: "2026-09-16", reason: "Board sits Thursday" }, party("sn-as"), later(1), boss);
    expect(t.dueDate).toBe("2026-09-16");
    expect(t.events.at(-1)?.text).toBe("Deadline moved from 2026-09-18 to 2026-09-16: Board sits Thursday");
  });

  it("reassigns along the line, resetting what the first officer had done", () => {
    let t = give("sn-as", "of-as");
    t = applyTaskAction(t, { kind: "start" }, party("of-as"), later(1), officer);
    t = applyTaskAction(t, { kind: "reassign", to: entry("of-as2") }, party("sn-as"), later(2), boss);
    expect(t.assignedToUid).toBe("of-as2");
    expect(t.status).toBe("Assigned");
    expect(t).not.toHaveProperty("seenAt");
    expect(t).not.toHaveProperty("startedAt");
    expect(t.events.at(-1)?.text).toBe("Reassigned from Officer A&S to Officer A&S Two.");
  });

  it("lets a supervisor pass a task on and keeps it open on their desk", () => {
    let t = give("mnrs", "sn-as");
    const senior = { uid: "sn-as", hasReports: true };
    expect(allowedTaskActions(t, senior)).toContain("passed-on");
    expect(allowedTaskActions(t, { uid: "sn-as", hasReports: false })).not.toContain("passed-on");
    t = applyTaskAction(t, { kind: "passed-on", to: party("of-as"), childId: "child-1" }, party("sn-as"), later(1), senior);
    expect(t.status).toBe("In Progress");
    expect(t.events.at(-1)?.text).toBe("Passed on to Officer A&S (task child-1).");
  });

  it("cancels only with a reason, from any live state, by the assigner", () => {
    const t = give("sn-as", "of-as");
    expect(() => applyTaskAction(t, { kind: "cancel", reason: "" }, party("sn-as"), later(1), boss)).toThrow(/reason/);
    expect(() => applyTaskAction(t, { kind: "cancel", reason: "Overtaken" }, party("of-as"), later(1), officer)).toThrow(/not available/);
    const c = applyTaskAction(t, { kind: "cancel", reason: "Overtaken by events" }, party("sn-as"), later(1), boss);
    expect(c.status).toBe("Cancelled");
    expect(allowedTaskActions(c, boss)).toEqual(["comment"]);
  });

  it("gives a self-assigned task both sides to its one party, without the extension theatre", () => {
    const t = give("of-as", "of-as");
    expect(allowedTaskActions(t, officer)).toEqual(["start", "submit", "deadline", "cancel", "comment"]);
  });

  it("lets a watcher comment and nothing else", () => {
    const t = give("sn-as", "sn-insp");
    expect(allowedTaskActions(t, { uid: "mnrs" })).toEqual(["comment"]);
    const c = applyTaskAction(t, { kind: "comment", note: "Copy me on the reply" }, party("mnrs"), later(1), { uid: "mnrs" });
    expect(c.events.at(-1)).toMatchObject({ kind: "comment", by: "mnrs", text: "Copy me on the reply" });
  });

  it("lets an administrator act on either side", () => {
    const t = give("sn-as", "of-as");
    expect(allowedTaskActions(t, { uid: "dnrs", isAdmin: true })).toEqual(
      expect.arrayContaining(["start", "submit", "deadline", "reassign", "cancel"]),
    );
  });
});

describe("dates", () => {
  it("knows Zambia's public holidays, observed on the Monday when they fall on a Sunday", () => {
    const h = zambianPublicHolidays(2026);
    expect(h).toContain("2026-01-01");
    expect(h).toContain("2026-04-03"); // Good Friday
    expect(h).toContain("2026-04-06"); // Easter Monday
    expect(h).toContain("2026-07-06"); // Heroes' Day
    expect(h).toContain("2026-07-07"); // Unity Day
    expect(h).toContain("2026-08-03"); // Farmers' Day
    expect(h).toContain("2026-10-19"); // Prayer Day, 18 Oct 2026 is a Sunday
    expect(h).not.toContain("2026-10-18");
    expect(h).toContain("2026-10-24");
  });

  it("counts working days, skipping weekends and holidays", () => {
    expect(workingDaysBetween("2026-09-14", "2026-09-14")).toBe(0);
    expect(workingDaysBetween("2026-09-14", "2026-09-16")).toBe(2);
    expect(workingDaysBetween("2026-09-18", "2026-09-21")).toBe(1); // over a weekend
    expect(workingDaysBetween("2026-10-16", "2026-10-20")).toBe(1); // over a weekend + Prayer Day
    expect(workingDaysBetween("2026-09-16", "2026-09-14")).toBe(-2);
    expect(workingDaysBetween("2026-09-14T08:00:00.000Z", "2026-09-16T17:00:00.000Z")).toBe(2);
    expect(daysBetween("2026-09-14", "2026-09-21")).toBe(7);
  });
});

describe("standing", () => {
  const today = "2026-09-16";
  it("reads an open task off its deadline", () => {
    expect(taskStanding(give("sn-as", "of-as", "2026-09-14"), today)).toMatchObject({ key: "overdue", daysLate: 2, chip: "red" });
    expect(taskStanding(give("sn-as", "of-as", "2026-09-16"), today).key).toBe("due-today");
    expect(taskStanding(give("sn-as", "of-as", "2026-09-18"), today).key).toBe("due-soon");
    expect(taskStanding(give("sn-as", "of-as", "2026-09-30"), today).key).toBe("on-track");
    expect(taskStanding(give("sn-as", "of-as", ""), today).key).toBe("no-deadline");
  });

  it("reads a handed-back or closed task off when it came back", () => {
    let t = give("sn-as", "of-as", "2026-09-15");
    t = applyTaskAction(t, { kind: "submit", outcome: "Done" }, party("of-as"), "2026-09-17T09:00:00.000Z", { uid: "of-as" });
    expect(taskStanding(t, "2026-09-30")).toMatchObject({ key: "awaiting-review", late: true, daysLate: 2 });
    const closed = applyTaskAction(t, { kind: "close" }, party("sn-as"), "2026-09-20T09:00:00.000Z", { uid: "sn-as" });
    expect(taskStanding(closed, "2026-09-30")).toMatchObject({ key: "closed", late: true, daysLate: 2, chip: "amber" });
    expect(turnaroundDays(closed)).toBe(3);

    let onTime = give("sn-as", "of-as", "2026-09-18");
    onTime = applyTaskAction(onTime, { kind: "submit", outcome: "Done" }, party("of-as"), "2026-09-17T09:00:00.000Z", { uid: "of-as" });
    onTime = applyTaskAction(onTime, { kind: "close" }, party("sn-as"), "2026-09-25T09:00:00.000Z", { uid: "sn-as" });
    expect(taskStanding(onTime, "2026-09-30")).toMatchObject({ key: "closed", late: false, label: "Closed on time" });
  });
});

describe("the desk, the queue, the badge, the summary", () => {
  const today = "2026-09-16";
  const tasks: Task[] = [
    { ...give("sn-as", "of-as", "2026-09-14"), id: "overdue" },
    { ...give("sn-as", "of-as", "2026-09-16"), id: "today" },
    { ...give("sn-as", "of-as", "2026-09-22"), id: "week" },
    { ...give("sn-as", "of-as", "2026-10-30"), id: "later" },
    { ...give("sn-as", "of-as", ""), id: "none" },
    { ...give("of-as", "of-as", "2026-09-30"), id: "own" },
    { ...give("sn-as", "of-as2", "2026-09-30"), id: "other" },
  ];
  const submitted = applyTaskAction({ ...give("sn-as", "of-as", "2026-09-15"), id: "back" }, { kind: "submit", outcome: "Done" }, party("of-as"), "2026-09-15T09:00:00.000Z", { uid: "of-as" });
  const closed = applyTaskAction(submitted, { kind: "close" }, party("sn-as"), "2026-09-15T10:00:00.000Z", { uid: "sn-as" });
  const asking = applyTaskAction({ ...give("sn-as", "of-as2", "2026-09-20"), id: "asking" }, { kind: "request-extension", dueDate: "2026-09-27", reason: "MoH" }, party("of-as2"), "2026-09-15T09:00:00.000Z", { uid: "of-as2" });
  const all = [...tasks, submitted, { ...closed, id: "closed" }, asking];

  it("groups the officer's desk by when things are due", () => {
    expect(deskFor(all, "of-as", today).map((g) => [g.heading, g.tasks.map((t) => t.id)])).toEqual([
      ["Overdue", ["overdue"]],
      ["Due today", ["today"]],
      ["This week", ["week"]],
      ["Later", ["own", "later"]],
      ["No deadline", ["none"]],
      ["Handed back", ["back"]],
      ["Recently closed", ["closed"]],
    ]);
  });

  it("queues what waits on the assigner — handed back, or asking for time — but never their own", () => {
    expect(reviewQueue(all, "sn-as").map((t) => t.id)).toEqual(["back", "asking"]);
    expect(reviewQueue(all, "of-as")).toEqual([]);
  });

  it("badges the overdue, the due today, the unopened, and the review queue", () => {
    // of-as: overdue, today, week, later, none are unopened (5); own is seen.
    expect(taskBadge(all, "of-as", today)).toBe(5);
    // sn-as: nothing on their desk; two waiting on them.
    expect(taskBadge(all, "sn-as", today)).toBe(2);
    expect(taskBadge(all, "of-insp", today)).toBe(0);
  });

  it("sums the stat strip", () => {
    expect(taskStats(all, "of-as", today)).toEqual({ onDesk: 6, overdue: 1, awaitingMyReview: 0, givenOut: 0 });
    expect(taskStats(all, "sn-as", today)).toEqual({ onDesk: 0, overdue: 0, awaitingMyReview: 2, givenOut: 8 });
  });

  it("summarises each officer for the supervisor, self-tasks left out", () => {
    const rows = assignerSummary(all, "sn-as", today);
    expect(rows.map((r) => r.uid)).toEqual(["of-as", "of-as2"]);
    expect(rows[0]).toMatchObject({ open: 5, overdue: 1, awaitingReview: 1, closed: 1, closedLate: 0, onTimeRate: 100, avgTurnaround: 1 });
    expect(rows[0].oldestOpenDays).toBe(2);
    expect(rows[1]).toMatchObject({ open: 2, overdue: 0, awaitingReview: 0, closed: 0, onTimeRate: null, avgTurnaround: null });
    expect(assignerSummary(all, "of-as", today)).toEqual([]);
  });
});

describe("read scope", () => {
  it("is everything for the department and the account's own tasks plus its section otherwise", () => {
    const admin = taskScopeFor({ uid: "dnrs", role: "admin", section: "All" })!;
    expect(admin.department).toBe(true);
    const officer = taskScopeFor({ uid: "of-as", role: "officer", section: "Authorisation & Standards" })!;
    expect(officer).toEqual({ uid: "of-as", section: "Authorisation & Standards", department: false });
    expect(taskScopeFor(null)).toBeNull();

    const mine = give("sn-as", "of-as");
    const peers = give("sn-as", "sn-insp"); // watched by mnrs, filed under Inspectorate
    const theirs = give("sn-insp", "of-insp");
    expect(inTaskScope(mine, officer)).toBe(true);
    expect(inTaskScope(peers, officer)).toBe(false);
    expect(inTaskScope(theirs, officer)).toBe(false);
    expect(inTaskScope(theirs, admin)).toBe(true);
    const manager = taskScopeFor({ uid: "mnrs", role: "officer", section: "All" })!;
    expect(manager.department).toBe(true);
    const inspOfficer = taskScopeFor({ uid: "of-insp", role: "officer", section: "Inspectorate" })!;
    expect(inTaskScope(peers, inspOfficer)).toBe(true); // their section's
  });
});
