# Verification log for reference values

Each standard's numbers live in `data/pipeline/build_targets.py`, with page references beside the tables.
This file records when they were checked against the original documents and what changed.

| Standard | Status | Checked against | Date |
|---|---|---|---|
| UK | Checked | Public Health England (2016) *Government Dietary Recommendations*, Tables 1–6 (pages 6–11) | 9 Nov 2026 |
| EU | Checked | EFSA (2017) *Dietary reference values for nutrients: Summary report*, doi:10.2903/sp.efsa.2017.e15121, Tables 2, 3, 5, 7, 9, 11, 17 | 9 Nov 2026 |
| US | **Not yet checked** | Values read from the NCBI Bookshelf copy of the National Academies DRI summary tables (NBK545442). Needs a line-by-line check against the original tables. | – |
| Upper limits (all standards) | **Not yet checked** | US Tolerable Upper Intake Levels from the same NCBI copy | – |
| Amino acids (all standards) | **Not yet checked** | WHO/FAO/UNU (2007) Technical Report Series 935, Table 23, via secondary sources | – |

## Corrections made on 9 Nov 2026

- **UK fibre, ages 4–6:** PHE gives 15 g at age 4 and 20 g at ages 5–6. Previously 15 g was used for the whole band; the band is now split.
- **EU total fat, ages 1–3:** EFSA's reference intake range is 35–40% of energy (not 20–35%). The upper limit is now 40%.
- **EU vitamin E, copper, magnesium (children):** EFSA uses bands of 1–2, 3–9 and 10–17 years. These are now applied by exact age instead of being approximated to the planner's bands.
- **EU iron, girls:** EFSA gives 11 mg at 7–11 years and 13 mg at 12–14 years. Now applied by exact age.
- **EU protein, children:** EFSA gives a value per year of age (Table 3). Now used directly instead of band averages.
- **Default body weights:** now EFSA reference body weights (Table 17) for every standard, instead of rounded guesses.

All other UK and EU values matched the documents.
