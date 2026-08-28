#!/usr/bin/env python3
"""
Importer: the two RAIS register exports (.xlsx)
       -> seed/rais-source-inventory.seed.json

RAIS (the IAEA Regulatory Authority Information System) holds the Authority's
register of every radiation generator and sealed source it has ever authorised.
Two of its exports cover the inventory:

  * Radiation Generators — one row per machine, keyed RG/nnnn
  * Sealed Sources       — one row per source,  keyed SS/nnnn

They are exported as separate sheets with different columns, but for the
Source Inventory tab they are one register: 1,752 items, each identified by its
RAN (Radiation Accession Number). This flattens both into a single record shape
so the tab can count, filter and search across the whole national inventory.

Decisions encoded here:
  * The export is copied VERBATIM — no value is corrected, only trimmed. RAIS
    is the register of record, so a missing serial or a mistyped nuclide must
    show up on the tab as the gap it is; that is half the point of putting the
    RAIS figures beside the field-verified ones. The only reshaping is
    structural (whitespace, ISO dates, empty-vs-placeholder).
  * `SealedCategoryManual` beats `SealedCategory`. The plain column is what
    RAIS computes from the A/D ratio; the "Manual" one is the determination an
    officer entered by hand, which by definition overrides it. Where the two
    disagree the record keeps both and marks the conflict, so the tab can
    report it rather than hide it.
  * The same override rule applies to `SecurityLevelManual` over
    `SecurityGroup`.
  * Records are numbered by RAN — generators first, then sealed sources, each
    in accession order — so the running number is stable across re-imports.
    The gaps in the RAN sequence (RG runs 1…1023 for 963 rows) are real:
    they are items disposed of or de-registered, and they are not filled in.
  * RAIS' internal `Id` (a GUID) is dropped. The RAN is unique and is the key
    officers actually quote, and it is what a re-import joins on; the GUIDs are
    random, so they alone cost more over the wire than the rest of the seed
    combined (74 KB gzipped with them, 31 KB without) for a tab that never
    reads them.

Usage:
  python3 scripts/convert-rais-inventory.py \
      <Radiation_Generators.xlsx> <Sealed_Sources.xlsx> \
      [--out seed/rais-source-inventory.seed.json] \
      [--exported-on YYYY-MM-DD]
"""

import argparse
import json
import re
import sys
from collections import Counter

try:
    import openpyxl
except ImportError:  # pragma: no cover - operator-facing message
    sys.exit("openpyxl is required:  pip install openpyxl")


# Cells RAIS exports as a single space, or as an explicit "not recorded"
# placeholder, all mean the same thing: the field was never filled in.
BLANK_PLACEHOLDERS = {"", "-", "n/a", "na", "none", "null", "[unknown]", "unknown"}


def cell(row, header, name):
    """Trimmed text for one named column, with RAIS' blanks folded to ''."""
    if name not in header:
        return ""
    value = row[header.index(name)]
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() in BLANK_PLACEHOLDERS else text


def read_sheet(path):
    """First worksheet as (header list, list of value tuples)."""
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook.worksheets[0]
    rows = list(sheet.iter_rows(values_only=True))
    workbook.close()
    if not rows:
        sys.exit(f"{path}: no rows")
    header = [str(h).strip() if h is not None else "" for h in rows[0]]
    return header, rows[1:]


def ran_sort_key(ran):
    """RG/0007 sorts before RG/0012 — numerically, not as text."""
    digits = re.sub(r"[^0-9]", "", ran)
    return int(digits) if digits else 0


def iso_date(text, path):
    """RAIS writes DD/MM/YYYY. Convert, and refuse to guess if it is not."""
    if not text:
        return ""
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if not match:
        sys.exit(f"{path}: unrecognised date {text!r} (expected DD/MM/YYYY)")
    day, month, year = (int(g) for g in match.groups())
    if month > 12:
        sys.exit(f"{path}: date {text!r} is not day-first — check the export")
    return f"{year:04d}-{month:02d}-{day:02d}"


def convert_generators(path):
    header, rows = read_sheet(path)
    items = []
    for row in rows:
        ran = cell(row, header, "RAN")
        if not ran:
            continue
        items.append(
            {
                "ran": ran,
                "kind": "Radiation Generator",
                "type": cell(row, header, "Type"),
                "manufacturer": cell(row, header, "Manufacturer"),
                "model": cell(row, header, "Model"),
                "serialNumber": cell(row, header, "SerialNumber"),
            }
        )
    items.sort(key=lambda r: ran_sort_key(r["ran"]))
    return items


