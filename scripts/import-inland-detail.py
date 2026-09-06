#!/usr/bin/env python3
"""
Read the inland offices' DETAIL workbooks into one line-per-truck file.

The monthly books hold what the daily summary flattens away: which truck, what
it carried, who moved it, what it read. That is the Border Scan Log's own
record — `lib/rules/borderScans.ts` was written from this exact layout — so
these rows belong in `truckScans`, where an officer can search a plate, pull a
post's day back up, or see what the doses looked like.

This half only reads. It emits raw rows as JSONL and stops there, because
everything derived from a row — the reporting week, whether an identifier is a
plate or a chassis number, the canonical spelling of a commodity or a
transporter, the dose triage — is decided by the app's own rules, and a second
implementation here would drift from them. `scripts/upload-truck-scans.ts`
takes this file and builds the records through those rules.

Only the shared template is read (REG. NUMBER / GOODS OF INTEREST / FOOD /
OTHER / TRANSPORTER / DOSE, one sheet per day). Other layouts are reported and
skipped — see scripts/reconcile-inland-detail.py for what that leaves out.

The output is NOT committed: it is tens of megabytes derived from workbooks
that are themselves not in git. Regenerate it when you need it.

Usage:
  python3 scripts/import-inland-detail.py "INLAND DAILY ASSESSMENTS" \\
      --out .import/inland-truck-scans-2026.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter

import importlib.util

try:
    import openpyxl
except ImportError:  # pragma: no cover - operator-facing message
    sys.exit("openpyxl is required:  pip install openpyxl")

# The reconciler already knows how to find a post, a month and a day sheet, and
# how to tell the shared template from anything else. Load it rather than
# keeping a second copy that could disagree about which sheets are readable —
# by path, because the file name has hyphens in it.
_spec = importlib.util.spec_from_file_location(
    "reconcile_inland_detail",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "reconcile-inland-detail.py"),
)
_recon = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_recon)

CARGO_COLUMNS = ("Goods of Interest", "Food", "Other")


def rows_from_sheet(ws, date: str, border: str):
    """
    One record per truck row.

    Column A carries the registration or chassis number and is what makes a row
    a truck; B, C and D are the three cargo columns, and whichever one holds
    text gives both the class and the commodity. The tally block the officers
    typed to the right is derived data — `summariseScans` computes it — so it
    is not read.
    """
    seq = 0
    for row in ws.iter_rows(min_row=2, max_col=6, values_only=True):
        reg = _recon.norm(row[0])
        if not reg or reg in {"0", "TOTAL", "Total", "total"}:
            continue
        seq += 1
        cargo_class = ""
        commodity = ""
        for i, name in enumerate(CARGO_COLUMNS, start=1):
            value = _recon.norm(row[i])
            if value:
                cargo_class = name
                commodity = value
                break
        yield {
            "date": date,
            "border": border,
            "row": seq,
            "vehicleId": reg,
            "cargoClass": cargo_class or "Other",
            "commodity": commodity,
            "transporter": _recon.norm(row[4]),
            "dose": _recon.norm(row[5]),
        }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("root", help="the INLAND DAILY ASSESSMENTS folder")
    ap.add_argument("--out", default=".import/inland-truck-scans-2026.jsonl")
    args = ap.parse_args()

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)

    written = 0
    books = 0
    skipped: list[str] = []
    per_post: Counter = Counter()
    missing_dose = 0
    missing_cargo = 0
    missing_transporter = 0

    with open(args.out, "w", encoding="utf-8") as fh:
        for dirpath, _dirs, files in os.walk(args.root):
            for name in sorted(files):
                if not name.endswith(".xlsx") or name.startswith("~$"):
                    continue
                path = os.path.join(dirpath, name)
                if "Daily Summary" in path:
                    continue
                books += 1
                post = _recon.post_for(path, args.root)
                month = _recon.month_for(path)
                rel = os.path.relpath(path, args.root)
                if month is None:
                    skipped.append(f"{rel}: no month in the name")
                    continue
                try:
                    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
                except Exception as exc:
                    skipped.append(f"{rel}: could not open ({type(exc).__name__})")
                    continue
                try:
                    read_any = False
                    for sheet in wb.sheetnames:
                        m = _recon.DAY_SHEET.match(sheet)
                        if not m:
                            continue
                        ws = wb[sheet]
                        if not _recon.is_template(ws):
                            continue
                        read_any = True
                        date = f"2026-{month:02d}-{int(m.group(1)):02d}"
                        for rec in rows_from_sheet(ws, date, post):
                            if not rec["dose"]:
                                missing_dose += 1
                            if not rec["commodity"]:
                                missing_cargo += 1
                            if not rec["transporter"]:
                                missing_transporter += 1
                            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                            written += 1
                            per_post[post] += 1
                    if not read_any:
                        skipped.append(f"{rel}: no day sheets in the shared template")
                finally:
                    wb.close()

    print(f"Wrote {args.out}: {written:,} truck rows from {books} workbooks\n")
    for post, count in sorted(per_post.items()):
        print(f"  {post:<16}{count:>9,}")
    print(
        f"\nRows missing a dose: {missing_dose:,} · a cargo: {missing_cargo:,} · "
        f"a transporter: {missing_transporter:,}"
    )
    print("(They are kept — a row with gaps is still a truck that was scanned.)")
    if skipped:
        print(f"\n{len(skipped)} workbook(s) not read:")
        for line in sorted(skipped):
            print(f"  {line}")


if __name__ == "__main__":
    main()
