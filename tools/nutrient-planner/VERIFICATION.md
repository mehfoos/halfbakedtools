# Verification log for reference values

Each standard's numbers live in `data/pipeline/build_targets.py`, with page references beside the tables.
This file records when they were checked against the original documents and what changed.
The exact copies of the documents used for checking are kept in [`sources/`](../../sources/), with checksums.

| Standard | Status | Checked against | Date |
|---|---|---|---|
| UK | Checked | Public Health England (2016) *Government Dietary Recommendations*, Tables 1–6 (pages 6–11) | 9 Nov 2026 |
| EU | Checked | EFSA (2017) *Dietary reference values for nutrients: Summary report*, doi:10.2903/sp.efsa.2017.e15121, Tables 2, 3, 5, 7, 9, 11, 17 | 9 Nov 2026 |
| US | Checked | National Academies DRI summary table PDFs: RDA and AI (vitamins, elements, water and macronutrients), chronic disease risk reduction intakes, acceptable macronutrient distribution ranges | 10 Nov 2026 |
| US calories | Checked | *Dietary Guidelines for Americans, 2020–2025*, Appendix 2, Tables A2-1 to A2-3 | 10 Nov 2026 |
| Upper limits (all standards) | Checked | National Academies DRI summary tables, tolerable upper intake levels (vitamins and elements) | 10 Nov 2026 |
| Food-label reference intakes | Checked | Regulation (EU) No 1169/2011, Annex XIII Part B | 10 Nov 2026 |
| Amino acids (all standards) | Checked | WHO/FAO/UNU (2007) Technical Report Series 935, Table 23 and section 8.4 (page 150) | 10 Nov 2026 |

## Changes made on 17 Nov 2026 (accuracy review; plan in `REVIEW-2026-11.md`)

- **Carbohydrate now excludes fibre.** USDA's "Carbohydrate, by difference" includes fibre; the UK, US and EU targets
  and the food-label layout count carbohydrate without it. The pipeline now subtracts each food's fibre
  (`build_foods.py`, `derive`). 1,315 foods changed, for example cooked lentils 20.13 → 12.23 g per 100 g; no other
  value changed. Before this, carbohydrate was overstated by the amount of fibre (about 50 g a day in a typical
  suggested plan). USDA's definition ("Values for carbohydrate
  by difference include total dietary fiber") is in the Release 28 guide, page 13, now archived.

- **Targets set as a share of energy now follow the day's own calories.** Fat, saturated fat and carbohydrate limits
  (% of energy), EU linoleic and alpha-linolenic acid (% of energy) and EU thiamin and niacin (per MJ) were worked
  out once, for the middle of the calorie range, and applied as fixed gram amounts. A plan at the low end of the range
  could then exceed the percentage while showing as within it (seen: a US plan with 38% of energy from fat shown as
  exactly on the 35% limit). The optimiser and the reports now use each plan's actual calories. A custom target typed
  by the visitor stays an absolute amount.

- **US saturated fat limit added:** less than 10% of calories from age 2 (*Dietary Guidelines for Americans,
  2020–2025*, Executive Summary, page x; checked against the archived PDF). The US standard had no saturated fat limit
  before. No limit is applied at age 1.
- **EU note corrected:** it said US limits were used for saturated fat. No US limit was in fact applied, and EFSA gives
  no number ("as low as possible", summary report Table 2), so the EU standard has no saturated fat limit and the note
  now says so.

- **Vitamin A note corrected (UK and EU).** It said plant vitamin A "may be slightly overestimated". It is the other
  way round: the food data counts carotenes at half the value the UK and EFSA units do (National Academies vitamins
  table, footnote a), so plant vitamin A is understated, by up to half. No numbers changed.
- **EU omega-3 at age 1:** EFSA's adequate intake is 100 mg DHA (summary report Table 2, page 23), not the 250 mg
  EPA+DHA that applies from age 2. Now applied by exact age.

- **NHS advice in food notes now cited and archived.** Checked against the archived NHS pages and reworded to match
  them: oily fish (no more than 4 portions of about 140 g a week; 2 for girls and for women who are pregnant,
  breastfeeding or may have a child one day), red and processed meat (cut down to 70 g a day if eating more than 90 g),
  liver (avoid in pregnancy; weekly liver may exceed recommended vitamin A).

## Changes made on 10 Nov 2026

- **Amino acids:** the nine values matched Table 23. But Table 23 gives *average* requirements, which about half of
  healthy adults need more than. Section 8.4 says safe levels of intake are 24% higher. The targets now use the safe
  level (for example lysine 37.2 mg/kg instead of 30), consistent with every other nutrient's target, which is set to
  cover nearly everyone. Section 8.5 gives no separate values for older people, so the adult values apply at all adult ages.

- **US vitamins, elements, macronutrients, upper limits, sodium and fat range:** every value matched the National Academies tables. No changes.
- **US calories:** previously approximate bands taken from a secondary source (MSD Manual). Now the exact *Dietary Guidelines* sedentary estimate for the person's age and sex (Table A2-2; Table A2-1 for age 1), with a ±10% default band. The pregnancy and breastfeeding notes now give the guidelines' extra calories (Table A2-3).
- **Food-label reference intakes** (energy 2000 kcal, fat 70 g, saturates 20 g, carbohydrate 260 g, sugars 90 g, protein 50 g, salt 6 g): matched.
- Note: the National Academies table PDFs are marked "prepublication copy: uncorrected proofs" on the publisher's own site.

## Corrections made on 9 Nov 2026

- **UK fibre, ages 4–6:** PHE gives 15 g at age 4 and 20 g at ages 5–6. Previously 15 g was used for the whole band; the band is now split.
- **EU total fat, ages 1–3:** EFSA's reference intake range is 35–40% of energy (not 20–35%). The upper limit is now 40%.
- **EU vitamin E, copper, magnesium (children):** EFSA uses bands of 1–2, 3–9 and 10–17 years. These are now applied by exact age instead of being approximated to the planner's bands.
- **EU iron, girls:** EFSA gives 11 mg at 7–11 years and 13 mg at 12–14 years. Now applied by exact age.
- **EU protein, children:** EFSA gives a value per year of age (Table 3). Now used directly instead of band averages.
- **Default body weights:** now EFSA reference body weights (Table 17) for every standard, instead of rounded guesses.

All other UK and EU values matched the documents.
