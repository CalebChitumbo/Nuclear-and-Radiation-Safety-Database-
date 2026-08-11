"use client";

import Link from "next/link";

import { Bars } from "@/components/Bars";
import { Gauge } from "@/components/Gauge";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { useAuth } from "@/lib/auth";
import { useWeek } from "@/lib/weekContext";
import { useStoreData } from "@/lib/storeHooks";
import { computeLicenceStats } from "@/lib/rules/licenceStats";
import {
  deriveInspectionInbox,
  inspectionRequestStats,
} from "@/lib/rules/inspectionRequests";
import { LICENCE_TYPES, PROVINCES, STAGES, isUseP } from "@/lib/rules/types";

const CURRENT_YEAR = new Date().getFullYear();

interface FeedItem {
  kind: "licence" | "inspection";
  id: string;
  date: string;
  title: string;
  subtitle: string;
}

export default function DashboardPage() {
  const { selected } = useWeek();
  const { canEditAS, canEditInsp } = useAuth();

  // The week filter below is applied client-side, so the loader doesn't depend
  // on the selected week — refetching the collections on every week change
  // was wasted Firestore reads.
  const { data, error, reload } = useStoreData(async (s) => {
    const [agg, facilities, events, inspections, requests] = await Promise.all([
      s.getAggregate(),
      s.listFacilities(),
      s.listLicenceEvents(),
      s.listInspections(),
      // The inspection-request summary is secondary: if this collection can't be
      // read yet (e.g. its security rules haven't been deployed), the core
      // dashboard must still load. Degrade to an empty list rather than failing.
      s.listInspectionRequests().catch(() => []),
    ]);
    return { agg, facilities, events, inspections, requests };
  }, []);

  if (!data) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  const { agg, events, inspections, facilities, requests } = data;
  const coverage = agg.total ? (agg.licensed / agg.total) * 100 : 0;
  const inspectionInbox = deriveInspectionInbox(requests, {
    canEditAS,
    canEditInsp,
  });
  const requestStats = inspectionRequestStats(requests, CURRENT_YEAR);
  const licence = computeLicenceStats(facilities, CURRENT_YEAR);
  const issuedTypeRows = LICENCE_TYPES.map((t) => ({
    type: t,
    count: licence.issuedByType[t] || 0,
  })).filter((r) => r.count > 0);
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
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
          label="Functional"
          value={(agg.functional ?? agg.total).toLocaleString()}
          accent="green"
          caption={`${(agg.total - (agg.functional ?? agg.total)).toLocaleString()} non-functional`}
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
            <Link className="btn btn-secondary" href="/daily">
              Daily updates
            </Link>
            <Link className="btn btn-ghost" href="/weekly">
              Weekly report
            </Link>
          </div>
        </div>
      </section>

      {/* Licensing ↔ Inspectorate handoff */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div className="caps text-xs text-gunmetal/60">
            Inspectorate ↔ Licensing workflow
          </div>
          <Link
            className="text-xs caps font-bold text-[var(--rpa-green-dark)]"
            href="/inspection-requests"
          >
            Open requests
          </Link>
        </div>
        {inspectionInbox.count > 0 ? (
          <div className="text-sm mb-3">
            <span className="chip amber mr-2">{inspectionInbox.count}</span>
            <span className="text-gunmetal/75">
              {canEditInsp && inspectionInbox.incoming.length > 0
                ? `${inspectionInbox.incoming.length} new request${
                    inspectionInbox.incoming.length === 1 ? "" : "s"
                  } awaiting the Inspectorate`
                : null}
              {canEditInsp &&
              canEditAS &&
              inspectionInbox.incoming.length > 0 &&
              inspectionInbox.reportsReady.length > 0
                ? " · "
                : null}
              {canEditAS && inspectionInbox.reportsReady.length > 0
                ? `${inspectionInbox.reportsReady.length} report${
                    inspectionInbox.reportsReady.length === 1 ? "" : "s"
                  } ready to action`
                : null}
            </span>
          </div>
        ) : null}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MiniStat label="Open requests" value={requestStats.open} />
          <MiniStat
            label="Awaiting Inspectorate"
            value={inspectionInbox.incoming.length}
          />
          <MiniStat
            label="In progress"
            value={inspectionInbox.inProgress.length}
          />
          <MiniStat
            label="Reports ready"
            value={requestStats.reportsReady}
            accent
          />
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

      {/* Licences issued (all types) + who holds a current use licence */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-2">
            <div className="caps text-xs text-gunmetal/60">
              Licences issued (all types)
            </div>
            <Link
              className="text-xs caps font-bold text-[var(--rpa-green-dark)]"
              href="/licences"
            >
              Open authorisations
            </Link>
          </div>
          <div className="text-4xl font-black tabular">
            {licence.totalIssued.toLocaleString()}
          </div>
          <div className="mt-1 text-sm text-gunmetal/70">
            <span className="text-[var(--rpa-green-dark)] font-bold">
              {licence.useTotal}
            </span>{" "}
            use/possession ·{" "}
            <span className="font-bold">{licence.otherTotal}</span> standalone
            authorisation{licence.otherTotal === 1 ? "" : "s"}
          </div>
          {issuedTypeRows.length ? (
            <ul className="mt-3 space-y-1.5 text-sm">
              {issuedTypeRows.map((r) => (
                <li
                  key={r.type}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`chip ${isUseP(r.type) ? "green" : "slate"}`}
                    >
                      {isUseP(r.type) ? "Use" : "Standalone"}
                    </span>
                    <span>{r.type}</span>
                  </span>
                  <span className="tabular font-bold">{r.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 text-sm text-gunmetal/60">
              No licences recorded yet.
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-2">
            <div className="caps text-xs text-gunmetal/60">
              Use licence held — {CURRENT_YEAR}
            </div>
            <Link
              className="text-xs caps font-bold text-[var(--rpa-green-dark)]"
              href="/licences"
            >
              Breakdown
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            <FlowRow
              label={`Licensed for ${CURRENT_YEAR}`}
              value={licence.licensedThisYear}
              accent="green"
            />
            <FlowRow
              label="Renewal not yet confirmed"
              value={licence.licensedYearUnconfirmed}
            />
            <FlowRow
              label="Not licensed"
              value={licence.notLicensed}
              accent="red"
            />
          </ul>
          <div className="mt-3 text-[11px] text-gunmetal/55">
            Licence year read from each facility&apos;s latest use/possession
            licence — its issue date, or the quarter it was issued in.
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

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gunmetal/10 p-3">
      <div
        className={`text-2xl font-black tabular ${
          accent ? "text-[var(--rpa-green-dark)]" : ""
        }`}
      >
        {value}
      </div>
      <div className="caps text-[10px] text-gunmetal/60 mt-0.5">{label}</div>
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

