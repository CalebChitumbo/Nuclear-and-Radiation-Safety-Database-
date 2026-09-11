"use client";

import { useMemo, useState } from "react";

import { downloadBinaryFile } from "@/components/downloadFile";
import { Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
import { useToast } from "@/components/Toast";
import { store } from "@/lib/store";
import { useWeek } from "@/lib/weekContext";
import {
  buildScreeningWorkbook,
  exportedEntries,
  screeningExportFilename,
  screeningPeriod,
  weeksInPeriod,
  type ScreeningPeriodKind,
} from "@/lib/rules/screeningExport";
import { todayISO } from "@/lib/rules/week";
import { buildXlsx, XLSX_MIME } from "@/lib/rules/xlsx";
import type { Border, DailyEntry, TruckScan } from "@/lib/rules/types";

const PERIODS: Array<{ value: ScreeningPeriodKind; label: string }> = [
  { value: "week", label: "Reporting week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];

/**
 * Beyond this many reporting weeks the underlying scan rows are not offered:
 * a year of Nakonde is a hundred thousand rows, which is not a file anyone
 * uploads to SharePoint by hand. The daily totals and entries still go.
 */
const SCAN_WEEK_LIMIT = 14;

/**
 * "Export to Excel for SharePoint" — the border-screening records as a
 * workbook: the office, the period, the daily totals, and every entry behind
 * them (plus the truck scans for a week or a month, when asked).
 *
 * The reporting system stays where figures are entered; SharePoint keeps the
 * file. Nothing here writes — it reads the same entries the sectional update
 * counts and hands them over.
 */
export function ScreeningExportPanel({
  entries,
  borders,
  /** A posted officer exports their own office and nothing else. */
  fixedOffice,
  generatedBy,
}: {
  entries: DailyEntry[];
  borders: Border[];
  fixedOffice?: string | null;
  generatedBy: string;
}) {
  const { weeks, selected } = useWeek();
  const toast = useToast();
  const today = todayISO();
  const [kind, setKind] = useState<ScreeningPeriodKind>("week");
  const [office, setOffice] = useState(fixedOffice || "");
  const [anchor, setAnchor] = useState(today);
  const [withScans, setWithScans] = useState(false);
  const [busy, setBusy] = useState(false);

  const effectiveOffice = fixedOffice || office;
  const period = useMemo(
    () => screeningPeriod(kind, anchor, selected),
    [kind, anchor, selected],
  );
  const preview = useMemo(
    () => exportedEntries({ office: effectiveOffice, period, entries }),
    [effectiveOffice, period, entries],
  );
  const total = preview.reduce((n, e) => n + (e.value || 0), 0);
  const periodWeeks = useMemo(() => weeksInPeriod(period, weeks), [period, weeks]);
  const scansAllowed = periodWeeks.length > 0 && periodWeeks.length <= SCAN_WEEK_LIMIT;

  // Offices come from the register and from the entries themselves, so a post
  // that has figures on file but was later deactivated is still exportable.
  const offices = useMemo(() => {
    const names = new Set<string>(borders.map((b) => b.name));
    for (const e of entries) if (e.border) names.add(e.border);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [borders, entries]);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let scans: TruckScan[] | undefined;
      if (withScans && scansAllowed) {
        const s = await store();
        const perWeek = await Promise.all(
          periodWeeks.map((w) =>
            s
              .listTruckScansForWeek(w.label, effectiveOffice || undefined)
              .catch(() => [] as TruckScan[]),
          ),
        );
        scans = perWeek.flat();
      }
      const sheets = buildScreeningWorkbook({
        office: effectiveOffice,
        period,
        entries,
        scans,
        weeks,
        generatedAt: new Date().toISOString(),
        generatedBy,
      });
      downloadBinaryFile(
        screeningExportFilename(effectiveOffice, period, today),
        buildXlsx(sheets),
        XLSX_MIME,
      );
      toast.push(
        `Workbook ready — ${preview.length} entr${preview.length === 1 ? "y" : "ies"}, ${total.toLocaleString()} vehicles${
          scans ? `, ${scans.length.toLocaleString()} scans` : ""
        }. Upload it to SharePoint.`,
        "success",
      );
    } catch (err) {
      toast.push(
        `Export failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Export to Excel for SharePoint"
      note="One workbook: Summary (office, period, totals), Daily totals (a column per office), Entries (every figure and who logged it) and, for a week or a month, the truck scans behind them. The reporting system stays where figures are entered — SharePoint keeps the file."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <span className="field-label">Office</span>
          {fixedOffice ? (
            <div className="input bg-mist/60" aria-readonly>
              {fixedOffice}
            </div>
          ) : (
            <select
              className="input"
              aria-label="Office"
              value={office}
              onChange={(e) => setOffice(e.target.value)}
            >
              <option value="">All inland offices</option>
              {offices.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="field-label" htmlFor="screen-export-anchor">
            {kind === "week" ? "Reporting week" : "A day in the period"}
          </label>
          {kind === "week" ? (
            <div className="input bg-mist/60 tabular">{selected.label}</div>
          ) : (
            <input
              id="screen-export-anchor"
              type="date"
              className="input"
              value={anchor}
              disabled={kind === "all"}
              onChange={(e) => setAnchor(e.target.value || today)}
            />
          )}
        </div>
        <div className="md:col-span-2">
          <span className="field-label">Reporting period</span>
          <Segmented
            ariaLabel="Reporting period"
            value={kind}
            onChange={setKind}
            options={PERIODS}
          />
          <p className="text-[11px] text-gunmetal/55 mt-1">
            {kind === "week"
              ? "The week picked in the header. Change it there to export another."
              : `${period.label}${period.start ? ` · ${period.start} → ${period.end}` : ""}`}
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withScans && scansAllowed}
              disabled={!scansAllowed}
              onChange={(e) => setWithScans(e.target.checked)}
            />
            <span>
              Include the underlying truck scans
              {scansAllowed
                ? ` (${periodWeeks.length} reporting week${periodWeeks.length === 1 ? "" : "s"})`
                : " — a week, a month or a quarter only"}
            </span>
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className="btn btn-primary w-full sm:w-auto"
          disabled={busy || preview.length === 0}
          onClick={run}
        >
          {busy ? "Building…" : "Download Excel workbook"}
        </button>
        <span className="text-sm text-gunmetal/65 tabular">
          {preview.length === 0
            ? "No screening figures in this period."
            : `${preview.length} entr${preview.length === 1 ? "y" : "ies"} · ${total.toLocaleString()} vehicles screened`}
        </span>
      </div>
    </Panel>
  );
}
