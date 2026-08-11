#!/usr/bin/env python3
"""Measure the border scan log's controlled vocabulary against a real workbook.

The Border Scan Log replaces the monthly border workbook (one sheet per day,
one row per scanned truck, cargo typed free-hand into one of three columns).
Its commodity list and alias table live in `lib/rules/borderCargo.ts`. This
script reads those straight out of the TypeScript — one source of truth, no
second copy to drift — and replays a month of real scans through them.

What it reports:

  * how many rows resolve to a canonical commodity, and how many are new;
  * which spellings the alias table folded together (the win over free text);
  * how the recorded doses would triage under the review thresholds;
  * the rows the workbook could not validate — unparseable doses, cargo
    columns left blank, transporter names that look like duplicates.

Run it on next month's book before extending the vocabulary, so the list grows
from what actually crosses rather than from guesswork:

    python3 scripts/check-border-vocabulary.py JUNE_NKD_2026.xlsx

Requires openpyxl (pip install openpyxl). Read-only — it changes nothing.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
from collections import Counter

REPO = pathlib.Path(__file__).resolve().parent.parent
CARGO_TS = REPO / "lib" / "rules" / "borderCargo.ts"

# Column layout of every daily sheet in the border workbooks.
COL_VEHICLE, COL_GOODS, COL_FOOD, COL_OTHER, COL_TRANSPORTER, COL_DOSE = 1, 2, 3, 4, 5, 6

# Kept in step with borderScans.ts.
DOSE_ELEVATED_NSV = 300
DOSE_ALARM_NSV = 1000


def normalise_term(raw: str) -> str:
    """The match key — mirrors normaliseTerm() in borderCargo.ts."""
    out = re.sub(r"[^A-Z0-9&]+", " ", str(raw).upper())
    out = re.sub(r"\s*&\s*", " ", out).strip()
    return re.sub(r"\s+", " ", out)


def load_vocabulary() -> tuple[dict[str, str], dict[str, str]]:
    """Canonical names and aliases, parsed out of borderCargo.ts.

    Returns (canonical-by-key, class-by-canonical-name).
    """
    source = CARGO_TS.read_text(encoding="utf-8")

    commodities: dict[str, str] = {}
    block = re.search(r"export const COMMODITIES[^=]*=\s*\[(.*?)\n\];", source, re.S)
    if not block:
        sys.exit(f"Could not find COMMODITIES in {CARGO_TS}")
    for entry in re.finditer(
        r'\{\s*\n?\s*name:\s*"([^"]+)",\s*\n?\s*class:\s*"([^"]+)"', block.group(1)
    ):
        commodities[entry.group(1)] = entry.group(2)

    aliases: dict[str, str] = {}
    alias_block = re.search(
        r"export const COMMODITY_ALIASES[^=]*=\s*\{(.*?)\n\};", source, re.S
    )
    if alias_block:
        for entry in re.finditer(
            r'(?:"([^"]+)"|([A-Z0-9_]+)):\s*"([^"]+)"', alias_block.group(1)
        ):
            aliases[entry.group(1) or entry.group(2)] = entry.group(3)

    if not commodities:
        sys.exit("Parsed no commodities — has borderCargo.ts changed shape?")
    return commodities, aliases


NON_CARGO = re.compile(r"^(?:\d+(?:[.,]\d+)?|[A-Z0-9]{2,}-\d{4,}|IR)$")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", help="A monthly border workbook (.xlsx)")
    parser.add_argument(
        "--json", help="Write the full report to this path as JSON", default=None
    )
    args = parser.parse_args()

    try:
        import openpyxl
    except ImportError:
        sys.exit("openpyxl is required: pip install openpyxl")

    commodities, aliases = load_vocabulary()
    by_key = {normalise_term(name): name for name in commodities}
    alias_by_key = {normalise_term(k): v for k, v in aliases.items()}

    wb = openpyxl.load_workbook(args.workbook, data_only=True)

    rows = 0
    canonical = Counter()          # canonical name -> rows
    folded = {}                    # canonical name -> {spelling seen: count}
    unknown = Counter()            # typed cargo the vocabulary does not hold
    not_cargo = Counter()          # values that are not cargo at all
    no_cargo = 0                   # rows with every cargo column blank
    two_classes = 0                # rows with more than one cargo column filled
    bad_dose = Counter()
    no_dose = 0
    triage = Counter()
    transporters = Counter()
    vehicles = Counter()

    for sheet in wb.worksheets:
        if sheet.title.strip().lower() == "cover":
            continue
        for row in range(2, sheet.max_row + 1):
            vehicle = sheet.cell(row, COL_VEHICLE).value
            if vehicle in (None, ""):
                continue
            rows += 1
            vehicles[re.sub(r"[^A-Z0-9-]", "", str(vehicle).upper())] += 1

            cells = [
                sheet.cell(row, COL_GOODS).value,
                sheet.cell(row, COL_FOOD).value,
                sheet.cell(row, COL_OTHER).value,
            ]
            filled = [c for c in cells if c not in (None, "")]
            if not filled:
                no_cargo += 1
            if len(filled) > 1:
                two_classes += 1

            for value in filled:
                tidied = re.sub(r"\s+", " ", str(value).upper()).strip()
                key = normalise_term(tidied)
                if not key or NON_CARGO.match(tidied):
                    not_cargo[tidied] += 1
                    continue
                name = by_key.get(key) or alias_by_key.get(key)
                if name:
                    canonical[name] += 1
                    folded.setdefault(name, Counter())[tidied] += 1
                else:
                    unknown[tidied] += 1

            transporter = sheet.cell(row, COL_TRANSPORTER).value
            if transporter not in (None, ""):
                transporters[re.sub(r"\s+", " ", str(transporter).upper()).strip()] += 1

            dose = sheet.cell(row, COL_DOSE).value
            if dose in (None, ""):
                no_dose += 1
            elif isinstance(dose, (int, float)):
                value = float(dose)
                triage[
                    "Alarm"
                    if value >= DOSE_ALARM_NSV
                    else "Elevated"
                    if value >= DOSE_ELEVATED_NSV
                    else "Normal"
                ] += 1
            else:
                bad_dose[str(dose)] += 1

    resolved = sum(canonical.values())
    typed = resolved + sum(unknown.values())
    multi_spelled = {
        name: dict(spellings)
        for name, spellings in folded.items()
        if len(spellings) > 1
    }

    print(f"Workbook            {pathlib.Path(args.workbook).name}")
    print(f"Sheets read         {len(wb.worksheets) - 1} day sheets")
    print(f"Scan rows           {rows:,}")
    print()
    print("CARGO")
    print(f"  Resolved to the standard list   {resolved:,} of {typed:,} "
          f"({resolved / typed:.1%})" if typed else "  no cargo values")
    print(f"  Distinct canonical commodities  {len(canonical)}")
    print(f"  Spellings folded together       {len(multi_spelled)} commodities")
    print(f"  New — not yet in the list       {len(unknown)} distinct, "
          f"{sum(unknown.values()):,} rows")
    print(f"  Not cargo at all (typed astray) {sum(not_cargo.values())} rows")
    print(f"  Rows with no cargo recorded     {no_cargo}")
    print(f"  Rows with two classes at once   {two_classes}")
    print()
    print("DOSE")
    total_triaged = sum(triage.values())
    for band in ("Normal", "Elevated", "Alarm"):
        print(f"  {band:<8} {triage[band]:>6,}"
              + (f"  ({triage[band] / total_triaged:.1%})" if total_triaged else ""))
    print(f"  Unparseable readings            {sum(bad_dose.values())} "
          f"{sorted(bad_dose)[:8]}")
    print(f"  Rows with no reading            {no_dose}")
    print()
    print("OTHER")
    print(f"  Distinct transporter spellings  {len(transporters)}")
    repeats = {v: c for v, c in vehicles.items() if c > 1}
    print(f"  Units appearing more than once  {len(repeats)}")
    print()

    if multi_spelled:
        print("SPELLINGS FOLDED (top 15)")
        for name, spellings in sorted(
            multi_spelled.items(), key=lambda kv: -sum(kv[1].values())
        )[:15]:
            variants = ", ".join(f"{s} ×{c}" for s, c in sorted(
                spellings.items(), key=lambda kv: -kv[1]
            ))
            print(f"  {name:<26} {variants}")
        print()

    if unknown:
        print("NEW COMMODITIES (top 25 — candidates for the standard list)")
        for name, count in unknown.most_common(25):
            print(f"  {count:>4}  {name}")

    if args.json:
        pathlib.Path(args.json).write_text(
            json.dumps(
                {
                    "rows": rows,
                    "resolved": resolved,
                    "canonical": canonical.most_common(),
                    "folded": multi_spelled,
                    "unknown": unknown.most_common(),
                    "notCargo": not_cargo.most_common(),
                    "badDose": bad_dose.most_common(),
                    "triage": dict(triage),
                    "noCargo": no_cargo,
                    "noDose": no_dose,
                },
                indent=1,
            ),
            encoding="utf-8",
        )
        print(f"\nFull report written to {args.json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
