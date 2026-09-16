"use client";

import { GRADE_META } from "@/lib/rules/types";
import type { AssignableGroup } from "@/lib/rules/tasks";

/**
 * Who a task goes to: the account's own reporting line, grouped — themself,
 * their team, their peers, their supervisor (and, for an administrator, the
 * rest of the directory). Anyone not listed is reached through their own
 * supervisor; the page says so beneath the picker.
 */
export function AssigneeSelect({
  id,
  groups,
  value,
  onChange,
  exclude = [],
}: {
  id?: string;
  groups: AssignableGroup[];
  value: string;
  onChange: (uid: string) => void;
  /** Accounts to leave out — the current assignee on a reassign. */
  exclude?: string[];
}) {
  return (
    <select
      id={id}
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Choose…</option>
      {groups.map((g) => {
        const entries = g.entries.filter((e) => !exclude.includes(e.uid));
        if (!entries.length) return null;
        return (
          <optgroup key={g.heading} label={g.heading}>
            {entries.map((e) => (
              <option key={e.uid} value={e.uid}>
                {e.displayName}
                {e.grade ? ` · ${GRADE_META[e.grade].short}` : ""}
                {e.border ? ` · ${e.border}` : e.section !== "All" ? ` · ${e.section}` : ""}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
