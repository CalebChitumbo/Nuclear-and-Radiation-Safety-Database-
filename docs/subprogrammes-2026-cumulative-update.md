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
| 1.3.12 | Monitoring of illicit trafficking (ZRA Asycuda) | 350,000 | 152,909 | 106,113 | 81,987 | — | **341,009** | 331,177 |
| 1.3.13 | Quarterly Meetings for Coordinators and TWG | 5 | — | — | 26 | — | **26** | 24 |
| 1.3.14 | Enhance detection capacity system | 1 | — | — | 1 | — | **1** | 0 |

1.3.7 is percentage points of the INSSP programme implemented, not a count —
100 against a target of 100.

## 1.3.12 — the one row that is only part carried in

Screened vehicles is the single output whose history the system actually holds:
the inland offices' daily log is seeded as real dated `dailyEntries`
([docs](./daily-screening-2026-import.md)) and output 1.3.12 counts them
directly. Carrying the workbook's whole 341,009 in as an opening balance would
count 331,177 of them a second time.

So only the gap is carried in:

| | Vehicles |
|---|---|
| Counted from the daily log (1 Jan – 21 Aug 2026) | 331,177 |
| Carried in as opening balance (Q3) | **9,832** |
| **Reported total** | **341,009** |

The 9,832 is the late-August days the workbook has and the log has yet to
reach. **If those days are ever logged on Daily Updates or re-imported, zero
1.3.12's opening balance first** — on `/weekly` → *Opening balance* → *Clear to
zero* for that row — or they will be counted twice.

One consequence to expect: the report buckets by REPORTING WEEK and the
workbook by CALENDAR quarter, so the quarter columns for 1.3.12 read
158,640 / 105,975 / 76,394 rather than the workbook's
152,909 / 106,113 / 81,987. The year total — the figure the target and the
percentage are measured on — is 341,009 either way.

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
