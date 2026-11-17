"""UK: Public Health England (2016) Government Dietary Recommendations, Tables 1-6 (pages 6-11).

The UK has no complete set of safety upper limits, so the US ones are borrowed (see us.py),
and amino acids use the WHO values (see common.py).
"""
from __future__ import annotations

from . import us
from .common import add_amino_acids, check_rows, energy_band, put, ref, years

# ---------------------------------------------------------------------------
# The table's columns: 1, 2-3, 4-6, 7-10, 11-14, 15-18, 19-64, 65-74, 75+ (years).
# Each row: (male values, female values), or one list for both; None = no value given.
# ---------------------------------------------------------------------------
COLS = ["1", "2-3", "4-6", "7-10", "11-14", "15-18", "19-64", "65-74", "75+"]
TABLE = {
    "energy":     ([765, 1088, 1482, 1817, 2500, 2500, 2500, 2342, 2294], [717, 1004, 1378, 1703, 2000, 2000, 2000, 1912, 1840]),
    "protein":    ([14.5, 14.5, 19.7, 28.3, 42.1, 55.2, 55.5, 53.3, 53.3], [14.5, 14.5, 19.7, 28.3, 41.2, 45.0, 45.0, 46.5, 46.5]),
    "fibre":      ([None, 15, 15, 20, 25, 30, 30, 30, 30],) * 2,
    "salt":       ([2.0, 2.0, 3.0, 5.0, 6.0, 6.0, 6.0, 6.0, 6.0],) * 2,
    "vitaminA":   ([400, 400, 400, 500, 600, 700, 700, 700, 700], [400, 400, 400, 500, 600, 600, 600, 600, 600]),
    "thiamin":    ([0.3, 0.4, 0.6, 0.7, 1.0, 1.0, 1.0, 0.9, 0.9], [0.3, 0.4, 0.6, 0.7, 0.8, 0.8, 0.8, 0.8, 0.7]),
    "riboflavin": ([0.6, 0.6, 0.8, 1.0, 1.2, 1.3, 1.3, 1.3, 1.3], [0.6, 0.6, 0.8, 1.0, 1.1, 1.1, 1.1, 1.1, 1.1]),
    "niacinNE":   ([5.0, 7.2, 9.8, 12.0, 16.5, 16.5, 16.5, 15.5, 15.1], [4.7, 6.6, 9.1, 11.2, 13.2, 13.2, 13.2, 12.6, 12.1]),
    "vitaminB6":  ([0.7, 0.7, 0.9, 1.0, 1.2, 1.5, 1.4, 1.4, 1.4], [0.7, 0.7, 0.9, 1.0, 1.0, 1.2, 1.2, 1.2, 1.2]),
    "vitaminB12": ([0.5, 0.5, 0.8, 1.0, 1.2, 1.5, 1.5, 1.5, 1.5],) * 2,
    "folate":     ([70, 70, 100, 150, 200, 200, 200, 200, 200],) * 2,
    "vitaminC":   ([30, 30, 30, 30, 35, 40, 40, 40, 40],) * 2,
    "vitaminD":   ([10] * 9,) * 2,
    "iron":       ([6.9, 6.9, 6.1, 8.7, 11.3, 11.3, 8.7, 8.7, 8.7], [6.9, 6.9, 6.1, 8.7, 14.8, 14.8, 14.8, 8.7, 8.7]),
    "calcium":    ([350, 350, 450, 550, 1000, 1000, 700, 700, 700], [350, 350, 450, 550, 800, 800, 700, 700, 700]),
    "magnesium":  ([85, 85, 120, 200, 280, 300, 300, 300, 300], [85, 85, 120, 200, 280, 300, 270, 270, 270]),
    "potassium":  ([800, 800, 1100, 2000, 3100, 3500, 3500, 3500, 3500],) * 2,
    "zinc":       ([5.0, 5.0, 6.5, 7.0, 9.0, 9.5, 9.5, 9.5, 9.5], [5.0, 5.0, 6.5, 7.0, 9.0, 7.0, 7.0, 7.0, 7.0]),
    "copper":     ([0.4, 0.4, 0.6, 0.7, 0.8, 1.0, 1.2, 1.2, 1.2],) * 2,
    "iodine":     ([70, 70, 100, 110, 130, 140, 140, 140, 140],) * 2,
    "selenium":   ([15, 15, 20, 30, 45, 70, 75, 75, 75], [15, 15, 20, 30, 45, 60, 60, 60, 60]),
    "phosphorus": ([270, 270, 350, 450, 775, 775, 550, 550, 550], [270, 270, 350, 450, 625, 625, 550, 550, 550]),
}
check_rows(TABLE, len(COLS), "UK table")
MAX_KEYS = {"salt"}  # "less than" values; everything else is a minimum

