#!/usr/bin/env python3
"""
One-off importer: RPA Facility 2026 Status List (.docx) -> seed/facilities.seed.json

Rebuilds the facility register from the "Facility Licensing Status — Actual
Current 2026 Position" Word document (23 July 2026), enriching each matched
facility with sector / province / FAC code / licence numbers from the previous
register (the old seed JSON), which the status list does not carry.

Decisions encoded here (agreed with the register owner):
  * Rows in the NON-FUNCTIONAL section whose detail column reads
    "NOW FUNCTIONAL" import as functional.
  * All "Licensed" flavours (2026 licence / 2025 renewal / per register /
    "Licenced") collapse to licensed=Yes, stage=Licensed. The doc's detail
    line is kept on the facility as an informational note.
  * Duplicate rows under variant spellings are merged (logged below).
  * "(no activity in 2026)" rows and the non-functional stalled band carry
    stalled=Yes on top of their pipeline stage.
  * The "needs manual check" bands and other uncertain rows carry a review
    note so they can be filtered and confirmed in the app.
  * Veterinary practices count as Medical.

Usage:
  python3 scripts/convert-2026-status-list.py <status-list.docx> \
      [--old-seed seed/facilities.seed.json] \
      [--out seed/facilities.seed.json] \
      [--report docs/register-2026-import.md]
"""

import argparse
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from datetime import date

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


# ---------------------------------------------------------------- text utils

def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return " ".join(s.split())


def collapsed(s: str) -> str:
    """norm() with spaces removed — collapses 'K.G' vs 'KG' style variants."""
    return norm(s).replace(" ", "")


# ---------------------------------------------------------------- docx parse

def parse_docx(path: str):
    """Return (functional_rows, non_functional_rows) as lists of cell lists."""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    body = root.find(f"{W}body")

    def cell_text(tc):
        parts = []
        for p in tc.findall(f".//{W}p"):
            t = "".join(x.text or "" for x in p.findall(f".//{W}t")).strip()
            if t:
                parts.append(t)
        return " ".join(parts)

    section = None
    func, nonf = [], []
    for child in body:
        tag = child.tag.split("}")[1]
        if tag == "p":
            text = "".join(x.text or "" for x in child.findall(f".//{W}t"))
            if re.match(r"\s*1\.\s*FUNCTIONAL", text):
                section = "F"
            elif re.match(r"\s*2\.\s*NON-FUNCTIONAL", text):
                section = "NF"
        elif tag == "tbl" and section:
            for tr in child.findall(f"{W}tr"):
                cells = [cell_text(tc) for tc in tr.findall(f"{W}tc")]
                if not cells or cells[0].strip() in ("#", ""):
                    continue
                if not re.match(r"^\d+$", cells[0].strip()):
                    continue
                # pad to 6 columns: # / name / district / practice / status / detail
                cells = (cells + [""] * 6)[:6]
                (func if section == "F" else nonf).append(cells)
    return func, nonf


# ------------------------------------------------------------ status mapping

LICENSED_STATUSES = {
    "licensed 2026 licence",
    "licensed 2025 renewal",
    "licensed per register",
    "licenced",
    "licensed",
}

STATUS_TO_STAGE = {
    "waiting for payment": "Waiting for Payment",
    "renewal application submitted": "Application Submitted",
    "requested terms requirements": "Authorization Terms Issued",
    "regulatory requirements": "Authorization Terms Issued",
    "in final processing": "In Final Processing",
    "accounts verification": "Accounts Clearance Pending",
    "no application submitted": "No Application Submitted",
    "draft": "Draft Application",
    "just import licence use no application submitted":
        "Import Licence Only (Not yet Use/Possession)",
}

REVIEW_UNCERTAIN = "Uncertain name match in the 2026 status list — verify RAIS record"
REVIEW_IMPORT_ONLY = "Import licence only — follow up on the use/possession application"


