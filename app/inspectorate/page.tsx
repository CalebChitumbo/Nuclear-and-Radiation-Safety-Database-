"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { downloadTextFile } from "@/components/downloadFile";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { PageHeader, Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
import { useToast } from "@/components/Toast";
import {
  CardStatusChip,
  EnforcementChip,
  InspectionDatabaseTable,
} from "@/components/inspectorate/InspectionDatabaseTable";
import { InspectionSummaryTable } from "@/components/inspectorate/InspectionSummaryTable";
import { useWeek } from "@/lib/weekContext";
import { norm } from "@/lib/rules/matching";
import { toCsv } from "@/lib/rules/exportCsv";
import { todayISO, weekLabelForDate } from "@/lib/rules/week";
import {
  buildInspectionDatabase,
  cardExpiry,
  cardsDue,
  databaseCsvRows,
  summariseInspectionDatabase,
  summaryCsvRows,
  DATABASE_CSV_HEADER,
  ENFORCEMENT_ACTIONS,
  type EnforcementAction,
} from "@/lib/rules/inspectionDatabase";
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

const ALL_ROUNDS = "__all__";

/** Which part of a round's coverage list the sheet shows. */
type Coverage = "inspected" | "pending" | "all";

/** Rows rendered before the sheet offers to show the rest. */
const SHEET_PAGE = 100;

