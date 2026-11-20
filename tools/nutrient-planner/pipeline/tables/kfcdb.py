"""Korea: Korean Food Composition Database 9.3, English edition (Rural Development Administration) -> foods-kfcdb.json,
foods-kfcdb-more.json.

Reads the archived spreadsheet (fetch.py), sheet "KFCDb 9.3": row 4 holds INFOODS component codes, row 5 units.
Each value is KFCDb's own. "-" is missing (NA); "Tr" is missing with a trace label. A value in brackets, such as
"(0)" or "(1.2)", is KFCDb's estimated value: it is used and labelled. The "Source" column says where a food's data
come from; a food whose data come from another country's table (for example USDA or Japan) has every value labelled
as borrowed, with that source. KFCDb gives carbohydrate by difference, which includes fibre: as for USDA, fibre is
subtracted (not below 0). Vitamin A is NA: KFCDb gives retinol and beta-carotene but no vitamin A value, and working
one out from beta-carotene alone would leave out the other carotenoids.

  python3 -I tools/nutrient-planner/pipeline/tables/kfcdb.py
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

TABLE, TITLE = "kfcdb", "Korea KFCDb 9.3 (RDA)"
DATA = "kfcdb93_StandardFoodCompositionTableEng.xlsx"
MG = 0.001
MAP = {
    "energy": ("ENERC", 1, "Energy as published by KFCDb (the file doesn't state its factors)"),
    "protein": ("PROCNP", 1, "Protein from total nitrogen x factor"), "fat": ("FAT", 1, ""), "satfat": ("FASATF", 1, ""),
    "carbohydrate": ("CHOCDF", 1, "KFCDb carbohydrate by difference minus total dietary fibre (not below 0), as for USDA; unchanged (so including fibre) where KFCDb gives no fibre value"),
    "fibre": ("FIBTG", 1, "Total dietary fibre"), "sugars": ("SUGAR", 1, ""),
    "calcium": ("CA", 1, ""), "iron": ("FE", 1, ""), "magnesium": ("MG", 1, ""), "phosphorus": ("P", 1, ""),
    "potassium": ("K", 1, ""), "sodium": ("NA", 1, ""), "zinc": ("ZN", 1, ""), "copper": ("CU", 1, ""),
    "manganese": ("MN", 1, ""), "selenium": ("SE", 1, ""), "iodine": ("ID", 1, ""),
    "retinol": ("RETOL", 1, ""),
    "vitaminD": ("VITD", 1, "Ergocalciferol + cholecalciferol"), "vitaminD2": ("ERGCAL", 1, ""), "vitaminD3": ("CHOCAL", 1, ""),
    "vitaminE": ("TOCPHA", 1, "Alpha-tocopherol"), "vitaminK": ("VITK1", 1, "Phylloquinone (vitamin K1) only"),
    "vitaminC": ("VITC", 1, ""), "thiamin": ("THIA", 1, ""), "riboflavin": ("RIBF", 1, ""),
    "niacinPreformed": ("NIA", 1, ""), "niacinNE": ("NIAEQ", 1, "Niacin equivalents as published by KFCDb"),
    "pantothenic": ("PANTAC", 1, ""), "vitaminB6": ("VITB6C", 1, ""),
    "folate": ("FOL", 1, "Dietary folate equivalents (the US and EU definition; UK targets use total folate)"),
    "vitaminB12": ("VITB12", 1, ""),
    "la": ("F18D2N6F", MG, "C18:2 n-6"), "ala": ("F18D3N3F", MG, "C18:3 n-3"),
    "epa": ("F20D5N3F", MG, "C20:5 n-3"), "dha": ("F22D6N3F", MG, "C22:6 n-3"),
    "histidine": ("HIS", MG, ""), "isoleucine": ("ILE", MG, ""), "leucine": ("LEU", MG, ""), "lysine": ("LYS", MG, ""),
    "methionine": ("MET", MG, ""), "cystine": ("CYS", MG, ""), "phenylalanine": ("PHE", MG, ""), "tyrosine": ("TYR", MG, ""),
    "threonine": ("THR", MG, ""), "tryptophan": ("TRP", MG, ""), "valine": ("VAL", MG, ""),
}
# KFCDb writes 0 for vitamin D in foods that contain it (butter, canned mackerel, milk powder), and its documentation,
# which would say whether 0 means "none found" or "not analysed", is not archived. In animal foods a vitamin D zero is
# therefore missing (owner's decision, 20 Nov 2026). Egg white is kept at 0: the vitamin D of an egg is in the yolk.
ANIMAL = {"meat", "fish", "dairy"}
ANIMAL_FAT = re.compile(r"butter|lard|tallow|ghee|cream|suet|fish oil|liver oil", re.I)
NONE_THERE = re.compile(r"\begg,? (quail,? )?white\b", re.I)
D_KEYS = ("vitaminD", "vitaminD2", "vitaminD3")
LABELS = {"znd": "KFCDb: 0 for vitamin D in a food that contains it; whether none was found or it wasn't analysed isn't known", "e": "KFCDb: estimated value (shown in brackets in the table)", "trace": "trace",
          "b": "KFCDb: this food's data come from another table (see the food's source)"}
GROUP = {"곡류및그제품": "grains", "감자류및전분류": "veg", "당류": "sweets", "두류": "pulses", "견과류및종실류": "nuts",
         "채소류": "veg", "버섯류": "veg", "과일류": "fruit", "육류": "meat", "난류": "dairy", "어패류및기타수산물": "fish",
         "해조류": "veg", "우유및유제품류": "dairy", "유지류": "oils", "차류": "beverages", "음료류": "beverages",
         "주류": "beverages", "조미료류": "dishes", "조리가공식품류": "dishes", "기타": "other"}
FOREIGN = re.compile(r"USDA|JAPAN|Japan|China|CHINA|ASEAN|India|INDIA|Danish|Denmark|Taiwan|TAIWAN|FAO|Germany|UK", re.I)


def main() -> int:
    rows = xlsx_min.read(fetch.get(DATA))["KFCDb 9.3"]
    codes = rows[3]
    col = {c: i for i, c in enumerate(codes) if c}
    missing = [m[0] for m in MAP.values() if m[0] not in col]
    if missing:
        raise SystemExit(f"KFCDb file lacks components: {missing}")
    src_col = col.get("Source", len(codes) - 1)
    seen, out_basic, out_more = set(), [], []
    for r in rows[5:]:
        if not r or len(r) < 6 or not r[2]:
            continue
        code, ko, name, grp = str(r[2]).strip(), (r[3] or "").strip(), (r[4] or r[3] or "").strip(), (r[1] or "").strip()
        source = str(r[src_col]).strip() if src_col < len(r) and r[src_col] else ""
        borrowed = bool(FOREIGN.search(source))
        vals, labels = {}, {}
        for key, (comp, factor, _d) in MAP.items():
            cell = r[col[comp]] if col[comp] < len(r) else None
            t = str(cell).strip() if cell is not None else ""
            est = t.startswith("(") and t.endswith(")")
            if est:
                t = t[1:-1].strip()
            if t == "Tr":
                labels[key] = "trace"
                continue
            v = common.num(t)
            if v is None:
                continue
            vals[key] = v * factor
            if borrowed:
                labels[key] = "b"
            elif est:
                labels[key] = "e"
        if not vals:
            continue
        if "carbohydrate" in vals and "fibre" in vals:
            vals["carbohydrate"] = max(0.0, vals["carbohydrate"] - vals["fibre"])
        cat = GROUP.get(grp, "other")
        if (cat in ANIMAL or (cat == "oils" and ANIMAL_FAT.search(name))) and not NONE_THERE.search(name):
            for k in D_KEYS:
                if vals.get(k) == 0:
                    del vals[k]
                    labels[k] = "znd"
        vals |= common.derive(vals, table_gives_ne=True)
        if cat == "veg" and re.search(r"starch|noodle|vermicelli", name, re.I):
            cat = "other"
        bcat = common.basic_category(cat, name) if "energy" in vals else None
        fid = common.unique_id(TABLE, code, seen)
        e = common.entry(TABLE, fid, code, name, bcat or cat, vals, labels, basic=bool(bcat),
                         extra={"nameKo": ko, "dataSource": source} if source else {"nameKo": ko})
        (out_basic if bcat else out_more).append(e)
    common.write(TABLE, TITLE, {"data": DATA}, {k: m[2] for k, m in MAP.items() if m[2]}, out_basic, out_more,
                 ["Vitamin A is NA: KFCDb gives retinol and beta-carotene, not vitamin A.",
                  "Values in brackets are KFCDb's estimates and are labelled; foods whose data come from another country's "
                  "table have every value labelled as borrowed."], LABELS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
