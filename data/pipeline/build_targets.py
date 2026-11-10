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
REGISTER = {r["id"]: r for r in json.loads((OUT.parent / "sources.json").read_text())["sources"]}


def ref(rid: str, role: str | None = None) -> dict:
    """A reference from data/sources.json (the site numbers and lists them from there)."""
    r = REGISTER[rid]
    out = {"id": rid, "title": r["title"], "url": r["url"]}
    if role:
        out["role"] = role
    return out


# ---------------------------------------------------------------------------
# Shared: WHO/FAO/UNU (2007) adult indispensable amino acid requirements,
# mg per kg body weight per day. WHO Technical Report Series 935, Table 23 (page 150):
# these are AVERAGE requirements. Section 8.4 (same page): safe levels of intake are
# 24% higher (coefficient of variation 12%, as for protein). The safe level is used as
# the target, to match the other nutrients' targets, which cover nearly everyone.
# Applied to adults (19+) in every standard; children are not assessed. Section 8.5:
# no separate values for older people, so the adult values apply at every adult age.
# ---------------------------------------------------------------------------
WHO_AA_SOURCE = None  # filled from the reference register below
WHO_AA = {"histidine": 10, "isoleucine": 20, "leucine": 39, "lysine": 30, "metCys": 15,
          "pheTyr": 25, "threonine": 15, "tryptophan": 4, "valine": 26}


def put(t: dict, key: str, bound: str, value, basis: str, source: str, note: str | None = None) -> None:
    b = {"value": value, "basis": basis, "source": source}
    if note:
        b["note"] = note
    t.setdefault(key, {})[bound] = b


WHO_SAFE_FACTOR = 1.24


