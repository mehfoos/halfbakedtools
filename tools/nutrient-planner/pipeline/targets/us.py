"""US: National Academies Dietary Reference Intakes (DRI) and Dietary Guidelines for Americans 2020-2025.

DRI values are from the National Academies summary tables (the table PDFs archived in sources/,
nasem-dri-*.pdf): RDA or AI values, in the tables' own age groups. Calorie estimates and the
saturated fat limit are from the Dietary Guidelines.

The tolerable upper intake levels here are also used by the UK and EU standards, which have no
complete set of their own (see add_upper_limits).
"""
from __future__ import annotations

from .common import add_amino_acids, age_range, check_rows, energy_band, put, ref, years

GROUPS = ["1-3", "4-8", "9-13", "14-18", "19-30", "31-50", "51-70", "71+"]
ADULT_GROUPS = ("19-30", "31-50", "51-70", "71+")
STAGES = [("child", ["1-3", "4-8"]), ("male", GROUPS[2:]), ("female", GROUPS[2:]),
          ("pregnancy", ["14-18", "19-30", "31-50"]), ("lactation", ["14-18", "19-30", "31-50"])]

# ---------------------------------------------------------------------------
# RDA or AI, by (life stage, group); values in the column order given.
# ---------------------------------------------------------------------------
# Vitamins table.
COLS_VITAMINS = ["vitaminA", "vitaminC", "vitaminD", "vitaminE", "vitaminK", "thiamin", "riboflavin", "niacinNE",
                 "vitaminB6", "folate", "vitaminB12", "choline"]
