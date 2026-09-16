"use client";

import { useEffect, useMemo, useState } from "react";

import { Drawer } from "@/components/Drawer";
import { useToast } from "@/components/Toast";
import { store } from "@/lib/store";
import { todayISO } from "@/lib/rules/week";
import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  allowedTaskActions,
  assignableFor,
  daysOnDesk,
  directReportsOf,
  entryOf,
  gradeLabel,
  taskStanding,
  turnaroundDays,
  type AssignableGroup,
  type TaskAction,
  type TaskActionKind,
  type TaskViewer,
} from "@/lib/rules/tasks";
import {
  TASK_CATEGORIES,
  TASK_OUTCOMES,
  TASK_PRIORITIES,
  type DirectoryEntry,
  type Task,
  type TaskCategory,
  type TaskEvent,
  type TaskOutcome,
  type TaskParty,
  type TaskPriority,
} from "@/lib/rules/types";

import { AssigneeSelect } from "./AssigneeSelect";

const ACTION_LABEL: Record<TaskActionKind, string> = {
  seen: "Seen",
  start: "Start",
  submit: "Hand back",
  close: "Accept & close",
  return: "Return with comments",
  cancel: "Cancel task",
  reassign: "Reassign",
  deadline: "Move deadline",
  "request-extension": "Ask for more time",
  "approve-extension": "Approve extension",
  "decline-extension": "Decline extension",
  "passed-on": "Pass on to my team",
  comment: "Comment",
};

const KIND_ICON: Record<TaskEvent["kind"], string> = {
  created: "✚",
  seen: "◔",
  started: "▸",
  submitted: "↩",
  returned: "↪",
  closed: "⬤",
  cancelled: "✕",
  reassigned: "⇄",
  deadline: "◷",
  "extension-requested": "◷",
  "extension-approved": "✓",
  "extension-declined": "✕",
  "passed-on": "⇣",
  comment: "❝",
};

/**
 * One task, opened from any list: what it is, where it stands, what this
 * account may do to it now, and everything that has happened on it.
 */
