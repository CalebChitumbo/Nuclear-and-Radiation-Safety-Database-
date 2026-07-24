"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, memo, useCallback, useMemo, useState } from "react";

import { AddFacilityDialog } from "@/components/AddFacilityDialog";
import { FacilityDrawer } from "@/components/FacilityDrawer";
import { LoadErrorBanner } from "@/components/LoadError";
import { StatusPill } from "@/components/StatusPill";
import { downloadTextFile } from "@/components/downloadFile";
import { useAuth } from "@/lib/auth";
import { useStoreData } from "@/lib/storeHooks";
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
    async (s) => s.listFacilities(),
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

  const facilities: Facility[] = useMemo(() => data || [], [data]);
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
      facilitiesToCsv(filtered),
    );
  }, [filtered]);

  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE);
  const openFacility = useCallback((id: string) => setOpenId(id), []);

  return (
    <div className="space-y-4 staggered">
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}
      {stageFilter ? (
        <div className="card p-3 flex items-center gap-2 text-sm">
          <span className="caps text-[10px] text-gunmetal/60">
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
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="facility-search" className="caps text-[10px] text-gunmetal/60">
            Search ({initialLoading ? "…" : `${filtered.length} of ${facilities.length}`})
          </label>
          <input
            id="facility-search"
            className="input mt-1"
            placeholder="name, practice, district, FAC, licence number…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div>
          <label className="caps text-[10px] text-gunmetal/60">Province</label>
          <select
            className="input mt-1"
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
          <label className="caps text-[10px] text-gunmetal/60">Sector</label>
          <select
            className="input mt-1"
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
          <label className="caps text-[10px] text-gunmetal/60">Category</label>
          <select
            className="input mt-1"
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
        <div>
          <label className="caps text-[10px] text-gunmetal/60">Status</label>
          <div className="mt-1 inline-flex rounded-lg border border-gunmetal/10 overflow-hidden">
            {(["all", "licensed", "unlicensed"] as Filter[]).map((f) => (
              <button
                key={f}
                aria-pressed={statusFilter === f}
                onClick={() => {
                  setStatusFilter(f);
                  setPage(0);
                }}
                className="px-3 py-2 text-xs caps font-bold"
                style={{
                  background:
                    statusFilter === f ? "var(--rpa-green)" : "transparent",
                  color: statusFilter === f ? "white" : "var(--gunmetal)",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="caps text-[10px] text-gunmetal/60">Operating</label>
          <div className="mt-1 inline-flex rounded-lg border border-gunmetal/10 overflow-hidden">
            {(
              [
                ["all", "All"],
                ["functional", "Functional"],
                ["non-functional", "Non-Functional"],
              ] as [FuncFilter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                aria-pressed={funcFilter === f}
                onClick={() => {
                  setFuncFilter(f);
                  setPage(0);
                }}
                className="px-3 py-2 text-xs caps font-bold"
                style={{
                  background:
                    funcFilter === f ? "var(--rpa-green)" : "transparent",
                  color: funcFilter === f ? "white" : "var(--gunmetal)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 pb-2">
          <label className="flex items-center gap-1.5 text-xs font-bold">
            <input
              type="checkbox"
              checked={onlyStalled}
              onChange={(e) => {
                setOnlyStalled(e.target.checked);
                setPage(0);
              }}
            />
            Stalled
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold">
            <input
              type="checkbox"
              checked={onlyReview}
              onChange={(e) => {
                setOnlyReview(e.target.checked);
                setPage(0);
              }}
            />
            Needs review
          </label>
        </div>
        <button
          className="btn btn-secondary"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          title="Download the current filtered view as CSV"
        >
          ⬇ CSV ({filtered.length})
        </button>
        {canEditAS ? (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Facility
          </button>
        ) : null}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tbl-sticky">
            <thead>
              <tr className="text-left text-xs caps text-gunmetal/55">
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Province</th>
                <th className="px-4 py-3">Practice</th>
                <th className="px-4 py-3">Sector / Category</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Stage / Licence</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((f) => (
                <FacilityRow key={f.id} f={f} onOpen={openFacility} />
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-gunmetal/55"
                  >
                    {initialLoading
                      ? "Loading the register…"
                      : "No facilities match these filters."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {visible.length < filtered.length ? (
          <div className="p-3 text-center border-t border-gunmetal/10">
            <button className="btn btn-ghost" onClick={() => setPage((p) => p + 1)}>
              Load more ({filtered.length - visible.length} remaining)
            </button>
          </div>
        ) : null}
      </div>

      <FacilityDrawer facilityId={openId} onClose={() => setOpenId(null)} />
      <AddFacilityDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

const FacilityRow = memo(function FacilityRow({
  f,
  onOpen,
}: {
  f: Facility;
  onOpen: (id: string) => void;
}) {
  const otherAuths = (f.auths || []).filter((a) => !isUseP(a.type));
  const usePAuths = (f.auths || []).filter((a) => isUseP(a.type));
  // Auths are appended chronologically — show the newest licence number, not
  // the original seeded one.
  const latestUseP = usePAuths[usePAuths.length - 1];
  return (
    <tr
      className="border-t border-gunmetal/8 hover:bg-mist cursor-pointer transition-colors"
      onClick={() => onOpen(f.id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(f.id);
      }}
    >
      <td className="px-4 py-3">
        <div className="font-bold">{f.name}</div>
        <div className="text-xs text-gunmetal/55 tabular">
          {f.facCode || "—"} · {f.district || "—"}
        </div>
        {f.functional === false || f.stalled || f.needsReview ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {f.functional === false ? (
              <span className="chip red text-[10px]">Non-Functional</span>
            ) : null}
            {f.stalled ? (
              <span
                className="chip amber text-[10px]"
                title="Earlier application with no 2026 activity"
              >
                Stalled
              </span>
            ) : null}
            {f.needsReview ? (
              <span
                className="chip amber text-[10px] cursor-help"
                title={f.reviewNote || "Imported with uncertainty — confirm this record"}
              >
                Check
              </span>
            ) : null}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3 tabular">{f.province}</td>
      <td className="px-4 py-3">{f.practice || "—"}</td>
      <td className="px-4 py-3">
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
      <td className="px-4 py-3">
        <StatusPill licensed={f.licensed} stage={f.stage} />
      </td>
      <td className="px-4 py-3">
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
      <td className="px-4 py-3 text-right">
        <Link
          href={`/facilities/${f.id}`}
          className="text-xs caps font-bold text-[var(--rpa-green-dark)]"
          onClick={(e) => e.stopPropagation()}
        >
          Permalink
        </Link>
      </td>
    </tr>
  );
});

function AuthBadge({
  count,
  items,
}: {
  count: number;
  items: string[];
}) {
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
