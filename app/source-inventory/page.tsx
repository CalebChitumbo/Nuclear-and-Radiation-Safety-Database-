"use client";

import { memo, useCallback, useMemo, useState } from "react";

import { LoadErrorBanner } from "@/components/LoadError";
import { PageHeader, Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
import { downloadTextFile } from "@/components/downloadFile";
import {
  InventoryEditDrawer,
  type EditField,
} from "@/components/inventory/InventoryEditDrawer";
import { useInventoryEditing } from "@/components/inventory/useInventoryEditing";
import { norm } from "@/lib/rules/matching";
import { GAP_CATEGORIES } from "@/lib/rules/sourceCategories";
import { mergeRaisInventory } from "@/lib/rules/inventoryEdits";
import {
  GENERATOR_FAMILIES,
  IAEA_CATEGORIES,
  RAIS_KINDS,
  generatorFamilyOf,
  isSerialRecorded,
  loadRaisInventory,
  nuclideLabel,
  raisInventoryToCsv,
  summarizeRaisInventory,
  type GeneratorFamily,
  type RaisInventorySeed,
  type RaisKind,
  type RaisRecord,
} from "@/lib/rules/raisInventory";
import {
  HOLDER_NOT_RECORDED,
  holderFor,
  holderSearchText,
  loadSourceHolders,
  locationLabel,
  summariseHolders,
  type ResolvedHolder,
  type SourceHoldersSeed,
} from "@/lib/rules/sourceHolders";
import seed from "@/seed/rais-source-inventory.seed.json";
import holderSeed from "@/seed/rais-source-holders.seed.json";

/**
 * Source Inventory — the national register of radiation generators and sealed
 * sources as held in RAIS, the Authority's system of record. Its companion,
 * Verified Source Inventory (`/verified-source-inventory`), holds the items the
 * field team physically confirmed; this tab is everything on the books.
 *
 * The RAIS export is the baseline and is never written to. Officers' own
 * corrections are stored as an overlay keyed by RAN and merged in here, so a
 * re-export refreshes all 1,752 rows without discarding a correction, and every
 * figure below is computed from the merged register rather than from the seed.
 */

// The seed is loaded once at module scope — it is fixed reference data, so it
// lives in this route's chunk rather than behind an async store read. Only the
// (small) overlay of corrections comes from the store.
const BASELINE = loadRaisInventory(seed as RaisInventorySeed);
const BASELINE_BY_RAN = new Map(BASELINE.map((r) => [r.ran, r]));
const META = (seed as RaisInventorySeed).meta;

// Who holds each item, joined on by RAN. A second RAIS export (see
// `lib/rules/sourceHolders.ts`) and, like the register itself, fixed reference
// data that lives in this route's chunk rather than behind a store read — the
// facilities collection is Licensing's and the Inspectorate's to read, and this
// tab is the National Source Inventory's.
const HOLDERS = loadSourceHolders(holderSeed as SourceHoldersSeed);
const HOLDER_META = (holderSeed as SourceHoldersSeed).meta;

/** How many facilities the "held by" panel lists before "show all". */
const FACILITY_PREVIEW = 12;

const KIND_FILTERS: { value: "all" | RaisKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Radiation Generator", label: "Generators" },
  { value: "Sealed Source", label: "Sources" },
];

/** The correctable fields, and how the drawer should render each one. */
const RAIS_FIELDS: readonly EditField[] = [
  {
    name: "kind",
    label: "Register",
    options: RAIS_KINDS,
    hint: "Which register the item belongs to — this decides the fields below.",
  },
  { name: "type", label: "Type", placeholder: "e.g. Fixed Xray radiography" },
  { name: "manufacturer", label: "Manufacturer" },
  { name: "model", label: "Model" },
  { name: "serialNumber", label: "Serial number" },
  {
    name: "nuclide",
    label: "Nuclide",
    placeholder: "e.g. Cs-137",
    when: (v) => v.kind === "Sealed Source",
  },
  {
    name: "activity",
    label: "Activity",
    placeholder: "e.g. 9.99E+02 GBq",
    hint: "Value and unit, as RAIS records it.",
    when: (v) => v.kind === "Sealed Source",
  },
  {
    name: "activityDate",
    label: "Activity date",
    type: "date",
    when: (v) => v.kind === "Sealed Source",
  },
  {
    name: "sealedCategory",
    label: "IAEA category",
    options: IAEA_CATEGORIES,
    when: (v) => v.kind === "Sealed Source",
  },
  {
    name: "securityLevel",
    label: "Security level",
    options: ["Security Level A", "Security Level B", "Security Level C"],
    when: (v) => v.kind === "Sealed Source",
  },
  {
    name: "isoCompliance",
    label: "ISO 2919",
    options: ["Yes", "No"],
    when: (v) => v.kind === "Sealed Source",
  },
  {
    name: "workingLife",
    label: "Recommended working life",
    placeholder: "e.g. 15 Year",
    when: (v) => v.kind === "Sealed Source",
  },
];

/**
 * One select drives both breakdowns, because a generator family and a nuclide
 * are never both meaningful for the same row. The prefix says which axis the
 * value belongs to, so the filter stays a single piece of state.
 */
type Grouping = "" | `family:${string}` | `nuclide:${string}`;

/**
 * Where an item is held, as one piece of filter state: a province, or one
 * named facility. The prefix says which, the same way `Grouping` does.
 */
type Holding = "" | `province:${string}` | `facility:${string}`;

const PAGE_SIZE = 50;

export default function SourceInventoryPage() {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | RaisKind>("all");
  const [grouping, setGrouping] = useState<Grouping>("");
  const [holding, setHolding] = useState<Holding>("");
  const [showAllFacilities, setShowAllFacilities] = useState(false);
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** null = closed; { ran: null } = adding a record. */
  const [editing, setEditing] = useState<{ ran: string | null } | null>(null);

  const { edits, canEdit, save, revert, error, reload } =
    useInventoryEditing("rais");

  const merged = useMemo(() => mergeRaisInventory(BASELINE, edits), [edits]);
  const inventory = merged.records;
  const summary = useMemo(
    () => summarizeRaisInventory(inventory),
    [inventory],
  );
  const holders = useMemo(
    () => summariseHolders(inventory, HOLDERS),
    [inventory],
  );
  const maxProvince = Math.max(1, ...holders.byProvince.map((p) => p.count));
  const facilitiesShown = showAllFacilities
    ? holders.byFacility
    : holders.byFacility.slice(0, FACILITY_PREVIEW);
  const maxFamily = Math.max(1, ...summary.byFamily.map((f) => f.count));
  // A category with nothing in it is still a category the inventory reports
  // against, so it is named under the breakdown rather than dropped from it.
  const familiesInUse = summary.byFamily.filter((f) => f.count > 0);
  const emptyFamilies = summary.byFamily
    .filter((f) => f.count === 0 && !GAP_CATEGORIES.includes(f.family))
    .map((f) => f.family);
  // The briefing asked for the catch-all to say what it holds, and the XRF
  // rows to say how much of them the register did not itself supply.
  const otherSpecialised = summary.otherSpecialised
    .map((t) => `${t.type} (${t.count})`)
    .join(" · ");
  const familyDetail = (family: GeneratorFamily): string | undefined => {
    if (family === "Other Specialised Equipment") return otherSpecialised;
    const determined =
      family === "Portable XRF"
        ? summary.xrfDetermined.portable
        : family === "Fixed XRF"
          ? summary.xrfDetermined.fixed
          : 0;
    if (!determined) return undefined;
    return `${determined} determined from the instrument's model — RAIS types them only as "XRF"`;
  };
  const maxNuclide = Math.max(1, ...summary.byNuclide.map((n) => n.count));

  const editByRan = useMemo(
    () => new Map(edits.map((e) => [e.key, e])),
    [edits],
  );
  const takenKeys = useMemo(
    () => new Set([...BASELINE_BY_RAN.keys(), ...merged.addedKeys]),
    [merged.addedKeys],
  );

  // Normalise each row's search haystack once, not per keystroke.
  const indexed = useMemo(
    () =>
      inventory.map((r) => {
        const holder = holderFor(HOLDERS, r.ran);
        return {
          r,
          family:
            r.kind === "Radiation Generator" ? generatorFamilyOf(r) : null,
          nuclide: r.kind === "Sealed Source" ? nuclideLabel(r) : null,
          holder,
          hay: [
            r.ran,
            r.type,
            r.manufacturer,
            r.model,
            r.serialNumber,
            r.nuclide || "",
            r.activity || "",
            holderSearchText(holder),
          ]
            .map(norm)
            .join(" "),
        };
      }),
    [inventory],
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
        if (holding.startsWith("province:")) {
          const want = holding.slice("province:".length);
          if ((row.holder?.province || "") !== want) return false;
        } else if (holding.startsWith("facility:")) {
          const want = holding.slice("facility:".length);
          const key = row.holder
            ? row.holder.facCode || row.holder.facility
            : "";
          if (key !== want) return false;
        }
        return !q || row.hay.includes(q);
      })
      .map(({ r }) => r);
  }, [indexed, search, kind, grouping, holding]);

  const exportCsv = useCallback(() => {
    downloadTextFile(
      `rpa-rais-source-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      raisInventoryToCsv(filtered, HOLDERS),
    );
  }, [filtered]);

  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE);

  const activeFilters =
    (kind !== "all" ? 1 : 0) + (grouping ? 1 : 0) + (holding ? 1 : 0);

  const resetFilters = () => {
    setKind("all");
    setGrouping("");
    setHolding("");
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
    setPage(0);
  };

  const pickNuclide = (nuclide: string) => {
    const next: Grouping = `nuclide:${nuclide}`;
    const off = grouping === next;
    setGrouping(off ? "" : next);
    setKind(off ? "all" : "Sealed Source");
    setPage(0);
  };

  // Where an item is held cuts across both registers, so picking a province or
  // a facility never touches the kind — a mine holds generators and sources.
  const pickHolding = (next: Holding) => {
    setHolding(holding === next ? "" : next);
    setPage(0);
  };

  const { dataQuality: gaps } = summary;
  const showGenerators = kind !== "Sealed Source";
  const showSources = kind !== "Radiation Generator";

  const editingRan = editing?.ran ?? null;
  const editingRecord =
    editingRan === null
      ? null
      : inventory.find((r) => r.ran === editingRan) ||
        merged.removed.find((r) => r.ran === editingRan) ||
        null;

  return (
    <div className="space-y-4 staggered">
      <PageHeader
        eyebrow={META.system}
        title="Source Inventory"
        subtitle={`${summary.total} radiation generators and sealed sources on the national register${
          META.exportedOn ? ` — RAIS export of ${META.exportedOn}` : ""
        }.`}
        actions={
          <>
            {canEdit ? (
              <button
                className="btn btn-primary flex-1 sm:flex-none"
                onClick={() => setEditing({ ran: null })}
              >
                + Add record
              </button>
            ) : null}
            <button
              className="btn btn-secondary flex-1 sm:flex-none"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              title="Download the current filtered view as CSV"
            >
              ⬇ CSV ({filtered.length})
            </button>
          </>
        }
      />

      {/* The register still reads without the overlay, so a failed load is a
          banner over live data rather than a blocked page. */}
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}

      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
        <div className="stat">
          <div className="stat-label">Registered items</div>
          <div className="stat-value">{summary.total}</div>
          <div className="stat-caption">generators &amp; sealed sources</div>
        </div>
        <div className="stat">
          <div className="stat-label">Radiation generators</div>
          <div className="stat-value">{summary.generators}</div>
          <div className="stat-caption">
            {gaps.missingType} with no type recorded
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Sealed sources</div>
          <div className="stat-value">{summary.sealedSources}</div>
          <div className="stat-caption">
            {summary.distinctNuclides} distinct nuclides
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Facilities holding them</div>
          <div className="stat-value text-[var(--rpa-green-dark)]">
            {holders.facilities}
          </div>
          <div className="stat-caption">
            {holders.withoutHolder} items with no holder recorded
          </div>
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
            if (v === "Radiation Generator" && grouping.startsWith("nuclide:")) {
              setGrouping("");
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
            {familiesInUse.map(({ family, count }) => (
              <BreakdownRow
                key={family}
                label={family}
                count={count}
                max={maxFamily}
                detail={familyDetail(family)}
                active={grouping === `family:${family}`}
                muted={GAP_CATEGORIES.includes(family)}
                onClick={() => pickFamily(family)}
              />
            ))}
          </ul>
          {emptyFamilies.length > 0 ? (
            <p className="mt-3 text-[11px] leading-relaxed text-gunmetal/55">
              Nothing registered yet under {emptyFamilies.join(" · ")}.
            </p>
          ) : null}
        </Panel>
      ) : null}

      {showSources ? (
        <>
          <Panel
            title="Sealed sources by nuclide"
            note="Tap a nuclide to filter the list below."
          >
            <ul className="mt-1 space-y-1.5">
              {summary.byNuclide.map(({ nuclide, count }) => (
                <BreakdownRow
                  key={nuclide}
                  label={nuclide}
                  count={count}
                  max={maxNuclide}
                  active={grouping === `nuclide:${nuclide}`}
                  muted={nuclide === "Not recorded"}
                  onClick={() => pickNuclide(nuclide)}
                />
              ))}
            </ul>
          </Panel>

        </>
      ) : null}

      <Panel
        title="Where they are held"
        note={`The facility each item is registered under, from the RAIS holdings export of ${HOLDER_META.exportedOn}. Tap a province or a facility to filter the list below.`}
      >
        <ul className="mt-1 space-y-1.5">
          {holders.byProvince.map(({ label, count }) => (
            <BreakdownRow
              key={label}
              label={label}
              count={count}
              max={maxProvince}
              active={holding === `province:${label}`}
              onClick={() => pickHolding(`province:${label}`)}
            />
          ))}
        </ul>
        {holders.byProvince.length === 0 ? (
          <p className="text-sm text-gunmetal/55">
            No holding has a province — the facilities register does not hold
            any of the facilities RAIS names.
          </p>
        ) : null}

        {/* What the holdings say about the items themselves. RAIS' own
            wording, so "Not Imported" is a standing, not a mistake. */}
        {holders.byStatus.length ? (
          <div className="mt-4 pt-3 border-t border-gunmetal/8 flex flex-wrap gap-x-4 gap-y-1">
            {holders.byStatus.map(({ label, count }) => (
              <span key={label} className="text-xs text-gunmetal/60">
                {label}{" "}
                <span className="tabular font-black text-gunmetal">{count}</span>
              </span>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel
        title={`Facilities on the register — ${holders.facilities}`}
        note="Every facility RAIS names as holding an item, most first."
      >
        <ul className="mt-1 divide-y divide-gunmetal/8">
          {facilitiesShown.map((f) => {
            const key = f.facCode || f.label;
            const active = holding === `facility:${key}`;
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickHolding(`facility:${key}`)}
                  className="w-full text-left flex items-baseline justify-between gap-3 py-2 px-2 rounded-lg transition-colors"
                  style={{
                    background: active ? "rgba(0,160,80,0.10)" : "transparent",
                  }}
                >
                  <span className="min-w-0">
                    <span
                      className={`text-sm ${active ? "font-black" : "font-bold"}`}
                    >
                      {f.label}
                    </span>
                    <span className="block text-[11px] text-gunmetal/55">
                      {f.facCode ? `${f.facCode} · ` : ""}
                      {f.onRegister ? (
                        locationLabel(f) || "Location not recorded"
                      ) : (
                        <span className="italic">
                          not on the facilities register
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="tabular font-black shrink-0">{f.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {holders.byFacility.length > FACILITY_PREVIEW ? (
          <button
            className="btn btn-ghost mt-3"
            onClick={() => setShowAllFacilities((v) => !v)}
          >
            {showAllFacilities
              ? `Show the top ${FACILITY_PREVIEW}`
              : `Show all ${holders.byFacility.length} facilities`}
          </button>
        ) : null}
      </Panel>

      <Panel
        title="Register gaps"
        note="Fields RAIS carries but has never been given a value for — the difference between an item being registered and it being described."
      >
        <ul className="mt-1 divide-y divide-gunmetal/8">
          <GapRow
            label="Serial number not recorded"
            count={gaps.missingSerial}
            of={summary.total}
          />
          <GapRow
            label="Generator type not recorded"
            count={gaps.missingType}
            of={summary.generators}
          />
          <GapRow
            label="XRF analyser not recorded as portable or fixed"
            count={gaps.xrfTypeUnspecified}
            of={summary.generators}
          />
          <GapRow
            label="Nuclide not recorded"
            count={gaps.missingNuclide}
            of={summary.sealedSources}
          />
          <GapRow
            label="Activity not recorded"
            count={gaps.missingActivity}
            of={summary.sealedSources}
          />
          <GapRow
            label="No facility recorded as holding the item"
            count={holders.withoutHolder}
            of={summary.total}
          />
          <GapRow
            label="Held by a facility the facilities register does not hold"
            count={holders.itemsOffRegister}
            of={summary.total}
          />
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-gunmetal/55">
          The IAEA source category is not reported here for now: RAIS derives it
          from the declared activity, and too many activities are entered
          inaccurately for the split to be relied on. The values are still
          stored, still correctable, and still in the CSV export — the
          breakdown returns once the activities have been re-verified.
        </p>
      </Panel>

      {merged.removed.length > 0 ? (
        <Panel
          title={`Removed from the register (${merged.removed.length})`}
          note="Out of the counts and the list above, but kept — an accession register should not lose the fact that a record was withdrawn."
        >
          <ul className="mt-1 divide-y divide-gunmetal/8">
            {merged.removed.map((r) => (
              <li
                key={r.ran}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2"
              >
                <span className="min-w-0">
                  <span className="tabular font-bold">{r.ran}</span>
                  <span className="text-gunmetal/55 text-sm">
                    {" "}
                    ·{" "}
                    {r.kind === "Sealed Source"
                      ? nuclideLabel(r)
                      : r.type || "Type not recorded"}
                  </span>
                  {editByRan.get(r.ran)?.note ? (
                    <span className="block text-[11px] text-gunmetal/50">
                      {editByRan.get(r.ran)?.note}
                    </span>
                  ) : null}
                </span>
                {canEdit ? (
                  <button
                    className="btn btn-ghost shrink-0"
                    onClick={() => setEditing({ ran: r.ran })}
                  >
                    Review
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="rais-search" className="field-label">
              Search{" "}
              <span className="text-gunmetal/45">
                ({filtered.length} of {summary.total})
              </span>
            </label>
            <input
              id="rais-search"
              className="input"
              placeholder="RAN, manufacturer, model, serial, nuclide, facility…"
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
                  if (next.startsWith("family:")) setKind("Radiation Generator");
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
                    {summary.byNuclide.map(({ nuclide }) => (
                      <option key={nuclide} value={`nuclide:${nuclide}`}>
                        {nuclide}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="rais-holding">
                Held by
              </label>
              <select
                id="rais-holding"
                className="input"
                value={holding}
                onChange={(e) => {
                  setHolding(e.target.value as Holding);
                  setPage(0);
                }}
              >
                <option value="">Anywhere</option>
                <optgroup label="Province">
                  {holders.byProvince.map(({ label, count }) => (
                    <option key={label} value={`province:${label}`}>
                      {label} ({count})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Facility">
                  {holders.byFacility.map((f) => (
                    <option
                      key={f.facCode || f.label}
                      value={`facility:${f.facCode || f.label}`}
                    >
                      {f.label} ({f.count})
                    </option>
                  ))}
                </optgroup>
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
                <th>Held by</th>
                <th>Manufacturer / Model</th>
                <th>Serial Number</th>
                <th>Activity</th>
                {canEdit ? <th aria-label="Edit" /> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <RaisRow
                  key={r.ran}
                  r={r}
                  edited={merged.editedKeys.has(r.ran)}
                  added={merged.addedKeys.has(r.ran)}
                  onEdit={canEdit ? () => setEditing({ ran: r.ran }) : null}
                />
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 7 : 6}
                    className="py-10 text-center text-gunmetal/55"
                  >
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
            <RaisCard
              key={r.ran}
              r={r}
              edited={merged.editedKeys.has(r.ran)}
              added={merged.addedKeys.has(r.ran)}
              onEdit={canEdit ? () => setEditing({ ran: r.ran }) : null}
            />
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
        {META.coverage}. Held by the {META.department}. Who holds each item is
        from {HOLDER_META.sourceDocument}
        {HOLDER_META.exportedOn ? `, exported ${HOLDER_META.exportedOn}` : ""};
        the district and province of each facility are the facilities
        register&apos;s. Imported values are reproduced as registered; anything
        corrected here is marked and keeps what the register said. See Verified
        Source Inventory for the items confirmed in the field.
      </p>

      {editing ? (
        <InventoryEditDrawer
          open
          onClose={() => setEditing(null)}
          inventory="rais"
          fields={RAIS_FIELDS}
          record={editingRecord}
          baseline={editingRan ? BASELINE_BY_RAN.get(editingRan) ?? null : null}
          edit={(editingRan && editByRan.get(editingRan)) || null}
          recordKey={editingRan}
          keyField={{
            label: "RAN (accession number)",
            placeholder: "RG/1024",
            hint: "RG/nnnn for a radiation generator, SS/nnnn for a sealed source.",
          }}
          takenKeys={takenKeys}
          onSave={save}
          onRevert={() => revert(editingRan as string)}
        />
      ) : null}
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
  detail,
  onClick,
}: {
  label: string;
  count: number;
  max: number;
  active: boolean;
  muted?: boolean;
  /** What a catch-all row actually holds, spelled out under its label. */
  detail?: string;
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
        {detail ? (
          <div className="text-[11px] leading-relaxed text-gunmetal/55">
            {detail}
          </div>
        ) : null}
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

/** Marks a record the register itself did not supply as it stands. */
function ProvenanceChip({ edited, added }: { edited: boolean; added: boolean }) {
  if (added) return <span className="chip yellow">Added</span>;
  if (edited) return <span className="chip amber">Edited</span>;
  return null;
}

/**
 * RAIS' standing for the item, in RAIS' own words. An item in use reads green,
 * one that never arrived or has left the country reads as the exception it is,
 * and an item nobody has filed a holding for is the quiet grey.
 */
const HOLDING_TONE: Record<string, string> = {
  "In Use": "chip green",
  "In Storage": "chip slate",
  Imported: "chip slate",
  "In Transport": "chip amber",
  "In-Process": "chip amber",
  Draft: "chip amber",
  "Not Imported": "chip amber",
  Unknown: "chip slate",
  Exported: "chip red",
};

function HoldingChip({ holder }: { holder: ResolvedHolder | null }) {
  if (!holder || !holder.status) {
    return <span className="chip slate">{HOLDER_NOT_RECORDED}</span>;
  }
  return (
    <span className={HOLDING_TONE[holder.status] || "chip slate"}>
      {holder.status}
    </span>
  );
}

/** Who holds the item and where — the column an inspector plans a visit from. */
function HolderCell({ holder }: { holder: ResolvedHolder | null }) {
  if (!holder) {
    return (
      <span className="text-gunmetal/45 italic">{HOLDER_NOT_RECORDED}</span>
    );
  }
  const where = locationLabel(holder);
  return (
    <>
      <div className="break-words">{holder.facility || "—"}</div>
      <div className="text-[11px] text-gunmetal/55 mt-0.5">
        {where ? <span>{where}</span> : null}
        {holder.department ? (
          <span>
            {where ? " · " : ""}
            {holder.department}
          </span>
        ) : null}
      </div>
      <div className="mt-1">
        <HoldingChip holder={holder} />
      </div>
    </>
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
        {generatorFamilyOf(r)}
      </div>
    </>
  );
}

const RaisRow = memo(function RaisRow({
  r,
  edited,
  added,
  onEdit,
}: {
  r: RaisRecord;
  edited: boolean;
  added: boolean;
  onEdit: (() => void) | null;
}) {
  const recorded = isSerialRecorded(r.serialNumber);
  const holder = holderFor(HOLDERS, r.ran);
  return (
    <tr>
      <td className="tabular font-bold whitespace-nowrap">
        {r.ran}
        {edited || added ? (
          <div className="mt-1">
            <ProvenanceChip edited={edited} added={added} />
          </div>
        ) : null}
      </td>
      <td>
        <ItemCell r={r} />
      </td>
      <td>
        <HolderCell holder={holder} />
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
        ) : (
          <span className="text-gunmetal/35">—</span>
        )}
      </td>
      {onEdit ? (
        <td>
          <button
            className="btn btn-ghost"
            onClick={onEdit}
            aria-label={`Edit ${r.ran}`}
          >
            Edit
          </button>
        </td>
      ) : null}
    </tr>
  );
});

const RaisCard = memo(function RaisCard({
  r,
  edited,
  added,
  onEdit,
}: {
  r: RaisRecord;
  edited: boolean;
  added: boolean;
  onEdit: (() => void) | null;
}) {
  const recorded = isSerialRecorded(r.serialNumber);
  const source = r.kind === "Sealed Source";
  const holder = holderFor(HOLDERS, r.ran);
  const where = locationLabel(holder);
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
            {source ? "Sealed source" : generatorFamilyOf(r)}
          </div>
          <div className="text-xs mt-1 break-words">
            {holder ? (
              <>
                <span className="font-bold">{holder.facility || "—"}</span>
                {where ? (
                  <span className="text-gunmetal/55"> · {where}</span>
                ) : null}
              </>
            ) : (
              <span className="text-gunmetal/45 italic">
                {HOLDER_NOT_RECORDED}
              </span>
            )}
          </div>
        </div>
        <HoldingChip holder={holder} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="text-xs text-gunmetal/55 tabular min-w-0">
          {r.ran} ·{" "}
          {recorded ? (
            <>Serial {r.serialNumber}</>
          ) : (
            <span className="italic text-gunmetal/45">Serial not recorded</span>
          )}
          {source && r.activity ? <> · {r.activity}</> : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ProvenanceChip edited={edited} added={added} />
          {onEdit ? (
            <button
              className="btn btn-ghost"
              onClick={onEdit}
              aria-label={`Edit ${r.ran}`}
            >
              Edit
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
});
