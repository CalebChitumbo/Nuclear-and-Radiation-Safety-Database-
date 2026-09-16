/**
 * The Tasks desk — pure business logic.
 *
 * A supervisor gives an officer a piece of work; the officer sees it on their
 * desk, works it and hands it back; the supervisor accepts it or returns it
 * with comments. Everything a task goes through is an event on the task, so
 * the whole story — who gave it, when it was opened, when it came back, how
 * many times it was returned — is one record both can read.
 *
 * Three things live here and nowhere else:
 *
 *  - **The reporting line.** Who may give work to whom is read off the staff
 *    directory: a task goes to a direct report, a peer (someone with the same
 *    supervisor) or one's own supervisor, and to nobody else. An officer in
 *    another line is reached through *their* supervisor, who passes it on.
 *    `firestore.rules` enforces the same three cases against the directory.
 *  - **The state machine** — which actions each party may take in each state,
 *    and what each does to the record.
 *  - **The derived standing** — overdue, due today, awaiting review, closed
 *    late. Nothing of this is stored; it is read off the dates each time.
 *
 * Framework-free and unit-tested; persistence lives in the stores.
 */
import type {
  DirectoryEntry,
  Grade,
  Section,
  Task,
  TaskCategory,
  TaskEvent,
  TaskOutcome,
  TaskParty,
  TaskPriority,
  TaskStatus,
  UserDoc,
} from "./types";
import { GRADE_META } from "./types";

// ---------------------------------------------------------------------------
// The directory and the reporting line
// ---------------------------------------------------------------------------

/** The directory line an account document projects to. */
export function directoryEntry(user: UserDoc): DirectoryEntry {
  return {
    uid: user.uid,
    displayName: user.displayName,
    section: user.section,
    ...(user.border ? { border: user.border } : {}),
    ...(user.grade ? { grade: user.grade } : {}),
    ...(user.reportsTo ? { reportsTo: user.reportsTo } : {}),
    active: !user.pending && !user.disabled,
  };
}

/** The party a directory line (or an account) is recorded as on a task. */
export function partyOf(
  who: Pick<DirectoryEntry, "uid" | "displayName" | "section" | "grade">,
): TaskParty {
  return {
    uid: who.uid,
    name: who.displayName,
    section: who.section,
    ...(who.grade ? { grade: who.grade } : {}),
  };
}

/** "Senior Officer · SNRSO" for a chip; "" when the account is not placed. */
export function gradeLabel(grade?: Grade): string {
  return grade ? `${grade} · ${GRADE_META[grade].short}` : "";
}

export function entryOf(
  uid: string,
  directory: readonly DirectoryEntry[],
): DirectoryEntry | null {
  return directory.find((d) => d.uid === uid) || null;
}

/** The immediate supervisor, or null at the top of the line (or unplaced). */
export function supervisorOf(
  uid: string,
  directory: readonly DirectoryEntry[],
): DirectoryEntry | null {
  const me = entryOf(uid, directory);
  if (!me?.reportsTo) return null;
  return entryOf(me.reportsTo, directory);
}

/** Everyone who reports directly to this account. Active accounts only. */
export function directReportsOf(
  uid: string,
  directory: readonly DirectoryEntry[],
): DirectoryEntry[] {
  return directory.filter((d) => d.active && d.reportsTo === uid && d.uid !== uid);
}

/** Everyone with the same supervisor. Active accounts only, self excluded. */
export function peersOf(
  uid: string,
  directory: readonly DirectoryEntry[],
): DirectoryEntry[] {
  const me = entryOf(uid, directory);
  if (!me?.reportsTo) return [];
  return directory.filter(
    (d) => d.active && d.uid !== uid && d.reportsTo === me.reportsTo,
  );
}

/** Whether anyone reports to this account — what lets them pass a task on. */
export function hasReports(
  uid: string,
  directory: readonly DirectoryEntry[],
): boolean {
  return directReportsOf(uid, directory).length > 0;
}

/**
 * The line above an account, nearest first — "reports to X, who reports to
 * Y". Stops at the top or at a loop, so a mis-set directory cannot hang it.
 */
export function chainAbove(
  uid: string,
  directory: readonly DirectoryEntry[],
): DirectoryEntry[] {
  const out: DirectoryEntry[] = [];
  const seen = new Set<string>([uid]);
  let cur = supervisorOf(uid, directory);
  while (cur && !seen.has(cur.uid)) {
    out.push(cur);
    seen.add(cur.uid);
    cur = supervisorOf(cur.uid, directory);
  }
  return out;
}

