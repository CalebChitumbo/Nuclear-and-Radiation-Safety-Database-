"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { canEditSection, useAuth } from "@/lib/auth";
import { dailyEntryScope, seesRegister } from "@/lib/rules/access";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { downloadTextFile } from "@/components/downloadFile";
import { LoadErrorBanner } from "@/components/LoadError";
import { PageHeader, Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
import { useToast } from "@/components/Toast";
import { OpeningBalancePanel } from "@/components/weekly/OpeningBalancePanel";
import {
  InspectionSummaryFooter,
  InspectionSummaryTable,
} from "@/components/inspectorate/InspectionSummaryTable";
import { useWeek } from "@/lib/weekContext";
import {
  buildInspectionDatabase,
  summariseInspectionDatabase,
  summaryCsvRows,
} from "@/lib/rules/inspectionDatabase";
import { todayISO } from "@/lib/rules/week";
import {
  effectiveValuesByWeek,
  entriesForWeek,
  manualWeekFigures,
  mergeWeekManualValues,
} from "@/lib/rules/daily";
import { toCsv } from "@/lib/rules/exportCsv";
import {
  applyWorkPlanConfig,
  buildQuarterIndex,
  deriveWorkPlan,
  describeBinding,
  formatPercent,
  metricKeysForOutput,
  nextOutputId,
  planForSections,
  retiredOutputs,
  subprogrammeHeading,
  workPlanBrief,
  workPlanRows,
  WORK_PLAN_CSV_HEADER,
  WORK_PLAN_STATUSES,
  WORK_PLAN_YEAR,
  type Quarter,
  type Subprogramme,
  type SubprogrammeReport,
  type WorkPlanRow,
} from "@/lib/rules/workPlan";
import {
  draftFromOutput,
  emptyDraft,
  OutputForm,
  type OutputDraft,
} from "@/components/weekly/OutputEditor";
import {
  SECTIONS,
  type Activity,
  type DailyEntry,
  type Inspection,
  type Section,
  type WorkPlanBaseline,
  type WorkPlanConfig,
  type WeekDef,
  type WeekMetrics,
  type WorkPlanNote,
  type WorkPlanOutputConfig,
  type WorkPlanStatus,
} from "@/lib/rules/types";

const VIEW_STORAGE_KEY = "rpa-workplan-view";
/**
 * Which subprogrammes are reading without their supporting figures. Supporting
 * figures are the detail a section keeps for itself — no target, no percentage,
 * nothing the work plan is scored on — so an officer reading the plan proper
 * wants them out of the way, and the same officer chasing a figure wants them
 * back. Kept per browser: it is a way of reading the report, not a change to it.
 */
const SUPPORTING_STORAGE_KEY = "rpa-workplan-supporting-hidden";

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
 *
 * An officer is shown their own section's rows of it. The department (an
 * administrator, or the cross-section posting) sees every section's.
 */
