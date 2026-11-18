# Verification log for reference values

Each standard's numbers live in its own file in `pipeline/targets/` (`uk.py`, `us.py`, `eu.py`; WHO amino acids in
`common.py`), with table and page references beside each table, so a file can be checked against its document line by line.
This file records when they were checked against the original documents and what changed.
The exact copies of the documents used for checking are kept in [`sources/`](../../sources/), with checksums.

| Standard | Status | Checked against | Date |
|---|---|---|---|
| UK | Checked | Public Health England (2016) *Government Dietary Recommendations*, Tables 1–6 (pages 6–11) | 9 Nov 2026 |
| EU | Checked | EFSA (2017) *Dietary reference values for nutrients: Summary report*, doi:10.2903/sp.efsa.2017.e15121, Tables 1, 2, 3, 5, 7, 9, 11, 17 | 9 Nov 2026 |
| US | Checked | National Academies DRI summary table PDFs: RDA and AI (vitamins, elements, water and macronutrients), chronic disease risk reduction intakes, acceptable macronutrient distribution ranges | 10 Nov 2026 |
| EU sodium | Checked | EFSA (2019) *Dietary reference values for sodium*, Table 12 (page 50) | 17 Nov 2026 |
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

- **Vitamin D no longer steers suggestions** unless the visitor asks (design change; see `DECISIONS.md`). It is still
  reported against its target.
- **Oily fish capped at 140 g a day in total** in suggestions. Oily fish are those the NHS page lists (herring,
  pilchards, salmon, sardines, sprats, trout, mackerel; not tuna): 33 foods. 140 g is the NHS portion size.

- **EU calories now come from EFSA** (summary report Table 1, page 22; re-read against the archived PDF), by exact
  age and sex, at the lowest activity level the table gives (sedentary for adults and under-10s, moderately active
  for 10–17). Before, UK calorie figures were used under the EU standard, and a 51-year-old got the UK figure for
  65–74. Example: woman aged 35, 2,000 → 1,815 kcal. EFSA gives none for 80+, so the 70–79 value is used and
  the page says so.

- **Pregnancy and children:** liver and liver products are left out of suggestions in pregnancy, and swordfish
  (the only one of shark, swordfish and marlin in the food data) in pregnancy and under 16, per the archived NHS meat
  and fish pages. Children's portion limits are scaled by calories (a rule of thumb, not an official figure), and a
  warning is shown for under-18s, stronger for under-5s (PHE Table 3 and 5 notes).

- **"Everything" foods:** 108 US products with added nutrients (enriched, fortified, "with added vitamin …") are now
  flagged "US-fortified" and are not switched on by the "Everything" preset, because US fortification differs from the
  UK's. Dried pulses and uncooked grains are labelled "dry (uncooked weight)". Daily caps lowered for powders (30 g),
  breadcrumbs and crackers (60 g) and condensed milk (40 g). Coconut cream is now classed as vegan.

- **UK folate note added:** the food data's folate unit overstates folic-acid-fortified foods against the UK target
  (National Academies vitamins table, footnote f). No numbers changed.
- **EU sodium now EFSA's own value.** "Safe and adequate intake" from EFSA (2019) *Dietary reference values for
  sodium*, Table 12, page 50 (checked against the archived PDF): 1.1 g at 1–3 years, 1.3 g at 4–6, 1.7 g at 7–10,
  2.0 g from 11 and for adults, including pregnancy and breastfeeding. Used as a level to stay at or below. Before,
  the US limit (2.3 g for adults) was borrowed.

- **Diet label fixed:** "Beans, baked, canned, with franks" contains meat but was listed as vegan (the meat-word list
  missed "franks"). It is now excluded, along with any other non-meat-category food naming franks, frankfurters,
  sausage or wieners (it was the only one).

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

## Food tables (other than USDA)

