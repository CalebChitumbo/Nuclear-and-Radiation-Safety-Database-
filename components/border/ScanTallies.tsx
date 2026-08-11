"use client";

/**
 * The summary block the workbook kept by hand, computed from the rows.
 *
 * Each daily sheet carried three tally columns beside the scan rows — every
 * distinct commodity under "goods of interest", "food" and "other", with a
 * count against each — retyped at the end of every shift. That is all here,
 * plus the two things a tally cannot tell you: what the readings looked like,
 * and which rows need a human to look at them again.
 */
import { Panel } from "@/components/Section";
import { CARGO_CLASSES, type CargoClass } from "@/lib/rules/borderCargo";
import type { ScanSummary, Tally } from "@/lib/rules/borderScans";
import { SCAN_RESULTS, type ScanResult } from "@/lib/rules/types";

const RESULT_COLOUR: Record<ScanResult, string> = {
  Normal: "var(--rpa-green-dark)",
  Elevated: "#7a5b07",
  Alarm: "var(--status-stalled)",
};

export function ScanTallies({
  summary,
  title,
  caption,
}: {
  summary: ScanSummary;
  title: string;
  caption?: string;
}) {
  if (!summary.total) {
    return (
      <Panel title={title}>
        <p className="text-sm text-gunmetal/55">
          Nothing logged yet. The tallies build themselves as scans are saved —
          there is nothing to add up at the end of the shift.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title={title} note={caption}>
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div className="text-3xl font-black tabular">
            {summary.total.toLocaleString()}
            <span className="text-sm font-normal text-gunmetal/60 ml-2">
              trucks scanned
            </span>
          </div>
          <div className="flex gap-4 text-sm">
            {CARGO_CLASSES.map((c) => (
              <div key={c} className="text-right">
                <div className="caps text-[10px] text-gunmetal/55">{c}</div>
                <div className="text-lg font-black tabular">
                  {summary.byClass[c]}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Highest reading" value={`${summary.dose.max} nSv/h`} />
          <Stat
            label="Typical (median)"
            value={`${summary.dose.median} nSv/h`}
          />
          <Stat
            label="Above background"
            value={String(summary.byResult.Elevated + summary.byResult.Alarm)}
            colour={
              summary.byResult.Elevated + summary.byResult.Alarm
                ? RESULT_COLOUR.Elevated
                : undefined
            }
          />
          <Stat
            label="At alarm level"
            value={String(summary.byResult.Alarm)}
            colour={summary.byResult.Alarm ? RESULT_COLOUR.Alarm : undefined}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SCAN_RESULTS.map((r) =>
            summary.byResult[r] ? (
              <span
                key={r}
                className="chip"
                style={{ color: RESULT_COLOUR[r], fontWeight: 700 }}
              >
                {r} {summary.byResult[r]}
              </span>
            ) : null,
          )}
        </div>
      </Panel>

      {/* Above background — the part the weekly report is actually about. */}
      {summary.aboveBackground.length ? (
        <Panel
          title={`Readings above background — ${summary.aboveBackground.length} of ${summary.total}${
            summary.aboveBackgroundOnNorm
              ? ` · ${summary.aboveBackgroundOnNorm} on NORM-bearing cargo`
              : ""
          }`}
          flush
        >
          <div className="hidden sm:block table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Cargo</th>
                  <th className="num">Dose</th>
                  <th>Action taken</th>
                </tr>
              </thead>
              <tbody>
                {summary.aboveBackground.map((s) => (
                  <tr key={s.id}>
                    <td className="font-bold">
                      {s.vehicleId}
                      <span className="block text-[11px] font-normal text-gunmetal/55">
                        {s.date}
                        {s.time ? ` ${s.time}` : ""} · {s.border}
                      </span>
                    </td>
                    <td>
                      {s.commodity}
                      {s.norm ? <span className="chip ml-1">NORM</span> : null}
                    </td>
                    <td
                      className="num font-black"
                      style={{ color: RESULT_COLOUR[s.result] }}
                    >
                      {s.doseNSvH}
                    </td>
                    <td>{s.action || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="sm:hidden divide-y divide-gunmetal/8">
            {summary.aboveBackground.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold break-words">{s.vehicleId}</div>
                    <div className="text-[11px] text-gunmetal/55">
                      {s.date}
                      {s.time ? ` ${s.time}` : ""} · {s.border}
                    </div>
                  </div>
                  <div
                    className="tabular font-black shrink-0"
                    style={{ color: RESULT_COLOUR[s.result] }}
                  >
                    {s.doseNSvH}
                    <span className="text-[10px] font-normal text-gunmetal/50">
                      {" "}
                      nSv/h
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-gunmetal/70 break-words">
                  {s.commodity}
                  {s.norm ? <span className="chip ml-1">NORM</span> : null}
                </div>
                {s.action ? (
                  <div className="text-[11px] text-gunmetal/55 mt-0.5">
                    {s.action}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* The three tally blocks. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CARGO_CLASSES.map((c) => (
          <TallyPanel
            key={c}
            title={c}
            rows={summary.commodities[c]}
            total={summary.byClass[c]}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TallyPanel
          title="Transporters / declarants"
          rows={summary.transporters}
          total={summary.total}
          limit={15}
        />
        <ReviewPanel summary={summary} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  colour,
}: {
  label: string;
  value: string;
  colour?: string;
}) {
  return (
    <div>
      <div className="caps text-[10px] text-gunmetal/55">{label}</div>
      <div
        className="text-lg font-black tabular"
        style={colour ? { color: colour } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function TallyPanel({
  title,
  rows,
  total,
  limit = 25,
}: {
  title: string | CargoClass;
  rows: Tally[];
  total: number;
  limit?: number;
}) {
  const shown = rows.slice(0, limit);
  return (
    <Panel
      title={title}
      action={<span className="text-sm font-black tabular">{total}</span>}
    >
      {shown.length === 0 ? (
        <p className="text-sm text-gunmetal/55">None</p>
      ) : (
        <ul className="text-sm divide-y divide-gunmetal/8">
          {shown.map((t) => (
            <li key={t.name} className="flex justify-between gap-3 py-2">
              <span className="min-w-0 break-words">{t.name}</span>
              <span className="tabular font-bold shrink-0">{t.count}</span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown.length ? (
        <p className="text-[11px] text-gunmetal/55 mt-2">
          + {rows.length - shown.length} more — the full list is in the CSV
          export.
        </p>
      ) : null}
    </Panel>
  );
}

/**
 * What a human should look at before the figures are reported: commodities the
 * vocabulary has not seen, units logged twice, and transporter names that look
 * like the same firm typed two ways. The spreadsheet could not raise any of
 * these, which is why a month of it carried six spellings of "sulphur".
 */
function ReviewPanel({ summary }: { summary: ScanSummary }) {
  const nothing =
    !summary.newCommodities.length &&
    !summary.repeatedVehicles.length &&
    !summary.possibleDuplicateTransporters.length;

  return (
    <Panel title="Worth a look">
      {nothing ? (
        <p className="text-sm text-gunmetal/55">
          Nothing to query — every commodity was from the standard list, no unit
          was logged twice, and no transporter name looks like a duplicate.
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          {summary.newCommodities.length ? (
            <div>
              <div className="font-bold">
                New commodities ({summary.newCommodities.length})
              </div>
              <div className="text-gunmetal/70">
                {summary.newCommodities
                  .map((t) => `${t.name} (${t.count})`)
                  .join(", ")}
              </div>
              <div className="text-[11px] text-gunmetal/55 mt-0.5">
                Not yet in the standard list. Worth adding the ones that recur.
              </div>
            </div>
          ) : null}

          {summary.repeatedVehicles.length ? (
            <div>
              <div className="font-bold">
                Units logged more than once ({summary.repeatedVehicles.length})
              </div>
              <div className="text-gunmetal/70">
                {summary.repeatedVehicles
                  .slice(0, 12)
                  .map((t) => `${t.name} ×${t.count}`)
                  .join(", ")}
              </div>
              <div className="text-[11px] text-gunmetal/55 mt-0.5">
                Either a second pass through the lane or a double entry.
              </div>
            </div>
          ) : null}

          {summary.possibleDuplicateTransporters.length ? (
            <div>
              <div className="font-bold">
                Transporter names that may be the same firm
              </div>
              <ul className="text-gunmetal/70">
                {summary.possibleDuplicateTransporters
                  .slice(0, 8)
                  .map(([a, b]) => (
                    <li key={`${a}|${b}`}>
                      {a} · {b}
                    </li>
                  ))}
              </ul>
              <div className="text-[11px] text-gunmetal/55 mt-0.5">
                Listed, not merged — two real companies can look alike.
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
