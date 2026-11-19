"""Australia: Australian Food Composition Database (AFCD) Release 3, December 2025 (FSANZ) -> foods-afcd.json, foods-afcd-more.json.

Reads the archived zip of the Release 3 Excel files (fetch.py): Food Details (names, classification, derivation),
Nutrient profiles (the values, sheet "All solids & liquids per 100 g") and Food group information (group names).
Each value is the AFCD's own, per 100 g, in the planner's units; a blank is missing (NA). The AFCD gives each food one
overall derivation (analysed, recipe, imputed, label data, borrowed, estimated); for any food that isn't "analysed"
every value carries that derivation as its label (the AFCD says individual values can differ from the food's overall
derivation, so the legend says so).

  python3 -I tools/nutrient-planner/pipeline/tables/afcd.py
"""
from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent / "crosswalk")]
import common  # noqa: E402
import fetch  # noqa: E402
import xlsx_min  # noqa: E402

TABLE, TITLE = "afcd", "Australia AFCD Release 3 (FSANZ, 2025)"
ZIP = "afcd3_AFCD_Release_3_December_2025.zip"
FOODS_X, PROFILES_X, GROUPS_X = ("AFCD Release 3 - Food Details.xlsx", "AFCD Release 3 - Nutrient profiles.xlsx",
                                 "AFCD Release 3 - Food group information.xlsx")
KJ = 1 / 4.184
MG = 0.001
# planner key -> (column header, factor, definition where it matters). Headers are matched with blanks collapsed.
MAP = {
    "energy": ("Energy with dietary fibre, equated (kJ)", KJ, "Energy in kcal converted from the AFCD's kJ (4.184 kJ per kcal), with dietary fibre at 8 kJ/g: protein 17, fat 37, available carbohydrate 17 (sugars 16), alcohol 29 kJ/g and so on. These are not the factors of the Australia New Zealand Food Standards Code, Standard 1.2.8"),
    "protein": ("Protein (g)", 1, "Total nitrogen x the food's nitrogen factor"), "fat": ("Fat, total (g)", 1, ""),
    "satfat": ("Total saturated fatty acids, equated (g)", 1, "Sum of the saturated fatty acids"),
    "carbohydrate": ("Available carbohydrate, with sugar alcohols (g)", 1, "Available carbohydrate by weight: sugars + starch + other available carbohydrates + sugar alcohols (not by difference; excludes fibre). For a few foods it comes from the label and may be by difference"),
    "fibre": ("Total dietary fibre (g)", 1, ""), "sugars": ("Total sugars (g)", 1, "Fructose + glucose + sucrose + maltose + lactose + galactose"),
    "calcium": ("Calcium (Ca) (mg)", 1, ""), "iron": ("Iron (Fe) (mg)", 1, ""), "magnesium": ("Magnesium (Mg) (mg)", 1, ""),
    "phosphorus": ("Phosphorus (P) (mg)", 1, ""), "potassium": ("Potassium (K) (mg)", 1, ""), "sodium": ("Sodium (Na) (mg)", 1, ""),
    "zinc": ("Zinc (Zn) (mg)", 1, ""), "copper": ("Copper (Cu) (mg)", 1, ""), "manganese": ("Manganese (Mn) (mg)", 1, ""),
    "selenium": ("Selenium (Se) (ug)", 1, ""), "iodine": ("Iodine (I) (ug)", 1, ""),
    "vitaminA": ("Vitamin A retinol equivalents (ug)", 1, "Retinol equivalents: retinol + beta-carotene/6 + alpha-carotene/12 + cryptoxanthin/12 (the UK and EU definition; US targets use retinol activity equivalents)"),
    "retinol": ("Retinol (preformed vitamin A) (ug)", 1, ""),
    "vitaminD": ("Vitamin D3 equivalents (ug)", 1, "Vitamin D3 equivalents: cholecalciferol + ergocalciferol + 5 x 25-hydroxycholecalciferol + 5 x 25-hydroxyergocalciferol (the other tables count D2 + D3 only)"),
    "vitaminD2": ("Ergocalciferol (D2) (ug)", 1, ""), "vitaminD3": ("Cholecalciferol (D3) (ug)", 1, ""),
    "vitaminE": ("Alpha tocopherol (mg)", 1, "Alpha-tocopherol (isomers not separated)"),
    "vitaminC": ("Vitamin C (mg)", 1, ""), "thiamin": ("Thiamin (B1) (mg)", 1, ""), "riboflavin": ("Riboflavin (B2) (mg)", 1, ""),
    "niacinPreformed": ("Niacin (B3) (mg)", 1, "Pre-formed niacin only"),
    "niacinNE": ("Niacin derived equivalents (mg)", 1, "Niacin equivalents as published: niacin + tryptophan x 0.017"),
    "pantothenic": ("Pantothenic acid (B5) (mg)", 1, ""), "vitaminB6": ("Pyridoxine (B6) (mg)", 1, ""),
    "folate": ("Dietary folate equivalents (ug)", 1, "Dietary folate equivalents: natural folate + 1.67 x folic acid (the US and EU definition; UK targets use total folate)"),
    "vitaminB12": ("Cobalamin (B12) (ug)", 1, ""),
    "la": ("C18:2w6 (g)", 1, "C18:2 n-6"), "ala": ("C18:3w3 (g)", 1, "C18:3 n-3"),
    "epa": ("C20:5w3 (mg)", MG, "C20:5 n-3, converted from mg to g"), "dha": ("C22:6w3 (mg)", MG, "C22:6 n-3, converted from mg to g"),
    "histidine": ("Histidine (mg)", MG, "Amino acids converted from mg to g per 100 g"), "isoleucine": ("Isoleucine (mg)", MG, ""),
    "leucine": ("Leucine (mg)", MG, ""), "lysine": ("Lysine (mg)", MG, ""), "methionine": ("Methionine (mg)", MG, ""),
    "cystine": ("Cystine plus cysteine (mg)", MG, "Cystine and cysteine together (the AFCD does not give them separately)"),
    "phenylalanine": ("Phenylalanine (mg)", MG, ""), "tyrosine": ("Tyrosine (mg)", MG, ""), "threonine": ("Threonine (mg)", MG, ""),
    "tryptophan": ("Tryptophan (mg)", MG, ""), "valine": ("Valine (mg)", MG, ""),
}
LABELS = {
    "rec": "AFCD: the food's overall derivation is a recipe calculation (individual values can differ)",
    "b": "AFCD: the food's overall derivation is borrowed from an international food composition database (individual values can differ)",
    "i": "AFCD: the food's overall derivation is imputed from a similar food (individual values can differ)",
    "l": "AFCD: the food's overall derivation is label data (individual values can differ)",
    "e": "AFCD: the food's overall derivation is estimated (individual values can differ)",
}
DERIVATION_LABEL = {"Recipe": "rec", "Borrowed": "b", "Imputed": "i", "Label Data": "l", "Estimated": "e"}
# First two digits of the classification code are the AFCD (AUSNUT 2023) food group.
GROUP = {"11": "beverages", "12": "grains", "13": "dishes", "14": "oils", "15": "fish", "16": "fruit", "17": "dairy",
         "18": "meat", "19": "dairy", "20": "other", "21": "dishes", "22": "nuts", "23": "dishes", "24": "veg",
         "25": "pulses", "26": "sweets", "27": "sweets", "28": "sweets", "29": "beverages", "30": "other",
         "31": "other", "32": "baby", "33": "other"}
