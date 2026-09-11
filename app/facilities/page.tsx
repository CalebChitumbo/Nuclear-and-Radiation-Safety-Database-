"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, memo, useCallback, useMemo, useState } from "react";

import { AddFacilityDialog } from "@/components/AddFacilityDialog";
import { FacilityDrawer } from "@/components/FacilityDrawer";
import { LoadErrorBanner } from "@/components/LoadError";
import { Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
import { StatusPill } from "@/components/StatusPill";
import { downloadTextFile } from "@/components/downloadFile";
import { EnforcementChip } from "@/components/inspectorate/InspectionDatabaseTable";
import { useAuth } from "@/lib/auth";
import { useStoreData } from "@/lib/storeHooks";
import {
  enforcementByFacility,
  type FacilityEnforcement,
} from "@/lib/rules/enforcementStatus";
import { facilitiesToCsv } from "@/lib/rules/exportCsv";
import { norm } from "@/lib/rules/matching";
import {
  CATEGORIES,
  PROVINCES,
  SECTORS,
  isUseP,
  type Facility,
  type FacilityCategory,
  type Province,
  type Sector,
} from "@/lib/rules/types";

type Filter = "all" | "licensed" | "unlicensed";
type FuncFilter = "all" | "functional" | "non-functional";

const PAGE_SIZE = 50;

export default function FacilitiesPage() {
  // useSearchParams needs a Suspense boundary during static prerender.
  return (
    <Suspense fallback={null}>
      <FacilitiesInner />
    </Suspense>
  );
}

function FacilitiesInner() {
  const { canEditAS } = useAuth();
  const { data, loading, error, reload } = useStoreData(
    async (s) => {
      const [facilities, inspections] = await Promise.all([
        s.listFacilities(),
        // The enforcement standing shown on each row comes from the
        // inspection register; the register itself must open without it.
        s.listInspections().catch(() => []),
      ]);
      return { facilities, inspections };
    },
    [],
  );
  // Deep-linkable filters (the Reports page links into pre-filtered views):
  // /facilities?lic=licensed&func=functional&cat=Medical&sector=Public
  //            &province=Lusaka&stalled=1&review=1
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [province, setProvince] = useState<"" | Province>(() => {
    const p = params.get("province");
    return (PROVINCES as readonly string[]).includes(p || "")
      ? (p as Province)
      : "";
  });
  const [sector, setSector] = useState<"" | Sector>(() => {
    const s = params.get("sector");
    return (SECTORS as readonly string[]).includes(s || "") ? (s as Sector) : "";
  });
  const [category, setCategory] = useState<"" | FacilityCategory>(() => {
    const c = params.get("cat");
    return (CATEGORIES as readonly string[]).includes(c || "")
      ? (c as FacilityCategory)
      : "";
  });
  const [statusFilter, setStatusFilter] = useState<Filter>(() => {
    const v = params.get("lic");
    return v === "licensed" || v === "unlicensed" ? v : "all";
  });
  const [funcFilter, setFuncFilter] = useState<FuncFilter>(() => {
    const v = params.get("func");
    return v === "functional" || v === "non-functional" ? v : "all";
  });
  const [onlyStalled, setOnlyStalled] = useState(params.get("stalled") === "1");
  const [onlyReview, setOnlyReview] = useState(params.get("review") === "1");
  // Exact-stage deep link (from the Reports page). No dropdown of its own —
  // it shows as a clearable chip while active.
  const [stageFilter, setStageFilter] = useState<string>(
    () => params.get("stage") || "",
  );
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // A phone can't show eight filter controls at once and still show results;
  // they fold away behind a toggle and open on demand.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const facilities: Facility[] = useMemo(() => data?.facilities || [], [data]);
  // What the Authority last did about each facility — a chip on the row, a
  // column on the export. See lib/rules/enforcementStatus.ts.
  const enforcement = useMemo(
    () => enforcementByFacility(data?.inspections || [], facilities),
    [data?.inspections, facilities],
  );
  const initialLoading = loading && !data;

  // Normalise each facility's search haystack once per data load, not five
  // norm() calls per facility per keystroke.
  const indexed = useMemo(
    () =>
      facilities.map((f) => ({
        f,
        hay: [
          f.nameLower,
          norm(f.practice),
          norm(f.district),
          norm(f.facCode),
          ...(f.auths || []).map((a) => norm(a.number)),
        ].join(" "),
      })),
    [facilities],
  );

  const filtered = useMemo(() => {
    const q = norm(search);
    return indexed
      .filter(({ f, hay }) => {
        if (province && f.province !== province) return false;
        if (sector && f.sector !== sector) return false;
        if (category && (f.category || "Medical") !== category) return false;
        if (statusFilter === "licensed" && !f.licensed) return false;
        if (statusFilter === "unlicensed" && f.licensed) return false;
        // Docs predating the functional flag count as operating.
        const functional = f.functional !== false;
        if (funcFilter === "functional" && !functional) return false;
        if (funcFilter === "non-functional" && functional) return false;
        if (onlyStalled && !f.stalled) return false;
        if (onlyReview && !f.needsReview) return false;
        if (stageFilter && f.stage !== stageFilter) return false;
        return !q || hay.includes(q);
      })
      .map(({ f }) => f);
  }, [
    indexed,
    search,
    province,
    sector,
    category,
    statusFilter,
    funcFilter,
    onlyStalled,
    onlyReview,
    stageFilter,
  ]);

  const exportCsv = useCallback(() => {
    downloadTextFile(
      `rpa-register-${new Date().toISOString().slice(0, 10)}.csv`,
      facilitiesToCsv(filtered, enforcement),
    );
  }, [filtered, enforcement]);

  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE);
  const openFacility = useCallback((id: string) => setOpenId(id), []);

  const activeFilters =
    (province ? 1 : 0) +
    (sector ? 1 : 0) +
    (category ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (funcFilter !== "all" ? 1 : 0) +
    (onlyStalled ? 1 : 0) +
    (onlyReview ? 1 : 0);

  const resetFilters = () => {
    setProvince("");
    setSector("");
    setCategory("");
    setStatusFilter("all");
    setFuncFilter("all");
    setOnlyStalled(false);
    setOnlyReview(false);
    setStageFilter("");
    setPage(0);
  };

  return (
    <div className="space-y-4 staggered">
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}

      <Panel>
        {/* Search always visible — it is what the register is used for */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="facility-search" className="field-label">
              Search{" "}
              <span className="text-gunmetal/45">
                (
                {initialLoading
                  ? "…"
                  : `${filtered.length} of ${facilities.length}`}
                )
              </span>
            </label>
            <input
              id="facility-search"
              className="input"
              placeholder="name, practice, district, FAC, licence no…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <button
            className="btn btn-secondary sm:hidden"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Filters{activeFilters ? ` · ${activeFilters}` : ""}
          </button>
          {canEditAS ? (
            <button
              className="btn btn-primary hidden sm:inline-flex"
              onClick={() => setAdding(true)}
            >
              + Facility
            </button>
          ) : null}
        </div>

        <div className={`${filtersOpen ? "block" : "hidden"} sm:block mt-4`}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="field-label" htmlFor="f-province">
                Province
              </label>
              <select
                id="f-province"
                className="input"
                value={province}
                onChange={(e) => {
                  setProvince(e.target.value as Province | "");
                  setPage(0);
                }}
              >
                <option value="">All</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="f-sector">
                Sector
              </label>
              <select
                id="f-sector"
                className="input"
                value={sector}
                onChange={(e) => {
                  setSector(e.target.value as Sector | "");
                  setPage(0);
                }}
              >
                <option value="">All</option>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="f-category">
                Category
              </label>
              <select
                id="f-category"
                className="input"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as FacilityCategory | "");
                  setPage(0);
                }}
              >
                <option value="">All</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-4 col-span-2 lg:col-span-1">
              <label className="flex items-center gap-2 text-xs font-bold py-2">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={onlyStalled}
                  onChange={(e) => {
                    setOnlyStalled(e.target.checked);
                    setPage(0);
                  }}
                />
                Stalled
              </label>
              <label className="flex items-center gap-2 text-xs font-bold py-2">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={onlyReview}
                  onChange={(e) => {
                    setOnlyReview(e.target.checked);
                    setPage(0);
                  }}
                />
                Needs review
              </label>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <span className="field-label">Status</span>
              <Segmented
                ariaLabel="Licensing status"
                value={statusFilter}
                onChange={(v) => {
                  setStatusFilter(v);
                  setPage(0);
                }}
                options={[
                  { value: "all", label: "All" },
                  { value: "licensed", label: "Licensed" },
                  { value: "unlicensed", label: "Unlicensed" },
                ]}
              />
            </div>
            <div>
              <span className="field-label">Operating</span>
              <Segmented
                ariaLabel="Operating state"
                value={funcFilter}
                onChange={(v) => {
                  setFuncFilter(v);
                  setPage(0);
                }}
                options={[
                  { value: "all", label: "All" },
                  { value: "functional", label: "Functional" },
                  { value: "non-functional", label: "Non-func." },
                ]}
              />
            </div>
          </div>

          {stageFilter ? (
            <div className="mt-3 flex items-center gap-2 flex-wrap text-sm">
              <span className="caps text-[10px] text-gunmetal/55">
                Stage filter
              </span>
              <span className="chip amber">{stageFilter}</span>
              <button
                className="btn btn-ghost text-xs"
                onClick={() => {
                  setStageFilter("");
                  setPage(0);
                }}
              >
                ✕ Clear
              </button>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn btn-secondary"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              title="Download the current filtered view as CSV"
            >
              ⬇ CSV ({filtered.length})
            </button>
            {activeFilters || stageFilter ? (
              <button className="btn btn-ghost" onClick={resetFilters}>
                Clear filters
              </button>
            ) : null}
            {canEditAS ? (
              <button
                className="btn btn-primary sm:hidden flex-1"
                onClick={() => setAdding(true)}
              >
                + Facility
              </button>
            ) : null}
          </div>
        </div>
      </Panel>

      <section className="card bleed overflow-hidden">
        {/* Tablet & desktop: the full register table */}
        <div className="hidden md:block table-wrap">
          <table className="data tbl-sticky">
            <thead>
              <tr>
                <th>Facility</th>
                <th>Province</th>
                <th>Practice</th>
                <th>Sector / Category</th>
                <th>Status</th>
                <th>Stage / Licence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((f) => (
                <FacilityRow
                  key={f.id}
                  f={f}
                  enforcement={enforcement.get(f.id)}
                  onOpen={openFacility}
                />
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gunmetal/55">
                    {initialLoading
                      ? "Loading the register…"
                      : "No facilities match these filters."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Phone: a seven-column table is unusable, so each facility is a row */}
        <ul className="md:hidden divide-y divide-gunmetal/8">
          {visible.map((f) => (
            <FacilityCard
              key={f.id}
              f={f}
              enforcement={enforcement.get(f.id)}
              onOpen={openFacility}
            />
          ))}
          {visible.length === 0 ? (
            <li className="py-10 px-4 text-center text-sm text-gunmetal/55">
              {initialLoading
                ? "Loading the register…"
                : "No facilities match these filters."}
            </li>
          ) : null}
        </ul>

        {visible.length < filtered.length ? (
          <div className="p-3 text-center border-t border-gunmetal/8">
            <button
              className="btn btn-ghost"
              onClick={() => setPage((p) => p + 1)}
            >
              Load more ({filtered.length - visible.length} remaining)
            </button>
          </div>
        ) : null}
      </section>

      <FacilityDrawer facilityId={openId} onClose={() => setOpenId(null)} />
      <AddFacilityDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

/** The flags a facility carries beyond its licensing status. */
function Flags({
  f,
  enforcement,
  small,
}: {
  f: Facility;
  enforcement?: FacilityEnforcement;
  small?: boolean;
}) {
  if (f.functional !== false && !f.stalled && !f.needsReview && !enforcement) {
    return null;
  }
  const size = small ? "text-[10px]" : "";
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {f.functional === false ? (
        <span className={`chip red ${size}`}>Non-Functional</span>
      ) : null}
      {/* The latest enforcement action on the inspection register — so a
          suspended or closed practice never reads as plain "no application". */}
      {enforcement ? (
        <span
          className={size}
          title={`${enforcement.action}${enforcement.date ? ` on ${enforcement.date}` : ""} — recorded on the Inspectorate tab`}
        >
          <EnforcementChip action={enforcement.action} />
        </span>
      ) : null}
      {f.stalled ? (
        <span
          className={`chip amber ${size}`}
          title="Earlier application with no 2026 activity"
        >
          Stalled
        </span>
      ) : null}
      {f.needsReview ? (
        <span
          className={`chip amber ${size} cursor-help`}
          title={f.reviewNote || "Imported with uncertainty — confirm this record"}
        >
          Check
        </span>
      ) : null}
    </div>
  );
}

const FacilityCard = memo(function FacilityCard({
  f,
  enforcement,
  onOpen,
}: {
  f: Facility;
  enforcement?: FacilityEnforcement;
  onOpen: (id: string) => void;
}) {
  const usePAuths = (f.auths || []).filter((a) => isUseP(a.type));
  const latestUseP = usePAuths[usePAuths.length - 1];
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(f.id)}
        className="w-full text-left px-4 py-3 card-hover"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold leading-tight break-words">{f.name}</div>
            <div className="text-xs text-gunmetal/55 tabular mt-0.5">
              {f.facCode || "—"} · {f.district || "—"} · {f.province}
            </div>
          </div>
          <StatusPill
            licensed={f.licensed}
            stage={f.stage}
            className="shrink-0"
          />
        </div>
        <div className="mt-1.5 text-xs text-gunmetal/70">
          {f.licensed ? (
            <span className="font-bold text-[var(--rpa-green-dark)] tabular">
              {latestUseP?.number || "Licensed"}
            </span>
          ) : (
            <span>{f.currentStatus || f.stage}</span>
          )}
          {f.practice ? (
            <span className="text-gunmetal/50"> · {f.practice}</span>
          ) : null}
        </div>
        <Flags f={f} enforcement={enforcement} small />
      </button>
    </li>
  );
});

const FacilityRow = memo(function FacilityRow({
  f,
  enforcement,
  onOpen,
}: {
  f: Facility;
  enforcement?: FacilityEnforcement;
  onOpen: (id: string) => void;
}) {
  const otherAuths = (f.auths || []).filter((a) => !isUseP(a.type));
  const usePAuths = (f.auths || []).filter((a) => isUseP(a.type));
  // Auths are appended chronologically — show the newest licence number, not
  // the original seeded one.
  const latestUseP = usePAuths[usePAuths.length - 1];
  return (
    <tr
      className="row-hover cursor-pointer"
      onClick={() => onOpen(f.id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(f.id);
      }}
    >
      <td>
        <div className="font-bold">{f.name}</div>
        <div className="text-xs text-gunmetal/55 tabular">
          {f.facCode || "—"} · {f.district || "—"}
        </div>
        <Flags f={f} enforcement={enforcement} small />
      </td>
      <td className="tabular">{f.province}</td>
      <td>{f.practice || "—"}</td>
      <td>
        <div className="flex flex-wrap gap-1">
          <span className={`chip ${f.sector === "Public" ? "slate" : ""}`}>
            {f.sector}
          </span>
          <span
            className={`chip ${f.category === "Non-Medical" ? "" : "green"} text-[10px]`}
          >
            {f.category === "Non-Medical" ? "Non-Med" : "Medical"}
          </span>
        </div>
      </td>
      <td>
        <StatusPill licensed={f.licensed} stage={f.stage} />
      </td>
      <td>
        {f.licensed ? (
          <div>
            <div className="text-sm font-bold text-[var(--rpa-green-dark)]">
              {latestUseP?.number || "Licensed"}
            </div>
            {otherAuths.length > 0 ? (
              <AuthBadge
                count={otherAuths.length}
                items={otherAuths.map((a) => `${a.type} — ${a.number || "no #"}`)}
              />
            ) : null}
          </div>
        ) : (
          <div>
            {/* The precise RAIS status when the email engine has set one, else
                the coarse pipeline stage. */}
            <div className="text-sm">{f.currentStatus || f.stage}</div>
            {f.currentStatus ? (
              <div className="text-[11px] text-gunmetal/45">{f.stage}</div>
            ) : null}
            {otherAuths.length > 0 ? (
              <AuthBadge
                count={otherAuths.length}
                items={otherAuths.map((a) => `${a.type} — ${a.number || "no #"}`)}
              />
            ) : null}
          </div>
        )}
      </td>
      <td className="text-right">
        <Link
          href={`/facilities/${f.id}`}
          className="link-action"
          onClick={(e) => e.stopPropagation()}
        >
          Open
        </Link>
      </td>
    </tr>
  );
});

function AuthBadge({ count, items }: { count: number; items: string[] }) {
  return (
    <span
      className="chip slate mt-1 cursor-help"
      title={items.join("\n")}
      aria-label={items.join("; ")}
    >
      {count} auth.
    </span>
  );
}