/**
 * The Inspectorate dashboard, in the shape of the section's own inspection
 * database: the Summary sheet's province rounds and their INSPECTIONS /
 * ENGAGEMENTS / OTHER ENFORCEMENTS columns, and under it the province sheet —
 * a facility per row with its inspection-type counts, the enforcement action
 * taken and the inspection card's issue date, expiry and status.
 *
 * The difference from the workbook is that nothing here is typed twice: the
 * whole database is derived from the dated inspection register, so logging one
 * inspection moves the facility row, the province summary, the card list and
 * the weekly report at once.
 */
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
  const [round, setRound] = useState<string>(ALL_ROUNDS);
  const [coverage, setCoverage] = useState<Coverage>("inspected");
  const [limit, setLimit] = useState(SHEET_PAGE);

  const facilities = useMemo(() => data?.facilities || [], [data]);
  const inspections = useMemo(() => data?.inspections || [], [data]);
  const requests = useMemo(() => data?.requests || [], [data]);

  const today = todayISO();
  const ctx: PeriodContext = useMemo(
    () => ({ week: selected, today }),
    [selected, today],
  );

  const inPeriod = useMemo(
    () => inspections.filter((i) => inspectionInPeriod(i, period, ctx)),
    [inspections, period, ctx],
  );

  // The consolidated Database sheet for the period, and the Summary rolled up
  // from it — the two views the workbook keeps side by side.
  const rows = useMemo(
    () => buildInspectionDatabase(inPeriod, facilities, { today }),
    [inPeriod, facilities, today],
  );
  const summary = useMemo(() => summariseInspectionDatabase(rows), [rows]);
  const due = useMemo(() => cardsDue(rows), [rows]);

  const dash = useMemo(
    () => deriveInspectorateDashboard(inspections, period, ctx),
    [inspections, period, ctx],
  );
  const schedule = useMemo(() => deriveInspectionSchedule(requests), [requests]);

  // A province sheet lists everything the round has to cover, so drilling into
  // an unphased province brings its not-yet-inspected facilities with it. A
  // phase is a chosen subset of the province, so it shows only its own rows.
  const sheetRows = useMemo(() => {
    if (round === ALL_ROUNDS) return rows;
    const picked = summary.rows.find((s) => s.round === round);
    if (!picked || picked.phase) return rows.filter((r) => r.round === round);
    return buildInspectionDatabase(inPeriod, facilities, {
      today,
      province: picked.province,
      includeUninspected: true,
    }).filter((r) => r.round === round);
  }, [round, rows, summary.rows, inPeriod, facilities, today]);

  // Changing what the sheet shows starts its list again from the top.
  const pickRound = (r: string) => {
    setRound(r);
    setLimit(SHEET_PAGE);
  };
  const pickCoverage = (c: Coverage) => {
    setCoverage(c);
    setLimit(SHEET_PAGE);
  };
  const pickPeriod = (p: InspectionPeriod) => {
    setPeriod(p);
    setLimit(SHEET_PAGE);
  };

  const coverageCounts = useMemo(
    () => ({
      inspected: sheetRows.filter((r) => r.total > 0 || r.enforcements.length).length,
      pending: sheetRows.filter((r) => r.total === 0 && !r.enforcements.length).length,
    }),
    [sheetRows],
  );

  const shown = useMemo(() => {
    if (coverage === "all" || coverageCounts.pending === 0) return sheetRows;
    const done = (r: (typeof sheetRows)[number]) =>
      r.total > 0 || r.enforcements.length > 0;
    return sheetRows.filter((r) => (coverage === "inspected" ? done(r) : !done(r)));
  }, [sheetRows, coverage, coverageCounts.pending]);

  // Phases already in use, offered back on the logging form.
  const knownPhases = useMemo(() => {
    const set = new Set<string>();
    for (const i of inspections) {
      const p = (i.phase || "").trim();
      if (p) set.add(p);
    }
    return [...set].sort();
  }, [inspections]);

  const outcomeRows = INSPECTION_OUTCOMES.map((o) => ({
    label: o,
    total: dash.byOutcome[o] || 0,
  })).filter((r) => r.total > 0);

  const enforced = useMemo(
    () => inPeriod.filter((i) => !!i.enforcement || i.type === "Enforcement Action"),
    [inPeriod],
  );

  // What is on screen is what is exported: the consolidated database, or the
  // picked round's whole sheet (zeros included, as the workbook keeps it).
  const exportDatabase = () => {
    const slug = round === ALL_ROUNDS ? "all" : round.toLowerCase().replace(/\s+/g, "-");
    downloadTextFile(
      `inspection-database-${slug}-${period}-${today}.csv`,
      toCsv(DATABASE_CSV_HEADER, databaseCsvRows(sheetRows)),
    );
  };

  const exportSummary = () => {
    const lines = summaryCsvRows(summary);
    downloadTextFile(
      `inspection-summary-${period}-${today}.csv`,
      toCsv(lines[0], lines.slice(1)),
    );
  };

  return (
    <div className="space-y-4 staggered">
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}

      <PageHeader
        eyebrow="Inspection database"
        title={periodLabel(period, ctx)}
        subtitle="Pre-auth · planned · follow-up · investigative — with the enforcement actions taken and every inspection card's standing"
        actions={
          <Segmented
            ariaLabel="Reporting period"
            value={period}
            onChange={pickPeriod}
            options={PERIOD_OPTIONS}
          />
        }
      />

      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total inspections conducted"
          value={summary.total.inspectionsTotal}
        />
        <Kpi
          label="Facilities inspected"
          value={summary.total.facilities}
          accent="green"
          caption="Distinct facilities in the period"
        />
        <Kpi
          label="Total enforcements"
          value={summary.total.enforcementTotal}
          accent="red"
          caption="Engagements + other enforcement actions"
        />
        <Kpi
          label="Cards due"
          value={due.length}
          accent="amber"
          caption="Expired or inside their last fortnight"
        />
      </section>

      {/* The Summary sheet — province rounds down, the workbook's bands across */}
      <Panel
        title={`Summary — ${periodLabel(period, ctx)}`}
        flush
        note="Tap a province to open its sheet."
        action={
          <button className="link-action" onClick={exportSummary}>
            Export summary ↓
          </button>
        }
      >
        <InspectionSummaryTable
          summary={summary}
          activeRound={round === ALL_ROUNDS ? undefined : round}
          onPickRound={(r) => pickRound(r === round ? ALL_ROUNDS : r)}
        />
      </Panel>

      {/* A province sheet — or the consolidated database when none is picked */}
      <Panel
        title={
          round === ALL_ROUNDS
            ? `Database — ${shown.length} facilities`
            : `${round} — ${shown.length} facilities`
        }
        flush
        action={
          <button className="link-action" onClick={exportDatabase}>
            Export database ↓
          </button>
        }
      >
        <div className="px-4 sm:px-5 pb-3 space-y-2">
          <Segmented
            ariaLabel="Province"
            value={round}
            onChange={pickRound}
            options={[
              { value: ALL_ROUNDS, label: "All provinces" },
              ...summary.rows.map((s) => ({ value: s.round, label: s.round })),
            ]}
          />
          {/* A province sheet carries the round's whole coverage list, so it
              also answers "who have we not reached yet". */}
          {coverageCounts.pending > 0 ? (
            <Segmented
              ariaLabel="Coverage"
              value={coverage}
              onChange={pickCoverage}
              options={[
                {
                  value: "inspected" as Coverage,
                  label: `Inspected (${coverageCounts.inspected})`,
                },
                {
                  value: "pending" as Coverage,
                  label: `Not yet inspected (${coverageCounts.pending})`,
                },
                { value: "all" as Coverage, label: "All" },
              ]}
            />
          ) : null}
        </div>
        <InspectionDatabaseTable
          rows={shown.slice(0, limit)}
          showRound={round === ALL_ROUNDS}
        />
        {shown.length > limit ? (
          <div className="px-4 sm:px-5 py-3 border-t border-gunmetal/8">
            <button
              className="btn btn-ghost w-full sm:w-auto"
              onClick={() => setLimit(shown.length)}
            >
              Show all {shown.length} facilities
            </button>
          </div>
        ) : null}
      </Panel>

      {/* Inspection cards — the column the workbook keeps to chase re-issues */}
      <Panel title={`Inspection cards due — ${due.length}`} flush>
        {due.length === 0 ? (
          <p className="px-4 sm:px-5 text-sm text-gunmetal/60">
            No card is expired or inside its last fortnight. A card runs 30 days
            from the day it is issued.
          </p>
        ) : (
          <ul className="divide-y divide-gunmetal/8">
            {due.map((r) => (
              <li
                key={`${r.round}::${r.facilityId || r.facility}`}
                className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-bold break-words">{r.facility}</div>
                  <div className="text-[11px] text-gunmetal/55">
                    {r.round}
                    {r.district ? ` · ${r.district}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <CardStatusChip status={r.cardStatus} />
                  <div className="text-[11px] text-gunmetal/55 tabular mt-1">
                    {r.cardIssued} → {r.cardExpiry}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Enforcement actions taken in the period */}
      <Panel
        title={`Enforcement actions — ${enforced.length}`}
        flush
        note="Every action recorded against an inspection, newest first."
      >
        {enforced.length === 0 ? (
          <p className="px-4 sm:px-5 text-sm text-gunmetal/60">
            No enforcement actions in this period.
          </p>
        ) : (
          <ul className="divide-y divide-gunmetal/8">
            {[...enforced]
              .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
              .map((i) => (
                <InspectionRow key={i.id} inspection={i} showType />
              ))}
          </ul>
        )}
      </Panel>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        <Panel
          title={`Needs follow-up — ${dash.needsFollowUp}`}
          note="Major findings or non-compliant outcomes in the period."
        >
          <p className="text-sm text-gunmetal/60">
            {dash.needsFollowUp === 0
              ? "Nothing outstanding from this period's findings."
              : `${dash.needsFollowUp} inspection${dash.needsFollowUp === 1 ? "" : "s"} closed with major findings or a non-compliant outcome. Each one is a follow-up inspection waiting to be logged against the same facility.`}
          </p>
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

      {canEditInsp && user ? (
        <LogInspectionPanel
          facilities={facilities}
          knownPhases={knownPhases}
          onLogged={reload}
          toastPush={toast.push}
        />
      ) : null}

      <RegisterPanel inspections={inPeriod} period={period} ctx={ctx} />
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
          {i.enforcement ? <EnforcementChip action={i.enforcement} /> : null}
          {i.province ? <span>{i.province}</span> : null}
          {i.phase ? <span>· {i.phase}</span> : null}
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
        {i.cardIssued ? <div>card {i.cardIssued}</div> : null}
      </div>
    </li>
  );
}

/**
 * The Inspectorate's logging form. It asks for exactly what the database
 * columns need and nothing else: the facility (which carries district, practice
 * and province in from the register), the type, the outcome, the enforcement
 * action if one was taken, and whether an inspection card was issued.
 */
function LogInspectionPanel({
  facilities,
  knownPhases,
  onLogged,
  toastPush,
}: {
  facilities: Facility[];
  knownPhases: string[];
  onLogged: () => void;
  toastPush: (msg: string, kind?: "success" | "error") => void;
}) {
  const { weeks } = useWeek();
  const [facilityQuery, setFacilityQuery] = useState("");
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [facilityNameFreeText, setFacilityNameFreeText] = useState("");
  const [district, setDistrict] = useState("");
  const [practice, setPractice] = useState("");
  const [date, setDate] = useState(() => todayISO());
  const [type, setType] = useState<InspectionType>("Routine Inspection");
  const [outcome, setOutcome] = useState<InspectionOutcome>("Compliant");
  const [phase, setPhase] = useState("");
  const [enforcement, setEnforcement] = useState<EnforcementAction | "">("");
  const [cardIssued, setCardIssued] = useState(false);
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
        district: selected ? selected.district : district.trim(),
        practice: selected ? selected.practice : practice.trim(),
        ...(phase.trim() ? { phase: phase.trim() } : {}),
        ...(enforcement ? { enforcement } : {}),
        ...(cardIssued ? { cardIssued: date } : {}),
      });
      toastPush(`Inspection logged for ${fname}.`, "success");
      setNotes("");
      setFacilityQuery("");
      setFacilityNameFreeText("");
      setFacilityId(null);
      setDistrict("");
      setPractice("");
      setEnforcement("");
      setCardIssued(false);
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
    <Panel
      title="Log inspection"
      note="One entry moves the facility row, the province summary, the card list and this week's report."
    >
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
            {selected
              ? `${selected.district || "—"} · ${selected.practice || "—"} · ${selected.province}`
              : "Free-text is fine if the facility isn’t in the register yet."}
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

        {/* District and practice are register columns — typed only when the
            facility isn't on the register to read them from. */}
        {!selected ? (
          <>
            <div>
              <label className="field-label" htmlFor="insp-district">
                District
              </label>
              <input
                id="insp-district"
                className="input"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="e.g. Kitwe"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="insp-practice">
                Practice
              </label>
              <input
                id="insp-practice"
                className="input"
                value={practice}
                onChange={(e) => setPractice(e.target.value)}
                placeholder="e.g. Diagnostic Imaging (X-ray)"
              />
            </div>
          </>
        ) : null}

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
        <div>
          <label className="field-label" htmlFor="insp-enforcement">
            Enforcement action taken
          </label>
          <select
            id="insp-enforcement"
            className="input"
            value={enforcement}
            onChange={(e) =>
              setEnforcement(e.target.value as EnforcementAction | "")
            }
          >
            <option value="">None</option>
            {ENFORCEMENT_ACTIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <p className="text-[11px] text-gunmetal/55 mt-1">
            Counts on the summary’s engagement and enforcement columns.
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor="insp-phase">
            Phase <span className="text-gunmetal/45">(optional)</span>
          </label>
          <input
            id="insp-phase"
            className="input"
            list="insp-phases"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            placeholder="e.g. Phase 2"
          />
          <datalist id="insp-phases">
            {knownPhases.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <p className="text-[11px] text-gunmetal/55 mt-1">
            Gives a phased province its own summary row, as in the workbook.
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cardIssued}
              onChange={(e) => setCardIssued(e.target.checked)}
            />
            <span>
              Inspection card issued on {date} — valid to{" "}
              <strong className="tabular">{cardExpiry(date) || "—"}</strong>
            </span>
          </label>
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
    () => inspections.filter((i) => !filter || i.type === filter),
    [inspections, filter],
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
