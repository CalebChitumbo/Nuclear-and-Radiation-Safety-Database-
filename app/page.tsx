"use client";

import Link from "next/link";

import { Bars } from "@/components/Bars";
import { Gauge } from "@/components/Gauge";
import { Kpi } from "@/components/Kpi";
import { useWeek } from "@/lib/weekContext";
import { useStoreData } from "@/lib/storeHooks";
import { PROVINCES, STAGES } from "@/lib/rules/types";

interface FeedItem {
  kind: "licence" | "inspection";
  id: string;
  date: string;
  title: string;
  subtitle: string;
}

export default function DashboardPage() {
  const { selected } = useWeek();

  const { data, loading } = useStoreData(
    async (s) => {
      const [agg, facilities, events, inspections] = await Promise.all([
        s.getAggregate(),
        s.listFacilities(),
        s.listLicenceEvents(),
        s.listInspections(),
      ]);
      return { agg, facilities, events, inspections };
    },
    [selected.label],
  );

  if (loading || !data) {
    return <div className="caps text-xs text-gunmetal/60">Loading…</div>;
  }

  const { agg, events, inspections } = data;
  const coverage = agg.total ? (agg.licensed / agg.total) * 100 : 0;
  const wkEvents = events.filter((e) => e.week === selected.label);
  const wkInspections = inspections.filter((i) => i.week === selected.label);
  const renewals = wkEvents.filter(
    (e) => e.type === "Renewal of Use/Possession Licence",
  ).length;
  const enforcement = wkInspections.filter(
    (i) => i.type === "Enforcement Action",
  ).length;

  const feed: FeedItem[] = [
    ...events.slice(0, 8).map((e) => ({
      kind: "licence" as const,
      id: e.id,
      date: e.date,
      title: `${e.type} — ${e.facilityName}`,
      subtitle: `${e.number || "no number"} · ${e.province}`,
    })),
    ...inspections.slice(0, 8).map((i) => ({
      kind: "inspection" as const,
      id: i.id,
      date: i.date,
      title: `${i.type} — ${i.facilityName}`,
      subtitle: `${i.outcome}${i.province ? " · " + i.province : ""}`,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const sectorRows = [
    {
      label: "Public",
      total: agg.bySector.Public.total,
      primary: agg.bySector.Public.licensed,
    },
    {
      label: "Private",
      total: agg.bySector.Private.total,
      primary: agg.bySector.Private.licensed,
    },
  ];

  const provinceRows = PROVINCES.map((p) => ({
    label: p,
    total: agg.byProvince[p].total,
    primary: agg.byProvince[p].licensed,
  })).sort((a, b) => b.total - a.total);

  const stageRows = STAGES.filter((s) => s !== "Licensed")
    .map((s) => ({ label: s, total: agg.byStage[s] || 0 }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6 staggered">
      {/* KPI grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Total facilities" value={agg.total.toLocaleString()} />
        <Kpi
          label="Licensed"
          value={agg.licensed.toLocaleString()}
          accent="green"
          caption={`${coverage.toFixed(1)}% of register`}
        />
        <Kpi
          label="Unlicensed"
          value={agg.unlicensed.toLocaleString()}
          accent="red"
        />
        <Kpi
          label="Authorisations on record"
          value={agg.auths.toLocaleString()}
          accent="slate"
          caption="One entry per recorded licence"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Gauge value={coverage} />
        <Bars title="Public vs Private" rows={sectorRows} showCounts />
        <div className="card p-5">
          <div className="caps text-xs text-gunmetal/60 mb-2">
            This week — {selected.label}
          </div>
          <ul className="space-y-2 text-sm">
            <FlowRow label="Licences logged" value={wkEvents.length} />
            <FlowRow label="Inspections logged" value={wkInspections.length} />
            <FlowRow label="Renewals" value={renewals} />
            <FlowRow
              label="Enforcement actions"
              value={enforcement}
              accent="red"
            />
          </ul>
          <div className="mt-4 flex gap-2">
            <Link className="btn btn-secondary" href="/weekly">
              Open weekly report
            </Link>
            <Link className="btn btn-ghost" href="/bulk-approval">
              Bulk approve
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bars title="Facilities by province (licensed / total)" rows={provinceRows} />
        <div className="card p-5">
          <div className="caps text-xs text-gunmetal/60 mb-3">
            Unlicensed pipeline
          </div>
          <div className="space-y-2">
            {stageRows.length === 0 ? (
              <div className="text-sm text-gunmetal/60">
                Every facility is licensed. (You won't see this often.)
              </div>
            ) : (
              stageRows.map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{r.label}</span>
                  <span className="tabular font-bold">{r.total}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="card p-5">
        <div className="caps text-xs text-gunmetal/60 mb-3">
          Recent activity
        </div>
        {feed.length === 0 ? (
          <div className="text-sm text-gunmetal/60">
            No events or inspections yet. Try the{" "}
            <Link className="underline" href="/bulk-approval">
              Bulk Approval
            </Link>{" "}
            page to log this week's licences.
          </div>
        ) : (
          <ul className="divide-y divide-gunmetal/8">
            {feed.map((f) => (
              <li
                key={`${f.kind}-${f.id}`}
                className="py-2 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`chip ${f.kind === "licence" ? "green" : "slate"}`}
                  >
                    {f.kind === "licence" ? "Licence" : "Inspection"}
                  </span>
                  <div>
                    <div className="text-sm font-bold">{f.title}</div>
                    <div className="text-xs text-gunmetal/60">{f.subtitle}</div>
                  </div>
                </div>
                <div className="text-xs tabular text-gunmetal/55">{f.date}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FlowRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "red" | "green";
}) {
  return (
    <li className="flex items-center justify-between">
      <span>{label}</span>
      <span
        className={`tabular font-black ${
          accent === "red"
            ? "text-[var(--status-stalled)]"
            : accent === "green"
              ? "text-[var(--rpa-green-dark)]"
              : ""
        }`}
      >
        {value}
      </span>
    </li>
  );
}