NOT_BASIC_GROUP = {"13", "21", "23", "26", "27", "28", "29", "30", "31", "32", "33"}
BAKED_KEEP = re.compile(r"\b(bread|bagel|pita|pitta|tortilla|rolls?|naan|chapati|roti|flatbread|crispbread|matzo|english muffin|wrap)\b", re.I)
PLANT_DRINK = re.compile(r"\b(soy|soya|almond|rice|oat|coconut|hemp|cashew)\b.*\b(milk|beverage|drink)\b|\b(milk|beverage|drink)\b.*\b(soy|soya|almond|oat|rice)\b", re.I)
BREAKFAST = re.compile(r"breakfast cereal|muesli|granola|flakes|wheat biscuits?|bran|puffed|porridge|oats?, (rolled|instant|quick)|weet", re.I)
SPICE = re.compile(r"\b(spice|herb|seed|ground|dried|leaf|leaves|pepper|cinnamon|paprika|turmeric|cumin|oregano|basil|thyme|rosemary|chilli|chili|ginger|garlic powder|mustard|nutmeg|cloves?|cardamom|sage|parsley|mint|dill|coriander|tarragon|saffron|vanilla)\b", re.I)
NOT_BASIC_NAME = re.compile(r"\b(pie|pies|tart|tarts|crumble|curry|casserole|stew|stir[- ]fry|risotto|lasagne|lasagna|pastie|pasty|spring roll|"
                            r"dumpling|samosa|quiche|croquette|rissole|meatball|patty|patties|burrito|taco|dip|dressing|gravy|stock|"
                            r"with salt|sauce|whitener|mix|gizzard|giblets)\b", re.I)


