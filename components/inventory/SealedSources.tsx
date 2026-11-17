"use client";

/**
 * What the two inventory tabs show of the Inspectorate's seals: a chip on the
 * row of every item under seal, and a panel naming them all. The records are
 * the Inspectorate's (lib/rules/sealedSources.ts); these tabs only read them,
 * and an item stops reading Sealed the day the Inspectorate lifts the seal.
 */
import { useMemo } from "react";

import { Panel } from "@/components/Section";
import {
  activeSealIndex,
  sealLabel,
  sealKey,
  type SealedSource,
} from "@/lib/rules/sealedSources";
import { useStoreData } from "@/lib/storeHooks";

/**
 * Every seal record, with the inventory's items under seal indexed by
 * `${inventory}:${key}`. A failed read (the sealedSources rules not deployed
 * yet) leaves the inventory readable, with no item marked.
 */
export function useSealedSources() {
  const { data, error } = useStoreData(
    (s) => s.listSealedSources().catch(() => [] as SealedSource[]),
    [],
  );
  const records = useMemo(() => data ?? [], [data]);
  const active = useMemo(() => activeSealIndex(records), [records]);
  return { records, active, error };
}

/** The seal on one inventory row, or null. */
export function sealFor(
  active: Map<string, SealedSource>,
  inventory: "rais" | "verified",
  key: string,
): SealedSource | null {
  return active.get(sealKey(inventory, key)) || null;
}

/** "Sealed" / "Seized", red, with the day and facility on hover. */
export function SealChip({ seal }: { seal: SealedSource | null }) {
  if (!seal) return null;
  return (
    <span
      className="chip red"
      title={`${sealLabel(seal.action)} on ${seal.sealedOn} at ${seal.facilityName}${
        seal.notes ? ` — ${seal.notes}` : ""
      }`}
    >
      {sealLabel(seal.action)} {seal.sealedOn}
    </span>
  );
}

/**
 * The items under seal on this inventory, and any the tab has no row for. A
 * tap on one filters the list to it.
 */
export function UnderSealPanel({
  onRow,
  withoutRow,
  inventoryLabel,
  onPick,
  filterActive,
  onToggleFilter,
}: {
  /** Items under seal that have a row on this tab. */
  onRow: { key: string; label: string; seal: SealedSource }[];
  /** Items under seal this tab names but has no row for. */
  withoutRow: SealedSource[];
  inventoryLabel: string;
  onPick: (key: string) => void;
  filterActive: boolean;
  onToggleFilter: () => void;
}) {
  const total = onRow.length + withoutRow.length;
  return (
    <Panel
      id="sealed"
      title={`Under seal — ${total}`}
      flush
      note={`Sources and devices an enforcement sealed or seized, as the Inspectorate recorded them. Each reads Sealed (or Seized) in the list below until the Inspectorate lifts the seal.`}
      action={
        onRow.length ? (
          <button className="btn btn-ghost" onClick={onToggleFilter} aria-pressed={filterActive}>
            {filterActive ? "Show every item" : "List only these"}
          </button>
        ) : null
      }
    >
      {total === 0 ? (
        <p className="px-4 sm:px-5 pb-4 text-sm text-gunmetal/60">
          Nothing on {inventoryLabel} is under seal.
        </p>
      ) : (
        <ul className="divide-y divide-gunmetal/8">
          {onRow.map(({ key, label, seal }) => (
            <li key={seal.id} className="px-4 sm:px-5 py-2.5">
              <button
                type="button"
                className="w-full text-left flex items-start justify-between gap-3"
                onClick={() => onPick(key)}
              >
                <span className="min-w-0">
                  <span className="font-bold break-words">{label}</span>
                  <span className="block text-xs text-gunmetal/60">
                    {seal.description}
                    {seal.serialNumber ? ` · serial ${seal.serialNumber}` : ""} · at{" "}
                    {seal.facilityName}
                  </span>
                </span>
                <SealChip seal={seal} />
              </button>
            </li>
          ))}
          {withoutRow.map((seal) => (
            <li key={seal.id} className="px-4 sm:px-5 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-bold break-words">{seal.description || "Item"}</span>
                  <span className="block text-xs text-gunmetal/60">
                    {seal.serialNumber ? `Serial ${seal.serialNumber} · ` : ""}at {seal.facilityName}
                  </span>
                  <span className="block text-xs text-[#7a5b07] mt-0.5">
                    {seal.inventory
                      ? `Recorded against ${seal.key}, which ${inventoryLabel} no longer holds.`
                      : "On neither inventory — a sealed item the register has no record of."}
                  </span>
                </span>
                <SealChip seal={seal} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
