"use client";

/**
 * Correcting something already in the daily log.
 *
 * The log is typed in the field, often on a phone, and what gets typed is
 * sometimes the wrong number, the wrong metric, the wrong post or the wrong
 * day. Until now the only remedy was to remove the entry and log it again,
 * which loses the entry's own history and — for a border post's screening
 * figure — risks putting the day back twice. So this form edits the entry in
 * place, and the audit log records the correction the same way it records the
 * original: who changed what, from what, to what.
 *
 * Who may use it is `dailyEntryEditScope`, which mirrors the `dailyEntries`
 * update rule: an administrator on any entry, an officer on their own, and
 * anyone in the section on a post's screening figure — that last one narrowed
 * to the number and its remark, because the rules refuse to let such a write
 * re-point the post-day at another post or another day.
 */
import { useState } from "react";

import { store } from "@/lib/store";
import { useToast } from "@/components/Toast";
import {
  dailyMetricOptions,
  editedDailyEntry,
  planDailyEntryWrite,
  vehicleScreeningKey,
  type DailyEntryEditScope,
} from "@/lib/rules/daily";
import { weekLabelForDate } from "@/lib/rules/week";
import type { Subprogramme } from "@/lib/rules/workPlan";
import type { Border, DailyEntry, WeekDef } from "@/lib/rules/types";

