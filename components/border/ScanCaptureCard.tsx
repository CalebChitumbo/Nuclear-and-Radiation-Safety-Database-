"use client";

/**
 * The border scan capture form — one truck, one card, then straight back to
 * the top for the next one.
 *
 * It asks for five things, in the order the officer learns them at the lane:
 * the number on the unit, what it is carrying, who is carrying it, the dose
 * reading, and — only when the reading is above background — what was done
 * about it. Everything else that used to be written down is derived: the
 * identifier type from its shape, the cargo class from the commodity, the
 * result from the dose, the date/post/officer from the shift header, and the
 * whole tally block from the rows themselves.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { Suggest, type SuggestOption } from "./Suggest";
import { firebaseProjectId } from "@/lib/firebase";
import { store } from "@/lib/store";
import { useToast } from "@/components/Toast";
import {
  CARGO_CLASSES,
  SEED_TRANSPORTERS,
  resolveCommodity,
  searchCommodities,
  type CargoClass,
} from "@/lib/rules/borderCargo";
import {
  DOSE_QUICK_VALUES,
  buildScan,
  doseGuidance,
  doseResult,
  emptyDraft,
  findSameDayScan,
  knownTransporters,
  lastSeenDetails,
  normaliseVehicleId,
  nowHHMM,
  scanWriteErrorMessage,
  validateScan,
  vehicleIdKind,
  type ScanDraft,
} from "@/lib/rules/borderScans";
import { SCAN_ACTIONS, type ScanDirection, type TruckScan } from "@/lib/rules/types";

const RESULT_COLOUR: Record<string, string> = {
  Normal: "var(--rpa-green-dark)",
  Elevated: "#7a5b07",
  Alarm: "var(--status-stalled)",
};

export function ScanCaptureCard({
  border,
  date,
  week,
  direction,
  officer,
  todaysScans,
  recentScans,
  onSaved,
}: {
  border: string;
  date: string;
  week: string;
  direction: ScanDirection;
  officer: { uid: string; name: string; role: string; section: string };
  /** This post's scans for this date — duplicate detection and quick picks. */
  todaysScans: TruckScan[];
  /** The wider recent window — transporter list and "last seen" lookups. */
  recentScans: TruckScan[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<ScanDraft>(() => emptyDraft(direction));
  const [touched, setTouched] = useState(false);
  const [confirmedImplausible, setConfirmedImplausible] = useState(false);
  const [duplicateOk, setDuplicateOk] = useState(false);
  const [showRemarks, setShowRemarks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const vehicleRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ScanDraft>(key: K, value: ScanDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // The shift header owns the direction; changing it up there changes it here.
  useEffect(() => {
    setDraft((d) => ({ ...d, direction }));
  }, [direction]);

  const validation = validateScan(draft, { confirmedImplausible });
  const resolved = draft.commodity.trim()
    ? resolveCommodity(draft.commodity, draft.cargoClass)
    : null;
  const doseValue = Number(draft.dose);
  const result = doseResult(doseValue);
  const needsAction = draft.dose.trim() !== "" && result !== "Normal";

  const duplicate = useMemo(
    () => findSameDayScan(todaysScans, draft.vehicleId, border, date),
    [todaysScans, draft.vehicleId, border, date],
  );
  const previously = useMemo(
    () => (duplicate ? null : lastSeenDetails(recentScans, draft.vehicleId)),
    [recentScans, draft.vehicleId, duplicate],
  );

  // Commodity suggestions: what this post has actually carried today first,
  // then the controlled vocabulary.
  const commodityOptions: SuggestOption[] = useMemo(() => {
    const query = draft.commodity;
    const seen = new Set<string>();
    const out: SuggestOption[] = [];
    if (!query.trim()) {
      for (const s of todaysScans) {
        if (seen.has(s.commodity)) continue;
        seen.add(s.commodity);
        out.push({ value: s.commodity, badge: s.cargoClass, hint: "logged today" });
        if (out.length >= 5) break;
      }
    }
    for (const c of searchCommodities(query, 10)) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      out.push({ value: c.name, badge: c.class, hint: c.hint });
    }
    return out;
  }, [draft.commodity, todaysScans]);

  const transporterOptions: SuggestOption[] = useMemo(() => {
    const all = knownTransporters(recentScans, SEED_TRANSPORTERS, border);
    const q = draft.transporter.trim().toUpperCase();
    const matched = q
      ? all.filter((t) => t.toUpperCase().includes(q))
      : all.slice(0, 8);
    return matched.slice(0, 10).map((value) => ({ value }));
  }, [recentScans, border, draft.transporter]);

  const vehicleId = normaliseVehicleId(draft.vehicleId);
  const idKind = vehicleId ? vehicleIdKind(vehicleId) : null;

  const reset = () => {
    setDraft(emptyDraft(direction));
    setTouched(false);
    setConfirmedImplausible(false);
    setDuplicateOk(false);
    setShowRemarks(false);
    vehicleRef.current?.focus();
  };

  const save = async () => {
    setTouched(true);
    if (busy) return;
    if (!validation.ok) return;
    if (duplicate && !duplicateOk) return;

    setBusy(true);
    try {
      const s = await store();
      await s.addTruckScan(
        buildScan(draft, {
          date,
          week,
          border,
          time: nowHHMM(),
          officerUid: officer.uid,
          officerName: officer.name,
        }),
      );
      setSavedCount((n) => n + 1);
      if (validation.result !== "Normal") {
        toast.push(
          `${vehicleId} logged at ${validation.doseNSvH} nSv/h — ${validation.result.toLowerCase()}.`,
          "success",
        );
      }
      reset();
      onSaved();
    } catch (err) {
      toast.push(
        `Could not save the scan. ${scanWriteErrorMessage(err, {
          role: officer.role,
          section: officer.section,
          projectId: firebaseProjectId,
        })}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const err = (field: keyof typeof validation.errors) =>
    touched ? validation.errors[field] : undefined;

  return (
    <form
      className="card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="font-black text-lg">Log a scanned truck</div>
        <div className="caps text-[10px] text-gunmetal/55">
          {savedCount ? `${savedCount} saved this session` : "Enter saves and clears"}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1 — the number on the unit */}
        <div className="sm:col-span-2">
          <Suggest
            label="Registration / chassis number"
            value={draft.vehicleId}
            onChange={(v) => {
              set("vehicleId", v);
              setDuplicateOk(false);
            }}
            options={[]}
            placeholder="T470ENT or KDH201-0226320"
            uppercase
            autoFocus
            inputRef={vehicleRef}
            error={err("vehicleId")}
            note={
              idKind
                ? `${idKind === "Chassis" ? "Chassis number" : idKind === "VIN" ? "VIN" : idKind === "Plate" ? "Registration plate" : "Unrecognised format — check it"} · ${vehicleId}`
                : undefined
            }
          />

          {duplicate ? (
            <div
              className="mt-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: "rgba(224,163,46,0.14)" }}
            >
              <span className="font-bold">Already scanned today</span> at{" "}
              {duplicate.time || "—"} — {duplicate.commodity},{" "}
              {duplicate.doseNSvH} nSv/h.{" "}
              <button
                type="button"
                className="font-bold underline"
                onClick={() => setDuplicateOk(true)}
              >
                {duplicateOk ? "Logging a second pass ✓" : "This is a second pass"}
              </button>
            </div>
          ) : previously ? (
            <button
              type="button"
              className="mt-2 text-xs text-left"
              style={{ color: "var(--rpa-green-dark)" }}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  commodity: previously.commodity,
                  cargoClass: previously.cargoClass,
                  transporter: previously.transporter,
                }))
              }
            >
              Last time: {previously.commodity} · {previously.transporter} — use
              these ↵
            </button>
          ) : null}
        </div>

        {/* 2 — what it is carrying (the class follows from the answer) */}
        <div>
          <Suggest
            label="Cargo"
            value={draft.commodity}
            onChange={(v) => set("commodity", v)}
            onPick={(o) => {
              const match = resolveCommodity(o.value);
              if (match) set("cargoClass", match.class);
            }}
            options={commodityOptions}
            placeholder="Start typing — e.g. sul"
            error={err("commodity")}
            note={
              resolved
                ? resolved.known
                  ? `${resolved.class}${resolved.norm ? " · commonly NORM-bearing" : ""}`
                  : "New commodity — pick its class below"
                : undefined
            }
          />

          {/* Only asked when the vocabulary cannot answer it. */}
          {resolved && !resolved.known ? (
            <div className="flex gap-1.5 mt-2">
              {CARGO_CLASSES.map((c) => (
                <ClassChip
                  key={c}
                  label={c}
                  active={draft.cargoClass === c}
                  onClick={() => set("cargoClass", c)}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* 3 — who is carrying it */}
        <div>
          <Suggest
            label="Transporter / declarant"
            value={draft.transporter}
            onChange={(v) => set("transporter", v)}
            options={transporterOptions}
            placeholder="Start typing"
            error={err("transporter")}
          />
        </div>

        {/* 4 — the reading */}
        <div className="sm:col-span-2">
          <label className="caps text-[10px] text-gunmetal/60" htmlFor="dose">
            Dose rate (nSv/h)
          </label>
          <div className="flex gap-2 mt-1 items-start">
            <input
              id="dose"
              className="input tabular"
              style={{
                maxWidth: 130,
                borderColor: err("dose") ? "var(--status-stalled)" : undefined,
              }}
              inputMode="decimal"
              autoComplete="off"
              value={draft.dose}
              placeholder="90"
              aria-invalid={!!err("dose")}
              onChange={(e) => {
                set("dose", e.target.value);
                setConfirmedImplausible(false);
              }}
            />
            <div className="flex flex-wrap gap-1">
              {DOSE_QUICK_VALUES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold tabular border"
                  style={{
                    borderColor:
                      draft.dose === String(v)
                        ? "var(--rpa-green)"
                        : "rgba(26,27,29,0.14)",
                    background:
                      draft.dose === String(v) ? "rgba(0,160,80,0.10)" : "var(--white)",
                  }}
                  onClick={() => {
                    set("dose", String(v));
                    setConfirmedImplausible(false);
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {err("dose") ? (
            <div className="text-[11px] mt-1" style={{ color: "var(--status-stalled)" }}>
              {validation.errors.dose}{" "}
              {/^\d+(\.\d+)?$/.test(draft.dose.trim()) ? (
                <button
                  type="button"
                  className="font-bold underline"
                  onClick={() => setConfirmedImplausible(true)}
                >
                  The reading really is {draft.dose}
                </button>
              ) : null}
            </div>
          ) : draft.dose.trim() ? (
            <div className="text-[11px] mt-1 flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: RESULT_COLOUR[result] }}
                aria-hidden="true"
              />
              <span style={{ color: RESULT_COLOUR[result] }} className="font-bold">
                {result}
              </span>
              <span className="text-gunmetal/60">{doseGuidance(doseValue)}</span>
            </div>
          ) : null}
        </div>

        {/* 5 — only when the reading is above background */}
        {needsAction ? (
          <div className="sm:col-span-2">
            <label className="caps text-[10px] text-gunmetal/60" htmlFor="action">
              Action taken
            </label>
            <select
              id="action"
              className="input mt-1"
              value={draft.action || ""}
              aria-invalid={!!err("action")}
              style={{
                borderColor: err("action") ? "var(--status-stalled)" : undefined,
              }}
              onChange={(e) =>
                set("action", (e.target.value || undefined) as ScanDraft["action"])
              }
            >
              <option value="">Select what was done…</option>
              {SCAN_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            {err("action") ? (
              <div
                className="text-[11px] mt-1"
                style={{ color: "var(--status-stalled)" }}
              >
                {validation.errors.action}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Remarks stay out of the way until they are wanted. */}
        <div className="sm:col-span-2">
          {showRemarks || draft.remarks ? (
            <>
              <label className="caps text-[10px] text-gunmetal/60" htmlFor="remarks">
                Remarks (optional)
              </label>
              <input
                id="remarks"
                className="input mt-1"
                value={draft.remarks || ""}
                onChange={(e) => set("remarks", e.target.value)}
                placeholder="Anything the weekly report should know"
              />
            </>
          ) : (
            <button
              type="button"
              className="text-xs caps font-bold text-gunmetal/55"
              onClick={() => setShowRemarks(true)}
            >
              + Add a remark
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button
          type="submit"
          className="btn btn-primary flex-1 sm:flex-none"
          style={{ padding: "0.75rem 1.5rem", borderRadius: 12 }}
          disabled={busy || (!!duplicate && !duplicateOk)}
        >
          {busy ? "Saving…" : "Save & next"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={reset}>
          Clear
        </button>
        {touched && !validation.ok ? (
          <span className="text-xs text-gunmetal/55">
            {Object.keys(validation.errors).length} field
            {Object.keys(validation.errors).length === 1 ? "" : "s"} to fix
          </span>
        ) : null}
      </div>
    </form>
  );
}

function ClassChip({
  label,
  active,
  onClick,
}: {
  label: CargoClass;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-bold border"
      style={{
        background: active ? "var(--rpa-green)" : "var(--white)",
        color: active ? "white" : "var(--gunmetal)",
        borderColor: active ? "var(--rpa-green)" : "rgba(26,27,29,0.14)",
      }}
    >
      {label}
    </button>
  );
}
