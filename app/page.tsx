"use client";

import Link from "next/link";

import { Bars } from "@/components/Bars";
import { Gauge } from "@/components/Gauge";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { DataRow, Panel } from "@/components/Section";
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
    <div className="space-y-4 staggered">
      {/* The register at a glance — one strip, divided, not five cards */}
      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-5">
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
        <Panel
          title={`This week — ${selected.label}`}
          action={
            <Link className="link-action" href="/weekly">
              Sectional update →
            </Link>
          }
        >
          <ul className="divide-y divide-gunmetal/8">
            <DataRow label="Licences logged" value={wkEvents.length} />
            <DataRow label="Inspections logged" value={wkInspections.length} />
            <DataRow label="Renewals" value={renewals} />
            <DataRow
              label="Enforcement actions"
              value={enforcement}
              accent="red"
            />
          </ul>
          <Link className="btn btn-secondary w-full mt-3" href="/daily">
            Log today&apos;s updates
          </Link>
        </Panel>
      </section>

      {/* Licensing ↔ Inspectorate handoff */}
      <Panel
        title="Inspectorate ↔ Licensing workflow"
        action={
          <Link className="link-action" href="/inspection-requests">
            Open requests →
          </Link>
        }
      >
        {inspectionInbox.count > 0 ? (
          <div className="text-sm mb-3 flex items-center gap-2 flex-wrap">
            <span className="chip amber">{inspectionInbox.count}</span>
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
        <div className="stat-grid grid-cols-2 md:grid-cols-4">
          <Kpi label="Open requests" value={requestStats.open} />
          <Kpi
            label="Awaiting Inspectorate"
            value={inspectionInbox.incoming.length}
          />
          <Kpi label="In progress" value={inspectionInbox.inProgress.length} />
          <Kpi
            label="Reports ready"
            value={requestStats.reportsReady}
            accent="green"
          />
        </div>
      </Panel>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bars
          title="Facilities by province (licensed / total)"
          rows={provinceRows}
        />
        <Panel title="Unlicensed pipeline">
          {stageRows.length === 0 ? (
            <p className="text-sm text-gunmetal/60">
              Every facility is licensed. (You won&apos;t see this often.)
            </p>
          ) : (
            <ul className="divide-y divide-gunmetal/8">
              {stageRows.map((r) => (
                <DataRow key={r.label} label={r.label} value={r.total} />
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {/* Licences issued (all types) + who holds a current use licence */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="Licences issued (all types)"
          action={
            <Link className="link-action" href="/licences">
              Authorisations →
            </Link>
          }
        >
          <div className="text-3xl sm:text-4xl font-black tabular">
            {licence.totalIssued.toLocaleString()}
          </div>
          <p className="mt-1 text-sm text-gunmetal/70">
            <span className="text-[var(--rpa-green-dark)] font-bold">
              {licence.useTotal}
            </span>{" "}
            use/possession ·{" "}
            <span className="font-bold">{licence.otherTotal}</span> standalone
            authorisation{licence.otherTotal === 1 ? "" : "s"}
          </p>
          {issuedTypeRows.length ? (
            <ul className="mt-3 divide-y divide-gunmetal/8">
              {issuedTypeRows.map((r) => (
                <li
                  key={r.type}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={`chip ${isUseP(r.type) ? "green" : "slate"} shrink-0`}
                    >
                      {isUseP(r.type) ? "Use" : "Standalone"}
                    </span>
                    <span className="text-sm min-w-0">{r.type}</span>
                  </span>
                  <span className="tabular font-bold shrink-0">{r.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-gunmetal/60">
              No licences recorded yet.
            </p>
          )}
        </Panel>

        <Panel
          title={`Use licence held — ${CURRENT_YEAR}`}
          action={
            <Link className="link-action" href="/licences">
              Breakdown →
            </Link>
          }
        >
          <ul className="divide-y divide-gunmetal/8">
            <DataRow
              label={`Licensed for ${CURRENT_YEAR}`}
              value={licence.licensedThisYear}
              accent="green"
            />
            <DataRow
              label="Renewal not yet confirmed"
              value={licence.licensedYearUnconfirmed}
            />
            <DataRow
              label="Not licensed"
              value={licence.notLicensed}
              accent="red"
            />
          </ul>
          <p className="mt-3 text-[11px] text-gunmetal/55">
            Licence year read from each facility&apos;s latest use/possession
            licence — its issue date, or the quarter it was issued in.
          </p>
        </Panel>
      </section>

      <Panel title="Recent activity" flush>
        {feed.length === 0 ? (
          <p className="text-sm text-gunmetal/60 px-4 sm:px-5">
            No events or inspections yet. Try the{" "}
            <Link className="underline" href="/bulk-approval">
              Bulk Approval
            </Link>{" "}
            page to log this week&apos;s licences.
          </p>
        ) : (
          <ul className="divide-y divide-gunmetal/8">
            {feed.map((f) => (
              <li
                key={`${f.kind}-${f.id}`}
                className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`chip ${f.kind === "licence" ? "green" : "slate"} shrink-0`}
                  >
                    {f.kind === "licence" ? "Licence" : "Inspection"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold break-words">
                      {f.title}
                    </div>
                    <div className="text-xs text-gunmetal/60">{f.subtitle}</div>
                  </div>
                </div>
                <div className="text-xs tabular text-gunmetal/55 shrink-0">
                  {f.date}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
