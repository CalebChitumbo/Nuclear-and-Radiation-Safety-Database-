"use client";

import { memo, useCallback, useMemo, useState } from "react";

import { PageHeader, Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
import { downloadTextFile } from "@/components/downloadFile";
import { norm } from "@/lib/rules/matching";
import {
  SOURCE_CATEGORIES,
  categorizeEquipment,
  isSerialProvided,
  loadSourceInventory,
  sourceInventoryToCsv,
  statusGroup,
  summarizeInventory,
  type SourceCategory,
  type SourceInventorySeed,
  type SourceRecord,
  type StatusGroup,
} from "@/lib/rules/sourceInventory";
import seed from "@/seed/source-inventory-2026.seed.json";

/**
 * Source Inventory — the radiation sources and radiation-emitting devices held
 * by the facilities catalogued in the field verification exercise (Annex I of
 * the Activity Report on the Source Inventory Programme). It is a read-only
 * register: the figures, category breakdown and the searchable list are all
 * derived from the same detail rows, so any count reconciles with a filter of
 * the table below.
 */

// Loaded once at module scope — the annex is fixed reference data, so it lives
// in this route's chunk rather than behind an async store read.
const INVENTORY = loadSourceInventory(seed as SourceInventorySeed);
const META = (seed as SourceInventorySeed).meta;
const SUMMARY = summarizeInventory(INVENTORY);
const MAX_CATEGORY = Math.max(1, ...SUMMARY.byCategory.map((c) => c.count));

const STATUS_FILTERS: { value: "all" | StatusGroup; label: string }[] = [
  { value: "all", label: "All" },
  { value: "In Use", label: "In use" },
  { value: "Not In Use", label: "Not in use" },
  { value: "Unspecified", label: "Unspecified" },
];

const PAGE_SIZE = 50;

export default function SourceInventoryPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"" | SourceCategory>("");
  const [status, setStatus] = useState<"all" | StatusGroup>("all");
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Normalise each row's search haystack once, not per keystroke.
  const indexed = useMemo(
    () =>
      INVENTORY.map((r) => ({
        r,
        category: categorizeEquipment(r.equipmentType),
        group: statusGroup(r.status),
        hay: [r.facility, r.equipmentType, r.serialNumber, r.status]
          .map(norm)
          .join(" "),
      })),
    [],
  );

  const filtered = useMemo(() => {
    const q = norm(search);
    return indexed
      .filter(({ r, category: c, group, hay }) => {
        if (category && c !== category) return false;
        if (status !== "all" && group !== status) return false;
        return !q || hay.includes(q);
      })
      .map(({ r }) => r);
  }, [indexed, search, category, status]);

  const exportCsv = useCallback(() => {
    downloadTextFile(
      `rpa-source-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      sourceInventoryToCsv(filtered),
    );
  }, [filtered]);

  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE);

  const activeFilters =
    (category ? 1 : 0) + (status !== "all" ? 1 : 0);

  const resetFilters = () => {
    setCategory("");
    setStatus("all");
    setPage(0);
  };

  const pickCategory = (c: SourceCategory) => {
    setCategory((prev) => (prev === c ? "" : c));
    setPage(0);
  };

  const notInUse = SUMMARY.total - SUMMARY.inUse;

  return (
    <div className="space-y-4 staggered">
      <PageHeader
        eyebrow={META.annexReference}
        title="Source Inventory"
        subtitle={`${SUMMARY.total} radiation sources and radiation-emitting devices across ${SUMMARY.facilities} facilities — field verification ${META.exercisePeriod}.`}
        actions={
          <button
            className="btn btn-secondary flex-1 sm:flex-none"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title="Download the current filtered view as CSV"
          >
            ⬇ CSV ({filtered.length})
          </button>
        }
      />

      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
        <div className="stat">
          <div className="stat-label">Sources & devices</div>
          <div className="stat-value">{SUMMARY.total}</div>
          <div className="stat-caption">recorded items</div>
        </div>
        <div className="stat">
          <div className="stat-label">Facilities</div>
          <div className="stat-value">{SUMMARY.facilities}</div>
          <div className="stat-caption">establishments holding sources</div>
        </div>
        <div className="stat">
          <div className="stat-label">In use</div>
          <div className="stat-value text-[var(--rpa-green-dark)]">
            {SUMMARY.inUse}
          </div>
          <div className="stat-caption">{notInUse} not in use / unspecified</div>
        </div>
        <div className="stat">
          <div className="stat-label">Radioactive sources</div>
          <div className="stat-value">{SUMMARY.radioactiveSources}</div>
          <div className="stat-caption">sealed sources &amp; gauges</div>
        </div>
      </section>

      <Panel
        title="By equipment category"
        note="Tap a category to filter the list below."
      >
        <ul className="mt-1 space-y-1.5">
          {SUMMARY.byCategory.map(({ category: c, count }) => {
            const active = category === c;
            return (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => pickCategory(c)}
                  aria-pressed={active}
                  className="w-full text-left rounded-lg px-2 py-1.5 transition-colors"
                  style={{
                    background: active ? "rgba(0,160,80,0.10)" : "transparent",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={`text-sm ${active ? "font-black" : "font-bold"}`}
                    >
                      {c}
                    </span>
                    <span className="tabular font-black shrink-0">{count}</span>
                  </div>
                  <div
                    className="mt-1 h-1.5 rounded-full overflow-hidden"
                    style={{ background: "rgba(26,27,29,0.06)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / MAX_CATEGORY) * 100}%`,
                        background: active
                          ? "var(--rpa-green-dark)"
                          : "var(--rpa-green, #00A050)",
                      }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="source-search" className="field-label">
              Search{" "}
              <span className="text-gunmetal/45">
                ({filtered.length} of {SUMMARY.total})
              </span>
            </label>
            <input
              id="source-search"
              className="input"
              placeholder="facility, equipment, serial number…"
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
        </div>

        <div className={`${filtersOpen ? "block" : "hidden"} sm:block mt-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="field-label" htmlFor="source-category">
                Category
              </label>
              <select
                id="source-category"
                className="input"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as SourceCategory | "");
                  setPage(0);
                }}
              >
                <option value="">All categories</option>
                {SOURCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="field-label">Status</span>
              <Segmented
                ariaLabel="Status"
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(0);
                }}
                options={STATUS_FILTERS}
              />
            </div>
          </div>

          {activeFilters ? (
            <div className="mt-4">
              <button className="btn btn-ghost" onClick={resetFilters}>
                Clear filters
              </button>
            </div>
          ) : null}
        </div>
      </Panel>

      <section className="card bleed overflow-hidden">
        {/* Tablet & desktop: the full inventory table */}
        <div className="hidden md:block table-wrap">
          <table className="data tbl-sticky">
            <thead>
              <tr>
                <th className="num">No.</th>
                <th>Establishment / Facility</th>
                <th>Equipment</th>
                <th>Serial Number</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <SourceRow key={r.no} r={r} />
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gunmetal/55">
                    No sources match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Phone: each item is a row */}
        <ul className="md:hidden divide-y divide-gunmetal/8">
          {visible.map((r) => (
            <SourceCard key={r.no} r={r} />
          ))}
          {visible.length === 0 ? (
            <li className="py-10 px-4 text-center text-sm text-gunmetal/55">
              No sources match these filters.
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

      <p className="text-[11px] text-gunmetal/50 px-1">
        Source: {META.sourceDocument} — {META.annexReference}. Field verification
        conducted {META.exercisePeriod} by{" "}
        {META.preparedBy.join(" and ")}, {META.department}. {META.coverage}.
      </p>
    </div>
  );
}

/** In use → green, not in use → red, otherwise a neutral slate chip. */
function StatusChip({ status }: { status: string }) {
  const g = statusGroup(status);
  const cls =
    g === "In Use" ? "chip green" : g === "Not In Use" ? "chip red" : "chip slate";
  return <span className={cls}>{status}</span>;
}

const SourceRow = memo(function SourceRow({ r }: { r: SourceRecord }) {
  const provided = isSerialProvided(r.serialNumber);
  return (
    <tr>
      <td className="num tabular text-gunmetal/55">{r.no}</td>
      <td className="font-bold">{r.facility}</td>
      <td>
        <div>{r.equipmentType}</div>
        <div className="caps text-[10px] text-gunmetal/50 mt-0.5">
          {categorizeEquipment(r.equipmentType)}
        </div>
      </td>
      <td className={`tabular ${provided ? "" : "text-gunmetal/45 italic"}`}>
        {provided ? r.serialNumber : r.serialNumber || "—"}
      </td>
      <td>
        <StatusChip status={r.status} />
      </td>
    </tr>
  );
});

const SourceCard = memo(function SourceCard({ r }: { r: SourceRecord }) {
  const provided = isSerialProvided(r.serialNumber);
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold leading-tight break-words">{r.facility}</div>
          <div className="text-xs text-gunmetal/60 mt-0.5">
            {r.equipmentType}
            <span className="text-gunmetal/40">
              {" "}
              · {categorizeEquipment(r.equipmentType)}
            </span>
          </div>
        </div>
        <StatusChip status={r.status} />
      </div>
      <div className="mt-1 text-xs text-gunmetal/55 tabular">
        #{r.no} ·{" "}
        {provided ? (
          <>Serial {r.serialNumber}</>
        ) : (
          <span className="italic text-gunmetal/45">Serial not provided</span>
        )}
      </div>
    </li>
  );
});