# The planner's groups. "4-6" is split because PHE gives fibre as 15 g at age 4 and 20 g at ages 5-6
# (Table 1, page 6); "19-64" is split because women's iron differs from age 50.
GROUPS = ["1", "2-3", "4", "5-6", "7-10", "11-14", "15-18", "19-50", "51-64", "65-74", "75+"]
COL_FOR = {"4": "4-6", "5-6": "4-6", "19-50": "19-64", "51-64": "19-64"}
ADULT_GROUPS = ("19-50", "51-64", "65-74", "75+")

# Values that differ from the table column the group falls in: (nutrient, sex or None for both, group) -> value.
EXCEPTIONS = {
    ("iron", "female", "51-64"): 8.7,   # PHE: 8.7 mg for women aged 50-64
    ("fibre", None, "5-6"): 20,         # PHE Table 1: 20 g for 5-6 year olds
}

# Energy-percentage rules stated in the PHE notes: fat at most 35% and saturates at most 11% of energy
# from age 4 (as the table gives them); carbohydrate at least 50% from age 2.
FROM_4 = set(GROUPS[GROUPS.index("4"):])
FROM_2 = set(GROUPS[GROUPS.index("2-3"):])
PCT_ENERGY = [("fat", "max", 35, FROM_4), ("satfat", "max", 11, FROM_4), ("carbohydrate", "min", 50, FROM_2)]

# Which US group's upper limits to borrow for each UK group (the younger where bands overlap, to stay conservative).
US_UL_GROUP = {"1": "1-3", "2-3": "1-3", "4": "4-8", "5-6": "4-8", "7-10": "4-8", "11-14": "9-13", "15-18": "14-18",
               "19-50": "19-30", "51-64": "51-70", "65-74": "71+", "75+": "71+"}


def value(key: str, sex: str, g: str):
    rows = TABLE[key]
    row = rows[0] if sex == "male" or len(rows) == 1 else rows[1]
    v = row[COLS.index(COL_FOR.get(g, g))]
    return EXCEPTIONS.get((key, sex, g), EXCEPTIONS.get((key, None, g), v))


def targets(sex: str, g: str) -> dict:
    t: dict = {}
    for key in TABLE:
        v = value(key, sex, g)
        if v is None or key == "energy":
            continue
        put(t, key, "max" if key in MAX_KEYS else "min", v, "abs", "phe-2016")
    for key, bound, pct, groups in PCT_ENERGY:
        if g in groups:
            put(t, key, bound, pct, "pctEnergy", "phe-2016")
    # The UK salt limit already covers sodium, so the US sodium value is not added.
    us.add_upper_limits(t, US_UL_GROUP[g], sex, sodium=False)
    if g in ADULT_GROUPS:
        add_amino_acids(t)
    return t


def build() -> dict:
    profiles = [{
        "id": f"{sex}-{g}", "stage": sex, "group": g, "label": f"{sex.title()}, {years(g)}",
        "energy": {**energy_band(value("energy", sex, g)),
                   "note": "PHE estimated average requirement (adults capped at 2500/2000 kcal); default band ±10%."},
        "defaultWeightKg": 70 if sex == "male" else 60,
        "targets": targets(sex, g),
    } for sex in ("male", "female") for g in GROUPS]
    return {
        "id": "uk", "name": "UK", "longName": "UK government dietary recommendations",
        "status": "available",
        "verified": {"checked": True, "date": "2026-11-09", "against": "Public Health England (2016) Government Dietary Recommendations PDF, Tables 1-6 (pages 6-11)"},
        "sources": [ref("phe-2016"), ref("nasem-dri", "Safety upper limits (the UK has no complete set)"), ref("who-2007", "Amino acids")],
        "notes": [
            "The UK target is in retinol equivalents; the food data is in retinol activity equivalents, which count carotenes from plants at half the value (US tables, vitamin A footnote). So vitamin A from plant foods is understated against this target, by up to half; vitamin A from animal foods is unaffected.",
            "Folate: the food data is in dietary folate equivalents, which count folic acid added to foods at about 1.7 times its weight (1 equivalent = 0.6 µg of added folic acid; US tables, folate footnote). The UK target is in plain micrograms, so foods fortified with folic acid are overstated against it; unfortified foods are unaffected.",
            "Free sugars (limit 5% of energy) are not assessed because food databases do not separate free from intrinsic sugars.",
            "Children under 5 are advised to take vitamin A, C and D supplements; women who could become pregnant are advised to take 400 µg folic acid daily.",
        ],
        "profiles": profiles,
    }
