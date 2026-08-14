"use client";

import {
  enforcementTone,
  INSPECTION_COLUMNS,
  type CardStatus,
  type DatabaseRow,
} from "@/lib/rules/inspectionDatabase";

const CARD_TONE: Record<CardStatus, string> = {
  Active: "green",
  "Expiring Soon": "amber",
  Expired: "red",
};

export function CardStatusChip({ status }: { status: CardStatus | "" }) {
  if (!status) return <span className="text-gunmetal/40">—</span>;
  return <span className={`chip ${CARD_TONE[status]}`}>{status}</span>;
}

export function EnforcementChip({ action }: { action: string }) {
  return <span className={`chip ${enforcementTone(action)}`}>{action}</span>;
}

/**
 * A province sheet of the Inspectorate workbook: one row per facility, the four
 * inspection-type columns and their total, the enforcement action taken, and the
 * inspection card's issue date, expiry and status.
 *
 * Zero rows are shown, not hidden — a province sheet is the round's coverage
 * list, so the facilities still to be reached are as much of the report as the
 * ones already done.
 */
export function InspectionDatabaseTable({
  rows,
  showRound,
  onPickFacility,
}: {
  rows: DatabaseRow[];
  /** Lead with the PROVINCE column (the consolidated Database sheet). */
  showRound?: boolean;
  onPickFacility?: (row: DatabaseRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 sm:px-5 py-6 text-sm text-gunmetal/60">
        Nothing to show for this selection.
      </p>
    );
  }

  return (
    <>
      <div className="hidden md:block table-wrap">
        <table className="data insp-table">
          <thead>
            <tr>
              <th>{showRound ? "Province" : "No."}</th>
              <th>Facility name</th>
              <th>District</th>
              <th>Practice</th>
              {INSPECTION_COLUMNS.map((c) => (
                <th key={c.key} className="num">
                  {c.label}
                </th>
              ))}
              <th className="num">Total</th>
              <th>Enforcement action taken</th>
              <th>Card issued</th>
              <th>Card expiry</th>
              <th>Card status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.round}::${r.facilityId || r.facility}`}
                className={onPickFacility ? "row-hover cursor-pointer" : ""}
                onClick={onPickFacility ? () => onPickFacility(r) : undefined}
              >
                <td className={showRound ? "whitespace-nowrap" : "num"}>
                  {showRound ? r.round : r.no}
                </td>
                <td className="font-bold">{r.facility}</td>
                <td>{r.district || "—"}</td>
                <td className="text-xs text-gunmetal/70">{r.practice || "—"}</td>
                {INSPECTION_COLUMNS.map((c) => (
                  <td key={c.key} className="num">
                    {r.counts[c.key] || ""}
                  </td>
                ))}
                <td className="num font-black">{r.total}</td>
                <td>
                  {r.enforcement ? (
                    <EnforcementChip action={r.enforcement} />
                  ) : (
                    <span className="text-gunmetal/40">—</span>
                  )}
                  {r.enforcements.length > 1 ? (
                    <span className="text-[11px] text-gunmetal/55 ml-1">
                      +{r.enforcements.length - 1}
                    </span>
                  ) : null}
                </td>
                <td className="tabular">{r.cardIssued || "—"}</td>
                <td className="tabular">{r.cardExpiry || "—"}</td>
                <td>
                  <CardStatusChip status={r.cardStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden divide-y divide-gunmetal/8">
        {rows.map((r) => (
          <li
            key={`${r.round}::${r.facilityId || r.facility}`}
            className="px-4 py-3"
            onClick={onPickFacility ? () => onPickFacility(r) : undefined}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold leading-tight break-words">
                  {r.facility}
                </div>
                <div className="text-[11px] text-gunmetal/55">
                  {showRound ? `${r.round} · ` : ""}
                  {r.district || "—"} · {r.practice || "—"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-black tabular leading-none">
                  {r.total}
                </div>
                <div className="text-[10px] caps text-gunmetal/55">
                  inspections
                </div>
              </div>
            </div>
            {r.total > 0 ? (
              <div className="mt-1.5 text-[11px] text-gunmetal/65 tabular">
                {INSPECTION_COLUMNS.filter((c) => r.counts[c.key] > 0)
                  .map((c) => `${c.label} ${r.counts[c.key]}`)
                  .join(" · ")}
              </div>
            ) : null}
            <div className="mt-1.5 flex flex-wrap gap-1 items-center">
              {r.enforcement ? <EnforcementChip action={r.enforcement} /> : null}
              <CardStatusChip status={r.cardStatus} />
              {r.cardIssued ? (
                <span className="text-[11px] text-gunmetal/55 tabular">
                  card {r.cardIssued} → {r.cardExpiry}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
