"""Finland: Fineli Release 20 (Finnish Institute for Health and Welfare, THL) -> foods-fineli.json, foods-fineli-more.json.

Reads the archived 74-component package (fetch.py): food.csv, foodname_EN.csv and component_value.csv (";"-separated,
Latin-1, decimal comma). Each value is Fineli's own; a component with no value is missing (NA). A value Fineli marks
as calculated from a recipe, imputed or estimated (its METHTYPE codes) is labelled with Fineli's term. Units are
converted to the planner's (kJ -> kcal at 4.184; fatty acids and tryptophan from mg to g). Names are Fineli's English
names, shown in sentence case. Definitions: the package's component lists and the Fineli nutrient factors (archived).

  python3 -I tools/nutrient-planner/pipeline/tables/fineli.py
"""
from __future__ import annotations

import csv
import io
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE)]
import common  # noqa: E402
import fetch  # noqa: E402

TABLE, TITLE = "fineli", "Finland Fineli, release 20 (THL)"
ZIP = "fineli20_Fineli_Rel20__74_ravintotekijaa.zip"
MG = 0.001
MAP = {
    "energy": ("ENERC", 1 / 4.184, "Energy calculated by Fineli (its nutrient factors), published in kJ and converted at 4.184 kJ/kcal"),
    "protein": ("PROT", 1, "Total nitrogen x food-specific factor"), "fat": ("FAT", 1, ""), "satfat": ("FASAT", 1, ""),
    "carbohydrate": ("CHOAVL", 1, "Available carbohydrate by weight (not by difference; excludes fibre)"),
    "fibre": ("FIBC", 1, "Total fibre"), "sugars": ("SUGAR", 1, ""),
    "calcium": ("CA", 1, ""), "iron": ("FE", 1, ""), "magnesium": ("MG", 1, ""), "phosphorus": ("P", 1, ""),
    "potassium": ("K", 1, ""), "sodium": ("NA", 1, ""), "zinc": ("ZN", 1, ""), "copper": ("CU", 1, ""),
    "manganese": ("MN", 1, ""), "selenium": ("SE", 1, ""), "iodine": ("ID", 1, "Iodide"),
    "vitaminA": ("VITA", 1, "Retinol activity equivalents (the US definition; UK and EU targets use retinol equivalents)"),
    "retinol": ("RETOL", 1, ""), "vitaminD": ("VITD", 1, "Vitamin D as Fineli gives it"),
    "vitaminE": ("VITE", 1, "Alpha-tocopherol"),
    "vitaminK": ("VITK", 1, "Total vitamin K (phylloquinone and menaquinones); the other tables give phylloquinone only"),
    "vitaminC": ("VITC", 1, ""), "thiamin": ("THIA", 1, ""), "riboflavin": ("RIBF", 1, ""),
    "niacinPreformed": ("NIA", 1, ""), "niacinNE": ("NIAEQ", 1, "Niacin equivalents as published by Fineli"),
    "vitaminB6": ("VITPYRID", 1, "Vitamin B6 as pyridoxine vitamers"),
    "folate": ("FOL", 1, "Total folate (not dietary folate equivalents)"), "vitaminB12": ("VITB12", 1, ""),
    "la": ("F18D2CN6", MG, "C18:2 cis n-6"), "ala": ("F18D3N3", MG, "C18:3 n-3"),
    "epa": ("F20D5N3", MG, "C20:5 n-3"), "dha": ("F22D6N3", MG, "C22:6 n-3"),
    "tryptophan": ("TRP", MG, ""),
}
METH = {"R": "calculated as recipe", "I": "imputed/estimated from related food", "IG": "imputed/estimated, generic",
        "K": "calculated from related food", "U": "estimated according to logical deduction",
        "L": "estimated according to regulatory requirements", "O": "imputed/estimated from other food and component",
        "P": "calculated on component profile", "E": "other method type", "X": "method type not known"}
