"""Canada: Canadian Nutrient File 2026 (Health Canada) -> foods-cnf.json, foods-cnf-more.json.

Reads the archived zip of CSV files (fetch.py): Food_Name, Nutrient_Amount, Nutrient_Name, Nutrient_Source,
Food_Source and CNF_Food_Group. Values are the CNF's own, per 100 g, in the planner's units. CNF is built on USDA
data (many foods carry USDA's values, with some changes or additions for Canada), and it says so per value: each
value's Nutrient_Source_Code is kept as a label where it isn't a plain analysis (unchanged from USDA, imputed,
calculated, recipe, label declaration, assumed zero, another country's table). CNF numbers use USDA's nutrient codes,
so the definitions match USDA's, except where noted in MAP.

  python3 -I tools/nutrient-planner/pipeline/tables/cnf.py
"""
from __future__ import annotations

import csv
import io
import re
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE)]
import common  # noqa: E402
import fetch  # noqa: E402

TABLE, TITLE = "cnf", "Canada CNF 2026 (Health Canada)"
ZIP = "cnf2026_cnf_fcen_all-files-data_2026.zip"
# planner key -> (CNF nutrient code, factor to planner unit, definition where it matters)
MAP = {
    "energy": (208, 1, "Energy in kcal as published by the CNF (Atwater factors, as in the USDA table)"),
    "protein": (203, 1, ""), "fat": (204, 1, ""), "satfat": (606, 1, ""),
    "carbohydrate": (205, 1, "CNF carbohydrate by difference minus total dietary fibre (not below 0), as for USDA; unchanged (so including fibre) where the CNF gives no fibre value"),
    "fibre": (291, 1, "Total dietary fibre"), "sugars": (269, 1, ""),
    "calcium": (301, 1, ""), "iron": (303, 1, ""), "magnesium": (304, 1, ""), "phosphorus": (305, 1, ""),
    "potassium": (306, 1, ""), "sodium": (307, 1, ""), "zinc": (309, 1, ""), "copper": (312, 1, ""),
    "manganese": (315, 1, ""), "selenium": (317, 1, ""),
    "vitaminA": (320, 1, "Retinol activity equivalents (RAE), as in the USDA table"),
    "retinol": (319, 1, ""), "vitaminD": (328, 1, "Ergocalciferol + cholecalciferol"),
    "vitaminD2": (325, 1, ""), "vitaminD3": (326, 1, ""),
    "vitaminE": (323, 1, "Alpha-tocopherol"), "vitaminK": (430, 1, "Phylloquinone (vitamin K1) only"),
    "vitaminC": (401, 1, ""), "thiamin": (404, 1, ""), "riboflavin": (405, 1, ""),
    "niacinPreformed": (406, 1, ""), "pantothenic": (410, 1, ""), "vitaminB6": (415, 1, ""),
    "folate": (435, 1, "Dietary folate equivalents (the US and EU definition; UK targets use total folate)"),
    "vitaminB12": (418, 1, ""), "choline": (421, 1, "Total choline"),
    "ala": (851, 1, "C18:3 c,c,c n-3"), "la": (675, 1, "C18:2 c,c n-6"),
    "epa": (629, 1, "C20:5 n-3"), "dha": (621, 1, "C22:6 n-3"),
    "histidine": (512, 1, ""), "isoleucine": (503, 1, ""), "leucine": (504, 1, ""), "lysine": (505, 1, ""),
    "methionine": (506, 1, ""), "cystine": (507, 1, ""), "phenylalanine": (508, 1, ""), "tyrosine": (509, 1, ""),
    "threonine": (502, 1, ""), "tryptophan": (501, 1, ""), "valine": (510, 1, ""),
}
NE_CODE = 409  # total niacin equivalents, as published
# Nutrient_Source_Code -> label key (None = a plain analysis or a documented analysis: no label)
SRC_LABEL = {0: "u", 1: "r", 2: "c", 3: None, 4: "cu", 5: "i", 6: "m", 7: None, 8: "n", 9: "l", 10: "lit", 12: "z",
             14: "p", 15: "i2", 16: "c", 17: "c", 50: "lit", 51: "rec", 81: "x", 82: "x", 83: "x"}
LABELS = {
    "u": "CNF: no change from the USDA value",
    "r": "CNF: USDA value changed to meet Canadian regulations",
    "c": "CNF: calculated (from data other than USDA's, or a calculated field)",
    "cu": "CNF: calculated from USDA data",
    "i": "CNF: imputed from a similar USDA food",
    "i2": "CNF: imputed from data other than USDA's",
    "m": "CNF: from a Canadian manufacturer, documentation incomplete",
    "n": "CNF: value created for the Nutrition Canada Survey (1970-1972)",
    "l": "CNF: from the product's label declaration",
    "lit": "CNF: derived from the scientific literature",
    "z": "CNF: an assumed zero (not a measurement)",
    "zx": "CNF: given as an amount but coded as an assumed zero; the two contradict each other, so the value is not used (NA)",
    "p": "CNF: provisional data",
    "rec": "CNF: calculated using a recipe",
    "x": "CNF: from another country's table (Danish, Finnish or other international database)",
}
GROUP = {"1": "dairy", "2": "herbs", "3": "baby", "4": "oils", "5": "meat", "6": "dishes", "7": "meat", "8": "cereals",
         "9": "fruit", "10": "meat", "11": "veg", "12": "nuts", "13": "meat", "14": "beverages", "15": "fish",
         "16": "pulses", "17": "meat", "18": "grains", "19": "sweets", "20": "grains", "21": "dishes", "22": "dishes",
         "25": "sweets"}
