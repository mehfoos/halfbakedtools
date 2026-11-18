#!/usr/bin/env python3
"""Build the planner's food file from UK CoFID 2021 (McCance and Widdowson's integrated dataset).

Writes:
  tools/nutrient-planner/data/foods/foods-cofid.json   same layout as foods.json, values from CoFID only
  tools/nutrient-planner/data/foods/cofid_report.md    which record each common food uses, counts, definitions

Nothing is mixed in from other tables: a nutrient CoFID doesn't give is missing (NA). CoFID's own codes
are kept: "Tr" (trace) and "N" (present, no reliable amount) are missing values, and the food records which
code CoFID gave (shown to visitors), as do values taken from a fall-back column. Definitions follow the
CoFID 2021 user guide (archived with the data).

Standard library only. Usage:
  python3 -I tools/nutrient-planner/pipeline/tables/cofid.py --table McCance_..._2021..xlsx
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPELINE = HERE.parent
TOOL = PIPELINE.parent
sys.path.insert(0, str(PIPELINE))
sys.path.insert(0, str(PIPELINE / "crosswalk"))
import auto_foods  # noqa: E402  (diet, portions and oily-fish rules shared with the USDA build)
import xlsx_min  # noqa: E402

TABLE = "cofid"
TITLE = "UK CoFID 2021"
NUMBER = re.compile(r"^\s*[0-9]+(?:\.[0-9]+)?\s*$")
CODE_TEXT = {"Tr": "trace", "N": "present, amount not known"}

# planner key -> (sheet, [CoFID component codes tried in order], note on the definition)
# Units in CoFID match the planner's units for every key listed (g, mg, µg per 100 g).
MAP = {
    "energy": ("1.3 Proximates", ["KCALS"], "Energy from protein 4, fat 9, available carbohydrate (as monosaccharides) 3.75 and alcohol 7 kcal/g"),
    "protein": ("1.3 Proximates", ["PROT"], "Total nitrogen x food-specific factor"),
    "fat": ("1.3 Proximates", ["FAT"], "Total fat"),
    "satfat": ("1.3 Proximates", ["SATFOD"], "Saturated fatty acids per 100 g food"),
    "carbohydrate": ("1.3 Proximates", ["CHO"], "Available carbohydrate expressed as monosaccharide equivalents (not by difference; excludes fibre). Reads up to about 10% higher than carbohydrate by weight"),
    "fibre": ("1.3 Proximates", ["AOACFIB"], "AOAC fibre (includes resistant starch and lignin), the method used for UK fibre recommendations"),
    "sugars": ("1.3 Proximates", ["TOTSUG"], "Total sugars as monosaccharide equivalents"),
    "calcium": ("1.4 Inorganics", ["CA"], ""),
    "iron": ("1.4 Inorganics", ["FE"], ""),
    "magnesium": ("1.4 Inorganics", ["MG"], ""),
    "phosphorus": ("1.4 Inorganics", ["P"], ""),
    "potassium": ("1.4 Inorganics", ["K"], ""),
    "sodium": ("1.4 Inorganics", ["NA"], ""),
    "zinc": ("1.4 Inorganics", ["ZN"], ""),
    "copper": ("1.4 Inorganics", ["CU"], ""),
    "manganese": ("1.4 Inorganics", ["MN"], ""),
    "selenium": ("1.4 Inorganics", ["SE"], ""),
    "iodine": ("1.4 Inorganics", ["I"], ""),
    "vitaminA": ("1.5 Vitamins", ["RETEQU"], "Retinol equivalents: retinol + beta-carotene equivalents / 6 (the UK definition; US values are retinol activity equivalents)"),
    "retinol": ("1.5 Vitamins", ["RET"], ""),
    "vitaminD": ("1.5 Vitamins", ["VITD"], "Total vitamin D; for meat, cholecalciferol + 5 x 25-hydroxy vitamin D3 where known"),
    "vitaminE": ("1.5 Vitamins", ["VITE"], "Alpha-tocopherol equivalents"),
    "vitaminK": ("1.5 Vitamins", ["VITK1"], "Phylloquinone (vitamin K1) only"),
    "vitaminC": ("1.5 Vitamins", ["VITC"], ""),
    "thiamin": ("1.5 Vitamins", ["THIA"], ""),
    "riboflavin": ("1.5 Vitamins", ["RIBO"], ""),
    "niacinPreformed": ("1.5 Vitamins", ["NIAC"], ""),
    "niacinNE": ("1.5 Vitamins", ["NIACEQU"], "Niacin equivalents as published by CoFID (niacin + tryptophan/60)"),
    "pantothenic": ("1.5 Vitamins", ["PANTO"], "As calcium D-pantothenate"),
    "vitaminB6": ("1.5 Vitamins", ["VITB6"], ""),
    "folate": ("1.5 Vitamins", ["FOLT"], "Total folate (not dietary folate equivalents)"),
    "vitaminB12": ("1.5 Vitamins", ["VITB12"], ""),
    "la": ("1.12 (PUFA per 100gFood)", ["FOD18:2cn6"], "cis n-6 C18:2 per 100 g food"),
    "ala": ("1.12 (PUFA per 100gFood)", ["FOD18:3cn3"], "cis n-3 C18:3 per 100 g food"),
    "epa": ("1.12 (PUFA per 100gFood)", ["FOD20:5cn3", "FOD20:5"], "cis n-3 C20:5 per 100 g food; where CoFID gives only total C20:5, that value is used and labelled"),
    "dha": ("1.12 (PUFA per 100gFood)", ["FOD22:6cn3", "FOD22:6"], "cis n-3 C22:6 per 100 g food; where CoFID gives only total C22:6, that value is used and labelled"),
}
FALLBACK_TEXT = {"FOD20:5": "total C20:5 (isomers not separated)", "FOD22:6": "total C22:6 (isomers not separated)"}

# CoFID food group code (column D) -> planner category. Groups not listed (dishes, cakes, biscuits,
# desserts, drinks, sweets, snacks, soups, sauces) are left out.
GROUP_CATEGORY = {
    "AA": "grains", "AC": "grains", "AD": "grains", "AF": "grains", "AG": "grains", "AT": "grains",
    "AI": "cereals",
    "BA": "dairy", "BAB": "dairy", "BAE": "dairy", "BAH": "dairy", "BAK": "dairy", "BC": "dairy",
    "BJC": "dairy", "BL": "dairy", "BN": "dairy", "BNE": "dairy", "BNH": "dairy", "CA": "dairy",
    "DA": "veg", "DAE": "veg", "DAM": "veg", "DB": "pulses", "DF": "veg", "DG": "veg", "DI": "veg",
    "F": "fruit", "FA": "fruit",
    "G": "nuts", "GA": "nuts", "H": "herbs",
    "JA": "fish", "JC": "fish", "JK": "fish", "JM": "fish",
    "MAA": "meat", "MAC": "meat", "MAE": "meat", "MAG": "meat", "MAI": "meat", "MCA": "meat", "MCC": "meat",
    "MCE": "meat", "MCO": "meat", "MEC": "meat", "MEE": "meat",  # MG (offal) left out, as for USDA foods
    "OA": "oils", "OB": "oils", "OC": "oils", "OF": "oils",
}
# Left out whatever the group (lower case substrings).
EXCLUDE_ANY = ("weighed", "filled", "pastry", "homemade", "takeaway", "infant", "children's", "human", "coated", "batter",
               "burger", "fried", "stuffed", "chips", "sandwich", "pizza", "with sauce", "in sauce", "curry",
               "cream substitute")
# Plant drinks sit in dairy groups in CoFID; they get their own planner category.
PLANT_DRINK = re.compile(r"non-dairy alternative to milk", re.I)
# Pulses that CoFID files under vegetables.
PULSE_WORDS = re.compile(r"\b(beans?|lentils?|chick ?peas|soya|tofu|tempeh|houmous|peas, dried|split peas)\b", re.I)
GREEN_BEANS = re.compile(r"\b(green beans|runner beans|broad beans, fresh|beansprouts)\b", re.I)


# Foods outside the basic foods (Food Finder only): CoFID group code prefix -> category. Longest prefix wins.
MORE_PREFIX = {
    "A": "grains", "AB": "dishes", "AE": "dishes", "AM": "sweets", "AN": "sweets", "AO": "sweets", "AS": "sweets",
    "B": "dairy", "BP": "sweets", "BR": "sweets", "BV": "dishes", "BH": "beverages", "BAR": "beverages", "BTM": "oils",
    "C": "dairy", "CDH": "sweets", "D": "veg", "DR": "dishes", "F": "fruit", "FC": "beverages", "G": "nuts",
    "H": "herbs", "J": "fish", "M": "meat", "MR": "dishes", "MIG": "dishes", "O": "oils", "P": "beverages",
    "Q": "beverages", "S": "sweets", "W": "dishes", "WY": "other",
}


def more_category(f: dict) -> str:
    g = f["group"]
    for n in range(len(g), 0, -1):
        if g[:n] in MORE_PREFIX:
            return MORE_PREFIX[g[:n]]
    return GROUP_CATEGORY.get(g, "other")


def cell_text(v) -> str | None:
    return v.strip() if isinstance(v, str) else (None if v is None else str(v))


def load(path: Path):
    book = xlsx_min.read(path)
    foods: dict[str, dict] = {}
    for sheet in {s for s, _, _ in MAP.values()} | {"1.3 Proximates"}:
        rows = book[sheet]
        codes = rows[1]
        for row in rows[3:]:
            if not row or not (row[0] or "").strip():
                continue
            code, name = row[0].strip(), (row[1] or "").strip()
            f = foods.setdefault(f"{code}|{name}", {"code": code, "name": name, "group": (row[3] or "").strip(),
                                                   "ref": ((row[5] if len(row) > 5 else None) or "").strip(), "cells": {}})
            for comp in codes:
                if comp:
                    i = codes.index(comp)
                    f["cells"][comp] = cell_text(row[i]) if i < len(row) else None
    return foods


def values_for(f: dict):
    """(values, labels): values are numbers only; labels say what CoFID gave where it isn't a plain value."""
    vals, labels = {}, {}
    for key, (_sheet, comps, _note) in MAP.items():
        for n, comp in enumerate(comps):
            cell = f["cells"].get(comp)
            if cell is not None and NUMBER.match(cell):
                vals[key] = float(cell)
                if n > 0:
                    labels[key] = FALLBACK_TEXT.get(comp, comp)
                break
            if cell in CODE_TEXT and n == 0:
                labels[key] = CODE_TEXT[cell]
    if "sodium" in vals:
        vals["salt"] = vals["sodium"] * 2.5 / 1000
    if "epa" in vals and "dha" in vals:
        vals["epaDha"] = (vals["epa"] + vals["dha"]) * 1000
    return vals, labels


