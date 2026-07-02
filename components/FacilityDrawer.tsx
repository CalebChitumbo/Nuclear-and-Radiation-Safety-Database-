"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Drawer } from "./Drawer";
import { StatusPill } from "./StatusPill";
import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useToast } from "./Toast";
import { detectType } from "@/lib/rules/detectType";
import {
  type Facility,
  type Inspection,
  type LicenceEvent,
  type LicenceType,
  LICENCE_TYPES,
  isUseP,
} from "@/lib/rules/types";

interface Props {
  facilityId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}

export function FacilityDrawer({ facilityId, onClose, onChanged }: Props) {
  const { user, canEditAS } = useAuth();
  const toast = useToast();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [events, setEvents] = useState<LicenceEvent[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [number, setNumber] = useState("");
  const [type, setType] = useState<LicenceType>("New Use/Possession Licence");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [autoType, setAutoType] = useState(true);

  // Targeted reads: one facility doc + its own events/inspections (indexed
  // queries in Firebase mode) instead of downloading three whole collections.
  const loadFacility = useCallback(async (id: string) => {
    const s = await store();
    return Promise.all([
      s.getFacility(id),
      s.listLicenceEventsFor(id),
      s.listInspectionsFor(id),
    ]);
  }, []);

  useEffect(() => {
    if (!facilityId) {
      setFacility(null);
      return;
    }
    // Cancellation guard: switching facilities quickly must not let the slower,
    // stale response win (the drawer's actions key off facility.id).
    let cancelled = false;
    loadFacility(facilityId)
      .then(([f, evs, ins]) => {
        if (cancelled) return;
        setFacility(f);
        setEvents(evs);
        setInspections(ins);
      })
      .catch(() => {
        if (!cancelled) toast.push("Failed to load facility.", "error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId, loadFacility]);

  // Auto-detect from number as user types.
  useEffect(() => {
    if (autoType && number) {
      const detected = detectType(number, type);
      setType(detected);
    }
  }, [number, autoType]); // eslint-disable-line react-hooks/exhaustive-deps

  const usePAuths = useMemo(
    () => (facility?.auths || []).filter((a) => isUseP(a.type)),
    [facility],
  );
  const otherAuths = useMemo(
    () => (facility?.auths || []).filter((a) => !isUseP(a.type)),
    [facility],
  );

  if (!facilityId) return null;

  const effectNote = isUseP(type)
    ? facility?.licensed
      ? "Will be logged as a Use/Possession renewal. Status stays Licensed."
      : "Will set this facility to Licensed."
    : "Recorded as an authorisation the facility holds. Licensing status will not change.";

  const refresh = async (id: string) => {
    const [f, evs, ins] = await loadFacility(id);
    setFacility(f);
    setEvents(evs);
    setInspections(ins);
  };

  const submit = async () => {
    // Busy-guard: a double-click on Record must not log the same licence
    // event (and weekly count) twice.
    if (!facility || !user || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.recordLicences(
        [
          {
            facilityId: facility.id,
            number,
            type,
            date,
          },
        ],
        user.uid,
      );
      toast.push(`Authorisation recorded for ${facility.name}.`, "success");
      setNumber("");
      setAdding(false);
      setAutoType(true);
      onChanged?.();
      await refresh(facility.id);
    } catch (err) {
      toast.push(
        `Recording failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const overrideStatus = async (licensed: boolean) => {
    if (!facility || !user || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.updateFacility(
        facility.id,
        {
          licensed,
          stage: licensed ? "Licensed" : "No Application Submitted",
        },
        user.uid,
      );
      toast.push(
        `Status set to ${licensed ? "Licensed" : "Unlicensed"} (manual override).`,
        "default",
      );
      onChanged?.();
      await refresh(facility.id);
    } catch (err) {
      toast.push(
        `Status change failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={!!facilityId}
      onClose={onClose}
      title={facility ? facility.name : "Facility"}
    >
      {!facility ? (
        <div className="text-sm text-gunmetal/60">Loading…</div>
      ) : (
        <>
          <section>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill licensed={facility.licensed} stage={facility.stage} />
              <span className="chip slate">{facility.sector}</span>
              <span className="chip">{facility.province}</span>
              {facility.facCode ? (
                <span className="chip caps">{facility.facCode}</span>
              ) : null}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <Field label="District" value={facility.district || "—"} />
              <Field label="Practice" value={facility.practice || "—"} />
              <Field label="Stage" value={facility.stage} />
              <Field label="Sequence #" value={String(facility.no || "—")} />
              {facility.currentStatus ? (
                <div className="col-span-2">
                  <Field label="RAIS status" value={facility.currentStatus} />
                </div>
              ) : null}
            </dl>
          </section>

          <section>
            <h3 className="caps text-xs text-gunmetal/60 mb-2">
              Use/Possession — determines licensed status
            </h3>
            {usePAuths.length === 0 ? (
              <div className="text-sm text-gunmetal/55">
                No Use/Possession authorisations on record.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {usePAuths.map((a, i) => (
                  <AuthRow key={`u${i}`} a={a} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="caps text-xs text-gunmetal/60 mb-2">
              Other authorisations — do not change licensed status
            </h3>
            {otherAuths.length === 0 ? (
              <div className="text-sm text-gunmetal/55">
                No other authorisations.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {otherAuths.map((a, i) => (
                  <AuthRow key={`o${i}`} a={a} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="caps text-xs text-gunmetal/60 mb-2">
              Licence events (dated log)
            </h3>
            {events.length === 0 ? (
              <div className="text-sm text-gunmetal/55">No events.</div>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {events.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold">{e.type}</div>
                      <div className="text-xs text-gunmetal/60 tabular">
                        {e.number || "no number"} · {e.week}
                      </div>
                    </div>
                    <div className="text-xs tabular text-gunmetal/55">
                      {e.date}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="caps text-xs text-gunmetal/60 mb-2">Inspections</h3>
            {inspections.length === 0 ? (
              <div className="text-sm text-gunmetal/55">No inspections.</div>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {inspections.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold">{i.type}</div>
                      <div className="text-xs text-gunmetal/60">
                        {i.outcome}
                      </div>
                    </div>
                    <div className="text-xs tabular text-gunmetal/55">
                      {i.date}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4 bg-mist">
            {!adding ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-bold">Add authorisation</div>
                  <div className="text-xs text-gunmetal/60">
                    Records a dated licence event for this facility.
                  </div>
                </div>
                <div className="flex gap-2">
                  {canEditAS ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => setAdding(true)}
                    >
                      + Authorisation
                    </button>
                  ) : null}
                  {canEditAS ? (
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => overrideStatus(!facility.licensed)}
                      title="Manual status override (R6 — no event recorded)"
                    >
                      Toggle status
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="caps text-[10px] text-gunmetal/60">
                      AUTH number
                    </label>
                    <input
                      className="input mt-1"
                      value={number}
                      placeholder="AUTH/USE.REN/0701"
                      onChange={(e) => {
                        setNumber(e.target.value);
                        setAutoType(true);
                      }}
                    />
                  </div>
                  <div>
                    <label className="caps text-[10px] text-gunmetal/60">
                      Date issued
                    </label>
                    <input
                      type="date"
                      className="input mt-1"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="caps text-[10px] text-gunmetal/60">
                    Licence type{" "}
                    {autoType ? (
                      <span className="text-[var(--rpa-green-dark)]">
                        · auto
                      </span>
                    ) : null}
                  </label>
                  <select
                    className="input mt-1"
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value as LicenceType);
                      setAutoType(false);
                    }}
                  >
                    {LICENCE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-gunmetal/65">{effectNote}</div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={submit}
                  >
                    {busy ? "Recording…" : "Record"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setAdding(false);
                      setNumber("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="caps text-[10px] text-gunmetal/60">{label}</dt>
      <dd className="font-bold mt-1">{value}</dd>
    </div>
  );
}

function AuthRow({ a }: { a: { type: string; number: string; date: string } }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <div>
        <div className="font-bold">{a.type}</div>
        <div className="text-xs text-gunmetal/55 tabular">
          {a.number || "no number"}
        </div>
      </div>
      <div className="text-xs tabular text-gunmetal/55">{a.date || "—"}</div>
    </li>
  );
}
