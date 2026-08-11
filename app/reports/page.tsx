"use client";

import Link from "next/link";
import { useMemo } from "react";

import { LoadErrorBanner } from "@/components/LoadError";
import { PageHeader, Panel } from "@/components/Section";
import { downloadTextFile } from "@/components/downloadFile";
import { useStoreData } from "@/lib/storeHooks";
import { facilitiesToCsv, toCsv } from "@/lib/rules/exportCsv";
import { PROVINCES, STAGES, type Facility } from "@/lib/rules/types";

/**
 * Register reports — the on-screen equivalent of the "Facility Licensing
 * Status" summary: status × functional matrix, sector / category / province
 * breakdowns, and CSV export. Every count links into the pre-filtered
 * register.
 */

const isFunctional = (f: Facility) => f.functional !== false;

/** The doc's five exclusive summary buckets, in presentation order. */
type BucketKey =
  | "licensed"
  | "inProgress"
  | "importOnly"
  | "noApplication"
  | "stalled";

const BUCKETS: {
  key: BucketKey;
  label: string;
  /** Query string for the register deep link, or null when not expressible. */
  link: string | null;
}[] = [
  { key: "licensed", label: "Licensed", link: "lic=licensed" },
  {
    key: "inProgress",
    label: "Application in progress (2026)",
    link: null,
  },
  {
    key: "importOnly",
    label: "Import licence only (no use/possession)",
    link: `stage=${encodeURIComponent("Import Licence Only (Not yet Use/Possession)")}`,
  },
  {
    key: "noApplication",
    label: "No application submitted",
    link: `lic=unlicensed&stage=${encodeURIComponent("No Application Submitted")}`,
  },
  {
    key: "stalled",
    label: "Earlier application stalled (no 2026 activity)",
    link: "stalled=1",
  },
];

function bucketOf(f: Facility): BucketKey {
  if (f.licensed) return "licensed";
  if (f.stalled) return "stalled";
  if (f.stage === "Import Licence Only (Not yet Use/Possession)")
    return "importOnly";
  if (f.stage === "No Application Submitted") return "noApplication";
  return "inProgress";
}

