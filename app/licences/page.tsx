"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Bars } from "@/components/Bars";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { PageHeader, Panel } from "@/components/Section";
import { useStoreData } from "@/lib/storeHooks";
import {
  authSortKey,
  authWhen,
  computeLicenceStats,
} from "@/lib/rules/licenceStats";
import {
  LICENCE_TYPES,
  isUseP,
  type Facility,
  type LicenceType,
} from "@/lib/rules/types";

const CURRENT_YEAR = new Date().getFullYear();
// The register's licence history starts well after 2000 — stepping the year
// selector below this only ever yields empty results.
const MIN_YEAR = 2000;
const AUTH_PAGE_SIZE = 50;

// Compact chip/column labels for the long official type names.
const SHORT_TYPE: Partial<Record<LicenceType, string>> = {
  "New Use/Possession Licence": "New use",
  "Renewal of Use/Possession Licence": "Renewal",
  "Importation Licence": "Import",
  "Export Licence": "Export",
  "Transfer Licence": "Transfer",
  "Transport Licence": "Transport",
  "Transit Licence": "Transit",
  "Variation of Terms and Conditions": "Variation",
  "Design and Construction Licence": "Design & Constr.",
  "Decommissioning Licence": "Decommissioning",
};

interface AuthRow {
  facilityId: string;
  facilityName: string;
  facCode: string;
  province: string;
  sector: string;
  type: LicenceType;
  number: string;
  /** Issue date, or the quarter it was issued in ("Q1 2026"). */
  when: string;
  sortKey: string;
}

/** Flatten every recorded authorisation across the register into one row each. */
function flattenAuths(facilities: Facility[]): AuthRow[] {
  const rows: AuthRow[] = [];
  for (const f of facilities) {
    for (const a of f.auths || []) {
      rows.push({
        facilityId: f.id,
        facilityName: f.name,
        facCode: f.facCode,
        province: f.province,
        sector: f.sector,
        type: a.type,
        number: a.number,
        when: authWhen(a),
        sortKey: authSortKey(a),
      });
    }
  }
  // Newest first; entries with neither date nor quarter sink to the bottom.
  return rows.sort((a, b) => (b.sortKey || "").localeCompare(a.sortKey || ""));
}

