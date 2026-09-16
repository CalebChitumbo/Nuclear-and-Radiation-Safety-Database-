import { beforeEach, describe, expect, it } from "vitest";

import { mockStore, resetMockStore } from "../lib/store/mockStore";
import { entryOf, taskScopeFor, type TaskViewer } from "../lib/rules/tasks";
import type { TaskParty } from "../lib/rules/types";

const SENIOR: TaskParty = { uid: "demo-as", name: "A&S Officer", section: "Authorisation & Standards", grade: "Senior Officer" };
const OFFICER: TaskParty = { uid: "demo-as-nrso", name: "A&S Licensing Officer", section: "Authorisation & Standards", grade: "Officer" };
const MANAGER: TaskParty = { uid: "demo-manager", name: "Manager NRS", section: "All", grade: "Manager" };
const v = (uid: string, extra: Partial<TaskViewer> = {}): TaskViewer => ({ uid, ...extra });

describe("mock store — the Tasks desk (the integration seam)", () => {
  beforeEach(() => resetMockStore());

  it("ships the demo department on a reporting line", async () => {
    const dir = await mockStore.listDirectory();
    expect(entryOf("demo-as", dir)).toMatchObject({ grade: "Senior Officer", reportsTo: "demo-manager", active: true });
    expect(entryOf("demo-nakonde", dir)).toMatchObject({ reportsTo: "demo-nsss", border: "Nakonde" });
  });

  it("gives, works and closes a task, read by both parties and nobody else", async () => {
    const dir = await mockStore.listDirectory();
    const t = await mockStore.addTask(
      { title: "Draft the MoH reply", category: "Letter response", dueDate: "2026-09-30", assignTo: entryOf("demo-as-nrso", dir)! },
      SENIOR,
      v("demo-as"),
    );
    expect(t.status).toBe("Assigned");

    const officerScope = taskScopeFor({ uid: "demo-as-nrso", role: "officer", section: "Authorisation & Standards" })!;
    expect((await mockStore.listTasks(officerScope)).map((x) => x.id)).toEqual([t.id]);
    const inspScope = taskScopeFor({ uid: "demo-insp", role: "officer", section: "Inspectorate" })!;
    expect(await mockStore.listTasks(inspScope)).toEqual([]);

    await mockStore.updateTask(t.id, { kind: "start" }, OFFICER, v("demo-as-nrso"));
    const back = await mockStore.updateTask(t.id, { kind: "submit", outcome: "Done", note: "Sent" }, OFFICER, v("demo-as-nrso"));
    expect(back.status).toBe("Submitted");
    const closed = await mockStore.updateTask(t.id, { kind: "close" }, SENIOR, v("demo-as"));
    expect(closed.status).toBe("Closed");
    expect(closed.events.map((e) => e.kind)).toEqual(["created", "started", "submitted", "closed"]);
  });

  it("refuses work to an officer off the line, naming who to go through", async () => {
    const dir = await mockStore.listDirectory();
    await expect(
      mockStore.addTask({ title: "x", category: "Other", assignTo: entryOf("demo-nakonde", dir)! }, SENIOR, v("demo-as")),
    ).rejects.toThrow(/Assign it to NSSS Officer/);
  });

  it("passes a task down the line as a linked task that stays open above", async () => {
    const dir = await mockStore.listDirectory();
    const parent = await mockStore.addTask(
      { title: "Board paper on licensing backlog", category: "Memo", dueDate: "2026-10-02", assignTo: entryOf("demo-as", dir)! },
      MANAGER,
      v("demo-manager"),
    );
    const { parent: updated, child } = await mockStore.passTaskOn(
      parent.id,
      { title: "Pull the backlog figures", category: "Data entry", dueDate: "2026-09-28", assignTo: entryOf("demo-as-nrso", dir)! },
      SENIOR,
      v("demo-as", { hasReports: true }),
    );
    expect(updated.status).toBe("In Progress");
    expect(child.parentId).toBe(parent.id);
    expect(child.assignedByUid).toBe("demo-as");
    expect(child.assignedToUid).toBe("demo-as-nrso");
    const seniorScope = taskScopeFor({ uid: "demo-as", role: "officer", section: "Authorisation & Standards" })!;
    expect((await mockStore.listTasks(seniorScope)).map((x) => x.id).sort()).toEqual([parent.id, child.id].sort());
  });

  it("places an account on the line from the Users desk and reflects it in the directory", async () => {
    await mockStore.updateUserAccess(
      "demo-nsss",
      { role: "officer", section: "Nuclear Safety, Security & Safeguards", grade: "Officer", reportsTo: "demo-insp" },
      "demo-admin",
    );
    const dir = await mockStore.listDirectory();
    expect(entryOf("demo-nsss", dir)).toMatchObject({ grade: "Officer", reportsTo: "demo-insp" });
    await mockStore.updateUserAccess(
      "demo-nsss",
      { role: "officer", section: "Nuclear Safety, Security & Safeguards", grade: "", reportsTo: "" },
      "demo-admin",
    );
    expect(entryOf("demo-nsss", await mockStore.listDirectory())).not.toHaveProperty("grade");
  });
});
