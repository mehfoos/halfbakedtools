"""EU: EFSA (2017) Dietary Reference Values for nutrients: Summary report (archived as
sources/efsa-2017-drv-summary-report.pdf), and EFSA (2019) Dietary reference values for sodium.

Values are population reference intakes (PRI) where EFSA set one, otherwise adequate intakes (AI).
EFSA gives no complete set of upper limits, so the US ones are borrowed (see us.py); amino acids
use the WHO values (see common.py).
"""
from __future__ import annotations

from . import us
from .common import add_amino_acids, age_range, check_rows, energy_band, put, ref, years

# ---------------------------------------------------------------------------
# The planner's groups: 1-3, 4-6, 7-10, 11-14, 15-17, 18-24, 25-50, 51+ (51+ uses the
# post-menopausal iron value for women, an age proxy).
# Each row: value per group in that order; (male, female) where they differ.
# ---------------------------------------------------------------------------
GROUPS = ["1-3", "4-6", "7-10", "11-14", "15-17", "18-24", "25-50", "51+"]
TABLE = {
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
check_rows(TABLE, len(GROUPS), "EU table")
CHILD_GROUPS = ("1-3", "4-6", "7-10", "11-14", "15-17")
ADULT_GROUPS = ("18-24", "25-50", "51+")

# Pregnancy and breastfeeding (lactation: first 6 months). Zinc is the adult value plus EFSA's increase.
PREGNANCY = {"vitaminA": 700, "vitaminD": 15, "vitaminE": 11, "vitaminK": 70, "vitaminC": 105, "riboflavin": 1.9, "vitaminB6": 1.8,
             "folate": 600, "vitaminB12": 4.5, "choline": 480, "pantothenic": 5, "calcium": 950, "iodine": 200, "manganese": 3.0,
             "phosphorus": 550, "potassium": 3500, "selenium": 70, "iron": 16, "zinc": 9.3 + 1.6, "copper": 1.5, "magnesium": 300, "fibre": 25}
LACTATION = {**PREGNANCY, "vitaminA": 1300, "vitaminC": 155, "riboflavin": 2.0, "vitaminB6": 1.7, "folate": 500, "vitaminB12": 5.0,
             "choline": 520, "pantothenic": 7, "potassium": 4000, "selenium": 85, "zinc": 9.3 + 2.9}
PROTEIN_EXTRA_G = {"pregnancy": 9, "lactation": 19}   # g/day added (2nd trimester; first 6 months)

# Protein PRI, g per kg body weight per day, by year of age (Table 3, page 24); adults 0.83.
PROTEIN_BY_AGE = {
    "male":   {1: 1.14, 2: 0.97, 3: 0.90, 4: 0.86, 5: 0.85, 6: 0.89, 7: 0.91, 8: 0.92, 9: 0.92, 10: 0.91,
               11: 0.91, 12: 0.90, 13: 0.90, 14: 0.89, 15: 0.88, 16: 0.87, 17: 0.86},
    "female": {1: 1.14, 2: 0.97, 3: 0.90, 4: 0.86, 5: 0.85, 6: 0.89, 7: 0.91, 8: 0.92, 9: 0.92, 10: 0.91,
               11: 0.90, 12: 0.89, 13: 0.88, 14: 0.87, 15: 0.85, 16: 0.84, 17: 0.83},
}
PROTEIN_ADULT = 0.83


def _bands(spec):  # [(from, to, value)] -> {age: value}
    return {a: v for lo, hi, v in spec for a in range(lo, hi + 1)}


# Nutrients whose EFSA age bands differ from the planner's groups; looked up by exact age.
# Vitamin E (Tables 9/11, pages 72/74): 1-2 y 6, 3-9 y 9, 10-17 y 13 (M) / 11 (F).
# Copper and magnesium (Tables 5/7, pages 45/47): 1-2, 3-9, 10-17 years.
# Iron, girls (Table 7): 7-11 y 11, 12-14 y 13, 15-17 y 13.
BY_AGE = {
    "vitaminE":  {"male": _bands([(1, 2, 6), (3, 9, 9), (10, 17, 13)]), "female": _bands([(1, 2, 6), (3, 9, 9), (10, 17, 11)])},
    "copper":    {"male": _bands([(1, 2, 0.7), (3, 9, 1.0), (10, 17, 1.3)]), "female": _bands([(1, 2, 0.7), (3, 9, 1.0), (10, 17, 1.1)])},
    "magnesium": {"male": _bands([(1, 2, 170), (3, 9, 230), (10, 17, 300)]), "female": _bands([(1, 2, 170), (3, 9, 230), (10, 17, 250)])},
    "iron":      {"female": _bands([(1, 6, 7), (7, 11, 11), (12, 17, 13)])},
}

# Total fat reference intake (upper end, % energy): 35-40% at ages 1-3, 20-35% from 4 (Table 2, page 23).
FAT_MAX = {"1-3": 40}

# Sodium, "safe and adequate intake", g/day: EFSA (2019) Dietary reference values for sodium, Table 12 (page 50).
# Adults 2.0 g, which also applies in pregnancy and lactation. EFSA notes the concern in Europe is excess
# intake and that the values can inform reduction goals, so the planner uses it as a level to stay at or below.
SODIUM_G = {"1-3": 1.1, "4-6": 1.3, "7-10": 1.7, "11-14": 2.0, "15-17": 2.0, "18-24": 2.0, "25-50": 2.0, "51+": 2.0}

# EFSA reference body weights (Table 17, page 91), used as the default weight until the person enters theirs.
REF_WEIGHT = {"1-3": (12.2, 11.5), "4-6": (19.2, 18.7), "7-10": (29.0, 28.4), "11-14": (44.0, 45.1), "15-17": (64.1, 56.4),
              "adult": (68.1, 58.5), "pregnant": (None, 70.5)}

# Which US group's upper limits to borrow for each EU group.
US_UL_GROUP = {"1-3": "1-3", "4-6": "4-8", "7-10": "4-8", "11-14": "9-13", "15-17": "14-18", "18-24": "19-30", "25-50": "31-50", "51+": "51-70"}

# ---------------------------------------------------------------------------
# Calories: average requirement for energy, MJ/day, Table 1 (page 22), at the lowest physical
# activity level (PAL) the table gives for the age: 1.4 ("low active (sedentary)") for ages 1-9
# and adults, 1.6 ("moderately active") for ages 10-17. (male, female). No values for 80 and over
# ("lack of anthropometric data"), so the 70-79 value is used there.
# ---------------------------------------------------------------------------
ENERGY_MJ = {
    1: (3.3, 3.0), 2: (4.3, 4.0), 3: (4.9, 4.6), 4: (5.3, 4.9), 5: (5.6, 5.2), 6: (5.9, 5.5), 7: (6.3, 5.8),
    8: (6.7, 6.2), 9: (7.0, 6.6),
    10: (8.1, 7.6), 11: (8.5, 8.0), 12: (9.1, 8.4), 13: (9.8, 8.8), 14: (10.5, 9.1), 15: (11.3, 9.3),
    16: (11.9, 9.5), 17: (12.3, 9.5),
}
ENERGY_MJ_ADULT = [(18, 29, 9.8, 7.9), (30, 39, 9.5, 7.6), (40, 49, 9.3, 7.5), (50, 59, 9.2, 7.5),
                   (60, 69, 8.4, 6.8), (70, 120, 8.3, 6.8)]
KCAL_PER_MJ = 238.83   # Table 1, footnote (a)


def energy_by_age(sex: str, lo: int, hi: int) -> dict:
    """EFSA average requirement for each whole year of age, in kcal; default band +/-10%."""
    i = 0 if sex == "male" else 1
    out = {}
    for age in range(lo, hi + 1):
        mj = ENERGY_MJ[age][i] if age in ENERGY_MJ else next(r for r in ENERGY_MJ_ADULT if r[0] <= age <= r[1])[2 + i]
        out[str(age)] = energy_band(round(mj * KCAL_PER_MJ))
    return out


ENERGY_NOTE = ("EFSA average requirement for your age and sex (summary report, Table 1) at the lowest activity level the table gives: "
               "sedentary for adults and for children under 10, moderately active for ages 10 to 17. Default band ±10%. Raise it if you are more active.")
ENERGY_NOTE_80 = " EFSA gives no value for ages 80 and over, so the value for 70 to 79 is used."
ENERGY_NOTE_EXTRA = {
    "pregnancy": "In pregnancy EFSA adds about 70 kcal a day in the first trimester, 260 in the second and 500 in the third (Table 1); this default doesn't.",
    "lactation": "While breastfeeding (first 6 months) EFSA adds about 500 kcal a day (Table 1); this default doesn't.",
}


def targets(sex: str, g: str, stage: str) -> dict:
    """Targets for one group. stage is the sex, or "pregnancy" / "lactation" (then g is the adult group "25-50")."""
    pregnant_or_lactating = stage in ("pregnancy", "lactation")
    child = g in CHILD_GROUPS and not pregnant_or_lactating
    t: dict = {}
    if pregnant_or_lactating:
        for k, v in (PREGNANCY if stage == "pregnancy" else LACTATION).items():
            put(t, k, "min", round(v, 2), "abs", "efsa-2017")
    else:
        i = GROUPS.index(g)
        for k, rows in TABLE.items():
            row = rows[0] if sex == "male" or len(rows) == 1 else rows[1]
            put(t, k, "min", row[i], "abs", "efsa-2017")
    put(t, "thiamin", "min", 0.1, "perMJ", "efsa-2017", "0.1 mg per MJ of energy")
    put(t, "niacinNE", "min", 1.6, "perMJ", "efsa-2017", "1.6 mg niacin equivalents per MJ of energy")
    put(t, "fat", "max", FAT_MAX.get(g, 35), "pctEnergy", "efsa-2017", "Reference intake range " + ("35-40" if g in FAT_MAX else "20-35") + "% of energy")
    if child:
        for k, by_sex in BY_AGE.items():
            if sex in by_sex:
                t[k]["min"]["byAge"] = {str(a): v for a, v in by_sex[sex].items()}
    put(t, "carbohydrate", "min", 45, "pctEnergy", "efsa-2017", "Reference intake range 45-60% of energy")
    put(t, "la", "min", 4, "pctEnergy", "efsa-2017", "Adequate intake")
    put(t, "ala", "min", 0.5, "pctEnergy", "efsa-2017", "Adequate intake")
    epa_dha = put(t, "epaDha", "min", 350 if pregnant_or_lactating else 250, "abs", "efsa-2017",
                  "Adequate intake" + (" (250 mg plus 100-200 mg DHA)" if pregnant_or_lactating else ""))
    if g == "1-3" and child:
        # Table 2 (page 23): at age 1 the adequate intake is 100 mg DHA; EPA+DHA 250 mg applies from age 2.
        epa_dha["fromAge"] = 2
        put(t, "dha", "min", 0.1, "abs", "efsa-2017", "Adequate intake at age 1: 100 mg DHA")["toAge"] = 1
    protein = put(t, "protein", "min", round(PROTEIN_ADULT * 1000), "perKg", "efsa-2017", "Population reference intake per kg body weight"
                  + (f", plus {PROTEIN_EXTRA_G[stage]} g/day ({'second trimester' if stage == 'pregnancy' else 'first 6 months'})" if pregnant_or_lactating else ""))
    if pregnant_or_lactating:
        protein["extraG"] = PROTEIN_EXTRA_G[stage]
    elif child:
        protein["byAge"] = {str(a): round(v * 1000) for a, v in PROTEIN_BY_AGE[sex].items()}
    # EFSA gives no number for saturated fat ("as low as possible", Table 2), so none is applied.
    # The US tolerable upper intake levels are borrowed, as for the UK; sodium is EFSA's own value.
    us.add_upper_limits(t, US_UL_GROUP[g], stage if pregnant_or_lactating else sex, sodium=False)
    put(t, "sodium", "max", round(SODIUM_G[g] * 1000), "abs", "efsa-sodium-2019", "Safe and adequate intake")
    if g in ADULT_GROUPS or pregnant_or_lactating:
        add_amino_acids(t)
    return t


def build() -> dict:
    profiles = []
    for sex in ("male", "female"):
        for g in GROUPS:
            lo, hi = age_range(g)
            by_age = energy_by_age(sex, lo, hi)
            profiles.append({
                "id": f"{sex}-{g}", "stage": sex, "group": g, "label": f"{sex.title()}, {years(g)}",
                "energy": {**by_age[str(lo)], "note": ENERGY_NOTE + (ENERGY_NOTE_80 if g == "51+" else ""), "byAge": by_age},
                "defaultWeightKg": REF_WEIGHT.get(g, REF_WEIGHT["adult"])[0 if sex == "male" else 1],
                "targets": targets(sex, g, sex),
            })
    for stage in ("pregnancy", "lactation"):
        by_age = energy_by_age("female", 18, 50)
        profiles.append({
            "id": f"{stage}-18-50", "stage": stage, "group": "18-50", "label": f"{'Pregnant' if stage == 'pregnancy' else 'Breastfeeding'}, 18-50 years",
            "energy": {**by_age["18"], "note": ENERGY_NOTE + " " + ENERGY_NOTE_EXTRA[stage], "byAge": by_age},
            "defaultWeightKg": 70.5 if stage == "pregnancy" else 58.5, "targets": targets("female", "25-50", stage),
        })
    return {
        "id": "eu", "name": "EU", "longName": "EU Dietary Reference Values (EFSA)", "status": "available",
        "verified": {"checked": True, "date": "2026-11-09", "against": "EFSA (2017) Dietary Reference Values for nutrients: Summary report, Tables 1, 2, 3, 5, 7, 9, 11 and 17; EFSA (2019) Dietary reference values for sodium, Table 12"},
        "sources": [ref("efsa-2017"), ref("efsa-sodium-2019", "Sodium"), ref("nasem-dri", "Safety upper limits (EFSA tables give no complete set)"), ref("who-2007", "Amino acids")],
        "notes": [
            "Values are population reference intakes (PRI) where EFSA set one, otherwise adequate intakes (AI), from the EFSA 2017 summary report (Tables 2, 3, 5, 7, 9 and 11).",
            "For children, protein, vitamin E, copper, magnesium and girls' iron follow EFSA's exact age bands; protein uses EFSA's value for each year of age.",
            "Pregnancy protein uses EFSA's second-trimester increase (+9 g/day; it is +1 g in the first and +28 g in the third). Breastfeeding uses the first-6-months increase (+19 g/day).",
            "EFSA gives no separate fibre or carbohydrate values for pregnancy and breastfeeding; adult values are used.",
            "Adult zinc assumes a moderate phytate intake (600 mg/day); diets rich in wholegrains and pulses have more phytate and need more zinc (up to 16.3 mg for men and 12.7 mg for women).",
            "Iron for women aged 51+ uses EFSA's post-menopausal value (11 mg) as an age-based approximation.",
            "Thiamin and niacin are set per unit of energy, so they follow each plan's calories.",
            "Omega-3: at age 1 EFSA's adequate intake is 100 mg of DHA; from age 2 it is 250 mg of EPA and DHA together.",
            "EFSA says saturated fat should be as low as possible and gives no number, so the planner applies no saturated fat limit under the EU standard; the charts show it against the food-label reference intake (20 g) for reference only.",
            "Sodium uses EFSA's 2019 'safe and adequate intake' (2.0 g a day for adults, equal to 5 g of salt; less for children under 11). EFSA says the concern in Europe is too much sodium, not too little, so the planner treats it as a level to stay at or below.",
            "The EFSA target is in retinol equivalents; the food data is in retinol activity equivalents, which count carotenes from plants at half the value (US tables, vitamin A footnote). So vitamin A from plant foods is understated against this target, by up to half; vitamin A from animal foods is unaffected.",
        ],
        "profiles": profiles,
    }
