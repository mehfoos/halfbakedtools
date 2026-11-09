#!/usr/bin/env python3
"""Generate data/targets/*.json from reference tables transcribed below.

Every table here is copied from the cited official document. To correct or
update a value, edit the table here (not the JSON) and re-run:

  python3 data/pipeline/build_targets.py

Output format: profiles[].targets[nutrientKey] = {"min": bound?, "max": bound?}
where a bound is {"value", "basis", "source", "note"?} and basis is:
  abs        an absolute daily amount in the nutrient's unit
  pctEnergy  percent of energy (converted to grams in the browser)
  perKg      mg per kg body weight per day (converted using the user's weight)
The planner tries to reach every min (shortfall is penalised) and never
exceeds a max.
"""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "data" / "targets"

# ---------------------------------------------------------------------------
# Shared: WHO/FAO/UNU (2007) adult indispensable amino acid requirements,
# mg per kg body weight per day. WHO Technical Report Series 935, Table 23.
# Applied to adults (19+) in every standard; children are not assessed.
# ---------------------------------------------------------------------------
WHO_AA_SOURCE = {
    "id": "who-2007",
    "title": "WHO/FAO/UNU (2007) Protein and amino acid requirements in human nutrition, WHO Technical Report Series 935",
    "url": "https://iris.who.int/handle/10665/43411",
}
WHO_AA = {"histidine": 10, "isoleucine": 20, "leucine": 39, "lysine": 30, "metCys": 15,
          "pheTyr": 25, "threonine": 15, "tryptophan": 4, "valine": 26}


def put(t: dict, key: str, bound: str, value, basis: str, source: str, note: str | None = None) -> None:
    b = {"value": value, "basis": basis, "source": source}
    if note:
        b["note"] = note
    t.setdefault(key, {})[bound] = b


def add_aa(t: dict) -> None:
    for k, v in WHO_AA.items():
        put(t, k, "min", v, "perKg", "who-2007")


