"use client";

/**
 * Sealed & seized sources — the items an enforcement put out of use, one row
 * per item, on the Inspectorate tab.
 *
 * The enforcement column records that a facility was sealed; this register
 * records WHICH source or device. Each item is picked from the inventories
 * (the RAIS register by RAN, the field-verified annex by row) so the two
 * inventory tabs can show it as Sealed until the seal is lifted here. An item
 * on neither inventory is recorded with what it is and its serial, and the
 * Source Inventory tab lists it as a worklist. See lib/rules/sealedSources.ts.
 *
 * The inventories are 900 KB of seed between them, so they are loaded only
 * when the recording form opens — the rest of the tab never pays for them.
 */
import { useEffect, useMemo, useState } from "react";

import { FacilitySelect } from "@/components/FacilitySelect";
import { Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
import { store } from "@/lib/store";
import { RAN_PATTERN } from "@/lib/rules/inventoryEdits";
import {
  SEALING_ACTIONS,
  activeSealIndex,
  candidatesAtFacility,
  isSealingAction,
  isUnderSeal,
  sealKey,
  sealLabel,
  searchCandidates,
  sortSealedSources,
  summariseSeals,
  validateSealedSource,
  type NewSealedSource,
  type SealCandidate,
  type SealedSource,
  type SealingAction,
} from "@/lib/rules/sealedSources";
import { todayISO } from "@/lib/rules/week";
import type { RaisRecord } from "@/lib/rules/raisInventory";
import type { SourceHolderIndex } from "@/lib/rules/sourceHolders";
import type { VerifiedRecord } from "@/lib/rules/verifiedInventory";
import type { Facility, Inspection } from "@/lib/rules/types";

type ToastPush = (msg: string, kind?: "success" | "error") => void;

/** What an inspection hands the form: its facility, day, action and id. */
export interface SealPrefill {
  inspection: Inspection;
  nonce: number;
}

interface Inventories {
  rais: RaisRecord[];
  holders: SourceHolderIndex;
  verified: VerifiedRecord[];
}

let inventoriesPromise: Promise<Inventories> | null = null;

/** The two inventories' seeds, fetched once per session and only on demand. */
function loadInventories(): Promise<Inventories> {
  if (!inventoriesPromise) {
    inventoriesPromise = Promise.all([
      import("@/seed/rais-source-inventory.seed.json"),
      import("@/seed/rais-source-holders.seed.json"),
      import("@/seed/verified-source-inventory-2026.seed.json"),
      import("@/lib/rules/raisInventory"),
      import("@/lib/rules/sourceHolders"),
      import("@/lib/rules/verifiedInventory"),
    ]).then(([rais, holders, verified, raisMod, holderMod, verifiedMod]) => ({
      rais: raisMod.loadRaisInventory(
        rais.default as unknown as Parameters<typeof raisMod.loadRaisInventory>[0],
      ),
      holders: holderMod.loadSourceHolders(
        holders.default as unknown as Parameters<typeof holderMod.loadSourceHolders>[0],
      ),
      verified: verifiedMod.loadVerifiedInventory(
        verified.default as unknown as Parameters<typeof verifiedMod.loadVerifiedInventory>[0],
      ),
    }));
    inventoriesPromise.catch(() => {
      inventoriesPromise = null;
    });
  }
  return inventoriesPromise;
}

type Filter = "open" | "lifted" | "all";

/** Where the item sits in the inventories, as a short reference. */
function inventoryRef(r: Pick<SealedSource, "inventory" | "key">): string {
  if (r.inventory === "rais") return r.key;
  if (r.inventory === "verified") return `Verified #${r.key}`;
  return "Not on the inventory";
}

export function SealedSourcesPanel({
  records,
  facilities,
  inspections,
  canEdit,
  actorUid,
  prefill,
  onChanged,
  toastPush,
}: {
  records: SealedSource[];
  facilities: Facility[];
  inspections: Inspection[];
  canEdit: boolean;
  actorUid: string | null;
  prefill: SealPrefill | null;
  onChanged: () => void;
  toastPush: ToastPush;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const [recording, setRecording] = useState(false);
  const [lifting, setLifting] = useState<string | null>(null);
  const [liftDate, setLiftDate] = useState(todayISO());
  const [liftNote, setLiftNote] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The inspection the open form was prefilled from; the panel's own button
  // opens it blank.
  const [activePrefill, setActivePrefill] = useState<SealPrefill | null>(null);

  // An inspection's "Record the sources sealed" opens the form, prefilled.
  useEffect(() => {
    if (!prefill || !canEdit) return;
    setActivePrefill(prefill);
    setRecording(true);
    document
      .getElementById("sealed")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [prefill, canEdit]);

  const summary = useMemo(() => summariseSeals(records), [records]);
  const shown = useMemo(() => {
    const sorted = sortSealedSources(records);
    if (filter === "all") return sorted;
    return sorted.filter((r) => (filter === "open") === isUnderSeal(r));
  }, [records, filter]);
  const inspectionById = useMemo(
    () => new Map(inspections.map((i) => [i.id, i])),
    [inspections],
  );

  const lift = async (r: SealedSource) => {
    if (busy || !actorUid) return;
    setBusy(true);
    try {
      const s = await store();
      await s.updateSealedSource(
        r.id,
        { liftedOn: liftDate, liftNote: liftNote.trim() || undefined },
        actorUid,
      );
      toastPush(`Seal lifted — ${r.description} shows as released in the inventory.`, "success");
      setLifting(null);
      setLiftNote("");
      onChanged();
    } catch (err) {
      toastPush(`Lifting the seal failed: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const unlift = async (r: SealedSource) => {
    if (busy || !actorUid) return;
    setBusy(true);
    try {
      const s = await store();
      await s.updateSealedSource(r.id, { liftedOn: undefined, liftNote: undefined }, actorUid);
      toastPush(`${r.description} is back under seal.`, "success");
      onChanged();
    } catch (err) {
      toastPush(`Saving failed: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: SealedSource) => {
    if (busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.deleteSealedSource(r.id);
      toastPush("Record taken off the register.", "success");
      setConfirmRemove(null);
      onChanged();
    } catch (err) {
      toastPush(`Removing failed: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      id="sealed"
      title={`Sealed & seized sources — ${summary.sealed + summary.seized} under seal`}
      flush
      note={`${summary.sealed} sealed · ${summary.seized} seized · at ${summary.facilities} ${
        summary.facilities === 1 ? "facility" : "facilities"
      } · ${summary.lifted} lifted. Each item shows as Sealed on the Source Inventory and Verified Source Inventory tabs until its seal is lifted here. Recording an item moves no reported figure — 1.2.11 counts the action on the inspection.`}
      action={
        canEdit && !recording ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              setActivePrefill(null);
              setRecording(true);
            }}
          >
            + Record sealed source
          </button>
        ) : null
      }
    >
      {recording && canEdit && actorUid ? (
        <div className="px-4 sm:px-5 pb-4 border-b border-gunmetal/8">
          <RecordSealedSourceForm
            key={activePrefill?.nonce ?? "fresh"}
            facilities={facilities}
            inspections={inspections}
            existing={records}
            prefill={activePrefill}
            actorUid={actorUid}
            toastPush={toastPush}
            onSaved={() => {
              setRecording(false);
              onChanged();
            }}
            onCancel={() => setRecording(false)}
          />
        </div>
      ) : null}

      <div className="px-4 sm:px-5 py-2">
        <Segmented
          ariaLabel="Seal standing"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: "Under seal" },
            { value: "lifted", label: "Lifted" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <p className="px-4 sm:px-5 pb-4 text-sm text-gunmetal/60">
          {records.length === 0
            ? "No sealed or seized items recorded yet. When an inspection seals a facility, record which source or device was sealed."
            : "Nothing here under this filter."}
        </p>
      ) : (
        <ul className="divide-y divide-gunmetal/8">
          {shown.map((r) => {
            const insp = r.inspectionId ? inspectionById.get(r.inspectionId) : undefined;
            const open = isUnderSeal(r);
            return (
              <li key={r.id} className="px-4 sm:px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold break-words">{r.description || "Item"}</div>
                    <div className="text-xs text-gunmetal/60 mt-1 flex flex-wrap gap-1 items-center">
                      <span className={open ? "chip red" : "chip green"}>
                        {open ? sealLabel(r.action) : "Seal lifted"}
                      </span>
                      <span className={r.inventory ? "chip slate" : "chip amber"}>
                        {inventoryRef(r)}
                      </span>
                      {r.serialNumber ? <span className="tabular">Serial {r.serialNumber}</span> : null}
                    </div>
                    <div className="text-xs mt-1 break-words">
                      <span className="font-bold">{r.facilityName}</span>
                      {insp ? (
                        <span className="text-gunmetal/55">
                          {" "}
                          · at the {insp.type.toLowerCase()} of {insp.date || "an undated visit"}
                        </span>
                      ) : null}
                    </div>
                    {r.notes ? (
                      <div className="text-xs text-gunmetal/65 mt-1 whitespace-pre-line">{r.notes}</div>
                    ) : null}
                    {!open && r.liftNote ? (
                      <div className="text-xs text-gunmetal/65 mt-1">Lifted: {r.liftNote}</div>
                    ) : null}
                  </div>
                  <div className="text-xs tabular text-gunmetal/55 text-right shrink-0">
                    <div>{sealLabel(r.action).toLowerCase()} {r.sealedOn}</div>
                    {r.liftedOn ? <div>lifted {r.liftedOn}</div> : null}
                    {canEdit ? (
                      <div className="mt-1 flex flex-col items-end gap-1">
                        {open ? (
                          <button
                            className="link-action"
                            onClick={() => {
                              setLifting(lifting === r.id ? null : r.id);
                              setLiftDate(todayISO());
                              setLiftNote("");
                            }}
                          >
                            {lifting === r.id ? "Close" : "Lift the seal"}
                          </button>
                        ) : (
                          <button className="link-action" disabled={busy} onClick={() => unlift(r)}>
                            Undo lift
                          </button>
                        )}
                        {confirmRemove === r.id ? (
                          <>
                            <button
                              className="link-action"
                              style={{ color: "var(--status-stalled)" }}
                              disabled={busy}
                              onClick={() => remove(r)}
                            >
                              Remove it
                            </button>
                            <button className="link-action" onClick={() => setConfirmRemove(null)}>
                              Keep it
                            </button>
                          </>
                        ) : (
                          <button
                            className="link-action"
                            style={{ color: "var(--status-stalled)" }}
                            onClick={() => setConfirmRemove(r.id)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                {lifting === r.id && open ? (
                  <div className="mt-3 pt-3 border-t border-gunmetal/8 flex flex-wrap items-end gap-3">
                    <div>
                      <label className="field-label" htmlFor={`lift-date-${r.id}`}>
                        Seal lifted on
                      </label>
                      <input
                        id={`lift-date-${r.id}`}
                        type="date"
                        className="input"
                        style={{ maxWidth: 170 }}
                        value={liftDate}
                        min={r.sealedOn}
                        onChange={(e) => setLiftDate(e.target.value)}
                      />
                    </div>
                    <div className="grow" style={{ minWidth: "14rem" }}>
                      <label className="field-label" htmlFor={`lift-note-${r.id}`}>
                        Why, or on whose authority (optional)
                      </label>
                      <input
                        id={`lift-note-${r.id}`}
                        className="input"
                        value={liftNote}
                        maxLength={500}
                        onChange={(e) => setLiftNote(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={busy || !liftDate || liftDate < r.sealedOn}
                      onClick={() => lift(r)}
                    >
                      {busy ? "Saving…" : "Lift the seal"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** One item picked on the form, from an inventory or typed. */
type PickedItem = Pick<SealedSource, "inventory" | "key" | "description" | "serialNumber">;

function pickedId(p: Pick<PickedItem, "inventory" | "key" | "description" | "serialNumber">): string {
  return p.inventory ? sealKey(p.inventory, p.key) : `typed:${p.description}:${p.serialNumber}`;
}

/**
 * Recording the items sealed or seized at one facility on one day. The items
 * the inventories place at the facility are offered first; any other item can
 * be found by RAN, serial or type, or typed in when it is on neither.
 */
function RecordSealedSourceForm({
  facilities,
  inspections,
  existing,
  prefill,
  actorUid,
  toastPush,
  onSaved,
  onCancel,
}: {
  facilities: Facility[];
  inspections: Inspection[];
  existing: SealedSource[];
  prefill: SealPrefill | null;
  actorUid: string;
  toastPush: ToastPush;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const from = prefill?.inspection;
  const [facilityId, setFacilityId] = useState<string | null>(from?.facilityId ?? null);
  const [facilityName, setFacilityName] = useState(from && !from.facilityId ? from.facilityName : "");
  const [action, setAction] = useState<SealingAction>(
    from && isSealingAction(from.enforcement) ? from.enforcement : "Suspension of Practice",
  );
  const [sealedOn, setSealedOn] = useState(from?.date || todayISO());
  const [inspectionId, setInspectionId] = useState<string>(from?.id || "");
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const [query, setQuery] = useState("");
  const [typedDescription, setTypedDescription] = useState("");
  const [typedSerial, setTypedSerial] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [inv, setInv] = useState<Inventories | null>(null);
  const [invError, setInvError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadInventories()
      .then((v) => live && setInv(v))
      .catch((err) => live && setInvError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, []);

  const facility = facilityId ? facilities.find((f) => f.id === facilityId) || null : null;
  const name = facility ? facility.name : facilityName.trim();

  // The facility's logged inspections, newest first — the one the action was
  // recorded on is usually the latest with a seal or seizure on it.
  const facilityInspections = useMemo(() => {
    if (!facility && !name) return [];
    return inspections
      .filter((i) =>
        facility ? i.facilityId === facility.id : i.facilityName.trim().toLowerCase() === name.toLowerCase(),
      )
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [inspections, facility, name]);

  // Picking a facility (not arriving from an inspection) links its latest
  // sealing inspection by default.
  useEffect(() => {
    if (from) return;
    const latest = facilityInspections.find((i) => isSealingAction(i.enforcement));
    setInspectionId(latest?.id || "");
    if (latest?.date) setSealedOn(latest.date);
    if (latest && isSealingAction(latest.enforcement)) setAction(latest.enforcement);
  }, [facilityInspections, from]);

  const active = useMemo(() => activeSealIndex(existing), [existing]);

  const atFacility = useMemo(
    () =>
      inv && name
        ? candidatesAtFacility(
            { facCode: facility?.facCode, name },
            inv.rais,
            inv.holders,
            inv.verified,
          )
        : [],
    [inv, facility, name],
  );
  const found = useMemo(
    () => (inv ? searchCandidates(query, inv.rais, inv.holders, inv.verified) : []),
    [inv, query],
  );
  // A RAN typed in full that the seed does not hold (an item the section added
  // in the app after the export) can still be named by its RAN.
  const typedRan = query.trim().toUpperCase();
  const offerTypedRan =
    RAN_PATTERN.test(typedRan) && !found.some((c) => c.inventory === "rais" && c.key === typedRan);

  const isPicked = (c: Pick<PickedItem, "inventory" | "key" | "description" | "serialNumber">) =>
    picked.some((p) => pickedId(p) === pickedId(c));
  const toggle = (c: SealCandidate) => {
    const item: PickedItem = {
      inventory: c.inventory,
      key: c.key,
      description: c.description,
      serialNumber: c.serialNumber,
    };
    setPicked((cur) =>
      isPicked(item) ? cur.filter((p) => pickedId(p) !== pickedId(item)) : [...cur, item],
    );
  };

  const addTyped = () => {
    const description = typedDescription.trim();
    if (!description) {
      toastPush("Say what the item is — e.g. Cs-137 portable gauge.", "error");
      return;
    }
    const item: PickedItem = { inventory: "", key: "", description, serialNumber: typedSerial.trim() };
    if (!isPicked(item)) setPicked((cur) => [...cur, item]);
    setTypedDescription("");
    setTypedSerial("");
  };

  const save = async () => {
    if (busy) return;
    if (!name) {
      toastPush("Choose the facility, or type its name.", "error");
      return;
    }
    if (picked.length === 0) {
      toastPush("Pick at least one source or device.", "error");
      return;
    }
    const drafts: NewSealedSource[] = picked.map((p) => ({
      ...p,
      facilityId: facility ? facility.id : null,
      facilityName: name,
      action,
      sealedOn,
      ...(inspectionId ? { inspectionId } : {}),
      notes: notes.trim(),
    }));
    for (const d of drafts) {
      const problem = validateSealedSource(d);
      if (problem) {
        toastPush(problem, "error");
        return;
      }
    }
    setBusy(true);
    try {
      const s = await store();
      for (const d of drafts) await s.addSealedSource(d, actorUid);
      toastPush(
        `${drafts.length} item${drafts.length === 1 ? "" : "s"} recorded as ${sealLabel(action).toLowerCase()} at ${name}.`,
        "success",
      );
      onSaved();
    } catch (err) {
      toastPush(`Recording failed: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const candidateRow = (c: SealCandidate) => {
    const under = active.get(sealKey(c.inventory, c.key));
    return (
      <li key={sealKey(c.inventory, c.key)}>
        <label
          className={`flex items-start gap-2 py-1.5 text-sm ${under ? "opacity-60" : "cursor-pointer"}`}
        >
          <input
            type="checkbox"
            className="mt-1"
            disabled={!!under}
            checked={isPicked(c)}
            onChange={() => toggle(c)}
          />
          <span className="min-w-0">
            <span className="font-bold">{c.description}</span>
            <span className="block text-xs text-gunmetal/60 tabular">
              {c.inventory === "rais" ? c.key : `Verified #${c.key}`}
              {c.serialNumber ? ` · Serial ${c.serialNumber}` : " · no serial recorded"}
              {c.location ? ` · ${c.location}` : ""}
              {under ? ` · already ${sealLabel(under.action).toLowerCase()} since ${under.sealedOn}` : ""}
            </span>
          </span>
        </label>
      </li>
    );
  };

  return (
    <div className="space-y-3 pt-1">
      <div className="caps text-[10px] text-gunmetal/55">Record the source or device sealed</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="seal-facility">
            Facility
          </label>
          <FacilitySelect
            facilities={facilities}
            value={facilityId}
            onChange={(id) => {
              setFacilityId(id);
              setPicked([]);
            }}
            emptyLabel="— not on the register —"
            ariaLabel="Facility the item was sealed at"
          />
          {!facility ? (
            <input
              id="seal-facility"
              className="input mt-2"
              placeholder="Facility name, as found"
              value={facilityName}
              onChange={(e) => setFacilityName(e.target.value)}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <span className="field-label">Action</span>
            <Segmented
              ariaLabel="Action"
              value={action}
              onChange={setAction}
              options={SEALING_ACTIONS.map((a) => ({ value: a, label: sealLabel(a) }))}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="seal-date">
              {sealLabel(action)} on
            </label>
            <input
              id="seal-date"
              type="date"
              className="input"
              style={{ maxWidth: 170 }}
              value={sealedOn}
              onChange={(e) => setSealedOn(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="seal-inspection">
          Recorded at inspection
        </label>
        <select
          id="seal-inspection"
          className="input"
          value={inspectionId}
          onChange={(e) => {
            setInspectionId(e.target.value);
            const i = facilityInspections.find((x) => x.id === e.target.value);
            if (i?.date) setSealedOn(i.date);
          }}
        >
          <option value="">Not linked to a logged inspection</option>
          {(from && !facilityInspections.some((i) => i.id === from.id)
            ? [from, ...facilityInspections]
            : facilityInspections
          ).map((i) => (
            <option key={i.id} value={i.id}>
              {i.date || "undated"} · {i.type}
              {i.enforcement ? ` · ${isSealingAction(i.enforcement) ? sealLabel(i.enforcement) : i.enforcement}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="field-label">
          {picked.length
            ? `${picked.length} item${picked.length === 1 ? "" : "s"} picked`
            : "Which source or device"}
        </span>
        {invError ? (
          <p className="text-sm text-[var(--status-stalled)]">
            The inventories did not load ({invError}). An item can still be typed in below.
          </p>
        ) : !inv ? (
          <p className="text-sm text-gunmetal/55">Loading the inventories…</p>
        ) : (
          <>
            {name ? (
              atFacility.length ? (
                <>
                  <div className="text-xs text-gunmetal/55 mt-1">
                    On the inventories at {name}:
                  </div>
                  <ul className="max-h-64 overflow-y-auto">{atFacility.map(candidateRow)}</ul>
                </>
              ) : (
                <p className="text-xs text-gunmetal/55 mt-1">
                  Neither inventory places anything at {name}. Find the item below, or type it in.
                </p>
              )
            ) : (
              <p className="text-xs text-gunmetal/55 mt-1">
                Choose the facility to see what the inventories place there.
              </p>
            )}
            <input
              className="input mt-2"
              placeholder="Find any item by RAN, serial, nuclide, type or holder…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Find an item on the inventories"
            />
            {query.trim().length >= 2 ? (
              <ul className="max-h-64 overflow-y-auto">
                {found.map(candidateRow)}
                {offerTypedRan ? (
                  <li>
                    <button
                      type="button"
                      className="link-action py-1.5"
                      onClick={() =>
                        toggle({
                          inventory: "rais",
                          key: typedRan,
                          description: `Registered item ${typedRan}`,
                          serialNumber: "",
                          location: "",
                        })
                      }
                    >
                      Name it by RAN {typedRan} as typed
                    </button>
                  </li>
                ) : null}
                {found.length === 0 && !offerTypedRan ? (
                  <li className="text-xs text-gunmetal/55 py-1.5">No item on either inventory matches.</li>
                ) : null}
              </ul>
            ) : null}
          </>
        )}

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="grow" style={{ minWidth: "14rem" }}>
            <label className="field-label" htmlFor="seal-typed">
              On neither inventory? What it is
            </label>
            <input
              id="seal-typed"
              className="input"
              placeholder="e.g. Cs-137 portable moisture-density gauge"
              value={typedDescription}
              maxLength={200}
              onChange={(e) => setTypedDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="seal-typed-serial">
              Serial
            </label>
            <input
              id="seal-typed-serial"
              className="input"
              style={{ maxWidth: 170 }}
              value={typedSerial}
              maxLength={120}
              onChange={(e) => setTypedSerial(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-secondary" onClick={addTyped}>
            Add
          </button>
        </div>

        {picked.length ? (
          <ul className="mt-3 flex flex-wrap gap-1">
            {picked.map((p) => (
              <li key={pickedId(p)} className="chip red">
                {p.inventory ? inventoryRef(p) : p.description}
                {p.serialNumber ? ` · ${p.serialNumber}` : ""}
                <button
                  type="button"
                  className="ml-1"
                  aria-label={`Drop ${p.description}`}
                  onClick={() => setPicked((cur) => cur.filter((x) => pickedId(x) !== pickedId(p)))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <label className="field-label" htmlFor="seal-notes">
          Notes (optional)
        </label>
        <textarea
          id="seal-notes"
          className="input"
          rows={2}
          maxLength={500}
          placeholder="Seal number, where it is stored, who holds the key…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy || !picked.length || !name} onClick={save}>
          {busy
            ? "Saving…"
            : `Record ${picked.length || ""} as ${sealLabel(action).toLowerCase()}`.replace("  ", " ")}
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