export default function WeeklyPage() {
  const { user, sections } = useAuth();
  const { selected, weeks } = useWeek();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  // The plan is cumulative for the year, so that is what the report opens on.
  const [view, setView] = useState<WorkPlanView>("year");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "year" || stored === "week" || stored === "both") {
        setView(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const chooseView = (v: WorkPlanView) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  };

  // Subprogrammes whose supporting figures are collapsed, by id.
  const [hiddenSupporting, setHiddenSupporting] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SUPPORTING_STORAGE_KEY);
      const ids = stored ? JSON.parse(stored) : null;
      if (Array.isArray(ids)) {
        setHiddenSupporting(ids.filter((x) => typeof x === "string"));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const rememberHidden = (ids: string[]) => {
    setHiddenSupporting(ids);
    try {
      window.localStorage.setItem(SUPPORTING_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  };

  const toggleSupporting = (id: string) =>
    rememberHidden(
      hiddenSupporting.includes(id)
        ? hiddenSupporting.filter((x) => x !== id)
        : [...hiddenSupporting, id],
    );

  // Licences and inspections are counted off the facilities register, which
  // only Licensing and the Inspectorate read; the other sections' rows never
  // need it. The daily log is read as narrowly as the account is entitled to.
  const register = seesRegister(user);
  const entryScope = dailyEntryScope(user);

  const { data, error, reload } = useStoreData(
    async (s) => {
    const [
      events,
      inspections,
      activities,
      weekMetricsAll,
      dailyEntries,
      workPlanNotes,
      baseline,
      config,
    ] = await Promise.all([
      register ? s.listLicenceEvents() : Promise.resolve([]),
      register ? s.listInspections() : Promise.resolve([]),
      s.listActivities(),
      s.listWeekMetricsAll().catch(() => []),
      // Daily Updates roll up into this report; degrade to empty until the
      // dailyEntries rules are deployed.
      s.listDailyEntries(entryScope).catch(() => []),
      s.listWorkPlanNotes().catch(() => []),
      // No saved baseline (or no rules yet) means the approved workbook's
      // figures at handover apply — see effectiveOpeningBalance.
      s.getWorkPlanBaseline(WORK_PLAN_YEAR).catch(
        () => null as WorkPlanBaseline | null,
      ),
      // The sections' own changes to the plan. None (or no rules yet) means
      // the approved plan applies in full — see applyWorkPlanConfig.
      s.getWorkPlanConfig(WORK_PLAN_YEAR).catch(
        () => null as WorkPlanConfig | null,
      ),
    ]);
    return {
      events,
      inspections,
      activities,
      weekMetricsAll,
      dailyEntries,
      workPlanNotes,
      baseline,
      config,
    };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [register, entryScope?.section, entryScope?.border],
  );

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

    // The plan the report is read through: the approved workbook with the
    // sections' own changes laid over it. The WHOLE plan is kept for numbering
    // and validating new rows, so an id can never collide with a row another
    // section holds in the same subprogramme; the report itself is derived
    // from the account's own part of it.
    const plan = applyWorkPlanConfig(data.config);
    const ownPlan = planForSections(plan, sections);
    const reports = deriveWorkPlan({
      plan: ownPlan,
      weeks,
      week: selected.label,
      events: data.events,
      inspections: data.inspections,
      valuesByWeek,
      dailyEntries: data.dailyEntries,
      fromDaily,
      notes,
      baseline: data.baseline?.values ?? null,
    });
    const quarter = buildQuarterIndex(weeks).get(selected.label) ?? null;
    const retired = retiredOutputs(data.config).filter((o) =>
      sections.includes(o.section),
    );
    return { plan, ownPlan, reports, quarter, retired };
  }, [data, weeks, selected.label, sections]);

  if (!data || !derived) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  const { plan, ownPlan, reports, quarter, retired } = derived;
  const wkActivities = data.activities.filter(
    (a) =>
      a.week === selected.label &&
      (sections as readonly string[]).includes(a.section),
  );
  const planRows = reports.flatMap((r) => r.rows);
  const achieved = planRows.filter((r) => r.status === "Achieved").length;
  const notStarted = planRows.filter((r) => r.status === "Not Started").length;
  // Outputs moved this week, not a sum of the figures — adding vehicles
  // screened to safety guides written would be a number about nothing.
  const movedThisWeek = planRows.filter((r) => r.week > 0).length;
  // The supporting figures on show, and whether every subprogramme that has
  // any has them collapsed — what the one switch above the tables acts on.
  const supportingCount = reports.reduce((n, r) => n + r.supporting.length, 0);
  const allSupportingHidden = reports
    .filter((r) => r.supporting.length)
    .every((r) => hiddenSupporting.includes(r.id));

  const onWeekValueChange = async (key: string, value: number) => {
    await onWeekMetricSave(selected.label, key, value);
  };

  // The same write, for a week other than the one being reported on — how a
  // figure typed into the wrong week is taken back out. The row's breakdown
  // names the week, so nobody has to go hunting for it a week at a time.
  const onWeekMetricSave = async (week: string, key: string, value: number) => {
    try {
      const s = await store();
      await s.setWeekMetricValue(week, key, value);
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

  /**
   * Save (or clear, with `null`) one row's changes to the plan itself — its
   * wording, target, section and the register it counts itself off. Clearing
   * is the undo: the row goes straight back to the approved workbook.
   */
  const onOutputSave = async (
    id: string,
    entry: WorkPlanOutputConfig | null,
    message = "Output saved.",
  ) => {
    try {
      const s = await store();
      await s.setWorkPlanOutputConfig(
        WORK_PLAN_YEAR,
        id,
        entry,
        user?.uid || "",
      );
      toast.push(message, "success");
      reload();
    } catch (err) {
      toast.push(
        `Saving the output failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  };

  /**
   * Take a row off the report, keeping everything else about it — a row that
   * was reworded stays reworded, and a row a section ADDED keeps its own
   * definition, without which there would be nothing left to put back.
   */
  const onOutputRetire = async (id: string) => {
    const entry = data.config?.outputs?.[id];
    await onOutputSave(
      id,
      { ...(entry || {}), hidden: true },
      `Output ${id} retired.`,
    );
  };

  /** The way back: the same entry, no longer hidden. */
  const onOutputRestore = async (id: string) => {
    const entry = data.config?.outputs?.[id];
    const rest: WorkPlanOutputConfig = { ...(entry || {}) };
    delete rest.hidden;
    delete rest.updatedAt;
    delete rest.updatedBy;
    const keep = rest.added || Object.keys(rest).length > 0;
    await onOutputSave(id, keep ? rest : null, "Output restored to the plan.");
  };

  const onSubprogrammeSave = async (id: string, title: string) => {
    try {
      const s = await store();
      await s.setWorkPlanSubprogrammeConfig(
        WORK_PLAN_YEAR,
        id,
        title.trim()
          ? { title: title.trim(), heading: subprogrammeHeading(id, title.trim()) }
          : null,
        user?.uid || "",
      );
      toast.push("Subprogramme saved.", "success");
      reload();
    } catch (err) {
      toast.push(
        `Saving failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  };

  const onResetPlan = async () => {
    if (
      !window.confirm(
        `Drop every change to the ${WORK_PLAN_YEAR} plan and report against the approved workbook? Figures, comments and the opening balance are not touched.`,
      )
    ) {
      return;
    }
    try {
      const s = await store();
      await s.resetWorkPlanConfig(WORK_PLAN_YEAR, user?.uid || "");
      toast.push("The plan is back to the approved workbook.", "success");
      reload();
    } catch (err) {
      toast.push(
        `Resetting failed: ${err instanceof Error ? err.message : err}`,
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
        <div className="mt-4 flex flex-wrap items-center gap-3 no-print">
          <span className="caps text-[10px] text-gunmetal/55">Showing</span>
          <Segmented
            ariaLabel="What the report shows"
            value={view}
            onChange={chooseView}
            options={[
              { value: "year", label: `Year to date ${WORK_PLAN_YEAR}` },
              { value: "week", label: "This week only" },
              { value: "both", label: "Week + year" },
            ]}
          />
          {supportingCount ? (
            <button
              className="btn btn-ghost"
              aria-pressed={!allSupportingHidden}
              onClick={() =>
                rememberHidden(
                  allSupportingHidden
                    ? []
                    : reports.filter((r) => r.supporting.length).map((r) => r.id),
                )
              }
            >
              {allSupportingHidden
                ? `Show the ${supportingCount} supporting figures`
                : `Hide the ${supportingCount} supporting figures`}
            </button>
          ) : null}
        </div>
        <p className="section-note mt-3">
          The plan is <strong>cumulative for {WORK_PLAN_YEAR}</strong>: every
          output starts from its opening balance and adds what has been recorded
          since, so the quarter columns and Total Actual are the year&apos;s
          position, not the week&apos;s. Figures marked{" "}
          <span className="chip green">auto</span> are counted off the registers
          as work is logged — licences on the licensing register, inspections
          and enforcement actions on the inspection register, vehicles screened
          on the border log. Type a figure only where the row offers a box; a
          reporting week counts toward the quarter it starts in.
        </p>
      </Panel>

      <OpeningBalancePanel
        year={WORK_PLAN_YEAR}
        plan={ownPlan}
        baseline={data.baseline}
        canEdit={user?.role === "admin"}
        uid={user?.uid || ""}
        onSaved={reload}
      />

      {reports.map((sub) => (
        <SubprogrammeTable
          key={sub.id}
          sub={sub}
          plan={plan}
          view={view}
          quarter={quarter}
          supportingOpen={!hiddenSupporting.includes(sub.id)}
          onToggleSupporting={() => toggleSupporting(sub.id)}
          weeks={weeks}
          weekMetricsAll={data.weekMetricsAll}
          dailyEntries={data.dailyEntries}
          onWeekMetricSave={onWeekMetricSave}
          openId={openId}
          onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
          canEdit={(section) => canEditSection(user, section)}
          isAdmin={user?.role === "admin"}
          onWeekValueChange={onWeekValueChange}
          onNoteSave={onNoteSave}
          onOutputSave={onOutputSave}
          onOutputRetire={onOutputRetire}
          onSubprogrammeSave={onSubprogrammeSave}
        />
      ))}

      <RetiredOutputsPanel
        retired={retired}
        customised={countCustomised(data.config)}
        canEdit={(section) => canEditSection(user, section)}
        isAdmin={user?.role === "admin"}
        onRestore={onOutputRestore}
        onReset={onResetPlan}
      />

      {sections.includes("Inspectorate") ? (
        <InspectionSummaryPanel
          inspections={data.inspections}
          weekLabel={selected.label}
          view={view}
          onExport={(csv, name) => {
            downloadTextFile(name, csv);
            toast.push("Inspection summary exported.", "success");
          }}
        />
      ) : null}

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

/**
 * The Inspectorate's own summary, in the format of its inspection database —
 * province rounds down the side, INSPECTIONS / ENFORCEMENT ACTIONS across the
 * top. Behind output 1.2.4 the report gives one national figure; the
 * section's Monday update has always carried this table underneath it, so it is
 * reproduced here from the same register rather than kept in a workbook.
 *
 * It follows the report's own view switch: **This week only** narrows it to the
 * reporting week, anything else shows the year to date, the way the plan does.
 */
function InspectionSummaryPanel({
  inspections,
  weekLabel,
  view,
  onExport,
}: {
  inspections: Inspection[];
  weekLabel: string;
  view: WorkPlanView;
  onExport: (csv: string, filename: string) => void;
}) {
  const weekOnly = view === "week";
  const summary = useMemo(() => {
    const slice = weekOnly
      ? inspections.filter((i) => i.week === weekLabel)
      : inspections.filter(
          (i) => (i.date || "").slice(0, 4) === String(WORK_PLAN_YEAR),
        );
    // District and practice come off the inspection itself here — the summary
    // needs only province and phase, so the register is not re-read.
    return summariseInspectionDatabase(
      buildInspectionDatabase(slice, [], { today: todayISO() }),
    );
  }, [inspections, weekLabel, weekOnly]);

  const span = weekOnly ? weekLabel : `Year to date ${WORK_PLAN_YEAR}`;

  return (
    <Panel
      title={`Inspection database summary — ${span}`}
      flush
      note="Derived from the inspection register: pre-auth, planned, follow-up and investigative inspections by province, with the enforcement actions taken."
      action={
        <button
          className="link-action no-print"
          onClick={() => {
            const lines = summaryCsvRows(summary);
            onExport(
              toCsv(lines[0], lines.slice(1)),
              `RPA-inspection-summary-${weekOnly ? weekLabel.split(" ")[0] : WORK_PLAN_YEAR}.csv`,
            );
          }}
        >
          Export ↓
        </button>
      }
    >
      <InspectionSummaryTable summary={summary} />
      <InspectionSummaryFooter summary={summary} />
    </Panel>
  );
}

/** How many rows a saved config has changed — what "edited" adds up to. */
function countCustomised(config: WorkPlanConfig | null | undefined): number {
  return Object.values(config?.outputs || {}).length;
}

/**
 * Rows that have been taken off the report, and the way back.
 *
 * Retiring a row never deletes anything: its figures, comments and opening
 * balance stay exactly where they are, so putting it back restores the row
 * whole. The panel only appears once there is something to say — an untouched
 * plan shows nothing.
 */
function RetiredOutputsPanel({
  retired,
  customised,
  canEdit,
  isAdmin,
  onRestore,
  onReset,
}: {
  retired: WorkPlanRow["output"][];
  customised: number;
  canEdit: (section: Section) => boolean;
  isAdmin: boolean;
  onRestore: (id: string) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!retired.length && !customised) return null;

  return (
    <Panel
      title={`Changes to the ${WORK_PLAN_YEAR} plan`}
      note={`${customised} row${customised === 1 ? "" : "s"} changed from the approved workbook${
        retired.length
          ? `, ${retired.length} of them retired from the report`
          : ""
      }. Nothing is deleted — a retired row keeps its figures and comments.`}
      flush
      action={
        isAdmin ? (
          <button className="link-action no-print" onClick={onReset}>
            Reset the plan
          </button>
        ) : undefined
      }
    >
      {retired.length ? (
        <ul className="divide-y divide-gunmetal/8">
          {retired.map((o) => (
            <li
              key={o.id}
              className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm">
                  <span className="tabular font-bold mr-2">{o.id}</span>
                  {o.description}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="chip">{o.section}</span>
                  {o.added ? <span className="chip amber">added</span> : null}
                </div>
              </div>
              {canEdit(o.section) ? (
                <button
                  className="link-action no-print shrink-0"
                  disabled={busy === o.id}
                  onClick={async () => {
                    setBusy(o.id);
                    try {
                      await onRestore(o.id);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === o.id ? "Restoring…" : "Put back"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 sm:px-5 py-4 text-sm text-gunmetal/55">
          Every row of the plan is on the report. Rows marked{" "}
          <span className="chip amber">edited</span> differ from the approved
          workbook; open one to see what it now says, or to reset it.
        </p>
      )}
    </Panel>
  );
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

/**
 * Which columns the report shows. The plan is cumulative for the year, so
 * **Year to date** is the default and the report Management reads; **This week**
 * narrows to what the section did in the selected week (still beside the annual
 * target, so a figure is never read out of context); **Week + year** is the
 * whole sheet.
 */
type WorkPlanView = "year" | "week" | "both";

type ColKey =
  | "id"
  | "desc"
  | "indicator"
  | "target"
  | "week"
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "total"
  | "percent"
  | "status"
  | "comments"
  | "actions";

const VIEW_COLUMNS: Record<WorkPlanView, ColKey[]> = {
  year: [
    "id",
    "desc",
    "indicator",
    "target",
    "q1",
    "q2",
    "q3",
    "q4",
    "total",
    "percent",
    "status",
    "comments",
    "actions",
  ],
  week: [
    "id",
    "desc",
    "indicator",
    "target",
    "week",
    "total",
    "percent",
    "status",
    "comments",
    "actions",
  ],
  both: [
    "id",
    "desc",
    "indicator",
    "target",
    "week",
    "q1",
    "q2",
    "q3",
    "q4",
    "total",
    "percent",
    "status",
    "comments",
    "actions",
  ],
};

const COLUMN_LABELS: Record<ColKey, string> = {
  id: "Output ID",
  desc: "Output Description",
  indicator: "Key Indicator",
  target: `${WORK_PLAN_YEAR} Target`,
  week: "This week",
  q1: "Q1",
  q2: "Q2",
  q3: "Q3",
  q4: "Q4",
  total: "Total Actual",
  percent: "% Achieved",
  status: "Status",
  comments: "Comments",
  actions: "Action Points",
};

const NUMERIC_COLUMNS = new Set<ColKey>([
  "target",
  "week",
  "q1",
  "q2",
  "q3",
  "q4",
  "total",
  "percent",
]);

const QUARTER_COLUMN: Partial<Record<ColKey, Quarter>> = {
  q1: 1,
  q2: 2,
  q3: 3,
  q4: 4,
};

/** Roughly what the column set needs before it starts scrolling. */
const VIEW_MIN_WIDTH: Record<WorkPlanView, number> = {
  year: 1080,
  week: 940,
  both: 1180,
};

function SubprogrammeTable({
  sub,
  plan,
  view,
  quarter,
  supportingOpen,
  onToggleSupporting,
  weeks,
  weekMetricsAll,
  dailyEntries,
  onWeekMetricSave,
  openId,
  onToggle,
  canEdit,
  isAdmin,
  onWeekValueChange,
  onNoteSave,
  onOutputSave,
  onOutputRetire,
  onSubprogrammeSave,
}: {
  sub: SubprogrammeReport;
  /** The whole plan — the editor needs it to number and link a new row. */
  plan: Subprogramme[];
  view: WorkPlanView;
  /** The quarter the selected week reports into — its column is highlighted. */
  quarter: Quarter | null;
  /** Whether this subprogramme's supporting figures are expanded. */
  supportingOpen: boolean;
  onToggleSupporting: () => void;
  /** The reporting calendar, and every stored figure — a row's detail panel
      shows which weeks its cumulative total is made of, and corrects them. */
  weeks: WeekDef[];
  weekMetricsAll: WeekMetrics[];
  dailyEntries: DailyEntry[];
  onWeekMetricSave: (week: string, key: string, value: number) => Promise<void>;
  openId: string | null;
  onToggle: (id: string) => void;
  canEdit: (section: WorkPlanRow["output"]["section"]) => boolean;
  isAdmin: boolean;
  onWeekValueChange: (key: string, value: number) => void;
  onNoteSave: (
    id: string,
    patch: Pick<WorkPlanNote, "status" | "comments" | "actionPoints">,
  ) => Promise<void>;
  onOutputSave: (
    id: string,
    entry: WorkPlanOutputConfig | null,
    message?: string,
  ) => Promise<void>;
  onOutputRetire: (id: string) => Promise<void>;
  onSubprogrammeSave: (id: string, title: string) => Promise<void>;
}) {
  const columns = VIEW_COLUMNS[view];
  const note =
    view === "week"
      ? "This week's figures beside each output's annual target. Open a row (▸) for the detail behind its figure, and to edit it."
      : "Cumulative for the plan year — every output starts from its opening balance and adds what has been recorded since. Scroll sideways for Status, Comments and Action Points.";

  const mayAdd = canEdit(sub.section);
  const [adding, setAdding] = useState<OutputDraft | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startAdd = (supporting: boolean) => {
    // Adding a figure into a band that is collapsed would file it out of
    // sight, so opening the form opens the band.
    if (supporting && !supportingOpen) onToggleSupporting();
    setAdding(
      emptyDraft(
        nextOutputId(plan, { subprogramme: sub.id, supporting }),
        sub.section,
        supporting,
      ),
    );
  };

  return (
    <Panel
      title={sub.heading}
      note={note}
      flush
      action={
        isAdmin ? (
          <button
            className="link-action no-print"
            onClick={() => setRenaming(renaming === null ? sub.title : null)}
          >
            {renaming === null ? "Rename" : "Cancel"}
          </button>
        ) : undefined
      }
    >
      {renaming !== null ? (
        <div className="px-4 sm:px-5 pb-3 no-print flex flex-wrap items-end gap-2">
          <div className="grow" style={{ minWidth: "16rem" }}>
            <label className="field-label" htmlFor={`sub-title-${sub.id}`}>
              Subprogramme {sub.id} — title
            </label>
            <input
              id={`sub-title-${sub.id}`}
              className="input"
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={busy || !renaming.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubprogrammeSave(sub.id, renaming);
                setRenaming(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </button>
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                // An empty title clears the override — back to the workbook.
                await onSubprogrammeSave(sub.id, "");
                setRenaming(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            Use the approved heading
          </button>
        </div>
      ) : null}

      <div className="table-wrap">
        <table
          className="data wp-table"
          style={{ minWidth: VIEW_MIN_WIDTH[view] }}
        >
          <thead>
            <tr>
              {columns.map((key) => {
                const q = QUARTER_COLUMN[key];
                return (
                  <th
                    key={key}
                    className={NUMERIC_COLUMNS.has(key) ? "num" : undefined}
                    style={
                      q && quarter === q
                        ? { background: "var(--sunken)" }
                        : undefined
                    }
                  >
                    {COLUMN_LABELS[key]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sub.rows.map((row) => (
              <PlanRow
                key={row.output.id}
                row={row}
                plan={plan}
                subId={sub.id}
                columns={columns}
                quarter={quarter}
                weeks={weeks}
                weekMetricsAll={weekMetricsAll}
                dailyEntries={dailyEntries}
                onWeekMetricSave={onWeekMetricSave}
                open={openId === row.output.id}
                onToggle={() => onToggle(row.output.id)}
                canEdit={canEdit(row.output.section)}
                onWeekValueChange={onWeekValueChange}
                onNoteSave={onNoteSave}
                onOutputSave={onOutputSave}
                onOutputRetire={onOutputRetire}
              />
            ))}
            {sub.supporting.length ? (
              <tr>
                <td colSpan={columns.length} className="bg-[var(--sunken)] p-0">
                  <button
                    type="button"
                    className="w-full text-left px-4 sm:px-5 py-2"
                    aria-expanded={supportingOpen}
                    onClick={onToggleSupporting}
                  >
                    {/* Sticky on the label, not the button: the table scrolls
                        sideways and the band has to stay readable with it. */}
                    <span
                      className="inline-flex items-center gap-2"
                      style={{ position: "sticky", left: 0 }}
                    >
                      <span
                        className="text-[10px] text-gunmetal/55"
                        aria-hidden="true"
                      >
                        {supportingOpen ? "▾" : "▸"}
                      </span>
                      <span className="caps text-[10px] text-gunmetal/55">
                        {sub.supporting.length} supporting figure
                        {sub.supporting.length === 1 ? "" : "s"} — tracked by the
                        section, not work plan outputs
                      </span>
                      <span className="link-action text-[10px] no-print">
                        {supportingOpen ? "Hide" : "Show"}
                      </span>
                    </span>
                  </button>
                </td>
              </tr>
            ) : null}
            {(supportingOpen ? sub.supporting : []).map((row) => (
              <PlanRow
                key={row.output.id}
                row={row}
                plan={plan}
                subId={sub.id}
                columns={columns}
                quarter={quarter}
                weeks={weeks}
                weekMetricsAll={weekMetricsAll}
                dailyEntries={dailyEntries}
                onWeekMetricSave={onWeekMetricSave}
                open={openId === row.output.id}
                onToggle={() => onToggle(row.output.id)}
                canEdit={canEdit(row.output.section)}
                onWeekValueChange={onWeekValueChange}
                onNoteSave={onNoteSave}
                onOutputSave={onOutputSave}
                onOutputRetire={onOutputRetire}
              />
            ))}
          </tbody>
        </table>
      </div>

      {mayAdd ? (
        <div className="px-4 sm:px-5 py-3 no-print border-t border-gunmetal/8">
          {adding ? (
            <div className="space-y-3">
              <div className="caps text-[10px] text-gunmetal/55">
                New row {adding.id} — subprogramme {sub.id}
              </div>
              <OutputForm
                plan={plan}
                draft={adding}
                base={null}
                adding
                busy={busy}
                onChange={setAdding}
                onCancel={() => setAdding(null)}
                onSave={async (entry) => {
                  if (!entry) return;
                  setBusy(true);
                  try {
                    await onOutputSave(
                      adding.id,
                      { ...entry, subprogramme: sub.id },
                      `Output ${adding.id} added to the plan.`,
                    );
                    setAdding(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost" onClick={() => startAdd(false)}>
                Add an output
              </button>
              <button className="btn btn-ghost" onClick={() => startAdd(true)}>
                Add a supporting figure
              </button>
            </div>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

function PlanRow({
  row,
  plan,
  subId,
  columns,
  quarter,
  weeks,
  weekMetricsAll,
  dailyEntries,
  onWeekMetricSave,
  open,
  onToggle,
  canEdit,
  onWeekValueChange,
  onNoteSave,
  onOutputSave,
  onOutputRetire,
}: {
  row: WorkPlanRow;
  plan: Subprogramme[];
  /** The subprogramme the row is reported under — kept on an added row. */
  subId: string;
  columns: ColKey[];
  quarter: Quarter | null;
  weeks: WeekDef[];
  weekMetricsAll: WeekMetrics[];
  dailyEntries: DailyEntry[];
  onWeekMetricSave: (week: string, key: string, value: number) => Promise<void>;
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onWeekValueChange: (key: string, value: number) => void;
  onNoteSave: (
    id: string,
    patch: Pick<WorkPlanNote, "status" | "comments" | "actionPoints">,
  ) => Promise<void>;
  onOutputSave: (
    id: string,
    entry: WorkPlanOutputConfig | null,
    message?: string,
  ) => Promise<void>;
  onOutputRetire: (id: string) => Promise<void>;
}) {
  const { output } = row;
  const supporting = !!output.supporting;
  // Every row opens now — the detail is also where the row itself is edited.
  const expandable = true;
  const typeable = !row.auto && !row.fromDaily && canEdit && !!row.metricKey;

  const num = (v: number) => (v ? v.toLocaleString() : "—");

  const content = (key: ColKey) => {
    switch (key) {
      case "id":
        return (
          <>
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
          </>
        );
      case "desc":
        return (
          <>
            <div className="font-bold">{output.description}</div>
            {output.parentId ? (
              <div className="text-xs text-gunmetal/55 mt-0.5">
                Detail behind output {output.parentId}
              </div>
            ) : null}
            {output.note ? (
              <div className="text-xs text-gunmetal/55 mt-0.5">
                {output.note}
              </div>
            ) : null}
            {output.added || output.customised ? (
              <div className="mt-1 no-print">
                <span
                  className="chip amber"
                  title={
                    output.added
                      ? "Added by the section — not in the approved workbook."
                      : "Changed from the approved workbook."
                  }
                >
                  {output.added ? "added" : "edited"}
                </span>
              </div>
            ) : null}
          </>
        );
      case "indicator":
        return output.indicator;
      case "target":
        return output.target === null ? "—" : output.target.toLocaleString();
      case "week":
        return typeable ? (
          <MetricInput
            label={`${output.id} ${output.description} — this week`}
            value={row.week}
            onCommit={(v) => onWeekValueChange(row.metricKey as string, v)}
          />
        ) : (
          <div className="flex flex-col items-end gap-1">
            <span className="font-black">{row.week.toLocaleString()}</span>
            <SourceChip row={row} canEdit={canEdit} />
          </div>
        );
      case "q1":
      case "q2":
      case "q3":
      case "q4":
        return num(row.quarters[(QUARTER_COLUMN[key] as Quarter) - 1]);
      case "total":
        return row.total.toLocaleString();
      case "percent":
        return supporting ? "—" : formatPercent(row.percent);
      case "status":
        return supporting ? (
          <span className="text-gunmetal/40">—</span>
        ) : (
          <span className={`chip ${STATUS_TONE[row.status]}`}>{row.status}</span>
        );
      case "comments":
        return row.comments || <span className="text-gunmetal/40">—</span>;
      case "actions":
        return row.actionPoints || <span className="text-gunmetal/40">—</span>;
    }
  };

  const className = (key: ColKey) => {
    if (key === "id") return "whitespace-nowrap";
    if (key === "desc") return "min-w-[15rem]";
    if (key === "indicator") return "text-gunmetal/70 min-w-[10rem]";
    if (key === "target") return "num font-bold";
    if (key === "total") return "num font-black";
    if (key === "comments" || key === "actions")
      return "min-w-[12rem] text-gunmetal/70";
    return NUMERIC_COLUMNS.has(key) ? "num" : undefined;
  };

  return (
    <>
      <tr className="row-hover">
        {columns.map((key) => {
          const q = QUARTER_COLUMN[key];
          return (
            <td
              key={key}
              className={className(key)}
              style={
                q && quarter === q ? { background: "var(--sunken)" } : undefined
              }
            >
              {content(key)}
            </td>
          );
        })}
      </tr>

      {open ? (
        <tr>
          <td colSpan={columns.length} className="bg-[var(--sunken)]">
            {/* The row spans a table far wider than the screen; pinning the
                detail to the left edge keeps it readable wherever the table
                happens to be scrolled to. */}
            <div style={{ position: "sticky", left: 0, width: "min(56rem, 84vw)" }}>
              <RowDetail
                row={row}
                plan={plan}
                subId={subId}
                weeks={weeks}
                weekMetricsAll={weekMetricsAll}
                dailyEntries={dailyEntries}
                onWeekMetricSave={onWeekMetricSave}
                canEdit={canEdit}
                onSave={(patch) => onNoteSave(output.id, patch)}
                onOutputSave={onOutputSave}
                onOutputRetire={onOutputRetire}
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
// The expanded row: where the figure comes from + the narrative columns
// ---------------------------------------------------------------------------

function RowDetail({
  row,
  plan,
  subId,
  weeks,
  weekMetricsAll,
  dailyEntries,
  onWeekMetricSave,
  canEdit,
  onSave,
  onOutputSave,
  onOutputRetire,
}: {
  row: WorkPlanRow;
  plan: Subprogramme[];
  subId: string;
  weeks: WeekDef[];
  weekMetricsAll: WeekMetrics[];
  dailyEntries: DailyEntry[];
  onWeekMetricSave: (week: string, key: string, value: number) => Promise<void>;
  canEdit: boolean;
  onSave: (
    patch: Pick<WorkPlanNote, "status" | "comments" | "actionPoints">,
  ) => Promise<void>;
  onOutputSave: (
    id: string,
    entry: WorkPlanOutputConfig | null,
    message?: string,
  ) => Promise<void>;
  onOutputRetire: (id: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<WorkPlanStatus | "">(
    row.statusOverridden ? row.status : "",
  );
  const [comments, setComments] = useState(row.comments);
  const [actionPoints, setActionPoints] = useState(row.actionPoints);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<OutputDraft | null>(null);
  const [planBusy, setPlanBusy] = useState(false);

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

  const retire = async () => {
    if (
      !window.confirm(
        `Take ${row.output.id} off the report? Its figures and comments are kept — you can put it back from "Retired rows" at the foot of the report.`,
      )
    ) {
      return;
    }
    setPlanBusy(true);
    try {
      await onOutputRetire(row.output.id);
    } finally {
      setPlanBusy(false);
    }
  };

  return (
    <div className="space-y-4 py-1">
      {/* Where the figure comes from — the row's link to the rest of the
          database, said in words so nobody has to guess whether a number is
          counted for them or waiting to be typed. */}
      <div className="text-sm text-gunmetal/70">
        <span className="caps text-[10px] text-gunmetal/55 mr-2">
          Where this figure comes from
        </span>
        {describeBinding(row.output.binding)}{" "}
        {row.fromDaily ? (
          <Link className="link-action" href="/daily">
            Open Daily Updates
          </Link>
        ) : row.output.binding.kind === "licences" ? (
          <Link className="link-action" href="/licences">
            Open the licensing register
          </Link>
        ) : row.output.binding.kind === "inspections" ||
          row.output.binding.kind === "enforcement" ? (
          <Link className="link-action" href="/inspections">
            Open the inspection register
          </Link>
        ) : null}
      </div>

      {/* How the cumulative figure splits — what was carried in against what
          the system has counted since. Only worth saying when both exist. */}
      {row.openingTotal > 0 ? (
        <div className="text-sm">
          <span className="caps text-[10px] text-gunmetal/55 mr-2">
            Total actual
          </span>
          <span className="tabular font-black">
            {row.total.toLocaleString()}
          </span>
          <span className="text-gunmetal/60">
            {" "}
            = opening balance{" "}
            <span className="tabular font-bold">
              {row.openingTotal.toLocaleString()}
            </span>{" "}
            + recorded since{" "}
            <span className="tabular font-bold">
              {row.recordedTotal.toLocaleString()}
            </span>
          </span>
        </div>
      ) : null}

      {/* What the "recorded since" figure is actually made of, week by week —
          and the only place a figure typed into the wrong week can be taken
          back out without knowing which week it was. */}
      {!row.auto ? (
        <RecordedWeeks
          row={row}
          weeks={weeks}
          weekMetricsAll={weekMetricsAll}
          dailyEntries={dailyEntries}
          canEdit={canEdit}
          onSave={onWeekMetricSave}
        />
      ) : null}

      {row.breakdown.length ? (
        <div>
          <div className="caps text-[10px] text-gunmetal/55 mb-1">
            Breakdown — recorded in the system
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

      {/* The row itself — its wording, its target and where its figure comes
          from. Kept behind a click so the report still reads as a report, and
          open to the section that owns the row rather than admins alone. */}
      {canEdit ? (
        <div className="no-print border-t border-gunmetal/8 pt-3">
          {draft ? (
            <div className="space-y-3">
              <div className="caps text-[10px] text-gunmetal/55">
                Editing output {row.output.id}
              </div>
              <OutputForm
                plan={plan}
                draft={draft}
                base={row.output}
                busy={planBusy}
                onChange={setDraft}
                onCancel={() => setDraft(null)}
                onSave={async (entry) => {
                  setPlanBusy(true);
                  try {
                    await onOutputSave(
                      row.output.id,
                      // A row the section added carries its own subprogramme;
                      // a correction to an approved row does not move it.
                      entry?.added ? { ...entry, subprogramme: subId } : entry,
                      entry
                        ? `Output ${row.output.id} saved.`
                        : `Output ${row.output.id} is back to the approved plan.`,
                    );
                    setDraft(null);
                  } finally {
                    setPlanBusy(false);
                  }
                }}
                extraActions={
                  <>
                    {row.output.customised ? (
                      <button
                        className="btn btn-ghost"
                        disabled={planBusy}
                        onClick={async () => {
                          setPlanBusy(true);
                          try {
                            await onOutputSave(
                              row.output.id,
                              null,
                              `Output ${row.output.id} is back to the approved plan.`,
                            );
                            setDraft(null);
                          } finally {
                            setPlanBusy(false);
                          }
                        }}
                      >
                        {row.output.added
                          ? "Remove this row"
                          : "Reset to the approved plan"}
                      </button>
                    ) : null}
                    <button
                      className="btn btn-ghost"
                      style={{ color: "var(--status-stalled)" }}
                      disabled={planBusy}
                      onClick={retire}
                    >
                      Retire this row
                    </button>
                  </>
                }
              />
            </div>
          ) : (
            <button
              className="link-action"
              onClick={() => setDraft(draftFromOutput(row.output))}
            >
              Edit this output — wording, target, and where its figure comes
              from
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}


/**
 * Manual figure cell with local draft state, persisted on blur / Enter.
 * Binding the input straight to the store value made multi-digit numbers
 * untypable: every keystroke triggered an async write + full reload and the
 * controlled input reverted to the stale value before the next keypress.
 */
/**
 * The weeks a typed output's cumulative figure is made of, each correctable in
 * place.
 *
 * Total Actual is opening balance + everything recorded since, and a manual
 * output overshoots its target almost exclusively one way: a figure typed into
 * a week it did not belong to. The report could always say the total was 3; it
 * could not say the 3 was a carried 1 plus two weeks that should have been
 * empty. This says it, and lets whoever may edit the row put each week right —
 * including a week that is not the one being reported on, which is otherwise
 * only reachable by changing the reporting week and hunting.
 *
 * A week Daily Updates supplied is shown but not typed into: its figure is the
 * sum of that week's entries, so the correction belongs on the entry (the
 * report would only overwrite it back on the next read). The link says so.
 */
function RecordedWeeks({
  row,
  weeks,
  weekMetricsAll,
  dailyEntries,
  canEdit,
  onSave,
}: {
  row: WorkPlanRow;
  weeks: WeekDef[];
  weekMetricsAll: WeekMetrics[];
  dailyEntries: DailyEntry[];
  canEdit: boolean;
  onSave: (week: string, key: string, value: number) => Promise<void>;
}) {
  const keys = useMemo(
    () => metricKeysForOutput(row.output),
    [row.output],
  );
  const figures = useMemo(
    () =>
      manualWeekFigures(
        keys,
        weekMetricsAll,
        dailyEntries,
        weeks.map((w) => w.label),
      ),
    [keys, weekMetricsAll, dailyEntries, weeks],
  );

  if (!figures.length) {
    return (
      <div className="text-sm text-gunmetal/55">
        <span className="caps text-[10px] text-gunmetal/55 mr-2">
          Recorded since
        </span>
        Nothing has been recorded for this output yet
        {row.openingTotal > 0
          ? " — its figure is the opening balance alone."
          : "."}
      </div>
    );
  }

  const recorded = figures.reduce((n, f) => n + f.effective, 0);

  return (
    <div>
      <div className="caps text-[10px] text-gunmetal/55 mb-1">
        Weeks this figure is made of — {recorded.toLocaleString()} recorded
        across {figures.length} week{figures.length === 1 ? "" : "s"}
      </div>
      <ul className="divide-y divide-gunmetal/8" style={{ maxWidth: 460 }}>
        {figures.map((f) => (
          <li
            key={f.week}
            className="flex items-center justify-between gap-3 py-1.5"
          >
            <span className="min-w-0 text-sm">
              {f.week}
              {f.fromDaily ? (
                <Link className="link-action ml-2 text-[11px]" href="/daily">
                  from Daily Updates
                </Link>
              ) : null}
            </span>
            {f.fromDaily || !canEdit || !row.metricKey ? (
              <span className="tabular font-black shrink-0">
                {f.effective.toLocaleString()}
              </span>
            ) : (
              <WeekFigureInput
                value={f.typed}
                onSave={(v) => onSave(f.week, row.metricKey as string, v)}
              />
            )}
          </li>
        ))}
      </ul>
      {canEdit && figures.some((f) => !f.fromDaily) ? (
        <p className="mt-2 text-[11px] leading-relaxed text-gunmetal/55 no-print">
          Correct a week here and the cumulative figure, the quarter columns and
          % Achieved move with it. Set it to 0 to take a figure out entirely.
        </p>
      ) : null}
    </div>
  );
}

/** One week's typed figure, saved on blur — the same feel as the week box. */
function WeekFigureInput({
  value,
  onSave,
}: {
  value: number;
  onSave: (value: number) => Promise<void>;
}) {
  const [text, setText] = useState(String(value));
  const [busy, setBusy] = useState(false);

  useEffect(() => setText(String(value)), [value]);

  const commit = async () => {
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) {
      setText(String(value));
      return;
    }
    if (n === value) return;
    setBusy(true);
    try {
      await onSave(n);
    } finally {
      setBusy(false);
    }
  };

  return (
    <input
      className="input tabular text-right shrink-0"
      style={{ maxWidth: 88 }}
      inputMode="numeric"
      disabled={busy}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      aria-label="Figure recorded this week"
    />
  );
}

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
