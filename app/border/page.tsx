"use client";

/**
 * Border Scan Log — the border offices' capture screen.
 *
 * The Nuclear Safety, Security & Safeguards section screens every truck that
 * crosses at the manned posts and, until now, recorded each one as a row in a
 * monthly spreadsheet: a sheet per day, a row per truck, and a tally block the
 * officer retyped at the end of each shift.
 *
 * This tab keeps the row and drops everything around it. The shift header is
 * answered once (post, date, direction); each truck is five short answers; the
 * tallies, the daily figure and the weekly paragraph derive themselves from the
 * rows. Posting the day's total to Daily Updates is one tap, and it replaces
 * rather than adds — so the weekly report's "Vehicle Screening (units)" figure
 * is the scan log, not a number typed twice.
 *
 * For an officer posted to an inland office this is the whole system: they
 * sign in and they are here, and every read is their own post's — the shift,
 * the week, the recent scans behind the pickers. Head office and the NSSS desk
 * see every post.
 */
import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { Bars } from "@/components/Bars";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { ScanCaptureCard } from "@/components/border/ScanCaptureCard";
import { ScanTallies } from "@/components/border/ScanTallies";
import { ShiftLog } from "@/components/border/ShiftLog";
import { Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
import { downloadTextFile } from "@/components/downloadFile";
import { useToast } from "@/components/Toast";
import { canEditSection, useAuth } from "@/lib/auth";
import { dailyEntryScope } from "@/lib/rules/access";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { useWeek } from "@/lib/weekContext";
import {
  scanLogCountEntry,
  scanLogEntriesFor,
} from "@/lib/rules/daily";
import {
  scansToCsv,
  summariseScans,
  summariseWeek,
  summaryToCsv,
  weeklyNarrative,
} from "@/lib/rules/borderScans";
import { todayISO, weekLabelForDate } from "@/lib/rules/week";
import {
  SCAN_DIRECTIONS,
  type ScanDirection,
  type Section,
  type TruckScan,
} from "@/lib/rules/types";

const NSSS: Section = "Nuclear Safety, Security & Safeguards";
const POST_KEY = "rpa-border-post";

export default function BorderScanPage() {
  const { user, postedOffice } = useAuth();
  const { weeks } = useWeek();
  const toast = useToast();

  const [border, setBorder] = useState(postedOffice || "");
  const [date, setDate] = useState(() => todayISO());
  const [direction, setDirection] = useState<ScanDirection>("Inbound");
  const [view, setView] = useState<"day" | "week">("day");
  const [posting, setPosting] = useState(false);

  const weekLabel = useMemo(
    () => weekLabelForDate(date, weeks, ""),
    [date, weeks],
  );

  // An officer works one post. A coordinator registered to an inland office
  // works THAT post and no other — their account says so, the security rules
  // enforce it, and the header simply states it. Everyone else (head office,
  // an administrator) picks, and the choice is remembered so the header is
  // answered once and not once a day.
  useEffect(() => {
    if (postedOffice) {
      setBorder(postedOffice);
      return;
    }
    const saved = window.localStorage.getItem(POST_KEY);
    if (saved) setBorder(saved);
  }, [postedOffice]);
  useEffect(() => {
    if (border && !postedOffice) window.localStorage.setItem(POST_KEY, border);
  }, [border, postedOffice]);

  // A posted officer reads their own post and nothing else — the security
  // rules refuse the wider read — so every query carries the posting.
  const ownPost = postedOffice || undefined;
  const entryScope = dailyEntryScope(user);

  const { data, error, reload } = useStoreData(
    async (s) => {
      const [borders, recentScans, shiftScans, weekScans, entries] =
        await Promise.all([
          s.listBorders().catch(() => []),
          // Every read degrades to empty so the tab still renders before the
          // truckScans rules/index are deployed.
          s.listTruckScans(ownPost).catch(() => [] as TruckScan[]),
          border
            ? s.listTruckScansFor(border, date).catch(() => [] as TruckScan[])
            : Promise.resolve([] as TruckScan[]),
          weekLabel
            ? s
                .listTruckScansForWeek(weekLabel, ownPost)
                .catch(() => [] as TruckScan[])
            : Promise.resolve([] as TruckScan[]),
          s.listDailyEntries(entryScope).catch(() => []),
        ]);
      return { borders, recentScans, shiftScans, weekScans, entries };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [border, date, weekLabel, ownPost, entryScope?.section, entryScope?.border],
  );

  // Default to the first active post the first time the tab is opened. Never
  // for a posted coordinator — their office is not a default, it is the answer.
  useEffect(() => {
    if (border || postedOffice || !data?.borders.length) return;
    const first = data.borders.find((b) => b.active) || data.borders[0];
    if (first) setBorder(first.name);
  }, [border, postedOffice, data?.borders]);

  const canLog = canEditSection(user, NSSS);
  const isAdmin = user?.role === "admin";

  const daySummary = useMemo(
    () => summariseScans(data?.shiftScans || []),
    [data?.shiftScans],
  );
  const weekSummary = useMemo(
    () => summariseWeek(data?.weekScans || [], weekLabel),
    [data?.weekScans, weekLabel],
  );

  const alreadyPosted = useMemo(() => {
    if (!data || !border) return null;
    return scanLogEntriesFor(data.entries, border, date)[0] || null;
  }, [data, border, date]);

  if (!data) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  const activeBorders = data.borders.filter((b) => b.active);
  const aboveBackground =
    daySummary.byResult.Elevated + daySummary.byResult.Alarm;

  /**
   * Post the day's figure to the section's daily log — replacing any figure
   * this post already posted for the day, so re-posting after a late scan
   * corrects the number instead of doubling it.
   */
  const postDayTotal = async () => {
    if (!weekLabel || !border || posting) return;
    setPosting(true);
    try {
      const s = await store();
      for (const stale of scanLogEntriesFor(data.entries, border, date)) {
        await s.deleteDailyEntry(stale.id);
      }
      await s.addDailyEntry(
        scanLogCountEntry({
          date,
          week: weekLabel,
          border,
          total: daySummary.total,
          uid: user?.uid,
          name: user?.displayName,
        }),
      );
      toast.push(
        `${daySummary.total} posted to Daily Updates for ${border}.`,
        "success",
      );
      reload();
    } catch (err) {
      toast.push(
        `Could not post the total: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setPosting(false);
    }
  };

  const copyNarrative = async () => {
    try {
      await navigator.clipboard.writeText(weeklyNarrative(weekSummary));
      toast.push("Weekly paragraph copied.", "success");
    } catch {
      toast.push("Could not copy — select the text and copy it.", "error");
    }
  };

  return (
    <div className="space-y-4 staggered">
      {/* Shift header — answered once, then it stays out of the way. */}
      <Panel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <span className="field-label">Border post</span>
            {postedOffice ? (
              <>
                <div className="text-sm font-black pt-1.5">{postedOffice}</div>
                <div className="caps text-[10px] text-gunmetal/55">
                  Your posting
                </div>
              </>
            ) : (
              <select
                id="post"
                aria-label="Border post"
                className="input"
                value={border}
                onChange={(e) => setBorder(e.target.value)}
              >
                {!activeBorders.length ? (
                  <option value="">No posts yet</option>
                ) : null}
                {activeBorders.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="field-label" htmlFor="day">
              Date
            </label>
            <input
              id="day"
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="col-span-2 lg:col-span-1">
            <span className="field-label">Direction</span>
            <Segmented
              ariaLabel="Scan direction"
              value={direction}
              onChange={setDirection}
              options={SCAN_DIRECTIONS.map((d) => ({ value: d, label: d }))}
            />
          </div>

          <div className="col-span-2 lg:col-span-1 text-right">
            <div className="caps text-[10px] text-gunmetal/55">
              Counts toward
            </div>
            <div className="text-sm font-black">
              {weekLabel || "(outside the calendar)"}
            </div>
          </div>
        </div>

        {!activeBorders.length && !postedOffice ? (
          <p className="text-xs text-gunmetal/60 mt-3">
            No border posts are configured yet — add them on the{" "}
            <Link className="link-action" href="/nsss">
              NSSS tab
            </Link>
            .
          </p>
        ) : null}
      </Panel>

      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Scanned today"
          value={daySummary.total}
          accent="green"
          caption={border || "—"}
        />
        <Kpi
          label="Above background"
          value={aboveBackground}
          accent={aboveBackground ? "amber" : "neutral"}
          caption={
            daySummary.byResult.Alarm
              ? `${daySummary.byResult.Alarm} at alarm level`
              : "none at alarm level"
          }
        />
        <Kpi
          label="Highest reading"
          value={daySummary.total ? `${daySummary.dose.max}` : "—"}
          caption="nSv/h"
        />
        <Kpi
          label={postedOffice ? "This week, your post" : "This week, all posts"}
          value={weekSummary.total}
          accent="slate"
          caption={weekLabel || "—"}
        />
      </section>

      {canLog && border && weekLabel && user ? (
        <ScanCaptureCard
          border={border}
          date={date}
          week={weekLabel}
          direction={direction}
          officer={{ uid: user.uid, name: user.displayName }}
          todaysScans={data.shiftScans}
          recentScans={data.recentScans}
          onSaved={reload}
        />
      ) : !weekLabel ? (
        <Panel>
          <p className="text-sm text-gunmetal/60">
            Pick a date inside the reporting calendar to log scans.
          </p>
        </Panel>
      ) : !canLog ? (
        <Panel>
          <p className="text-sm text-gunmetal/60">
            Only Nuclear Safety, Security &amp; Safeguards officers (or admins)
            can log border scans. Everyone can read the log and its summaries.
          </p>
        </Panel>
      ) : null}

      <ShiftLog
        scans={data.shiftScans}
        canRemove={(s) => isAdmin || (!!user && s.officerUid === user.uid)}
        onChanged={reload}
      />

      {/* Day / week switch for the summaries. */}
      <Panel>
        <div className="flex items-center gap-3 flex-wrap">
          <Segmented
            ariaLabel="Summary period"
            value={view}
            onChange={setView}
            options={[
              {
                value: "day" as const,
                label: `${border || "This post"} — ${date}`,
              },
              { value: "week" as const, label: "Reporting week" },
            ]}
          />

          <div className="sm:ml-auto flex gap-2 flex-wrap w-full sm:w-auto">
            <button
              className="btn btn-secondary flex-1 sm:flex-none"
              disabled={!daySummary.total}
              onClick={() =>
                downloadTextFile(
                  `border-scans-${border}-${date}.csv`.replace(/\s+/g, "-"),
                  scansToCsv(data.shiftScans),
                )
              }
            >
              Rows (CSV)
            </button>
            <button
              className="btn btn-secondary flex-1 sm:flex-none"
              disabled={!daySummary.total}
              onClick={() =>
                downloadTextFile(
                  `border-summary-${border}-${date}.csv`.replace(/\s+/g, "-"),
                  summaryToCsv(daySummary),
                )
              }
            >
              Summary (CSV)
            </button>
            {canLog ? (
              <button
                className="btn btn-primary w-full sm:w-auto"
                disabled={posting || !daySummary.total || !weekLabel}
                onClick={postDayTotal}
                title="Sends the day's count to Daily Updates, replacing any figure this post already posted."
              >
                {posting
                  ? "Posting…"
                  : alreadyPosted
                    ? `Re-post day total (${alreadyPosted.value ?? 0} posted)`
                    : "Post day total to Daily Updates"}
              </button>
            ) : null}
          </div>
        </div>

        {alreadyPosted ? (
          <p className="text-xs text-gunmetal/55 mt-3">
            {alreadyPosted.value === daySummary.total
              ? `Daily Updates has this day's figure (${alreadyPosted.value}) from the scan log.`
              : `Daily Updates still shows ${alreadyPosted.value} for this post — the log now holds ${daySummary.total}. Re-post to correct it.`}
          </p>
        ) : null}
      </Panel>

      {view === "day" ? (
        <ScanTallies
          summary={daySummary}
          title={`${border || "Post"} · ${date}`}
          caption="Tallied from the rows — nothing here is typed by hand."
        />
      ) : (
        <div className="space-y-4">
          <Panel
            title="For the weekly report"
            action={
              <button className="btn btn-secondary" onClick={copyNarrative}>
                Copy paragraph
              </button>
            }
          >
            <p className="text-sm leading-relaxed">
              {weeklyNarrative(weekSummary)}
            </p>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Bars
              title="Scans by day"
              rows={weekSummary.byDay.map((d) => ({
                label: d.date,
                total: d.total,
              }))}
            />
            <Panel title={postedOffice ? "Your post" : "By border post"} flush>
              {weekSummary.byBorder.length === 0 ? (
                <p className="px-4 sm:px-5 text-sm text-gunmetal/60">
                  No posts have logged scans this week.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Post</th>
                        <th className="num">Scanned</th>
                        <th className="num">Days</th>
                        <th className="num">Above bg</th>
                        <th className="num">Max nSv/h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekSummary.byBorder.map((b) => (
                        <tr key={b.border}>
                          <td className="font-bold">{b.border}</td>
                          <td className="num font-black">{b.total}</td>
                          <td className="num">{b.daysReported}</td>
                          <td className="num">{b.elevated + b.alarms}</td>
                          <td className="num">{b.maxDose}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <ScanTallies
            summary={weekSummary}
            title={weekLabel || "Reporting week"}
            caption={
              postedOffice
                ? `${postedOffice}, this reporting week.`
                : "Every post, this reporting week."
            }
          />
        </div>
      )}
    </div>
  );
}
