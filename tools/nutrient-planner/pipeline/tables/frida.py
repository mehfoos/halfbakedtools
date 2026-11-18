"""Denmark: Frida 5.5 (DTU National Food Institute, November 2025) -> foods-frida.json, foods-frida-more.json.

Reads the archived dataset (fetch.py), sheet "Data_Normalised" (one row per food and parameter) with "Food" (names,
groups) and "Source". Each value is Frida's own. A value whose source Frida describes as an estimate or a recipe
calculation is labelled with Frida's own description. A parameter with no row is missing (NA). Amino acids are
converted from mg to g. Definitions: the Frida 5.5 documentation (archived) and the "Parameter" sheet.

  python3 -I tools/nutrient-planner/pipeline/tables/frida.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent / "crosswalk")]
import common  # noqa: E402
import fetch  # noqa: E402
import xlsx_min  # noqa: E402

TABLE, TITLE = "frida", "Denmark Frida 5.5 (DTU, 2025)"
DATA = "frida55_Frida_5.5_Dataset.xlsx"
AA = 0.001  # mg -> g
MAP = {
    "energy": ("359", 1, "Energy for labelling: EU Regulation 1169/2011 factors"),
    "protein": ("218", 1, "Total nitrogen x food-specific factor"),
    "fat": ("141", 1, ""), "satfat": ("248", 1, ""),
    "carbohydrate": ("172", 1, "Available carbohydrate (not by difference; excludes fibre)"),
    "fibre": ("168", 1, "Dietary fibre"), "sugars": ("245", 1, ""),
    "calcium": ("108", 1, ""), "iron": ("162", 1, ""), "magnesium": ("184", 1, ""), "phosphorus": ("214", 1, ""),
    "potassium": ("165", 1, ""), "sodium": ("201", 1, ""), "zinc": ("274", 1, ""), "copper": ("166", 1, ""),
    "manganese": ("187", 1, ""), "selenium": ("230", 1, ""), "iodine": ("163", 1, ""),
    "vitaminA": ("12", 1, "Retinol equivalents (the UK and EU definition; US targets use retinol activity equivalents)"),
    "retinol": ("225", 1, ""),
    "vitaminD": ("126", 1, "Total vitamin D as Frida gives it (may include 25-hydroxy vitamin D for animal foods)"),
    "vitaminD2": ("127", 1, ""), "vitaminD3": ("128", 1, ""),
    "vitaminE": ("276", 1, "Alpha-tocopherol"), "vitaminK": ("164", 1, "Phylloquinone (vitamin K1) only"),
    "vitaminC": ("47", 1, ""), "thiamin": ("37", 1, ""), "riboflavin": ("39", 1, ""),
    "niacinPreformed": ("294", 1, ""), "niacinNE": ("203", 1, "Niacin equivalents as published by Frida"),
    "pantothenic": ("210", 1, ""), "vitaminB6": ("40", 1, ""),
    "folate": ("143", 1, "Total folate (not dietary folate equivalents)"), "vitaminB12": ("38", 1, ""),
    "choline": ("116", 1, ""),
    "la": ("71", 1, "C18:2 n-6"), "ala": ("74", 1, "C18:3 n-3"), "epa": ("87", 1, "C20:5 n-3"), "dha": ("99", 1, "C22:6 n-3"),
    "histidine": ("159", AA, ""), "isoleucine": ("161", AA, ""), "leucine": ("180", AA, ""), "lysine": ("183", AA, ""),
    "methionine": ("189", AA, ""), "cystine": ("124", AA, ""), "phenylalanine": ("211", AA, ""), "tyrosine": ("264", AA, ""),
    "threonine": ("258", AA, ""), "tryptophan": ("262", AA, ""), "valine": ("266", AA, ""),
}
# Frida sources that are estimates or calculations (Source sheet), labelled with Frida's own words.
ESTIMATE_SOURCES = {"1001", "1002", "1004", "1005", "1933"}
GROUP = {  # Frida FoodGroupID -> category
    **{g: "dairy" for g in (4, 5, 8, 12, 13, 14, 15, 16, 17, 87, 88, 89, 90, 215)},
    6: "baby", 135: "baby", 21: "sweets", 23: "sweets", 199: "sweets", 32: "sweets", 33: "sweets",
    101: "sweets", 102: "sweets", 103: "sweets", 104: "sweets", 182: "sweets", 185: "sweets", 143: "sweets",
    28: "grains", 30: "grains", 31: "grains", 35: "grains", 36: "other", 34: "cereals",
    39: "veg", 40: "veg", 41: "veg", 43: "veg", 46: "veg", 187: "veg", 188: "veg", 192: "veg", 44: "herbs",
    45: "beverages", 54: "beverages", 186: "beverages", 106: "beverages", 107: "beverages", 111: "beverages",
    112: "beverages", 113: "beverages", 114: "beverages", 115: "beverages", 116: "beverages", 117: "beverages", 194: "beverages",
    49: "fruit", 50: "fruit", 51: "fruit", 52: "fruit", 55: "fruit", 184: "fruit", 193: "fruit",
    53: "nuts", 177: "nuts", 178: "nuts", 189: "nuts",
    **{g: "meat" for g in (57, 58, 59, 60, 61, 63, 64, 65, 66, 69, 81, 82, 83, 84)},
    **{g: "fish" for g in (70, 72, 73, 76, 77, 78, 79, 183)},
    93: "oils", 94: "oils", 95: "oils", 96: "oils", 97: "dishes", 98: "dishes", 130: "dishes", 200: "dishes",
    120: "herbs", 121: "herbs", 122: "other", 124: "dishes", 125: "herbs", 181: "dishes", 133: "dishes",
    127: "dishes", 128: "dishes", 131: "dishes", 132: "sweets", 179: "dishes", 180: "dishes",
    168: "drinks", 169: "dishes", 171: "pulses", 172: "pulses", 173: "pulses", 174: "pulses", 175: "pulses", 191: "pulses",
}
NOT_BASIC = {64, 65, 66, 69, 78, 79, 93, 97, 98, 122, 168, 169}   # cured meats and cold cuts, offal, fish products, ...


def main() -> int:
    book = xlsx_min.read(fetch.get(DATA))
    sources = {r[0]: r[6] for r in book["Source"][1:] if r and r[0] in ESTIMATE_SOURCES}
    labels_text = {f"s{k}": f"Frida: {v.strip()}" for k, v in sources.items()}
    foods = {}
    for r in book["Food"][1:]:
        if r and r[2]:
            foods[r[2]] = {"name": (r[1] or r[0]).strip(), "da": (r[0] or "").strip(), "group": int(r[10] or 0),
                           "vals": {}, "labels": {}}
    want = {m[0]: k for k, m in MAP.items()}
    for r in book["Data_Normalised"][1:]:
        if not r or r[3] not in want or r[0] not in foods:
            continue
        key, f = want[r[3]], foods[r[0]]
        v = common.num(r[7])
        if v is None:
            continue
        f["vals"][key] = v * MAP[key][1]
        est = [x.strip() for x in str(r[12] or "").split(",") if x.strip() in sources]   # a value may cite several sources
        if est:
            f["labels"][key] = f"s{est[0]}"
    seen, out_basic, out_more = set(), [], []
    for code, f in sorted(foods.items(), key=lambda kv: int(kv[0])):
        vals, name = f["vals"], f["name"]
        if not vals:
            continue
        vals |= common.derive(vals, table_gives_ne=True)
        cat = GROUP.get(f["group"], "other")
        bcat = None
        if "energy" in vals and f["group"] not in NOT_BASIC:
            bcat = common.basic_category(cat, name)
        fid = common.unique_id(TABLE, code, seen)
        e = common.entry(TABLE, fid, code, name, bcat or cat, vals, f["labels"], basic=bool(bcat), extra={"nameDa": f["da"]})
        (out_basic if bcat else out_more).append(e)
    common.write(TABLE, TITLE, {"data": DATA}, {k: m[2] for k, m in MAP.items() if m[2]}, out_basic, out_more,
                 ["Values whose source Frida describes as an estimate or a recipe calculation are labelled with Frida's words."],
                 labels_text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