def map_status(status: str, detail: str):
    """-> (licensed: bool, stage: str, review_note: str)"""
    s = norm(status)
    d = norm(detail)
    review = ""

    if s in LICENSED_STATUSES:
        return True, "Licensed", ""

    if "import only" in s:
        return False, "Import Licence Only (Not yet Use/Possession)", REVIEW_IMPORT_ONLY

    if s == "needs manual check":
        stage = ("Authorization Terms Issued"
                 if "regulatory requirement" in d
                 else "No Application Submitted")
        return False, stage, REVIEW_UNCERTAIN

    if s == "rpa official use":
        # Internal Review Remarks / (Recommendation) rows — the status cell
        # holds the RAIS-lookup source, the detail the real stage.
        return False, "Under Review and Assessment", REVIEW_UNCERTAIN

    if s == "chifubu district":
        # Known glitch: the status cell spilled from the facility name; the
        # detail column shows "Internal Review Remarks".
        return False, "Under Review and Assessment", (
            "Status cell shifted in the source doc — detail shows Internal Review Remarks")

    if s in STATUS_TO_STAGE:
        stage = STATUS_TO_STAGE[s]
        # Detail refinements on top of a generic "No Application Submitted".
        if stage == "No Application Submitted":
            if "import approved" in d or "import only" in d:
                stage = "Import Licence Only (Not yet Use/Possession)"
                if "import only" in d or "follow up" in d:
                    review = REVIEW_IMPORT_ONLY
            elif d == "draft":
                stage = "Draft Application"
            elif "needs follow up" in d:
                review = "Needs follow up"
        return False, stage, review

    # Unrecognised status — keep the facility visible, flag it.
    return False, "No Application Submitted", f"Unrecognised status in import: {status!r}"


# ------------------------------------------------------------ categorisation

MEDICAL_RX = re.compile(
    r"x[- ]?ray|imaging|dental|nuclear medicine|radiotherapy|computed tomography"
    r"|\bct\b|mammo|fluoro|veterinar|animal health", re.I)
MEDICAL_NAME_RX = re.compile(
    r"hospital|clinic|medical|dental|diagnos|health|hospice|veterinary|medicare"
    r"|surgery|imaging", re.I)


def categorise(practice: str, name: str):
    """-> (category, review_note). Veterinary counts as Medical."""
    if practice:
        return ("Medical" if MEDICAL_RX.search(practice) else "Non-Medical"), ""
    if MEDICAL_NAME_RX.search(name):
        return "Medical", ""
    return "Non-Medical", "No practice recorded — category assumed Non-Medical, confirm"


# ------------------------------------------------------------------- merges

# (survivor name, duplicate name) — both as they appear in the doc. The
# survivor keeps the more advanced status of the pair; district/practice fall
# back across both rows; functional is OR-ed.
MERGES = [
    ("Mahatma Gandhi Clinic", "Mahatima Gandhi Clinic"),
    ("Mwami Adventist Hospital, Chipata", "Mwami Adventist Hospital"),
    ("St. Joseph Chamilalamini Mission Hospital",
     "St. Josph Chamilalamini Mission Hospital"),
    ("Progress Medical Centre Solwezi", "Progress Medical Centre@Solwezi"),
    ("Ng'anga Bilonda Level 1 Hospital", "Nganda Bilonda Level 1 Hospital"),
    ("Livingstone Teaching Hospital (livingstone central)", "Livingstone UT Hospital"),
    ("ZRA Katima Mulilo", "Zambia Revenue Authority Katima Mulilo"),
]

# Survivor renames applied after the merge (doc name -> register name).
RENAMES = {
    "Livingstone Teaching Hospital (livingstone central)": "Livingstone Teaching Hospital",
    "Mwami Adventist Hospital, Chipata": "Mwami Adventist Hospital",
}

# new-list name -> old-register name, for deliberate redirects where the old
# register holds two entries for the facility and the aliased one is the
# richer/curated record. (Plain spelling drift is handled by collapsed().)
OLD_ALIASES = {
    "Mwami Adventist Hospital": "Mwami Adventist Hospital, Chipata",
}

