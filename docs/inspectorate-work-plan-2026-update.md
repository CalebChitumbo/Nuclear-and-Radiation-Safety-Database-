# Inspectorate work plan update — Subprogramme 1.2

Applied 2026-08-22 from `INSPECTORATE_WORK_PLAN_NRS.xlsx`, sheet
*Subprogram 1.2* — the Inspectorate's own copy of the approved 2026 work plan.

Unlike the licensing register and the screening log, these figures have no
record behind them the system holds, so they are carried in as the outputs'
**opening balance** (`WORK_PLAN_OPENING_BALANCE` in `lib/rules/workPlan.ts`)
rather than imported as data. Every inspection the section logs from here adds
on top; the report shows the split (*Total actual = opening balance + recorded
since*) on every row.

## Figures carried in

| Output | Description | Target | Q1 | Q2 | Q3 | Q4 | Total | % |
|---|---|---|---|---|---|---|---|---|
| 1.2.1 | Development of Inspection Programme 2026 | 1 | 1 | — | — | — | 1 | 100% |
| 1.2.2 | Review of SOPs for Inspectorate | 1 | 1 | — | — | — | 1 | 100% |
| 1.2.3 | Training for Inspectors (Radiotherapy/Diagnostic/Nuclear Medicine) | 4 | — | 2 | — | — | 2 | 50% |
| 1.2.4 | Routine, follow-up, pre-authorization & investigative inspections | 500 | 40 | 123 | 121 | — | **284** | 56.8% |
| 1.2.5 | Enhance smart reporting system for inspection | 1 | 1 | 1 | — | — | 2 | 200% |
| 1.2.6 | Conduct TWG Meetings | 36 | 8 | 8 | 7 | — | 23 | 63.9% |
| 1.2.7 | Periodic Data Maintenance and Update on RAIS | 4 | 1 | 1 | — | — | 2 | 50% |
| 1.2.8 | Develop Enforcement Policy | 1 | 1 | — | — | — | 1 | 100% |
| 1.2.9 | National Radiation Source Inventory Exercise | 1 | — | 1 | — | — | 1 | 100% |
| 1.2.10 | Review of Inspection Manual | 1 | — | 1 | — | — | 1 | 100% |
| 1.2.11 | Conduct Enforcement Actions | 50 | 45 | 61 | 87 | — | **193** | 386% |

The targets were already those of the approved plan and are unchanged; only the
quarterly actuals moved. What changed against the previous figures:

| Output | Was | Now |
|---|---|---|
| 1.2.4 | 40 / 96 → 136 | 40 / 123 / 121 → **284** |
| 1.2.5 | 1 → 1 | 1 / 1 → **2** |
| 1.2.6 | 3 / 1 → 4 | 8 / 8 / 7 → **23** |
| 1.2.11 | 61 → 61 | 45 / 61 / 87 → **193** |

Everything else was already at the workbook's figure.

## What this does *not* populate

The sheet reports the section's outputs, not its inspections. The Inspectorate
tab (`/inspectorate`) is the section's **inspection database** — a facility per
row, with its inspection-type counts, the enforcement action taken and the
inspection card's issue date, expiry and status — and every one of those rows
is derived from a dated `inspections` record. A work plan total cannot be
decomposed back into them, so the database stays empty until either:

- the section's own inspection database workbook (the province sheets) is
  imported the way the licensing register was, or
- inspections are logged from `/inspectorate` as they are carried out.

Until then output 1.2.4 reports 284 with all 284 as opening balance and none
recorded, which is exactly what the row's expanded split shows.

## Status column

The workbook shows *Pending* against every 1.2.x row. The report derives status
from the figures instead (*Achieved* at or over target, *In Progress* below it),
because an officer can override it per output on `/weekly` — that override is
what the workbook's Status column becomes here, and nobody has set one yet.
