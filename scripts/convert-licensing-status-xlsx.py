#!/usr/bin/env python3
"""
Importer: RPA "Licensing Status" workbook (.xlsx) -> seed/facilities.seed.json

Rebuilds the facility register from the Licensing Status workbook that the
Authorisation & Standards section maintains in RAIS order (every row carries its
RAN / FAC code), and records every licence the workbook accounts for:

  * sheet "Renewal or Use Possession" — the register itself, one row per
    facility, plus the Use/Possession licences issued (renewal or new use),
    their quantity and quarter of issue.
  * sheets "Import", "Export", "Tranfer of Licence", "Transport", "Transit",
    "Variation of Terms or Condition", "Decommission", "Design and
    Construction" — the standalone authorisations, by facility and quarter.
  * sheet "New Licencees" — first-time licensees; they are a subset of the
    "Use" rows of the main sheet, so they are annotated, never counted twice.
  * sheet "Totals" — the section's own per-type totals, reconciled against the
    import and reported type by type (a mismatch is printed and written to the
    report rather than silently absorbed).

The workbook does not carry practice, sector, category, pipeline stage or
licence numbers, so every row is matched back to the previous register (the old
seed JSON) and enriched from it. Matching runs in tiers: FAC code, curated
alias, exact name, spacing-insensitive name, then fuzzy name (>= 0.80), each
one-to-one.

Decisions encoded here:
  * The workbook is authoritative for the register's membership, licence
    status, district, region and operating status.
  * Rows the workbook does not carry stay on the register with their previous
    status, flagged for review — the workbook's own licence sheets record
    licences for some of them, so its register sheet is not exhaustive.
  * A facility the previous register showed licensed but the workbook leaves
    blank becomes unlicensed at stage "Licence Expiring (Renewal Due)" and is
    flagged for review.
  * Licences have no issue date in the workbook, only a quarter, so each
    authorisation carries `quarter` ("2026-Q1") and an empty `date`.
  * Licence numbers carried by the previous register are attached to that
    facility's Use/Possession authorisations, in order; the rest stay blank
    until RAIS supplies them.

Usage:
  python3 scripts/convert-licensing-status-xlsx.py <Licensing_Status.xlsx> \
      [--old-seed seed/facilities.seed.json] \
      [--out seed/facilities.seed.json] \
      [--report docs/licensing-status-2026-import.md] \
      [--year 2026] [--imported-on YYYY-MM-DD]
"""

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date

try:
    import openpyxl
except ImportError:  # pragma: no cover - operator-facing message
    sys.exit("openpyxl is required:  pip install openpyxl")


# ---------------------------------------------------------------- text utils

GENERIC_TOKENS = {
    "hospital", "hospitals", "hosp", "clinic", "clinics", "medical", "medicare",
    "centre", "center", "health", "healthcare", "general", "district", "care",
    "services", "service", "mission", "university", "college", "school",
    "council", "board", "institute", "institution", "laboratory", "lab", "labs",
    "diagnostic", "diagnostics", "pharmacy", "dental", "trust", "group",
    "holdings", "enterprises", "enterprise", "national", "rural", "urban",
    "provincial", "public", "private", "the", "of", "and",
}


def norm(s: str) -> str:
    """Lowercase, de-accent, drop company suffixes — the matching key."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\b(ltd|limited|plc|inc|co|company)\b", " ", s)
    return " ".join(s.split())


def collapsed(s: str) -> str:
    """norm() without spaces — collapses 'K.G' vs 'KG' style variants."""
    return norm(s).replace(" ", "")


def weighted_sim(a: str, b: str) -> float:
    """Weighted Jaccard over name tokens; generic words count for less."""
    A, B = set(norm(a).split()), set(norm(b).split())
    if not A or not B:
        return 0.0
    inter = union = 0.0
    for t in A | B:
        w = 0.3 if t in GENERIC_TOKENS else 1.0
        union += w
        if t in A and t in B:
            inter += w
    return inter / union if union else 0.0


def trigram_sim(a: str, b: str) -> float:
    """Character-trigram Dice coefficient — rescues typos and spelling drift."""
    def grams(s):
        t = norm(s).replace(" ", "")
        return {t[i:i + 3] for i in range(len(t) - 2)}
    A, B = grams(a), grams(b)
    if not A or not B:
        return 0.0
    return 2 * len(A & B) / (len(A) + len(B))


def sim(a: str, b: str) -> float:
    return max(weighted_sim(a, b), trigram_sim(a, b))


# Tokens that must not be title-cased when a workbook name is ALL CAPS.
ACRONYMS = {
    "ZNS", "ZAF", "ZA", "ZRA", "KCM", "NFC", "CIDRZ", "CT", "UTH", "PTY", "JV",
    "IVF", "NDE", "HQ", "AFB", "KGP", "TMS", "ERP", "RT", "CJ", "UNZA", "ZCCM",
    "ZAMBART", "CNMC", "ZESCO", "DEC", "OHSI", "ZMMSA", "WRC", "TCCC", "L85",
    "MTN", "USA", "UK", "AC", "II", "III", "IV", "NHS", "KK", "KKIA",
}
LOWER_WORDS = {"of", "and", "the", "for", "in", "at", "on", "de", "la"}
SUFFIX_CASE = {"LTD": "Ltd", "PLC": "Plc", "LIMITED": "Limited", "INC": "Inc"}


def title_case(name: str) -> str:
    """Readable casing for the workbook's ALL-CAPS names."""
    name = re.sub(r"\s+", " ", (name or "").strip()).strip(" .,")
    if not name:
        return ""
    # "X X" (the workbook repeats a few names) collapses to "X".
    half = len(name) // 2
    if len(name) % 2 == 1 and norm(name[:half]) and norm(name[:half]) == norm(name[half + 1:]):
        name = name[:half]
    if not name.isupper():
        return name  # already mixed case in the workbook — leave it alone

    def fix(word: str) -> str:
        core = re.sub(r"[^A-Za-z0-9]", "", word)
        if core.upper() in ACRONYMS:
            return word.upper()
        if core.upper() in SUFFIX_CASE:
            return word.replace(core, SUFFIX_CASE[core.upper()])
        if core.lower() in LOWER_WORDS:
            return word.lower()
        # Title-case each alphabetic run: "mum's" -> "Mum's", "(z)" -> "(Z)".
        return re.sub(r"[A-Za-z]+", lambda m: m.group(0).capitalize(), word.lower())

    words = [fix(w) for w in name.split(" ")]
    if words and words[0].lower() in LOWER_WORDS:
        words[0] = words[0].capitalize()
    return " ".join(words)


