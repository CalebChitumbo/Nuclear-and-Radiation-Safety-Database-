"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Bars } from "@/components/Bars";
import { Kpi } from "@/components/Kpi";
import { useStoreData } from "@/lib/storeHooks";
import { computeLicenceStats } from "@/lib/rules/licenceStats";
import { LICENCE_TYPES, isUseP } from "@/lib/rules/types";

const CURRENT_YEAR = new Date().getFullYear();

export default function LicencesPage() {
  const { data, loading } = useStoreData(async (s) => s.listFacilities(), []);
  const [year, setYear] = useState(CURRENT_YEAR);

  const stats = useMemo(
    () => (data ? computeLicenceStats(data, year) : null),
    [data, year],
  );

  if (loading || !stats) {
    return <div className="caps text-xs text-gunmetal/60">Loading…</div>;
  }

  // Issued counts split the way the register thinks about them: Use/Possession
  // (the licences that confer "licensed") vs every standalone authorisation.
  const useRows = LICENCE_TYPES.filter((t) => isUseP(t)).map((t) => ({
    label: t.replace(" of Use/Possession Licence", " (Use/Possession)"),
    total: stats.issuedByType[t] || 0,
  }));
  const otherRows = LICENCE_TYPES.filter((t) => !isUseP(t))
    .map((t) => ({ label: t, total: stats.issuedByType[t] || 0 }))
    .sort((a, b) => b.total - a.total);

  const stageRows = Object.entries(stats.notLicensedByStage)
    .map(([label, total]) => ({ label, total: total || 0 }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const coverage = stats.licensedTotal
    ? (stats.licensedThisYear / stats.licensedTotal) * 100
    : 0;

  return (
    <div className="space-y-6 staggered">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">Licences &amp; authorisations</h1>
          <p className="text-sm text-gunmetal/60">
            Every licence issued — renewals, new use/possession, and standalone
            authorisations — and who holds a current use licence.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="caps text-[10px] text-gunmetal/60">Licence year</span>
          <div className="inline-flex items-center rounded-lg border border-gunmetal/10 overflow-hidden">
            <button
              className="px-3 py-2 text-sm font-bold"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Previous year"
            >
              ‹
            </button>
            <span className="px-3 py-2 text-sm font-black tabular">{year}</span>
            <button
              className="px-3 py-2 text-sm font-bold disabled:opacity-30"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= CURRENT_YEAR + 1}
              aria-label="Next year"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Totals — renewal + import + transit + every other type */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label="Licences issued (all types)"
          value={stats.totalIssued.toLocaleString()}
          caption="One entry per recorded authorisation"
        />
        <Kpi
          label="Use / Possession"
          value={stats.useTotal.toLocaleString()}
          accent="green"
          caption="Renewals + new use licences"
        />
        <Kpi
          label="Standalone authorisations"
          value={stats.otherTotal.toLocaleString()}
          accent="slate"
          caption="Import · transit · transfer · variation · …"
        />
        <Kpi
          label={`Licensed for use (${year})`}
          value={stats.licensedThisYear.toLocaleString()}
          accent="green"
          caption={`${coverage.toFixed(0)}% of ${stats.licensedTotal} licensed facilities`}
        />
      </section>

      {/* Issued by type */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bars title="Use / Possession licences by type" rows={useRows} />
        <Bars title="Standalone authorisations by type" rows={otherRows} />
      </section>

      {/* Who holds a current use licence this year */}
      <section className="card p-5">
        <div className="caps text-xs text-gunmetal/60 mb-3">
          Use licence held — {year}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <BreakdownCard
            label={`Licensed (${year})`}
            value={stats.licensedThisYear}
            tone="green"
            note="Use/possession licence dated this year"
          />
          <BreakdownCard
            label="Renewal not yet confirmed"
            value={stats.licensedYearUnconfirmed}
            tone="amber"
            note="Licensed, but newest use licence predates the year or is undated"
          />
          <BreakdownCard
            label="Not licensed"
            value={stats.notLicensed}
            tone="red"
            note="No current use licence — see pipeline below"
          />
        </div>
        <p className="mt-3 text-[11px] text-gunmetal/55">
          The licence year is read from each facility&apos;s most recent
          use/possession licence date. Facilities seeded before date tracking
          show under &ldquo;renewal not yet confirmed&rdquo; until their next
          dated renewal is recorded.
        </p>
      </section>

      {/* Renewal pipeline for the unlicensed */}
      {stageRows.length === 0 ? (
        <section className="card p-5">
          <div className="caps text-xs text-gunmetal/60 mb-3">Renewal pipeline</div>
          <div className="text-sm text-gunmetal/60">
            Every facility holds a use licence.
          </div>
        </section>
      ) : (
        <section>
          <Bars
            title="Renewal pipeline — where the unlicensed facilities are"
            rows={stageRows}
            showCounts
          />
          <div className="mt-3">
            <Link className="btn btn-ghost" href="/facilities">
              View facilities
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function BreakdownCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone: "green" | "amber" | "red";
}) {
  const color =
    tone === "green"
      ? "var(--rpa-green-dark)"
      : tone === "amber"
        ? "#7a5b07"
        : "var(--status-stalled)";
  return (
    <div className="card p-4">
      <div className="caps text-[10px] text-gunmetal/60">{label}</div>
      <div className="mt-1 text-3xl font-black tabular" style={{ color }}>
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-[11px] text-gunmetal/55">{note}</div>
    </div>
  );
}
