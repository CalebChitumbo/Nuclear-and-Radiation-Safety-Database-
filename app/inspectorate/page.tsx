"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { Bars } from "@/components/Bars";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { useToast } from "@/components/Toast";
import { useWeek } from "@/lib/weekContext";
import { norm } from "@/lib/rules/matching";
import { todayISO, weekLabelForDate } from "@/lib/rules/week";
import {
  deriveInspectorateDashboard,
  deriveInspectionSchedule,
  inspectionInPeriod,
  periodLabel,
  scheduledDate,
  type InspectionPeriod,
  type PeriodContext,
} from "@/lib/rules/inspectionStats";
import {
  REQUEST_PRIORITY_META,
  REQUEST_STATUS_META,
} from "@/lib/rules/inspectionRequests";
import {
  INSPECTION_OUTCOMES,
  INSPECTION_TYPES,
  type Facility,
  type Inspection,
  type InspectionType,
  type InspectionOutcome,
} from "@/lib/rules/types";

const PERIOD_OPTIONS: Array<{ key: InspectionPeriod; label: string }> = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

export default function InspectoratePage() {
  const { user, canEditInsp } = useAuth();
  const { weeks, selected } = useWeek();
  const toast = useToast();
  const { data, error, reload } = useStoreData(async (s) => {
    const [facilities, inspections, requests] = await Promise.all([
      s.listFacilities(),
      s.listInspections(),
      // Secondary: the schedule must not break the dashboard if the
      // inspectionRequests rules aren't deployed yet.
      s.listInspectionRequests().catch(() => []),
    ]);
    return { facilities, inspections, requests };
  });

  const [period, setPeriod] = useState<InspectionPeriod>("year");

  const facilities = useMemo(() => data?.facilities || [], [data]);
  const inspections = useMemo(() => data?.inspections || [], [data]);
  const requests = useMemo(() => data?.requests || [], [data]);

  const ctx: PeriodContext = useMemo(
    () => ({ week: selected, today: todayISO() }),
    [selected],
  );

  const dash = useMemo(
    () => deriveInspectorateDashboard(inspections, period, ctx),
    [inspections, period, ctx],
  );
  const schedule = useMemo(() => deriveInspectionSchedule(requests), [requests]);

  const typeRows = INSPECTION_TYPES.map((t) => ({
    label: t,
    total: dash.byType[t] || 0,
  }));
  const outcomeRows = INSPECTION_OUTCOMES.map((o) => ({
    label: o,
    total: dash.byOutcome[o] || 0,
  })).filter((r) => r.total > 0);

  return (
    <div className="space-y-4 staggered">
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}

      {/* Period filter — inspected facilities in a week, a month, or a year */}
      <div className="card p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="caps text-xs text-gunmetal/60">
            Inspection dashboard
          </div>
          <div className="text-xl font-black">{periodLabel(period, ctx)}</div>
          <div className="text-xs text-gunmetal/60">
            Pre-authorisation · routine · investigation · follow-up ·
            enforcement
          </div>
        </div>
        <div className="inline-flex rounded-lg overflow-hidden border border-gunmetal/10">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.key}
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
              className="px-3 py-1.5 text-xs caps font-bold"
              style={{
                background: period === p.key ? "var(--rpa-green)" : "transparent",
                color: period === p.key ? "white" : "var(--gunmetal)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Inspections conducted" value={dash.total} />
        <Kpi
          label="Facilities inspected"
          value={dash.facilities}
          accent="green"
          caption="Distinct facilities in the period"
        />
        <Kpi
          label="Enforcement actions"
          value={dash.enforcement.length}
          accent="red"
        />
        <Kpi
          label="Needs follow-up"
          value={dash.needsFollowUp}
          accent="amber"
          caption="Major findings or non-compliant"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bars
          title={`Inspections by type — ${periodLabel(period, ctx)}`}
          rows={typeRows}
        />
        <div className="card p-5">
          <div className="caps text-xs text-gunmetal/60 mb-3">
            Outcomes — {periodLabel(period, ctx)}
          </div>
          {outcomeRows.length === 0 ? (
            <div className="text-sm text-gunmetal/60">
              No inspections in this period yet.
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {outcomeRows.map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between gap-3"
                >
                  <OutcomeChip outcome={r.label as InspectionOutcome} />
                  <span className="tabular font-black">{r.total}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Forward schedule from the Licensing ↔ Inspectorate requests */}
      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gunmetal/8 flex items-center justify-between flex-wrap gap-2">
          <div className="font-black">
            Inspection schedule
            <span className="text-xs text-gunmetal/55 font-normal ml-2">
              {schedule.length} in the pipeline
            </span>
          </div>
          <Link
            className="text-xs caps font-bold text-[var(--rpa-green-dark)]"
            href="/inspection-requests"
          >
            Open inspection requests →
          </Link>
        </div>
        {schedule.length === 0 ? (
          <div className="p-6 text-sm text-gunmetal/60">
            Nothing scheduled. Requests raised by Licensing appear here and can
            be assigned an inspector and a target date on the Inspection
            Requests tab.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs caps text-gunmetal/55">
                  <th className="px-5 py-2">Facility</th>
                  <th className="px-5 py-2">Type</th>
                  <th className="px-5 py-2">Priority</th>
                  <th className="px-5 py-2">Status</th>
                  <th className="px-5 py-2">Inspector</th>
                  <th className="px-5 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((r) => (
                  <tr key={r.id} className="border-t border-gunmetal/8">
                    <td className="px-5 py-2">
                      <div className="font-bold">{r.facilityName}</div>
                      <div className="text-[11px] text-gunmetal/55 tabular">
                        {r.facCode || "—"}
                        {r.province ? ` · ${r.province}` : ""}
                      </div>
                    </td>
                    <td className="px-5 py-2">
                      <span className="chip slate">{r.type}</span>
                    </td>
                    <td className="px-5 py-2">
                      <span
                        className={`chip ${REQUEST_PRIORITY_META[r.priority].chip}`}
                      >
                        {r.priority}
                      </span>
                    </td>
                    <td className="px-5 py-2">
                      <span
                        className={`chip ${REQUEST_STATUS_META[r.status].chip}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-2">{r.assignedInspector || "—"}</td>
                    <td className="px-5 py-2 tabular">
                      {scheduledDate(r) || "unscheduled"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Enforcement actions taken in the period */}
      <section className="card p-5">
        <div className="caps text-xs text-gunmetal/60 mb-3">
          Enforcement actions — {periodLabel(period, ctx)}
        </div>
        {dash.enforcement.length === 0 ? (
          <div className="text-sm text-gunmetal/60">
            No enforcement actions in this period.
          </div>
        ) : (
          <ul className="divide-y divide-gunmetal/8">
            {dash.enforcement.map((i) => (
              <li
                key={i.id}
                className="py-3 flex items-start justify-between gap-3"
              >
                <div>
                  <div className="font-bold">{i.facilityName}</div>
                  <div className="text-xs text-gunmetal/60">
                    <OutcomeChip outcome={i.outcome} />
                    {i.province ? (
                      <span className="ml-2">{i.province}</span>
                    ) : null}
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
          </ul>
        )}
      </section>

      {canEditInsp && user ? (
        <LogInspectionCard
          facilities={facilities}
          onLogged={reload}
          toastPush={toast.push}
        />
      ) : null}

      <RegisterCard inspections={inspections} period={period} ctx={ctx} />
    </div>
  );
}

/** The Inspectorate's "log inspection" form (moved here from /inspections). */
function LogInspectionCard({
  facilities,
  onLogged,
  toastPush,
}: {
  facilities: Facility[];
  onLogged: () => void;
  toastPush: (msg: string, kind?: "success" | "error") => void;
}) {
  const { weeks } = useWeek();
  const [facilityQuery, setFacilityQuery] = useState("");
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [facilityNameFreeText, setFacilityNameFreeText] = useState("");
  const [date, setDate] = useState(() => todayISO());
  const [type, setType] = useState<InspectionType>("Routine Inspection");
  const [outcome, setOutcome] = useState<InspectionOutcome>("Compliant");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Where this date will land in the reporting calendar — a 2025 typo would
  // otherwise be silently filed into the earliest 2026 week.
  const targetWeek = useMemo(
    () => weekLabelForDate(date, weeks, ""),
    [date, weeks],
  );

  const suggestions = useMemo(() => {
    if (!facilityQuery.trim()) return [];
    const q = norm(facilityQuery);
    return facilities.filter((f) => f.nameLower.includes(q)).slice(0, 8);
  }, [facilities, facilityQuery]);

  const selected: Facility | null = facilityId
    ? facilities.find((f) => f.id === facilityId) || null
    : null;

  const submit = async () => {
    const fname = selected ? selected.name : facilityNameFreeText.trim();
    if (!fname) {
      toastPush("Please choose or type a facility name.", "error");
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
      toastPush(`Inspection logged for ${fname}.`, "success");
      setNotes("");
      setFacilityQuery("");
      setFacilityNameFreeText("");
      setFacilityId(null);
      onLogged();
    } catch (err) {
      toastPush(
        `Logging the inspection failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="caps text-xs text-gunmetal/60 mb-3">Log inspection</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="caps text-[10px] text-gunmetal/60">Facility</label>
          <div className="relative">
            <input
              className="input mt-1"
              placeholder="Search register…"
              value={selected ? selected.name : facilityQuery}
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
                      {f.facCode || "—"} · {f.district || "—"} · {f.province}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="text-[11px] text-gunmetal/55 mt-1">
            Free-text is fine if the facility isn&apos;t in the register yet.
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
          <label className="caps text-[10px] text-gunmetal/60">Outcome</label>
          <select
            className="input mt-1"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as InspectionOutcome)}
          >
            {INSPECTION_OUTCOMES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="caps text-[10px] text-gunmetal/60">Notes</label>
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
  );
}

/** The inspections-conducted register, filtered by the dashboard period. */
function RegisterCard({
  inspections,
  period,
  ctx,
}: {
  inspections: Inspection[];
  period: InspectionPeriod;
  ctx: PeriodContext;
}) {
  const [filter, setFilter] = useState<InspectionType | "">("");

  const filtered = useMemo(
    () =>
      inspections.filter(
        (i) =>
          inspectionInPeriod(i, period, ctx) && (!filter || i.type === filter),
      ),
    [inspections, filter, period, ctx],
  );

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="caps text-xs text-gunmetal/60">
          {filtered.length} inspections · {periodLabel(period, ctx)}
        </div>
        <div className="inline-flex rounded-lg overflow-hidden border border-gunmetal/10">
          {(["", ...INSPECTION_TYPES] as Array<"" | InspectionType>).map(
            (t) => (
              <button
                key={t || "all"}
                aria-pressed={filter === t}
                onClick={() => setFilter(t)}
                className="px-3 py-1.5 text-xs caps font-bold"
                style={{
                  background: filter === t ? "var(--rpa-green)" : "transparent",
                  color: filter === t ? "white" : "var(--gunmetal)",
                }}
              >
                {t || "All"}
              </button>
            ),
          )}
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
            No inspections recorded for this period.
          </li>
        ) : null}
      </ul>
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