# ------------------------------------------------------------ workbook input

MAIN_SHEET_HINT = "renewal"

# Standalone-authorisation sheets -> the licence type they record.
TYPE_SHEETS = {
    "import": "Importation Licence",
    "export": "Export Licence",
    "tranfer of licence": "Transfer Licence",
    "transfer of licence": "Transfer Licence",
    "transport": "Transport Licence",
    "transit": "Transit Licence",
    "variation of terms or condition": "Variation of Terms and Conditions",
    "design and construction": "Design and Construction Licence",
    "decommission": "Decommissioning Licence",
}

# The "Totals" sheet's own labels -> licence type (Use Licences covers both
# renewal and new use/possession, which is how the section reports them).
TOTALS_LABELS = {
    "use licences": "Use/Possession",
    "import": "Importation Licence",
    "export": "Export Licence",
    "transfer": "Transfer Licence",
    "transport": "Transport Licence",
    "transit": "Transit Licence",
    "variation of terms and conditions": "Variation of Terms and Conditions",
    "decommission": "Decommissioning Licence",
    "design and construction": "Design and Construction Licence",
}

LICENCE_TYPES = [
    "New Use/Possession Licence",
    "Renewal of Use/Possession Licence",
    "Importation Licence",
    "Export Licence",
    "Transfer Licence",
    "Transport Licence",
    "Transit Licence",
    "Variation of Terms and Conditions",
    "Design and Construction Licence",
    "Decommissioning Licence",
]

PROVINCES = [
    "Lusaka", "Copperbelt", "North-Western", "Central", "Northern", "Luapula",
    "Eastern", "Western", "Southern", "Muchinga",
]

# Operating status wording in the workbook -> functional yes/no. The two role
# descriptions ("Service provider", "Transporter") say what the facility does,
# not whether it operates; they are read as operating and flagged for review.
FUNCTIONAL_STATUS = {
    "in operation": True,
    "operational": True,
    "in opreation": True,
    "service provider": True,
    "transporter": True,
    "not yet operational": False,
    "non operational": False,
    "temporarily not in operation": False,
    "commissioned but not in operation": False,
}
ROLE_STATUSES = {"service provider", "transporter"}


def cells(ws, min_row=1):
    for row in ws.iter_rows(min_row=min_row, values_only=True):
        yield [("" if c is None else str(c).strip()) for c in row]


def read_workbook(path: str):
    wb = openpyxl.load_workbook(path, data_only=True)

    main = None
    totals = {}
    type_rows = []            # (licence type, facility name, quarter, quantity)
    new_licensees = []        # names from the "New Licencees" sheet
    for ws in wb.worksheets:
        key = " ".join(ws.title.strip().lower().split())
        if MAIN_SHEET_HINT in key:
            main = ws
        elif key == "totals":
            for v in cells(ws, min_row=2):
                label = TOTALS_LABELS.get(v[0].strip().lower())
                if label and v[1]:
                    totals[label] = int(float(v[1]))
        elif key == "new licencees":
            new_licensees = [v[0] for v in cells(ws, min_row=2) if v[0]]
        elif key in TYPE_SHEETS:
            lic_type = TYPE_SHEETS[key]
            for v in cells(ws, min_row=2):
                if not v[0]:
                    continue  # the sheet's own total row carries no name
                qty = int(float(v[2])) if len(v) > 2 and v[2] else 1
                type_rows.append((lic_type, v[0], v[1] if len(v) > 1 else "", qty))
    if main is None:
        sys.exit("Could not find the 'Renewal or Use Possession' sheet")

    facilities = []
    for v in cells(main, min_row=2):
        v += [""] * (9 - len(v))
        if not v[0] or not v[8]:
            continue  # the sheet's trailing total row has no name / RAN
        facilities.append({
            "raw_name": v[0],
            "lic_status": v[1],
            "lic_type": v[2],
            "qty": v[3],
            "quarters": v[4],
            "district": v[5],
            "fac_status": v[6],
            "region": v[7],
            "fac": v[8],
        })
    return facilities, type_rows, new_licensees, totals