# British animal-fat names, and meat words, not caught by the shared MEAT_WORDS list (which has "meat," only).
ANIMAL_FATS = re.compile(r"\bdripping\b|^suet, shredded|\bmeat\b|\bfilling\b", re.I)

# Plant foods whose names contain an animal word (for the vegetarian/vegan tag only).
PLANT_NAMES = re.compile(r"beans?, butter|butter ?beans?|butternut|coconut milk|cocoa butter|peanut butter|egg ?plant", re.I)


def diet_of(cat: str, name: str) -> str:
    if PLANT_DRINK.search(name):
        return "vegan"
    if re.search(r"fat spread", name, re.I):
        return "vegetarian"  # recipes vary and many contain milk derivatives: not tagged vegan without evidence
    return auto_foods.diet_for(cat, PLANT_NAMES.sub("", name))


def category_of(f: dict) -> str | None:
    name = f["name"]
    if PLANT_DRINK.search(name):
        return "drinks"
    cat = GROUP_CATEGORY.get(f["group"])
    if cat is None or any(w in name.lower() for w in EXCLUDE_ANY) or auto_foods.EXCLUDE_WORDS.search(name):
        return None  # EXCLUDE_WORDS: "salted" (not "unsalted"), shared with the USDA rules
    # As for USDA foods: no meat or fish words outside the meat and fish categories, so vegetarian
    # categories stay free of animal fats (lard, dripping, cod liver oil, beef suet).
    if cat not in auto_foods.MEAT_CATS and (any(w in name.lower() for w in auto_foods.MEAT_WORDS) or ANIMAL_FATS.search(name)):
        return None
    if cat in auto_foods.MEAT_CATS and re.search(r"\braw\b", name, re.I) and not re.search(r"smoked|cured", name, re.I):
        return None  # as for USDA foods: meat and fish as eaten, not raw
    if cat == "veg" and PULSE_WORDS.search(name) and not GREEN_BEANS.search(name):
        return "pulses"
    return cat


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", required=True, help="the CoFID 2021 .xlsx file")
    args = ap.parse_args()

    usda = json.loads((TOOL / "data/foods/foods.json").read_text())
    keys = usda["keys"]
    planner = {f["id"]: f for f in usda["foods"] if f["common"]}
    xwalk = json.loads((PIPELINE / "crosswalk/crosswalk.json").read_text())["cofid"]
    foods = load(Path(args.table))

    out, used = [], set()
    pack = lambda vals: [round(vals[k], 6) if k in vals else None for k in keys]  # noqa: E731
    rows = []
    for e in xwalk:  # common foods: the planner's own foods, using the CoFID record that is that food
        if not e.get("sameFood"):
            continue
        f = foods[f"{e['code']}|{e['name']}"]
        used.add(f"{e['code']}|{e['name']}")
        p = planner[e["food"]]
        vals, labels = values_for(f)
        out.append({k: p[k] for k in ("id", "name", "cat", "group", "label", "diet", "unit", "unitGrams", "step",
                                      "maxGrams", "notes", "noteRef", "capGroup")}
                   | {"common": True, "src": {"table": TABLE, "code": f["code"], "name": f["name"], "ref": f["ref"]},
                      "srcName": f["name"], "q": labels or None, "v": pack(vals)})
        rows.append(f"| {p['name']} | {f['code']} {f['name']} | {e['verdict']} |")

    seen_ids, more = set(), []
    for key, f in sorted(foods.items(), key=lambda kv: (kv[1]["code"], kv[1]["name"])):
        if key in used:
            continue
        # Permanent id: cofid:<code>; CoFID reuses a few codes, so later records get :2, :3.
        fid, n = f"cofid:{f['code']}", 1
        while fid in seen_ids:
            n += 1
            fid = f"cofid:{f['code']}:{n}"
        seen_ids.add(fid)
        cat = category_of(f)
        vals, labels = values_for(f)
        if cat is None or "energy" not in vals:
            # Not a basic food (or no energy value, so it can't be planned with): Food Finder only.
            if not vals:
                continue
            mcat = more_category(f)
            group, variant = auto_foods.group_and_variant(f["name"])
            more.append({"id": fid, "name": f["name"], "cat": mcat, "group": group, "label": variant or f["name"],
                         "diet": "meat" if mcat in auto_foods.MEAT_CATS else "unknown", "unit": "g", "unitGrams": 1,
                         "step": 10, "maxGrams": 1000, "notes": None, "noteRef": None, "capGroup": None,
                         "common": False, "basic": False,
                         "src": {"table": TABLE, "code": f["code"], "name": f["name"], "ref": f["ref"]},
                         "srcName": f["name"], "q": labels or None, "v": pack(vals)})
            continue
        group, variant = auto_foods.group_and_variant(f["name"])
        step, max_g = auto_foods.amounts_for(cat, f["name"])
        out.append({"id": fid, "name": f["name"], "cat": cat, "group": group, "label": variant or f["name"],
                    "diet": diet_of(cat, f["name"]), "unit": "g", "unitGrams": 1, "step": step,
                    "maxGrams": max_g, "notes": None, "noteRef": None, "capGroup": auto_foods.cap_group(cat, f["name"]),
                    "common": False, "src": {"table": TABLE, "code": f["code"], "name": f["name"], "ref": f["ref"]},
                    "srcName": f["name"], "q": labels or None, "v": pack(vals)})

    meta_nutrients = usda["nutrients"]
    doc = {"generated": dt.date.today().isoformat(), "table": TABLE, "source": TITLE,
           "files": {"table": Path(args.table).name},
           "definitions": {k: m[2] for k, m in MAP.items() if m[2]},
           "nutrients": meta_nutrients, "keys": keys, "categories": usda["categories"], "foods": out}
    (TOOL / "data/foods/foods-cofid.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    more_doc = {k: doc[k] for k in ("generated", "table", "source", "files", "keys")} | {
        "categories": [{"id": c, "name": n} for c, n in auto_foods.CATEGORIES], "foods": more}
    (TOOL / "data/foods/foods-cofid-more.json").write_text(json.dumps(more_doc, ensure_ascii=False, separators=(",", ":")))

    counts = {k: sum(1 for f in out if f["v"][keys.index(k)] is not None) for k in keys}
    lines = [f"# {TITLE}: food file report ({doc['generated']})", "",
             "Generated by `pipeline/tables/cofid.py`. Values are CoFID's only; anything CoFID doesn't give is NA.", "",
             f"Basic foods (the Planner's list): {len(out)} ({sum(f['common'] for f in out)} common, {sum(not f['common'] for f in out)} others).",
             f"Other foods (Food Finder only, `foods-cofid-more.json`): {len(more)}. Records with no values at all are left out.", "",
             "## Common foods and their CoFID records", "", "| Planner food | CoFID record | Crosswalk verdict |",
             "|---|---|---|", *rows, "",
             "Common foods with no CoFID record (missing in this table): " + ", ".join(
                 planner[e["food"]]["name"] for e in xwalk if not e.get("sameFood")) + ".", "",
             "## Foods with a value, per nutrient", "", "| Nutrient | Foods with a value | CoFID definition |", "|---|---|---|"]
    for k in keys:
        lines.append(f"| {k} | {counts[k]} | {MAP[k][2] if k in MAP else ('derived' if k in ('salt', 'epaDha') else 'not in CoFID')} |")
    (TOOL / "data/foods/cofid_report.md").write_text("\n".join(lines) + "\n")
    print(f"foods-cofid.json: {len(out)} foods; foods-cofid-more.json: {len(more)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
