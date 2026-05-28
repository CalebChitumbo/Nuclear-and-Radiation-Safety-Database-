"use client";

import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { useToast } from "@/components/Toast";
import { useWeek } from "@/lib/weekContext";
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

  const { data, reload } = useStoreData(
    async (s) => {
      const [events, inspections, activities, metrics] = await Promise.all([
        s.listLicenceEvents(),
        s.listInspections(),
        s.listActivities(),
        s.getWeekMetrics(selected.label),
      ]);
      return { events, inspections, activities, metrics };
    },
    [selected.label],
  );

  if (!data) {
    return <div className="caps text-xs text-gunmetal/60">Loading…</div>;
  }

  const wkEvents = data.events.filter((e) => e.week === selected.label);
  const wkInspections = data.inspections.filter(
    (i) => i.week === selected.label,
  );
  const wkActivities = data.activities.filter(
    (a) => a.week === selected.label,
  );

  const report = deriveWeekly(
    wkEvents,
    wkInspections,
    data.metrics.values || {},
  );

  const onManualChange = async (key: string, value: number) => {
    const s = await store();
    await s.setWeekMetricValue(selected.label, key, value);
    reload();
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
      <div className="card p-5 flex items-center justify-between flex-wrap gap-3 no-print">
        <div>
          <div className="caps text-xs text-gunmetal/60">Reporting week</div>
          <div className="text-xl font-black">{selected.label}</div>
          <div className="text-xs text-gunmetal/60 tabular">
            {selected.start} → {selected.end}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={generateBrief}>
            Generate brief
          </button>
          <button className="btn btn-primary" onClick={printPdf}>
            Print / PDF
          </button>
        </div>
      </div>

      {report.map((sec) => (
        <SectionTable
          key={sec.section}
          section={sec.section}
          metrics={sec.metrics}
          total={sec.total}
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
  onManualChange,
}: {
  section: string;
  metrics: Array<{ key: string; label: string; auto: boolean; value: number }>;
  total: { label: string; value: number } | null;
  onManualChange: (key: string, value: number) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-gunmetal/8 font-black">
        {section}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs caps text-gunmetal/55">
            <th className="px-5 py-2">Metric</th>
            <th className="px-5 py-2 text-right">Count</th>
            <th className="px-5 py-2 w-24">Source</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.key} className="border-t border-gunmetal/8">
              <td className="px-5 py-2">{m.label}</td>
              <td className="px-5 py-2 text-right tabular">
                {m.auto ? (
                  <span className="font-black">{m.value}</span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    className="input text-right"
                    style={{ maxWidth: 100, marginLeft: "auto" }}
                    value={m.value}
                    onChange={(e) =>
                      onManualChange(m.key, Number(e.target.value) || 0)
                    }
                  />
                )}
              </td>
              <td className="px-5 py-2">
                {m.auto ? (
                  <span className="chip green">auto</span>
                ) : (
                  <span className="chip">manual</span>
                )}
              </td>
            </tr>
          ))}
          {total ? (
            <tr className="border-t border-gunmetal/8 bg-mist">
              <td className="px-5 py-2 font-black">{total.label}</td>
              <td className="px-5 py-2 text-right tabular font-black">
                {total.value}
              </td>
              <td className="px-5 py-2"></td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
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
  const [section, setSection] = useState<typeof SECTIONS[number]>(SECTIONS[0]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Activity["status"]>("In Progress");
  const toast = useToast();

  const add = async () => {
    if (!text.trim()) return;
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
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-gunmetal/8 font-black">
        Additional activities — {weekLabel}
      </div>
      <div className="p-5 flex flex-wrap gap-2 items-end no-print">
        <div className="flex-1 min-w-[240px]">
          <label className="caps text-[10px] text-gunmetal/60">Activity</label>
          <input
            className="input mt-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What is being done?"
          />
        </div>
        <div>
          <label className="caps text-[10px] text-gunmetal/60">Section</label>
          <select
            className="input mt-1"
            value={section}
            onChange={(e) => setSection(e.target.value as typeof SECTIONS[number])}
          >
            {SECTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="caps text-[10px] text-gunmetal/60">Status</label>
          <select
            className="input mt-1"
            value={status}
            onChange={(e) => setStatus(e.target.value as Activity["status"])}
          >
            {ACTIVITY_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={add}>
          Add
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs caps text-gunmetal/55">
            <th className="px-5 py-2">Section</th>
            <th className="px-5 py-2">Activity</th>
            <th className="px-5 py-2">Status</th>
            <th className="px-5 py-2 no-print"></th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => (
            <tr key={a.id} className="border-t border-gunmetal/8">
              <td className="px-5 py-2 text-xs">{a.section}</td>
              <td className="px-5 py-2">{a.text}</td>
              <td className="px-5 py-2">
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
              </td>
              <td className="px-5 py-2 text-right no-print">
                <button
                  className="text-xs caps font-bold text-[var(--status-stalled)]"
                  onClick={async () => {
                    const s = await store();
                    await s.deleteActivity(a.id);
                    onReload();
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {activities.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-5 py-6 text-sm text-gunmetal/55 text-center"
              >
                No additional activities logged for this week.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

