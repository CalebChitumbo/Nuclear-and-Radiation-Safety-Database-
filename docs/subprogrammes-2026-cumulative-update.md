# Work plan cumulative update — all three subprogrammes

Applied 2026-08-31 from `SUB_PROGRAMS_1.xlsx` — one workbook carrying all three
sheets (*Subprogram 1.1*, *Subprogram 1.2*, *Subprogram 1.3*), the sections'
own cumulative position for the 2026 plan year.

This supersedes the piecemeal figures the report shipped with: 1.1.x from the
Licensing Status workbook, 1.2.x from
[the Inspectorate's sheet](./inspectorate-work-plan-2026-update.md), and 1.3.x
from the section's August figures. From here the three sections are baselined
together and the platform is updated on top of this — every licence,
inspection, enforcement action and typed figure logged from now adds to these.

The figures land in `WORK_PLAN_OPENING_BALANCE` (`lib/rules/workPlan.ts`) — the
opening balance the cumulative report counts up from. **Targets, descriptions
and key indicators were already the approved plan's and are unchanged**; only
the quarterly actuals moved.

## Subprogramme 1.1 — Authorisation and Standards

| Output | Description | Target | Q1 | Q2 | Q3 | Q4 | Total | Was |
|---|---|---|---|---|---|---|---|---|
| 1.1.1 | Development/Revision of Safety Guides | 12 | 3 | 3 | — | — | **6** | 3 |
| 1.1.2 | Develop the Regulations | 4 | 1 | 2 | — | — | **3** | 2 |
| 1.1.3 | Revise the SOP for Licensing | 1 | — | 1 | — | — | 1 | 1 |
| 1.1.4 | Issuance of Ionising Radiation Licences | 500 | 152 | 125 | 80 | — | 357 | 357 |
| 1.1.5 | Maintain and update RAIS and ARIS | 2 | — | 1 | — | — | 1 | 1 |
| 1.1.6 | Virtual awareness meetings (e-licensing) | 4 | 1 | 3 | — | — | **4** | 3 |
| 1.1.7 | Licence renewal sensitisation advert | 1 | — | 1 | — | — | **1** | 0 |
| 1.1.8 | Mobile App for e-licensing | 1 | — | — | — | — | 0 | 0 |
| 1.1.9 | Quarterly Sectional Brochures | 4 | 1 | 1 | — | — | **2** | 1 |
| 1.1.10 | Quarterly Newsletters | 4 | 1 | 1 | — | — | **2** | 1 |

**1.1.4** ends at the same 357 licences as before, but the workbook splits them
152 / 125 / 80 where the Licensing Status import had them 196 / 142 / 19 by
quarter of issue. The workbook's split is what ships, because this is the sheet
the Monday report is read against. The total, the percentage and the status are
unaffected either way.

## Subprogramme 1.2 — Nuclear & Radiation Safety Inspections

Every 1.2.x row already matched the workbook — the August update
([docs](./inspectorate-work-plan-2026-update.md)) had them right. Carried
forward unchanged: 1.2.4 at **284** inspections (40 / 123 / 121) and 1.2.11 at
**193** enforcement actions (45 / 61 / 87).

*4 Sep 2026:* 1.2.4 re-baselined to **295** (40 / 123 / 132) — the section's
routine and follow-up inspections conducted to date. See
[the Inspectorate update](./inspectorate-work-plan-2026-update.md#re-baselines).

## Subprogramme 1.3 — Nuclear Safety, Security and Safeguards

| Output | Description | Target | Q1 | Q2 | Q3 | Q4 | Total | Was |
|---|---|---|---|---|---|---|---|---|
| 1.3.1 | Annual Conference for RPOs (Medical) | 1 | — | 1 | — | — | **1** | 0 |
| 1.3.2 | Annual Conference for RPOs (Non-Medical) | 1 | — | — | — | — | 0 | 0 |
| 1.3.3 | Open two inland offices (Mongu & Ndola) | 2 | — | 2 | — | — | 2 | 2 |
| 1.3.4 | INSSERV Mission Action Plan | 1 | — | — | — | — | 0 | 0 |
| 1.3.5 | Physical protection inspection | 10 | — | 9 | 1 | — | **10** | 0 |
| 1.3.6 | SOP for Nuclear Safety, Security & Safeguard | 8 | — | — | 8 | — | **8** | 0 |
| 1.3.7 | Implement INSSP under Nuclear Security | 100 | — | — | 100 | — | **100** | 0 |
| 1.3.8 | Regional Workshop (IAEA/EU/USNRC/CBRN/RASIM) | 2 | — | — | 2 | — | **2** | 0 |
| 1.3.9 | Stakeholder Engagement and Sensitisation | 40 | — | — | 65 | — | 65 | 65 |
| 1.3.10 | Training for ZRA Inspectors/Responders/FLO | 4 | — | 5 | 2 | — | **7** | 0 |
| 1.3.11 | Monitoring & Evaluation of Inland Offices | — | — | — | — | — | 0 | 0 |
| 1.3.12 | Monitoring of illicit trafficking (ZRA Asycuda) | 350,000 | 152,909 | 106,113 | 81,987 | — | **356,372** | 356,372 |
| 1.3.13 | Quarterly Meetings for Coordinators and TWG | 5 | — | — | 26 | — | **26** | 24 |
| 1.3.14 | Enhance detection capacity system | 1 | — | — | 1 | — | **1** | 0 |

1.3.7 is percentage points of the INSSP programme implemented, not a count —
100 against a target of 100.

## 1.3.12 — the one row carried in nowhere

Screened vehicles is the single output whose history the system actually holds:
the inland offices' daily log is seeded as real dated `dailyEntries`
([docs](./daily-screening-2026-import.md)) and output 1.3.12 counts them
directly. Its opening balance is **zero**, and must stay zero — a figure there
would count vehicles the log already holds a dated post-day for.

| | Vehicles |
|---|---|
| Counted from the daily log (1 Jan – 6 Sep 2026) | 356,372 |
| Carried in as opening balance | **0** |
| **Reported total** | **356,372** |

Against a target of 350,000, the output reads **Achieved**.

### History — why it was 341,009 until 6 September 2026

The first import (June 2026 workbook) ran only to 21 Aug and its dated rows
summed to 331,177 while the workbook's own headline said 341,009. The 9,832
difference was late-August days the sheets did not list, so it was carried in
as an opening balance to make the row read 341,009.

That made the figure fragile in two ways, and both bit:

- The NSSS tab summed the daily entries alone while the sectional update added
  the carry-in, so the same output read 353,624 on one screen and 363,456 on
  the other — 9,832 apart, with nothing saying why. A coordinator reasonably
  read that as 9,000 vehicles appearing from nowhere. Both screens now carry
  the opening balance and show the split.
- Coordinators began logging those same late-August days by hand, which the
  carry-in was already standing in for. The complete 6 Sep workbook settles it:
  every vehicle is now a dated post-day, the Summary sheet and the dated rows
  agree post by post, and there is no gap left to carry.

One consequence to expect: the report buckets by REPORTING WEEK and the
workbook by CALENDAR quarter, so 1.3.12's quarter columns differ from the
workbook's 152,909 / 106,113 / 81,987. The year total — the figure the target
and the percentage are measured on — is the same either way.

## Comments on the workbook the report does not carry

Two rows carry a Comment in the sheet. Comments are an officer's own narrative,
stored per output on `/weekly` rather than in code, so they are not shipped —
type them on the report if they should appear on the Monday brief:

| Output | Comment |
|---|---|
| 1.3.4 | To be done in October |
| 1.3.7 | Opening of the 2 security points and working with NATC |

## If a baseline has already been saved

A saved `workPlanBaseline` document REPLACES the figures in code — it does not
merge. If an admin has ever pressed *Save opening balance* on `/weekly`, the
saved figures are still what the report uses and this update will not show.
Press **Reset to the sections' workbooks**, then **Save opening balance**, to
take these figures on.