VITAMINS = {
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

# Elements table. Copper converted from µg to mg.
COLS_ELEMENTS = ["calcium", "copper", "iodine", "iron", "magnesium", "manganese", "phosphorus", "selenium", "zinc", "potassium"]
ELEMENTS = {
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

# Macronutrients table (protein, carbohydrate, fibre, linoleic acid, alpha-linolenic acid), g/day.
COLS_MACROS = ["protein", "carbohydrate", "fibre", "la", "ala"]
MACROS = {
    ("child", "1-3"): [13, 130, 19, 7, 0.7], ("child", "4-8"): [19, 130, 25, 10, 0.9],
    ("male", "9-13"): [34, 130, 31, 12, 1.2], ("male", "14-18"): [52, 130, 38, 16, 1.6],
    ("male", "19-30"): [56, 130, 38, 17, 1.6], ("male", "31-50"): [56, 130, 38, 17, 1.6],
    ("male", "51-70"): [56, 130, 30, 14, 1.6], ("male", "71+"): [56, 130, 30, 14, 1.6],
    ("female", "9-13"): [34, 130, 26, 10, 1.0], ("female", "14-18"): [46, 130, 26, 11, 1.1],
    ("female", "19-30"): [46, 130, 25, 12, 1.1], ("female", "31-50"): [46, 130, 25, 12, 1.1],
    ("female", "51-70"): [46, 130, 21, 11, 1.1], ("female", "71+"): [46, 130, 21, 11, 1.1],
    ("pregnancy", "14-18"): [71, 175, 28, 13, 1.4], ("pregnancy", "19-30"): [71, 175, 28, 13, 1.4],
    ("pregnancy", "31-50"): [71, 175, 28, 13, 1.4],
    ("lactation", "14-18"): [71, 210, 29, 13, 1.3], ("lactation", "19-30"): [71, 210, 29, 13, 1.3],
    ("lactation", "31-50"): [71, 210, 29, 13, 1.3],
}

# Pantothenic acid adequate intakes (mg/day), vitamins table.
PANTOTHENIC = {"1-3": 2, "4-8": 3, "9-13": 4, "14-18": 5, "19-30": 5, "31-50": 5, "51-70": 5, "71+": 5,
               "pregnancy": 6, "lactation": 7}

check_rows(VITAMINS, len(COLS_VITAMINS), "US vitamins")
check_rows(ELEMENTS, len(COLS_ELEMENTS), "US elements")
check_rows(MACROS, len(COLS_MACROS), "US macronutrients")

# ---------------------------------------------------------------------------
# Upper limits
# ---------------------------------------------------------------------------
# Tolerable Upper Intake Levels that apply to food (the magnesium, niacin, folate and vitamin E ULs
# cover supplements/fortificants only and are not applied). The vitamin A UL applies to preformed
# vitamin A (retinol). Columns: retinol µg, vitamin C mg, vitamin D µg, B6 mg, choline mg, calcium mg,
# copper mg, iodine µg, iron mg, manganese mg, phosphorus mg, selenium µg, zinc mg.
UL_COLS = ["retinol", "vitaminC", "vitaminD", "vitaminB6", "choline", "calcium", "copper", "iodine", "iron",
           "manganese", "phosphorus", "selenium", "zinc"]
UL = {
    "1-3": [600, 400, 63, 30, 1000, 2500, 1.0, 200, 40, 2, 3000, 90, 7],
    "4-8": [900, 650, 75, 40, 1000, 2500, 3.0, 300, 40, 3, 3000, 150, 12],
    "9-13": [1700, 1200, 100, 60, 2000, 3000, 5.0, 600, 40, 6, 4000, 280, 23],
    "14-18": [2800, 1800, 100, 80, 3000, 3000, 8.0, 900, 45, 9, 4000, 400, 34],
    "19-30": [3000, 2000, 100, 100, 3500, 2500, 10.0, 1100, 45, 11, 4000, 400, 40],
    "31-50": [3000, 2000, 100, 100, 3500, 2500, 10.0, 1100, 45, 11, 4000, 400, 40],
    "51-70": [3000, 2000, 100, 100, 3500, 2000, 10.0, 1100, 45, 11, 4000, 400, 40],
    "71+": [3000, 2000, 100, 100, 3500, 2000, 10.0, 1100, 45, 11, 3000, 400, 40],
}
UL_PHOSPHORUS_PREGNANCY = 3500
check_rows(UL, len(UL_COLS), "US upper limits")

# Sodium Chronic Disease Risk Reduction intakes (mg/day): reduce if above.
SODIUM_CDRR = {"1-3": 1200, "4-8": 1500, "9-13": 1800, "14-18": 2300, "19-30": 2300, "31-50": 2300, "51-70": 2300, "71+": 2300}

# Acceptable macronutrient distribution range for fat, upper end (% energy); adults 35.
FAT_AMDR_MAX = {"1-3": 40, "4-8": 35, "9-13": 35, "14-18": 35}

# Dietary Guidelines for Americans 2020-2025, Executive Summary, page x: "Saturated fat - Less than 10 percent
# of calories per day starting at age 2." (Added sugars have the same limit but can't be assessed from food data.)
SATFAT_MAX_PCT = 10
SATFAT_FROM_AGE = 2

# ---------------------------------------------------------------------------
# Calories: Dietary Guidelines for Americans 2020-2025, Appendix 2 (pages 139-140).
# Table A2-2, sedentary column, by single year of age: (from age, to age, male, female).
# Table A2-1 covers 12-23 months.
# ---------------------------------------------------------------------------
DGA_SEDENTARY = [
    (2, 2, 1000, 1000), (3, 3, 1000, 1000), (4, 4, 1200, 1200), (5, 5, 1200, 1200), (6, 6, 1400, 1200),
    (7, 7, 1400, 1200), (8, 8, 1400, 1400), (9, 9, 1600, 1400), (10, 10, 1600, 1400), (11, 11, 1800, 1600),
    (12, 12, 1800, 1600), (13, 13, 2000, 1600), (14, 14, 2000, 1800), (15, 15, 2200, 1800), (16, 16, 2400, 1800),
    (17, 17, 2400, 1800), (18, 18, 2400, 1800), (19, 20, 2600, 2000), (21, 25, 2400, 2000), (26, 30, 2400, 1800),
    (31, 35, 2400, 1800), (36, 40, 2400, 1800), (41, 45, 2200, 1800), (46, 50, 2200, 1800), (51, 55, 2200, 1600),
    (56, 60, 2200, 1600), (61, 65, 2000, 1600), (66, 70, 2000, 1600), (71, 75, 2000, 1600), (76, 120, 2000, 1600),
]
DGA_AGE_1 = {"kcal": 900, "low": 800, "high": 1000}  # Table A2-1: 800-1,000 kcal at 12-23 months (both sexes)


def energy_by_age(sex: str, group: str) -> dict:
    """Exact sedentary estimate for each whole year of age in the group; default band +/-10%."""
    lo, hi = age_range(group)
    out = {}
    for age in range(lo, hi + 1):
        if age == 1:
            out["1"] = dict(DGA_AGE_1)
            continue
        row = next(r for r in DGA_SEDENTARY if r[0] <= age <= r[1])
        out[str(age)] = energy_band(row[2] if sex == "male" else row[3])
    return out


def add_upper_limits(t: dict, group: str, stage: str, sodium: bool = True) -> None:
    """The US upper limits for an age group. The UK and EU use these too (with sodium=False)."""
    values = dict(zip(UL_COLS, UL[group]))
    if stage == "pregnancy":
        values["phosphorus"] = UL_PHOSPHORUS_PREGNANCY
    for k, v in values.items():
        put(t, k, "max", v, "abs", "nasem-dri", "Tolerable upper intake level")
    if sodium:
        put(t, "sodium", "max", SODIUM_CDRR[group], "abs", "nasem-dri", "Chronic disease risk reduction intake")


def targets(stage: str, g: str) -> dict:
    t: dict = {}
    for cols, table in ((COLS_VITAMINS, VITAMINS), (COLS_ELEMENTS, ELEMENTS), (COLS_MACROS, MACROS)):
        for k, v in zip(cols, table[(stage, g)]):
            put(t, k, "min", v, "abs", "nasem-dri")
    add_upper_limits(t, g, stage)
    put(t, "pantothenic", "min", PANTOTHENIC[stage if stage in ("pregnancy", "lactation") else g], "abs", "nasem-dri", "Adequate intake")
    put(t, "fat", "max", FAT_AMDR_MAX.get(g, 35), "pctEnergy", "nasem-dri", "Acceptable macronutrient distribution range")
    put(t, "satfat", "max", SATFAT_MAX_PCT, "pctEnergy", "dga-2020", "Dietary Guidelines: less than 10% of calories, from age 2")["fromAge"] = SATFAT_FROM_AGE
    if g in ADULT_GROUPS:
        add_amino_acids(t)
    return t


ENERGY_NOTE = "Dietary Guidelines for Americans 2020-2025 estimate for a sedentary person of your age and sex (Table A2-2); default band ±10%. Raise it if you are active."
ENERGY_NOTE_CHILD = "Dietary Guidelines for Americans 2020-2025 estimate for a sedentary child of this age and sex (Tables A2-1 and A2-2); default band ±10%."
ENERGY_NOTE_EXTRA = {
    "pregnancy": " In pregnancy the guidelines add about 340 kcal a day in the second trimester and 452 kcal in the third (Table A2-3); this default doesn't.",
    "lactation": " While breastfeeding the guidelines add about 330 kcal a day in the first 6 months and 400 kcal after (Table A2-3); this default doesn't.",
}
STAGE_LABEL = {"child": "Child", "male": "Male", "female": "Female", "pregnancy": "Pregnant", "lactation": "Breastfeeding"}


def energy(stage: str, g: str) -> dict:
    # Children's groups cover both sexes: calories are given for each sex (the default shown is for girls, the lower).
    sex = "male" if stage == "male" else "female"
    by_age = energy_by_age(sex, g)
    first = by_age[str(age_range(g)[0])]
    if stage == "child":
        return {**first, "note": ENERGY_NOTE_CHILD, "bySex": {"male": energy_by_age("male", g), "female": by_age}}
    return {**first, "note": ENERGY_NOTE + ENERGY_NOTE_EXTRA.get(stage, ""), "byAge": by_age}


def build() -> dict:
    profiles = [{
        "id": f"{stage}-{g}", "stage": stage, "group": g, "label": f"{STAGE_LABEL[stage]}, {years(g)}",
        "energy": energy(stage, g),
        "defaultWeightKg": 70 if stage == "male" else (60 if stage != "child" else 20),
        "targets": targets(stage, g),
    } for stage, groups in STAGES for g in groups]
    return {
        "id": "us", "name": "US", "longName": "US Dietary Reference Intakes (National Academies)",
        "status": "available",
        "verified": {"checked": True, "date": "2026-11-10", "against": "National Academies DRI summary table PDFs (RDA and AI for vitamins, elements, water and macronutrients; upper limits; chronic disease risk reduction; macronutrient ranges) and Dietary Guidelines for Americans 2020-2025, Appendix 2 and Executive Summary"},
        "sources": [ref("nasem-dri"), ref("dga-2020", "Calorie estimates and saturated fat limit"), ref("who-2007", "Amino acids")],
        "notes": [
            "Upper limits for magnesium, niacin, folate and vitamin E apply to supplements and fortificants only, so they are not applied to food.",
            "The vitamin A upper limit applies to preformed vitamin A (retinol), not to carotenes from plants.",
            "Adults over 50 are advised to get most vitamin B12 from fortified foods or supplements.",
            "Saturated fat follows the Dietary Guidelines for Americans (less than 10% of calories, from age 2). The same guidelines limit added sugars to less than 10% of calories; that isn't assessed because the food data doesn't separate added from natural sugars.",
        ],
        "profiles": profiles,
    }
