"use client";

import {
  ENFORCEMENT_COLUMNS,
  INSPECTION_COLUMNS,
  type InspectionSummary,
  type SummaryRow,
} from "@/lib/rules/inspectionDatabase";

/**
 * The Inspectorate workbook's Summary sheet: one row per province round, the
 * INSPECTIONS / ENFORCEMENT ACTIONS bands across the top, and the Total row
 * underneath. The enforcement band is Management's six-column format; the
 * engagements an inspector may still record are not summarised here.
 *
 * The dashboard shows it for the year and the weekly report shows it for the
 * reporting week — same table, different slice of the register, which is the
 * point of keeping it in one component.
 */
export function InspectionSummaryTable({
  summary,
  onPickRound,
  activeRound,
}: {
  summary: InspectionSummary;
  /** Drill into a round's facility sheet. Rows are inert without it. */
  onPickRound?: (round: string) => void;
  activeRound?: string;
}) {
  if (summary.rows.length === 0) {
    return (
      <p className="px-4 sm:px-5 py-6 text-sm text-gunmetal/60">
        No inspections recorded in this period yet. Log one and every figure on
        this summary fills in — nothing here is typed.
      </p>
    );
  }

  const cells = (s: SummaryRow) => (
    <>
      {INSPECTION_COLUMNS.map((c) => (
        <td key={c.key} className="num">
          {s.inspections[c.key] || "—"}
        </td>
      ))}
      <td className="num font-black">{s.inspectionsTotal || "—"}</td>
      {ENFORCEMENT_COLUMNS.map((c, idx) => (
        <td key={c.key} className={`num${idx === 0 ? " grp" : ""}`}>
          {s.enforcement[c.key] || "—"}
        </td>
      ))}
      <td className="num font-black grp">{s.enforcementTotal || "—"}</td>
    </>
  );

  return (
    <div className="table-wrap">
      <table className="data insp-table">
        <thead>
          <tr className="band">
            <th />
            <th colSpan={INSPECTION_COLUMNS.length + 1}>Inspections</th>
            <th className="grp" colSpan={ENFORCEMENT_COLUMNS.length}>
              Enforcement actions
            </th>
            <th className="grp" />
          </tr>
          <tr>
            <th>Province</th>
            {INSPECTION_COLUMNS.map((c) => (
              <th key={c.key} className="num">
                {c.label}
              </th>
            ))}
            <th className="num">Total</th>
            {ENFORCEMENT_COLUMNS.map((c, idx) => (
              <th key={c.key} className={`num${idx === 0 ? " grp" : ""}`}>
                {c.label}
              </th>
            ))}
            <th className="num grp">Total</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((s) => (
            <tr
              key={s.round}
              className={`${onPickRound ? "row-hover cursor-pointer" : ""}${
                activeRound === s.round ? " bg-mist" : ""
              }`}
              onClick={onPickRound ? () => onPickRound(s.round) : undefined}
            >
              <td className="font-bold">{s.round}</td>
              {cells(s)}
            </tr>
          ))}
          <tr className="total-row">
            <td>Total</td>
            {cells(summary.total)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * The workbook's two headline figures, printed under the summary exactly as it
 * prints them.
 */
export function InspectionSummaryFooter({
  summary,
}: {
  summary: InspectionSummary;
}) {
  return (
    <div className="px-4 sm:px-5 py-3 flex flex-wrap gap-x-8 gap-y-2 text-sm border-t border-gunmetal/8">
      <div>
        <span className="caps text-[10px] text-gunmetal/55">
          Total inspections conducted
        </span>
        <div className="text-xl font-black tabular">
          {summary.total.inspectionsTotal}
        </div>
      </div>
      <div>
        <span className="caps text-[10px] text-gunmetal/55">
          Total enforcements
        </span>
        <div className="text-xl font-black tabular">
          {summary.total.enforcementTotal}
        </div>
      </div>
      <div>
        <span className="caps text-[10px] text-gunmetal/55">
          Facilities inspected
        </span>
        <div className="text-xl font-black tabular">
          {summary.total.facilities}
        </div>
      </div>
    </div>
  );
}