LABELS = {k: f"Fineli: {v}" for k, v in METH.items()}
IG = {  # Fineli ingredient class (or its parent) -> category
    "FRUITTOT": "fruit", "JUICE": "beverages", "FBDRINK": "beverages", "VEGTOT": "veg", "VEGJUICE": "beverages",
    "PEABEAN": "pulses", "LEGUPROD": "pulses", "SOYAPROD": "pulses", "NUTSEED": "nuts", "LEGULIQ": "drinks",
    "POTATOT": "veg", "POTAPROD": "dishes", "CERTOT": "grains", "CERBAR": "sweets", "OATLIQ": "drinks",
    "CEROTLIQ": "drinks", "STARCH": "other", "MILKTOT": "dairy", "ICECREAM": "sweets", "VEGCHEES": "dishes",
    "FATTOT": "oils", "SALADDRE": "dishes", "EGGTOT": "dairy", "FISHTOT": "fish", "MEATTOT": "meat",
    "BEVTOT": "beverages", "ALCTOT": "beverages", "SUGARTOT": "sweets", "FLAVTOT": "herbs", "FLAVSAUC": "dishes",
    "INGRTOT": "other", "DIETTOT": "other", "BABYFOOD": "baby", "MMILK": "baby", "NONINGR": "dishes",
}
NOT_BASIC = {"FISHPROD", "SAUSAGE", "SAUSCUTS", "MEATCUTS", "MEATPROD", "OFFAL", "FATANIM", "FATCOOK",
             "BUTTHIGH", "BUTTLOW", "CREAM", "MILKINGR", "SOUCREAM"}


def read(z: zipfile.ZipFile, name: str) -> list[dict]:
    return list(csv.DictReader(io.TextIOWrapper(z.open(name), "latin-1"), delimiter=";"))


def sentence(name: str) -> str:
    s = name.strip().lower()
    return s[:1].upper() + s[1:]


def main() -> int:
    z = zipfile.ZipFile(fetch.get(ZIP))
    names = {r["FOODID"]: r["FOODNAME"] for r in read(z, "foodname_EN.csv")}
    fi = {r["FOODID"]: r["FOODNAME"] for r in read(z, "foodname_FI.csv")}
    foods = {r["FOODID"]: {"row": r, "vals": {}, "labels": {}} for r in read(z, "food.csv")}
    want = {m[0]: k for k, m in MAP.items()}
    for r in read(z, "component_value.csv"):
        key, f = want.get(r["EUFDNAME"]), foods.get(r["FOODID"])
        if not key or not f:
            continue
        v = common.num(r["BESTLOC"])
        if v is None:
            continue
        f["vals"][key] = v * MAP[key][1]
        if r["METHTYPE"] in METH:
            f["labels"][key] = r["METHTYPE"]
    seen, out_basic, out_more = set(), [], []
    for code, f in sorted(foods.items(), key=lambda kv: int(kv[0])):
        vals, row = f["vals"], f["row"]
        if not vals:
            continue
        name = sentence(names.get(code) or row["FOODNAME"])
        vals |= common.derive(vals, table_gives_ne=True)
        cat = IG.get(row["IGCLASS"]) or IG.get(row["IGCLASSP"], "other")
        if row["FOODTYPE"] == "DISH":
            cat = "dishes" if cat not in ("sweets", "beverages", "baby") else cat
        # Fineli states the treatment in PROCESS rather than in the name: "RAW" counts as raw for the shared rules.
        rule_name = f"{name}, raw" if row["PROCESS"] == "RAW" else name
        bcat = None
        if "energy" in vals and row["FOODTYPE"] == "FOOD" and row["IGCLASS"] not in NOT_BASIC and row["PROCESS"] not in ("FRIE", "SALT"):
            bcat = common.basic_category(cat, rule_name)
        fid = common.unique_id(TABLE, code, seen)
        e = common.entry(TABLE, fid, code, name, bcat or cat, vals, f["labels"], basic=bool(bcat),
                         extra={"nameFi": sentence(fi.get(code, "")), "process": row["PROCESS"]})
        (out_basic if bcat else out_more).append(e)
    common.write(TABLE, TITLE, {"data": ZIP}, {k: m[2] for k, m in MAP.items() if m[2]}, out_basic, out_more,
                 ["Fineli's open package has 74 components: no amino acids other than tryptophan, no vitamin D2/D3 split, "
                  "no pantothenic acid or choline; those are NA.",
                  "Values Fineli calculated from recipes, imputed or estimated are labelled with its method type."], LABELS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
