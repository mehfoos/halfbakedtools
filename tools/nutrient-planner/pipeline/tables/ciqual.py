"""France: Ciqual 2025 (ANSES) -> foods-ciqual.json, foods-ciqual-more.json.

Reads the archived XML files (fetch.py; the release zip holds alim, alim_grp, compo, const and sources as published).
Each value is Ciqual's own. "-" is missing (NA); "traces" and "< x" (below a limit) are missing with that label.
A value with confidence code D (Ciqual's least reliable grade) is labelled. Definitions: the Ciqual 2025
documentation (archived, French) and the component names in const_2025_11_03.xml.

  python3 -I tools/nutrient-planner/pipeline/tables/ciqual.py
"""
from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE)]
import common  # noqa: E402
import fetch  # noqa: E402

TABLE, TITLE = "ciqual", "France Ciqual 2025 (ANSES)"
ZIP = "ciqual2025_XML_2025_11_03.zip"
MAP = {
    "energy": ("328", 1, "EU Regulation 1169/2011 factors: protein (as N x 6.25) 4, carbohydrate 4, fat 9, fibre 2, alcohol 7, organic acids 3, polyols 2.4 kcal/g; unknown polyols and organic acids counted as 0 (documentation 3.3.6)"),
    "protein": ("25000", 1, "Total nitrogen x Jones' food-specific factor"),
    "fat": ("40000", 1, ""), "satfat": ("40302", 1, ""),
    "carbohydrate": ("31000", 1, "Carbohydrate including polyols and excluding fibre; by difference, as starch + sugars, or as total carbohydrate minus fibre, depending on the food (documentation 3.3.2)"),
    "fibre": ("34100", 1, "Dietary fibre, AOAC methods"), "sugars": ("32000", 1, ""),
    "calcium": ("10200", 1, ""), "iron": ("10260", 1, ""), "magnesium": ("10120", 1, ""), "phosphorus": ("10150", 1, ""),
    "potassium": ("10190", 1, ""), "sodium": ("10110", 1, ""), "zinc": ("10300", 1, ""), "copper": ("10290", 1, ""),
    "manganese": ("10251", 1, ""), "selenium": ("10340", 1, ""), "iodine": ("10530", 1, ""),
    "vitaminA": ("51104", 1, "Retinol + beta-carotene / 12 (IOM 2001 factors, documentation 3.3.7; other carotenoids not counted): retinol activity equivalents, the US definition, not the UK and EU retinol equivalents (beta-carotene / 6)"),
    "retinol": ("51200", 1, ""), "vitaminD": ("52100", 1, ""), "vitaminD2": ("52200", 1, ""), "vitaminD3": ("52300", 1, ""),
    "vitaminE": ("71010", 1, "Alpha-tocopherol"), "vitaminK": ("54101", 1, "Phylloquinone (vitamin K1) only"),
    "vitaminC": ("55100", 1, ""), "thiamin": ("56100", 1, ""), "riboflavin": ("56200", 1, ""),
    "niacinPreformed": ("56310", 1, ""), "pantothenic": ("56400", 1, ""), "vitaminB6": ("56500", 1, ""),
    "folate": ("56700", 1, "Vitamin B9 as Ciqual gives it (documentation 3.3.9): total folate without a stated breakdown (code 56700), or, where Ciqual gives that instead, dietary folate equivalents (code 56702: food folate + 1.7 x folic acid), labelled \"dfe\""), "vitaminB12": ("56600", 1, ""),
    "la": ("41826", 1, "C18:2 9c,12c (n-6)"), "ala": ("41833", 1, "C18:3 c9,c12,c15 (n-3)"),
    "epa": ("42053", 1, "C20:5 n-3"), "dha": ("42263", 1, "C22:6 n-3"),
}
LABELS = {"trace": "trace", "D": "Ciqual confidence code D (its least reliable grade)",
          "dfe": "Ciqual: dietary folate equivalents (food folate + 1.7 x folic acid), not total folate"}
