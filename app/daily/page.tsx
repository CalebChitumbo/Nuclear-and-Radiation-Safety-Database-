"use client";

import { useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { canEditSection, useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { LoadErrorBanner } from "@/components/LoadError";
import { useToast } from "@/components/Toast";
import { useWeek } from "@/lib/weekContext";
import {
  dailyMetricOptions,
  entriesForDate,
  entriesForWeek,
  mergeWeekManualValues,
} from "@/lib/rules/daily";
import {
  isUsePossessionWorkflow,
  needsTypeClassification,
} from "@/lib/rules/licenceFamily";
import { norm } from "@/lib/rules/matching";
import { todayISO, weekLabelForDate } from "@/lib/rules/week";
import { deriveWeekly } from "@/lib/rules/weeklyDerivation";
import {
  INSPECTION_OUTCOMES,
  INSPECTION_TYPES,
  SECTIONS,
  type Facility,
  type InspectionOutcome,
  type InspectionType,
  type Section,
} from "@/lib/rules/types";

/**
 * Daily Updates — each section logs its day as it happens and the system
 * totals the week by itself:
 *
 * - Inspectorate: the facilities inspected today (logged straight into the
 *   inspections register, which is already daily-dated).
 * - Licensing (A&S): today's recorded licences, plus the issued-certificate
 *   suggestions waiting to be confirmed on the Smart Status Update tab.
 * - NSSS / NSI: numbers against the section's metrics (vehicles screened,
 *   sources verified, …) and free-text notes.
 *
 * Count entries land on the same metric keys the weekly report uses, so the
 * week's totals build up entry by entry — at the end of the week the weekly
 * report is already written.
 */
export default function DailyUpdatesPage() {
  const { user, canEditInsp } = useAuth();
  const { weeks, setSelected } = useWeek();
  const toast = useToast();
  const router = useRouter();

  const [date, setDate] = useState(() => todayISO());
  const [section, setSection] = useState<Section>(() =>
    user && user.section !== "All"
      ? (user.section as Section)
      : "Authorisation & Standards",
  );

  const weekLabel = useMemo(
    () => weekLabelForDate(date, weeks, ""),
    [date, weeks],
  );

  const { data, error, reload } = useStoreData(
    async (s) => {
      const [facilities, events, inspections, entries, workflows, metrics] =
        await Promise.all([
          s.listFacilities(),
          s.listLicenceEvents(),
          s.listInspections(),
          // Degrade gracefully until the dailyEntries rules are deployed.
          s.listDailyEntries().catch(() => []),
          s.listLicenceWorkflows().catch(() => []),
          weekLabel
            ? s.getWeekMetrics(weekLabel)
            : Promise.resolve({ week: "", values: {} }),
        ]);
      return { facilities, events, inspections, entries, workflows, metrics };
    },
    [weekLabel],
  );

  if (!data) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  const { facilities, events, inspections, entries, workflows, metrics } = data;

  const dayEvents = events.filter((e) => e.date === date);
  const dayInspections = inspections.filter((i) => i.date === date);
  const dayEntries = entriesForDate(entries, date);

  // Week-so-far rollup: auto figures from the dated registers + manual metrics
  // with the week's daily counts taking precedence over typed weekly values.
  const wkEvents = events.filter((e) => e.week === weekLabel);
  const wkInspections = inspections.filter((i) => i.week === weekLabel);
  const weekEntries = entriesForWeek(entries, weekLabel);
  const merged = mergeWeekManualValues(metrics.values || {}, weekEntries);
  const weekReport = deriveWeekly(wkEvents, wkInspections, merged.values);

  // Licensing suggestions: issued Use/Possession certificates whose facility is
  // still not marked Licensed — the officer confirms them on Smart Status
  // Update (same predicate as that tab's "Ready to license" panel).
  const facById = new Map(facilities.map((f) => [f.id, f]));
  const readyToConfirm = workflows.filter((r) => {
    if (r.reviewStatus === "needs-review") return false;
    if (r.facilityStage !== "Licence / Certificate Issued") return false;
    if (!r.facilityId) return false;
    if (needsTypeClassification(r)) return false;
    if (!isUsePossessionWorkflow(r)) return false;
    const f = facById.get(r.facilityId);
    return !!f && !f.licensed;
  });

  const editable = canEditSection(user, section);
  const isAdmin = user?.role === "admin";

  const openWeeklyReport = () => {
    const w = weeks.find((x) => x.label === weekLabel);
    if (w) setSelected(w);
    router.push("/weekly");
  };

  const removeEntry = async (id: string) => {
    try {
      const s = await store();
      await s.deleteDailyEntry(id);
      reload();
    } catch (err) {
      toast.push(
        `Removing failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  };

  return (
    <div className="space-y-4 staggered">
      {/* Day picker + week landing */}
      <div className="card p-5 flex items-end justify-between flex-wrap gap-3">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="caps text-[10px] text-gunmetal/60">Day</label>
            <input
              type="date"
              className="input mt-1"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <div className="caps text-[10px] text-gunmetal/60">
              Counts toward
            </div>
            <div className="text-lg font-black">
              {weekLabel || "(outside the reporting calendar)"}
            </div>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={openWeeklyReport}>
          Open weekly report
        </button>
      </div>

      {/* Section switcher */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => {
          const active = section === s;
          return (
            <button
              key={s}
              aria-pressed={active}
              onClick={() => setSection(s)}
              className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
              style={{
                background: active ? "var(--rpa-green)" : "transparent",
                color: active ? "white" : "var(--gunmetal)",
                borderColor: active
                  ? "var(--rpa-green)"
                  : "rgba(26,27,29,0.12)",
              }}
            >
              {s}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          {/* Section-specific automatic feed for the day */}
          {section === "Inspectorate" ? (
            <InspectorateDayCard
              date={date}
              weekLabel={weekLabel}
              facilities={facilities}
              dayInspections={dayInspections}
              canLog={canEditInsp}
              onLogged={reload}
            />
          ) : null}

          {section === "Authorisation & Standards" ? (
            <LicensingDayCard
              dayEvents={dayEvents}
              readyCount={readyToConfirm.length}
              readyPreview={readyToConfirm.slice(0, 5)}
            />
          ) : null}

          {/* The day's logged entries for this section */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gunmetal/8 font-black">
              Logged on {date}
              <span className="text-xs text-gunmetal/55 font-normal ml-2">
                {section}
              </span>
            </div>
            <ul className="divide-y divide-gunmetal/8">
              {dayEntries
                .filter((e) => e.section === section)
                .map((e) => (
                  <li
                    key={e.id}
                    className="px-5 py-3 flex items-start justify-between gap-3"
                  >
                    <div>
                      {e.kind === "count" ? (
                        <div className="text-sm">
                          <span className="font-bold">{e.label}</span>
                          <span className="chip green ml-2 tabular">
                            +{e.value ?? 0}
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm whitespace-pre-line">
                          {e.text}
                        </div>
                      )}
                      {e.kind === "count" && e.text ? (
                        <div className="text-xs text-gunmetal/60 mt-0.5">
                          {e.text}
                        </div>
                      ) : null}
                      {e.updatedByName ? (
                        <div className="text-[11px] text-gunmetal/50 mt-0.5">
                          {e.updatedByName}
                        </div>
                      ) : null}
                    </div>
                    {isAdmin || (user && e.updatedBy === user.uid) ? (
                      <button
                        className="text-xs caps font-bold text-[var(--status-stalled)]"
                        onClick={() => removeEntry(e.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              {dayEntries.filter((e) => e.section === section).length === 0 ? (
                <li className="px-5 py-6 text-sm text-gunmetal/55">
                  Nothing logged for {section} on this day yet.
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          {/* Entry forms */}
          {editable && weekLabel ? (
            <AddEntryCard
              section={section}
              date={date}
              weekLabel={weekLabel}
              uid={user?.uid || ""}
              userName={user?.displayName || ""}
              onAdded={reload}
            />
          ) : !weekLabel ? (
            <div className="card p-5 text-sm text-gunmetal/60">
              Pick a date inside the reporting calendar to log entries.
            </div>
          ) : (
            <div className="card p-5 text-sm text-gunmetal/60">
              Only {section} officers (or admins) can log entries for this
              section.
            </div>
          )}

          {/* Week so far */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gunmetal/8 font-black">
              Week so far
              <span className="text-xs text-gunmetal/55 font-normal ml-2">
                {weekLabel || "—"}
              </span>
            </div>
            <div className="divide-y divide-gunmetal/8">
              {weekReport.map((sec) => {
                const nonZero = sec.metrics.filter((m) => m.value > 0);
                return (
                  <div key={sec.section} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-xs font-black">{sec.section}</div>
                      {sec.total ? (
                        <div className="text-sm tabular font-black">
                          {sec.total.value}
                        </div>
                      ) : null}
                    </div>
                    {nonZero.length ? (
                      <ul className="mt-1 space-y-0.5">
                        {nonZero.map((m) => (
                          <li
                            key={m.key}
                            className="flex items-center justify-between text-xs text-gunmetal/70"
                          >
                            <span>{m.label}</span>
                            <span className="tabular font-bold">{m.value}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-gunmetal/50 mt-1">
                        No figures yet this week.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-gunmetal/8">
              <button
                className="btn btn-primary w-full"
                onClick={openWeeklyReport}
              >
                Generate weekly report
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Quick facility-inspection logging for the Inspectorate's day. */
function InspectorateDayCard({
  date,
  weekLabel,
  facilities,
  dayInspections,
  canLog,
  onLogged,
}: {
  date: string;
  weekLabel: string;
  facilities: Facility[];
  dayInspections: Array<{
    id: string;
    facilityName: string;
    type: InspectionType;
    outcome: InspectionOutcome;
  }>;
  canLog: boolean;
  onLogged: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [type, setType] = useState<InspectionType>("Routine Inspection");
  const [outcome, setOutcome] = useState<InspectionOutcome>("Compliant");
  const [busy, setBusy] = useState(false);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = norm(query);
    return facilities.filter((f) => f.nameLower.includes(q)).slice(0, 6);
  }, [facilities, query]);

  const selected = facilityId
    ? facilities.find((f) => f.id === facilityId) || null
    : null;

  const submit = async () => {
    const fname = selected ? selected.name : query.trim();
    if (!fname) {
      toast.push("Type or pick the facility that was inspected.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      await s.addInspection({
        date,
        week: weekLabel,
        facilityId: selected ? selected.id : null,
        facilityName: fname,
        type,
        outcome,
        notes: "",
        province: selected ? selected.province : "",
        sector: selected ? selected.sector : "",
      });
      toast.push(`Inspection recorded for ${fname}.`, "success");
      setQuery("");
      setFacilityId(null);
      onLogged();
    } catch (err) {
      toast.push(
        `Recording failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="caps text-xs text-gunmetal/60 mb-2">
        Facilities inspected on {date}
      </div>
      {dayInspections.length ? (
        <ul className="space-y-1.5 text-sm mb-3">
          {dayInspections.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2">
              <span className="font-bold">{i.facilityName}</span>
              <span className="text-xs text-gunmetal/60">
                <span className="chip slate mr-1">{i.type}</span>
                <span className="chip">{i.outcome}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-gunmetal/55 mb-3">
          No inspections recorded for this day yet.
        </div>
      )}

      {canLog ? (
        <div className="border-t border-gunmetal/8 pt-3">
          <div className="caps text-[10px] text-gunmetal/60 mb-2">
            Add an inspected facility
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="relative sm:col-span-3">
              <input
                className="input"
                placeholder="Facility inspected…"
                value={selected ? selected.name : query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setFacilityId(null);
                }}
              />
              {suggestions.length > 0 && !selected ? (
                <ul className="absolute left-0 right-0 mt-1 z-20 card max-h-52 overflow-y-auto">
                  {suggestions.map((f) => (
                    <li
                      key={f.id}
                      onClick={() => {
                        setFacilityId(f.id);
                        setQuery(f.name);
                      }}
                      className="px-3 py-2 text-sm hover:bg-mist cursor-pointer"
                    >
                      <div className="font-bold">{f.name}</div>
                      <div className="text-xs text-gunmetal/60">
                        {f.facCode || "—"} · {f.province}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as InspectionType)}
              aria-label="Inspection type"
            >
              {INSPECTION_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select
              className="input"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as InspectionOutcome)}
              aria-label="Outcome"
            >
              {INSPECTION_OUTCOMES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={submit}
            >
              {busy ? "Saving…" : "Record"}
            </button>
          </div>
          <div className="text-[11px] text-gunmetal/55 mt-1">
            Entries land in the inspections register and count in the weekly
            report automatically.
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The Licensing day view: today's recorded licences + confirmations waiting. */
function LicensingDayCard({
  dayEvents,
  readyCount,
  readyPreview,
}: {
  dayEvents: Array<{
    id: string;
    facilityName: string;
    type: string;
    number: string;
  }>;
  readyCount: number;
  readyPreview: Array<{ id: string; facilityName: string; ran: string }>;
}) {
  return (
    <div className="card p-5 space-y-4">
      <div>
        <div className="caps text-xs text-gunmetal/60 mb-2">
          Licences recorded today
        </div>
        {dayEvents.length ? (
          <ul className="space-y-1.5 text-sm">
            {dayEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-bold">{e.facilityName}</span>
                  <span className="text-xs text-gunmetal/60 ml-2">
                    {e.number || "no number"}
                  </span>
                </span>
                <span className="chip green">{e.type}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gunmetal/55">
            No licences recorded for this day yet — accepted RAIS emails and
            bulk approvals appear here automatically.
          </div>
        )}
      </div>

      <div className="border-t border-gunmetal/8 pt-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="caps text-xs text-gunmetal/60">
            Suggested confirmations
            {readyCount ? (
              <span className="chip amber ml-2 tabular">{readyCount}</span>
            ) : null}
          </div>
          <Link
            className="text-xs caps font-bold text-[var(--rpa-green-dark)]"
            href="/licence-status"
          >
            Confirm on Smart Status Update →
          </Link>
        </div>
        {readyCount ? (
          <ul className="mt-2 space-y-1 text-sm">
            {readyPreview.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="font-bold">{r.facilityName}</span>
                <span className="text-xs tabular text-gunmetal/60">
                  {r.ran}
                </span>
              </li>
            ))}
            {readyCount > readyPreview.length ? (
              <li className="text-xs text-gunmetal/55">
                …and {readyCount - readyPreview.length} more.
              </li>
            ) : null}
          </ul>
        ) : (
          <div className="text-sm text-gunmetal/55 mt-1">
            Nothing waiting — facilities RAIS reports as licensed appear here
            for a one-click confirmation.
          </div>
        )}
      </div>
    </div>
  );
}

/** Numeric + note entry forms for the selected section and day. */
function AddEntryCard({
  section,
  date,
  weekLabel,
  uid,
  userName,
  onAdded,
}: {
  section: Section;
  date: string;
  weekLabel: string;
  uid: string;
  userName: string;
  onAdded: () => void;
}) {
  const toast = useToast();
  const options = useMemo(() => dailyMetricOptions(section), [section]);
  const [metricKey, setMetricKey] = useState("");
  const [value, setValue] = useState("");
  const [remark, setRemark] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // The section decides the metric list; reset a stale pick when it changes.
  const effectiveKey =
    options.some((o) => o.key === metricKey) && metricKey
      ? metricKey
      : options[0]?.key || "";

  const addCount = async () => {
    const opt = options.find((o) => o.key === effectiveKey);
    const n = Number(value);
    if (!opt) return;
    if (!Number.isFinite(n) || n <= 0) {
      toast.push("Enter a number greater than zero.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      await s.addDailyEntry({
        date,
        week: weekLabel,
        section,
        kind: "count",
        metricKey: opt.key,
        label: opt.label,
        value: Math.floor(n),
        text: remark.trim() || undefined,
        updatedBy: uid,
        updatedByName: userName,
      });
      toast.push(`${opt.label}: +${Math.floor(n)} logged.`, "success");
      setValue("");
      setRemark("");
      onAdded();
    } catch (err) {
      toast.push(
        `Saving failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const s = await store();
      await s.addDailyEntry({
        date,
        week: weekLabel,
        section,
        kind: "note",
        text: note.trim(),
        updatedBy: uid,
        updatedByName: userName,
      });
      toast.push("Note logged.", "success");
      setNote("");
      onAdded();
    } catch (err) {
      toast.push(
        `Saving failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <div className="caps text-xs text-gunmetal/60 mb-2">
          Log today&apos;s numbers
        </div>
        <div className="space-y-2">
          <select
            className="input"
            value={effectiveKey}
            onChange={(e) => setMetricKey(e.target.value)}
            aria-label="Metric"
          >
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              className="input"
              placeholder="How many?"
              aria-label="Count"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCount();
              }}
            />
            <button
              className="btn btn-primary shrink-0"
              disabled={busy}
              onClick={addCount}
            >
              Add
            </button>
          </div>
          <input
            className="input"
            placeholder="Remark (optional)"
            aria-label="Remark"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </div>
      </div>

      <div className="border-t border-gunmetal/8 pt-3">
        <div className="caps text-xs text-gunmetal/60 mb-2">Log a note</div>
        <textarea
          className="input"
          rows={2}
          placeholder="What happened today?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          className="btn btn-secondary mt-2"
          disabled={busy || !note.trim()}
          onClick={addNote}
        >
          Add note
        </button>
      </div>
    </div>
  );
}