def parse_quarters(text: str, qty: int):
    """'Q1, Q3' + qty 2 -> ['Q1','Q3'];  'Q2' + qty 4 -> ['Q2'] * 4."""
    qs = re.findall(r"Q[1-4]", (text or "").upper())
    if not qs:
        return [""] * qty
    if len(qs) >= qty:
        return qs[:qty]
    return qs + [qs[-1]] * (qty - len(qs))


def use_licence_type(raw: str) -> str:
    t = (raw or "").strip().lower()
    if t.startswith("ren") or t == "renwal":  # the workbook spells it both ways
        return "Renewal of Use/Possession Licence"
    return "New Use/Possession Licence"


# ------------------------------------------------------------------ matching

# Curated old-register name -> workbook FAC code. These are the pairs the
# fuzzy matcher cannot see: renames, branch spellings and the previous
# register's duplicate rows for one RAIS facility.
ALIASES = {
    # KCM / Konkola Mineral Resources: four previous rows, two RAIS facilities.
    "konkola mineral resources": "FAC/0169",
    "konkola copper mines nchanga": "FAC/0169",
    "kcm smelter nchanga": "FAC/0169",
    "konkola mineral resources konkola": "FAC/0272",
    "konkola mineral resources nchanga south hospital": "FAC/0577",
    # Occupational Health and Safety Institute — three branches, one FAC code
    # in the previous register, three distinct RAIS rows in the workbook.
    "occupational health and safety institute solwezi": "FAC/0430",
    "occupational health and safety institute kitwe": "FAC/0094",
    "occupational health and safety institute lusaka": "FAC/0437",
    # Renames and level/status wording.
    "chifubu district hospital": "FAC/0573",       # CHIFUBU LEVEL 1 HOSPITAL
    "michael chilufya sata dental clinic": "FAC/0327",
    "yuka mission hospital": "FAC/0120",           # Yuka Adventist Mission Hospital
    "sarovar hotel": "FAC/0415",                   # Neelkanth Sarovar Premiere
    "lewanika central hospital": "FAC/0054",       # Lewanika General Hospital
    "mwandi district hospital": "FAC/0086",        # Mwandi Mission Hospital
    "lumwana 1st level hospital": "FAC/0289",      # Lumwana District Hospital
    "munyumbwe first level hospital": "FAC/0587",  # Munyumbwe Level One Hospital
    "barrick lumwana mine": "FAC/0170",            # Lumwana Mining Company Limited
    "zhongding jv wah kong cerium": "FAC/0541",    # Cerium Zambia Limited
    "mum s care clinic bwinjimfumu": "FAC/0088",   # Mum's Care Clinic
}

FUZZY_FLOOR = 0.80


def match_register(new_rows, old_rows):
    """One-to-one match of workbook rows to previous-register rows.

    Tiers, best first: FAC code, exact name, curated alias, spacing-insensitive
    name, fuzzy name. A row named in ALIASES is matched by its alias alone — it
    is there precisely because its own name and FAC code point somewhere else.

    Returns (matches: fac -> old row, how: fac -> tier label).
    """
    aliased = {id(o) for o in old_rows if norm(o["name"]) in ALIASES}
    by_fac = defaultdict(list)
    for o in old_rows:
        if o.get("fac") and id(o) not in aliased:
            by_fac[o["fac"]].append(o)

    # (tier, score) candidate list; lower tier wins, then higher score.
    cands = []
    for r in new_rows:
        for o in by_fac.get(r["fac"], []):
            # The previous register reused a few FAC codes across rows; prefer
            # the one whose name actually looks like the workbook's.
            cands.append((0, sim(r["raw_name"], o["name"]), "fac", r, o))
        for o in old_rows:
            if id(o) in aliased:
                if ALIASES[norm(o["name"])] == r["fac"]:
                    cands.append((2, 1.0, "alias", r, o))
                continue
            if norm(o["name"]) == norm(r["raw_name"]):
                cands.append((1, 1.0, "name", r, o))
            elif collapsed(o["name"]) == collapsed(r["raw_name"]):
                cands.append((3, 1.0, "collapsed", r, o))
            else:
                s = sim(r["raw_name"], o["name"])
                if s >= FUZZY_FLOOR:
                    cands.append((4, s, "fuzzy", r, o))

    cands.sort(key=lambda c: (c[0], -c[1]))
    matches, how, used_old, used_new = {}, {}, set(), set()
    for tier, score, label, r, o in cands:
        if r["fac"] in used_new or id(o) in used_old:
            continue
        matches[r["fac"]] = o
        how[r["fac"]] = label if label != "fuzzy" else f"fuzzy {score:.2f}"
        used_new.add(r["fac"])
        used_old.add(id(o))
    return matches, how