def norm(h) -> str:
    return re.sub(r"\s+", " ", str(h or "")).strip()


def main() -> int:
    zp = fetch.get(ZIP)
    out = fetch.CACHE / "afcd3"
    out.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zp) as z:
        for n in (FOODS_X, PROFILES_X, GROUPS_X):
            (out / n).write_bytes(z.read(n))
    details = {}
    rows = xlsx_min.read(out / FOODS_X)["Food details"]
    hdr = [norm(h) for h in rows[2]]
    ix = {h: i for i, h in enumerate(hdr)}
    for r in rows[3:]:
        if r and r[0]:
            details[str(r[0]).strip()] = {"cls": str(r[ix["Classification"]]).strip(), "der": str(r[ix["Derivation"]] or "").strip(),
                                          "name": norm(r[ix["Food Name"]]), "desc": norm(r[ix["Food Description"]])}
    groups = {}
    for r in xlsx_min.read(out / GROUPS_X)["Food group information"][3:]:
        if r and r[0] and re.fullmatch(r"\d+", str(r[0]).strip()):
            groups[str(r[0]).strip()] = norm(r[1])
    prof = xlsx_min.read(out / PROFILES_X)["All solids & liquids per 100 g"]
    ph = [norm(h) for h in prof[2]]
    count = {}
    for h in ph:
        count[h] = count.get(h, 0) + 1
    col = {}
    for key, (header, _f, _d) in MAP.items():
        if count.get(header) != 1:
            raise SystemExit(f"AFCD profiles file: column {header!r} for {key} found {count.get(header, 0)} times")
        col[key] = ph.index(header)
    seen, out_basic, out_more = set(), [], []
    n_foods = 0
    for r in prof[3:]:
        if not r or not r[0]:
            continue
        code = str(r[0]).strip()
        d = details.get(code)
        if not d:
            raise SystemExit(f"AFCD: food {code} is in the nutrient profiles but not in the food details")
        n_foods += 1
        vals, labels = {}, {}
        lab = DERIVATION_LABEL.get(d["der"])
        for key, (_h, factor, _d) in MAP.items():
            v = common.num(r[col[key]] if col[key] < len(r) else None)
            if v is None:
                continue
            vals[key] = v * factor
            if lab:
                labels[key] = lab
        if not vals:
            continue
        vals |= common.derive(vals, table_gives_ne=True)
        name, cls = d["name"], d["cls"]
        g = cls[:2]
        cat = GROUP.get(g, "other")
        if g == "12" and BREAKFAST.search(name):
            cat = "cereals"
        if g in ("11", "20") and PLANT_DRINK.search(name):
            cat = "drinks"
        if g == "20" and re.search(r"\b(tofu|tempeh)\b", name, re.I):
            cat = "pulses"
        if g == "16" and re.search(r"juice|nectar|cordial", name, re.I):
            cat = "beverages"
        if cls.startswith("313") and SPICE.search(name):
            cat = "herbs"
        bcat = None
        if "energy" in vals and not NOT_BASIC_NAME.search(name):
            if g not in NOT_BASIC_GROUP or cat in ("drinks", "herbs") or (g == "13" and BAKED_KEEP.search(name)):
                if cat == "dishes" and g == "13":
                    cat = "grains"
                bcat = common.basic_category(cat, name)
                if bcat in common.auto_foods.MEAT_CATS and any(w in name.lower() for w in common.auto_foods.MEAT_EXCLUDE if w != "raw"):
                    bcat = None
        fid = common.unique_id(TABLE, code, seen)
        e = common.entry(TABLE, fid, code, name, bcat or cat, vals, labels, basic=bool(bcat),
                         extra={"classification": cls, "group": groups.get(g, ""), "derivation": d["der"]})
        (out_basic if bcat else out_more).append(e)
    common.write(TABLE, TITLE, {"data": ZIP}, {k: m[2] for k, m in MAP.items() if m[2]}, out_basic, out_more,
                 ["Vitamin K and choline are NA: the AFCD does not give them.",
                  "Cystine is cystine plus cysteine (the AFCD does not separate them).",
                  "Only the \"All solids & liquids per 100 g\" sheet is used; the AFCD's 100 mL sheet for liquids repeats those foods per 100 mL.",
                  "A food's overall derivation (recipe, borrowed, imputed, label data, estimated) is kept as a label on each of its values.",
                  "Licence and required notices: data/foods/LICENCE-AFCD.md."], LABELS, notice=common.AFCD_NOTICE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
