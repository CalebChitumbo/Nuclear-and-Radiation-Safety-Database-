"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { Bars } from "@/components/Bars";
import { FigureChangesPanel } from "@/components/nsss/FigureChangesPanel";
import { ScreeningExportPanel } from "@/components/nsss/ScreeningExportPanel";
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
  sumMetricsAcrossWeeks,
  vehicleScreeningKey,
} from "@/lib/rules/daily";
import { todayISO } from "@/lib/rules/week";
import {
  applyWorkPlanConfig,
  effectiveOpeningBalance,
  WORK_PLAN_YEAR,
} from "@/lib/rules/workPlan";
import type {
  AuditEntry,
  Border,
  DailyEntry,
  Section,
  WorkPlanBaseline,
  WorkPlanConfig,
} from "@/lib/rules/types";

const NSSS: Section = "Nuclear Safety, Security & Safeguards";

/**
 * The Nuclear Safety, Security & Safeguards section's own dashboard — the
 * outputs the section owns in the approved 2026 work plan (screening, regional
 * workshops, stakeholder engagement, coordinator/TWG meetings …) rolled up from
 * its daily log and the sectional update's figures, with week / month / year
 * totals and a screening trend.
 */
export default function NsssPage() {
  const { weeks, selected } = useWeek();
  const { user } = useAuth();
  const { data, error, reload } = useStoreData(async (s) => {
    const [weekMetricsAll, entries, borders, config, auditLog, baseline] =
      await Promise.all([
      // All reads degrade to empty until their rules/collections exist so the
      // tab always renders.
      s.listWeekMetricsAll().catch(() => []),
      // The section's own log — the only slice an NSSS officer may read.
      s.listDailyEntries({ section: NSSS }).catch(() => []),
      s.listBorders().catch(() => []),
      // The section's own changes to the plan — a row NSSS added or reworded
      // on the weekly report is one of its metrics here too.
      s.getWorkPlanConfig(WORK_PLAN_YEAR).catch(
        () => null as WorkPlanConfig | null,
      ),
      // Who changed which figure, and what it was before. Empty until the
      // auditLog rules and the Cloud Function triggers are deployed.
      s.listAuditLog({ section: NSSS }).catch(() => [] as AuditEntry[]),
      // The opening balances, so this tab's cumulative figures are the SAME
      // figures the sectional update reports - see the note by `openingFor`.
      s.getWorkPlanBaseline(WORK_PLAN_YEAR).catch(
        () => null as WorkPlanBaseline | null,
      ),
    ]);
    return { weekMetricsAll, entries, borders, config, auditLog, baseline };
  });

  const metrics = useMemo(
    () => dailyMetricOptions(NSSS, applyWorkPlanConfig(data?.config)),
    [data?.config],
  );
  const today = todayISO();

  const derived = useMemo(() => {
    if (!data) return null;
    const byWeek = effectiveValuesByWeek(data.weekMetricsAll, data.entries);

    /**
     * What an output had already achieved when it came onto the system.
     *
     * The sectional update adds this to every cumulative figure; this tab used
     * to leave it out, so the same output read two different totals on two
     * screens of the same app — 9,832 apart for vehicle screening. That gap is
     * how a figure comes to look like it moved on its own when nothing was
     * logged at all, so the two now agree by construction.
     */
    const opening = effectiveOpeningBalance(
      data.baseline?.values,
      applyWorkPlanConfig(data.config),
    );
    const openingFor = (outputId: string) =>
      (opening[outputId] || []).reduce((a, b) => a + b, 0);
    const weekByLabel = new Map(weeks.map((w) => [w.label, w]));
    // A reporting week counts toward the calendar month/year it STARTS in.
    const inMonth = (label: string) =>
      (weekByLabel.get(label)?.start || "").slice(0, 7) === today.slice(0, 7);
    const inYear = (label: string) =>
      (weekByLabel.get(label)?.start || "").slice(0, 4) === today.slice(0, 4);

    const totals = metrics.map((m) => {
      // Week and month are what was logged in that period. The cumulative
      // columns carry the opening balance, the way the work plan row does.
      const carriedIn = openingFor(m.outputId);
      const loggedThisYear = sumMetricsAcrossWeeks(byWeek, m.keys, inYear);
      return {
        ...m,
        carriedIn,
        loggedThisYear,
        week: sumMetricsAcrossWeeks(byWeek, m.keys, (w) => w === selected.label),
        month: sumMetricsAcrossWeeks(byWeek, m.keys, inMonth),
        year: carriedIn + loggedThisYear,
        all: carriedIn + sumMetricsAcrossWeeks(byWeek, m.keys),
      };
    });

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
  // By work plan output id, not label — the wording on a row can change, the
  // output it reports against cannot.
  const byOutput = (id: string) => totals.find((t) => t.outputId === id);
  const screening = byOutput("1.3.12");
  const iaea = byOutput("1.3.8");
  const stakeholder = byOutput("1.3.9");
  const year = today.slice(0, 4);
  const canManage = canEditSection(user, NSSS);

  return (
    <div className="space-y-4 staggered">
      <PageHeader
        eyebrow="Nuclear Safety, Security &amp; Safeguards"
        title="Section dashboard"
        subtitle="Figures come from the section's Daily Updates log, against the section's 2026 work plan outputs; weeks without daily entries fall back to the figure typed on the sectional update."
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
          caption={
            screening && screening.carriedIn
              ? `${screening.loggedThisYear.toLocaleString()} logged + ${screening.carriedIn.toLocaleString()} carried in`
              : undefined
          }
        />
        <Kpi
          label={`Regional / IAEA meetings — ${year}`}
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
          note={
            "A reporting week counts toward the month it starts in. The " +
            "cumulative columns include what each output had already achieved " +
            "when it came onto the system, so they read as the sectional " +
            "update reports them."
          }
          flush
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Output</th>
                  <th>Metric</th>
                  <th className="num">Week</th>
                  <th className="num">Month</th>
                  <th className="num">Carried in</th>
                  <th className="num">{year}</th>
                  <th className="num">All</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((m) => (
                  <tr key={m.key}>
                    <td className="tabular font-bold whitespace-nowrap">
                      {m.supporting ? "—" : m.outputId}
                    </td>
                    <td>{m.label}</td>
                    <td className="num">{m.week}</td>
                    <td className="num">{m.month}</td>
                    <td className="num text-gunmetal/55">
                      {m.carriedIn || ""}
                    </td>
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

      {/* The SharePoint hand-over: the same entries the figures above are
          summed from, as a workbook the section uploads. */}
      <ScreeningExportPanel
        entries={data?.entries || []}
        borders={data?.borders || []}
        generatedBy={user?.displayName || ""}
      />

      <FigureChangesPanel entries={data?.auditLog || []} />

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
            meetings and engagements as they happen — the sectional update totals
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
