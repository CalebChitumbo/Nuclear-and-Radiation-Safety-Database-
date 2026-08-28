"use client";

import { memo, useCallback, useMemo, useState } from "react";

import { PageHeader, Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
import { downloadTextFile } from "@/components/downloadFile";
import { norm } from "@/lib/rules/matching";
import {
  GENERATOR_FAMILIES,
  SEALED_CATEGORY_LABELS,
  UNCATEGORISED,
  generatorFamily,
  isSerialRecorded,
  loadRaisInventory,
  nuclideLabel,
  raisInventoryToCsv,
  sealedCategoryLabel,
  summarizeRaisInventory,
  type GeneratorFamily,
  type RaisInventorySeed,
  type RaisKind,
  type RaisRecord,
} from "@/lib/rules/raisInventory";
import seed from "@/seed/rais-source-inventory.seed.json";

/**
 * Source Inventory — the national register of radiation generators and sealed
 * sources as held in RAIS, the Authority's system of record. Its companion,
 * Verified Source Inventory (`/verified-source-inventory`), holds the items the
 * field team physically confirmed; this tab is everything on the books.
 *
 * It is a read-only register. Every figure is derived from the same detail
 * rows, so each count reconciles with a filter of the table below — including
 * the register-gap figures, which are counts of items RAIS cannot fully
 * describe rather than a separate audit.
 */

// Loaded once at module scope — the RAIS export is fixed reference data, so it
// lives in this route's chunk rather than behind an async store read.
const INVENTORY = loadRaisInventory(seed as RaisInventorySeed);
const META = (seed as RaisInventorySeed).meta;
const SUMMARY = summarizeRaisInventory(INVENTORY);

const MAX_FAMILY = Math.max(1, ...SUMMARY.byFamily.map((f) => f.count));
const MAX_NUCLIDE = Math.max(1, ...SUMMARY.byNuclide.map((n) => n.count));

const KIND_FILTERS: { value: "all" | RaisKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Radiation Generator", label: "Generators" },
  { value: "Sealed Source", label: "Sources" },
];

/**
 * One select drives both breakdowns, because a generator family and a nuclide
 * are never both meaningful for the same row. The prefix says which axis the
 * value belongs to, so the filter stays a single piece of state.
 */
type Grouping = "" | `family:${string}` | `nuclide:${string}`;

const PAGE_SIZE = 50;

export default function SourceInventoryPage() {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | RaisKind>("all");
  const [grouping, setGrouping] = useState<Grouping>("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Normalise each row's search haystack once, not per keystroke.
  const indexed = useMemo(
    () =>
      INVENTORY.map((r) => ({
        r,
        family:
          r.kind === "Radiation Generator" ? generatorFamily(r.type) : null,
        nuclide: r.kind === "Sealed Source" ? nuclideLabel(r) : null,
        category: r.kind === "Sealed Source" ? sealedCategoryLabel(r) : null,
        hay: [
          r.ran,
          r.type,
          r.manufacturer,
          r.model,
          r.serialNumber,
          r.nuclide || "",
          r.activity || "",
        ]
          .map(norm)
          .join(" "),
      })),
    [],
  );

  const filtered = useMemo(() => {
    const q = norm(search);
    return indexed
      .filter((row) => {
        if (kind !== "all" && row.r.kind !== kind) return false;
        if (grouping.startsWith("family:")) {
          if (row.family !== grouping.slice("family:".length)) return false;
        } else if (grouping.startsWith("nuclide:")) {
          if (row.nuclide !== grouping.slice("nuclide:".length)) return false;
        }
        if (category && row.category !== category) return false;
        return !q || row.hay.includes(q);
      })
      .map(({ r }) => r);
  }, [indexed, search, kind, grouping, category]);

  const exportCsv = useCallback(() => {
    downloadTextFile(
      `rpa-rais-source-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      raisInventoryToCsv(filtered),
    );
  }, [filtered]);

  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE);

  const activeFilters =
    (kind !== "all" ? 1 : 0) + (grouping ? 1 : 0) + (category ? 1 : 0);

  const resetFilters = () => {
    setKind("all");
    setGrouping("");
    setCategory("");
    setPage(0);
  };

  // Picking a family or a nuclide also narrows the kind, so the list and the
  // breakdown the click came from always agree. Clicking the active row again
  // clears both.
  const pickFamily = (family: GeneratorFamily) => {
    const next: Grouping = `family:${family}`;
    const off = grouping === next;
    setGrouping(off ? "" : next);
    setKind(off ? "all" : "Radiation Generator");
    setCategory("");
    setPage(0);
  };

  const pickNuclide = (nuclide: string) => {
    const next: Grouping = `nuclide:${nuclide}`;
    const off = grouping === next;
    setGrouping(off ? "" : next);
    setKind(off ? "all" : "Sealed Source");
    setPage(0);
  };

  const pickCategory = (value: string) => {
    const off = category === value;
    setCategory(off ? "" : value);
    setKind(off ? "all" : "Sealed Source");
    setPage(0);
  };

  const { dataQuality: gaps } = SUMMARY;
  const showGenerators = kind !== "Sealed Source";
  const showSources = kind !== "Radiation Generator";

  return (
    <div className="space-y-4 staggered">
      <PageHeader
        eyebrow={META.system}
        title="Source Inventory"
        subtitle={`${SUMMARY.total} radiation generators and sealed sources on the national register${
          META.exportedOn ? ` — RAIS export of ${META.exportedOn}` : ""
        }.`}
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
          <div className="stat-label">Registered items</div>
          <div className="stat-value">{SUMMARY.total}</div>
          <div className="stat-caption">generators &amp; sealed sources</div>
        </div>
        <div className="stat">
          <div className="stat-label">Radiation generators</div>
          <div className="stat-value">{SUMMARY.generators}</div>
          <div className="stat-caption">
            {gaps.missingType} with no type recorded
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Sealed sources</div>
          <div className="stat-value">{SUMMARY.sealedSources}</div>
          <div className="stat-caption">
            {SUMMARY.distinctNuclides} distinct nuclides
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Security significant</div>
          <div className="stat-value text-[var(--rpa-green-dark)]">
            {SUMMARY.securitySignificant}
          </div>
          <div className="stat-caption">IAEA Category 1–3 sources</div>
        </div>
      </section>

      <Panel>
        <span className="field-label">Register</span>
        <Segmented
          ariaLabel="Register"
          value={kind}
          onChange={(v) => {
            setKind(v);
            // The other axis' grouping no longer applies once the kind flips.
            if (v === "Radiation Generator") {
              if (grouping.startsWith("nuclide:")) setGrouping("");
              setCategory("");
            }
            if (v === "Sealed Source" && grouping.startsWith("family:")) {
              setGrouping("");
            }
            setPage(0);
          }}
          options={KIND_FILTERS}
        />
      </Panel>

      {showGenerators ? (
        <Panel
          title="Radiation generators by type"
          note="Tap a family to filter the list below."
        >
          <ul className="mt-1 space-y-1.5">
            {SUMMARY.byFamily.map(({ family, count }) => (
              <BreakdownRow
                key={family}
                label={family}
                count={count}
                max={MAX_FAMILY}
                active={grouping === `family:${family}`}
                muted={family === "Type Not Recorded"}
                onClick={() => pickFamily(family)}
              />
            ))}
          </ul>
        </Panel>
      ) : null}

      {showSources ? (
        <>
          <Panel
            title="Sealed sources by nuclide"
            note="Tap a nuclide to filter the list below."
          >
            <ul className="mt-1 space-y-1.5">
              {SUMMARY.byNuclide.map(({ nuclide, count }) => (
                <BreakdownRow
                  key={nuclide}
                  label={nuclide}
                  count={count}
                  max={MAX_NUCLIDE}
                  active={grouping === `nuclide:${nuclide}`}
                  muted={nuclide === "Not recorded"}
                  onClick={() => pickNuclide(nuclide)}
                />
              ))}
            </ul>
          </Panel>

          <Panel
            title="By IAEA source category"
            note="Categories 1–3 are the security-significant sources the Code of Conduct expects to be tracked individually."
          >
            <div className="flex flex-wrap gap-2 mt-1">
              {SUMMARY.byCategory.map(({ category: c, count }) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickCategory(c)}
                  aria-pressed={category === c}
                  className="text-left rounded-lg px-3 py-2 border transition-colors"
                  style={{
                    borderColor:
                      category === c ? "var(--rpa-green-dark)" : "var(--line)",
                    background:
                      category === c ? "rgba(0,160,80,0.10)" : "transparent",
                  }}
                >
                  <div className="caps text-[10px] text-gunmetal/55">{c}</div>
                  <div className="tabular font-black text-lg leading-tight">
                    {count}
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </>
      ) : null}

      <Panel
        title="Register gaps"
        note="Fields RAIS carries but has never been given a value for — the difference between an item being registered and it being described."
      >
        <ul className="mt-1 divide-y divide-gunmetal/8">
          <GapRow
            label="Serial number not recorded"
            count={gaps.missingSerial}
            of={SUMMARY.total}
          />
          <GapRow
            label="Generator type not recorded"
            count={gaps.missingType}
            of={SUMMARY.generators}
          />
          <GapRow
            label="Nuclide not recorded"
            count={gaps.missingNuclide}
            of={SUMMARY.sealedSources}
          />
          <GapRow
            label="Activity not recorded"
            count={gaps.missingActivity}
            of={SUMMARY.sealedSources}
          />
          <GapRow
            label="Source not categorised"
            count={gaps.uncategorisedSources}
            of={SUMMARY.sealedSources}
          />
          <GapRow
            label="Entered category contradicts the one RAIS calculated"
            count={gaps.categoryConflicts}
            of={SUMMARY.sealedSources}
          />
        </ul>
      </Panel>

      <Panel>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="rais-search" className="field-label">
              Search{" "}
              <span className="text-gunmetal/45">
                ({filtered.length} of {SUMMARY.total})
              </span>
            </label>
            <input
              id="rais-search"
              className="input"
              placeholder="RAN, manufacturer, model, serial, nuclide…"
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
              <label className="field-label" htmlFor="rais-grouping">
                Type / nuclide
              </label>
              <select
                id="rais-grouping"
                className="input"
                value={grouping}
                onChange={(e) => {
                  const next = e.target.value as Grouping;
                  setGrouping(next);
                  if (next.startsWith("family:")) {
                    setKind("Radiation Generator");
                    setCategory("");
                  }
                  if (next.startsWith("nuclide:")) setKind("Sealed Source");
                  setPage(0);
                }}
              >
                <option value="">All types &amp; nuclides</option>
                {showGenerators ? (
                  <optgroup label="Radiation generators">
                    {GENERATOR_FAMILIES.map((f) => (
                      <option key={f} value={`family:${f}`}>
                        {f}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {showSources ? (
                  <optgroup label="Sealed sources">
                    {SUMMARY.byNuclide.map(({ nuclide }) => (
                      <option key={nuclide} value={`nuclide:${nuclide}`}>
                        {nuclide}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="rais-category">
                IAEA category{" "}
                <span className="text-gunmetal/45">(sealed sources)</span>
              </label>
              <select
                id="rais-category"
                className="input"
                value={category}
                disabled={kind === "Radiation Generator"}
                onChange={(e) => {
                  setCategory(e.target.value);
                  if (e.target.value) setKind("Sealed Source");
                  setPage(0);
                }}
              >
                <option value="">All categories</option>
                {SEALED_CATEGORY_LABELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
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
        {/* Tablet & desktop: the full register table */}
        <div className="hidden md:block table-wrap">
          <table className="data tbl-sticky">
            <thead>
              <tr>
                <th>RAN</th>
                <th>Item</th>
                <th>Manufacturer / Model</th>
                <th>Serial Number</th>
                <th>Activity / Category</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <RaisRow key={r.ran} r={r} />
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gunmetal/55">
                    No registered items match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Phone: each item is a row */}
        <ul className="md:hidden divide-y divide-gunmetal/8">
          {visible.map((r) => (
            <RaisCard key={r.ran} r={r} />
          ))}
          {visible.length === 0 ? (
            <li className="py-10 px-4 text-center text-sm text-gunmetal/55">
              No registered items match these filters.
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
        Source: {META.sourceDocument}, {META.system}
        {META.exportedOn ? `, exported ${META.exportedOn}` : ""}.{" "}
        {META.coverage}. Held by the {META.department}. Values are reproduced as
        registered — see Verified Source Inventory for the items confirmed in
        the field.
      </p>
    </div>
  );
}

/** A click-to-filter row with a proportional bar, shared by both breakdowns. */
function BreakdownRow({
  label,
  count,
  max,
  active,
  muted,
  onClick,
}: {
  label: string;
  count: number;
  max: number;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="w-full text-left rounded-lg px-2 py-1.5 transition-colors"
        style={{ background: active ? "rgba(0,160,80,0.10)" : "transparent" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={`text-sm ${active ? "font-black" : "font-bold"} ${
              muted ? "text-gunmetal/55 italic" : ""
            }`}
          >
            {label}
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
              width: `${(count / max) * 100}%`,
              background: muted
                ? "rgba(26,27,29,0.25)"
                : active
                  ? "var(--rpa-green-dark)"
                  : "var(--rpa-green, #00A050)",
            }}
          />
        </div>
      </button>
    </li>
  );
}

/** One register-gap line: the count, and what share of its register it is. */
function GapRow({
  label,
  count,
  of,
}: {
  label: string;
  count: number;
  of: number;
}) {
  const share = of > 0 ? Math.round((count / of) * 100) : 0;
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-sm">{label}</span>
      <span className="shrink-0 tabular text-sm">
        <span className={`font-black ${count === 0 ? "text-gunmetal/40" : ""}`}>
          {count}
        </span>
        <span className="text-gunmetal/45"> of {of}</span>
        {count > 0 ? (
          <span className="text-gunmetal/45"> · {share}%</span>
        ) : null}
      </span>
    </li>
  );
}

/** Category 1–3 read as the significant ones; 4–5 and uncategorised are quiet. */
function CategoryChip({ r }: { r: RaisRecord }) {
  const c = sealedCategoryLabel(r);
  if (c === UNCATEGORISED) {
    return <span className="chip slate">Not categorised</span>;
  }
  const significant = c === "Category 1" || c === "Category 2";
  return (
    <span className={significant ? "chip red" : c === "Category 3" ? "chip amber" : "chip green"}>
      {c}
    </span>
  );
}

/** The nuclide (sources) or the type and its family (generators). */
function ItemCell({ r }: { r: RaisRecord }) {
  if (r.kind === "Sealed Source") {
    const nuclide = nuclideLabel(r);
    const recorded = r.nuclide?.trim();
    return (
      <>
        <div className={recorded ? "" : "text-gunmetal/45 italic"}>
          {nuclide}
        </div>
        <div className="caps text-[10px] text-gunmetal/50 mt-0.5">
          Sealed source
        </div>
      </>
    );
  }
  return (
    <>
      <div className={r.type ? "" : "text-gunmetal/45 italic"}>
        {r.type || "Type not recorded"}
      </div>
      <div className="caps text-[10px] text-gunmetal/50 mt-0.5">
        {generatorFamily(r.type)}
      </div>
    </>
  );
}

const RaisRow = memo(function RaisRow({ r }: { r: RaisRecord }) {
  const recorded = isSerialRecorded(r.serialNumber);
  return (
    <tr>
      <td className="tabular font-bold whitespace-nowrap">{r.ran}</td>
      <td>
        <ItemCell r={r} />
      </td>
      <td>
        <div>{r.manufacturer || <span className="text-gunmetal/40">—</span>}</div>
        {r.model ? (
          <div className="text-[11px] text-gunmetal/55 mt-0.5">{r.model}</div>
        ) : null}
      </td>
      <td className={`tabular ${recorded ? "" : "text-gunmetal/45 italic"}`}>
        {recorded ? r.serialNumber : r.serialNumber || "—"}
      </td>
      <td>
        {r.kind === "Sealed Source" ? (
          <div className="space-y-1">
            <div className="tabular text-[11px]">
              {r.activity || (
                <span className="text-gunmetal/45 italic">
                  Activity not recorded
                </span>
              )}
              {r.activityDate ? (
                <span className="text-gunmetal/45"> · {r.activityDate}</span>
              ) : null}
            </div>
            <CategoryChip r={r} />
          </div>
        ) : (
          <span className="text-gunmetal/35">—</span>
        )}
      </td>
    </tr>
  );
});

const RaisCard = memo(function RaisCard({ r }: { r: RaisRecord }) {
  const recorded = isSerialRecorded(r.serialNumber);
  const source = r.kind === "Sealed Source";
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold leading-tight break-words">
            {source ? nuclideLabel(r) : r.type || "Type not recorded"}
          </div>
          <div className="text-xs text-gunmetal/60 mt-0.5">
            {r.manufacturer || "Manufacturer not recorded"}
            {r.model ? <span className="text-gunmetal/40"> · {r.model}</span> : null}
          </div>
          {/* Only sources earn the right-hand chip, so the generator's family
              rides in the sub-line rather than squeezing the title. */}
          <div className="caps text-[10px] text-gunmetal/50 mt-0.5">
            {source ? "Sealed source" : generatorFamily(r.type)}
          </div>
        </div>
        {source ? <CategoryChip r={r} /> : null}
      </div>
      <div className="mt-1 text-xs text-gunmetal/55 tabular">
        {r.ran} ·{" "}
        {recorded ? (
          <>Serial {r.serialNumber}</>
        ) : (
          <span className="italic text-gunmetal/45">Serial not recorded</span>
        )}
        {source && r.activity ? <> · {r.activity}</> : null}
      </div>
    </li>
  );
});