/**
 * The org chart as a tree, for the Users desk: everyone with no supervisor
 * (or one the directory does not hold) at the root, then each account's
 * direct reports beneath it, name order.
 */
export interface OrgNode {
  entry: DirectoryEntry;
  reports: OrgNode[];
}

export function orgChart(directory: readonly DirectoryEntry[]): OrgNode[] {
  const known = new Set(directory.map((d) => d.uid));
  const placed = new Set<string>();
  const byName = (a: DirectoryEntry, b: DirectoryEntry) =>
    a.displayName.localeCompare(b.displayName);
  const build = (entry: DirectoryEntry, trail: Set<string>): OrgNode => {
    placed.add(entry.uid);
    const next = new Set(trail).add(entry.uid);
    const reports = directory
      .filter((d) => d.reportsTo === entry.uid && d.uid !== entry.uid && !next.has(d.uid))
      .sort(byName)
      .map((d) => build(d, next));
    return { entry, reports };
  };
  const roots = directory
    .filter((d) => !d.reportsTo || !known.has(d.reportsTo) || d.reportsTo === d.uid)
    .sort(byName)
    .map((d) => build(d, new Set()));
  // A loop (A reports to B reports to A) has no root; show it from its first
  // member rather than losing it.
  for (const d of [...directory].sort(byName)) {
    if (!placed.has(d.uid)) roots.push(build(d, new Set()));
  }
  return roots;
}

export type AssignableHeading =
  | "Myself"
  | "My team"
  | "Peers"
  | "My supervisor"
  | "Everyone else";

export interface AssignableGroup {
  heading: AssignableHeading;
  entries: DirectoryEntry[];
}

/**
 * Who this account may give a task to, grouped the way the picker shows them.
 * An administrator may reach anyone, and gets the rest of the directory as a
 * final group so the reporting line still reads first.
 */
export function assignableFor(
  actorUid: string,
  directory: readonly DirectoryEntry[],
  isAdmin = false,
): AssignableGroup[] {
  const byName = (a: DirectoryEntry, b: DirectoryEntry) =>
    a.displayName.localeCompare(b.displayName);
  const me = entryOf(actorUid, directory);
  const groups: AssignableGroup[] = [];
  if (me) groups.push({ heading: "Myself", entries: [me] });
  const team = directReportsOf(actorUid, directory).sort(byName);
  if (team.length) groups.push({ heading: "My team", entries: team });
  const peers = peersOf(actorUid, directory).sort(byName);
  if (peers.length) groups.push({ heading: "Peers", entries: peers });
  const boss = supervisorOf(actorUid, directory);
  if (boss && boss.active) groups.push({ heading: "My supervisor", entries: [boss] });
  if (isAdmin) {
    const listed = new Set(groups.flatMap((g) => g.entries.map((e) => e.uid)));
    const rest = directory
      .filter((d) => d.active && !listed.has(d.uid))
      .sort(byName);
    if (rest.length) groups.push({ heading: "Everyone else", entries: rest });
  }
  return groups;
}

/**
 * Why this account may not give a task to that one — or "" when it may. The
 * message names the person to go through, because that is what the officer
 * asking needs to know next.
 */
export function assignmentBlocker(
  actorUid: string,
  targetUid: string,
  directory: readonly DirectoryEntry[],
  isAdmin = false,
): string {
  if (actorUid === targetUid) return "";
  const target = entryOf(targetUid, directory);
  if (!target) return "That person is not in the staff directory.";
  if (!target.active) return `${target.displayName}'s account is not active.`;
  if (isAdmin) return "";
  const me = entryOf(actorUid, directory);
  if (!me) return "Your account is not in the staff directory yet — ask an administrator to place you.";
  if (target.reportsTo === actorUid) return "";
  if (me.reportsTo && target.reportsTo && me.reportsTo === target.reportsTo) return "";
  if (me.reportsTo === targetUid) return "";
  const boss = target.reportsTo ? entryOf(target.reportsTo, directory) : null;
  if (boss) {
    return `${target.displayName} reports to ${boss.displayName}. Assign it to ${boss.displayName}, who can pass it on.`;
  }
  return `${target.displayName} is not on your reporting line, and has no supervisor placed to go through.`;
}

/**
 * The supervisor both parties share when peers task each other — added as a
 * watcher so nothing is assigned without the immediate supervisor knowing.
 */
