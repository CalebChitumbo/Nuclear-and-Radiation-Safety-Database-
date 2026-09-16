"use client";

import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  taskStanding,
} from "@/lib/rules/tasks";
import type { Task } from "@/lib/rules/types";

/**
 * One task on a list. `side` says whose list it is on: the officer's desk
 * shows who gave it, the supervisor's list who has it.
 */
export function TaskCard({
  task,
  today,
  side,
  onOpen,
}: {
  task: Task;
  today: string;
  side: "desk" | "given" | "all";
  onOpen: () => void;
}) {
  const standing = taskStanding(task, today);
  const priority = TASK_PRIORITY_META[task.priority];
  const status = TASK_STATUS_META[task.status];
  const unseen = task.status === "Assigned" && !task.seenAt;
  return (
    <li>
      <button
        onClick={onOpen}
        className="inset w-full text-left p-3 transition-colors hover:brightness-[0.98]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold break-words leading-tight">
              {task.title}
              {unseen && side !== "desk" ? (
                <span className="ml-2 chip amber">Not yet opened</span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className={`chip ${standing.chip}`}>{standing.label}</span>
              {task.priority !== "Normal" ? (
                <span className={`chip ${priority.chip}`}>{priority.label}</span>
              ) : null}
              <span className="chip">{task.category}</span>
              {side === "all" ? (
                <span className={`chip ${status.chip}`}>{status.label}</span>
              ) : null}
              {task.extensionRequest ? (
                <span className="chip amber">Extension asked</span>
              ) : null}
              {task.returns > 0 ? (
                <span className="chip slate">
                  Returned {task.returns}×
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-[11px] tabular text-gunmetal/55 text-right shrink-0">
            {task.dueDate ? <div>due {task.dueDate}</div> : null}
            {task.reference ? <div className="caps">{task.reference}</div> : null}
          </div>
        </div>
        {task.details ? (
          <div className="text-xs text-gunmetal/70 mt-2 line-clamp-2">
            {task.details}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-gunmetal/55">
          <span className="truncate">
            {side === "desk"
              ? task.self
                ? "Own task"
                : `From ${task.assignedBy.name}`
              : side === "given"
                ? `With ${task.assignedTo.name}`
                : `${task.assignedBy.name} → ${task.assignedTo.name}`}
          </span>
          {task.parentId ? (
            <span className="chip slate shrink-0">Passed on</span>
          ) : null}
        </div>
      </button>
    </li>
  );
}
