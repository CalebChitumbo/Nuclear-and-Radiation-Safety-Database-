#!/usr/bin/env python3
"""
Importer: the two RAIS "History of a …" exports (.xlsx)
       -> seed/rais-source-holders.seed.json

The register export behind the Source Inventory tab
(`convert-rais-inventory.py`) says WHAT each item is — its type, nuclide,
manufacturer, serial. It does not say WHERE it is. RAIS keeps that on a second
pair of exports, one per register:

  * History of a Sealed Source      — SS/nnnn, its facility, its status
  * History of a Radiation Generator — RG/nnnn, the same

Each row is one item's current standing: the facility it is registered under
(with the facility's own FAC code), the department inside that facility where
RAIS records one, the item's status ("In Use", "In Storage", "Not Imported" …)
and the date that status was set. This joins them onto the register by RAN, so
the tab can answer "who holds this source, and where are they" — the question
an inspector asks first.

Decisions encoded here:
  * VERBATIM, as everywhere else in this repo. The facility name is the export's
    own spelling, the status is the export's own wording, and a blank
    department stays blank. Only the structural reshaping is done here: the RAN
    is split off the "SS/0002 - ( Cs-137)" label, the FAC code is split off the
    facility name, and DD/MM/YYYY becomes ISO.
  * The exports are the authority on the HOLDING, never on the item. Nothing
    here overwrites a type or a nuclide the register export already carries —
    the two files disagree in places, and that disagreement is the register's
    to resolve, not this script's.
  * An item the exports do not name is left without a holder rather than being
    given a placeholder one. 219 of the register's 1,752 items are in that
    position, and "the register does not say who holds it" is a finding the tab
    reports, not a gap to paper over.
  * The facility's DISTRICT and PROVINCE are not in these exports. They belong
    to the facilities register (`seed/facilities.seed.json`), and are carried
    here as a small index of only the facilities the exports actually name —
    ~300 of the register's 538 — so the Source Inventory route can show a
    location without bundling the whole 277 KB register. It is an index of
    another seed, not new data: `tests/sourceHolders.test.ts` checks it still
    agrees with the register, so a facility that moves district is caught.
  * A facility the register does not hold keeps its name from the export and
    is reported below. There are a handful (a test record, a clinic or two RAIS
    knows and the register does not), and they are a worklist.

Usage:
  python3 scripts/convert-source-holders.py \
      <History_of_a_Radiation_Generator.xlsx> <History_of_a_Sealed_Source.xlsx> \
      [--out seed/rais-source-holders.seed.json] \
      [--facilities seed/facilities.seed.json] \
      [--register seed/rais-source-inventory.seed.json] \
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


# The header sits on row 4 under three blank spacer rows, and the columns are
# merged, so the sheet is read by header TEXT rather than by position.
HEADER_MARKER = "Regulatory Authority"
FACILITY_COLUMN = "Facility Name"
DEPARTMENT_COLUMN = "Department Name"
STATUS_COLUMN = "Source Status"
STATUS_DATE_COLUMN = "Status Date"

BLANK_PLACEHOLDERS = {"", "-", "n/a", "na", "none", "null", "[unknown]"}

# The page footer RAIS prints after the last row: "Printed By: …", "Page: 1 of 1".
TRAILER_PREFIXES = ("printed by", "print date", "page:")


def text(value):
    if value is None:
        return ""
    out = str(value).strip()
    return "" if out.lower() in BLANK_PLACEHOLDERS else out


def read_sheet(path):
    """(header list, data rows) for the first worksheet, header found by marker."""
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook.worksheets[0]
    rows = [tuple(r) for r in sheet.iter_rows(values_only=True)]
    workbook.close()
    for index, row in enumerate(rows):
        first = text(row[0]) if row else ""
        if first.startswith(HEADER_MARKER):
            header = [text(c) for c in row]
            return header, rows[index + 1 :]
    sys.exit(f"{path}: no header row starting {HEADER_MARKER!r} — is this the right export?")


def column(row, header, name, path):
    if name not in header:
        sys.exit(f"{path}: the export has no {name!r} column")
    return text(row[header.index(name)])


def iso_date(value, path):
    """RAIS writes DD/MM/YYYY here too. Convert, and refuse to guess."""
    if not value:
        return ""
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", value)
    if not match:
        sys.exit(f"{path}: unrecognised status date {value!r} (expected DD/MM/YYYY)")
    day, month, year = (int(g) for g in match.groups())
    if month > 12:
        sys.exit(f"{path}: status date {value!r} is not day-first — check the export")
    return f"{year:04d}-{month:02d}-{day:02d}"


def split_facility(cell):
    """'NFC Africa Mining Plc (FAC/0173)' -> ('NFC Africa Mining Plc', 'FAC/0173')."""
    match = re.search(r"\(\s*(FAC/\d+)\s*\)\s*$", cell)
    if not match:
        return cell.strip(), ""
    return cell[: match.start()].strip(), match.group(1)


def ran_of(cell):
    """'SS/0002 - ( Cs-137)' -> 'SS/0002'. The descriptor after the dash is the
    item's own text, which the register export already carries properly."""
    return cell.split(" - ")[0].strip()