export default function ReportsPage() {
  const { data, loading, error, reload } = useStoreData(
    async (s) => s.listFacilities(),
    [],
  );
  const facilities: Facility[] = useMemo(() => data || [], [data]);
  const initialLoading = loading && !data;

  const stats = useMemo(() => {
    const matrix: Record<BucketKey, { func: number; nonFunc: number }> = {
      licensed: { func: 0, nonFunc: 0 },
      inProgress: { func: 0, nonFunc: 0 },
      importOnly: { func: 0, nonFunc: 0 },
      noApplication: { func: 0, nonFunc: 0 },
      stalled: { func: 0, nonFunc: 0 },
    };
    const byStage: Record<string, { func: number; nonFunc: number }> = {};
    const bySector = {
      Public: { total: 0, licensed: 0, functional: 0 },
      Private: { total: 0, licensed: 0, functional: 0 },
    };
    const byCategory = {
      Medical: { total: 0, licensed: 0, functional: 0 },
      "Non-Medical": { total: 0, licensed: 0, functional: 0 },
    };
    const byProvince: Record<
      string,
      { total: number; licensed: number; functional: number }
    > = {};
    for (const p of PROVINCES)
      byProvince[p] = { total: 0, licensed: 0, functional: 0 };

    let functional = 0;
    let licensed = 0;
    let stalled = 0;
    let review = 0;

    for (const f of facilities) {
      const fn = isFunctional(f);
      if (fn) functional += 1;
      if (f.licensed) licensed += 1;
      if (f.stalled) stalled += 1;
      if (f.needsReview) review += 1;

      const m = matrix[bucketOf(f)];
      if (fn) m.func += 1;
      else m.nonFunc += 1;

      const st = (byStage[f.stage] ||= { func: 0, nonFunc: 0 });
      if (fn) st.func += 1;
      else st.nonFunc += 1;

      const sec = f.sector === "Public" ? bySector.Public : bySector.Private;
      sec.total += 1;
      if (f.licensed) sec.licensed += 1;
      if (fn) sec.functional += 1;

      const cat =
        f.category === "Non-Medical"
          ? byCategory["Non-Medical"]
          : byCategory.Medical;
      cat.total += 1;
      if (f.licensed) cat.licensed += 1;
      if (fn) cat.functional += 1;

      const prov = byProvince[f.province];
      if (prov) {
        prov.total += 1;
        if (f.licensed) prov.licensed += 1;
        if (fn) prov.functional += 1;
      }
    }
    return {
      matrix,
      byStage,
      bySector,
      byCategory,
      byProvince,
      functional,
      licensed,
      stalled,
      review,
      total: facilities.length,
    };
  }, [facilities]);

  const exportRegister = () =>
    downloadTextFile(
      `rpa-register-${new Date().toISOString().slice(0, 10)}.csv`,
      facilitiesToCsv(facilities),
    );

  const exportSummary = () => {
    const rows = BUCKETS.map(({ key, label }) => [
      label,
      String(stats.matrix[key].func),
      String(stats.matrix[key].nonFunc),
      String(stats.matrix[key].func + stats.matrix[key].nonFunc),
    ]);
    rows.push([
      "Total facilities",
      String(stats.functional),
      String(stats.total - stats.functional),
      String(stats.total),
    ]);
    downloadTextFile(
      `rpa-status-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(["Current Status", "Functional", "Non-Functional", "Total"], rows),
    );
  };

  return (
    <div className="space-y-4 staggered">
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}

      <PageHeader
        title="Register reports"
        subtitle={`Live counts from the facility register${
          initialLoading ? " (loading…)" : ` — ${stats.total} facilities`
        }. Tap any number to open that filtered view of the register.`}
        actions={
          <>
            <button
              className="btn btn-secondary flex-1 sm:flex-none"
              onClick={exportSummary}
              disabled={initialLoading}
            >
              ⬇ Summary CSV
            </button>
            <button
              className="btn btn-primary flex-1 sm:flex-none"
              onClick={exportRegister}
              disabled={initialLoading}
            >
              ⬇ Register CSV
            </button>
          </>
        }
      />

      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
        <StatLink
          label="Functional"
          value={stats.functional}
          sub={`of ${stats.total}`}
          href="/facilities?func=functional"
        />
        <StatLink
          label="Licensed"
          value={stats.licensed}
          sub={`${stats.total - stats.licensed} unlicensed`}
          href="/facilities?lic=licensed"
        />
        <StatLink
          label="Stalled applications"
          value={stats.stalled}
          sub="no 2026 activity"
          href="/facilities?stalled=1"
        />
        <StatLink
          label="Needs review"
          value={stats.review}
          sub="confirm imported records"
          href="/facilities?review=1"
        />
      </section>

      <Panel title="Current status × operating state" flush>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Current status</th>
                <th className="num">Functional</th>
                <th className="num">Non-Func.</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {BUCKETS.map(({ key, label, link }) => {
                const m = stats.matrix[key];
                return (
                  <tr key={key}>
                    <td className="font-bold">{label}</td>
                    <CountCell
                      n={m.func}
                      href={link ? `/facilities?${link}&func=functional` : null}
                    />
                    <CountCell
                      n={m.nonFunc}
                      href={
                        link ? `/facilities?${link}&func=non-functional` : null
                      }
                    />
                    <CountCell
                      n={m.func + m.nonFunc}
                      href={link ? `/facilities?${link}` : null}
                      bold
                    />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total facilities</td>
                <CountCell
                  n={stats.functional}
                  href="/facilities?func=functional"
                  bold
                />
                <CountCell
                  n={stats.total - stats.functional}
                  href="/facilities?func=non-functional"
                  bold
                />
                <CountCell n={stats.total} href="/facilities" bold />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[11px] text-gunmetal/50 mt-3 px-4 sm:px-5">
          “Needs review” records ({stats.review}) are counted in their status row
          above and flagged separately —{" "}
          <Link className="link-action" href="/facilities?review=1">
            open the review queue →
          </Link>
        </p>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownPanel
          title="By sector"
          rows={(["Public", "Private"] as const).map((s) => ({
            label: s,
            ...stats.bySector[s],
            href: `/facilities?sector=${s}`,
          }))}
        />
        <BreakdownPanel
          title="By category"
          rows={(["Medical", "Non-Medical"] as const).map((c) => ({
            label: c,
            ...stats.byCategory[c],
            href: `/facilities?cat=${encodeURIComponent(c)}`,
          }))}
        />
      </div>

      <Panel title="By province" flush>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Province</th>
                <th className="num">Facilities</th>
                <th className="num">Licensed</th>
                <th className="num">Functional</th>
              </tr>
            </thead>
            <tbody>
              {PROVINCES.map((p) => {
                const row = stats.byProvince[p];
                if (!row || row.total === 0) return null;
                return (
                  <tr key={p}>
                    <td className="font-bold">{p}</td>
                    <CountCell
                      n={row.total}
                      href={`/facilities?province=${encodeURIComponent(p)}`}
                    />
                    <CountCell
                      n={row.licensed}
                      href={`/facilities?province=${encodeURIComponent(p)}&lic=licensed`}
                    />
                    <CountCell
                      n={row.functional}
                      href={`/facilities?province=${encodeURIComponent(p)}&func=functional`}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Pipeline detail — every stage" flush>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Stage</th>
                <th className="num">Functional</th>
                <th className="num">Non-Func.</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.filter((s) => stats.byStage[s]).map((s) => {
                const row = stats.byStage[s];
                const link = `stage=${encodeURIComponent(s)}`;
                return (
                  <tr key={s}>
                    <td>{s}</td>
                    <CountCell
                      n={row.func}
                      href={`/facilities?${link}&func=functional`}
                    />
                    <CountCell
                      n={row.nonFunc}
                      href={`/facilities?${link}&func=non-functional`}
                    />
                    <CountCell
                      n={row.func + row.nonFunc}
                      href={`/facilities?${link}`}
                      bold
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function StatLink({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number;
  sub: string;
  href: string;
}) {
  return (
    <Link href={href} className="stat card-hover block">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-caption">{sub}</div>
    </Link>
  );
}

function CountCell({
  n,
  href,
  bold,
}: {
  n: number;
  href: string | null;
  bold?: boolean;
}) {
  const cls = `num ${bold ? "font-black" : ""}`;
  if (!href || n === 0) return <td className={cls}>{n}</td>;
  return (
    <td className={cls}>
      <Link
        href={href}
        className="hover:underline text-[var(--rpa-green-dark)] font-bold"
      >
        {n}
      </Link>
    </td>
  );
}

function BreakdownPanel({
  title,
  rows,
}: {
  title: string;
  rows: {
    label: string;
    total: number;
    licensed: number;
    functional: number;
    href: string;
  }[];
}) {
  return (
    <Panel title={title} flush>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th></th>
              <th className="num">Facilities</th>
              <th className="num">Licensed</th>
              <th className="num">Functional</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="font-bold">{r.label}</td>
                <CountCell n={r.total} href={r.href} />
                <CountCell n={r.licensed} href={`${r.href}&lic=licensed`} />
                <CountCell n={r.functional} href={`${r.href}&func=functional`} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
