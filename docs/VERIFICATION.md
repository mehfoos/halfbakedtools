# Verification log for reference values

Each standard's numbers live in `data/pipeline/build_targets.py`, with page references beside the tables.
This file records when they were checked against the original documents and what changed.
The exact copies of the documents used for checking are kept in [`docs/sources/`](sources/), with checksums.

| Standard | Status | Checked against | Date |
|---|---|---|---|
| UK | Checked | Public Health England (2016) *Government Dietary Recommendations*, Tables 1–6 (pages 6–11) | 9 Nov 2026 |
| EU | Checked | EFSA (2017) *Dietary reference values for nutrients: Summary report*, doi:10.2903/sp.efsa.2017.e15121, Tables 2, 3, 5, 7, 9, 11, 17 | 9 Nov 2026 |
| US | Checked | National Academies DRI summary table PDFs: RDA and AI (vitamins, elements, water and macronutrients), chronic disease risk reduction intakes, acceptable macronutrient distribution ranges | 10 Nov 2026 |
| US calories | Checked | *Dietary Guidelines for Americans, 2020–2025*, Appendix 2, Tables A2-1 to A2-3 | 10 Nov 2026 |
| Upper limits (all standards) | Checked | National Academies DRI summary tables, tolerable upper intake levels (vitamins and elements) | 10 Nov 2026 |
| Food-label reference intakes | Checked | Regulation (EU) No 1169/2011, Annex XIII Part B | 10 Nov 2026 |
| Amino acids (all standards) | Checked | WHO/FAO/UNU (2007) Technical Report Series 935, Table 23 and section 8.4 (page 150) | 10 Nov 2026 |

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