def read_holders(path):
    header, rows = read_sheet(path)
    holders = []
    for row in rows:
        first = text(row[0]) if row else ""
        # The trailer lines carry no accession number; so does a stray blank.
        if not first or first.lower().startswith(TRAILER_PREFIXES):
            continue
        facility, code = split_facility(column(row, header, FACILITY_COLUMN, path))
        holder = {
            "ran": ran_of(first),
            "facility": facility,
            "facCode": code,
            "department": column(row, header, DEPARTMENT_COLUMN, path),
            "status": column(row, header, STATUS_COLUMN, path),
            "statusDate": iso_date(
                column(row, header, STATUS_DATE_COLUMN, path), path
            ),
        }
        if not holder["ran"]:
            continue
        holders.append(holder)
    return holders


def ran_sort_key(ran):
    """Generators before sources, each in accession order."""
    prefix = ran.split("/")[0]
    digits = re.sub(r"[^0-9]", "", ran)
    return (0 if prefix == "RG" else 1, int(digits) if digits else 0)


def facility_index(holders, facilities_path):
    """District and province for the facilities the exports name — see the note."""
    with open(facilities_path, encoding="utf-8") as handle:
        register = json.load(handle)
    by_code = {}
    for facility in register:
        code = text(facility.get("fac"))
        if code and code not in by_code:
            by_code[code] = facility

    wanted = sorted({h["facCode"] for h in holders if h["facCode"]})
    index, unmatched = [], []
    for code in wanted:
        facility = by_code.get(code)
        if not facility:
            unmatched.append(code)
            continue
        index.append(
            {
                "facCode": code,
                "name": text(facility.get("name")),
                "district": text(facility.get("dist")),
                "province": text(facility.get("prov")),
            }
        )
    index.sort(key=lambda f: f["facCode"])
    return index, unmatched


def report(holders, index, unmatched, register_path):
    generators = [h for h in holders if h["ran"].startswith("RG")]
    sources = [h for h in holders if h["ran"].startswith("SS")]
    print(f"  {len(holders)} holdings — {len(generators)} generators, {len(sources)} sealed sources")
    print(f"  facilities named: {len({h['facCode'] or h['facility'] for h in holders})}"
          f" ({len(index)} matched in the facilities register)")
    print("  statuses: " + ", ".join(
        f"{s} {n}" for s, n in Counter(h["status"] for h in holders).most_common()
    ))
    print(f"  provinces: " + ", ".join(
        f"{p} {n}" for p, n in Counter(f["province"] for f in index).most_common()
    ))
    if unmatched:
        print(f"  NOT in the facilities register ({len(unmatched)}) — a worklist, not an error:")
        for code in unmatched:
            name = next(h["facility"] for h in holders if h["facCode"] == code)
            print(f"    {code}  {name}")

    duplicates = [r for r, n in Counter(h["ran"] for h in holders).items() if n > 1]
    if duplicates:
        sys.exit(f"the exports name the same item twice: {duplicates[:10]}")

    # The holdings only mean anything against the register they join onto.
    try:
        with open(register_path, encoding="utf-8") as handle:
            items = json.load(handle)["items"]
    except OSError:
        print(f"  (skipped the register check — {register_path} not readable)")
        return
    known = {i["ran"] for i in items}
    held = {h["ran"] for h in holders}
    strays = sorted(held - known)
    if strays:
        sys.exit(
            f"{len(strays)} holdings name an item the register does not hold "
            f"(e.g. {strays[:5]}) — re-run convert-rais-inventory.py first"
        )
    print(f"  register coverage: {len(held)} of {len(known)} items have a holder"
          f" ({len(known - held)} do not)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("generators", help="History_of_a_Radiation_Generator.xlsx")
    parser.add_argument("sources", help="History_of_a_Sealed_Source.xlsx")
    parser.add_argument("--out", default="seed/rais-source-holders.seed.json")
    parser.add_argument("--facilities", default="seed/facilities.seed.json")
    parser.add_argument("--register", default="seed/rais-source-inventory.seed.json")
    parser.add_argument(
        "--exported-on", default="", help="date the exports were taken (YYYY-MM-DD)"
    )
    args = parser.parse_args()

    holders = read_holders(args.generators) + read_holders(args.sources)
    holders.sort(key=lambda h: ran_sort_key(h["ran"]))
    index, unmatched = facility_index(holders, args.facilities)
    report(holders, index, unmatched, args.register)

    payload = {
        "meta": {
            "title": "National Source Inventory — where each item is registered",
            "sourceDocument": (
                "RAIS exports — History of a Radiation Generator, "
                "History of a Sealed Source"
            ),
            "exportedOn": args.exported_on,
            "system": "Regulatory Authority Information System (RAIS)",
            "department": "Nuclear and Radiation Safety Department",
            "coverage": (
                "The facility each registered item is held by, with the item's "
                "status as at the export"
            ),
            "totalHoldings": len(holders),
            "generators": sum(1 for h in holders if h["ran"].startswith("RG")),
            "sealedSources": sum(1 for h in holders if h["ran"].startswith("SS")),
            "facilities": len({h["facCode"] or h["facility"] for h in holders}),
        },
        "holders": holders,
        # District and province from seed/facilities.seed.json, for the
        # facilities above only — an index of the register, not new data.
        "facilities": index,
    }

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(f"  wrote {args.out}")


if __name__ == "__main__":
    main()
