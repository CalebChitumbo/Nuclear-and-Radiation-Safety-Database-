"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { Bars } from "@/components/Bars";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { PageHeader, Panel } from "@/components/Section";
import { canEditSection, useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { useToast } from "@/components/Toast";
import { useWeek } from "@/lib/weekContext";
import {
  borderSums,
  dailyMetricOptions,
  effectiveValuesByWeek,
  sumMetricAcrossWeeks,
  vehicleScreeningKey,
} from "@/lib/rules/daily";
import { todayISO } from "@/lib/rules/week";
import type { Border, DailyEntry, Section } from "@/lib/rules/types";

const NSSS: Section = "Nuclear Safety, Security & Safeguards";

/**
 * The Nuclear Safety, Security & Safeguards section's own dashboard — the
 * metrics the section reports (vehicle/truck screening, IAEA meetings,
 * stakeholder engagements, TWG meetings) rolled up from its daily log and the
 * weekly report figures, with week / month / year totals and a screening trend.
 */
export default function NsssPage() {
  const { weeks, selected } = useWeek();
  const { user } = useAuth();
  const { data, error, reload } = useStoreData(async (s) => {
    const [weekMetricsAll, entries, borders] = await Promise.all([
      // All reads degrade to empty until their rules/collections exist so the
      // tab always renders.
      s.listWeekMetricsAll().catch(() => []),
      s.listDailyEntries().catch(() => []),
      s.listBorders().catch(() => []),
    ]);
    return { weekMetricsAll, entries, borders };
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
    const screeningKey = vehicleScreeningKey();
    const past = weeks.filter((w) => w.start <= today);
    const trend = past.slice(-8).map((w) => ({
      label: w.label.split(" — ")[0],
      total: (byWeek.get(w.label) || {})[screeningKey] || 0,
    }));

    const sectionEntries = data.entries
      .filter((e) => e.section === NSSS)
      .slice(0, 20);

    // Screening by border post, this calendar year — from the coordinators'
    // daily entries (each carries the border it came from).
    const yearNsss = data.entries.filter(
      (e) => e.section === NSSS && e.date.startsWith(today.slice(0, 4)),
    );
    const byBorder = borderSums(yearNsss, screeningKey);
    const borderRows = Object.entries(byBorder.byBorder)
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total);
    if (byBorder.unspecified > 0) {
      borderRows.push({
        label: "Head office / other",
        total: byBorder.unspecified,
      });
    }

    return { totals, trend, sectionEntries, borderRows };
  }, [data, weeks, selected.label, metrics, today]);

  if (!derived) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  const { totals, trend, sectionEntries, borderRows } = derived;
  const byLabel = (label: string) => totals.find((t) => t.label === label);
  const screening = byLabel("Vehicle Screening (units)");
  const iaea = byLabel("IAEA Meetings attended");
  const stakeholder = byLabel("Stakeholder Engagements");
  const year = today.slice(0, 4);
  const canManage = canEditSection(user, NSSS);

  return (
    <div className="space-y-4 staggered">
      <PageHeader
        eyebrow="Nuclear Safety, Security &amp; Safeguards"
        title="Section dashboard"
        subtitle="Figures come from the section's Daily Updates log; weeks without daily entries fall back to the weekly report figure."
        actions={
          <>
            <Link className="btn btn-primary flex-1 sm:flex-none" href="/border">
              Border scan log
            </Link>
            <Link
              className="btn btn-secondary flex-1 sm:flex-none"
              href="/daily"
            >
              Log today&apos;s numbers
            </Link>
          </>
        }
      />

      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
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
        <Panel
          title="Section metrics"
          note="A reporting week counts toward the month it starts in."
          flush
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="num">Week</th>
                  <th className="num">Month</th>
                  <th className="num">{year}</th>
                  <th className="num">All</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((m) => (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    <td className="num">{m.week}</td>
                    <td className="num">{m.month}</td>
                    <td className="num font-black">{m.year}</td>
                    <td className="num">{m.all}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {borderRows.length ? (
          <Bars title={`Screening by border post — ${year}`} rows={borderRows} />
        ) : (
          <Panel title={`Screening by border post — ${year}`}>
            <p className="text-sm text-gunmetal/55">
              No border figures yet this year. Posts either log truck by truck on
              the{" "}
              <Link className="link-action" href="/border">
                Border Scan Log
              </Link>{" "}
              and post the day&apos;s total, or enter the figure directly on
              Daily Updates.
            </p>
          </Panel>
        )}
        <ManageBordersPanel
          borders={data?.borders || []}
          canManage={canManage}
          uid={user?.uid || ""}
          onChanged={reload}
        />
      </section>

      <Panel
        title={`Recent daily log — latest ${sectionEntries.length}`}
        flush
        action={
          <Link className="link-action" href="/daily">
            Open Daily Updates →
          </Link>
        }
      >
        {sectionEntries.length === 0 ? (
          <p className="px-4 sm:px-5 text-sm text-gunmetal/60">
            Nothing logged yet. Use Daily Updates to record vehicles screened,
            meetings and engagements as they happen — the weekly report totals
            itself from those entries.
          </p>
        ) : (
          <ul className="divide-y divide-gunmetal/8">
            {sectionEntries.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function EntryRow({ entry }: { entry: DailyEntry }) {
  return (
    <li className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {entry.kind === "count" ? (
          <div className="text-sm flex flex-wrap items-center gap-1.5">
            <span className="font-bold">{entry.label}</span>
            <span className="chip green tabular">+{entry.value ?? 0}</span>
            {entry.border ? (
              <span className="chip slate">{entry.border}</span>
            ) : null}
          </div>
        ) : (
          <div className="text-sm">
            {entry.official ? (
              <span className="chip green mr-1">official</span>
            ) : null}
            {entry.text}
          </div>
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
      <div className="text-xs tabular text-gunmetal/55 text-right shrink-0">
        <div>{entry.date}</div>
        <div>{entry.week}</div>
      </div>
    </li>
  );
}

/**
 * The border-post register: NSSS (and admins) add the posts coordinators
 * report from, and can deactivate one without losing its logged history.
 */
function ManageBordersPanel({
  borders,
  canManage,
  uid,
  onChanged,
}: {
  borders: Border[];
  canManage: boolean;
  uid: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.addBorder(name.trim(), uid);
      setName("");
      toast.push("Border post added.", "success");
      onChanged();
    } catch (err) {
      toast.push(
        `Adding failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (b: Border) => {
    if (busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.setBorderActive(b.id, !b.active, uid);
      onChanged();
    } catch (err) {
      toast.push(
        `Updating failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Border posts"
      note="Coordinators pick their post when logging vehicles screened; the daily official total sums across posts. Deactivating keeps history."
    >
      {borders.length === 0 ? (
        <p className="text-sm text-gunmetal/55">
          No border posts yet.{" "}
          {canManage
            ? "Add the posts your coordinators report from."
            : "The NSSS section adds them here."}
        </p>
      ) : (
        <ul className="divide-y divide-gunmetal/8 text-sm">
          {borders.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <span className={b.active ? "font-bold" : "text-gunmetal/45"}>
                {b.name}
                {!b.active ? <span className="chip ml-2">inactive</span> : null}
              </span>
              {canManage ? (
                <button
                  className="link-action"
                  style={{
                    color: b.active
                      ? "var(--status-stalled)"
                      : "var(--rpa-green-dark)",
                  }}
                  disabled={busy}
                  onClick={() => toggle(b)}
                >
                  {b.active ? "Deactivate" : "Reactivate"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div className="flex gap-2 pt-3">
          <input
            className="input"
            aria-label="New border post name"
            placeholder="e.g. Chirundu"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <button
            className="btn btn-primary shrink-0"
            disabled={busy || !name.trim()}
            onClick={add}
          >
            Add
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
