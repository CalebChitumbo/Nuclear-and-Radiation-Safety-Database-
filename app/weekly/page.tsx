"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { LoadErrorBanner } from "@/components/LoadError";
import { PageHeader, Panel } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { useWeek } from "@/lib/weekContext";
import { entriesForWeek, mergeWeekManualValues } from "@/lib/rules/daily";
import { deriveWeekly } from "@/lib/rules/weeklyDerivation";
import type { Activity } from "@/lib/rules/types";

const ACTIVITY_STATUSES: Activity["status"][] = [
  "Not Started",
  "In Progress",
  "On Hold",
  "Done",
];

const SECTIONS = [
  "Authorisation & Standards",
  "Inspectorate",
  "Nuclear Safety, Security & Safeguards",
  "National Source Inventory",
] as const;

export default function WeeklyPage() {
  const { user } = useAuth();
  const { selected } = useWeek();
  const toast = useToast();

  const { data, error, reload } = useStoreData(
    async (s) => {
      const [events, inspections, activities, metrics, dailyEntries] =
        await Promise.all([
          s.listLicenceEvents(),
          s.listInspections(),
          s.listActivities(),
          s.getWeekMetrics(selected.label),
          // Daily Updates roll up into this report; degrade to empty until the
          // dailyEntries rules are deployed.
          s.listDailyEntries().catch(() => []),
        ]);
      return { events, inspections, activities, metrics, dailyEntries };
    },
    [selected.label],
  );

  // Gate on the metrics payload actually belonging to the selected week —
  // otherwise switching weeks briefly shows the old week's figures under the
  // new week's heading while the refetch is in flight.
  if (!data || (data.metrics.week ?? selected.label) !== selected.label) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  const wkEvents = data.events.filter((e) => e.week === selected.label);
  const wkInspections = data.inspections.filter(
    (i) => i.week === selected.label,
  );
  const wkActivities = data.activities.filter((a) => a.week === selected.label);

  // Manual metrics: the week's Daily Updates counts take precedence over a
  // value typed here, per metric — a section logging daily never gets its
  // numbers overwritten or double counted.
  const wkDaily = entriesForWeek(data.dailyEntries, selected.label);
  const merged = mergeWeekManualValues(data.metrics.values || {}, wkDaily);

  const report = deriveWeekly(wkEvents, wkInspections, merged.values);

  const onManualChange = async (key: string, value: number) => {
    try {
      const s = await store();
      await s.setWeekMetricValue(selected.label, key, value);
      reload();
    } catch (err) {
      toast.push(
        `Saving the metric failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  };

  const generateBrief = () => {
    const lines: string[] = [];
    lines.push(`RPA Weekly Sectional Report — ${selected.label}`);
    lines.push("");
    for (const sec of report) {
      lines.push(sec.section);
      for (const m of sec.metrics) {
        lines.push(`  ${m.label}: ${m.value}${m.auto ? "  (auto)" : ""}`);
      }
      if (sec.total) {
        lines.push(`  ${sec.total.label}: ${sec.total.value}`);
      }
      lines.push("");
    }
    if (wkActivities.length) {
      lines.push("Additional Activities");
      for (const a of wkActivities) {
        lines.push(`  [${a.status}] ${a.section}: ${a.text}`);
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RPA-weekly-${selected.label.split(" ")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.push("Briefing exported.", "success");
  };

  const printPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-4 staggered">
      <div className="no-print">
        <PageHeader
          eyebrow="Reporting week"
          title={selected.label}
          subtitle={`${selected.start} → ${selected.end}`}
          actions={
            <>
              <Link className="btn btn-ghost" href="/daily">
                Daily updates
              </Link>
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

      {report.map((sec) => (
        <SectionTable
          key={sec.section}
          section={sec.section}
          metrics={sec.metrics}
          total={sec.total}
          fromDaily={merged.fromDaily}
          onManualChange={onManualChange}
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
          <div className="text-3xl font-black">RPA Weekly Sectional Report</div>
          <div className="text-xl mt-2">{selected.label}</div>
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

function SectionTable({
  section,
  metrics,
  total,
  fromDaily,
  onManualChange,
}: {
  section: string;
  metrics: Array<{ key: string; label: string; auto: boolean; value: number }>;
  total: { label: string; value: number } | null;
  /** Metric keys whose value is summed from Daily Updates (read-only here). */
  fromDaily: Set<string>;
  onManualChange: (key: string, value: number) => void;
}) {
  return (
    <Panel title={section} flush>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="num">Count</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.key}>
                <td>{m.label}</td>
                <td className="num">
                  {m.auto || fromDaily.has(m.key) ? (
                    <span className="font-black">{m.value}</span>
                  ) : (
                    <MetricInput
                      label={m.label}
                      value={m.value}
                      onCommit={(v) => onManualChange(m.key, v)}
                    />
                  )}
                </td>
                <td>
                  {m.auto ? (
                    <span className="chip green">auto</span>
                  ) : fromDaily.has(m.key) ? (
                    <Link href="/daily" title="Summed from Daily Updates">
                      <span className="chip green">daily</span>
                    </Link>
                  ) : (
                    <span className="chip">manual</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {total ? (
            <tfoot>
              <tr>
                <td>{total.label}</td>
                <td className="num">{total.value}</td>
                <td></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </Panel>
  );
}

/**
 * Manual metric cell with local draft state, persisted on blur / Enter.
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
    <Panel title={`Additional activities — ${weekLabel}`} flush>
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
