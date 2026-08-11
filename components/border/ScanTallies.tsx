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
      <div className="card p-5">
        <div className="caps text-xs text-gunmetal/60 mb-1">{title}</div>
        <div className="text-sm text-gunmetal/55">
          Nothing logged yet. The tallies build themselves as scans are saved —
          there is nothing to add up at the end of the shift.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div className="caps text-xs text-gunmetal/60">{title}</div>
            <div className="text-3xl font-black tabular">
              {summary.total.toLocaleString()}
              <span className="text-sm font-normal text-gunmetal/60 ml-2">
                trucks scanned
              </span>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            {CARGO_CLASSES.map((c) => (
              <div key={c} className="text-right">
                <div className="caps text-[10px] text-gunmetal/55">{c}</div>
                <div className="text-lg font-black tabular">{summary.byClass[c]}</div>
              </div>
            ))}
          </div>
        </div>
        {caption ? (
          <div className="text-xs text-gunmetal/55 mt-2">{caption}</div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Highest reading" value={`${summary.dose.max} nSv/h`} />
          <Stat label="Typical (median)" value={`${summary.dose.median} nSv/h`} />
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
      </div>

      {/* Above background — the part the weekly report is actually about. */}
      {summary.aboveBackground.length ? (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gunmetal/8 font-black">
            Readings above background
            <span className="text-xs font-normal text-gunmetal/55 ml-2">
              {summary.aboveBackground.length} of {summary.total}
              {summary.aboveBackgroundOnNorm
                ? ` · ${summary.aboveBackgroundOnNorm} on NORM-bearing cargo`
                : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs caps text-gunmetal/55">
                  <th className="px-5 py-2">Unit</th>
                  <th className="px-5 py-2">Cargo</th>
                  <th className="px-5 py-2 text-right">Dose</th>
                  <th className="px-5 py-2">Action taken</th>
                </tr>
              </thead>
              <tbody>
                {summary.aboveBackground.map((s) => (
                  <tr key={s.id} className="border-t border-gunmetal/8">
                    <td className="px-5 py-2 font-bold">
                      {s.vehicleId}
                      <span className="block text-[11px] font-normal text-gunmetal/55">
                        {s.date}
                        {s.time ? ` ${s.time}` : ""} · {s.border}
                      </span>
                    </td>
                    <td className="px-5 py-2">
                      {s.commodity}
                      {s.norm ? <span className="chip ml-1">NORM</span> : null}
                    </td>
                    <td
                      className="px-5 py-2 text-right tabular font-black"
                      style={{ color: RESULT_COLOUR[s.result] }}
                    >
                      {s.doseNSvH}
                    </td>
                    <td className="px-5 py-2">{s.action || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* The three tally blocks. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CARGO_CLASSES.map((c) => (
          <TallyCard
            key={c}
            title={c}
            rows={summary.commodities[c]}
            total={summary.byClass[c]}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TallyCard
          title="Transporters / declarants"
          rows={summary.transporters}
          total={summary.total}
          limit={15}
        />
        <ReviewCard summary={summary} />
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
      <div className="text-lg font-black tabular" style={colour ? { color: colour } : undefined}>
        {value}
      </div>
    </div>
  );
}

function TallyCard({
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
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-2">
        <div className="caps text-xs text-gunmetal/60">{title}</div>
        <div className="text-sm font-black tabular">{total}</div>
      </div>
      {shown.length === 0 ? (
        <div className="text-sm text-gunmetal/55">None</div>
      ) : (
        <ul className="text-sm divide-y divide-gunmetal/8">
          {shown.map((t) => (
            <li key={t.name} className="flex justify-between gap-3 py-1.5">
              <span>{t.name}</span>
              <span className="tabular font-bold">{t.count}</span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown.length ? (
        <div className="text-[11px] text-gunmetal/55 mt-2">
          + {rows.length - shown.length} more — the full list is in the CSV export.
        </div>
      ) : null}
    </div>
  );
}

/**
 * What a human should look at before the figures are reported: commodities the
 * vocabulary has not seen, units logged twice, and transporter names that look
 * like the same firm typed two ways. The spreadsheet could not raise any of
 * these, which is why a month of it carried six spellings of "sulphur".
 */
function ReviewCard({ summary }: { summary: ScanSummary }) {
  const nothing =
    !summary.newCommodities.length &&
    !summary.repeatedVehicles.length &&
    !summary.possibleDuplicateTransporters.length;

  return (
    <div className="card p-5">
      <div className="caps text-xs text-gunmetal/60 mb-2">Worth a look</div>
      {nothing ? (
        <div className="text-sm text-gunmetal/55">
          Nothing to query — every commodity was from the standard list, no unit
          was logged twice, and no transporter name looks like a duplicate.
        </div>
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
                {summary.possibleDuplicateTransporters.slice(0, 8).map(([a, b]) => (
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
    </div>
  );
}
