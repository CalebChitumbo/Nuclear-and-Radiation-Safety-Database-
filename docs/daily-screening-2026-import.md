# Daily screening import — 2026 inland offices

Imported 2026-09-06 from `2026_Daily_Summary__All_Inland_Offices.xlsx` (the Nuclear Safety, Security & Safeguards section's daily summary workbook). Regenerate with:

```
python3 scripts/convert-daily-summary-xlsx.py <Daily_Summary.xlsx>
```

Each row becomes one daily `count` entry against **Vehicle Screening (units)** — the metric behind work plan output **1.3.12 Monitoring of illicit trafficking (ZRA Asycuda)** — tagged with the post it came from. The output's opening balance is therefore **zero**: the figures are counted from these entries, not carried in.

## Result

| Metric | Count |
|---|---|
| Border posts | **8** |
| Daily entries | **1,615** |
| Vehicles assessed | **356,372** |

## Reconciled against the workbook's Summary sheet

| Post | Summary total | Imported | Days reported |
|---|---|---|---|
| Chingola | 62,245 | 62,245 | 249 |
| Chirundu | 35,146 | 35,146 | 249 |
| Kapiri Mposhi | 92,517 | 92,517 | 249 |
| Katete | 16,342 | 16,342 | 248 |
| Livingstone | 51,237 | 51,237 | 248 |
| Mongu | 4,602 | 4,602 | 68 |
| Nakonde | 83,612 | 83,612 | 248 |
| Ndola | 10,671 | 10,671 | 56 |
| **All posts** | **356,372** | **356,372** | 1615 |

By month, across all posts:

| Month | Summary total | Imported |
|---|---|---|
| January | 61,548 | 61,548 |
| February | 49,946 | 49,946 |
| March | 41,415 | 41,415 |
| April | 35,284 | 35,284 |
| May | 33,597 | 33,597 |
| June | 37,232 | 37,232 |
| July | 42,171 | 42,171 |
| August | 47,150 | 47,150 |
| September | 8,029 | 8,029 |

## Quarters

The workbook totals by CALENDAR quarter; the report totals by REPORTING WEEK, and a week counts to the quarter it starts in. Week 14 runs 30 Mar – 3 Apr 2026, so the three April days inside it are Q2 in the workbook and Q1 on the report. The year total is the same either way.

Every dated row with a figure was imported; blank days are days the post did not report.
