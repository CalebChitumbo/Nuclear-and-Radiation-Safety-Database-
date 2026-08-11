"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { canEditSection, useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { downloadTextFile } from "@/components/downloadFile";
import { LoadErrorBanner } from "@/components/LoadError";
import { PageHeader, Panel } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { useWeek } from "@/lib/weekContext";
import {
  effectiveValuesByWeek,
  entriesForWeek,
  mergeWeekManualValues,
} from "@/lib/rules/daily";
import { toCsv } from "@/lib/rules/exportCsv";
import {
  buildQuarterIndex,
  deriveWorkPlan,
  formatPercent,
  workPlanBrief,
  workPlanRows,
  WORK_PLAN_CSV_HEADER,
  WORK_PLAN_STATUSES,
  WORK_PLAN_YEAR,
  type Quarter,
  type SubprogrammeReport,
  type WorkPlanRow,
} from "@/lib/rules/workPlan";
import {
  SECTIONS,
  type Activity,
  type WorkPlanNote,
  type WorkPlanStatus,
} from "@/lib/rules/types";

const ACTIVITY_STATUSES: Activity["status"][] = [
  "Not Started",
  "In Progress",
  "On Hold",
  "Done",
];

const STATUS_TONE: Record<WorkPlanStatus, string> = {
  "Not Started": "",
  "In Progress": "amber",
  Pending: "amber",
  "On Hold": "red",
  Achieved: "green",
  Cancelled: "red",
};

/**
 * The sectional update, in the format of the approved 2026 RPA work plan — one
 * row per output, the workbook's own columns, and a leading **this week**
 * figure because the report is still produced for the Monday meeting.
 *
 * Nothing here is retyped: licences issued, inspections conducted, enforcement
 * actions and vehicles screened come off the dated registers and the daily /
 * border logs. What an officer types is the figure for outputs the system
 * cannot see (guides written, SOPs revised, trainings held) plus the Status,
 * Comments and Action Points columns.
 */