export function DailyEntryEditor({
  entry,
  scope,
  entries,
  weeks,
  borders,
  plan,
  canPickBorder,
  editor,
  onSaved,
  onCancel,
}: {
  entry: DailyEntry;
  /** What this account may change — see dailyEntryEditScope. */
  scope: Exclude<DailyEntryEditScope, "none">;
  /** Every entry the account can see, to name a figure about to be replaced. */
  entries: DailyEntry[];
  weeks: WeekDef[];
  borders: Border[];
  /** The plan in force, so the metric list matches what the wizard offers. */
  plan?: Subprogramme[];
  /** False for a coordinator posted to one office — theirs is the only post. */
  canPickBorder: boolean;
  editor: { uid: string; name: string };
  onSaved: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const full = scope === "full";
  const isCount = entry.kind === "count";

  const [date, setDate] = useState(entry.date);
  const [metricKey, setMetricKey] = useState(entry.metricKey || "");
  const [value, setValue] = useState(
    entry.value === undefined ? "" : String(entry.value),
  );
  const [border, setBorder] = useState(entry.border || "");
  const [text, setText] = useState(entry.text || "");
  const [busy, setBusy] = useState(false);

  // The section's metric list, plus the entry's own key when it was logged
  // under wording the plan has since moved on from — an old figure stays
  // editable without being silently re-pointed at a metric nobody chose.
  const options = dailyMetricOptions(entry.section, plan);
  const known = options.some((o) => o.key === metricKey);
  const metricChoices = known
    ? options
    : [
        {
          key: metricKey,
          label: `${entry.label || "As logged"} (as logged)`,
          keys: [metricKey],
          outputId: "",
          supporting: false,
        },
        ...options,
      ];
  const picked = metricChoices.find((o) => o.key === metricKey);

  const week = weekLabelForDate(date, weeks, "");
  const nextBorder = (isCount && border.trim()) || undefined;
  const nextKey = isCount ? metricKey : undefined;

  // Where the correction lands, and the figure it would replace when a
  // screening entry moves to another post-day (one post, one day, one figure).
  const write = planDailyEntryWrite(entry, {
    kind: entry.kind,
    metricKey: nextKey,
    border: nextBorder,
    date,
  });
  const replacing =
    write.id && write.id !== entry.id
      ? entries.find((e) => e.id === write.id) || null
      : null;

  const n = Number(value);
  const badNumber = isCount && (!Number.isFinite(n) || n < 0);

  const save = async () => {
    if (busy) return;
    if (!date) {
      toast.push("Give the entry a date.", "error");
      return;
    }
    if (!week) {
      toast.push(
        `${date} is outside the reporting calendar — pick a day inside it.`,
        "error",
      );
      return;
    }
    if (badNumber) {
      toast.push("Enter a figure of zero or more.", "error");
      return;
    }
    if (isCount && !metricKey) {
      toast.push("Choose what the figure is for.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      const next = editedDailyEntry(
        entry,
        {
          ...entry,
          date,
          week,
          metricKey: nextKey,
          label: isCount ? picked?.label || entry.label : entry.label,
          value: isCount ? Math.floor(n) : entry.value,
          text: text.trim() || undefined,
          border: nextBorder,
        },
        editor,
      );
      // `id` is the document's, not part of it.
      const { id: _id, ...data } = next as DailyEntry;
      if (write.id) await s.setDailyEntry(write.id, data);
      else await s.addDailyEntry(data);
      if (write.removeId && write.removeId !== write.id) {
        await s.deleteDailyEntry(write.removeId);
      }
      toast.push("Entry corrected.", "success");
      onSaved();
    } catch (err) {
      toast.push(
        `Saving the correction failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const activeBorders = borders.filter((b) => b.active || b.name === border);
  const isScreening = isCount && metricKey === vehicleScreeningKey();

  return (
    <div className="space-y-3 border-t border-gunmetal/8 pt-3 mt-3">
      <div className="caps text-[10px] text-gunmetal/55">
        Correcting an entry — {entry.kind === "count" ? "figure" : "note"} logged
        by {entry.loggedByName || entry.updatedByName || "an officer"}
      </div>

      <div className="flex flex-wrap gap-3">
        {full ? (
          <div>
            <label className="field-label" htmlFor={`edit-date-${entry.id}`}>
              Day
            </label>
            <input
              id={`edit-date-${entry.id}`}
              type="date"
              className="input"
              style={{ maxWidth: 170 }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <div className="text-[11px] text-gunmetal/50 mt-0.5">
              {week || "outside the calendar"}
            </div>
          </div>
        ) : null}

        {isCount ? (
          <div className="grow" style={{ minWidth: "14rem" }}>
            <label className="field-label" htmlFor={`edit-metric-${entry.id}`}>
              What the figure is for
            </label>
            <select
              id={`edit-metric-${entry.id}`}
              className="input"
              value={metricKey}
              disabled={!full}
              onChange={(e) => setMetricKey(e.target.value)}
            >
              {metricChoices.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {isCount ? (
          <div>
            <label className="field-label" htmlFor={`edit-value-${entry.id}`}>
              Figure
            </label>
            <input
              id={`edit-value-${entry.id}`}
              className="input tabular"
              style={{ maxWidth: 120 }}
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        ) : null}

        {isCount && full && canPickBorder ? (
          <div>
            <label className="field-label" htmlFor={`edit-border-${entry.id}`}>
              Border post
            </label>
            <select
              id={`edit-border-${entry.id}`}
              className="input"
              value={border}
              onChange={(e) => setBorder(e.target.value)}
            >
              <option value="">Head office / other</option>
              {activeBorders.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div>
        <label className="field-label" htmlFor={`edit-text-${entry.id}`}>
          {isCount ? "Remark (optional)" : "Note"}
        </label>
        <textarea
          id={`edit-text-${entry.id}`}
          className="input"
          rows={isCount ? 2 : 3}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {replacing ? (
        <p className="text-xs" style={{ color: "var(--status-stalled)" }}>
          {replacing.border || "That post"} already holds{" "}
          <strong className="tabular">{replacing.value ?? 0}</strong> for{" "}
          {replacing.date}. Saving replaces that figure — one post, one day, one
          figure.
        </p>
      ) : null}

      {isScreening && !full ? (
        <p className="text-xs text-gunmetal/55">
          The post and the day this figure was filed against stay as they are —
          only an administrator, or the officer who logged it, may move it.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-primary"
          disabled={busy || badNumber || !week}
          onClick={save}
        >
          {busy ? "Saving…" : "Save the correction"}
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
