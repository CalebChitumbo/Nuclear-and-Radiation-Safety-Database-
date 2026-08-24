# Daily screening import — 2026 inland offices

Imported 2026-08-22 from `2026_Daily_Summary__All_Inland_Offices.xlsx` (the Nuclear Safety, Security & Safeguards section's daily summary workbook). Regenerate with:

```
python3 scripts/convert-daily-summary-xlsx.py <Daily_Summary.xlsx>
```

Each row becomes one daily `count` entry against **Vehicle Screening (units)** — the metric behind work plan output **1.3.12 Monitoring of illicit trafficking (ZRA Asycuda)** — tagged with the post it came from. The output's opening balance is therefore **zero**: the figures are counted from these entries, not carried in.

## Result

| Metric | Count |
|---|---|
| Border posts | **8** |
| Daily entries | **1,484** |
| Vehicles assessed | **331,177** |

## Reconciled against the workbook's Summary sheet

| Post | Summary total | Imported | Days reported |
|---|---|---|---|
| Chingola | 58,521 | 58,521 | 233 |
| Chirundu | 32,966 | 32,966 | 233 |
| Kapiri Mposhi | 87,990 | 87,990 | 228 |
| Katete | 15,032 | 15,032 | 232 |
| Livingstone | 48,719 | 48,719 | 233 |
| Mongu | 3,296 | 3,296 | 52 |
| Nakonde | 77,640 | 77,640 | 233 |
| Ndola | 7,013 | 7,013 | 40 |
| **All posts** | **331,177** | **331,177** | 1484 |

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
| August | 29,984 | 29,984 |

## Quarters

The workbook totals by CALENDAR quarter; the report totals by REPORTING WEEK, and a week counts to the quarter it starts in. Week 14 runs 30 Mar – 3 Apr 2026, so the three April days inside it are Q2 in the workbook and Q1 on the report. The year total is the same either way.

Every dated row with a figure was imported; blank days are days the post did not report.