FOLATE_DFE = "56702"   # Ciqual gives B9 either as 56700 (total, unspecified) or as 56702 (DFE), never both (checked 20 Nov 2026)
SUB = {  # Ciqual sub-group -> category
    "0201": "veg", "0202": "veg", "0203": "pulses", "0204": "fruit", "0205": "nuts",
    "0301": "grains", "0302": "grains", "0304": "grains", "0303": "sweets", "0305": "sweets",
    "0401": "meat", "0402": "meat", "0403": "meat", "0404": "meat", "0405": "fish", "0406": "fish", "0407": "fish",
    "0408": "fish", "0409": "fish", "0410": "dairy", "0411": "dishes",
    "0501": "dairy", "0502": "dairy", "0503": "dairy", "0504": "dairy",
    "0601": "beverages", "0602": "beverages", "0603": "beverages",
    "0707": "cereals", "0901": "oils", "0902": "oils", "0903": "oils", "0904": "oils", "0905": "oils",
    "1004": "herbs", "1005": "herbs", "1006": "herbs", "1007": "veg",
}
NOT_BASIC_SUB = {"0403", "0404", "0409", "0411", "0905", "0303", "0305"}


def text(el, tag):
    return (el.findtext(tag) or "").strip()


def main() -> int:
    z = zipfile.ZipFile(fetch.get(ZIP))
    names = {n.split("_", 1)[0] if not n.startswith("alim_grp") else "alim_grp": n for n in z.namelist()}
    foods = {}
    for el in ET.parse(z.open(names["alim"])).getroot():
        foods[text(el, "alim_code")] = {"name": text(el, "alim_nom_eng") or text(el, "alim_nom_fr"),
                                        "fr": text(el, "alim_nom_fr"), "sub": text(el, "alim_ssgrp_code"),
                                        "grp": text(el, "alim_grp_code"), "vals": {}, "labels": {}}
    want = {m[0]: k for k, m in MAP.items()}
    dfe = {}
    for _ev, el in ET.iterparse(z.open(names["compo"])):
        if el.tag != "COMPO":
            continue
        if text(el, "const_code") == FOLATE_DFE:
            v = common.num(text(el, "teneur"))
            if v is not None:
                dfe[text(el, "alim_code")] = v
            el.clear()
            continue
        key = want.get(text(el, "const_code"))
        f = foods.get(text(el, "alim_code"))
        if key and f:
            t = text(el, "teneur")
            v = common.num(t)
            if v is not None:
                f["vals"][key] = v * MAP[key][1]
                if text(el, "code_confiance") == "D":
                    f["labels"][key] = "D"
            elif t == "traces":
                f["labels"][key] = "trace"
            elif t.startswith("<"):
                f["labels"][key] = t.replace(",", ".")
        el.clear()
    n_dfe = 0
    for code, v in dfe.items():
        f = foods.get(code)
        if f is None:
            continue
        if "folate" in f["vals"]:
            raise SystemExit(f"Ciqual {code}: both total folate and DFE are given; the rule above assumes they never are")
        f["vals"]["folate"], n_dfe = v, n_dfe + 1
        f["labels"]["folate"] = "dfe"
    seen, out_basic, out_more = set(), [], []
    for code, f in sorted(foods.items(), key=lambda kv: int(kv[0])):
        vals, name = f["vals"], f["name"]
        if not vals:
            continue
        vals |= common.derive(vals)
        cat = SUB.get(f["sub"]) or {"01": "dishes", "07": "sweets", "08": "sweets", "10": "other", "11": "baby"}.get(f["grp"], "other")
        if f["sub"] == "0410" and not re.search(r"\begg", name, re.I):
            cat = "dishes"
        bcat = None
        if "energy" in vals and f["sub"] not in NOT_BASIC_SUB:
            bcat = common.basic_category(cat, name)
        fid = common.unique_id(TABLE, code, seen)
        e = common.entry(TABLE, fid, code, name, bcat or cat, vals, f["labels"], basic=bool(bcat), extra={"nameFr": f["fr"]})
        (out_basic if bcat else out_more).append(e)
    common.write(TABLE, TITLE, {"data": ZIP}, {k: m[2] for k, m in MAP.items() if m[2]}, out_basic, out_more,
                 ["Ciqual 2025 gives no amino acids or choline, and niacin only as preformed niacin; those are NA.",
                  "Values below a limit (\"< x\") and traces are NA with the table's own wording as a label.",
                  f"Folate: {n_dfe} foods have B9 only as dietary folate equivalents (code 56702); those values are labelled \"dfe\"."], LABELS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