def classify_leftovers(old_rows, matches, new_by_fac):
    """Split unmatched previous-register rows into merges and true removals.

    A leftover whose alias (or own FAC code) points at a facility the workbook
    does carry is a duplicate row for that facility — the previous register held
    several spellings of one RAIS facility — so it is merged into it rather than
    treated as a lost facility.
    """
    matched_ids = {id(o) for o in matches.values()}
    merged, dropped = [], []
    for o in old_rows:
        if id(o) in matched_ids:
            continue
        target = ALIASES.get(norm(o["name"])) or o.get("fac") or ""
        if target in new_by_fac:
            merged.append((o, target))
        else:
            dropped.append(o)
    return merged, dropped


# Curated licence-sheet name -> FAC code, for the standalone-authorisation
# sheets whose spelling the matcher cannot reach on its own.
LICENCE_ALIASES = {
    "northway dental": "FAC/0643",                 # North Way Dental Clinic
    "zambia revenue authority kapiri mposhi": "FAC/0225",   # ZRA Kapiri Mposhi
    "university teaching hospital nuclear medicine": "FAC/0116",
    # The cement plants are listed per site on the register sheet; the
    # unqualified spellings are the Lusaka (Chilanga) plant.
    "chilanga cement": "FAC/0175",
    "chilanga cement lusaka": "FAC/0175",
    "chilanga cement ndola": "FAC/0176",
    "alfred h knight": "FAC/0187",                 # Alfred H Knight (Z) Ltd
    "zaf samora": "FAC/0672",                      # ZAF Samora AFB
    "zns chamba valley garrison": "FAC/0628",
    "olivine": "FAC/0512",                         # Olivine Clinic
    # Holders whose only register row is a carried-over one (keyed "prev:").
    "kgp dental": "prev:k g p dental surgery",
    "cidrz ibex": "prev:cidrz ibex campus",
    # The register sheet has two rows named "ZAF KABWE"; this licence belongs
    # to the one whose district is Livingstone (both are flagged for review).
    "zaf livingstone": "FAC/0668",
}


def match_licence_rows(type_rows, pool, report):
    """Attach each standalone authorisation to a facility.

    `pool` is a list of {"key", "name"} — the workbook's register rows (keyed by
    FAC code) plus the previous-register rows carried over, so a licence whose
    holder the register sheet omits still lands on the right facility.
    """
    by_norm = defaultdict(list)
    by_collapsed = defaultdict(list)
    for p in pool:
        by_norm[norm(p["name"])].append(p)
        by_collapsed[collapsed(p["name"])].append(p)

    attached = defaultdict(list)
    unmatched = []
    for lic_type, name, quarter, qty in type_rows:
        target = None
        alias = LICENCE_ALIASES.get(norm(name))
        if alias:
            target = next((p for p in pool if p["key"] == alias), None)
            if target is not None:
                report["licence_aliases_used"].append(
                    (name, target["name"], lic_type)
                )
        if target is None:
            for bucket in (by_norm.get(norm(name)), by_collapsed.get(collapsed(name))):
                if bucket:
                    target = bucket[0]
                    break
        if target is None:
            best, best_score = None, 0.0
            for p in pool:
                s = sim(name, p["name"])
                if s > best_score:
                    best, best_score = p, s
            if best_score >= FUZZY_FLOOR:
                target = best
            else:
                unmatched.append((lic_type, name, quarter, qty, best, best_score))
                continue
        for q in parse_quarters(quarter, qty):
            attached[target["key"]].append({"type": lic_type, "quarter": q})
    report["licence_rows_unmatched"] = unmatched
    return attached


# -------------------------------------------------------------- enrichment

PUBLIC_NAME = re.compile(
    r"\b(zns|zaf|za|zambia national service|zambia air force|zambia army|"
    r"garrison|command|armoured|military|barracks|police|correctional|"
    r"ministry|government|district health|district hospital|general hospital|"
    r"level (1|one|i) hospital|teaching hospital|central hospital|"
    r"rural health|urban health|health (centre|center)|health post|"
    r"zambia revenue authority|zra|bank of zambia|drug enforcement|"
    r"council|university of zambia|airport)\b",
    re.I,
)
MEDICAL_PRACTICE = re.compile(
    r"x[- ]?ray|imaging|dental|nuclear medicine|radiotherapy|"
    r"computed tomography|\bct\b|mammo|fluoro|veterinar|animal health",
    re.I,
)
MEDICAL_NAME = re.compile(
    r"hospital|clinic|medical|dental|diagnos|health|hospice|veterinary|"
    r"medicare|surgery|imaging|nursing|maternity",
    re.I,
)


def guess_sector(name: str) -> str:
    return "Public" if PUBLIC_NAME.search(name or "") else "Private"


def guess_category(practice: str, name: str) -> str:
    if practice and practice.strip():
        return "Medical" if MEDICAL_PRACTICE.search(practice) else "Non-Medical"
    return "Medical" if MEDICAL_NAME.search(name or "") else "Non-Medical"


def build_district_province_map(new_rows):
    """District -> province, learned from the workbook rows that carry both."""
    votes = defaultdict(Counter)
    for r in new_rows:
        d, p = r["district"].strip().lower(), r["region"].strip()
        if d and p in PROVINCES:
            votes[d][p] += 1
    return {d: c.most_common(1)[0][0] for d, c in votes.items()}