| Table | What was checked | Against | Date |
|---|---|---|---|
| UK CoFID 2021 | Nutrient definitions used in `pipeline/tables/cofid.py` (carbohydrate and sugars as monosaccharide equivalents; AOAC fibre; retinol equivalents; vitamin D for meat; vitamin E as alpha-tocopherol equivalents; K1 only; total folate; niacin equivalents; "Tr" and "N" codes) | CoFID 2021 user guide (GOV.UK, March 2021), pages 7 and 10-16 | 18 Nov 2026 |
| UK CoFID 2021 | Food file values for semi-skimmed milk, cod (baked), watercress and farmed salmon (baked) equal the spreadsheet cells; test checks milk iodine | CoFID 2021 spreadsheet | 18 Nov 2026 |
| UK CoFID 2021 | Source defect found: code 13-669 is used for two foods (roasted aubergine and raw watercress); links use code and name | CoFID 2021 spreadsheet | 17 Nov 2026 |
| Facets (`pipeline/blend/`) | Two random samples (58 USDA and 38 CoFID foods) read against their published names; 9 mistakes found and fixed (semi-skimmed milk read as fat-free; a cut named "roast" read as roasted; whole-wheat split; bracketed notes, an ingredient's "nonfat" and "oat bran" read as the food's facets; "extra lean" and "93% lean meat" read as "lean only"; "Beans, baked" read as a cooking method), each now a test. Not a full review: matching (step 3) re-checks every food it links | Published food names in `foods.json` and `foods-cofid.json` | 2026-11-18 |
| Matching USDA–CoFID (`pipeline/blend/matches/cofid.csv`) | All 116 common-food decisions reviewed against the generated evidence (facets, names, and water/protein/fat/sodium/calcium from the archived tables, checksums verified). The 17 Nov crosswalk was re-checked: of its 66 accepted links, 61 stay same, 3 are now equivalent (semi-skimmed and whole milk, and cottage cheese: their fat standards differ) and 2 similar (sardines: packing oil not named by USDA; beef steak: US and UK cuts differ); 13 of its 'none' now record the closest CoFID record as similar (still not blended); the 22 pending were decided (2 same, 20 similar). The review found and fixed 6 more vocabulary errors ("not fortified" read as fortified, canned "in olive oil" as a cooking fat, fat percentages compared as terms, "with peel", "packed in tomato juice", spelling variants). Review: **automated, without manual human verification (beta)**; the owner agreed it may be used with this label | Archived CoFID 2021 spreadsheet and USDA SR Legacy 2018-04 zip | 2026-11-18 |
| Matching rule v2 (all planner foods vs CoFID) | Rule v2 run on the 116 foods reviewed one by one: it never said *same* where the review didn't, and always chose the same record (it found 23 of the 63 same). All 77 of its *same* matches on the other foods read against their published names: 76 correct; 1 mixture ("Vegetables, mixed, frozen") led to the rule now keeping mixtures separate. Similar and none decisions only keep foods separate, so they weren't all read. Review: **automated, without manual human verification (beta)** | Evidence in `matches/evidence-cofid.csv` from the archived tables | 2026-11-18 |
| Definitions USDA–CoFID (`pipeline/blend/components.csv`) | Every definition read from the archived documentation (USDA SR28 Documentation sections on protein, lipid, carbohydrate, energy, vitamins and lipid components; CoFID 2021 user guide sections on each component), checksums verified. Cross-checked on the 142 matched foods: same-definition pairs centre near 1 (protein 0.97; calcium, potassium, phosphorus, niacin, folate 1.00); differing definitions show the documented gaps (UK-factor energy 0.91; vitamin E equivalents 1.26; RE vs RAE 0.48 and 1.33). Thiamin (1.08), B6 (0.96) and pantothenic acid (1.00) show no salt-basis factor, but the documents don't settle it, so they stay apart | USDA SR28 Documentation and User Guide; CoFID 2021 user guide (source-archive release) | 2026-11-18 |
| Blend builder (`pipeline/blend/blend.py`) | Explanations for lentils and semi-skimmed milk read against the published values in both tables; tests check every blended value is the median of the contributions it lists, the foods are exactly the current same/equivalent matches, and a hand edit fails (tried). Found 13 CoFID records whose data are cited as USDA's (counted once). Review: **automated, without manual human verification (beta)** | Archived CoFID 2021 spreadsheet and USDA SR Legacy 2018-04 zip | 2026-11-18 |
| Definitions by standard (`pipeline/blend/standards.csv`) | Each choice read in the archived document it cites: PHE 2016 tables and notes; NASEM RDA/AI footnotes and macronutrients summary; EFSA 2017 sections 3.2, 5.4, 5.9, 5.12, 5.13; SACN 2015 S.21–S.22 and 2.32–2.33; Regulation 1169/2011 Annex I point 7 and Annex XIV (both the as-adopted and consolidated texts give the same factors). EU energy checked by hand for lentils (102.7 kcal) | Archived copies; new ones downloaded from gov.uk and EUR-Lex, checksums recorded in `sources/archive.json` | 2026-11-18 |
| Beta blended source in the planner (`data/foods/foods-blend.json`) | Tests: the file is current; every value equals the blend's value for the chosen definition; USDA-only values equal foods.json; switching source and standard changes only blended foods and restores USDA exactly; missing stays missing. Checked in Chrome: lentils 92 kcal (UK factors) under UK, 116 (Atwater) under US, 116 on USDA; suggestions run; the details read on a phone-width screen | Generated from `pipeline/blend/output/blended-cofid.json` | 2026-11-18 |
