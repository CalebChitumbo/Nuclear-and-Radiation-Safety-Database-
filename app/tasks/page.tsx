"use client";

/**
 * The Tasks desk.
 *
 * Every account has one. An officer sees what has been given to them, grouped
 * by when it is due, and hands each piece back when it is done. Whoever gave
 * it sees what they have out, who has it, what has come back for their
 * review and how long things are taking — and closes or returns each one.
 *
 * Who may give work to whom is the reporting line on the staff directory:
 * a direct report, a peer, one's own supervisor. See lib/rules/tasks.ts.
 */

import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { Panel } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { AssigneeSelect } from "@/components/tasks/AssigneeSelect";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskDrawer } from "@/components/tasks/TaskDrawer";
import { todayISO } from "@/lib/rules/week";
import {
  TASK_STATUS_META,
  assignableFor,
  assignerSummary,
  chainAbove,
  deskFor,
  entryOf,
  gradeLabel,
  hasReports,
  isActiveTask,
  partyOf,
  reviewQueue,
  sortByUrgency,
  taskScopeFor,
  taskStats,
  type TaskViewer,
} from "@/lib/rules/tasks";
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskCategory,
  type TaskParty,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/rules/types";

type Tab = "desk" | "given" | "all";

export default function TasksPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const today = todayISO();
  const scope = useMemo(() => taskScopeFor(user), [user]);

  const { data, error, reload } = useStoreData(
    async (s) => {
      const [directory, tasks] = await Promise.all([
        s.listDirectory(),
        scope ? s.listTasks(scope) : Promise.resolve([] as Task[]),
      ]);
      return { directory, tasks };
    },
    [scope?.uid],
  );
  const directory = useMemo(() => data?.directory || [], [data]);
  const tasks = useMemo(() => data?.tasks || [], [data]);

  const me = user ? entryOf(user.uid, directory) : null;
  const actor: TaskParty | null = user
    ? partyOf({
        uid: user.uid,
        displayName: user.displayName,
        section: user.section,
        grade: me?.grade,
      })
    : null;
  const viewer: TaskViewer | null = user
    ? { uid: user.uid, isAdmin, hasReports: hasReports(user.uid, directory) }
    : null;

  const groups = useMemo(
    () => (user ? assignableFor(user.uid, directory, isAdmin) : []),
    [user, directory, isAdmin],
  );
  const canGive = groups.some((g) => g.heading !== "Myself");
  const line = user ? chainAbove(user.uid, directory) : [];

  const [tab, setTab] = useState<Tab>("desk");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [officerFilter, setOfficerFilter] = useState("");

  // New-task form
  const [toUid, setToUid] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [category, setCategory] = useState<TaskCategory>("Letter response");
  const [priority, setPriority] = useState<TaskPriority>("Normal");
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const stats = useMemo(
    () => (user ? taskStats(tasks, user.uid, today) : null),
    [tasks, user, today],
  );
  const desk = useMemo(
    () => (user ? deskFor(tasks, user.uid, today) : []),
    [tasks, user, today],
  );
  const queue = useMemo(
    () => (user ? reviewQueue(tasks, user.uid) : []),
    [tasks, user],
  );
  const given = useMemo(
    () => (user ? tasks.filter((t) => t.assignedByUid === user.uid && !t.self) : []),
    [tasks, user],
  );
  const summary = useMemo(
    () => (user ? assignerSummary(tasks, user.uid, today) : []),
    [tasks, user, today],
  );
  const everyone = useMemo(() => {
    let list = tasks;
    if (statusFilter) list = list.filter((t) => t.status === statusFilter);
    if (officerFilter) list = list.filter((t) => t.assignedToUid === officerFilter);
    return sortByUrgency(list);
  }, [tasks, statusFilter, officerFilter]);
  const officers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) seen.set(t.assignedToUid, t.assignedTo.name);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  const openTask = openId ? tasks.find((t) => t.id === openId) || null : null;

  const resetForm = () => {
    setToUid("");
    setTitle("");
    setDetails("");
    setCategory("Letter response");
    setPriority("Normal");
    setDueDate("");
    setReference("");
    setLink("");
  };

  const give = async () => {
    if (!actor || !viewer || busy) return;
    const to = entryOf(toUid, directory);
    if (!to) {
      toast.push("Choose who the task goes to.", "error");
      return;
    }
    if (!title.trim()) {
      toast.push("Give the task a title.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      const t = await s.addTask(
        { title, details, category, priority, dueDate, reference, link, assignTo: to },
        actor,
        viewer,
      );
      toast.push(
        t.self ? "Added to your desk." : `Assigned to ${t.assignedTo.name}.`,
        "success",
      );
      resetForm();
      setShowForm(false);
      reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-4 staggered">
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}

      {queue.length > 0 ? (
        <div
          className="card bleed p-4"
          style={{ borderLeft: "3px solid #B8860B" }}
          role="status"
        >
          <div className="font-bold text-sm">
            {queue.length} {queue.length === 1 ? "task is" : "tasks are"} waiting on you
          </div>
          <div className="text-xs text-gunmetal/70 mt-0.5">
            Handed back for your review, or asking for more time. They are under
            “Given out”.
          </div>
        </div>
      ) : null}

      {stats ? (
        <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
          <Kpi label="On my desk" value={stats.onDesk} />
          <Kpi label="Overdue" value={stats.overdue} accent={stats.overdue ? "red" : "neutral"} />
          <Kpi
            label="Waiting on me"
            value={stats.awaitingMyReview}
            accent={stats.awaitingMyReview ? "amber" : "neutral"}
          />
          <Kpi label="Given out, open" value={stats.givenOut} accent="slate" />
        </section>
      ) : null}

      <Panel
        title="Give a task"
        note={
          canGive
            ? "To someone on your line — your team, your peers or your supervisor. Anyone else is reached through their supervisor, who passes it on."
            : me
              ? "Nobody reports to you yet, so this adds to your own desk. Your supervisor gives you work here too."
              : "Your account is not yet placed on the reporting line. An administrator does that on the Users desk; until then you can add tasks to your own desk only."
        }
        action={
          <button
            className="btn btn-primary"
            aria-pressed={showForm}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Close" : "+ New task"}
          </button>
        }
      >
        {line.length ? (
          <p className="text-[11px] text-gunmetal/55 -mt-1 mb-3">
            You{me?.grade ? ` (${gradeLabel(me.grade)})` : ""} report to{" "}
            {line.map((l, i) => (
              <span key={l.uid}>
                {i > 0 ? ", who reports to " : ""}
                <strong>{l.displayName}</strong>
              </span>
            ))}
            .
          </p>
        ) : null}
        {showForm ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="task-to">
                To
              </label>
              <AssigneeSelect id="task-to" groups={groups} value={toUid} onChange={setToUid} />
            </div>
            <div>
              <label className="field-label" htmlFor="task-title">
                Task
              </label>
              <input
                id="task-title"
                className="input"
                placeholder="e.g. Respond to MoH letter on Kitwe Central shielding"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="task-category">
                  Category
                </label>
                <select
                  id="task-category"
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TaskCategory)}
                >
                  {TASK_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="task-priority">
                  Priority
                </label>
                <select
                  id="task-priority"
                  className="input"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="task-due">
                  Deadline
                </label>
                <input
                  id="task-due"
                  type="date"
                  className="input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="task-ref">
                  Reference (optional)
                </label>
                <input
                  id="task-ref"
                  className="input"
                  placeholder="Letter Ref No., RAN…"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="field-label" htmlFor="task-link">
                Link to the material (optional)
              </label>
              <input
                id="task-link"
                className="input"
                placeholder="https://… (SharePoint, Drive)"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="field-label" htmlFor="task-details">
                Instructions
              </label>
              <textarea
                id="task-details"
                className="input"
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="What is needed, and anything the officer should know."
              />
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={busy} onClick={give}>
                {busy ? "Saving…" : "Assign"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel
        title={
          tab === "desk"
            ? "My desk"
            : tab === "given"
              ? "Given out"
              : scope?.department
                ? "Every task"
                : "My section"
        }
      >
        <div className="seg w-full">
          <button className="seg-btn" aria-pressed={tab === "desk"} onClick={() => setTab("desk")}>
            My desk
            {stats?.onDesk ? <span className="ml-1 opacity-70 tabular">{stats.onDesk}</span> : null}
          </button>
          <button className="seg-btn" aria-pressed={tab === "given"} onClick={() => setTab("given")}>
            Given out
            {queue.length ? <span className="ml-1 opacity-70 tabular">{queue.length}</span> : null}
          </button>
          <button className="seg-btn" aria-pressed={tab === "all"} onClick={() => setTab("all")}>
            {scope?.department ? "Everyone" : "Section"}
          </button>
        </div>

        {tab === "desk" ? (
          desk.length === 0 ? (
            <p className="py-10 text-center text-sm text-gunmetal/55">
              Nothing on your desk. Work given to you appears here, soonest deadline first.
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              {desk.map((g) => (
                <div key={g.heading}>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`chip ${
                        g.heading === "Overdue"
                          ? "red"
                          : g.heading === "Due today" || g.heading === "Handed back"
                            ? "amber"
                            : g.heading === "Recently closed"
                              ? "green"
                              : "slate"
                      }`}
                    >
                      {g.heading}
                    </span>
                    <span className="text-xs text-gunmetal/55 tabular">{g.tasks.length}</span>
                  </div>
                  <ul className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                    {g.tasks.map((t) => (
                      <TaskCard key={t.id} task={t} today={today} side="desk" onOpen={() => setOpenId(t.id)} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )
        ) : null}

        {tab === "given" ? (
          given.length === 0 ? (
            <p className="py-10 text-center text-sm text-gunmetal/55">
              {canGive
                ? "You have not given out any tasks yet."
                : "Tasks you give to your team will be tracked here."}
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              {queue.length ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="chip amber">Waiting on you</span>
                    <span className="text-xs text-gunmetal/55 tabular">{queue.length}</span>
                  </div>
                  <ul className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                    {queue.map((t) => (
                      <TaskCard key={t.id} task={t} today={today} side="given" onOpen={() => setOpenId(t.id)} />
                    ))}
                  </ul>
                </div>
              ) : null}

              {summary.length ? (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Officer</th>
                        <th className="text-right">Open</th>
                        <th className="text-right">Overdue</th>
                        <th className="text-right">Handed back</th>
                        <th className="text-right">Closed</th>
                        <th className="text-right">On time</th>
                        <th className="text-right">Avg turnaround</th>
                        <th className="text-right">Oldest open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((r) => (
                        <tr key={r.uid}>
                          <td className="font-bold">
                            <button className="link-action" onClick={() => { setOfficerFilter(r.uid); setTab("all"); }}>
                              {r.name}
                            </button>
                          </td>
                          <td className="text-right tabular">{r.open}</td>
                          <td className="text-right tabular" style={r.overdue ? { color: "var(--status-stalled)" } : undefined}>
                            {r.overdue}
                          </td>
                          <td className="text-right tabular">{r.awaitingReview}</td>
                          <td className="text-right tabular">
                            {r.closed}
                            {r.closedLate ? <span className="text-gunmetal/55"> ({r.closedLate} late)</span> : null}
                          </td>
                          <td className="text-right tabular">{r.onTimeRate === null ? "—" : `${r.onTimeRate}%`}</td>
                          <td className="text-right tabular">{r.avgTurnaround === null ? "—" : `${r.avgTurnaround}d`}</td>
                          <td className="text-right tabular">{r.open ? `${r.oldestOpenDays}d` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-gunmetal/55 px-1 mt-2">
                    Days are working days — weekends and public holidays are not counted. On time is the share of closed tasks with a deadline that were handed back by it.
                  </p>
                </div>
              ) : null}

              {(["Assigned", "In Progress", "Closed", "Cancelled"] as TaskStatus[]).map((st) => {
                const items = sortByUrgency(
                  given.filter((t) => t.status === st && !queue.some((q) => q.id === t.id)),
                );
                if (!items.length) return null;
                return (
                  <div key={st}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`chip ${TASK_STATUS_META[st].chip}`}>{TASK_STATUS_META[st].label}</span>
                      <span className="text-xs text-gunmetal/55 tabular">{items.length}</span>
                    </div>
                    <ul className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                      {items.map((t) => (
                        <TaskCard key={t.id} task={t} today={today} side="given" onOpen={() => setOpenId(t.id)} />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )
        ) : null}

        {tab === "all" ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "")}>
                <option value="">Any status</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_META[s].label}</option>
                ))}
              </select>
              <select className="input w-auto" value={officerFilter} onChange={(e) => setOfficerFilter(e.target.value)}>
                <option value="">Any officer</option>
                {officers.map(([uid, name]) => (
                  <option key={uid} value={uid}>{name}</option>
                ))}
              </select>
              <span className="text-xs text-gunmetal/55 self-center tabular">
                {everyone.length} of {tasks.length} · {tasks.filter(isActiveTask).length} live
              </span>
            </div>
            {everyone.length === 0 ? (
              <p className="py-10 text-center text-sm text-gunmetal/55">No tasks match.</p>
            ) : (
              <ul className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                {everyone.map((t) => (
                  <TaskCard key={t.id} task={t} today={today} side="all" onOpen={() => setOpenId(t.id)} />
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Panel>

      <TaskDrawer
        task={openTask}
        related={tasks}
        directory={directory}
        actor={actor}
        viewer={viewer}
        onClose={() => setOpenId(null)}
        onChanged={reload}
        onOpenTask={setOpenId}
      />
    </div>
  );
}