export default function LicencesPage() {
  const { data, error, reload } = useStoreData(
    async (s) => s.listFacilities(),
    [],
  );
  const [year, setYear] = useState(CURRENT_YEAR);
  // The itemized table's filters: a licence type, or the "standalone" / "use" /
  // "all" groupings; plus a free-text search.
  const [typeFilter, setTypeFilter] = useState<string>("standalone");
  const [authSearch, setAuthSearch] = useState("");
  const [page, setPage] = useState(0);

  const stats = useMemo(
    () => (data ? computeLicenceStats(data, year) : null),
    [data, year],
  );
  const authRows = useMemo(() => (data ? flattenAuths(data) : []), [data]);
  const filteredAuthRows = useMemo(() => {
    const q = authSearch.trim().toLowerCase();
    return authRows.filter((r) => {
      if (typeFilter === "standalone" && isUseP(r.type)) return false;
      if (typeFilter === "use" && !isUseP(r.type)) return false;
      if (
        typeFilter !== "standalone" &&
        typeFilter !== "use" &&
        typeFilter !== "all" &&
        r.type !== typeFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        r.facilityName.toLowerCase().includes(q) ||
        (r.number || "").toLowerCase().includes(q) ||
        (r.facCode || "").toLowerCase().includes(q)
      );
    });
  }, [authRows, typeFilter, authSearch]);

  if (!stats) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  // The auth log is append-only and already 500+ rows; render it in pages.
  const visibleAuthRows = filteredAuthRows.slice(0, (page + 1) * AUTH_PAGE_SIZE);

  // Filter chips: "All standalone" + each non-Use/Possession type that has at
  // least one record, then Use/Possession and All-types escape hatches.
  const typeChips: { key: string; label: string; count: number }[] = [
    { key: "standalone", label: "All standalone", count: stats.otherTotal },
    ...LICENCE_TYPES.filter(
      (t) => !isUseP(t) && (stats.issuedByType[t] || 0) > 0,
    ).map((t) => ({
      key: t,
      label: SHORT_TYPE[t] || t,
      count: stats.issuedByType[t] || 0,
    })),
    { key: "use", label: "Use/Possession", count: stats.useTotal },
    { key: "all", label: "All types", count: stats.totalIssued },
  ];

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
    <div className="space-y-4 staggered">
      <PageHeader
        title="Authorisations"
        subtitle="Every licence issued — renewals, new use/possession and standalone authorisations — and who holds a current use licence."
        actions={
          <div className="flex items-center gap-2">
            <span className="caps text-[10px] text-gunmetal/55">
              Licence year
            </span>
            <div className="seg">
              <button
                className="seg-btn"
                onClick={() => setYear((y) => y - 1)}
                disabled={year <= MIN_YEAR}
                aria-label="Previous year"
              >
                ‹
              </button>
              <span className="px-2 py-1 text-sm font-black tabular self-center">
                {year}
              </span>
              <button
                className="seg-btn"
                onClick={() => setYear((y) => y + 1)}
                disabled={year >= CURRENT_YEAR + 1}
                aria-label="Next year"
              >
                ›
              </button>
            </div>
          </div>
        }
      />

      {/* Totals — renewal + import + transit + every other type */}
      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
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

      {/* Itemized authorisations — which facility holds which licence */}
      <Panel
        title={`Authorisations on record — ${filteredAuthRows.length} shown`}
        flush
      >
        <div className="px-4 sm:px-5 space-y-3">
          <input
            className="input"
            placeholder="Search facility, number, FAC…"
            aria-label="Search authorisations"
            value={authSearch}
            onChange={(e) => {
              setAuthSearch(e.target.value);
              setPage(0);
            }}
          />
          <div className="seg w-full">
            {typeChips.map((c) => (
              <button
                key={c.key}
                className="seg-btn"
                aria-pressed={typeFilter === c.key}
                onClick={() => {
                  setTypeFilter(c.key);
                  setPage(0);
                }}
              >
                {c.label} <span className="tabular opacity-70">{c.count}</span>
              </button>
            ))}
          </div>
        </div>

        {filteredAuthRows.length === 0 ? (
          <p className="px-4 sm:px-5 pt-4 text-sm text-gunmetal/60">
            {typeFilter === "standalone"
              ? "No standalone authorisations recorded yet. Import, transfer, variation and other non-use licences appear here once their RAIS email is accepted."
              : "No authorisations match this filter."}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block table-wrap mt-4">
              <table className="data tbl-sticky">
                <thead>
                  <tr>
                    <th>Facility</th>
                    <th>Licence type</th>
                    <th>Number</th>
                    <th>Province</th>
                    <th>Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAuthRows.map((r, i) => (
                    <tr key={`${r.facilityId}-${r.number || "x"}-${i}`}>
                      <td>
                        <Link
                          href={`/facilities/${r.facilityId}`}
                          className="font-bold text-[var(--rpa-green-dark)] hover:underline"
                        >
                          {r.facilityName}
                        </Link>
                        <div className="text-[11px] text-gunmetal/55 tabular">
                          {r.facCode || "—"}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`chip ${isUseP(r.type) ? "green" : "slate"}`}
                        >
                          {SHORT_TYPE[r.type] || r.type}
                        </span>
                      </td>
                      <td className="tabular">{r.number || "—"}</td>
                      <td>{r.province}</td>
                      <td className="tabular text-gunmetal/70">
                        {r.when || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone list */}
            <ul className="md:hidden divide-y divide-gunmetal/8 mt-4">
              {visibleAuthRows.map((r, i) => (
                <li
                  key={`${r.facilityId}-${r.number || "x"}-${i}`}
                  className="px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/facilities/${r.facilityId}`}
                      className="font-bold text-[var(--rpa-green-dark)] leading-tight break-words min-w-0"
                    >
                      {r.facilityName}
                    </Link>
                    <span className="text-xs tabular text-gunmetal/55 shrink-0">
                      {r.when || "—"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`chip ${isUseP(r.type) ? "green" : "slate"}`}
                    >
                      {SHORT_TYPE[r.type] || r.type}
                    </span>
                    <span className="text-xs tabular text-gunmetal/70">
                      {r.number || "no number"}
                    </span>
                    <span className="text-xs text-gunmetal/55">
                      {r.province}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {visibleAuthRows.length < filteredAuthRows.length ? (
              <div className="p-3 text-center border-t border-gunmetal/8 mt-0">
                <button
                  className="btn btn-ghost"
                  onClick={() => setPage((p) => p + 1)}
                >
                  Load more ({filteredAuthRows.length - visibleAuthRows.length}{" "}
                  remaining)
                </button>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      {/* Who holds a current use licence this year */}
      <Panel
        title={`Use licence held — ${year}`}
        note="The licence year is read from each facility's most recent use/possession licence date. Facilities seeded before date tracking show under “renewal not yet confirmed” until their next dated renewal is recorded."
      >
        <div className="stat-grid grid-cols-1 sm:grid-cols-3">
          <Kpi
            label={`Licensed (${year})`}
            value={stats.licensedThisYear.toLocaleString()}
            accent="green"
            caption="Use/possession licence dated this year"
          />
          <Kpi
            label="Renewal not yet confirmed"
            value={stats.licensedYearUnconfirmed.toLocaleString()}
            accent="amber"
            caption="Licensed, but newest use licence predates the year or is undated"
          />
          <Kpi
            label="Not licensed"
            value={stats.notLicensed.toLocaleString()}
            accent="red"
            caption="No current use licence — see pipeline below"
          />
        </div>
      </Panel>

      {/* Renewal pipeline for the unlicensed */}
      {stageRows.length === 0 ? (
        <Panel title="Renewal pipeline">
          <p className="text-sm text-gunmetal/60">
            Every facility holds a use licence.
          </p>
        </Panel>
      ) : (
        <Panel
          title="Renewal pipeline — where the unlicensed facilities are"
          action={
            <Link className="link-action" href="/facilities">
              View facilities →
            </Link>
          }
        >
          <Bars title="" rows={stageRows} showCounts bare />
        </Panel>
      )}
    </div>
  );
}
