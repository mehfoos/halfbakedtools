"""Germany: BLS 4.0 (Bundeslebensmittelschlüssel, Max Rubner-Institut, 2025) -> foods-bls.json, foods-bls-more.json.

Reads the archived English data file (fetch.py). Each value is BLS's own; each value's "Data origin" is kept: a value
BLS calculated from a recipe, a pattern, by rescaling, from labelling, or borrowed from another table or food is
labelled with BLS's own term (the file's "labels" legend). "-" is missing (NA); "<LOD" (below the limit of
detection) and "Traces" are missing with that label. Units are converted to the planner's (µg -> mg for vitamin B6,
copper and manganese). Component definitions: BLS_4_0_Components_DE_EN.xlsx and the BLS 4.0 documentation.
"<LOQ" and "<LOD or <LOQ" are missing with that label too. A "Logical zero" (documentation 4.2.10: the nutrient is
assumed not to occur, for example retinol in plant foods) is kept as 0 with the label "z" (not a measurement).

The BLS 4.0 errata (August 2026, bls_erratum.json) apply until BLS 4.1: the corrected values in its Tables 1-3 replace
the published ones; values of recipes the erratum names as affected by a corrected ingredient, and the fat, energy and
fatty acids of raw anchovy and the entries derived from it (no corrected value yet), are missing with an erratum label;
energy of the 411 foods with oligosaccharides is recalculated without the double-counted 2 kcal/g (published - 2 x
OLSAC); zero amino acids in foods with protein are missing (the erratum found false zeros for phenylalanine and is
reviewing every amino acid for the same causes).

  python3 -I tools/nutrient-planner/pipeline/tables/bls.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent / "crosswalk")]
import common  # noqa: E402
import fetch  # noqa: E402
import xlsx_min  # noqa: E402

TABLE, TITLE = "bls", "Germany BLS 4.0 (2025)"
DATA = "bls4_BLS_4_0_Data_2025_EN.xlsx"
COMPONENTS = "bls4_BLS_4_0_Components_DE_EN.xlsx"

# planner key -> (BLS component code, factor to the planner's unit, definition where it differs from USDA's)
MAP = {
    "energy": ("ENERCC", 1, "EU labelling factors: protein 4, available carbohydrate (excluding polyols) 4, fat 9, alcohol 7, organic acids 3, polyols 2.4, oligosaccharides 2, fibre 2 kcal/g (always calculated)"),
    "protein": ("PROT625", 1, "Total nitrogen x 6.25 for every food"),
    "fat": ("FAT", 1, ""),
    "satfat": ("FASAT", 1, ""),
    "carbohydrate": ("CHO", 1, "Available carbohydrate by weight: sugars + starch + available oligosaccharides + polyols (not by difference; excludes fibre)"),
    "fibre": ("FIBT", 1, "Total dietary fibre (high and low molecular weight, partly calculated)"),
    "sugars": ("SUGAR", 1, "Mono- and disaccharides"),
    "calcium": ("CA", 1, ""), "iron": ("FE", 1, ""), "magnesium": ("MG", 1, ""), "phosphorus": ("P", 1, ""),
    "potassium": ("K", 1, ""), "sodium": ("NA", 1, ""), "zinc": ("ZN", 1, ""),
    "copper": ("CU", 0.001, ""), "manganese": ("MN", 0.001, ""), "iodine": ("ID", 1, "Iodide"),
    "vitaminA": ("VITA", 1, "Retinol equivalents: retinol + beta-carotene / 6 + other carotenoids / 12 (the UK and EU definition; US targets use retinol activity equivalents)"),
    "retinol": ("RETOL", 1, ""),
    "vitaminD": ("VITD", 1, "Vitamin D2 + D3 (no 25-hydroxy vitamin D)"),
    "vitaminD2": ("ERGCAL", 1, ""), "vitaminD3": ("CHOCAL", 1, ""),
    "vitaminE": ("VITE", 1, "Alpha-tocopherol"),
    "vitaminK": ("VITK1", 1, "Phylloquinone (vitamin K1) only; BLS also gives K2, which isn't counted here, as for the other tables"),
    "vitaminC": ("VITC", 1, ""), "thiamin": ("THIA", 1, ""), "riboflavin": ("RIBF", 1, ""),
    "niacinPreformed": ("NIA", 1, ""),
    "niacinNE": ("NIAEQ", 1, "Niacin equivalents as published by BLS (niacin + tryptophan / 60)"),
    "pantothenic": ("PANTAC", 1, ""), "vitaminB6": ("VITB6", 0.001, ""),
    "folate": ("FOL", 1, "Dietary folate equivalents: food folate + 1.7 x synthetic folic acid (the US and EU definition; UK targets use total folate)"),
    "vitaminB12": ("VITB12", 1, ""),
    "la": ("F18:2CN6", 1, "cis,cis n-6 C18:2"), "ala": ("F18:3CN3", 1, "all-cis n-3 C18:3"),
    "epa": ("F20:5CN3", 1, "all-cis n-3 C20:5"), "dha": ("F22:6CN3", 1, "all-cis n-3 C22:6"),
    "histidine": ("HIS", 1, ""), "isoleucine": ("ILE", 1, ""), "leucine": ("LEU", 1, ""), "lysine": ("LYS", 1, ""),
    "methionine": ("MET", 1, ""), "cystine": ("CYSTE", 1, "Cysteine"), "phenylalanine": ("PHE", 1, ""),
    "tyrosine": ("TYR", 1, ""), "threonine": ("THR", 1, ""), "tryptophan": ("TRP", 1, ""), "valine": ("VAL", 1, ""),
}
# BLS "Data origin" terms: values with these origins are labelled (short codes, legend in the file's "labels").
ORIGIN_CODE = {"Recipe calculation": "r", "Pattern calculation": "p", "Rescaling": "s", "Borrowing": "b",
               "Food composition database": "d", "Aggregation": "a", "Labeling": "l", "Logical assumption": "x"}
LABELS = {"r": "BLS: recipe calculation", "p": "BLS: pattern calculation (from similar foods)",
          "s": "BLS: rescaling (from another state of the food)", "b": "BLS: borrowed from another food",
          "d": "BLS: taken from another food composition database", "a": "BLS: aggregation of several foods",
          "l": "BLS: from product labelling", "x": "BLS: logical assumption",
          "lod": "below the limit of detection", "trace": "trace", "loq": "below the limit of quantification",
          "lodloq": "below the limit of detection or quantification",
          "z": "BLS: logical zero (assumed not to occur in this food; not a measurement)",
          "err": "BLS erratum (August 2026): corrected value, in force until BLS 4.1",
          "errna": "BLS erratum (August 2026): this value is wrong in BLS 4.0 and its correction is not yet published, so it is not available",
          "erren": "BLS erratum (August 2026): energy recalculated without the oligosaccharides BLS 4.0 counted twice (published value - 2 kcal per g of oligosaccharides)",
          "erraa": "BLS erratum (August 2026): a zero amino acid in a food with protein may be a rounding or transfer error (under review for BLS 4.1), so it is not available"}
AMINO = ("histidine", "isoleucine", "leucine", "lysine", "methionine", "cystine", "phenylalanine", "tyrosine",
         "threonine", "tryptophan", "valine")
ERRATUM = json.loads((HERE / "bls_erratum.json").read_text())
ERRATUM_FILE = "bls4_Erratum_BLS_4_0_DE.pdf"


def erratum_rules() -> tuple[dict, dict, set, set]:
    """(corrected values, keys made missing per food, foods whose energy is recalculated, zinc codes below a limit)."""
    fixed = {(c["code"], c["key"]): c["value"] for c in ERRATUM["corrected"]}
    gone: dict[str, set] = {}
    for part in ("recipesTooHigh", "recipesIodine", "recipesCalcium", "anchovy"):
        for code in ERRATUM[part]["codes"]:
            gone.setdefault(code, set()).update(ERRATUM[part]["keys"])
    zinc = {c: "loq" for c in ERRATUM["zincBelowLimit"]["loq"]} | {c: "lod" for c in ERRATUM["zincBelowLimit"]["lod"]}
    return fixed, gone, set(ERRATUM["energyOligosaccharides"]["codes"]), zinc
SELENIUM_NOTE = "BLS 4.0 gives no selenium, choline or vitamin B6 by form; those are NA."

NUTS = re.compile(r"\b(nut|nuts|almond|hazelnut|walnut|cashew|pistachio|pecan|macadamia|peanut|seed|seeds|linseed|"
                  r"sesame|poppy|chia|sunflower|pumpkin seed|pine kernel|coconut)\b", re.I)
PLANT_DRINK = re.compile(r"\bplant-based\b.*\bdrink\b|\b(soya|oat|almond|rice|coconut) drink\b", re.I)
PULSES = re.compile(r"\b(bean|beans|lentil|lentils|chickpea|chickpeas|pea|peas|soya|soybean|tofu|tempeh|lupin)\b", re.I)
SPICES = re.compile(r"\b(pepper|spice|cinnamon|nutmeg|paprika|curry powder|cumin|clove|ginger|herb|vanilla|caraway|"
                    r"aniseed|cardamom|chilli|mustard seed|turmeric|salt|vinegar|yeast)\b", re.I)
CEREAL = re.compile(r"\b(muesli|cornflakes|flakes|puffed|granola|porridge)\b", re.I)


def category(code: str, name: str) -> str:
    g = code[:1]
    if g in "BC":
        return "cereals" if CEREAL.search(name) and not re.search(r"\boat flakes\b", name, re.I) else "grains"
    if g == "D":
        return "sweets"
    if g == "E":
        return "dairy" if re.search(r"\begg\b", name, re.I) and not re.search(r"pasta|noodle|dumpling", name, re.I) else "grains"
    if g == "H":
        if PLANT_DRINK.search(name):
            return "drinks"
        if re.search(r"alternative|dessert|pudding|yogurt|yoghurt", name, re.I):
            return "dishes"
        return "nuts" if NUTS.search(name) and not PULSES.search(name) else "pulses"
    if g == "K":
        return "other" if re.search(r"starch|flour|powder|soup", name, re.I) else "veg"
    if g == "R":
        return "herbs" if SPICES.search(name) else "sweets"
    return {"F": "fruit", "G": "veg", "M": "dairy", "N": "beverages", "P": "beverages", "Q": "oils", "S": "sweets",
            "T": "fish", "U": "meat", "V": "meat", "W": "meat", "X": "dishes", "Y": "dishes"}.get(g, "other")


def basic(code: str, cat: str, name: str) -> str | None:
    if code[:1] in "WXYDSRNP":   # sausages and cured meats, dishes, cakes, sweets, fillings, drinks: Food Finder only
        return None
    if re.search(r"\bsugared\b|\bwith sugar\b|\bsweetened\b|\bsalted\b|\bheart\b|\bsweetbread\b|\blung\b|"
                 r"\bspleen\b|\bmarrow\b|\bblood\b|\bwith artificial sweeteners\b", name, re.I):
        return None
    # "fried without fat" (dry pan or oven) adds no fat, so it is cooking, not frying in the USDA sense.
    rule_name = re.sub(r"fried without fat \((?:pan|oven)\)", "cooked", name, flags=re.I)
    return common.basic_category(cat, rule_name)


def main() -> int:
    rows = xlsx_min.read(fetch.get(DATA))["BLS_4_0_Data_2025_EN"]
    head = rows[0]
    col = {h.split(" ", 1)[0]: i for i, h in enumerate(head) if h and not h.endswith(("Data origin", "Reference"))}
    missing = [m[0] for m in MAP.values() if m[0] not in col]
    if missing:
        raise SystemExit(f"BLS file lacks components: {missing}")
    fetch.get(COMPONENTS)   # the definitions cited above: checked to be the archived copy
    fetch.get(ERRATUM_FILE)  # the errata applied below: checked to be the archived copy
    fixed, gone, olsac_foods, zinc_limit = erratum_rules()
    n_err = {"corrected": 0, "missing": 0, "energy": 0, "amino": 0}
    seen, out_basic, out_more = set(), [], []
    for row in rows[1:]:
        if not row or not row[0]:
            continue
        code, de, name = row[0].strip(), (row[1] or "").strip(), (row[2] or de).strip()
        vals, labels = {}, {}
        for key, (comp, factor, _d) in MAP.items():
            i = col[comp]
            cell = row[i] if i < len(row) else None
            origin = row[i + 1] if i + 1 < len(row) else None
            if (code, key) in fixed:
                vals[key], labels[key] = float(fixed[code, key]), "err"
                n_err["corrected"] += 1
                continue
            if key in gone.get(code, ()):
                labels[key] = "errna"
                n_err["missing"] += 1
                continue
            if key == "zinc" and code in zinc_limit:
                labels[key] = zinc_limit[code]
                continue
            if cell in ("<LOD", "<LOQ", "<LOD or <LOQ"):
                labels[key] = {"<LOD": "lod", "<LOQ": "loq", "<LOD or <LOQ": "lodloq"}[cell]
                continue
            if origin == "Traces":
                labels[key] = "trace"
                continue
            v = common.num(cell)
            if v is None:
                continue
            if key == "energy" and code in olsac_foods:
                v -= 2 * common.num(row[col["OLSAC"]])
                labels[key] = "erren"
                n_err["energy"] += 1
            if key in AMINO and v == 0 and (common.num(row[col["PROT625"]]) or 0) > 0:
                labels[key] = "erraa"
                n_err["amino"] += 1
                continue
            vals[key] = v * factor
            if key == "energy" and code in olsac_foods:
                continue
            if origin == "Logical zero" and v == 0:
                labels[key] = "z"
            elif origin in ORIGIN_CODE:
                labels[key] = ORIGIN_CODE[origin]
        if not vals:
            continue
        vals |= common.derive(vals, table_gives_ne=True)
        cat = category(code, name)
        bcat = basic(code, cat, name) if "energy" in vals else None
        fid = common.unique_id(TABLE, code, seen)
        f = common.entry(TABLE, fid, code, name, bcat or cat, vals, labels, basic=bool(bcat),
                         extra={"nameDe": de}, group=common.first_word_group(name))
        (out_basic if bcat else out_more).append(f)
    defs = {k: m[2] for k, m in MAP.items() if m[2]}
    common.write(TABLE, TITLE, {"data": DATA, "components": COMPONENTS, "erratum": ERRATUM_FILE}, defs, out_basic, out_more,
                 ["Each value's data origin is kept as BLS gives it; see the `labels` legend in `foods-bls.json`.",
                  f"BLS 4.0 errata (August 2026) applied: {n_err['corrected']} corrected values; {n_err['missing']} values of affected "
                  f"recipes and of raw anchovy and its derived entries missing; energy recalculated for {n_err['energy']} foods with "
                  f"oligosaccharides; {n_err['amino']} zero amino acids in foods with protein missing (pipeline/tables/bls_erratum.json).",
                  SELENIUM_NOTE, "Sausages, cured meats, dishes, cakes, sweets and drinks are Food Finder only."],
                 LABELS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
