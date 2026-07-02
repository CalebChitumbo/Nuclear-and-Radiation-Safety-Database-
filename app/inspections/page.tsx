"use client";

import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { LoadErrorBanner } from "@/components/LoadError";
import { useToast } from "@/components/Toast";
import { useWeek } from "@/lib/weekContext";
import { norm } from "@/lib/rules/matching";
import { todayISO, weekLabelForDate } from "@/lib/rules/week";
import {
  INSPECTION_OUTCOMES,
  INSPECTION_TYPES,
  type Facility,
  type InspectionType,
  type InspectionOutcome,
} from "@/lib/rules/types";

export default function InspectionsPage() {
  const { user, canEditInsp } = useAuth();
  const { weeks } = useWeek();
  const toast = useToast();
  const { data, error, reload } = useStoreData(async (s) => {
    const [facilities, inspections] = await Promise.all([
      s.listFacilities(),
      s.listInspections(),
    ]);
    return { facilities, inspections };
  });

  const [facilityQuery, setFacilityQuery] = useState("");
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [facilityNameFreeText, setFacilityNameFreeText] = useState("");
  const [date, setDate] = useState(() => todayISO());
  const [type, setType] = useState<InspectionType>("Routine Inspection");
  const [outcome, setOutcome] = useState<InspectionOutcome>("Compliant");
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState<InspectionType | "">("");
  const [busy, setBusy] = useState(false);

  const facilities = useMemo(() => data?.facilities || [], [data]);
  const inspections = useMemo(() => data?.inspections || [], [data]);

  // Where this date will land in the reporting calendar — a 2025 typo would
  // otherwise be silently filed into the earliest 2026 week.
  const targetWeek = useMemo(
    () => weekLabelForDate(date, weeks, ""),
    [date, weeks],
  );

  const suggestions = useMemo(() => {
    if (!facilityQuery.trim()) return [];
    const q = norm(facilityQuery);
    return facilities
      .filter((f) => f.nameLower.includes(q))
      .slice(0, 8);
  }, [facilities, facilityQuery]);

  const filtered = useMemo(() => {
    return inspections.filter((i) => !filter || i.type === filter);
  }, [inspections, filter]);

  const selected: Facility | null = facilityId
    ? facilities.find((f) => f.id === facilityId) || null
    : null;

  const submit = async () => {
    if (!user) return;
    const fname = selected ? selected.name : facilityNameFreeText.trim();
    if (!fname) {
      toast.push("Please choose or type a facility name.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      const week = weekLabelForDate(date, weeks, "");
      await s.addInspection({
        date,
        week,
        facilityId: selected ? selected.id : null,
        facilityName: fname,
        type,
        outcome,
        notes,
        province: selected ? selected.province : "",
        sector: selected ? selected.sector : "",
      });
      toast.push(`Inspection logged for ${fname}.`, "success");
      setNotes("");
      setFacilityQuery("");
      setFacilityNameFreeText("");
      setFacilityId(null);
      reload();
    } catch (err) {
      toast.push(
        `Logging the inspection failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 staggered">
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}
      {canEditInsp ? (
        <div className="card p-5">
          <div className="caps text-xs text-gunmetal/60 mb-3">
            Log inspection
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="caps text-[10px] text-gunmetal/60">
                Facility
              </label>
              <div className="relative">
                <input
                  className="input mt-1"
                  placeholder="Search register…"
                  value={
                    selected ? selected.name : facilityQuery
                  }
                  onChange={(e) => {
                    setFacilityQuery(e.target.value);
                    setFacilityId(null);
                    setFacilityNameFreeText(e.target.value);
                  }}
                />
                {suggestions.length > 0 && !selected ? (
                  <ul className="absolute left-0 right-0 mt-1 z-20 card max-h-60 overflow-y-auto">
                    {suggestions.map((f) => (
                      <li
                        key={f.id}
                        onClick={() => {
                          setFacilityId(f.id);
                          setFacilityQuery(f.name);
                        }}
                        className="px-3 py-2 text-sm hover:bg-mist cursor-pointer"
                      >
                        <div className="font-bold">{f.name}</div>
                        <div className="text-xs text-gunmetal/60">
                          {f.facCode || "—"} · {f.district || "—"} ·{" "}
                          {f.province}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="text-[11px] text-gunmetal/55 mt-1">
                Free-text is fine if the facility isn't in the register yet.
              </div>
            </div>
            <div>
              <label className="caps text-[10px] text-gunmetal/60">Date</label>
              <input
                type="date"
                className="input mt-1"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <div className="text-[11px] text-gunmetal/55 mt-1">
                Lands in: <strong>{targetWeek || "(no week match)"}</strong>
              </div>
            </div>
            <div>
              <label className="caps text-[10px] text-gunmetal/60">Type</label>
              <select
                className="input mt-1"
                value={type}
                onChange={(e) => setType(e.target.value as InspectionType)}
              >
                {INSPECTION_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="caps text-[10px] text-gunmetal/60">
                Outcome
              </label>
              <select
                className="input mt-1"
                value={outcome}
                onChange={(e) =>
                  setOutcome(e.target.value as InspectionOutcome)
                }
              >
                {INSPECTION_OUTCOMES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="caps text-[10px] text-gunmetal/60">
                Notes
              </label>
              <textarea
                className="input mt-1"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Findings, follow-up items, etc."
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button disabled={busy} className="btn btn-primary" onClick={submit}>
              {busy ? "Saving…" : "Log inspection"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="caps text-xs text-gunmetal/60">
            {filtered.length} inspections
          </div>
          <div className="inline-flex rounded-lg overflow-hidden border border-gunmetal/10">
            {([
              "",
              ...INSPECTION_TYPES,
            ] as Array<"" | InspectionType>).map((t) => (
              <button
                key={t || "all"}
                aria-pressed={filter === t}
                onClick={() => setFilter(t)}
                className="px-3 py-1.5 text-xs caps font-bold"
                style={{
                  background:
                    filter === t ? "var(--rpa-green)" : "transparent",
                  color: filter === t ? "white" : "var(--gunmetal)",
                }}
              >
                {t || "All"}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-4 divide-y divide-gunmetal/8">
          {filtered.map((i) => (
            <li
              key={i.id}
              className="py-3 flex items-start justify-between gap-3"
            >
              <div>
                <div className="font-bold">{i.facilityName}</div>
                <div className="text-xs text-gunmetal/60">
                  <span className="chip slate mr-1">{i.type}</span>
                  <OutcomeChip outcome={i.outcome} />
                </div>
                {i.notes ? (
                  <div className="text-xs text-gunmetal/65 mt-1 whitespace-pre-line">
                    {i.notes}
                  </div>
                ) : null}
              </div>
              <div className="text-xs tabular text-gunmetal/55 text-right">
                <div>{i.date}</div>
                <div>{i.week}</div>
              </div>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="py-6 text-sm text-gunmetal/55">
              No inspections recorded yet.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function OutcomeChip({ outcome }: { outcome: InspectionOutcome }) {
  const map: Record<InspectionOutcome, "green" | "amber" | "red" | "slate"> = {
    Compliant: "green",
    "Minor findings": "amber",
    "Major findings": "amber",
    "Non-compliant": "red",
    "N/A": "slate",
  };
  return <span className={`chip ${map[outcome]}`}>{outcome}</span>;
}
