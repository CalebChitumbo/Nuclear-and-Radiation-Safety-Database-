"use client";

import { useMemo } from "react";

import Link from "next/link";

import { Bars } from "@/components/Bars";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { useStoreData } from "@/lib/storeHooks";
import { useWeek } from "@/lib/weekContext";
import {
  dailyMetricOptions,
  effectiveValuesByWeek,
  sumMetricAcrossWeeks,
} from "@/lib/rules/daily";
import { todayISO } from "@/lib/rules/week";
import type { DailyEntry, Section } from "@/lib/rules/types";

const NSSS: Section = "Nuclear Safety, Security & Safeguards";

/**
 * The Nuclear Safety, Security & Safeguards section's own dashboard — the
 * metrics the section reports (vehicle/truck screening, IAEA meetings,
 * stakeholder engagements, TWG meetings) rolled up from its daily log and the
 * weekly report figures, with week / month / year totals and a screening trend.
 */
export default function NsssPage() {
  const { weeks, selected } = useWeek();
  const { data, error, reload } = useStoreData(async (s) => {
    const [weekMetricsAll, entries] = await Promise.all([
      // Both reads degrade to empty until their rules/collections exist so the
      // tab always renders.
      s.listWeekMetricsAll().catch(() => []),
      s.listDailyEntries().catch(() => []),
    ]);
    return { weekMetricsAll, entries };
  });

  const metrics = useMemo(() => dailyMetricOptions(NSSS), []);
  const today = todayISO();

  const derived = useMemo(() => {
    if (!data) return null;
    const byWeek = effectiveValuesByWeek(data.weekMetricsAll, data.entries);
    const weekByLabel = new Map(weeks.map((w) => [w.label, w]));
    // A reporting week counts toward the calendar month/year it STARTS in.
    const inMonth = (label: string) =>
      (weekByLabel.get(label)?.start || "").slice(0, 7) === today.slice(0, 7);
    const inYear = (label: string) =>
      (weekByLabel.get(label)?.start || "").slice(0, 4) === today.slice(0, 4);

    const totals = metrics.map((m) => ({
      ...m,
      week: sumMetricAcrossWeeks(byWeek, m.key, (w) => w === selected.label),
      month: sumMetricAcrossWeeks(byWeek, m.key, inMonth),
      year: sumMetricAcrossWeeks(byWeek, m.key, inYear),
      all: sumMetricAcrossWeeks(byWeek, m.key),
    }));

    // Screening trend: the last 8 reporting weeks up to today.
    const screeningKey =
      metrics.find((m) => m.label === "Vehicle Screening (units)")?.key || "";
    const past = weeks.filter((w) => w.start <= today);
    const trend = past.slice(-8).map((w) => ({
      label: w.label.split(" — ")[0],
      total: (byWeek.get(w.label) || {})[screeningKey] || 0,
    }));

    const sectionEntries = data.entries
      .filter((e) => e.section === NSSS)
      .slice(0, 20);

    return { totals, trend, sectionEntries };
  }, [data, weeks, selected.label, metrics, today]);

  if (!derived) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  const { totals, trend, sectionEntries } = derived;
  const byLabel = (label: string) => totals.find((t) => t.label === label);
  const screening = byLabel("Vehicle Screening (units)");
  const iaea = byLabel("IAEA Meetings attended");
  const stakeholder = byLabel("Stakeholder Engagements");
  const year = today.slice(0, 4);

  return (
    <div className="space-y-4 staggered">
      <div className="card p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="caps text-xs text-gunmetal/60">
            Nuclear Safety, Security &amp; Safeguards
          </div>
          <div className="text-xl font-black">Section dashboard</div>
          <div className="text-xs text-gunmetal/60">
            Figures come from the section&apos;s Daily Updates log; weeks
            without daily entries fall back to the weekly report figure.
          </div>
        </div>
        <Link className="btn btn-primary" href="/daily">
          Log today&apos;s numbers
        </Link>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label="Vehicles screened — this week"
          value={screening ? screening.week : 0}
          accent="green"
          caption={selected.label}
        />
        <Kpi
          label={`Vehicles screened — ${year}`}
          value={screening ? screening.year : 0}
        />
        <Kpi
          label={`IAEA meetings — ${year}`}
          value={iaea ? iaea.year : 0}
          accent="slate"
        />
        <Kpi
          label={`Stakeholder engagements — ${year}`}
          value={stakeholder ? stakeholder.year : 0}
          accent="amber"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bars title="Vehicle screening — last 8 weeks" rows={trend} />
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gunmetal/8 font-black">
            Section metrics
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs caps text-gunmetal/55">
                  <th className="px-5 py-2">Metric</th>
                  <th className="px-5 py-2 text-right">Week</th>
                  <th className="px-5 py-2 text-right">Month</th>
                  <th className="px-5 py-2 text-right">{year}</th>
                  <th className="px-5 py-2 text-right">All time</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((m) => (
                  <tr key={m.key} className="border-t border-gunmetal/8">
                    <td className="px-5 py-2">{m.label}</td>
                    <td className="px-5 py-2 text-right tabular">{m.week}</td>
                    <td className="px-5 py-2 text-right tabular">{m.month}</td>
                    <td className="px-5 py-2 text-right tabular font-black">
                      {m.year}
                    </td>
                    <td className="px-5 py-2 text-right tabular">{m.all}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2 text-[11px] text-gunmetal/55">
            A reporting week counts toward the month it starts in.
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gunmetal/8 flex items-center justify-between flex-wrap gap-2">
          <div className="font-black">
            Recent daily log
            <span className="text-xs text-gunmetal/55 font-normal ml-2">
              latest {sectionEntries.length}
            </span>
          </div>
          <Link
            className="text-xs caps font-bold text-[var(--rpa-green-dark)]"
            href="/daily"
          >
            Open Daily Updates →
          </Link>
        </div>
        {sectionEntries.length === 0 ? (
          <div className="p-6 text-sm text-gunmetal/60">
            Nothing logged yet. Use Daily Updates to record vehicles screened,
            meetings and engagements as they happen — the weekly report totals
            itself from those entries.
          </div>
        ) : (
          <ul className="divide-y divide-gunmetal/8">
            {sectionEntries.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EntryRow({ entry }: { entry: DailyEntry }) {
  return (
    <li className="px-5 py-3 flex items-start justify-between gap-3">
      <div>
        {entry.kind === "count" ? (
          <div className="text-sm">
            <span className="font-bold">{entry.label}</span>
            <span className="chip green ml-2 tabular">+{entry.value ?? 0}</span>
          </div>
        ) : (
          <div className="text-sm">{entry.text}</div>
        )}
        {entry.kind === "count" && entry.text ? (
          <div className="text-xs text-gunmetal/60 mt-0.5">{entry.text}</div>
        ) : null}
        {entry.updatedByName ? (
          <div className="text-[11px] text-gunmetal/50 mt-0.5">
            {entry.updatedByName}
          </div>
        ) : null}
      </div>
      <div className="text-xs tabular text-gunmetal/55 text-right">
        <div>{entry.date}</div>
        <div>{entry.week}</div>
      </div>
    </li>
  );
}