NOT_BASIC_GROUP = {"3", "6", "7", "19", "21", "22", "25"}  # babyfoods, soups and sauces, luncheon meats, sweets, fast food, mixed dishes, snacks
BAKED_KEEP = re.compile(r"\b(bread|bagel|pita|pitta|tortilla|rolls?|naan|chapati|roti|flatbread|crispbread|matzo|english muffin)\b", re.I)
PLANT_DRINK = re.compile(r"\b(soy|soya|almond|rice|oat|coconut|hemp|cashew)\b.*\b(milk|beverage|drink)\b", re.I)
# Kept out of the basic foods whatever the group: salted preparations, sauces, branded product lines (CNF writes them
# "<food>: <product line>, <brand>") and the meat cuts the USDA rules leave out (fat, skin, offal and the like).
NOT_BASIC_NAME = re.compile(r"\bwith salt\b|\bsauce\b|:|dressing|whitener|au gratin|dry mix|dehydrated|gizzard|mayonnaise|hash brown", re.I)


def rows(z, name):
    return list(csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig")))


def main() -> int:
    z = zipfile.ZipFile(fetch.get(ZIP))
    names = {n.lower(): n for n in z.namelist() if n.lower().endswith(".csv")}
    group_names = {r["CNF_Food_Group_Code"]: r["CNF_Food_Group_Description_EN"] for r in rows(z, names["cnf_food_group.csv"])}
    nutrient_codes = {int(r["Nutrient_Code"]): r for r in rows(z, names["nutrient_name.csv"])}
    want = {m[0]: k for k, m in MAP.items()} | {NE_CODE: "niacinNE"}
    missing = [c for c in want if c not in nutrient_codes]
    if missing:
        raise SystemExit(f"CNF file lacks nutrient codes: {missing}")
    unit_ok = {"Gram": "g", "Milligram": "mg", "Microgram": "µg", "kilocalorie": "kcal", "Niacin Equivalents": "mg"}
    for c, k in want.items():
        got = unit_ok.get(nutrient_codes[c]["Nutrient_Unit"])
        if got != common.UNIT[k]:
            raise SystemExit(f"CNF nutrient {c} ({k}): unit {nutrient_codes[c]['Nutrient_Unit']!r} is not the planner's {common.UNIT[k]}")
    foods = {}
    for r in rows(z, names["food_name.csv"]):
        foods[r["Food_Code"]] = {"name": r["Food_Description_EN"].strip(), "fr": r["Food_Description_FR"].strip(),
                                 "grp": r["CNF_Food_Group_Code"], "usda": r["USDA_NDB_Code"].strip(),
                                 "sci": r["ScientificName"].strip(), "vals": {}, "labels": {}}
    for r in rows(z, names["nutrient_amount.csv"]):
        key = want.get(int(r["Nutrient_Code"]))
        f = foods.get(r["Food_Code"])
        v = common.num(r["Nutrient_Amount"])
        if key and f and v is not None:
            lab = SRC_LABEL.get(int(r["Nutrient_Source_Code"] or -1))
            if lab == "z" and v != 0:
                # 82 values in the 2026 file are coded "assumed zero" but given as an amount: they contradict
                # themselves, so neither the amount nor a zero is used (checked 20 Nov 2026).
                f["labels"][key] = "zx"
                continue
            f["vals"][key] = v
            if lab:
                f["labels"][key] = lab
    seen, out_basic, out_more = set(), [], []
    n_zero = n_zx = 0
    for code, f in sorted(foods.items(), key=lambda kv: int(kv[0])):
        vals, name = f["vals"], f["name"]
        if not vals:
            continue
        if "carbohydrate" in vals and "fibre" in vals:
            vals["carbohydrate"] = max(0.0, vals["carbohydrate"] - vals["fibre"])
        vals |= common.derive(vals, table_gives_ne="niacinNE" in vals)
        n_zero += sum(1 for l in f["labels"].values() if l == "z")
        n_zx += sum(1 for l in f["labels"].values() if l == "zx")
        cat = GROUP.get(f["grp"], "other")
        if f["grp"] == "9" and re.search(r"juice|nectar", name, re.I):
            cat = "beverages"
        if f["grp"] == "14" and PLANT_DRINK.search(name):
            cat = "drinks"
        bcat = None
        if "energy" in vals and f["grp"] not in NOT_BASIC_GROUP and not (f["grp"] == "18" and not BAKED_KEEP.search(name)):
            bcat = common.basic_category(cat, name)
            if bcat and (NOT_BASIC_NAME.search(name) or (bcat in common.auto_foods.MEAT_CATS and any(
                    w in name.lower() for w in common.auto_foods.MEAT_EXCLUDE if w != "raw"))):
                bcat = None
        fid = common.unique_id(TABLE, code, seen)
        extra = {"nameFr": f["fr"], "group": group_names.get(f["grp"], "")}
        if f["usda"]:
            extra["usdaNdb"] = f["usda"]
        if f["sci"]:
            extra["scientificName"] = f["sci"]
        e = common.entry(TABLE, fid, code, name, bcat or cat, vals, f["labels"], basic=bool(bcat), extra=extra)
        (out_basic if bcat else out_more).append(e)
    common.write(TABLE, TITLE, {"data": ZIP}, {k: m[2] for k, m in MAP.items() if m[2]} | {"niacinNE": "Total niacin equivalents as published by the CNF"},
                 out_basic, out_more,
                 ["CNF is built on USDA data: values labelled \"no change from the USDA value\" are USDA's, so the CNF and the USDA table "
                  "are not independent for those foods.",
                  f"{n_zero} values are the CNF's \"assumed zero\" (labelled; they are not measurements). "
                  f"{n_zx} values coded as an assumed zero but given as a non-zero amount are NA (label \"zx\").",
                  "A nutrient the CNF gives no value for is NA; nothing is filled in."], LABELS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