export function sharedSupervisor(
  actorUid: string,
  targetUid: string,
  directory: readonly DirectoryEntry[],
): DirectoryEntry | null {
  if (actorUid === targetUid) return null;
  const me = entryOf(actorUid, directory);
  const target = entryOf(targetUid, directory);
  if (!me?.reportsTo || !target?.reportsTo || me.reportsTo !== target.reportsTo) {
    return null;
  }
  const boss = entryOf(me.reportsTo, directory);
  return boss && boss.active ? boss : null;
}

/**
 * The narrowest task read an account is entitled to. The department reads
 * every task; anyone else reads the ones they are on (assigned to, assigned
 * by, watching) and their section's. The store turns this into the queries,
 * and the security rules allow exactly these reads.
 */
export interface TaskReadScope {
  uid: string;
  section: Section | "All" | "";
  department: boolean;
}

export function taskScopeFor(
  user: Pick<UserDoc, "uid" | "role" | "section"> | null,
): TaskReadScope | null {
  if (!user) return null;
  const department = user.role === "admin" || user.section === "All";
  return { uid: user.uid, section: department ? "All" : user.section, department };
}

/** Whether a task falls inside a read scope — the client-side half of the rule. */
export function inTaskScope(task: Task, scope: TaskReadScope): boolean {
  if (scope.department) return true;
  return (
    task.assignedToUid === scope.uid ||
    task.assignedByUid === scope.uid ||
    task.watcherUids.includes(scope.uid) ||
    (!!scope.section && task.section === scope.section)
  );
}

// ---------------------------------------------------------------------------
// Building and moving a task
// ---------------------------------------------------------------------------

export interface NewTaskInput {
  title: string;
  details?: string;
  category: TaskCategory;
  priority?: TaskPriority;
  dueDate?: string;
  reference?: string;
  link?: string;
  /** The officer it goes to — a directory line. */
  assignTo: DirectoryEntry;
}

