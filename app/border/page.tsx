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
 */
import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { Bars } from "@/components/Bars";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { ScanCaptureCard } from "@/components/border/ScanCaptureCard";
import { ScanTallies } from "@/components/border/ScanTallies";
import { ShiftLog } from "@/components/border/ShiftLog";
import { downloadTextFile } from "@/components/downloadFile";
import { useToast } from "@/components/Toast";
import { canEditSection, useAuth } from "@/lib/auth";
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
  const { user } = useAuth();
  const { weeks } = useWeek();
  const toast = useToast();

  const [border, setBorder] = useState("");
  const [date, setDate] = useState(() => todayISO());
  const [direction, setDirection] = useState<ScanDirection>("Inbound");
  const [view, setView] = useState<"day" | "week">("day");
  const [posting, setPosting] = useState(false);

  const weekLabel = useMemo(
    () => weekLabelForDate(date, weeks, ""),
    [date, weeks],
  );

  // An officer works one post; remember which so the header is answered once
  // and not once a day.
  useEffect(() => {
    const saved = window.localStorage.getItem(POST_KEY);
    if (saved) setBorder(saved);
  }, []);
  useEffect(() => {
    if (border) window.localStorage.setItem(POST_KEY, border);
  }, [border]);

  const { data, error, reload } = useStoreData(
    async (s) => {
      const [borders, recentScans, shiftScans, weekScans, entries] =
        await Promise.all([
          s.listBorders().catch(() => []),
          // Every read degrades to empty so the tab still renders before the
          // truckScans rules/index are deployed.
          s.listTruckScans().catch(() => [] as TruckScan[]),
          border
            ? s.listTruckScansFor(border, date).catch(() => [] as TruckScan[])
            : Promise.resolve([] as TruckScan[]),
          weekLabel
            ? s.listTruckScansForWeek(weekLabel).catch(() => [] as TruckScan[])
            : Promise.resolve([] as TruckScan[]),
          s.listDailyEntries().catch(() => []),
        ]);
      return { borders, recentScans, shiftScans, weekScans, entries };
    },
    [border, date, weekLabel],
  );

  // Default to the first active post the first time the tab is opened.
  useEffect(() => {
    if (border || !data?.borders.length) return;
    const first = data.borders.find((b) => b.active) || data.borders[0];
    if (first) setBorder(first.name);
  }, [border, data?.borders]);

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
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="caps text-[10px] text-gunmetal/60" htmlFor="post">
              Border post
            </label>
            <select
              id="post"
              className="input mt-1"
              style={{ minWidth: 180 }}
              value={border}
              onChange={(e) => setBorder(e.target.value)}
            >
              {!activeBorders.length ? <option value="">No posts yet</option> : null}
              {activeBorders.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="caps text-[10px] text-gunmetal/60" htmlFor="day">
              Date
            </label>
            <input
              id="day"
              type="date"
              className="input mt-1"
              style={{ maxWidth: 170 }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <div className="caps text-[10px] text-gunmetal/60">Direction</div>
            <div className="flex gap-1.5 mt-1">
              {SCAN_DIRECTIONS.map((d) => (
                <button
                  key={d}
                  aria-pressed={direction === d}
                  onClick={() => setDirection(d)}
                  className="px-3 py-2 rounded-lg text-xs font-bold border"
                  style={{
                    background: direction === d ? "var(--rpa-green)" : "var(--white)",
                    color: direction === d ? "white" : "var(--gunmetal)",
                    borderColor:
                      direction === d ? "var(--rpa-green)" : "rgba(26,27,29,0.14)",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto text-right">
            <div className="caps text-[10px] text-gunmetal/60">Counts toward</div>
            <div className="text-sm font-black">
              {weekLabel || "(outside the calendar)"}
            </div>
          </div>
        </div>

        {!activeBorders.length ? (
          <div className="text-xs text-gunmetal/60 mt-3">
            No border posts are configured yet — add them on the{" "}
            <Link
              className="font-bold"
              style={{ color: "var(--rpa-green-dark)" }}
              href="/nsss"
            >
              NSSS tab
            </Link>
            .
          </div>
        ) : null}
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          label="This week, all posts"
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
        <div className="card p-5 text-sm text-gunmetal/60">
          Pick a date inside the reporting calendar to log scans.
        </div>
      ) : !canLog ? (
        <div className="card p-5 text-sm text-gunmetal/60">
          Only Nuclear Safety, Security &amp; Safeguards officers (or admins) can
          log border scans. Everyone can read the log and its summaries.
        </div>
      ) : null}

      <ShiftLog
        scans={data.shiftScans}
        canRemove={(s) => isAdmin || (!!user && s.officerUid === user.uid)}
        onChanged={reload}
      />

      {/* Day / week switch for the summaries. */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["day", "week"] as const).map((v) => (
          <button
            key={v}
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className="px-4 py-2 rounded-full text-sm font-bold border"
            style={{
              background: view === v ? "var(--rpa-green)" : "var(--white)",
              color: view === v ? "white" : "var(--gunmetal)",
              borderColor: view === v ? "var(--rpa-green)" : "rgba(26,27,29,0.12)",
            }}
          >
            {v === "day" ? `${border || "This post"} — ${date}` : "Reporting week"}
          </button>
        ))}

        <div className="ml-auto flex gap-2 flex-wrap">
          <button
            className="btn btn-secondary text-xs"
            disabled={!daySummary.total}
            onClick={() =>
              downloadTextFile(
                `border-scans-${border}-${date}.csv`.replace(/\s+/g, "-"),
                scansToCsv(data.shiftScans),
              )
            }
          >
            Export rows (CSV)
          </button>
          <button
            className="btn btn-secondary text-xs"
            disabled={!daySummary.total}
            onClick={() =>
              downloadTextFile(
                `border-summary-${border}-${date}.csv`.replace(/\s+/g, "-"),
                summaryToCsv(daySummary),
              )
            }
          >
            Export summary (CSV)
          </button>
          {canLog ? (
            <button
              className="btn btn-primary text-xs"
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
        <div className="text-xs text-gunmetal/55">
          {alreadyPosted.value === daySummary.total
            ? `Daily Updates has this day's figure (${alreadyPosted.value}) from the scan log.`
            : `Daily Updates still shows ${alreadyPosted.value} for this post — the log now holds ${daySummary.total}. Re-post to correct it.`}
        </div>
      ) : null}

      {view === "day" ? (
        <ScanTallies
          summary={daySummary}
          title={`${border || "Post"} · ${date}`}
          caption="Tallied from the rows — nothing here is typed by hand."
        />
      ) : (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="caps text-xs text-gunmetal/60 mb-1">
              For the weekly report
            </div>
            <p className="text-sm leading-relaxed">{weeklyNarrative(weekSummary)}</p>
            <button className="btn btn-secondary text-xs mt-3" onClick={copyNarrative}>
              Copy paragraph
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Bars
              title="Scans by day"
              rows={weekSummary.byDay.map((d) => ({ label: d.date, total: d.total }))}
            />
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gunmetal/8 font-black">
                By border post
              </div>
              {weekSummary.byBorder.length === 0 ? (
                <div className="p-6 text-sm text-gunmetal/60">
                  No posts have logged scans this week.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs caps text-gunmetal/55">
                        <th className="px-5 py-2">Post</th>
                        <th className="px-5 py-2 text-right">Scanned</th>
                        <th className="px-5 py-2 text-right">Days</th>
                        <th className="px-5 py-2 text-right">Above bg</th>
                        <th className="px-5 py-2 text-right">Max nSv/h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekSummary.byBorder.map((b) => (
                        <tr key={b.border} className="border-t border-gunmetal/8">
                          <td className="px-5 py-2 font-bold">{b.border}</td>
                          <td className="px-5 py-2 text-right tabular font-black">
                            {b.total}
                          </td>
                          <td className="px-5 py-2 text-right tabular">
                            {b.daysReported}
                          </td>
                          <td className="px-5 py-2 text-right tabular">
                            {b.elevated + b.alarms}
                          </td>
                          <td className="px-5 py-2 text-right tabular">{b.maxDose}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <ScanTallies
            summary={weekSummary}
            title={weekLabel || "Reporting week"}
            caption="Every post, this reporting week."
          />
        </div>
      )}
    </div>
  );
}