def convert_sealed_sources(path):
    header, rows = read_sheet(path)
    items = []
    for row in rows:
        ran = cell(row, header, "RAN")
        if not ran:
            continue

        # The officer's entry overrides what RAIS calculated; keep both when
        # they disagree so the tab can report the discrepancy.
        calculated = cell(row, header, "SealedCategory")
        manual = cell(row, header, "SealedCategoryManual")
        category = manual or calculated
        category_source = "manual" if manual else ("calculated" if calculated else "")

        security = cell(row, header, "SecurityLevelManual") or cell(
            row, header, "SecurityGroup"
        )

        item = {
            "ran": ran,
            "kind": "Sealed Source",
            "type": "",  # RAIS has no type for sources — the nuclide plays that role
            "manufacturer": cell(row, header, "Manufacturer"),
            "model": cell(row, header, "SealedModel"),
            "serialNumber": cell(row, header, "SerialNumber"),
            "nuclide": cell(row, header, "Nuclide"),
            "activity": cell(row, header, "Activity"),
            "activityDate": iso_date(cell(row, header, "ActivityDate"), path),
            "sealedCategory": category,
            "securityLevel": security,
            "isoCompliance": cell(row, header, "ISOCompliance"),
            "workingLife": cell(row, header, "RecommendedWorkingLife"),
        }
        if category_source:
            item["categorySource"] = category_source
        if calculated and manual and calculated != manual:
            item["categoryCalculated"] = calculated
        items.append(item)
    items.sort(key=lambda r: ran_sort_key(r["ran"]))
    return items


def report(items):
    """Operator-facing summary, so a re-import is checked, not assumed."""
    generators = [r for r in items if r["kind"] == "Radiation Generator"]
    sources = [r for r in items if r["kind"] == "Sealed Source"]
    print(f"  {len(items)} items — {len(generators)} generators, {len(sources)} sealed sources")
    print(f"  generator types: {len(Counter(r['type'] for r in generators if r['type']))} distinct, "
          f"{sum(1 for r in generators if not r['type'])} not recorded")
    print(f"  nuclides: {len(Counter(r['nuclide'] for r in sources if r['nuclide']))} distinct, "
          f"{sum(1 for r in sources if not r['nuclide'])} not recorded")
    print(f"  serial numbers missing: {sum(1 for r in items if not r['serialNumber'])}")
    print(f"  IAEA category recorded: {sum(1 for r in sources if r.get('sealedCategory'))}"
          f" ({sum(1 for r in sources if 'categoryCalculated' in r)} conflicting)")

    duplicates = [ran for ran, n in Counter(r["ran"] for r in items).items() if n > 1]
    if duplicates:
        sys.exit(f"duplicate RANs in the export: {duplicates[:10]}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("generators", help="Radiation_Generators.xlsx")
    parser.add_argument("sources", help="Sealed_Sources.xlsx")
    parser.add_argument("--out", default="seed/rais-source-inventory.seed.json")
    parser.add_argument(
        "--exported-on",
        default="",
        help="date the RAIS export was taken (YYYY-MM-DD)",
    )
    args = parser.parse_args()

    items = convert_generators(args.generators) + convert_sealed_sources(args.sources)
    for index, item in enumerate(items, start=1):
        item["no"] = index

    report(items)

    payload = {
        "meta": {
            "title": "National Source Inventory — RAIS Register",
            "sourceDocument": "RAIS register export — Radiation Generators & Sealed Sources",
            "exportedOn": args.exported_on,
            "system": "Regulatory Authority Information System (RAIS)",
            "department": "Nuclear and Radiation Safety Department",
            "coverage": "All radiation generators and sealed sources registered with the Authority",
            "totalItems": len(items),
            "generators": sum(1 for r in items if r["kind"] == "Radiation Generator"),
            "sealedSources": sum(1 for r in items if r["kind"] == "Sealed Source"),
        },
        # `no` first so the file reads in register order.
        "items": [
            {"no": r.pop("no"), **r} for r in items
        ],
    }

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(f"  wrote {args.out}")


if __name__ == "__main__":
    main()