export function taskEventId(): string {
  return `tsk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(date: string | undefined, what: string): string {
  const d = (date || "").trim();
  if (d && !DATE_RE.test(d)) throw new Error(`${what} must be a date (YYYY-MM-DD).`);
  return d;
}

function event(
  actor: TaskParty,
  now: string,
  kind: TaskEvent["kind"],
  text: string,
  extra: Partial<Pick<TaskEvent, "status" | "dueDate">> = {},
): TaskEvent {
  return { at: now, by: actor.uid, byName: actor.name, kind, text, ...extra };
}

/**
 * A new task, checked against the reporting line. Throws when the actor may
 * not give work to that person, when the title is missing, or when the date
 * is malformed. The shared supervisor is put on watch for a peer assignment.
 */
export function buildTask(
  input: NewTaskInput,
  actor: TaskParty,
  directory: readonly DirectoryEntry[],
  now: string,
  opts: { isAdmin?: boolean; parent?: Pick<Task, "id" | "title"> } = {},
): Omit<Task, "id"> {
  const title = input.title.trim();
  if (!title) throw new Error("Give the task a title.");
  const blocker = assignmentBlocker(actor.uid, input.assignTo.uid, directory, opts.isAdmin);
  if (blocker) throw new Error(blocker);
  const dueDate = checkDate(input.dueDate, "The deadline");
  const to = partyOf(input.assignTo);
  const self = to.uid === actor.uid;
  const watcher = sharedSupervisor(actor.uid, to.uid, directory);
  const watchers = watcher ? [partyOf(watcher)] : [];
  const text = self
    ? `Added to own desk${dueDate ? `, due ${dueDate}` : ""}.`
    : `Assigned to ${to.name}${dueDate ? `, due ${dueDate}` : ""}.`;
  return {
    title,
    details: (input.details || "").trim(),
    category: input.category,
    priority: input.priority || "Normal",
    ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
    ...(input.link?.trim() ? { link: input.link.trim() } : {}),
    assignedBy: actor,
    assignedTo: to,
    assignedByUid: actor.uid,
    assignedToUid: to.uid,
    watchers,
    watcherUids: watchers.map((w) => w.uid),
    section: input.assignTo.section,
    self,
    status: "Assigned",
    dueDate,
    originalDueDate: dueDate,
    assignedAt: now,
    ...(self ? { seenAt: now } : {}),
    ...(opts.parent ? { parentId: opts.parent.id, parentTitle: opts.parent.title } : {}),
    returns: 0,
    events: [event(actor, now, "created", text, { status: "Assigned", ...(dueDate ? { dueDate } : {}) })],
  };
}

export type TaskAction =
  | { kind: "seen" }
  | { kind: "start"; note?: string }
  | { kind: "submit"; outcome: TaskOutcome; note?: string }
  | { kind: "close"; note?: string }
  | { kind: "return"; note: string; dueDate?: string }
  | { kind: "cancel"; reason: string }
  | { kind: "reassign"; to: DirectoryEntry; note?: string }
  | { kind: "deadline"; dueDate: string; reason: string }
  | { kind: "request-extension"; dueDate: string; reason: string }
  | { kind: "approve-extension"; note?: string }
  | { kind: "decline-extension"; note: string }
  | { kind: "passed-on"; to: TaskParty; childId: string }
  | { kind: "comment"; note: string };

export type TaskActionKind = TaskAction["kind"];

export interface TaskViewer {
  uid: string;
  isAdmin?: boolean;
  /** Anyone reports to the viewer — they may pass a task on. */
  hasReports?: boolean;
}

export const OPEN_STATUSES: readonly TaskStatus[] = ["Assigned", "In Progress"];

export function isOpenTask(t: Pick<Task, "status">): boolean {
  return OPEN_STATUSES.includes(t.status);
}

/** Still live: open, or handed back and waiting on the assigner. */
export function isActiveTask(t: Pick<Task, "status">): boolean {
  return isOpenTask(t) || t.status === "Submitted";
}

/**
 * What this viewer may do to this task now. The officer works it; the assigner
 * reviews, re-plans and withdraws it; an administrator may do either side.
 * A self-assigned task gives its one party both sides, minus the theatre of
 * requesting an extension from oneself.
 */
export function allowedTaskActions(task: Task, viewer: TaskViewer): TaskActionKind[] {
  const isOfficer = viewer.uid === task.assignedToUid || !!viewer.isAdmin;
  const isAssigner = viewer.uid === task.assignedByUid || !!viewer.isAdmin;
  const isWatcher = task.watcherUids.includes(viewer.uid);
  const out: TaskActionKind[] = [];
  if (!isOfficer && !isAssigner && !isWatcher) return out;

  const active = isActiveTask(task);
  if (isOfficer && isOpenTask(task)) {
    if (task.status === "Assigned") out.push("start");
    out.push("submit");
    if (viewer.hasReports && !task.self) out.push("passed-on");
    if (!task.self && task.dueDate && !task.extensionRequest) out.push("request-extension");
  }
  if (isAssigner) {
    if (task.status === "Submitted") out.push("close", "return");
    if (task.extensionRequest && isOpenTask(task)) {
      out.push("approve-extension", "decline-extension");
    }
    if (isOpenTask(task)) out.push("deadline");
    if (isOpenTask(task) && !task.self) out.push("reassign");
    if (active) out.push("cancel");
  }
  out.push("comment");
  return Array.from(new Set(out));
}

function assertAllowed(task: Task, kind: TaskActionKind, viewer: TaskViewer) {
  if (!allowedTaskActions(task, viewer).includes(kind)) {
    throw new Error(`"${kind}" is not available on this task for you now.`);
  }
}

function need(text: string | undefined, what: string): string {
  const t = (text || "").trim();
  if (!t) throw new Error(`${what} is required.`);
  return t;
}

/**
 * The task after an action. Pure: returns the next record, throws when the
 * action is not open to this actor in this state.
 */
export function applyTaskAction(
  task: Task,
  action: TaskAction,
  actor: TaskParty,
  now: string,
  viewer: TaskViewer = { uid: actor.uid },
): Task {
  const events = [...task.events];
  const push = (
    kind: TaskEvent["kind"],
    text: string,
    extra: Partial<Pick<TaskEvent, "status" | "dueDate">> = {},
  ) => events.push(event(actor, now, kind, text, extra));

  switch (action.kind) {
    case "seen": {
      if (task.seenAt || actor.uid !== task.assignedToUid || !isOpenTask(task)) return task;
      push("seen", "Opened the task.");
      return { ...task, seenAt: now, events };
    }
    case "start": {
      assertAllowed(task, "start", viewer);
      push("started", action.note?.trim() || "Started work.", { status: "In Progress" });
      return {
        ...task,
        status: "In Progress",
        startedAt: task.startedAt || now,
        seenAt: task.seenAt || now,
        events,
      };
    }
    case "submit": {
      assertAllowed(task, "submit", viewer);
      const note = (action.note || "").trim();
      if (action.outcome === "Not done" && !note) {
        throw new Error("Say why it could not be done.");
      }
      push(
        "submitted",
        `Handed back as ${action.outcome.toLowerCase()}${note ? `: ${note}` : "."}`,
        { status: "Submitted" },
      );
      const { extensionRequest: _dropped, ...rest } = task;
      void _dropped;
      return {
        ...rest,
        status: "Submitted",
        outcome: action.outcome,
        submittedAt: now,
        startedAt: task.startedAt || now,
        seenAt: task.seenAt || now,
        events,
      };
    }
    case "close": {
      assertAllowed(task, "close", viewer);
      push("closed", action.note?.trim() || "Accepted and closed.", { status: "Closed" });
      return { ...task, status: "Closed", closedAt: now, events };
    }
    case "return": {
      assertAllowed(task, "return", viewer);
      const note = need(action.note, "A comment on what is still needed");
      const dueDate = checkDate(action.dueDate, "The new deadline");
      push("returned", `Returned: ${note}`, {
        status: "In Progress",
        ...(dueDate ? { dueDate } : {}),
      });
      const { outcome: _o, submittedAt: _s, ...rest } = task;
      void _o;
      void _s;
      return {
        ...rest,
        status: "In Progress",
        returns: task.returns + 1,
        dueDate: dueDate || task.dueDate,
        events,
      };
    }
    case "cancel": {
      assertAllowed(task, "cancel", viewer);
      const reason = need(action.reason, "A reason for cancelling");
      push("cancelled", `Cancelled: ${reason}`, { status: "Cancelled" });
      return { ...task, status: "Cancelled", cancelledAt: now, events };
    }
    case "reassign": {
      assertAllowed(task, "reassign", viewer);
      if (action.to.uid === task.assignedToUid) throw new Error("Already assigned to that officer.");
      const to = partyOf(action.to);
      const note = action.note?.trim();
      push("reassigned", `Reassigned from ${task.assignedTo.name} to ${to.name}${note ? `: ${note}` : "."}`, {
        status: "Assigned",
      });
      const { seenAt: _seen, startedAt: _started, extensionRequest: _ext, ...rest } = task;
      void _seen;
      void _started;
      void _ext;
      return {
        ...rest,
        assignedTo: to,
        assignedToUid: to.uid,
        section: action.to.section,
        self: to.uid === task.assignedByUid,
        status: "Assigned",
        events,
      };
    }
    case "deadline": {
      assertAllowed(task, "deadline", viewer);
      const dueDate = checkDate(action.dueDate, "The deadline");
      const reason = need(action.reason, "A reason for moving the deadline");
      if (dueDate === task.dueDate) throw new Error("That is already the deadline.");
      push(
        "deadline",
        `Deadline ${task.dueDate ? `moved from ${task.dueDate} to ` : "set to "}${dueDate || "none"}: ${reason}`,
        dueDate ? { dueDate } : {},
      );
      return {
        ...task,
        dueDate,
        originalDueDate: task.originalDueDate || dueDate,
        events,
      };
    }
    case "request-extension": {
      assertAllowed(task, "request-extension", viewer);
      const dueDate = checkDate(action.dueDate, "The date asked for");
      if (!dueDate) throw new Error("Say which date you are asking for.");
      if (dueDate <= task.dueDate) throw new Error("Ask for a date after the current deadline.");
      const reason = need(action.reason, "A reason for the extension");
      push("extension-requested", `Asked for an extension to ${dueDate}: ${reason}`, { dueDate });
      return { ...task, extensionRequest: { dueDate, reason, at: now }, events };
    }
    case "approve-extension": {
      assertAllowed(task, "approve-extension", viewer);
      const req = task.extensionRequest!;
      const note = action.note?.trim();
      push("extension-approved", `Extension to ${req.dueDate} approved${note ? `: ${note}` : "."}`, {
        dueDate: req.dueDate,
      });
      const { extensionRequest: _r, ...rest } = task;
      void _r;
      return { ...rest, dueDate: req.dueDate, events };
    }
    case "decline-extension": {
      assertAllowed(task, "decline-extension", viewer);
      const req = task.extensionRequest!;
      const note = need(action.note, "A reason for declining");
      push("extension-declined", `Extension to ${req.dueDate} declined: ${note}`);
      const { extensionRequest: _r, ...rest } = task;
      void _r;
      return { ...rest, events };
    }
    case "passed-on": {
      assertAllowed(task, "passed-on", viewer);
      push("passed-on", `Passed on to ${action.to.name} (task ${action.childId}).`, {
        status: "In Progress",
      });
      return {
        ...task,
        status: "In Progress",
        startedAt: task.startedAt || now,
        seenAt: task.seenAt || now,
        events,
      };
    }
    case "comment": {
      assertAllowed(task, "comment", viewer);
      push("comment", need(action.note, "A comment"));
      return { ...task, events };
    }
  }
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

function utc(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The calendar day an ISO timestamp falls on, as the app files dates (local). */
export function dayOf(iso: string): string {
  if (DATE_RE.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function addDays(date: string, n: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

/** Calendar days from a to b (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
}

function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function firstMonday(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const shift = (8 - d.getUTCDay()) % 7;
  d.setUTCDate(1 + shift);
  return d;
}

/**
 * Zambia's public holidays for a year, as observed: a holiday that falls on a
 * Sunday is taken on the Monday. Fixed dates plus the movable ones — the
 * Easter weekend, Heroes' and Unity Day (first Monday and Tuesday of July),
 * Farmers' Day (first Monday of August).
 */
export function zambianPublicHolidays(year: number): string[] {
  const fixed = [
    [1, 1], // New Year's Day
    [3, 8], // International Women's Day
    [3, 12], // Youth Day
    [4, 28], // Kenneth Kaunda Day
    [5, 1], // Labour Day
    [5, 25], // Africa Freedom Day
    [10, 18], // National Day of Prayer
    [10, 24], // Independence Day
    [12, 25], // Christmas Day
  ].map(([m, d]) => new Date(Date.UTC(year, m - 1, d)));
  const easter = easterSunday(year);
  const shiftBy = (base: Date, n: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };
  const heroes = firstMonday(year, 7);
  const movable = [
    shiftBy(easter, -2), // Good Friday
    shiftBy(easter, -1), // Holy Saturday
    shiftBy(easter, 1), // Easter Monday
    heroes,
    shiftBy(heroes, 1), // Unity Day
    firstMonday(year, 8), // Farmers' Day
  ];
  const all = [...fixed, ...movable].map((d) => (d.getUTCDay() === 0 ? shiftBy(d, 1) : d));
  return Array.from(new Set(all.map(ymd))).sort();
}

const holidayCache = new Map<number, Set<string>>();
function isHoliday(date: string): boolean {
  const year = Number(date.slice(0, 4));
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(zambianPublicHolidays(year));
    holidayCache.set(year, set);
  }
  return set.has(date);
}

export function isWorkingDay(date: string): boolean {
  const dow = utc(date).getUTCDay();
  return dow !== 0 && dow !== 6 && !isHoliday(date);
}

/**
 * Working days from one date to another, exclusive of the start and inclusive
 * of the end — "given on Monday, back on Wednesday" is 2. Negative when the
 * end is earlier. Weekends and Zambian public holidays are skipped.
 */
export function workingDaysBetween(from: string, to: string): number {
  const a = dayOf(from);
  const b = dayOf(to);
  if (a === b) return 0;
  const sign = a < b ? 1 : -1;
  let count = 0;
  let cur = a;
  while (cur !== b) {
    cur = addDays(cur, sign);
    if (isWorkingDay(cur)) count += 1;
  }
  return count * sign;
}

// ---------------------------------------------------------------------------
// Standing — derived, never stored
// ---------------------------------------------------------------------------

export type StandingKey =
  | "overdue"
  | "due-today"
  | "due-soon"
  | "on-track"
  | "no-deadline"
  | "awaiting-review"
  | "closed"
  | "cancelled";

export interface TaskStanding {
  key: StandingKey;
  label: string;
  chip: "green" | "amber" | "red" | "slate";
  /** Handed back (or closed) after the deadline. */
  late: boolean;
  /** Calendar days past the deadline (open tasks), or by which it was late. */
  daysLate: number;
}

/** Within how many calendar days a deadline reads "due soon". */
export const DUE_SOON_DAYS = 2;

export function taskStanding(task: Task, today: string): TaskStanding {
  const due = task.dueDate;
  if (task.status === "Cancelled") {
    return { key: "cancelled", label: "Cancelled", chip: "slate", late: false, daysLate: 0 };
  }
  if (task.status === "Closed" || task.status === "Submitted") {
    const back = dayOf(task.submittedAt || task.closedAt || today);
    const daysLate = due ? Math.max(0, daysBetween(due, back)) : 0;
    const late = daysLate > 0;
    if (task.status === "Submitted") {
      return {
        key: "awaiting-review",
        label: late ? `Awaiting review · ${daysLate}d late` : "Awaiting review",
        chip: "amber",
        late,
        daysLate,
      };
    }
    return {
      key: "closed",
      label: late ? `Closed · ${daysLate}d late` : due ? "Closed on time" : "Closed",
      chip: late ? "amber" : "green",
      late,
      daysLate,
    };
  }
  if (!due) {
    return { key: "no-deadline", label: "No deadline", chip: "slate", late: false, daysLate: 0 };
  }
  const left = daysBetween(today, due);
  if (left < 0) {
    return { key: "overdue", label: `Overdue ${-left}d`, chip: "red", late: true, daysLate: -left };
  }
  if (left === 0) {
    return { key: "due-today", label: "Due today", chip: "amber", late: false, daysLate: 0 };
  }
  if (left <= DUE_SOON_DAYS) {
    return { key: "due-soon", label: `Due in ${left}d`, chip: "amber", late: false, daysLate: 0 };
  }
  return { key: "on-track", label: `Due ${due}`, chip: "green", late: false, daysLate: 0 };
}

/** Working days the task has sat (or sat until handed back). */
export function daysOnDesk(task: Task, today: string): number {
  const end = task.submittedAt || task.cancelledAt || today;
  return workingDaysBetween(task.assignedAt, end);
}

/** Working days from given to handed back; null while still open. */
export function turnaroundDays(task: Task): number | null {
  if (!task.submittedAt) return null;
  return workingDaysBetween(task.assignedAt, task.submittedAt);
}

// ---------------------------------------------------------------------------
// The desk, the review queue, the badge, the supervisor's summary
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<TaskPriority, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

/** Soonest deadline first (none last), then priority, then oldest. */
export function sortByUrgency(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p) return p;
    return a.assignedAt.localeCompare(b.assignedAt);
  });
}

export type DeskHeading =
  | "Overdue"
  | "Due today"
  | "This week"
  | "Later"
  | "No deadline"
  | "Handed back"
  | "Recently closed";

export interface DeskGroup {
  heading: DeskHeading;
  tasks: Task[];
}

/** Recently-closed tasks stay on the desk this many days. */
export const RECENT_DAYS = 14;

/**
 * An officer's desk: everything assigned to them, grouped by when it is due,
 * with what they have handed back and what was closed lately beneath.
 */
export function deskFor(tasks: Task[], uid: string, today: string): DeskGroup[] {
  const mine = tasks.filter((t) => t.assignedToUid === uid);
  const weekEnd = addDays(today, 7);
  const groups = new Map<DeskHeading, Task[]>();
  const put = (h: DeskHeading, t: Task) => groups.set(h, [...(groups.get(h) || []), t]);
  for (const t of sortByUrgency(mine)) {
    if (t.status === "Cancelled") continue;
    if (t.status === "Submitted") {
      put("Handed back", t);
      continue;
    }
    if (t.status === "Closed") {
      if (t.closedAt && daysBetween(dayOf(t.closedAt), today) <= RECENT_DAYS) put("Recently closed", t);
      continue;
    }
    const s = taskStanding(t, today);
    if (s.key === "overdue") put("Overdue", t);
    else if (s.key === "due-today") put("Due today", t);
    else if (s.key === "no-deadline") put("No deadline", t);
    else if (t.dueDate <= weekEnd) put("This week", t);
    else put("Later", t);
  }
  const order: DeskHeading[] = [
    "Overdue",
    "Due today",
    "This week",
    "Later",
    "No deadline",
    "Handed back",
    "Recently closed",
  ];
  return order.filter((h) => groups.has(h)).map((h) => ({ heading: h, tasks: groups.get(h)! }));
}

/** Tasks this account gave out that are waiting on it: handed back, or asking for more time. */
export function reviewQueue(tasks: Task[], uid: string): Task[] {
  return sortByUrgency(
    tasks.filter(
      (t) =>
        t.assignedByUid === uid &&
        !t.self &&
        (t.status === "Submitted" || (!!t.extensionRequest && isOpenTask(t))),
    ),
  );
}

/**
 * The sidebar badge: what needs this account's attention today — tasks on
 * their desk that are overdue, due today or not yet opened, plus tasks they
 * gave out that are waiting on them.
 */
export function taskBadge(tasks: Task[], uid: string, today: string): number {
  let n = 0;
  for (const t of tasks) {
    if (t.assignedToUid === uid && isOpenTask(t)) {
      const s = taskStanding(t, today);
      if (s.key === "overdue" || s.key === "due-today" || !t.seenAt) n += 1;
    }
  }
  return n + reviewQueue(tasks, uid).length;
}

export interface AssigneeSummary {
  uid: string;
  name: string;
  open: number;
  overdue: number;
  awaitingReview: number;
  closed: number;
  closedLate: number;
  /** Of closed tasks with a deadline: share handed back on time, 0–100, or null with none. */
  onTimeRate: number | null;
  /** Working days from given to handed back, averaged over handed-back tasks. */
  avgTurnaround: number | null;
  /** The longest an open task has sat, in working days. */
  oldestOpenDays: number;
}

/**
 * The supervisor's view of the tasks they gave out: one row per officer with
 * the load, what is late and how quickly work comes back. Self-assigned
 * tasks are nobody's statistics and are left out.
 */
export function assignerSummary(
  tasks: Task[],
  assignerUid: string,
  today: string,
): AssigneeSummary[] {
  const rows = new Map<string, AssigneeSummary & { turnarounds: number[]; timed: number; onTime: number }>();
  for (const t of tasks) {
    if (t.assignedByUid !== assignerUid || t.self || t.status === "Cancelled") continue;
    let row = rows.get(t.assignedToUid);
    if (!row) {
      row = {
        uid: t.assignedToUid,
        name: t.assignedTo.name,
        open: 0,
        overdue: 0,
        awaitingReview: 0,
        closed: 0,
        closedLate: 0,
        onTimeRate: null,
        avgTurnaround: null,
        oldestOpenDays: 0,
        turnarounds: [],
        timed: 0,
        onTime: 0,
      };
      rows.set(t.assignedToUid, row);
    }
    const s = taskStanding(t, today);
    if (isOpenTask(t)) {
      row.open += 1;
      if (s.key === "overdue") row.overdue += 1;
      row.oldestOpenDays = Math.max(row.oldestOpenDays, daysOnDesk(t, today));
    } else if (t.status === "Submitted") {
      row.awaitingReview += 1;
    } else if (t.status === "Closed") {
      row.closed += 1;
      if (s.late) row.closedLate += 1;
      if (t.dueDate) {
        row.timed += 1;
        if (!s.late) row.onTime += 1;
      }
    }
    const tat = turnaroundDays(t);
    if (tat !== null) row.turnarounds.push(tat);
  }
  return Array.from(rows.values())
    .map(({ turnarounds, timed, onTime, ...row }) => ({
      ...row,
      onTimeRate: timed ? Math.round((onTime / timed) * 100) : null,
      avgTurnaround: turnarounds.length
        ? Math.round((turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));
}

/** Headline figures for the page's stat strip. */
export interface TaskStats {
  onDesk: number;
  overdue: number;
  awaitingMyReview: number;
  givenOut: number;
}

export function taskStats(tasks: Task[], uid: string, today: string): TaskStats {
  let onDesk = 0;
  let overdue = 0;
  let givenOut = 0;
  for (const t of tasks) {
    if (t.assignedToUid === uid && isOpenTask(t)) {
      onDesk += 1;
      if (taskStanding(t, today).key === "overdue") overdue += 1;
    }
    if (t.assignedByUid === uid && !t.self && isActiveTask(t)) givenOut += 1;
  }
  return { onDesk, overdue, awaitingMyReview: reviewQueue(tasks, uid).length, givenOut };
}

/** Presentation metadata for a status pill. */
export const TASK_STATUS_META: Record<TaskStatus, { chip: "green" | "amber" | "red" | "slate"; label: string }> = {
  Assigned: { chip: "slate", label: "Assigned" },
  "In Progress": { chip: "amber", label: "In progress" },
  Submitted: { chip: "amber", label: "Handed back" },
  Closed: { chip: "green", label: "Closed" },
  Cancelled: { chip: "slate", label: "Cancelled" },
};

export const TASK_PRIORITY_META: Record<TaskPriority, { chip: "green" | "amber" | "red" | "slate"; label: string }> = {
  Urgent: { chip: "red", label: "Urgent" },
  High: { chip: "amber", label: "High" },
  Normal: { chip: "slate", label: "Normal" },
  Low: { chip: "slate", label: "Low" },
};