export function TaskDrawer({
  task,
  related,
  directory,
  actor,
  viewer,
  onClose,
  onChanged,
  onOpenTask,
}: {
  task: Task | null;
  /** The tasks this one was passed on as (children), for the link list. */
  related: Task[];
  directory: DirectoryEntry[];
  actor: TaskParty | null;
  viewer: TaskViewer | null;
  onClose: () => void;
  onChanged: () => void;
  onOpenTask: (id: string) => void;
}) {
  const toast = useToast();
  const today = todayISO();
  const [local, setLocal] = useState<Task | null>(task);
  const [open, setOpen] = useState<TaskActionKind | null>(null);
  const [busy, setBusy] = useState(false);

  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [outcome, setOutcome] = useState<TaskOutcome>("Done");
  const [toUid, setToUid] = useState("");
  // Pass-on form
  const [childTitle, setChildTitle] = useState("");
  const [childDetails, setChildDetails] = useState("");
  const [childCategory, setChildCategory] = useState<TaskCategory>("Other");
  const [childPriority, setChildPriority] = useState<TaskPriority>("Normal");

  const shown = local && task && local.id === task.id ? local : task;

  // Opening a task is an event on it — the assigner can see it was read.
  useEffect(() => {
    if (!task || !actor || !viewer) return;
    if (task.assignedToUid !== actor.uid || task.seenAt) return;
    (async () => {
      try {
        const s = await store();
        const updated = await s.updateTask(task.id, { kind: "seen" }, actor, viewer);
        setLocal(updated);
        onChanged();
      } catch {
        /* a failed read receipt is not worth a toast */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  const actions = useMemo(
    () => (shown && viewer ? allowedTaskActions(shown, viewer) : []),
    [shown, viewer],
  );

  const reassignGroups: AssignableGroup[] = useMemo(
    () => (actor ? assignableFor(actor.uid, directory, viewer?.isAdmin) : []),
    [actor, directory, viewer?.isAdmin],
  );
  const teamGroups: AssignableGroup[] = useMemo(
    () =>
      actor
        ? [{ heading: "My team", entries: directReportsOf(actor.uid, directory) }]
        : [],
    [actor, directory],
  );

  const reset = () => {
    setOpen(null);
    setNote("");
    setDate("");
    setOutcome("Done");
    setToUid("");
    setChildTitle("");
    setChildDetails("");
    setChildCategory("Other");
    setChildPriority("Normal");
  };

  const pick = (kind: TaskActionKind) => {
    if (open === kind) {
      reset();
      return;
    }
    reset();
    setOpen(kind);
    if (kind === "passed-on" && shown) {
      setChildTitle(shown.title);
      setChildDetails(shown.details);
      setChildCategory(shown.category);
      setChildPriority(shown.priority);
      setDate(shown.dueDate);
    }
  };

  if (!shown) return null;

  const run = async (kind: TaskActionKind) => {
    if (!actor || !viewer || busy) return;
    setBusy(true);
    try {
      const s = await store();
      let updated: Task;
      if (kind === "passed-on") {
        const to = entryOf(toUid, directory);
        if (!to) throw new Error("Choose who it goes to.");
        const res = await s.passTaskOn(
          shown.id,
          {
            title: childTitle,
            details: childDetails,
            category: childCategory,
            priority: childPriority,
            dueDate: date,
            reference: shown.reference,
            link: shown.link,
            assignTo: to,
          },
          actor,
          viewer,
        );
        updated = res.parent;
        toast.push(`Passed on to ${res.child.assignedTo.name}.`, "success");
      } else {
        let action: TaskAction;
        switch (kind) {
          case "submit":
            action = { kind, outcome, note };
            break;
          case "return":
            action = { kind, note, dueDate: date || undefined };
            break;
          case "cancel":
            action = { kind, reason: note };
            break;
          case "reassign": {
            const to = entryOf(toUid, directory);
            if (!to) throw new Error("Choose who it goes to.");
            action = { kind, to, note };
            break;
          }
          case "deadline":
            action = { kind, dueDate: date, reason: note };
            break;
          case "request-extension":
            action = { kind, dueDate: date, reason: note };
            break;
          case "decline-extension":
            action = { kind, note };
            break;
          case "comment":
            action = { kind, note };
            break;
          case "start":
          case "close":
          case "approve-extension":
            action = { kind, note: note || undefined };
            break;
          default:
            action = { kind: "seen" };
        }
        updated = await s.updateTask(shown.id, action, actor, viewer);
        toast.push(
          kind === "comment" ? "Comment added." : `${ACTION_LABEL[kind]} — done.`,
          "success",
        );
      }
      setLocal(updated);
      reset();
      onChanged();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const standing = taskStanding(shown, today);
  const status = TASK_STATUS_META[shown.status];
  const priority = TASK_PRIORITY_META[shown.priority];
  const tat = turnaroundDays(shown);
  const children = related.filter((t) => t.parentId === shown.id);

  return (
    <Drawer open onClose={onClose} title={shown.title} subtitle={shown.category}>
      <section className="card p-4 sm:p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`chip ${status.chip}`}>{status.label}</span>
          <span className={`chip ${standing.chip}`}>{standing.label}</span>
          <span className={`chip ${priority.chip}`}>{priority.label} priority</span>
          {shown.outcome ? (
            <span className={`chip ${shown.outcome === "Done" ? "green" : "red"}`}>
              {shown.outcome}
            </span>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Field
            label="Assigned to"
            value={shown.assignedTo.name}
            sub={gradeLabel(shown.assignedTo.grade) || shown.assignedTo.section || undefined}
          />
          <Field
            label="Given by"
            value={shown.self ? "Self" : shown.assignedBy.name}
            sub={fmt(shown.assignedAt)}
          />
          <Field
            label="Deadline"
            value={shown.dueDate || "None"}
            sub={
              shown.originalDueDate && shown.originalDueDate !== shown.dueDate
                ? `originally ${shown.originalDueDate}`
                : undefined
            }
          />
          <Field
            label={shown.submittedAt ? "Turnaround" : "On the desk"}
            value={
              tat !== null
                ? `${tat} working day${tat === 1 ? "" : "s"}`
                : `${daysOnDesk(shown, today)} working day${daysOnDesk(shown, today) === 1 ? "" : "s"}`
            }
            sub={
              shown.seenAt
                ? `opened ${fmt(shown.seenAt)}`
                : shown.status === "Assigned"
                  ? "not yet opened"
                  : undefined
            }
          />
          {shown.reference ? <Field label="Reference" value={shown.reference} /> : null}
          {shown.watchers.length ? (
            <Field label="In the loop" value={shown.watchers.map((w) => w.name).join(", ")} />
          ) : null}
        </dl>

        {shown.details ? (
          <div className="mt-4">
            <div className="caps text-[10px] text-gunmetal/60">Details</div>
            <div className="text-sm mt-1 whitespace-pre-line">{shown.details}</div>
          </div>
        ) : null}

        {shown.link ? (
          <div className="mt-3 text-sm">
            <a
              className="underline text-[var(--rpa-green-dark)] break-all"
              href={shown.link}
              target="_blank"
              rel="noreferrer"
            >
              {shown.link}
            </a>
          </div>
        ) : null}

        {shown.extensionRequest ? (
          <div className="mt-4 inset p-3" role="status">
            <div className="caps text-[10px] text-gunmetal/60">Extension asked for</div>
            <div className="text-sm mt-1">
              To <strong className="tabular">{shown.extensionRequest.dueDate}</strong>:{" "}
              {shown.extensionRequest.reason}
            </div>
          </div>
        ) : null}

        {shown.parentId ? (
          <div className="mt-4 text-xs text-gunmetal/70">
            Passed on from{" "}
            <button className="link-action" onClick={() => onOpenTask(shown.parentId!)}>
              {shown.parentTitle || "the task above"}
            </button>
          </div>
        ) : null}
        {children.length ? (
          <div className="mt-4">
            <div className="caps text-[10px] text-gunmetal/60">Passed on as</div>
            <ul className="mt-1 space-y-1 text-sm">
              {children.map((c) => {
                const cs = taskStanding(c, today);
                return (
                  <li key={c.id} className="flex items-center gap-2 flex-wrap">
                    <button className="link-action" onClick={() => onOpenTask(c.id)}>
                      {c.assignedTo.name}
                    </button>
                    <span className={`chip ${TASK_STATUS_META[c.status].chip}`}>
                      {TASK_STATUS_META[c.status].label}
                    </span>
                    <span className={`chip ${cs.chip}`}>{cs.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>

      {actions.length > 0 && actor ? (
        <section className="card p-4 sm:p-5">
          <div className="section-title mb-3">Actions</div>
          <div className="flex gap-2 flex-wrap">
            {actions.map((a) => (
              <button
                key={a}
                className={`btn ${
                  a === "cancel" || a === "decline-extension"
                    ? "btn-ghost"
                    : a === "comment" || a === "deadline" || a === "reassign"
                      ? "btn-secondary"
                      : "btn-primary"
                }`}
                aria-pressed={open === a}
                onClick={() => pick(a)}
              >
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>

          {open === "submit" ? (
            <Form>
              <Labeled label="Outcome">
                <select
                  className="input mt-1"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as TaskOutcome)}
                >
                  {TASK_OUTCOMES.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Labeled>
              <NoteField
                note={note}
                setNote={setNote}
                label={outcome === "Done" ? "What was done (optional)" : "Why it could not be done"}
              />
              <RunButton busy={busy} onClick={() => run("submit")}>
                Hand back to {shown.self ? "myself" : shown.assignedBy.name}
              </RunButton>
            </Form>
          ) : null}

          {open === "return" ? (
            <Form>
              <NoteField note={note} setNote={setNote} label="What is still needed" />
              <Labeled label="New deadline (optional)">
                <input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
              </Labeled>
              <RunButton busy={busy} onClick={() => run("return")}>
                Return to {shown.assignedTo.name}
              </RunButton>
            </Form>
          ) : null}

          {open === "cancel" ? (
            <Form>
              <NoteField note={note} setNote={setNote} label="Reason" />
              <RunButton busy={busy} danger onClick={() => run("cancel")}>
                Cancel task
              </RunButton>
            </Form>
          ) : null}

          {open === "reassign" ? (
            <Form>
              <Labeled label="To">
                <div className="mt-1">
                  <AssigneeSelect
                    groups={reassignGroups}
                    value={toUid}
                    onChange={setToUid}
                    exclude={[shown.assignedToUid]}
                  />
                </div>
              </Labeled>
              <NoteField note={note} setNote={setNote} label="Note (optional)" />
              <RunButton busy={busy} onClick={() => run("reassign")}>
                Reassign
              </RunButton>
            </Form>
          ) : null}

          {open === "deadline" || open === "request-extension" ? (
            <Form>
              <Labeled label={open === "deadline" ? "New deadline (blank for none)" : "Date asked for"}>
                <input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
              </Labeled>
              <NoteField note={note} setNote={setNote} label="Reason" />
              <RunButton busy={busy} onClick={() => run(open)}>
                {ACTION_LABEL[open]}
              </RunButton>
            </Form>
          ) : null}

          {open === "passed-on" ? (
            <Form>
              <Labeled label="To">
                <div className="mt-1">
                  <AssigneeSelect groups={teamGroups} value={toUid} onChange={setToUid} />
                </div>
              </Labeled>
              <Labeled label="Title">
                <input className="input mt-1" value={childTitle} onChange={(e) => setChildTitle(e.target.value)} />
              </Labeled>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Labeled label="Category">
                  <select className="input mt-1" value={childCategory} onChange={(e) => setChildCategory(e.target.value as TaskCategory)}>
                    {TASK_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="Priority">
                  <select className="input mt-1" value={childPriority} onChange={(e) => setChildPriority(e.target.value as TaskPriority)}>
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="Deadline">
                  <input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
                </Labeled>
              </div>
              <Labeled label="Instructions">
                <textarea className="input mt-1" rows={3} value={childDetails} onChange={(e) => setChildDetails(e.target.value)} />
              </Labeled>
              <div className="text-[11px] text-gunmetal/60">
                This stays on your desk until you hand it back yourself; the new task is linked to it.
              </div>
              <RunButton busy={busy} onClick={() => run("passed-on")}>
                Pass on
              </RunButton>
            </Form>
          ) : null}

          {open === "decline-extension" || open === "comment" ? (
            <Form>
              <NoteField note={note} setNote={setNote} label={open === "comment" ? "Comment" : "Reason"} />
              <RunButton busy={busy} danger={open === "decline-extension"} onClick={() => run(open)}>
                {ACTION_LABEL[open]}
              </RunButton>
            </Form>
          ) : null}

          {open === "start" || open === "close" || open === "approve-extension" ? (
            <Form>
              <NoteField note={note} setNote={setNote} label="Note (optional)" />
              <RunButton busy={busy} onClick={() => run(open)}>
                {ACTION_LABEL[open]}
              </RunButton>
            </Form>
          ) : null}
        </section>
      ) : null}

      <section className="card p-4 sm:p-5">
        <h3 className="section-title mb-3">History &amp; comments</h3>
        <ul className="space-y-3">
          {[...shown.events].reverse().map((e, i) => (
            <li key={i} className="flex gap-3">
              <div
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs"
                style={{ background: "rgba(0,160,80,0.12)", color: "#0b5" }}
                aria-hidden="true"
              >
                {KIND_ICON[e.kind]}
              </div>
              <div className="min-w-0">
                <div className="text-sm whitespace-pre-line">{e.text}</div>
                <div className="text-[11px] text-gunmetal/55">
                  {e.byName} · {fmt(e.at)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Drawer>
  );
}

function Form({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 space-y-3">{children}</div>;
}

function Field({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="caps text-[10px] text-gunmetal/60">{label}</dt>
      <dd className="font-bold mt-1 break-words">{value}</dd>
      {sub ? <dd className="text-[11px] text-gunmetal/55">{sub}</dd> : null}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

function NoteField({ note, setNote, label }: { note: string; setNote: (v: string) => void; label: string }) {
  return (
    <Labeled label={label}>
      <textarea className="input mt-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
    </Labeled>
  );
}

function RunButton({
  busy,
  onClick,
  danger,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button className={`btn ${danger ? "btn-ghost" : "btn-primary"}`} disabled={busy} onClick={onClick}>
      {busy ? "Working…" : children}
    </button>
  );
}

export function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