def licence_numbers(old_row) -> list:
    """The AUTH/… numbers the previous register carried for a facility."""
    if not old_row:
        return []
    return [
        t.strip()
        for t in re.split(r"[,;]+", old_row.get("ln") or "")
        if "auth" in t.lower()
    ]


# ------------------------------------------------------------------- convert

def convert(xlsx_path, old_seed_path, year):
    new_rows, type_rows, new_licensees, totals = read_workbook(xlsx_path)
    with open(old_seed_path, encoding="utf-8") as fh:
        old_rows = json.load(fh)

    report = {
        "counts": {},
        "new_facilities": [],
        "carried": [],
        "merged": [],
        "licence_status_lost": [],
        "licence_status_gained": [],
        "workbook_duplicate_names": [],
        "fuzzy": [],
        "aliases": [],
        "licence_aliases_used": [],
    }

    new_by_fac = {r["fac"]: r for r in new_rows}
    matches, how = match_register(new_rows, old_rows)
    merged, carried = classify_leftovers(old_rows, matches, new_by_fac)
    report["carried"] = carried
    report["merged"] = [
        (o["name"], title_case(new_by_fac[fac]["raw_name"]), fac) for o, fac in merged
    ]
    # Licence numbers a merged duplicate carried belong to the facility it
    # merges into.
    extra_numbers = defaultdict(list)
    for o, fac in merged:
        extra_numbers[fac].extend(licence_numbers(o))
    def numbers_for(fac):
        """AUTH numbers the previous register held for this facility."""
        seen, out = set(), []
        for n in licence_numbers(matches.get(fac)) + extra_numbers.get(fac, []):
            if n not in seen:
                seen.add(n)
                out.append(n)
        return out

    for fac, label in sorted(how.items()):
        if label.startswith("fuzzy"):
            row = next(r for r in new_rows if r["fac"] == fac)
            report["fuzzy"].append((row["raw_name"], matches[fac]["name"], fac, label))
        elif label == "alias":
            row = next(r for r in new_rows if r["fac"] == fac)
            report["aliases"].append((matches[fac]["name"], row["raw_name"], fac))

    # Facilities the workbook's register sheet omits are carried over from the
    # previous register (flagged for review), so licences the workbook records
    # for them still have a holder.
    carried_key = {id(o): f"prev:{norm(o['name'])}" for o in carried}
    pool = [{"key": r["fac"], "name": r["raw_name"]} for r in new_rows]
    pool += [{"key": carried_key[id(o)], "name": o["name"]} for o in carried]
    standalone = match_licence_rows(type_rows, pool, report)
    first_time = set()
    for name in new_licensees:
        target = None
        best, best_score = None, 0.0
        for r in new_rows:
            s = sim(name, r["raw_name"])
            if s > best_score:
                best, best_score = r, s
        if best_score >= FUZZY_FLOOR:
            target = best
        if target:
            first_time.add(target["fac"])

    dist_prov = build_district_province_map(new_rows)
    name_counts = Counter(norm(r["raw_name"]) for r in new_rows)

    seeds = []
    for r in new_rows:
        old = matches.get(r["fac"])
        review = []

        licensed = r["lic_status"].strip().lower().startswith("licens")
        name = old["name"] if old else title_case(r["raw_name"])

        district = r["district"] or (old.get("dist") if old else "")
        province = r["region"] if r["region"] in PROVINCES else ""
        if not province:
            province = dist_prov.get((district or "").strip().lower(), "")
        if not province and old and old.get("prov") in PROVINCES:
            province = old["prov"]
        if not province:
            province = "Lusaka"
            review.append("No province in the licensing status list — confirm")

        practice = old.get("prac", "") if old else ""
        sector = old.get("sec") if old else guess_sector(name)
        category = old.get("cat") if old else guess_category(practice, name)

        status_key = " ".join(r["fac_status"].lower().split())
        functional = FUNCTIONAL_STATUS.get(status_key)
        if functional is None:
            functional = True
            review.append(
                f'Unrecognised operating status "{r["fac_status"]}" — confirm'
            )
        elif status_key in ROLE_STATUSES:
            review.append(
                f'Operating status reads "{r["fac_status"]}" (a role, not a '
                "status) — confirm the facility is operating"
            )

        # Stage: licensed rows are Licensed; everything else keeps the pipeline
        # stage the previous register knew, except a facility that has just
        # come off the licensed list.
        old_stage = (old or {}).get("stage", "")
        if licensed:
            stage = "Licensed"
        elif old and old.get("lic") == "Yes":
            stage = "Licence Expiring (Renewal Due)"
            review.append(
                "Register showed this facility licensed; the licensing status "
                "list records no current licence — confirm the renewal"
            )
            report["licence_status_lost"].append((name, r["fac"], old_stage))
        elif old_stage and old_stage != "Licensed":
            stage = old_stage
        else:
            stage = "No Application Submitted"
        if licensed and old and old.get("lic") == "No":
            report["licence_status_gained"].append((name, r["fac"], old_stage))

        # Authorisations: the Use/Possession licences from the main sheet plus
        # every standalone authorisation the type sheets record.
        lics = []
        if licensed:
            qty = int(float(r["qty"])) if r["qty"] else 1
            lic_type = use_licence_type(r["lic_type"])
            numbers = numbers_for(r["fac"])
            for i, q in enumerate(parse_quarters(r["quarters"], qty)):
                lics.append({
                    "t": lic_type,
                    "q": f"{year}-{q}" if q else "",
                    "n": numbers[i] if i < len(numbers) else "",
                })
        for a in standalone.get(r["fac"], []):
            lics.append({
                "t": a["type"],
                "q": f"{year}-{a['quarter']}" if a["quarter"] else "",
                "n": "",
            })

        if not old:
            report["new_facilities"].append((name, r["fac"], district, province))
            review.append(
                "New facility in the licensing status list — confirm sector, "
                "practice and category"
            )
        elif not practice:
            review.append(
                f"No practice recorded — category assumed {category}, confirm"
            )
        if name_counts[norm(r["raw_name"])] > 1:
            review.append(
                "The licensing status list carries this name twice under "
                "different RANs — confirm they are separate facilities"
            )
            report["workbook_duplicate_names"].append((r["raw_name"], r["fac"]))

        detail_bits = [f"{year} Licensing Status"]
        if licensed:
            short = "Renewal" if "Renewal" in use_licence_type(r["lic_type"]) else "New use"
            qs = r["quarters"] or "quarter not stated"
            n = len([l for l in lics if l["t"].endswith("Use/Possession Licence")])
            detail_bits.append(f"{short} · {n} licence{'s' if n > 1 else ''} · {qs}")
        else:
            detail_bits.append("no current use/possession licence")
        if r["fac"] in first_time:
            detail_bits.append("first-time licensee")
        if r["fac_status"]:
            detail_bits.append(r["fac_status"])

        all_numbers = numbers_for(r["fac"])
        seeds.append({
            "name": name,
            "dist": district,
            "prov": province,
            "prac": practice,
            "sec": sector,
            "lic": "Yes" if licensed else "No",
            "stage": stage,
            "auth": "Renewal" if licensed and "Renewal" in use_licence_type(r["lic_type"]) else ("New" if licensed else ""),
            "fac": r["fac"],
            "ln": "; ".join(all_numbers),
            "func": "Yes" if functional else "No",
            "cat": category,
            # A pre-2026 application that stalled stays flagged while it is
            # still unlicensed and still sitting on the same stage.
            "stalled": "Yes" if (old and old.get("stalled") == "Yes" and not licensed) else "",
            "review": " · ".join(review),
            "detail": " · ".join(detail_bits),
            "lics": lics,
        })

    # ---- rows the workbook's register sheet does not carry
    for o in carried:
        key = carried_key[id(o)]
        licensed = o["lic"] == "Yes"
        numbers = licence_numbers(o)
        # Keep the licences the row already carried (a previous import's), and
        # add the ones this workbook records for it. Re-importing the same
        # workbook must not double them, so a licence of the same type and
        # quarter is only added once.
        lics = list(o.get("lics") or [])
        if not lics and licensed:
            lic_type = use_licence_type(o.get("auth") or "Renewal")
            for i in range(max(1, len(numbers))):
                # No quarter: these licences are not part of the workbook's
                # count, they are what the previous register already held.
                lics.append({"t": lic_type, "q": "", "n": numbers[i] if i < len(numbers) else ""})
        for a in standalone.get(key, []):
            entry = {
                "t": a["type"],
                "q": f"{year}-{a['quarter']}" if a["quarter"] else "",
                "n": "",
            }
            if entry["q"] and any(
                l["t"] == entry["t"] and l.get("q") == entry["q"] for l in lics
            ):
                continue
            lics.append(entry)
        note = (
            f"Not in the {year} licensing status list — confirm the facility "
            "is still on the register"
        )
        review = [note]
        # The row may already carry this note from an earlier import of the
        # same workbook; keep the officer's view free of repeats.
        review += [
            part
            for part in (o.get("review") or "").split(" · ")
            if part and part != note
        ]
        seeds.append({
            "name": o["name"],
            "dist": o.get("dist", ""),
            "prov": o.get("prov") if o.get("prov") in PROVINCES else "Lusaka",
            "prac": o.get("prac", ""),
            "sec": o.get("sec", "Private"),
            "lic": o["lic"],
            "stage": o["stage"],
            "auth": o.get("auth", ""),
            "fac": o.get("fac", ""),
            "ln": "; ".join(numbers),
            "func": o.get("func", "Yes"),
            "cat": o.get("cat", "Medical"),
            "stalled": o.get("stalled", ""),
            "review": " · ".join(review),
            "detail": o.get("detail", ""),
            "lics": lics,
            "_carried": True,
        })

    # Licensed first, then alphabetical — the previous register's ordering.
    seeds.sort(key=lambda s: (s["lic"] != "Yes", s["name"].lower()))
    for i, s in enumerate(seeds, start=1):
        s["n"] = i
    ordered = [
        {k: s[k] for k in (
            "n", "name", "dist", "prov", "prac", "sec", "lic", "stage", "auth",
            "fac", "ln", "func", "cat", "stalled", "review", "detail", "lics",
        )}
        for s in seeds
    ]

    # ---- reconciliation against the workbook's own Totals sheet. Only
    # licences this workbook accounts for are reconciled; the ones a carried-
    # over facility already held are counted separately.
    issued, carried_issued = Counter(), Counter()
    for s in seeds:
        for l in s["lics"]:
            if s.get("_carried") and not l["q"]:
                carried_issued[l["t"]] += 1
            else:
                issued[l["t"]] += 1
    use_total = (
        issued["Renewal of Use/Possession Licence"]
        + issued["New Use/Possession Licence"]
    )
    checks = []
    for label, expected in sorted(totals.items()):
        got = use_total if label == "Use/Possession" else issued[label]
        checks.append((label, expected, got))
    report["counts"] = {
        "facilities": len(ordered),
        "licensed": sum(1 for s in ordered if s["lic"] == "Yes"),
        "unlicensed": sum(1 for s in ordered if s["lic"] == "No"),
        "functional": sum(1 for s in ordered if s["func"] == "Yes"),
        "non_functional": sum(1 for s in ordered if s["func"] == "No"),
        "medical": sum(1 for s in ordered if s["cat"] == "Medical"),
        "non_medical": sum(1 for s in ordered if s["cat"] == "Non-Medical"),
        "stalled": sum(1 for s in ordered if s["stalled"] == "Yes"),
        "review": sum(1 for s in ordered if s["review"]),
        "licences": sum(len(s["lics"]) for s in ordered),
        "workbook_licences": sum(issued.values()),
        "carried_licences": sum(carried_issued.values()),
        "issued_by_type": dict(issued + carried_issued),
        "checks": checks,
        "carried": len(carried),
        "by_stage": Counter(s["stage"] for s in ordered),
        "by_quarter": Counter(
            l["q"] or "carried over" for s in ordered for l in s["lics"]
        ),
        "first_time": len(first_time),
    }
    return ordered, report


