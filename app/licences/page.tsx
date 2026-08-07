"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Bars } from "@/components/Bars";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { useStoreData } from "@/lib/storeHooks";
import { computeLicenceStats } from "@/lib/rules/licenceStats";
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
  date: string;
  /** What the licence permits, when its own wording is on record. */
  scope: string;
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
        date: a.date,
        scope: a.scope || "",
      });
    }
  }
  // Newest first; undated entries (the seed) sink to the bottom.
  return rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export default function LicencesPage() {
  const { data, loading, error, reload } = useStoreData(
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
        (r.facCode || "").toLowerCase().includes(q) ||
        r.scope.toLowerCase().includes(q)
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
    ).map((t) => ({ key: t, label: SHORT_TYPE[t] || t, count: stats.issuedByType[t] || 0 })),
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
    <div className="space-y-6 staggered">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">Authorisations</h1>
          <p className="text-sm text-gunmetal/60">
            Authorisation statistics built from the facilities register — every
            licence issued (renewals, new use/possession, standalone
            authorisations) and who holds a current use licence.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="caps text-[10px] text-gunmetal/60">Licence year</span>
          <div className="inline-flex items-center rounded-lg border border-gunmetal/10 overflow-hidden">
            <button
              className="px-3 py-2 text-sm font-bold disabled:opacity-30"
              onClick={() => setYear((y) => y - 1)}
              disabled={year <= MIN_YEAR}
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

      {/* Itemized authorisations — which facility holds which licence */}
      <section className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-gunmetal/8 flex flex-wrap items-center justify-between gap-3">
          <div className="font-black">
            Authorisations on record
            <span className="text-xs text-gunmetal/55 font-normal ml-2">
              {filteredAuthRows.length} shown
            </span>
          </div>
          <input
            className="input max-w-[260px]"
            placeholder="facility, number, FAC…"
            aria-label="Search authorisations"
            value={authSearch}
            onChange={(e) => {
              setAuthSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <div className="px-4 sm:px-5 py-3 flex flex-wrap gap-2 border-b border-gunmetal/8">
          {typeChips.map((c) => {
            const active = typeFilter === c.key;
            return (
              <button
                key={c.key}
                aria-pressed={active}
                onClick={() => {
                  setTypeFilter(c.key);
                  setPage(0);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                style={{
                  background: active ? "var(--rpa-green)" : "transparent",
                  color: active ? "white" : "var(--gunmetal)",
                  borderColor: active
                    ? "var(--rpa-green)"
                    : "rgba(26,27,29,0.12)",
                }}
              >
                {c.label}{" "}
                <span className="tabular opacity-70">{c.count}</span>
              </button>
            );
          })}
        </div>

        {filteredAuthRows.length === 0 ? (
          <div className="p-6 text-sm text-gunmetal/60">
            {typeFilter === "standalone"
              ? "No standalone authorisations recorded yet. Import, transfer, variation and other non-use licences appear here once their RAIS email is accepted."
              : "No authorisations match this filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tbl-sticky">
              <thead>
                <tr className="text-left text-xs caps text-gunmetal/55">
                  <th className="px-4 py-2">Facility</th>
                  <th className="px-4 py-2">Licence type</th>
                  <th className="px-4 py-2">Number</th>
                  <th className="px-4 py-2">Authorised scope</th>
                  <th className="px-4 py-2">Province</th>
                  <th className="px-4 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {visibleAuthRows.map((r, i) => (
                  <tr
                    key={`${r.facilityId}-${r.number || "x"}-${i}`}
                    className="border-t border-gunmetal/8 align-top"
                  >
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <span
                        className={`chip ${isUseP(r.type) ? "green" : "slate"}`}
                      >
                        {SHORT_TYPE[r.type] || r.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular">{r.number || "—"}</td>
                    <td className="px-4 py-3 text-[11px] text-gunmetal/70 max-w-[320px]">
                      {r.scope || "—"}
                    </td>
                    <td className="px-4 py-3">{r.province}</td>
                    <td className="px-4 py-3 tabular text-gunmetal/70">
                      {r.date || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleAuthRows.length < filteredAuthRows.length ? (
              <div className="p-3 text-center border-t border-gunmetal/10">
                <button
                  className="btn btn-ghost"
                  onClick={() => setPage((p) => p + 1)}
                >
                  Load more ({filteredAuthRows.length - visibleAuthRows.length}{" "}
                  remaining)
                </button>
              </div>
            ) : null}
          </div>
        )}
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
