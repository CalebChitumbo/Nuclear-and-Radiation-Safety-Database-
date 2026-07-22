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
import { QuickLogWizard } from "@/components/daily/QuickLogWizard";
import {
  borderSums,
  buildOfficialScreeningText,
  entriesForDate,
  entriesForWeek,
  mergeWeekManualValues,
  vehicleScreeningKey,
} from "@/lib/rules/daily";
import {
  isUsePossessionWorkflow,
  needsTypeClassification,
} from "@/lib/rules/licenceFamily";
import { parseISO, toISO, todayISO, weekLabelForDate } from "@/lib/rules/week";
import { deriveWeekly } from "@/lib/rules/weeklyDerivation";
import {
  SECTIONS,
  type Border,
  type DailyEntry,
  type Section,
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
        metrics,
      ] = await Promise.all([
        s.listFacilities(),
        s.listLicenceEvents(),
        s.listInspections(),
        // Degrade gracefully until the dailyEntries/borders rules are deployed.
        s.listDailyEntries().catch(() => []),
        s.listLicenceWorkflows().catch(() => []),
        s.listBorders().catch(() => []),
        weekLabel
          ? s.getWeekMetrics(weekLabel)
          : Promise.resolve({ week: "", values: {} }),
      ]);
      return {
        facilities,
        events,
        inspections,
        entries,
        workflows,
        borders,
        metrics,
      };
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

  const { facilities, events, inspections, entries, workflows, borders, metrics } =
    data;

  const dayEvents = events.filter((e) => e.date === date);
  const dayInspections = inspections.filter((i) => i.date === date);
  const dayEntries = entriesForDate(entries, date);
  const daySectionEntries = dayEntries.filter((e) => e.section === section);

  // Week-so-far rollup: auto figures from the dated registers + manual metrics
  // with the week's daily counts taking precedence over typed weekly values.
  const wkEvents = events.filter((e) => e.week === weekLabel);
  const wkInspections = inspections.filter((i) => i.week === weekLabel);
  const weekEntries = entriesForWeek(entries, weekLabel);
  const merged = mergeWeekManualValues(metrics.values || {}, weekEntries);
  const weekReport = deriveWeekly(wkEvents, wkInspections, merged.values);

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
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="caps text-[10px] text-gunmetal/60">Day</label>
              <input
                type="date"
                className="input mt-1"
                style={{ maxWidth: 170 }}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5 pb-0.5">
              <button
                className={`btn ${date === today ? "btn-primary" : "btn-secondary"} px-3 py-2 text-xs`}
                onClick={() => setDate(today)}
              >
                Today
              </button>
              <button
                className={`btn ${date === addDays(today, -1) ? "btn-primary" : "btn-secondary"} px-3 py-2 text-xs`}
                onClick={() => setDate(addDays(today, -1))}
              >
                Yesterday
              </button>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="text-right">
              <div className="caps text-[10px] text-gunmetal/60">
                Counts toward
              </div>
              <div className="text-sm sm:text-base font-black">
                {weekLabel || "(outside the calendar)"}
              </div>
            </div>
            <button
              className="btn btn-secondary hidden sm:inline-flex"
              onClick={openWeeklyReport}
            >
              Weekly report
            </button>
          </div>
        </div>
      </div>

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
              className="shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-colors"
              style={{
                background: active ? "var(--rpa-green)" : "var(--white)",
                color: active ? "white" : "var(--gunmetal)",
                borderColor: active
                  ? "var(--rpa-green)"
                  : "rgba(26,27,29,0.12)",
              }}
            >
              {SHORT_SECTION[s]}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
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
              onLogged={reload}
            />
          ) : !weekLabel ? (
            <div className="card p-5 text-sm text-gunmetal/60">
              Pick a date inside the reporting calendar to log entries.
            </div>
          ) : (
            <div className="card p-5 text-sm text-gunmetal/60">
              Only {section} officers (or admins) can log entries for this
              section. Switch to your section above.
            </div>
          )}

          {/* NSSS: live per-border screening breakdown + official confirm */}
          {section === "Nuclear Safety, Security & Safeguards" ? (
            <BorderScreeningCard
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
            <div className="card p-4 sm:p-5">
              <div className="caps text-xs text-gunmetal/60 mb-2">
                Facilities inspected on {date}
              </div>
              {dayInspections.length ? (
                <ul className="space-y-2 text-sm">
                  {dayInspections.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center justify-between gap-2 flex-wrap"
                    >
                      <span className="font-bold">{i.facilityName}</span>
                      <span className="text-xs text-gunmetal/60">
                        <span className="chip slate mr-1">{i.type}</span>
                        <span className="chip">{i.outcome}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gunmetal/55">
                  Nothing yet — log the first inspection above. Each one lands
                  in the register and the weekly report automatically.
                </div>
              )}
            </div>
          ) : null}

          {section === "Authorisation & Standards" ? (
            <LicensingDayCard
              dayEvents={dayEvents}
              readyCount={readyToConfirm.length}
              readyPreview={readyToConfirm.slice(0, 5)}
            />
          ) : null}

          {/* The day's logged entries for this section */}
          <div className="card overflow-hidden" id="day-log">
            <div className="px-4 sm:px-5 py-3 border-b border-gunmetal/8 font-black">
              Logged on {date}
              <span className="text-xs text-gunmetal/55 font-normal ml-2">
                {SHORT_SECTION[section]}
              </span>
            </div>
            <ul className="divide-y divide-gunmetal/8">
              {daySectionEntries.map((e) => (
                <li
                  key={e.id}
                  className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3"
                >
                  <div>
                    {e.kind === "count" ? (
                      <div className="text-sm">
                        <span className="font-bold">{e.label}</span>
                        <span className="chip green ml-2 tabular">
                          +{e.value ?? 0}
                        </span>
                        {e.border ? (
                          <span className="chip slate ml-1">{e.border}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-sm whitespace-pre-line">
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
                      className="text-xs caps font-bold text-[var(--status-stalled)] shrink-0"
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
          </div>
        </div>

        <div className="space-y-4">
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

/**
 * The NSSS senior officer's view of the day: vehicles screened per border
 * post as the coordinators log in, the grand total, and the one-tap official
 * confirmation (stored as an auditable `official` note — the numbers stay
 * single-sourced from the coordinators' entries).
 */
function BorderScreeningCard({
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
  const names = new Set<string>(borders.filter((b) => b.active).map((b) => b.name));
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
    <div className="card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="caps text-xs text-gunmetal/60">
          Vehicles screened on {date}
        </div>
        <div className="text-2xl font-black tabular">{sums.total}</div>
      </div>

      {rows.length === 0 && sums.unspecified === 0 ? (
        <div className="text-sm text-gunmetal/55 mt-2">
          No border posts configured yet — add them when logging vehicles
          screened, or on the NSSS tab.
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between gap-2">
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
            <li className="flex items-center justify-between gap-2">
              <span className="text-gunmetal/70">Head office / other</span>
              <span className="tabular font-black">{sums.unspecified}</span>
            </li>
          ) : null}
        </ul>
      )}

      <div className="mt-3 pt-3 border-t border-gunmetal/8">
        {official ? (
          <div className="text-sm">
            <span className="chip green mr-2">Official total confirmed</span>
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
          <div className="text-xs text-gunmetal/55">
            The senior officer confirms the official total once all borders
            have reported.
          </div>
        )}
      </div>
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
    <div className="card p-4 sm:p-5 space-y-4">
      <div>
        <div className="caps text-xs text-gunmetal/60 mb-2">
          Licences recorded today
        </div>
        {dayEvents.length ? (
          <ul className="space-y-1.5 text-sm">
            {dayEvents.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 flex-wrap"
              >
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
              <li
                key={r.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="font-bold">{r.facilityName}</span>
                <span className="text-xs tabular text-gunmetal/60">{r.ran}</span>
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
