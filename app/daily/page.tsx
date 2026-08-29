"use client";

import { useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { canEditSection, useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { LoadErrorBanner } from "@/components/LoadError";
import { Panel } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { useWeek } from "@/lib/weekContext";
import { QuickLogWizard } from "@/components/daily/QuickLogWizard";
import {
  borderSums,
  buildOfficialScreeningText,
  effectiveValuesByWeek,
  entriesForDate,
  vehicleScreeningKey,
} from "@/lib/rules/daily";
import {
  isUsePossessionWorkflow,
  needsTypeClassification,
} from "@/lib/rules/licenceFamily";
import { parseISO, toISO, todayISO, weekLabelForDate } from "@/lib/rules/week";
import {
  applyWorkPlanConfig,
  deriveWorkPlan,
  formatPercent,
  WORK_PLAN_YEAR,
} from "@/lib/rules/workPlan";
import {
  SECTIONS,
  type Border,
  type DailyEntry,
  type Section,
  type WorkPlanBaseline,
  type WorkPlanConfig,
} from "@/lib/rules/types";

/** Short tab labels so the section switcher fits a phone screen. */
const SHORT_SECTION: Record<Section, string> = {
  "Authorisation & Standards": "Licensing (A&S)",
  Inspectorate: "Inspectorate",
  "Nuclear Safety, Security & Safeguards": "NSSS",
  "National Source Inventory": "NSI",
};

function addDays(iso: string, delta: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + delta);
  return toISO(d);
}

/**
 * Daily Updates — the field-first logging hub. Every section logs its day one
 * question at a time (built to be used on a phone at a facility or a border
 * post), and the week totals itself from those entries:
 *
 * - Inspectorate taps through facility → type → outcome; the entry lands in
 *   the inspections register.
 * - Licensing sees today's recorded licences and the issued-certificate
 *   confirmations waiting on Smart Status Update, and logs its counts.
 * - NSSS border coordinators pick their border post and enter the vehicles
 *   screened; the senior officer sees the live per-border breakdown and
 *   confirms the official daily total.
 */
export default function DailyUpdatesPage() {
  const { user } = useAuth();
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
      const [
        facilities,
        events,
        inspections,
        entries,
        workflows,
        borders,
        weekMetricsAll,
        baseline,
        config,
      ] = await Promise.all([
        s.listFacilities(),
        s.listLicenceEvents(),
        s.listInspections(),
        // Degrade gracefully until the dailyEntries/borders rules are deployed.
        s.listDailyEntries().catch(() => []),
        s.listLicenceWorkflows().catch(() => []),
        s.listBorders().catch(() => []),
        s.listWeekMetricsAll().catch(() => []),
        s.getWorkPlanBaseline(WORK_PLAN_YEAR).catch(
          () => null as WorkPlanBaseline | null,
        ),
        // The sections' own changes to the plan, so a row edited or added on
        // the weekly report is loggable here the same day.
        s.getWorkPlanConfig(WORK_PLAN_YEAR).catch(
          () => null as WorkPlanConfig | null,
        ),
      ]);
      return {
        facilities,
        events,
        inspections,
        entries,
        workflows,
        borders,
        weekMetricsAll,
        baseline,
        config,
      };
    },
    [],
  );

  const plan = useMemo(
    () => applyWorkPlanConfig(data?.config),
    [data?.config],
  );

  if (!data) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  const {
    facilities,
    events,
    inspections,
    entries,
    workflows,
    borders,
    weekMetricsAll,
    baseline,
  } = data;

  const dayEvents = events.filter((e) => e.date === date);
  const dayInspections = inspections.filter((i) => i.date === date);
  const dayEntries = entriesForDate(entries, date);
  const daySectionEntries = dayEntries.filter((e) => e.section === section);

  // Week-so-far rollup, in the shape the Monday meeting reports: the week's
  // contribution to each 2026 work plan output, and where that leaves the
  // output against its annual target.
  const weekReport = deriveWorkPlan({
    plan,
    weeks,
    week: weekLabel,
    events,
    inspections,
    valuesByWeek: effectiveValuesByWeek(weekMetricsAll, entries),
    dailyEntries: entries,
    baseline: baseline?.values ?? null,
  });

  // Licensing suggestions: issued Use/Possession certificates whose facility is
  // still not marked Licensed — confirmed on Smart Status Update (same
  // predicate as that tab's "Ready to license" panel).
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
  const today = todayISO();

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
      {/* Day picker — compact, thumb-friendly */}
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="field-label" htmlFor="day">
                Day
              </label>
              <input
                id="day"
                type="date"
                className="input"
                style={{ maxWidth: 170 }}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="seg">
              <button
                className="seg-btn"
                aria-pressed={date === today}
                onClick={() => setDate(today)}
              >
                Today
              </button>
              <button
                className="seg-btn"
                aria-pressed={date === addDays(today, -1)}
                onClick={() => setDate(addDays(today, -1))}
              >
                Yesterday
              </button>
            </div>
          </div>
          <div className="text-right">
            <div className="caps text-[10px] text-gunmetal/55">
              Counts toward
            </div>
            <div className="text-sm font-black">
              {weekLabel || "(outside the calendar)"}
            </div>
          </div>
        </div>
      </Panel>

      {/* Section switcher — scrolls sideways on a phone */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {SECTIONS.map((s) => {
          const active = section === s;
          return (
            <button
              key={s}
              aria-pressed={active}
              title={s}
              onClick={() => setSection(s)}
              className="shrink-0 px-4 py-2.5 rounded-full text-sm font-bold transition-colors"
              style={{
                background: active ? "var(--rpa-green)" : "var(--surface)",
                color: active ? "white" : "var(--gunmetal)",
              }}
            >
              {SHORT_SECTION[s]}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {/* The guided quick-log — the hero of the page */}
          {editable && weekLabel && user ? (
            <QuickLogWizard
              section={section}
              date={date}
              weekLabel={weekLabel}
              user={{ uid: user.uid, name: user.displayName }}
              facilities={facilities}
              borders={borders}
              canManageBorders={canEditSection(
                user,
                "Nuclear Safety, Security & Safeguards",
              )}
              plan={plan}
              onLogged={reload}
            />
          ) : !weekLabel ? (
            <Panel>
              <p className="text-sm text-gunmetal/60">
                Pick a date inside the reporting calendar to log entries.
              </p>
            </Panel>
          ) : (
            <Panel>
              <p className="text-sm text-gunmetal/60">
                Only {section} officers (or admins) can log entries for this
                section. Switch to your section above.
              </p>
            </Panel>
          )}

          {/* NSSS: live per-border screening breakdown + official confirm */}
          {section === "Nuclear Safety, Security & Safeguards" ? (
            <BorderScreeningPanel
              date={date}
              weekLabel={weekLabel}
              entries={daySectionEntries}
              borders={borders}
              canConfirm={editable}
              user={user ? { uid: user.uid, name: user.displayName } : null}
              onChanged={reload}
            />
          ) : null}

          {/* Section day feeds */}
          {section === "Inspectorate" ? (
            <Panel title={`Facilities inspected on ${date}`}>
              {dayInspections.length ? (
                <ul className="divide-y divide-gunmetal/8 text-sm">
                  {dayInspections.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center justify-between gap-2 flex-wrap py-2"
                    >
                      <span className="font-bold">{i.facilityName}</span>
                      <span className="flex gap-1">
                        <span className="chip slate">{i.type}</span>
                        <span className="chip">{i.outcome}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gunmetal/55">
                  Nothing yet — log the first inspection above. Each one lands in
                  the register and the weekly report automatically.
                </p>
              )}
            </Panel>
          ) : null}

          {section === "Authorisation & Standards" ? (
            <LicensingDayPanel
              date={date}
              dayEvents={dayEvents}
              readyCount={readyToConfirm.length}
              readyPreview={readyToConfirm.slice(0, 5)}
            />
          ) : null}

          {/* The day's logged entries for this section */}
          <Panel
            title={`Logged on ${date} — ${SHORT_SECTION[section]}`}
            flush
            className="scroll-mt-20"
          >
            <ul className="divide-y divide-gunmetal/8">
              {daySectionEntries.map((e) => (
                <li
                  key={e.id}
                  className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    {e.kind === "count" ? (
                      <div className="text-sm flex flex-wrap items-center gap-1.5">
                        <span className="font-bold">{e.label}</span>
                        <span className="chip green tabular">
                          +{e.value ?? 0}
                        </span>
                        {e.border ? (
                          <span className="chip slate">{e.border}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-sm whitespace-pre-line break-words">
                        {e.official ? (
                          <span className="chip green mr-1">official</span>
                        ) : null}
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
                      className="link-action shrink-0"
                      style={{ color: "var(--status-stalled)" }}
                      onClick={() => removeEntry(e.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
              {daySectionEntries.length === 0 ? (
                <li className="px-4 sm:px-5 py-6 text-sm text-gunmetal/55">
                  Nothing logged for {SHORT_SECTION[section]} on this day yet.
                </li>
              ) : null}
            </ul>
          </Panel>
        </div>

        {/* Week so far */}
        <Panel
          title={`Week so far — ${weekLabel || "—"}`}
          flush
          className="min-w-0"
        >
          <div className="divide-y divide-gunmetal/8">
            {weekReport.map((sub) => {
              const logged = [...sub.rows, ...sub.supporting].filter(
                (r) => r.week > 0,
              );
              const subtotal = logged.reduce((s, r) => s + r.week, 0);
              return (
                <div key={sub.id} className="px-4 sm:px-5 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-xs font-black">
                      {sub.id} {sub.title}
                    </div>
                    <div className="text-sm tabular font-black">
                      {subtotal.toLocaleString()}
                    </div>
                  </div>
                  {logged.length ? (
                    <ul className="mt-1 space-y-1">
                      {logged.map((r) => (
                        <li key={r.output.id} className="text-xs">
                          <div className="flex items-center justify-between gap-2 text-gunmetal/70">
                            <span className="min-w-0 break-words">
                              <span className="tabular font-bold">
                                {r.output.id}
                              </span>{" "}
                              {r.output.description}
                            </span>
                            <span className="tabular font-bold shrink-0">
                              +{r.week.toLocaleString()}
                            </span>
                          </div>
                          {r.output.target !== null ? (
                            <div className="text-[11px] text-gunmetal/45">
                              {r.total.toLocaleString()} of{" "}
                              {r.output.target.toLocaleString()} —{" "}
                              {formatPercent(r.percent)} of the {WORK_PLAN_YEAR}{" "}
                              target
                            </div>
                          ) : null}
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
          <div className="px-4 sm:px-5 pt-3 border-t border-gunmetal/8">
            <button className="btn btn-primary w-full" onClick={openWeeklyReport}>
              Open the sectional update
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/**
 * The NSSS senior officer's view of the day: vehicles screened per border
 * post as the coordinators log in, the grand total, and the one-tap official
 * confirmation (stored as an auditable `official` note — the numbers stay
 * single-sourced from the coordinators' entries).
 */
function BorderScreeningPanel({
  date,
  weekLabel,
  entries,
  borders,
  canConfirm,
  user,
  onChanged,
}: {
  date: string;
  weekLabel: string;
  entries: DailyEntry[];
  borders: Border[];
  canConfirm: boolean;
  user: { uid: string; name: string } | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const key = vehicleScreeningKey();
  const sums = borderSums(entries, key);
  const official = entries.find((e) => e.official);

  // Every active border (0s visible so the senior sees who hasn't reported),
  // plus any border that logged today but was since deactivated/renamed.
  const names = new Set<string>(
    borders.filter((b) => b.active).map((b) => b.name),
  );
  for (const name of Object.keys(sums.byBorder)) names.add(name);
  const rows = [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, value: sums.byBorder[name] || 0 }));

  const confirm = async () => {
    if (!user || busy || sums.total <= 0) return;
    setBusy(true);
    try {
      const s = await store();
      await s.addDailyEntry({
        date,
        week: weekLabel,
        section: "Nuclear Safety, Security & Safeguards",
        kind: "note",
        text: buildOfficialScreeningText(date, sums),
        official: true,
        updatedBy: user.uid,
        updatedByName: user.name,
      });
      toast.push("Official daily total confirmed.", "success");
      onChanged();
    } catch (err) {
      toast.push(
        `Confirming failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={`Vehicles screened on ${date}`}
      action={<span className="text-2xl font-black tabular">{sums.total}</span>}
    >
      {rows.length === 0 && sums.unspecified === 0 ? (
        <p className="text-sm text-gunmetal/55">
          No border posts configured yet — add them when logging vehicles
          screened, or on the NSSS tab.
        </p>
      ) : (
        <ul className="divide-y divide-gunmetal/8 text-sm">
          {rows.map((r) => (
            <li
              key={r.name}
              className="flex items-center justify-between gap-2 py-2"
            >
              <span className={r.value ? "font-bold" : "text-gunmetal/55"}>
                {r.name}
              </span>
              <span
                className={`tabular ${r.value ? "font-black" : "text-gunmetal/40"}`}
              >
                {r.value || "—"}
              </span>
            </li>
          ))}
          {sums.unspecified > 0 ? (
            <li className="flex items-center justify-between gap-2 py-2">
              <span className="text-gunmetal/70">Head office / other</span>
              <span className="tabular font-black">{sums.unspecified}</span>
            </li>
          ) : null}
        </ul>
      )}

      <div className="mt-3 pt-3 border-t border-gunmetal/8">
        {official ? (
          <div className="text-sm flex flex-wrap items-center gap-2">
            <span className="chip green">Official total confirmed</span>
            <span className="text-xs text-gunmetal/60">
              by {official.updatedByName || "an officer"}
            </span>
          </div>
        ) : canConfirm ? (
          <button
            className="btn btn-secondary w-full"
            disabled={busy || sums.total <= 0}
            onClick={confirm}
          >
            {busy
              ? "Confirming…"
              : sums.total > 0
                ? `Confirm official total (${sums.total}) ✓`
                : "Waiting for border figures…"}
          </button>
        ) : (
          <p className="text-xs text-gunmetal/55">
            The senior officer confirms the official total once all borders have
            reported.
          </p>
        )}
      </div>
    </Panel>
  );
}

/** The Licensing day view: today's recorded licences + confirmations waiting. */
function LicensingDayPanel({
  date,
  dayEvents,
  readyCount,
  readyPreview,
}: {
  date: string;
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
    <Panel title={`Licences recorded on ${date}`}>
      {dayEvents.length ? (
        <ul className="divide-y divide-gunmetal/8 text-sm">
          {dayEvents.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 flex-wrap py-2"
            >
              <span className="min-w-0">
                <span className="font-bold">{e.facilityName}</span>
                <span className="text-xs text-gunmetal/60 ml-2 tabular">
                  {e.number || "no number"}
                </span>
              </span>
              <span className="chip green">{e.type}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gunmetal/55">
          No licences recorded for this day yet — accepted RAIS emails and bulk
          approvals appear here automatically.
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-gunmetal/8">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <div className="caps text-[10px] text-gunmetal/55 flex items-center gap-2">
            Suggested confirmations
            {readyCount ? (
              <span className="chip amber tabular">{readyCount}</span>
            ) : null}
          </div>
          <Link className="link-action" href="/licence-status">
            Confirm on Smart Status Update →
          </Link>
        </div>
        {readyCount ? (
          <ul className="divide-y divide-gunmetal/8 text-sm">
            {readyPreview.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="font-bold min-w-0 break-words">
                  {r.facilityName}
                </span>
                <span className="text-xs tabular text-gunmetal/60 shrink-0">
                  {r.ran}
                </span>
              </li>
            ))}
            {readyCount > readyPreview.length ? (
              <li className="text-xs text-gunmetal/55 py-2">
                …and {readyCount - readyPreview.length} more.
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="text-sm text-gunmetal/55">
            Nothing waiting — facilities RAIS reports as licensed appear here for
            a one-click confirmation.
          </p>
        )}
      </div>
    </Panel>
  );
}