def add_aa(t: dict) -> None:
    for k, v in WHO_AA.items():
        put(t, k, "min", round(v * WHO_SAFE_FACTOR, 2), "perKg", "who-2007",
            f"Safe level: average requirement {v} mg/kg (Table 23) plus 24% (section 8.4)")


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
    ("fat", "max", 35, {"4", "5-6", "7-10", "11-14", "15-18", "19-50", "51-64", "65-74", "75+"}),
    ("satfat", "max", 11, {"4", "5-6", "7-10", "11-14", "15-18", "19-50", "51-64", "65-74", "75+"}),
    ("carbohydrate", "min", 50, {"2-3", "4", "5-6", "7-10", "11-14", "15-18", "19-50", "51-64", "65-74", "75+"}),
]
# "4-6" is split because PHE gives fibre as 15 g at age 4 and 20 g at ages 5-6 (Table 1, page 6).
UK_GROUPS = ["1", "2-3", "4", "5-6", "7-10", "11-14", "15-18", "19-50", "51-64", "65-74", "75+"]
UK_COL_FOR = {"4": "4-6", "5-6": "4-6", "19-50": "19-64", "51-64": "19-64"}
# Which US group's safety limits to borrow for each UK group (the lower/younger
# where bands overlap, to stay conservative).
UK_TO_US_UL = {"1": "1-3", "2-3": "1-3", "4": "4-8", "5-6": "4-8", "7-10": "4-8", "11-14": "9-13", "15-18": "14-18",
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
# Estimated calorie needs, Dietary Guidelines for Americans 2020-2025, Appendix 2 (pages 139-140).
# Table A2-2, sedentary column, by single year of age: (male, female). Table A2-1 covers 12-23 months.
_DGA_SED = [  # (from age, to age, male, female)
    (2, 2, 1000, 1000), (3, 3, 1000, 1000), (4, 4, 1200, 1200), (5, 5, 1200, 1200), (6, 6, 1400, 1200),
    (7, 7, 1400, 1200), (8, 8, 1400, 1400), (9, 9, 1600, 1400), (10, 10, 1600, 1400), (11, 11, 1800, 1600),
    (12, 12, 1800, 1600), (13, 13, 2000, 1600), (14, 14, 2000, 1800), (15, 15, 2200, 1800), (16, 16, 2400, 1800),
    (17, 17, 2400, 1800), (18, 18, 2400, 1800), (19, 20, 2600, 2000), (21, 25, 2400, 2000), (26, 30, 2400, 1800),
    (31, 35, 2400, 1800), (36, 40, 2400, 1800), (41, 45, 2200, 1800), (46, 50, 2200, 1800), (51, 55, 2200, 1600),
    (56, 60, 2200, 1600), (61, 65, 2000, 1600), (66, 70, 2000, 1600), (71, 75, 2000, 1600), (76, 120, 2000, 1600),
]
DGA_AGE_1 = {"kcal": 900, "low": 800, "high": 1000}  # Table A2-1: 800-1,000 kcal at 12-23 months (both sexes)


def us_energy_by_age(sex: str, group: str) -> dict:
    """Exact sedentary estimate for each whole year of age in the group; default band +/-10%."""
    lo, hi = (int(x) for x in group.replace("+", "-120").split("-"))
    out = {}
    for age in range(lo, hi + 1):
        if age == 1:
            out["1"] = dict(DGA_AGE_1)
            continue
        row = next(r for r in _DGA_SED if r[0] <= age <= r[1])
        k = row[2] if sex == "male" else row[3]
        out[str(age)] = {"kcal": k, "low": round(k * 0.9), "high": round(k * 1.1)}
    return out


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
            col = UK_COLS.index(UK_COL_FOR.get(g, g))
            t = {}
            for key, rows in UK.items():
                row = rows[0] if sex == "male" or len(rows) == 1 else rows[1]
                v = row[col]
                if key == "iron" and sex == "female" and g == "51-64":
                    v = 8.7  # PHE: 8.7 mg for women aged 50-64
                if key == "fibre" and g == "5-6":
                    v = 20  # PHE Table 1: 20 g for 5-6 year olds
                if v is None or key == "energy":
                    continue
                put(t, key, "max" if key in UK_MAX else "min", v, "abs", "phe-2016")
            for key, bound, pct, groups in UK_PCT:
                if g in groups:
                    put(t, key, bound, pct, "pctEnergy", "phe-2016")
            # UK salt limit already covers sodium, so the US sodium value is not added.
            add_us_uls(t, UK_TO_US_UL[g], sex, "nasem-dri", sodium=False)
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
        "verified": {"checked": True, "date": "2026-11-09", "against": "Public Health England (2016) Government Dietary Recommendations PDF, Tables 1-6 (pages 6-11)"},
        "sources": [ref("phe-2016"), ref("nasem-dri", "Safety upper limits (the UK has no complete set)"), ref("who-2007", "Amino acids")],
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
            sex = "male" if stage == "male" else "female"  # children: DGA values for girls (lower), noted below
            by_age = us_energy_by_age(sex, g)
            first = by_age[str(int(g.split("-")[0].rstrip("+")))]
            note = "Dietary Guidelines for Americans 2020-2025 estimate for a sedentary person of your age and sex (Table A2-2); default band ±10%. Raise it if you are active."
            by_sex = None
            if stage == "child":
                note = "Dietary Guidelines for Americans 2020-2025 estimate for a sedentary child of this age and sex (Tables A2-1 and A2-2); default band ±10%."
                by_sex = {"male": us_energy_by_age("male", g), "female": by_age}
            if stage == "pregnancy":
                note += " In pregnancy the guidelines add about 340 kcal a day in the second trimester and 452 kcal in the third (Table A2-3); this default doesn't."
            if stage == "lactation":
                note += " While breastfeeding the guidelines add about 330 kcal a day in the first 6 months and 400 kcal after (Table A2-3); this default doesn't."
            label_stage = {"child": "Child", "male": "Male", "female": "Female", "pregnancy": "Pregnant", "lactation": "Breastfeeding"}[stage]
            profiles.append({
                "id": f"{stage}-{g}", "stage": stage, "group": g, "label": f"{label_stage}, {g} years",
                "energy": {**first, "note": note, **({"bySex": by_sex} if by_sex else {"byAge": by_age})},
                "defaultWeightKg": 70 if stage == "male" else (60 if stage != "child" else 20),
                "targets": t,
            })
    return {
        "id": "us", "name": "US", "longName": "US Dietary Reference Intakes (National Academies)",
        "status": "available",
        "verified": {"checked": True, "date": "2026-11-10", "against": "National Academies DRI summary table PDFs (RDA and AI for vitamins, elements, water and macronutrients; upper limits; chronic disease risk reduction; macronutrient ranges) and Dietary Guidelines for Americans 2020-2025, Appendix 2"},
        "sources": [ref("nasem-dri"), ref("dga-2020", "Calorie estimates"), ref("who-2007", "Amino acids")],
        "notes": [
            "Upper limits for magnesium, niacin, folate and vitamin E apply to supplements and fortificants only, so they are not applied to food.",
            "The vitamin A upper limit applies to preformed vitamin A (retinol), not to carotenes from plants.",
            "Adults over 50 are advised to get most vitamin B12 from fortified foods or supplements.",
        ],
        "profiles": profiles,
    }


# ---------------------------------------------------------------------------
# EU: EFSA Dietary Reference Values, summary tables (EFSA 2017), as reproduced
# in Gibson, Principles of Nutritional Assessment (nutritionalassessment.org,
# appendix tables for EFSA reference intakes). PRI where set, otherwise AI.
# Groups: 1-3, 4-6, 7-10, 11-14, 15-17, 18-24, 25-50, 51+ (51+ uses the
# post-menopausal iron value for women, an age proxy).
# Each row: value per group in that order; (male, female) tuples where they differ.
# ---------------------------------------------------------------------------
EU_GROUPS = ["1-3", "4-6", "7-10", "11-14", "15-17", "18-24", "25-50", "51+"]
EU_ABS = {
    # vitamins
    "vitaminA":   ([250, 300, 400, 600, 750, 750, 750, 750], [250, 300, 400, 600, 650, 650, 650, 650]),
    "vitaminD":   ([15] * 8,),
    "vitaminE":   ([6, 9, 9, 13, 13, 13, 13, 13], [6, 9, 9, 11, 11, 11, 11, 11]),   # EFSA bands 1-2, 3-9, 10-17, adults
    "vitaminK":   ([12, 20, 30, 45, 65, 70, 70, 70],),
    "vitaminC":   ([20, 30, 45, 70, 100, 110, 110, 110], [20, 30, 45, 70, 90, 95, 95, 95]),
    "riboflavin": ([0.6, 0.7, 1.0, 1.4, 1.6, 1.6, 1.6, 1.6],),
    "vitaminB6":  ([0.6, 0.7, 1.0, 1.4, 1.7, 1.7, 1.7, 1.7], [0.6, 0.7, 1.0, 1.4, 1.6, 1.6, 1.6, 1.6]),
    "folate":     ([120, 140, 200, 270, 330, 330, 330, 330],),
    "vitaminB12": ([1.5, 1.5, 2.5, 3.5, 4.0, 4.0, 4.0, 4.0],),
    "choline":    ([140, 170, 250, 340, 400, 400, 400, 400],),
    "pantothenic": ([4, 4, 4, 5, 5, 5, 5, 5],),
    # minerals
    "calcium":    ([450, 800, 800, 1150, 1150, 1000, 950, 950],),
    "iodine":     ([90, 90, 90, 120, 130, 150, 150, 150],),
    "manganese":  ([0.5, 1.0, 1.5, 2.0, 3.0, 3.0, 3.0, 3.0],),
    "phosphorus": ([250, 440, 440, 640, 640, 550, 550, 550],),
    "potassium":  ([800, 1100, 1800, 2700, 3500, 3500, 3500, 3500],),
    "selenium":   ([15, 20, 35, 55, 70, 70, 70, 70],),
    "iron":       ([7, 7, 11, 11, 11, 11, 11, 11], [7, 7, 11, 13, 13, 16, 16, 11]),
    "zinc":       ([4.3, 5.5, 7.4, 10.7, 14.2, 11.7, 11.7, 11.7], [4.3, 5.5, 7.4, 10.7, 11.9, 9.3, 9.3, 9.3]),  # adults at moderate phytate (600 mg/d)
    "copper":     ([0.7, 1.0, 1.0, 1.3, 1.3, 1.6, 1.6, 1.6], [0.7, 1.0, 1.0, 1.1, 1.1, 1.3, 1.3, 1.3]),      # EFSA bands 1-2, 3-9, 10-17, adults
    "magnesium":  ([170, 230, 230, 300, 300, 350, 350, 350], [170, 230, 230, 250, 250, 300, 300, 300]),
    "fibre":      ([10, 14, 16, 19, 21, 25, 25, 25],),
}
EU_PREG = {"vitaminA": 700, "vitaminD": 15, "vitaminE": 11, "vitaminK": 70, "vitaminC": 105, "riboflavin": 1.9, "vitaminB6": 1.8,
           "folate": 600, "vitaminB12": 4.5, "choline": 480, "pantothenic": 5, "calcium": 950, "iodine": 200, "manganese": 3.0,
           "phosphorus": 550, "potassium": 3500, "selenium": 70, "iron": 16, "zinc": 9.3 + 1.6, "copper": 1.5, "magnesium": 300, "fibre": 25}
EU_LACT = {**EU_PREG, "vitaminA": 1300, "vitaminC": 155, "riboflavin": 2.0, "vitaminB6": 1.7, "folate": 500, "vitaminB12": 5.0,
           "choline": 520, "pantothenic": 7, "potassium": 4000, "selenium": 85, "zinc": 9.3 + 2.9}
# Protein PRI, g per kg body weight per day, by year of age (EFSA 2017, Table 3, page 24).
EU_PROTEIN_AGE = {
    "male":   {1: 1.14, 2: 0.97, 3: 0.90, 4: 0.86, 5: 0.85, 6: 0.89, 7: 0.91, 8: 0.92, 9: 0.92, 10: 0.91,
               11: 0.91, 12: 0.90, 13: 0.90, 14: 0.89, 15: 0.88, 16: 0.87, 17: 0.86},
    "female": {1: 1.14, 2: 0.97, 3: 0.90, 4: 0.86, 5: 0.85, 6: 0.89, 7: 0.91, 8: 0.92, 9: 0.92, 10: 0.91,
               11: 0.90, 12: 0.89, 13: 0.88, 14: 0.87, 15: 0.85, 16: 0.84, 17: 0.83},
}
EU_PROTEIN_ADULT = 0.83
# Nutrients whose EFSA age bands differ from the planner's; looked up by exact age.
# Vitamin E (Tables 9/11, pages 72/74): 1-2 y 6, 3-9 y 9, 10-17 y 13 (M) / 11 (F).
# Copper and magnesium (Tables 5/7, pages 45/47): 1-2, 3-9, 10-17 years.
# Iron, girls (Table 7): 7-11 y 11, 12-14 y 13, 15-17 y 13.
def _bands(spec):  # [(from, to, value)] -> {age: value}
    return {a: v for lo, hi, v in spec for a in range(lo, hi + 1)}
EU_BY_AGE = {
    "vitaminE":  {"male": _bands([(1, 2, 6), (3, 9, 9), (10, 17, 13)]), "female": _bands([(1, 2, 6), (3, 9, 9), (10, 17, 11)])},
    "copper":    {"male": _bands([(1, 2, 0.7), (3, 9, 1.0), (10, 17, 1.3)]), "female": _bands([(1, 2, 0.7), (3, 9, 1.0), (10, 17, 1.1)])},
    "magnesium": {"male": _bands([(1, 2, 170), (3, 9, 230), (10, 17, 300)]), "female": _bands([(1, 2, 170), (3, 9, 230), (10, 17, 250)])},
    "iron":      {"female": _bands([(1, 6, 7), (7, 11, 11), (12, 17, 13)])},
}
# Total fat reference intake (upper end, % energy): 35-40% at ages 1-3, 20-35% from 4 (Table 2, page 23).
EU_FAT_MAX = {"1-3": 40}
EU_PROTEIN_EXTRA = {"pregnancy": 9, "lactation": 19}   # g/day added (2nd trimester; first 6 months)
# EFSA reference body weights (Table 17, page 91), used as the default weight until the person enters theirs.
REF_WEIGHT = {"1-3": (12.2, 11.5), "4-6": (19.2, 18.7), "7-10": (29.0, 28.4), "11-14": (44.0, 45.1), "15-17": (64.1, 56.4),
              "adult": (68.1, 58.5), "pregnant": (None, 70.5)}
EU_TO_US_UL = {"1-3": "1-3", "4-6": "4-8", "7-10": "4-8", "11-14": "9-13", "15-17": "14-18", "18-24": "19-30", "25-50": "31-50", "51+": "51-70"}
EU_TO_UK_ENERGY = {"1-3": "2-3", "4-6": "4-6", "7-10": "7-10", "11-14": "11-14", "15-17": "15-18", "18-24": "19-64", "25-50": "19-64", "51+": "65-74"}


def eu_targets(sex: str, g: str, stage: str) -> dict:
    t: dict = {}
    if stage in ("pregnancy", "lactation"):
        for k, v in (EU_PREG if stage == "pregnancy" else EU_LACT).items():
            put(t, k, "min", round(v, 2), "abs", "efsa-2017")
    else:
        i = EU_GROUPS.index(g)
        for k, rows in EU_ABS.items():
            row = rows[0] if sex == "male" or len(rows) == 1 else rows[1]
            put(t, k, "min", row[i], "abs", "efsa-2017")
    put(t, "thiamin", "min", 0.1, "perMJ", "efsa-2017", "0.1 mg per MJ of energy")
    put(t, "niacinNE", "min", 1.6, "perMJ", "efsa-2017", "1.6 mg niacin equivalents per MJ of energy")
    put(t, "fat", "max", EU_FAT_MAX.get(g, 35), "pctEnergy", "efsa-2017", "Reference intake range " + ("35-40" if g in EU_FAT_MAX else "20-35") + "% of energy")
    if stage not in ("pregnancy", "lactation") and g in ("1-3", "4-6", "7-10", "11-14", "15-17"):
        for k, by_sex in EU_BY_AGE.items():
            if sex in by_sex:
                t[k]["min"]["byAge"] = {str(a): v for a, v in by_sex[sex].items()}
    put(t, "carbohydrate", "min", 45, "pctEnergy", "efsa-2017", "Reference intake range 45-60% of energy")
    put(t, "la", "min", 4, "pctEnergy", "efsa-2017", "Adequate intake")
    put(t, "ala", "min", 0.5, "pctEnergy", "efsa-2017", "Adequate intake")
    put(t, "epaDha", "min", 350 if stage in ("pregnancy", "lactation") else 250, "abs", "efsa-2017",
        "Adequate intake" + (" (250 mg plus 100-200 mg DHA)" if stage in ("pregnancy", "lactation")
                             else " (100 mg of DHA under age 2)" if g == "1-3" else ""))
    put(t, "protein", "min", round(EU_PROTEIN_ADULT * 1000), "perKg", "efsa-2017", "Population reference intake per kg body weight"
        + (f", plus {EU_PROTEIN_EXTRA[stage]} g/day ({'second trimester' if stage == 'pregnancy' else 'first 6 months'})" if stage in EU_PROTEIN_EXTRA else ""))
    if stage in EU_PROTEIN_EXTRA:
        t["protein"]["min"]["extraG"] = EU_PROTEIN_EXTRA[stage]
    elif g in ("1-3", "4-6", "7-10", "11-14", "15-17"):
        t["protein"]["min"]["byAge"] = {str(a): round(v * 1000) for a, v in EU_PROTEIN_AGE[sex].items()}
    # EFSA sets no numeric limit for saturated fat ("as low as possible") or salt in these tables, so the
    # US tolerable upper intake levels and sodium risk-reduction intake are borrowed, as for the UK.
    add_us_uls(t, EU_TO_US_UL["25-50" if stage in ("pregnancy", "lactation") else g], stage if stage in ("pregnancy", "lactation") else sex, "nasem-dri")
    if g in ("18-24", "25-50", "51+") or stage in ("pregnancy", "lactation"):
        add_aa(t)
    return t


def build_eu() -> dict:
    profiles = []
    for sex in ("male", "female"):
        for g in EU_GROUPS:
            ukg = EU_TO_UK_ENERGY[g]
            col = UK_COLS.index(ukg)
            kcal = UK["energy"][0 if sex == "male" else 1][col]
            profiles.append({
                "id": f"{sex}-{g}", "stage": sex, "group": g, "label": f"{sex.title()}, {g} years",
                "energy": {"kcal": kcal, "low": round(kcal * 0.9), "high": round(kcal * 1.1),
                           "note": "EFSA's energy needs depend on activity level, so the UK estimate for this age is used as a default; adjust it if you're more active."},
                "defaultWeightKg": REF_WEIGHT.get(g, REF_WEIGHT["adult"])[0 if sex == "male" else 1],
                "targets": eu_targets(sex, g, sex),
            })
    for stage in ("pregnancy", "lactation"):
        profiles.append({
            "id": f"{stage}-18-50", "stage": stage, "group": "18-50", "label": f"{'Pregnant' if stage == 'pregnancy' else 'Breastfeeding'}, 18-50 years",
            "energy": {"kcal": 2000, "low": 1800, "high": 2400,
                       "note": "Energy needs rise in later pregnancy and while breastfeeding; ask your midwife or doctor."},
            "defaultWeightKg": 70.5 if stage == "pregnancy" else 58.5, "targets": eu_targets("female", "25-50", stage),
        })
    return {
        "id": "eu", "name": "EU", "longName": "EU Dietary Reference Values (EFSA)", "status": "available",
        "verified": {"checked": True, "date": "2026-11-09", "against": "EFSA (2017) Dietary Reference Values for nutrients: Summary report, Tables 2, 3, 5, 7, 9, 11 and 17"},
        "sources": [ref("efsa-2017"), ref("nasem-dri", "Safety upper limits (EFSA tables give no complete set)"), ref("who-2007", "Amino acids")],
        "notes": [
            "Values are population reference intakes (PRI) where EFSA set one, otherwise adequate intakes (AI), from the EFSA 2017 summary report (Tables 2, 3, 5, 7, 9 and 11).",
            "For children, protein, vitamin E, copper, magnesium and girls' iron follow EFSA's exact age bands; protein uses EFSA's value for each year of age.",
            "Pregnancy protein uses EFSA's second-trimester increase (+9 g/day; it is +1 g in the first and +28 g in the third). Breastfeeding uses the first-6-months increase (+19 g/day).",
            "EFSA gives no separate fibre or carbohydrate values for pregnancy and breastfeeding; adult values are used.",
            "Adult zinc assumes a moderate phytate intake (600 mg/day); diets rich in wholegrains and pulses have more phytate and need more zinc (up to 16.3 mg for men and 12.7 mg for women).",
            "Iron for women aged 51+ uses EFSA's post-menopausal value (11 mg) as an age-based approximation.",
            "Thiamin and niacin are set per unit of energy, so they rise with the calorie range.",
            "EFSA sets no numeric limit for saturated fat (as low as possible) and had not set sodium values in these tables; US limits are used for safety checks.",
            "Vitamin A is expressed in retinol equivalents by EFSA and in retinol activity equivalents by USDA food data.",
        ],
        "profiles": profiles,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for data in (build_uk(), build_us(), build_eu()):
        (OUT / f"{data['id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    (OUT / "index.json").write_text(json.dumps({"standards": ["uk", "us", "eu"]}, indent=1) + "\n")
    print("Wrote targets for uk, us, eu")


if __name__ == "__main__":
    main()