export default function WeeklyPage() {
  const { user } = useAuth();
  const { selected, weeks } = useWeek();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, error, reload } = useStoreData(async (s) => {
    const [
      events,
      inspections,
      activities,
      weekMetricsAll,
      dailyEntries,
      workPlanNotes,
    ] = await Promise.all([
      s.listLicenceEvents(),
      s.listInspections(),
      s.listActivities(),
      s.listWeekMetricsAll().catch(() => []),
      // Daily Updates roll up into this report; degrade to empty until the
      // dailyEntries rules are deployed.
      s.listDailyEntries().catch(() => []),
      s.listWorkPlanNotes().catch(() => []),
    ]);
    return {
      events,
      inspections,
      activities,
      weekMetricsAll,
      dailyEntries,
      workPlanNotes,
    };
  });

  const derived = useMemo(() => {
    if (!data) return null;
    // Manual figures: the week's Daily Updates counts take precedence over a
    // value typed here, per metric — a section logging daily never gets its
    // numbers overwritten or double counted.
    const wkDaily = entriesForWeek(data.dailyEntries, selected.label);
    const stored =
      data.weekMetricsAll.find((w) => w.week === selected.label)?.values || {};
    const { fromDaily } = mergeWeekManualValues(stored, wkDaily);
    const valuesByWeek = effectiveValuesByWeek(
      data.weekMetricsAll,
      data.dailyEntries,
    );
    const notes: Record<string, WorkPlanNote> = {};
    for (const n of data.workPlanNotes) notes[n.id] = n;

    const reports = deriveWorkPlan({
      weeks,
      week: selected.label,
      events: data.events,
      inspections: data.inspections,
      valuesByWeek,
      dailyEntries: data.dailyEntries,
      fromDaily,
      notes,
    });
    const quarter = buildQuarterIndex(weeks).get(selected.label) ?? null;
    return { reports, quarter };
  }, [data, weeks, selected.label]);

  if (!data || !derived) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  const { reports, quarter } = derived;
  const wkActivities = data.activities.filter((a) => a.week === selected.label);
  const planRows = reports.flatMap((r) => r.rows);
  const achieved = planRows.filter((r) => r.status === "Achieved").length;
  const notStarted = planRows.filter((r) => r.status === "Not Started").length;
  // Outputs moved this week, not a sum of the figures — adding vehicles
  // screened to safety guides written would be a number about nothing.
  const movedThisWeek = planRows.filter((r) => r.week > 0).length;

  const onWeekValueChange = async (key: string, value: number) => {
    try {
      const s = await store();
      await s.setWeekMetricValue(selected.label, key, value);
      reload();
    } catch (err) {
      toast.push(
        `Saving the figure failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  };

  const onNoteSave = async (
    id: string,
    patch: Pick<WorkPlanNote, "status" | "comments" | "actionPoints">,
  ) => {
    try {
      const s = await store();
      await s.setWorkPlanNote(id, patch, user?.uid || "");
      toast.push("Saved.", "success");
      reload();
    } catch (err) {
      toast.push(
        `Saving failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  };

  const shortWeek = selected.label.split(" ")[0];

  const exportSheet = () => {
    const rows = workPlanRows(reports).map((r) => [selected.label, ...r]);
    downloadTextFile(
      `RPA-work-plan-${WORK_PLAN_YEAR}-${shortWeek}.csv`,
      toCsv(["Reporting Week", ...WORK_PLAN_CSV_HEADER], rows),
    );
    toast.push("Work plan sheet exported.", "success");
  };

  const generateBrief = () => {
    const lines = [workPlanBrief(reports, selected.label)];
    if (wkActivities.length) {
      lines.push("Additional activities");
      for (const a of wkActivities) {
        lines.push(`  [${a.status}] ${a.section}: ${a.text}`);
      }
      lines.push("");
    }
    downloadTextFile(
      `RPA-sectional-update-${shortWeek}.txt`,
      lines.join("\n"),
      "text/plain;charset=utf-8",
    );
    toast.push("Briefing exported.", "success");
  };

  return (
    <div className="space-y-4 staggered">
      <div className="no-print">
        <PageHeader
          eyebrow={`Sectional update — approved ${WORK_PLAN_YEAR} RPA work plan`}
          title={selected.label}
          subtitle={`${selected.start} → ${selected.end}${
            quarter ? ` · reports into Q${quarter} ${WORK_PLAN_YEAR}` : ""
          }`}
          actions={
            <>
              <Link className="btn btn-ghost" href="/daily">
                Daily updates
              </Link>
              <button className="btn btn-ghost" onClick={exportSheet}>
                Export sheet
              </button>
              <button
                className="btn btn-secondary flex-1 sm:flex-none"
                onClick={generateBrief}
              >
                Generate brief
              </button>
              <button
                className="btn btn-primary flex-1 sm:flex-none"
                onClick={printPdf}
              >
                Print / PDF
              </button>
            </>
          }
        />
      </div>

      <Panel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Figure label="Outputs on the plan" value={planRows.length} />
          <Figure label="Moved this week" value={movedThisWeek} />
          <Figure label="Targets achieved" value={achieved} tone="green" />
          <Figure label="Not started" value={notStarted} tone="red" />
        </div>
        <p className="section-note mt-3">
          Figures marked <span className="chip green">auto</span> are counted off
          the registers as work is logged — licences on the licensing register,
          inspections and enforcement actions on the inspection register,
          vehicles screened on the border log. Type a figure only where the row
          offers a box. A reporting week counts toward the quarter it starts in.
        </p>
      </Panel>

      {reports.map((sub) => (
        <SubprogrammeTable
          key={sub.id}
          sub={sub}
          quarter={quarter}
          openId={openId}
          onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
          canEdit={(section) => canEditSection(user, section)}
          onWeekValueChange={onWeekValueChange}
          onNoteSave={onNoteSave}
        />
      ))}

      <ActivitiesPanel
        weekLabel={selected.label}
        activities={wkActivities}
        onReload={reload}
        uid={user?.uid || ""}
      />

      {/* Printable cover with the Zambian flag rule */}
      <div className="print-only p-8">
        <div className="text-center mt-12">
          <div className="text-3xl font-black">RPA Sectional Update</div>
          <div className="text-xl mt-2">{selected.label}</div>
          <div className="text-sm mt-1">
            Against the approved {WORK_PLAN_YEAR} RPA work plan
          </div>
          <div className="caps text-sm mt-1">
            Radiation Protection Authority of Zambia
          </div>
        </div>
        <div className="fixed bottom-0 inset-x-0 flex">
          <div style={{ flex: 1, height: 8, background: "#00A050" }} />
          <div style={{ flex: 1, height: 8, background: "#A8362B" }} />
          <div style={{ flex: 1, height: 8, background: "#1A1B1D" }} />
          <div style={{ flex: 1, height: 8, background: "#E08000" }} />
        </div>
      </div>
    </div>
  );
}

function printPdf() {
  window.print();
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green"
      ? "var(--rpa-green-dark)"
      : tone === "red"
        ? "var(--status-stalled)"
        : undefined;
  return (
    <div>
      <div className="caps text-[10px] text-gunmetal/55">{label}</div>
      <div className="text-2xl font-black tabular mt-0.5" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One subprogramme — the workbook's sheet
// ---------------------------------------------------------------------------

function SubprogrammeTable({
  sub,
  quarter,
  openId,
  onToggle,
  canEdit,
  onWeekValueChange,
  onNoteSave,
}: {
  sub: SubprogrammeReport;
  /** The quarter the selected week reports into — its column is highlighted. */
  quarter: Quarter | null;
  openId: string | null;
  onToggle: (id: string) => void;
  canEdit: (section: WorkPlanRow["output"]["section"]) => boolean;
  onWeekValueChange: (key: string, value: number) => void;
  onNoteSave: (
    id: string,
    patch: Pick<WorkPlanNote, "status" | "comments" | "actionPoints">,
  ) => Promise<void>;
}) {
  const columns = 14;
  return (
    <Panel
      title={sub.heading}
      note="Scroll the table sideways for Total Actual, Status, Comments and Action Points. Open a row (▸) for the detail behind its figure."
      flush
    >
      <div className="table-wrap">
        <table className="data wp-table" style={{ minWidth: 1180 }}>
          <thead>
            <tr>
              <th>Output ID</th>
              <th>Output Description</th>
              <th>Key Indicator</th>
              <th className="num">{WORK_PLAN_YEAR} Target</th>
              <th className="num">This week</th>
              {[1, 2, 3, 4].map((q) => (
                <th
                  key={q}
                  className="num"
                  style={
                    quarter === q ? { background: "var(--sunken)" } : undefined
                  }
                >
                  Q{q}
                </th>
              ))}
              <th className="num">Total Actual</th>
              <th className="num">% Achieved</th>
              <th>Status</th>
              <th>Comments</th>
              <th>Action Points</th>
            </tr>
          </thead>
          <tbody>
            {sub.rows.map((row) => (
              <PlanRow
                key={row.output.id}
                row={row}
                quarter={quarter}
                columns={columns}
                open={openId === row.output.id}
                onToggle={() => onToggle(row.output.id)}
                canEdit={canEdit(row.output.section)}
                onWeekValueChange={onWeekValueChange}
                onNoteSave={onNoteSave}
              />
            ))}
            {sub.supporting.length ? (
              <tr>
                <td colSpan={columns} className="bg-[var(--sunken)]">
                  <span
                    className="caps text-[10px] text-gunmetal/55"
                    style={{ position: "sticky", left: 0 }}
                  >
                    Supporting figures — tracked by the section, not work plan
                    outputs
                  </span>
                </td>
              </tr>
            ) : null}
            {sub.supporting.map((row) => (
              <PlanRow
                key={row.output.id}
                row={row}
                quarter={quarter}
                columns={columns}
                open={openId === row.output.id}
                onToggle={() => onToggle(row.output.id)}
                canEdit={canEdit(row.output.section)}
                onWeekValueChange={onWeekValueChange}
                onNoteSave={onNoteSave}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function PlanRow({
  row,
  quarter,
  columns,
  open,
  onToggle,
  canEdit,
  onWeekValueChange,
  onNoteSave,
}: {
  row: WorkPlanRow;
  quarter: Quarter | null;
  columns: number;
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onWeekValueChange: (key: string, value: number) => void;
  onNoteSave: (
    id: string,
    patch: Pick<WorkPlanNote, "status" | "comments" | "actionPoints">,
  ) => Promise<void>;
}) {
  const { output } = row;
  const supporting = !!output.supporting;
  const expandable = !supporting || row.breakdown.length > 0;

  return (
    <>
      <tr className="row-hover">
        <td className="whitespace-nowrap">
          <span className="font-bold tabular">{output.id}</span>
          {expandable ? (
            <button
              className="link-action no-print ml-1.5"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} detail for output ${output.id}`}
              onClick={onToggle}
            >
              {open ? "▾" : "▸"}
            </button>
          ) : null}
        </td>
        <td className="min-w-[15rem]">
          <div className="font-bold">{output.description}</div>
          {output.note ? (
            <div className="text-xs text-gunmetal/55 mt-0.5">{output.note}</div>
          ) : null}
        </td>
        <td className="text-gunmetal/70 min-w-[10rem]">{output.indicator}</td>
        <td className="num font-bold">
          {output.target === null ? "—" : output.target.toLocaleString()}
        </td>
        <td className="num">
          {row.auto || row.fromDaily || !canEdit || !row.metricKey ? (
            <div className="flex flex-col items-end gap-1">
              <span className="font-black">{row.week.toLocaleString()}</span>
              <SourceChip row={row} canEdit={canEdit} />
            </div>
          ) : (
            <MetricInput
              label={`${output.id} ${output.description} — this week`}
              value={row.week}
              onCommit={(v) => onWeekValueChange(row.metricKey as string, v)}
            />
          )}
        </td>
        {row.quarters.map((v, i) => (
          <td
            key={i}
            className="num"
            style={
              quarter === i + 1 ? { background: "var(--sunken)" } : undefined
            }
          >
            {v ? v.toLocaleString() : "—"}
          </td>
        ))}
        <td className="num font-black">{row.total.toLocaleString()}</td>
        <td className="num">{supporting ? "—" : formatPercent(row.percent)}</td>
        <td>
          {supporting ? (
            <span className="text-gunmetal/40">—</span>
          ) : (
            <span className={`chip ${STATUS_TONE[row.status]}`}>
              {row.status}
            </span>
          )}
        </td>
        <td className="min-w-[12rem] text-gunmetal/70">
          {row.comments || <span className="text-gunmetal/40">—</span>}
        </td>
        <td className="min-w-[12rem] text-gunmetal/70">
          {row.actionPoints || <span className="text-gunmetal/40">—</span>}
        </td>
      </tr>

      {open ? (
        <tr>
          <td colSpan={columns} className="bg-[var(--sunken)]">
            {/* The row spans a table far wider than the screen; pinning the
                detail to the left edge keeps it readable wherever the table
                happens to be scrolled to. */}
            <div style={{ position: "sticky", left: 0, width: "min(56rem, 84vw)" }}>
              <RowDetail
                row={row}
                canEdit={canEdit}
                onSave={(patch) => onNoteSave(output.id, patch)}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SourceChip({ row, canEdit }: { row: WorkPlanRow; canEdit: boolean }) {
  if (row.auto) return <span className="chip green">auto</span>;
  if (row.fromDaily) {
    return (
      <Link href="/daily" title="Summed from Daily Updates">
        <span className="chip green">daily</span>
      </Link>
    );
  }
  if (!canEdit) {
    return (
      <span className="chip" title={`Reported by ${row.output.section}`}>
        {row.output.section === "Nuclear Safety, Security & Safeguards"
          ? "NSSS"
          : row.output.section === "Authorisation & Standards"
            ? "A&S"
            : row.output.section === "National Source Inventory"
              ? "NSI"
              : "Inspectorate"}
      </span>
    );
  }
  return <span className="chip">manual</span>;
}

// ---------------------------------------------------------------------------
// The expanded row: the detail behind the figure + the narrative columns
// ---------------------------------------------------------------------------

function RowDetail({
  row,
  canEdit,
  onSave,
}: {
  row: WorkPlanRow;
  canEdit: boolean;
  onSave: (
    patch: Pick<WorkPlanNote, "status" | "comments" | "actionPoints">,
  ) => Promise<void>;
}) {
  const [status, setStatus] = useState<WorkPlanStatus | "">(
    row.statusOverridden ? row.status : "",
  );
  const [comments, setComments] = useState(row.comments);
  const [actionPoints, setActionPoints] = useState(row.actionPoints);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(row.statusOverridden ? row.status : "");
    setComments(row.comments);
    setActionPoints(row.actionPoints);
  }, [row.statusOverridden, row.status, row.comments, row.actionPoints]);

  const dirty =
    (row.statusOverridden ? row.status : "") !== status ||
    comments !== row.comments ||
    actionPoints !== row.actionPoints;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave({
        // "" clears the override and hands the column back to the figures.
        status: status || undefined,
        comments: comments.trim(),
        actionPoints: actionPoints.trim(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 py-1">
      {row.breakdown.length ? (
        <div>
          <div className="caps text-[10px] text-gunmetal/55 mb-1">
            Breakdown
          </div>
          <table className="w-full text-sm" style={{ maxWidth: 460 }}>
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gunmetal/55">
                <th className="text-left font-bold py-1">Type</th>
                <th className="text-right font-bold py-1">This week</th>
                <th className="text-right font-bold py-1">
                  {WORK_PLAN_YEAR} total
                </th>
              </tr>
            </thead>
            <tbody>
              {row.breakdown.map((b) => (
                <tr key={b.label} className="border-t border-gunmetal/8">
                  <td className="py-1">{b.label}</td>
                  <td className="py-1 text-right tabular">
                    {b.week.toLocaleString()}
                  </td>
                  <td className="py-1 text-right tabular font-bold">
                    {b.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {row.output.supporting ? null : canEdit ? (
        <div className="no-print space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <label
                className="field-label"
                htmlFor={`status-${row.output.id}`}
              >
                Status
              </label>
              <select
                id={`status-${row.output.id}`}
                className="input"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as WorkPlanStatus | "")
                }
              >
                <option value="">
                  From the figures — {row.derivedStatus}
                </option>
                {WORK_PLAN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="field-label"
                htmlFor={`comments-${row.output.id}`}
              >
                Comments
              </label>
              <textarea
                id={`comments-${row.output.id}`}
                className="input"
                rows={2}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Where the output stands."
              />
            </div>
            <div>
              <label
                className="field-label"
                htmlFor={`actions-${row.output.id}`}
              >
                Action Points
              </label>
              <textarea
                id={`actions-${row.output.id}`}
                className="input"
                rows={2}
                value={actionPoints}
                onChange={(e) => setActionPoints(e.target.value)}
                placeholder="What happens next, and who does it."
              />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={busy || !dirty}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gunmetal/55 no-print">
          Status, comments and action points on this output are kept by{" "}
          {row.output.section}.
        </p>
      )}
    </div>
  );
}

/**
 * Manual figure cell with local draft state, persisted on blur / Enter.
 * Binding the input straight to the store value made multi-digit numbers
 * untypable: every keystroke triggered an async write + full reload and the
 * controlled input reverted to the stale value before the next keypress.
 */
function MetricInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const n = Number(draft);
    const v = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    setDraft(String(v));
    if (v !== value) onCommit(v);
  };

  return (
    <input
      type="number"
      min={0}
      className="input text-right"
      style={{ maxWidth: 96, marginLeft: "auto" }}
      aria-label={label}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function ActivitiesPanel({
  weekLabel,
  activities,
  onReload,
  uid,
}: {
  weekLabel: string;
  activities: Activity[];
  onReload: () => void;
  uid: string;
}) {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>(SECTIONS[0]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Activity["status"]>("In Progress");
  const toast = useToast();

  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.addActivity({
        week: weekLabel,
        section,
        text: text.trim(),
        status,
        updatedBy: uid,
      });
      setText("");
      toast.push("Activity added.", "success");
      onReload();
    } catch (err) {
      toast.push(
        `Adding the activity failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const s = await store();
      await s.deleteActivity(id);
      onReload();
    } catch (err) {
      toast.push(
        `Removing failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  };

  return (
    <Panel
      title={`Additional activities — ${weekLabel}`}
      note="Work that carries no work plan output — meetings attended, ad-hoc requests, anything the plan has no row for."
      flush
    >
      <div className="px-4 sm:px-5 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="field-label" htmlFor="act-text">
              Activity
            </label>
            <input
              id="act-text"
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What is being done?"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="act-section">
              Section
            </label>
            <select
              id="act-section"
              className="input"
              value={section}
              onChange={(e) =>
                setSection(e.target.value as (typeof SECTIONS)[number])
              }
            >
              {SECTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="act-status">
              Status
            </label>
            <select
              id="act-status"
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as Activity["status"])}
            >
              {ACTIVITY_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          className="btn btn-primary mt-3 w-full sm:w-auto"
          onClick={add}
          disabled={busy}
        >
          {busy ? "Adding…" : "Add activity"}
        </button>
      </div>

      {activities.length === 0 ? (
        <p className="px-4 sm:px-5 py-6 text-sm text-gunmetal/55">
          No additional activities logged for this week.
        </p>
      ) : (
        <ul className="divide-y divide-gunmetal/8 mt-4">
          {activities.map((a) => (
            <li
              key={a.id}
              className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm break-words">{a.text}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="chip">{a.section}</span>
                  <span
                    className={`chip ${
                      a.status === "Done"
                        ? "green"
                        : a.status === "On Hold"
                          ? "red"
                          : a.status === "In Progress"
                            ? "amber"
                            : ""
                    }`}
                  >
                    {a.status}
                  </span>
                </div>
              </div>
              <button
                className="link-action no-print shrink-0"
                style={{ color: "var(--status-stalled)" }}
                onClick={() => remove(a.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
