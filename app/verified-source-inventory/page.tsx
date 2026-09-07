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
import { mergeVerifiedInventory } from "@/lib/rules/inventoryEdits";
import {
  SEALED_SOURCES,
  SOURCE_CATEGORIES,
  categorizeEquipment,
  isSerialProvided,
  loadVerifiedInventory,
  verifiedInventoryToCsv,
  statusGroup,
  summarizeVerifiedInventory,
  type SourceCategory,
  type VerifiedInventorySeed,
  type VerifiedRecord,
  type StatusGroup,
} from "@/lib/rules/verifiedInventory";
import seed from "@/seed/verified-source-inventory-2026.seed.json";

/**
 * Verified Source Inventory — the radiation sources and radiation-emitting
 * devices the field team physically confirmed at the facilities catalogued in
 * the verification exercise (Annex I of the Activity Report on the Source
 * Inventory Programme). Its companion, Source Inventory (`/source-inventory`),
 * is the RAIS register of everything on the books; this tab is what was found
 * on the ground.
 *
 * The annex is the baseline and is never written to. Officers' corrections are
 * stored as an overlay keyed by the annex row number and merged in here, so the
 * seed keeps matching the published report while the tab shows what the section
 * now knows. Every figure is computed from the merged rows, so any count
 * reconciles with a filter of the table below.
 */

// The seed is loaded once at module scope — the annex is fixed reference data,
// so it lives in this route's chunk rather than behind an async store read.
// Only the (small) overlay of corrections comes from the store.
const BASELINE = loadVerifiedInventory(seed as VerifiedInventorySeed);
const BASELINE_BY_NO = new Map(BASELINE.map((r) => [String(r.no), r]));
const META = (seed as VerifiedInventorySeed).meta;

/** The correctable fields, and how the drawer should render each one. */
const VERIFIED_FIELDS: readonly EditField[] = [
  { name: "facility", label: "Establishment / facility" },
  {
    name: "equipmentType",
    label: "Equipment type",
    placeholder: "e.g. Dental X-ray",
    hint: "The machine family is derived from this text.",
  },
  { name: "serialNumber", label: "Serial number" },
  {
    name: "status",
    label: "Status observed",
    options: ["In Use", "Not In Use", "Not Yet In Use", "Not Provided"],
  },
];

const STATUS_FILTERS: { value: "all" | StatusGroup; label: string }[] = [
  { value: "all", label: "All" },
  { value: "In Use", label: "In use" },
  { value: "Not In Use", label: "Not in use" },
  { value: "Unspecified", label: "Unspecified" },
];

const PAGE_SIZE = 50;

export default function VerifiedSourceInventoryPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"" | SourceCategory>("");
  const [status, setStatus] = useState<"all" | StatusGroup>("all");
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** null = closed; { no: null } = adding a record. */
  const [editing, setEditing] = useState<{ no: string | null } | null>(null);

  const { edits, canEdit, save, revert, error, reload } =
    useInventoryEditing("verified");

  const merged = useMemo(() => mergeVerifiedInventory(BASELINE, edits), [edits]);
  const inventory = merged.records;
  const summary = useMemo(
    () => summarizeVerifiedInventory(inventory),
    [inventory],
  );
  const maxCategory = Math.max(1, ...summary.byCategory.map((c) => c.count));
  // A category with nothing in it is still one the inventory reports against,
  // so it is named under the breakdown rather than dropped from it.
  const categoriesInUse = summary.byCategory.filter((c) => c.count > 0);
  const emptyCategories = summary.byCategory
    .filter((c) => c.count === 0 && !GAP_CATEGORIES.includes(c.category))
    .map((c) => c.category);
  // The briefing asked for the catch-all to say what it holds.
  const otherSpecialised = summary.otherSpecialised
    .map((t) => `${t.type} (${t.count})`)
    .join(" · ");
  const maxSourceType = Math.max(
    1,
    ...summary.bySourceType.map((t) => t.count),
  );

  const editByNo = useMemo(
    () => new Map(edits.map((e) => [e.key, e])),
    [edits],
  );
  const takenKeys = useMemo(
    () => new Set([...BASELINE_BY_NO.keys(), ...merged.addedKeys]),
    [merged.addedKeys],
  );
  /** Additions continue the annex numbering rather than reusing a row. */
  const nextNo = useMemo(() => {
    let highest = 0;
    for (const key of takenKeys) highest = Math.max(highest, Number(key) || 0);
    return String(highest + 1);
  }, [takenKeys]);

  // Normalise each row's search haystack once, not per keystroke.
  const indexed = useMemo(
    () =>
      inventory.map((r) => ({
        r,
        category: categorizeEquipment(r.equipmentType),
        group: statusGroup(r.status),
        hay: [r.facility, r.equipmentType, r.serialNumber, r.status]
          .map(norm)
          .join(" "),
      })),
    [inventory],
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
      `rpa-verified-source-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      verifiedInventoryToCsv(filtered),
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

  const notInUse = summary.total - summary.inUse;

  const editingNo = editing?.no ?? null;
  const editingRecord =
    editingNo === null
      ? null
      : inventory.find((r) => String(r.no) === editingNo) ||
        merged.removed.find((r) => String(r.no) === editingNo) ||
        null;

  return (
    <div className="space-y-4 staggered">
      <PageHeader
        eyebrow={META.annexReference}
        title="Verified Source Inventory"
        subtitle={`${summary.total} radiation sources and radiation-emitting devices confirmed on the ground across ${summary.facilities} facilities — field verification ${META.exercisePeriod}.`}
        actions={
          <>
            {canEdit ? (
              <button
                className="btn btn-primary flex-1 sm:flex-none"
                onClick={() => setEditing({ no: null })}
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

      {/* The annex still reads without the overlay, so a failed load is a
          banner over live data rather than a blocked page. */}
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}

      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
        <div className="stat">
          <div className="stat-label">Sources & devices</div>
          <div className="stat-value">{summary.total}</div>
          <div className="stat-caption">recorded items</div>
        </div>
        <div className="stat">
          <div className="stat-label">Facilities</div>
          <div className="stat-value">{summary.facilities}</div>
          <div className="stat-caption">establishments holding sources</div>
        </div>
        <div className="stat">
          <div className="stat-label">In use</div>
          <div className="stat-value text-[var(--rpa-green-dark)]">
            {summary.inUse}
          </div>
          <div className="stat-caption">{notInUse} not in use / unspecified</div>
        </div>
        <div className="stat">
          <div className="stat-label">Radioactive sources</div>
          <div className="stat-value">{summary.radioactiveSources}</div>
          <div className="stat-caption">sealed sources confirmed</div>
        </div>
      </section>

      <Panel
        title="By equipment category"
        note="Tap a category to filter the list below."
      >
        <ul className="mt-1 space-y-1.5">
          {categoriesInUse.map(({ category: c, count }) => {
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
                  {c === "Other Specialised Equipment" && otherSpecialised ? (
                    <div className="text-[11px] leading-relaxed text-gunmetal/55">
                      {otherSpecialised}
                    </div>
                  ) : null}
                  <div
                    className="mt-1 h-1.5 rounded-full overflow-hidden"
                    style={{ background: "rgba(26,27,29,0.06)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / maxCategory) * 100}%`,
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
        {emptyCategories.length > 0 ? (
          <p className="mt-3 text-[11px] leading-relaxed text-gunmetal/55">
            Nothing confirmed in this exercise under{" "}
            {emptyCategories.join(" · ")}.
          </p>
        ) : null}
      </Panel>

      {summary.bySourceType.length > 0 ? (
        <Panel
          title="Sealed sources by type of source"
          note="The nuclide as the annex records it. Tap one to search the list below."
        >
          <ul className="mt-1 space-y-1.5">
            {summary.bySourceType.map(({ nuclide, count }) => (
              <li key={nuclide}>
                <button
                  type="button"
                  onClick={() => {
                    setCategory(SEALED_SOURCES);
                    setSearch(nuclide);
                    setPage(0);
                  }}
                  className="w-full text-left rounded-lg px-2 py-1.5 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold">{nuclide}</span>
                    <span className="tabular font-black shrink-0">{count}</span>
                  </div>
                  <div
                    className="mt-1 h-1.5 rounded-full overflow-hidden"
                    style={{ background: "rgba(26,27,29,0.06)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / maxSourceType) * 100}%`,
                        background: "var(--rpa-green, #00A050)",
                      }}
                    />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {merged.removed.length > 0 ? (
        <Panel
          title={`Removed from the annex (${merged.removed.length})`}
          note="Out of the counts and the list above, but kept — the record of what the field team found should not lose an entry silently."
        >
          <ul className="mt-1 divide-y divide-gunmetal/8">
            {merged.removed.map((r) => (
              <li
                key={r.no}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2"
              >
                <span className="min-w-0">
                  <span className="tabular text-gunmetal/55">#{r.no}</span>{" "}
                  <span className="font-bold">{r.facility}</span>
                  <span className="text-gunmetal/55 text-sm">
                    {" "}
                    · {r.equipmentType}
                  </span>
                  {editByNo.get(String(r.no))?.note ? (
                    <span className="block text-[11px] text-gunmetal/50">
                      {editByNo.get(String(r.no))?.note}
                    </span>
                  ) : null}
                </span>
                {canEdit ? (
                  <button
                    className="btn btn-ghost shrink-0"
                    onClick={() => setEditing({ no: String(r.no) })}
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
            <label htmlFor="source-search" className="field-label">
              Search{" "}
              <span className="text-gunmetal/45">
                ({filtered.length} of {summary.total})
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
                {canEdit ? <th aria-label="Edit" /> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <SourceRow
                  key={r.no}
                  r={r}
                  edited={merged.editedKeys.has(String(r.no))}
                  added={merged.addedKeys.has(String(r.no))}
                  onEdit={
                    canEdit ? () => setEditing({ no: String(r.no) }) : null
                  }
                />
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 6 : 5}
                    className="py-10 text-center text-gunmetal/55"
                  >
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
            <SourceCard
              key={r.no}
              r={r}
              edited={merged.editedKeys.has(String(r.no))}
              added={merged.addedKeys.has(String(r.no))}
              onEdit={canEdit ? () => setEditing({ no: String(r.no) }) : null}
            />
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
        Annex values are reproduced as published; anything corrected here is
        marked and keeps what the annex recorded.
      </p>

      {editing ? (
        <InventoryEditDrawer
          open
          onClose={() => setEditing(null)}
          inventory="verified"
          fields={VERIFIED_FIELDS}
          record={editingRecord}
          baseline={editingNo ? BASELINE_BY_NO.get(editingNo) ?? null : null}
          edit={(editingNo && editByNo.get(editingNo)) || null}
          recordKey={editingNo}
          keyField={{
            label: "Row number",
            placeholder: nextNo,
            hint: `The annex runs to ${BASELINE.length}; a new row continues from there.`,
          }}
          takenKeys={takenKeys}
          onSave={save}
          onRevert={() => revert(editingNo as string)}
        />
      ) : null}
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

/** Marks a row the published annex did not supply as it stands. */
function ProvenanceChip({ edited, added }: { edited: boolean; added: boolean }) {
  if (added) return <span className="chip yellow">Added</span>;
  if (edited) return <span className="chip amber">Edited</span>;
  return null;
}

const SourceRow = memo(function SourceRow({
  r,
  edited,
  added,
  onEdit,
}: {
  r: VerifiedRecord;
  edited: boolean;
  added: boolean;
  onEdit: (() => void) | null;
}) {
  const provided = isSerialProvided(r.serialNumber);
  return (
    <tr>
      <td className="num tabular text-gunmetal/55">{r.no}</td>
      <td className="font-bold">
        {r.facility}
        {edited || added ? (
          <div className="mt-1">
            <ProvenanceChip edited={edited} added={added} />
          </div>
        ) : null}
      </td>
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
      {onEdit ? (
        <td>
          <button
            className="btn btn-ghost"
            onClick={onEdit}
            aria-label={`Edit row ${r.no}`}
          >
            Edit
          </button>
        </td>
      ) : null}
    </tr>
  );
});

const SourceCard = memo(function SourceCard({
  r,
  edited,
  added,
  onEdit,
}: {
  r: VerifiedRecord;
  edited: boolean;
  added: boolean;
  onEdit: (() => void) | null;
}) {
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
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="text-xs text-gunmetal/55 tabular min-w-0">
          #{r.no} ·{" "}
          {provided ? (
            <>Serial {r.serialNumber}</>
          ) : (
            <span className="italic text-gunmetal/45">Serial not provided</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ProvenanceChip edited={edited} added={added} />
          {onEdit ? (
            <button
              className="btn btn-ghost"
              onClick={onEdit}
              aria-label={`Edit row ${r.no}`}
            >
              Edit
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
});