# ---------------------------------------------------------------------------
# UK: Public Health England (2016) Government Dietary Recommendations.
# Columns: 1, 2-3, 4-6, 7-10, 11-14, 15-18, 19-64, 65-74, 75+ (years).
# Each row: (male values, female values); None = no value given.
# 19-64 is split into 19-50 and 51-64 below because female iron differs.
# ---------------------------------------------------------------------------
UK_COLS = ["1", "2-3", "4-6", "7-10", "11-14", "15-18", "19-64", "65-74", "75+"]
UK = {
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
UK_MAX = {"salt"}  # "less than" values
# Energy-percentage rules stated in the PHE notes (fat <=35%E, saturates <=11%E,
# carbohydrate >=50%E); the table gives them from age 4 (fat) / 2 (carbohydrate).
UK_PCT = [
    ("fat", "max", 35, {"4-6", "7-10", "11-14", "15-18", "19-50", "51-64", "65-74", "75+"}),
    ("satfat", "max", 11, {"4-6", "7-10", "11-14", "15-18", "19-50", "51-64", "65-74", "75+"}),
    ("carbohydrate", "min", 50, {"2-3", "4-6", "7-10", "11-14", "15-18", "19-50", "51-64", "65-74", "75+"}),
]
UK_GROUPS = ["1", "2-3", "4-6", "7-10", "11-14", "15-18", "19-50", "51-64", "65-74", "75+"]
# Which US group's safety limits to borrow for each UK group (the lower/younger
# where bands overlap, to stay conservative).
UK_TO_US_UL = {"1": "1-3", "2-3": "1-3", "4-6": "4-8", "7-10": "4-8", "11-14": "9-13", "15-18": "14-18",
               "19-50": "19-30", "51-64": "51-70", "65-74": "71+", "75+": "71+"}

# ---------------------------------------------------------------------------
# US: National Academies DRI summary tables (NCBI Bookshelf NBK545442,
# Appendix J, 2019). RDA or AI values; groups as in the tables.
# ---------------------------------------------------------------------------
US_GROUPS = ["1-3", "4-8", "9-13", "14-18", "19-30", "31-50", "51-70", "71+"]
US_COLS_V = ["vitaminA", "vitaminC", "vitaminD", "vitaminE", "vitaminK", "thiamin", "riboflavin", "niacinNE",
             "vitaminB6", "folate", "vitaminB12", "choline"]
US_COLS_E = ["calcium", "copper", "iodine", "iron", "magnesium", "manganese", "phosphorus", "selenium", "zinc", "potassium"]
US_COLS_M = ["protein", "carbohydrate", "fibre", "la", "ala"]
# (life stage, group) -> values in column order. Copper converted µg -> mg.
US_V = {
    ("child", "1-3"): [300, 15, 15, 6, 30, 0.5, 0.5, 6, 0.5, 150, 0.9, 200],
    ("child", "4-8"): [400, 25, 15, 7, 55, 0.6, 0.6, 8, 0.6, 200, 1.2, 250],
    ("male", "9-13"): [600, 45, 15, 11, 60, 0.9, 0.9, 12, 1.0, 300, 1.8, 375],
    ("male", "14-18"): [900, 75, 15, 15, 75, 1.2, 1.3, 16, 1.3, 400, 2.4, 550],
    ("male", "19-30"): [900, 90, 15, 15, 120, 1.2, 1.3, 16, 1.3, 400, 2.4, 550],
    ("male", "31-50"): [900, 90, 15, 15, 120, 1.2, 1.3, 16, 1.3, 400, 2.4, 550],
    ("male", "51-70"): [900, 90, 15, 15, 120, 1.2, 1.3, 16, 1.7, 400, 2.4, 550],
    ("male", "71+"): [900, 90, 20, 15, 120, 1.2, 1.3, 16, 1.7, 400, 2.4, 550],
    ("female", "9-13"): [600, 45, 15, 11, 60, 0.9, 0.9, 12, 1.0, 300, 1.8, 375],
    ("female", "14-18"): [700, 65, 15, 15, 75, 1.0, 1.0, 14, 1.2, 400, 2.4, 400],
    ("female", "19-30"): [700, 75, 15, 15, 90, 1.1, 1.1, 14, 1.3, 400, 2.4, 425],
    ("female", "31-50"): [700, 75, 15, 15, 90, 1.1, 1.1, 14, 1.3, 400, 2.4, 425],
    ("female", "51-70"): [700, 75, 15, 15, 90, 1.1, 1.1, 14, 1.5, 400, 2.4, 425],
    ("female", "71+"): [700, 75, 20, 15, 90, 1.1, 1.1, 14, 1.5, 400, 2.4, 425],
    ("pregnancy", "14-18"): [750, 80, 15, 15, 75, 1.4, 1.4, 18, 1.9, 600, 2.6, 450],
    ("pregnancy", "19-30"): [770, 85, 15, 15, 90, 1.4, 1.4, 18, 1.9, 600, 2.6, 450],
    ("pregnancy", "31-50"): [770, 85, 15, 15, 90, 1.4, 1.4, 18, 1.9, 600, 2.6, 450],
    ("lactation", "14-18"): [1200, 115, 15, 19, 75, 1.4, 1.6, 17, 2.0, 500, 2.8, 550],
    ("lactation", "19-30"): [1300, 120, 15, 19, 90, 1.4, 1.6, 17, 2.0, 500, 2.8, 550],
    ("lactation", "31-50"): [1300, 120, 15, 19, 90, 1.4, 1.6, 17, 2.0, 500, 2.8, 550],
}
US_E = {
    ("child", "1-3"): [700, 0.34, 90, 7, 80, 1.2, 460, 20, 3, 2000],
    ("child", "4-8"): [1000, 0.44, 90, 10, 130, 1.5, 500, 30, 5, 2300],
    ("male", "9-13"): [1300, 0.70, 120, 8, 240, 1.9, 1250, 40, 8, 2500],
    ("male", "14-18"): [1300, 0.89, 150, 11, 410, 2.2, 1250, 55, 11, 3000],
    ("male", "19-30"): [1000, 0.90, 150, 8, 400, 2.3, 700, 55, 11, 3400],
    ("male", "31-50"): [1000, 0.90, 150, 8, 420, 2.3, 700, 55, 11, 3400],
    ("male", "51-70"): [1000, 0.90, 150, 8, 420, 2.3, 700, 55, 11, 3400],
    ("male", "71+"): [1200, 0.90, 150, 8, 420, 2.3, 700, 55, 11, 3400],
    ("female", "9-13"): [1300, 0.70, 120, 8, 240, 1.6, 1250, 40, 8, 2300],
    ("female", "14-18"): [1300, 0.89, 150, 15, 360, 1.6, 1250, 55, 9, 2300],
    ("female", "19-30"): [1000, 0.90, 150, 18, 310, 1.8, 700, 55, 8, 2600],
    ("female", "31-50"): [1000, 0.90, 150, 18, 320, 1.8, 700, 55, 8, 2600],
    ("female", "51-70"): [1200, 0.90, 150, 8, 320, 1.8, 700, 55, 8, 2600],
    ("female", "71+"): [1200, 0.90, 150, 8, 320, 1.8, 700, 55, 8, 2600],
    ("pregnancy", "14-18"): [1300, 1.00, 220, 27, 400, 2.0, 1250, 60, 12, 2600],
    ("pregnancy", "19-30"): [1000, 1.00, 220, 27, 350, 2.0, 700, 60, 11, 2900],
    ("pregnancy", "31-50"): [1000, 1.00, 220, 27, 360, 2.0, 700, 60, 11, 2900],
    ("lactation", "14-18"): [1300, 1.30, 290, 10, 360, 2.6, 1250, 70, 13, 2500],
    ("lactation", "19-30"): [1000, 1.30, 290, 9, 310, 2.6, 700, 70, 12, 2800],
    ("lactation", "31-50"): [1000, 1.30, 290, 9, 320, 2.6, 700, 70, 12, 2800],
}
US_M = {
    ("child", "1-3"): [13, 130, 19, 7, 0.7], ("child", "4-8"): [19, 130, 25, 10, 0.9],
    ("male", "9-13"): [34, 130, 31, 12, 1.2], ("male", "14-18"): [52, 130, 38, 16, 1.6],
    ("male", "19-30"): [56, 130, 38, 17, 1.6], ("male", "31-50"): [56, 130, 38, 17, 1.6],
    ("male", "51-70"): [56, 130, 30, 14, 1.6], ("male", "71+"): [56, 130, 30, 14, 1.6],
    ("female", "9-13"): [34, 130, 26, 10, 1.0], ("female", "14-18"): [46, 130, 26, 11, 1.1],
    ("female", "19-30"): [46, 130, 25, 12, 1.1], ("female", "31-50"): [46, 130, 25, 12, 1.1],
    ("female", "51-70"): [46, 130, 21, 11, 1.1], ("female", "71+"): [46, 130, 21, 11, 1.1],
    **{(s, g): [71, 175 if s == "pregnancy" else 210, 28 if s == "pregnancy" else 29, 13, 1.4 if s == "pregnancy" else 1.3]
       for s in ("pregnancy", "lactation") for g in ("14-18", "19-30", "31-50")},
}
# Tolerable Upper Intake Levels that apply to food (the magnesium, niacin,
# folate and vitamin E ULs cover supplements/fortificants only and are not
# applied). Vitamin A UL applies to preformed vitamin A (retinol).
# Columns: retinol µg, vitamin C mg, vitamin D µg, B6 mg, choline mg, calcium mg,
# copper mg, iodine µg, iron mg, manganese mg, phosphorus mg, selenium µg, zinc mg
US_UL_COLS = ["retinol", "vitaminC", "vitaminD", "vitaminB6", "choline", "calcium", "copper", "iodine", "iron",
              "manganese", "phosphorus", "selenium", "zinc"]
US_UL = {
    "1-3": [600, 400, 63, 30, 1000, 2500, 1.0, 200, 40, 2, 3000, 90, 7],
    "4-8": [900, 650, 75, 40, 1000, 2500, 3.0, 300, 40, 3, 3000, 150, 12],
    "9-13": [1700, 1200, 100, 60, 2000, 3000, 5.0, 600, 40, 6, 4000, 280, 23],
    "14-18": [2800, 1800, 100, 80, 3000, 3000, 8.0, 900, 45, 9, 4000, 400, 34],
    "19-30": [3000, 2000, 100, 100, 3500, 2500, 10.0, 1100, 45, 11, 4000, 400, 40],
    "31-50": [3000, 2000, 100, 100, 3500, 2500, 10.0, 1100, 45, 11, 4000, 400, 40],
    "51-70": [3000, 2000, 100, 100, 3500, 2000, 10.0, 1100, 45, 11, 4000, 400, 40],
    "71+": [3000, 2000, 100, 100, 3500, 2000, 10.0, 1100, 45, 11, 3000, 400, 40],
}
US_UL_PREG_P = 3500  # phosphorus UL in pregnancy
# Sodium Chronic Disease Risk Reduction intakes (mg/day): reduce if above.
US_SODIUM_CDRR = {"1-3": 1200, "4-8": 1500, "9-13": 1800, "14-18": 2300, "19-30": 2300, "31-50": 2300, "51-70": 2300, "71+": 2300}
# Approximate calorie needs, Dietary Guidelines for Americans 2020-2025
# (sedentary ranges; 61+ single values). Used only as a default band.
US_ENERGY = {
    ("child", "1-3"): (1000, 1200), ("child", "4-8"): (1000, 1400),
    ("male", "9-13"): (1400, 2000), ("male", "14-18"): (2000, 2400), ("male", "19-30"): (2200, 2600),
    ("male", "31-50"): (2200, 2600), ("male", "51-70"): (2000, 2600), ("male", "71+"): (1800, 2200),
    ("female", "9-13"): (1200, 1600), ("female", "14-18"): (1600, 1800), ("female", "19-30"): (1600, 2000),
    ("female", "31-50"): (1600, 2000), ("female", "51-70"): (1600, 2000), ("female", "71+"): (1440, 1760),
}
# Pantothenic acid adequate intakes (mg/day), same table.
US_PANTOTHENIC = {"1-3": 2, "4-8": 3, "9-13": 4, "14-18": 5, "19-30": 5, "31-50": 5, "51-70": 5, "71+": 5,
                  "pregnancy": 6, "lactation": 7}
US_AMDR_FAT = {"1-3": 40, "4-8": 35, "9-13": 35, "14-18": 35}  # upper % energy; adults 35


def add_us_uls(t: dict, group: str, stage: str, source: str, sodium: bool = True) -> None:
    vals = dict(zip(US_UL_COLS, US_UL[group]))
    if stage == "pregnancy":
        vals["phosphorus"] = US_UL_PREG_P
    for k, v in vals.items():
        put(t, k, "max", v, "abs", source, "Tolerable upper intake level")
    if sodium:
        put(t, "sodium", "max", US_SODIUM_CDRR[group], "abs", source, "Chronic disease risk reduction intake")


def build_uk() -> dict:
    profiles = []
    for sex in ("male", "female"):
        for g in UK_GROUPS:
            col = UK_COLS.index("19-64") if g in ("19-50", "51-64") else UK_COLS.index(g)
            t = {}
            for key, rows in UK.items():
                row = rows[0] if sex == "male" or len(rows) == 1 else rows[1]
                v = row[col]
                if key == "iron" and sex == "female" and g == "51-64":
                    v = 8.7  # PHE: 8.7 mg for women aged 50-64
                if v is None or key == "energy":
                    continue
                put(t, key, "max" if key in UK_MAX else "min", v, "abs", "phe-2016")
            for key, bound, pct, groups in UK_PCT:
                if g in groups:
                    put(t, key, bound, pct, "pctEnergy", "phe-2016")
            # UK salt limit already covers sodium, so the US sodium value is not added.
            add_us_uls(t, UK_TO_US_UL[g], sex, "nasem-dri-ul", sodium=False)
            if g in ("19-50", "51-64", "65-74", "75+"):
                add_aa(t)
            kcal = UK["energy"][0 if sex == "male" else 1][col]
            profiles.append({
                "id": f"{sex}-{g}", "stage": sex, "group": g, "label": f"{sex.title()}, {g} years",
                "energy": {"kcal": kcal, "low": round(kcal * 0.9), "high": round(kcal * 1.1),
                           "note": "PHE estimated average requirement (adults capped at 2500/2000 kcal); default band ±10%."},
                "defaultWeightKg": 70 if sex == "male" else 60,
                "targets": t,
            })
    return {
        "id": "uk", "name": "UK", "longName": "UK government dietary recommendations",
        "status": "available",
        "sources": [
            {"id": "phe-2016", "title": "Public Health England (2016) Government Dietary Recommendations", "url": "https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/618167/government_dietary_recommendations.pdf"},
            {"id": "nasem-dri-ul", "title": "Safety upper limits borrowed from US National Academies Tolerable Upper Intake Levels (the UK has no complete set)", "url": "https://www.ncbi.nlm.nih.gov/books/NBK545442/"},
            WHO_AA_SOURCE,
        ],
        "notes": [
            "Vitamin A is expressed in retinol equivalents by PHE and in retinol activity equivalents by USDA food data; plant sources of vitamin A may be slightly overestimated against the UK target.",
            "Free sugars (limit 5% of energy) are not assessed because food databases do not separate free from intrinsic sugars.",
            "Children under 5 are advised to take vitamin A, C and D supplements; women who could become pregnant are advised to take 400 µg folic acid daily.",
        ],
        "profiles": profiles,
    }


def build_us() -> dict:
    profiles = []
    stages = [("child", ["1-3", "4-8"]), ("male", US_GROUPS[2:]), ("female", US_GROUPS[2:]),
              ("pregnancy", ["14-18", "19-30", "31-50"]), ("lactation", ["14-18", "19-30", "31-50"])]
    for stage, groups in stages:
        for g in groups:
            t = {}
            for cols, table in ((US_COLS_V, US_V), (US_COLS_E, US_E), (US_COLS_M, US_M)):
                for k, v in zip(cols, table[(stage, g)]):
                    put(t, k, "min", v, "abs", "nasem-dri")
            add_us_uls(t, g, stage, "nasem-dri")
            put(t, "pantothenic", "min", US_PANTOTHENIC[stage if stage in ("pregnancy", "lactation") else g], "abs", "nasem-dri", "Adequate intake")
            put(t, "fat", "max", US_AMDR_FAT.get(g, 35), "pctEnergy", "nasem-dri", "Acceptable macronutrient distribution range")
            if g in ("19-30", "31-50", "51-70", "71+"):
                add_aa(t)
            base = "female" if stage in ("pregnancy", "lactation") else stage
            low, high = US_ENERGY[(base, g if (base, g) in US_ENERGY else "19-30")]
            note = "Dietary Guidelines for Americans 2020-2025 estimate (sedentary); raise it if you are active."
            if stage in ("pregnancy", "lactation"):
                note += " Pregnancy and breastfeeding usually need more energy than this non-pregnant default; ask your midwife or doctor."
            label_stage = {"child": "Child", "male": "Male", "female": "Female", "pregnancy": "Pregnant", "lactation": "Breastfeeding"}[stage]
            profiles.append({
                "id": f"{stage}-{g}", "stage": stage, "group": g, "label": f"{label_stage}, {g} years",
                "energy": {"kcal": round((low + high) / 2), "low": low, "high": high, "note": note},
                "defaultWeightKg": 70 if stage == "male" else (60 if stage != "child" else 20),
                "targets": t,
            })
    return {
        "id": "us", "name": "US", "longName": "US Dietary Reference Intakes (National Academies)",
        "status": "available",
        "sources": [
            {"id": "nasem-dri", "title": "National Academies (2019) Dietary Reference Intakes summary tables, Appendix J of DRIs for Sodium and Potassium", "url": "https://www.ncbi.nlm.nih.gov/books/NBK545442/"},
            {"id": "dga-2020", "title": "Dietary Guidelines for Americans 2020-2025, estimated calorie needs (via MSD Manual)", "url": "https://www.merckmanuals.com/home/multimedia/table/estimated-number-of-calories-needed-based-on-age-sex-and-activity-level"},
            WHO_AA_SOURCE,
        ],
        "notes": [
            "Upper limits for magnesium, niacin, folate and vitamin E apply to supplements and fortificants only, so they are not applied to food.",
            "The vitamin A upper limit applies to preformed vitamin A (retinol), not to carotenes from plants.",
            "Adults over 50 are advised to get most vitamin B12 from fortified foods or supplements.",
        ],
        "profiles": profiles,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for data in (build_uk(), build_us()):
        (OUT / f"{data['id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    (OUT / "eu.json").write_text(json.dumps({
        "id": "eu", "name": "EU", "longName": "EU reference values (EFSA)", "status": "planned",
        "notes": ["EFSA values are being transcribed and checked; not available yet."],
        "sources": [{"id": "efsa", "title": "EFSA Dietary Reference Values", "url": "https://www.efsa.europa.eu/en/topics/topic/dietary-reference-values"}],
        "profiles": [],
    }, indent=1) + "\n")
    (OUT / "index.json").write_text(json.dumps({"standards": ["uk", "us", "eu"]}, indent=1) + "\n")
    print("Wrote targets for uk, us (eu planned)")


if __name__ == "__main__":
    main()