# How far along the pipeline a stage is — used to pick the surviving status
# when merging duplicate rows.
STAGE_RANK = [
    "No Application Submitted",
    "Draft Application",
    "Application Submitted",
    "Import Licence Only (Not yet Use/Possession)",
    "Invoice Generation Pending",
    "Waiting for Payment",
    "Accounts Clearance Pending",
    "Waiting for Review and Assessment",
    "Under Review and Assessment",
    "Under Internal Review (Further Information Required)",
    "Authorization Terms Issued",
    "In Final Processing",
    "CEO Licence Approval Required",
    "Board Licence Approval Required",
    "Licence / Certificate Issued",
    "Licensed",
]


def stage_rank(licensed: bool, stage: str) -> int:
    if licensed:
        return len(STAGE_RANK) + 1
    try:
        return STAGE_RANK.index(stage)
    except ValueError:
        return 0


# --------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("docx")
    ap.add_argument("--old-seed", default="seed/facilities.seed.json")
    ap.add_argument("--out", default="seed/facilities.seed.json")
    ap.add_argument("--report", default="docs/register-2026-import.md")
    args = ap.parse_args()

    func_rows, nonf_rows = parse_docx(args.docx)
    old = json.load(open(args.old_seed))

    # ---- old-register lookup: (name, district) first, then name, then collapsed
    by_name_dist, by_name, by_collapsed = {}, {}, {}
    for o in old:
        by_name_dist.setdefault((norm(o["name"]), norm(o["dist"])), o)
        by_name.setdefault(norm(o["name"]), o)
        by_collapsed.setdefault(collapsed(o["name"]), o)

    # district -> province learned from the old register (mode of each district)
    dist_prov = {}
    for o in old:
        if o["dist"] and o["prov"]:
            dist_prov.setdefault(norm(o["dist"]), {})
            dist_prov[norm(o["dist"])][o["prov"]] = \
                dist_prov[norm(o["dist"])].get(o["prov"], 0) + 1
    dist_to_prov = {d: max(c, key=c.get) for d, c in dist_prov.items()}

    # ---- build working rows
    rows = []
    for section, cells in (
        [("F", c) for c in func_rows] + [("NF", c) for c in nonf_rows]
    ):
        no, name, dist, prac, status, detail = [c.strip() for c in cells]
        no = int(no)
        licensed, stage, review = map_status(status, detail)
        stalled = "(no activity in 2026)" in detail.lower()
        functional = section == "F" or detail.strip().upper() == "NOW FUNCTIONAL"
        if section == "NF" and 70 <= no <= 74:
            stalled = True          # non-functional stalled band (positional)
        if (section == "F" and 339 <= no <= 383) or (section == "NF" and 75 <= no <= 83):
            review = review or REVIEW_UNCERTAIN   # "needs manual check" bands
        rows.append({
            "section": section, "no": no, "name": name, "dist": dist,
            "prac": prac, "status": status, "detail": detail,
            "licensed": licensed, "stage": stage, "review": review,
            "stalled": stalled, "functional": functional,
        })

    report = {
        "merges": [], "removed_old": [], "new_unmatched": [],
        "fixes": [], "possible_dups": [],
    }

    # ---- merges
    def find_row(spec):
        # norm() comparison — the doc uses typographic apostrophes/dashes.
        if "@" in spec:                       # name@district disambiguator
            nm, ds = spec.split("@", 1)
            match = [r for r in rows
                     if norm(r["name"]) == norm(nm) and norm(r["dist"]) == norm(ds)]
        else:
            match = [r for r in rows if norm(r["name"]) == norm(spec)]
        return match[0] if match else None

    for survivor_name, dup_name in MERGES:
        a, b = find_row(survivor_name), find_row(dup_name)
        if not a or not b or a is b:
            print(f"warn: merge pair not found: {survivor_name!r} / {dup_name!r}",
                  file=sys.stderr)
            continue
        winner = a if stage_rank(a["licensed"], a["stage"]) >= stage_rank(b["licensed"], b["stage"]) else b
        loser = b if winner is a else a
        if winner["detail"].strip().upper() == "NOW FUNCTIONAL":
            # The annotation replaced the real stage detail; borrow the other
            # row's detail only if it describes the same stage.
            detail = loser["detail"] if loser["stage"] == winner["stage"] else ""
        else:
            detail = winner["detail"]
        a.update({
            "licensed": winner["licensed"], "stage": winner["stage"],
            "status": winner["status"],
            "detail": detail,
            "dist": a["dist"] or b["dist"],
            "prac": a["prac"] or b["prac"],
            "functional": a["functional"] or b["functional"],
            "stalled": a["stalled"] or b["stalled"],
            "review": a["review"] or b["review"],
        })
        rows.remove(b)
        report["merges"].append(
            f'"{b["name"]}" ({b["section"]} #{b["no"]}) merged into '
            f'"{a["name"]}" ({a["section"]} #{a["no"]}) — kept status '
            f'"{winner["status"]}", functional={"Yes" if a["functional"] else "No"}')

    for old_name, new_name in RENAMES.items():
        r = find_row(old_name)
        if r:
            report["fixes"].append(f'Renamed "{r["name"]}" → "{new_name}"')
            r["name"] = new_name

    # Targeted data patches, each logged.
    r = find_row("Mingomba Mining Limited")
    if r and not r["dist"]:
        r["dist"] = "Chililabombwe"
        report["fixes"].append(
            'Mingomba Mining Limited: district set to Chililabombwe (carried from '
            'the register\'s duplicate "Mingoba Mining Limited" entry)')

    # ---- enrich from the old register
    used_old_ids = set()

    def old_match(r):
        alias = OLD_ALIASES.get(r["name"])
        if alias and norm(alias) in by_name:
            return by_name[norm(alias)]
        return (by_name_dist.get((norm(r["name"]), norm(r["dist"])))
                or by_name.get(norm(r["name"]))
                or by_collapsed.get(collapsed(r["name"])))

    out = []
    for r in rows:
        o = old_match(r)
        review = r["review"]
        if o is not None:
            used_old_ids.add(id(o))
            sec, prov = o["sec"], o["prov"]
            dist = r["dist"] or o["dist"]
            prac = r["prac"] or o["prac"]
            fac, ln, auth = o["fac"], o["ln"], o["auth"]
        else:
            public_rx = re.compile(
                r"district hospital|general hospital|central hospital|teaching hospital"
                r"|mission|airport|university|college|\bzra\b|\bzaf\b|\bzns\b|^za "
                r"|zambia police|zambia army|ministry|council|commission|institute"
                r"|zambia railways|zesco", re.I)
            sec = "Public" if public_rx.search(r["name"]) else "Private"
            prov = ""
            dist, prac = r["dist"], r["prac"]
            fac, ln, auth = "", "", ""
            review = review or "New facility in the 2026 list — confirm sector and province"
            report["new_unmatched"].append(
                f'{r["name"]} ({dist or "district unknown"}) — sector assumed {sec}')
        if not prov:
            prov = dist_to_prov.get(norm(dist), "") or "Lusaka"
            if not dist:
                review = review or "District/province unknown — confirm"
        cat, cat_review = categorise(prac, r["name"])
        review = review or cat_review
        out.append({
            "name": r["name"], "dist": dist, "prov": prov, "prac": prac,
            "sec": sec, "lic": "Yes" if r["licensed"] else "No",
            "stage": r["stage"], "auth": auth, "fac": fac, "ln": ln,
            "func": "Yes" if r["functional"] else "No",
            "cat": cat,
            "stalled": "Yes" if r["stalled"] else "",
            "review": review,
            "detail": r["detail"],
            "_section": r["section"], "_no": r["no"],
        })

    # ---- order: functional (doc order), then non-functional (doc order)
    out.sort(key=lambda x: (x["_section"] != "F", x["_no"]))
    for i, row in enumerate(out, 1):
        row["n"] = i
        del row["_section"], row["_no"]
    key_order = ["n", "name", "dist", "prov", "prac", "sec", "lic", "stage",
                 "auth", "fac", "ln", "func", "cat", "stalled", "review", "detail"]
    out = [{k: row[k] for k in key_order} for row in out]

    # ---- removed old facilities
    for o in old:
        if id(o) not in used_old_ids:
            report["removed_old"].append(
                f'{o["name"]} ({o["dist"] or "—"}, {o["sec"]}, '
                f'{"licensed" if o["lic"] == "Yes" else o["stage"]})')

    # Same-name different-district rows that may still be duplicates.
    report["possible_dups"] = [
        '"St. Joseph Rural Mini Hospital" vs "St. Joseph Chamilalamini Mission '
        'Hospital" (both Nyimba) — kept separate, verify',
        '"K.G.P Dental Surgery" vs "KG Dental Surgery" (both Lusaka) — kept '
        'separate, verify',
    ]

    # ---- stats
    n_func = sum(1 for r in out if r["func"] == "Yes")
    n_lic = sum(1 for r in out if r["lic"] == "Yes")
    n_med = sum(1 for r in out if r["cat"] == "Medical")
    n_stall = sum(1 for r in out if r["stalled"])
    n_review = sum(1 for r in out if r["review"])
    by_stage = {}
    for r in out:
        by_stage[r["stage"]] = by_stage.get(r["stage"], 0) + 1

    with open(args.out, "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
        f.write("\n")

    lines = [
        "# Register import — 2026 Facility Status List",
        "",
        f"Imported {date.today().isoformat()} from “Facility Licensing Status — "
        "Actual Current 2026 Position” (prepared 23 July 2026), replacing the "
        "previous seeded register.",
        "",
        "## Result",
        "",
        f"| Metric | Count |",
        f"|---|---|",
        f"| Facilities | **{len(out)}** |",
        f"| Functional / Non-functional | {n_func} / {len(out) - n_func} |",
        f"| Licensed / Unlicensed | {n_lic} / {len(out) - n_lic} |",
        f"| Medical / Non-Medical | {n_med} / {len(out) - n_med} |",
        f"| Stalled applications | {n_stall} |",
        f"| Flagged for review | {n_review} |",
        "",
        "Doc sections were 383 functional + 82 non-functional rows (the doc's",
        "own heading says 83, but row #18 of that table is absent from the",
        "document). 22 non-functional rows annotated “NOW FUNCTIONAL” were",
        "imported as functional, and duplicate rows were merged, giving the",
        "totals above.",
        "",
        "## Stage breakdown",
        "",
        "| Stage | Facilities |",
        "|---|---|",
    ]
    for s, c in sorted(by_stage.items(), key=lambda kv: -kv[1]):
        lines.append(f"| {s} | {c} |")
    lines += ["", "## Merged duplicate rows", ""]
    lines += [f"- {m}" for m in report["merges"]]
    lines += ["", "## Renames / fixes", ""]
    lines += [f"- {m}" for m in report["fixes"]]
    lines += [
        "- Chifubu District Hospital: status cell in the doc had spilled from "
        "the facility name; imported as Under Review and Assessment per its "
        "detail column, flagged for review.",
        "- Drug Enforcement Commission - Ndola: district reads “Lusaka” in both "
        "the doc and the previous register despite the name — kept as-is.",
    ]
    lines += ["", "## Old facilities removed (absent from the 2026 list)", ""]
    lines += [f"- {m}" for m in report["removed_old"]]
    lines += ["", "## New facilities with no previous-register match", ""]
    lines += [f"- {m}" for m in report["new_unmatched"]] or ["- (none)"]
    lines += ["", "## Possible duplicates kept separate", ""]
    lines += [f"- {m}" for m in report["possible_dups"]]
    lines.append("")

    with open(args.report, "w") as f:
        f.write("\n".join(lines))

    print(f"Wrote {len(out)} facilities to {args.out}")
    print(f"functional={n_func} licensed={n_lic} medical={n_med} "
          f"stalled={n_stall} review={n_review}")
    print(f"Report: {args.report}")


if __name__ == "__main__":
    main()
