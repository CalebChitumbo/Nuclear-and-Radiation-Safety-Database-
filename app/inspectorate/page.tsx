"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { Bars } from "@/components/Bars";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { PageHeader, Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
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

const PERIOD_OPTIONS: Array<{ value: InspectionPeriod; label: string }> = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];

export default function InspectoratePage() {
  const { user, canEditInsp } = useAuth();
  const { selected } = useWeek();
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
      <PageHeader
        eyebrow="Inspection dashboard"
        title={periodLabel(period, ctx)}
        subtitle="Pre-authorisation · routine · investigation · follow-up · enforcement"
        actions={
          <Segmented
            ariaLabel="Reporting period"
            value={period}
            onChange={setPeriod}
            options={PERIOD_OPTIONS}
          />
        }
      />

      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
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
        <Panel title={`Outcomes — ${periodLabel(period, ctx)}`}>
          {outcomeRows.length === 0 ? (
            <p className="text-sm text-gunmetal/60">
              No inspections in this period yet.
            </p>
          ) : (
            <ul className="divide-y divide-gunmetal/8">
              {outcomeRows.map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <OutcomeChip outcome={r.label as InspectionOutcome} />
                  <span className="tabular font-black">{r.total}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {/* Forward schedule from the Licensing ↔ Inspectorate requests */}
      <Panel
        title={`Inspection schedule — ${schedule.length} in the pipeline`}
        flush
        action={
          <Link className="link-action" href="/inspection-requests">
            Open requests →
          </Link>
        }
      >
        {schedule.length === 0 ? (
          <p className="px-4 sm:px-5 text-sm text-gunmetal/60">
            Nothing scheduled. Requests raised by Licensing appear here and can
            be assigned an inspector and a target date on the Inspection
            Requests tab.
          </p>
        ) : (
          <>
            <div className="hidden md:block table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Facility</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Inspector</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-bold">{r.facilityName}</div>
                        <div className="text-[11px] text-gunmetal/55 tabular">
                          {r.facCode || "—"}
                          {r.province ? ` · ${r.province}` : ""}
                        </div>
                      </td>
                      <td>
                        <span className="chip slate">{r.type}</span>
                      </td>
                      <td>
                        <span
                          className={`chip ${REQUEST_PRIORITY_META[r.priority].chip}`}
                        >
                          {r.priority}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`chip ${REQUEST_STATUS_META[r.status].chip}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td>{r.assignedInspector || "—"}</td>
                      <td className="tabular">
                        {scheduledDate(r) || "unscheduled"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="md:hidden divide-y divide-gunmetal/8">
              {schedule.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold leading-tight break-words">
                        {r.facilityName}
                      </div>
                      <div className="text-[11px] text-gunmetal/55 tabular">
                        {r.facCode || "—"}
                        {r.province ? ` · ${r.province}` : ""}
                      </div>
                    </div>
                    <span className="text-xs tabular text-gunmetal/55 shrink-0">
                      {scheduledDate(r) || "unscheduled"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="chip slate">{r.type}</span>
                    <span
                      className={`chip ${REQUEST_PRIORITY_META[r.priority].chip}`}
                    >
                      {r.priority}
                    </span>
                    <span
                      className={`chip ${REQUEST_STATUS_META[r.status].chip}`}
                    >
                      {r.status}
                    </span>
                  </div>
                  {r.assignedInspector ? (
                    <div className="text-xs text-gunmetal/60 mt-1">
                      Inspector: {r.assignedInspector}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {/* Enforcement actions taken in the period */}
      <Panel title={`Enforcement actions — ${periodLabel(period, ctx)}`} flush>
        {dash.enforcement.length === 0 ? (
          <p className="px-4 sm:px-5 text-sm text-gunmetal/60">
            No enforcement actions in this period.
          </p>
        ) : (
          <ul className="divide-y divide-gunmetal/8">
            {dash.enforcement.map((i) => (
              <InspectionRow key={i.id} inspection={i} />
            ))}
          </ul>
        )}
      </Panel>

      {canEditInsp && user ? (
        <LogInspectionPanel
          facilities={facilities}
          onLogged={reload}
          toastPush={toast.push}
        />
      ) : null}

      <RegisterPanel inspections={inspections} period={period} ctx={ctx} />
    </div>
  );
}

function InspectionRow({
  inspection: i,
  showType,
}: {
  inspection: Inspection;
  showType?: boolean;
}) {
  return (
    <li className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-bold break-words">{i.facilityName}</div>
        <div className="text-xs text-gunmetal/60 mt-1 flex flex-wrap gap-1 items-center">
          {showType ? <span className="chip slate">{i.type}</span> : null}
          <OutcomeChip outcome={i.outcome} />
          {i.province ? <span>{i.province}</span> : null}
        </div>
        {i.notes ? (
          <div className="text-xs text-gunmetal/65 mt-1 whitespace-pre-line">
            {i.notes}
          </div>
        ) : null}
      </div>
      <div className="text-xs tabular text-gunmetal/55 text-right shrink-0">
        <div>{i.date}</div>
        <div>{i.week}</div>
      </div>
    </li>
  );
}

/** The Inspectorate's "log inspection" form (moved here from /inspections). */
function LogInspectionPanel({
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
    <Panel title="Log inspection">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="insp-facility">
            Facility
          </label>
          <div className="relative">
            <input
              id="insp-facility"
              className="input"
              placeholder="Search register…"
              value={selected ? selected.name : facilityQuery}
              onChange={(e) => {
                setFacilityQuery(e.target.value);
                setFacilityId(null);
                setFacilityNameFreeText(e.target.value);
              }}
            />
            {suggestions.length > 0 && !selected ? (
              <ul className="popover absolute left-0 right-0 mt-1 z-20 max-h-60 overflow-y-auto">
                {suggestions.map((f) => (
                  <li
                    key={f.id}
                    onClick={() => {
                      setFacilityId(f.id);
                      setFacilityQuery(f.name);
                    }}
                    className="px-3 py-2.5 text-sm hover:bg-mist cursor-pointer"
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
          <p className="text-[11px] text-gunmetal/55 mt-1">
            Free-text is fine if the facility isn&apos;t in the register yet.
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor="insp-date">
            Date
          </label>
          <input
            id="insp-date"
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className="text-[11px] text-gunmetal/55 mt-1">
            Lands in: <strong>{targetWeek || "(no week match)"}</strong>
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor="insp-type">
            Type
          </label>
          <select
            id="insp-type"
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as InspectionType)}
          >
            {INSPECTION_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="insp-outcome">
            Outcome
          </label>
          <select
            id="insp-outcome"
            className="input"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as InspectionOutcome)}
          >
            {INSPECTION_OUTCOMES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="field-label" htmlFor="insp-notes">
            Notes
          </label>
          <textarea
            id="insp-notes"
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Findings, follow-up items, etc."
          />
        </div>
      </div>
      <button
        disabled={busy}
        className="btn btn-primary mt-3 w-full sm:w-auto"
        onClick={submit}
      >
        {busy ? "Saving…" : "Log inspection"}
      </button>
    </Panel>
  );
}

/** The inspections-conducted register, filtered by the dashboard period. */
function RegisterPanel({
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
    <Panel
      title={`${filtered.length} inspections · ${periodLabel(period, ctx)}`}
      flush
    >
      <div className="px-4 sm:px-5">
        <Segmented
          ariaLabel="Inspection type"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "" as InspectionType | "", label: "All" },
            ...INSPECTION_TYPES.map((t) => ({
              value: t as InspectionType | "",
              label: t.replace(" Inspection", ""),
            })),
          ]}
        />
      </div>
      <ul className="divide-y divide-gunmetal/8 mt-3">
        {filtered.map((i) => (
          <InspectionRow key={i.id} inspection={i} showType />
        ))}
        {filtered.length === 0 ? (
          <li className="px-4 sm:px-5 py-6 text-sm text-gunmetal/55">
            No inspections recorded for this period.
          </li>
        ) : null}
      </ul>
    </Panel>
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