# -------------------------------------------------------------------- report

def source_name(xlsx_path: str) -> str:
    """Workbook filename without the upload system's hash prefix."""
    base = xlsx_path.split("/")[-1]
    return re.sub(r"^[0-9a-f]{6,}-", "", base)


def write_report(path, report, xlsx_path, year, imported_on):
    c = report["counts"]
    L = []
    L.append(f"# Register import — {year} Licensing Status workbook\n")
    L.append(
        f"Imported {imported_on} from `{source_name(xlsx_path)}` (the "
        "Authorisation & Standards licensing status workbook), replacing the "
        "register seeded from the July 2026 Facility Status List. Regenerate "
        "with:\n"
    )
    L.append(
        "```\npython3 scripts/convert-licensing-status-xlsx.py "
        "<Licensing_Status.xlsx>\n```\n"
    )
    L.append("## Result\n")
    L.append("| Metric | Count |")
    L.append("|---|---|")
    L.append(f"| Facilities | **{c['facilities']}** |")
    L.append(f"| — from the workbook / carried over | {c['facilities'] - c['carried']} / {c['carried']} |")
    L.append(f"| Licensed / Unlicensed | {c['licensed']} / {c['unlicensed']} |")
    L.append(f"| Functional / Non-functional | {c['functional']} / {c['non_functional']} |")
    L.append(f"| Medical / Non-Medical | {c['medical']} / {c['non_medical']} |")
    L.append(f"| Licences recorded | **{c['licences']}** |")
    L.append(f"| — from the workbook / carried over | {c['workbook_licences']} / {c['carried_licences']} |")
    L.append(f"| First-time licensees | {c['first_time']} |")
    L.append(f"| Stalled applications | {c['stalled']} |")
    L.append(f"| Flagged for review | {c['review']} |")
    L.append("")

    L.append("## Licences issued — reconciled against the workbook's Totals sheet\n")
    L.append("| Licence type | Workbook total | Imported |")
    L.append("|---|---|---|")
    for label, expected, got in c["checks"]:
        mark = "" if expected == got else f" ⚠ ({got - expected:+d})"
        L.append(f"| {label} | {expected} | {got}{mark} |")
    L.append("")
    if c["carried_licences"]:
        L.append(
            f"A further **{c['carried_licences']}** licence(s) sit on the "
            "carried-over facilities below — they come from the previous "
            "register, not from this workbook, so they are outside its "
            "totals.\n"
        )
    L.append("Per licence type as stored on the register:\n")
    L.append("| Licence type | Count |")
    L.append("|---|---|")
    for t, n in sorted(c["issued_by_type"].items(), key=lambda kv: -kv[1]):
        L.append(f"| {t} | {n} |")
    L.append("")
    L.append("By quarter of issue:\n")
    L.append("| Quarter | Licences |")
    L.append("|---|---|")
    for q, n in sorted(c["by_quarter"].items()):
        L.append(f"| {q} | {n} |")
    L.append("")

    L.append("## Stage breakdown\n")
    L.append("| Stage | Facilities |")
    L.append("|---|---|")
    for stage, n in c["by_stage"].most_common():
        L.append(f"| {stage} | {n} |")
    L.append("")

    if report["licence_status_lost"]:
        L.append(
            "## Was licensed, no current licence in the workbook "
            f"({len(report['licence_status_lost'])})\n"
        )
        L.append(
            "Imported as unlicensed at stage *Licence Expiring (Renewal Due)* "
            "and flagged for review.\n"
        )
        for name, fac, _ in sorted(report["licence_status_lost"]):
            L.append(f"- {name} ({fac})")
        L.append("")

    if report["licence_status_gained"]:
        L.append(
            f"## Newly licensed ({len(report['licence_status_gained'])})\n"
        )
        L.append("Unlicensed in the previous register, licensed in the workbook.\n")
        for name, fac, stage in sorted(report["licence_status_gained"]):
            L.append(f"- {name} ({fac}) — was *{stage}*")
        L.append("")

    if report["aliases"]:
        L.append(f"## Curated matches ({len(report['aliases'])})\n")
        L.append("Renames, branch spellings and previous-register duplicates.\n")
        for old_name, new_name, fac in sorted(report["aliases"]):
            L.append(f"- {old_name} → {new_name} ({fac})")
        L.append("")

    if report["merged"]:
        L.append(f"## Merged duplicate rows ({len(report['merged'])})\n")
        L.append(
            "The previous register held several spellings of one RAIS "
            "facility; each of these merges into the workbook row named, "
            "carrying its licence numbers with it.\n"
        )
        for old_name, new_name, fac in sorted(report["merged"]):
            L.append(f"- {old_name} → {new_name} ({fac})")
        L.append("")

    if report["fuzzy"]:
        L.append(f"## Fuzzy matches ({len(report['fuzzy'])})\n")
        for new_name, old_name, fac, label in sorted(report["fuzzy"]):
            L.append(f"- {new_name} ({fac}) ← {old_name} — {label}")
        L.append("")

    if report["new_facilities"]:
        L.append(f"## New to the register ({len(report['new_facilities'])})\n")
        L.append(
            "Sector, practice and category are unknown for these — each is "
            "flagged for review.\n"
        )
        for name, fac, dist, prov in sorted(report["new_facilities"]):
            L.append(f"- {name} ({fac}) — {dist or '—'}, {prov}")
        L.append("")

    if report["carried"]:
        L.append(
            "## Carried over — not in the workbook "
            f"({len(report['carried'])})\n"
        )
        L.append(
            "The workbook's register sheet has no row for these, but they are "
            "kept on the register with their previous status and flagged for "
            "review. Two of them do appear on its licence sheets (K.G.P "
            "Dental Surgery, CIDRZ – Ibex Campus), which is why they are kept "
            "rather than removed.\n"
        )
        for o in report["carried"]:
            L.append(
                f"- {o['name']} ({o.get('fac') or 'no RAN'}, {o.get('dist') or '—'}, "
                f"{o['sec']}, {'licensed' if o['lic'] == 'Yes' else o['stage']})"
            )
        L.append("")

    if report["workbook_duplicate_names"]:
        L.append(
            "## Repeated names in the workbook "
            f"({len(report['workbook_duplicate_names'])})\n"
        )
        L.append(
            "Imported as separate facilities because each carries its own RAN; "
            "flagged for review.\n"
        )
        for name, fac in sorted(report["workbook_duplicate_names"]):
            L.append(f"- {name} ({fac})")
        L.append("")

    if report["licence_aliases_used"]:
        L.append(
            "## Curated licence-sheet matches "
            f"({len(report['licence_aliases_used'])})\n"
        )
        L.append(
            "Licence rows whose holder is spelt differently on the licence "
            "sheet than on the register sheet.\n"
        )
        for name, target, lic_type in sorted(report["licence_aliases_used"]):
            L.append(f"- {name} → {target} ({lic_type})")
        L.append("")

    if report["licence_rows_unmatched"]:
        L.append(
            "## Licences with no facility in the workbook "
            f"({len(report['licence_rows_unmatched'])})\n"
        )
        L.append(
            "These rows appear on a licence-type sheet but no row of the "
            "register sheet matches them, so they are **not** counted on any "
            "facility.\n"
        )
        for lic_type, name, quarter, qty, best, score in report["licence_rows_unmatched"]:
            near = f" (closest: {best['name']} {score:.2f})" if best else ""
            L.append(f"- {name} — {lic_type}, {quarter or 'quarter not stated'} ×{qty}{near}")
        L.append("")

    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("--old-seed", default="seed/facilities.seed.json")
    ap.add_argument("--out", default="seed/facilities.seed.json")
    ap.add_argument("--report", default="docs/licensing-status-2026-import.md")
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument(
        "--imported-on",
        default=date.today().isoformat(),
        help="Date recorded in the report header (default: today).",
    )
    args = ap.parse_args()

    seeds, report = convert(args.xlsx, args.old_seed, args.year)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(seeds, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    write_report(args.report, report, args.xlsx, args.year, args.imported_on)

    c = report["counts"]
    print(f"Wrote {args.out}: {c['facilities']} facilities, "
          f"{c['licensed']} licensed, {c['licences']} licences")
    for label, expected, got in c["checks"]:
        flag = "ok" if expected == got else f"MISMATCH ({got - expected:+d})"
        print(f"  {label:<34} workbook {expected:>4}  imported {got:>4}  {flag}")
    print(f"Report: {args.report}")
    if report["licence_rows_unmatched"]:
        print(f"  {len(report['licence_rows_unmatched'])} licence rows unmatched "
              "— see the report")


if __name__ == "__main__":
    main()
