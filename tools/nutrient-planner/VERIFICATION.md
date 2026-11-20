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

## Household unit weights (checked 18 Nov 2026)

Checked against the archived USDA SR Legacy download (`FoodData_Central_sr_legacy_food_csv_2018-04.zip`, release
`usda-data-2026-11-08`), file `food_portion.csv`, for each food's matched record. The build now reads these weights
from that file (`usdaPortion` in `pipeline/foods_catalogue.json`), and `data/foods/match_report.md` lists them.

| Food | USDA record (fdc_id) | USDA portion | Weight | Result |
|---|---|---|---|---|
| Wholemeal bread | 172688 | 1 slice | 32 g | **Corrected**: was 36 g, with no recorded source |
| Eggs (hard-boiled) | 173424 | 1 large | 50 g | Matched |
| Bananas | 173944 | 1 medium (7" to 7-7/8" long) | 118 g | Matched |

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
| Default preset, day range, sources in the food list | Tests: default is wider and old links mean common; day bounds add each food's range, leave out foods with no value and show nothing where no food has a range. Checked in Chrome at phone width: 530 foods on by default; a suggestion run on the wider list took about 2 s; ranges and the "reaches the target at the high end" notes show; "sources" opens and closes under a blended food without ticking it | Generated from the pack and the tests | 2026-11-18 |
| Raw-food rules for the default lists (`pipeline/wider_selection.json` rawRules, `foods_catalogue.json`) | Rebuilt from the archived USDA file with `build_foods.py --sr-zip`; compared with the previous build: no nutrient value of any food changed, only which foods are in the presets (43 left the preset, 8 entered as cooked fallbacks); read the full list of what remains raw. The six re-matched foods were re-reviewed against the evidence (composition agrees on 4 to 5 nutrients) | USDA SR Legacy (archived), CoFID 2021 (archived) | 2026-11-18 |

## Food tables BLS, Ciqual, Frida, Fineli, KFCDb, MEXT, CNF and AFCD (checked 20 Nov 2026)

Each converter (`pipeline/tables/<table>.py`) was read against the table's archived documentation (checksums
verified by `fetch.py`), and the values of 30 or more foods per table, picked at random (fixed seeds), were read
from the archived file independently of the converter and compared with `foods-<table>*.json`. No value differed
in any table: BLS 1,570 values (33 foods), Ciqual 1,184 (32), Frida 1,500 (30), Fineli 1,080 (30), KFCDb 1,440
(30), MEXT 1,380 (30), CNF 1,440 (30), AFCD 1,488 (31, including 377 zeros). Units were checked against each
file's unit row or component list. Tests: `pipeline/blend/test_table_checks.py` and `web/foods.test.ts`.

| Table | Checked against | Found and changed |
|---|---|---|
| AFCD Release 3 | About Release 3 (PDF, page 3: results below the limit of reporting are reported as zero); Nutrient details (core nutrients have no blanks); Food Details "Sampling Details" | 16,820 zeros in the mapped nutrients. 5,475 that the sampling details name as "imputed zero" are now 0 with the label "z"; the other 11,345 are NA with the label "lor" (they may be below the limit of reporting). The 100% coverage of core nutrients is by design (AUSNUT), not missing values written as zero; FSANZ fills gaps by borrowing, imputing or imputed zeros, all labelled by the food's derivation |
| BLS 4.0 | Documentation 4.2-4.4 (data origins, "-", TR, <LOQ/<LOD); components file (codes, units, formulas); **errata, August 2026** (`bls4_Erratum_BLS_4_0_DE.pdf`), whose values apply until BLS 4.1 | Errata applied (`pipeline/tables/bls_erratum.json`, code lists read from annexes 7.1-7.7, each with the stated count): skimmed milk retinol 414 → 2.4 µg and vitamin A 415 → 3.1 µg; low-fat milk iodine 2.8 → 9.5 µg, UHT 8.3 → 11.6 µg (two foods); sweet almond calcium 84.9 → 254 mg, blanched 236 mg; recipes using them (6, 19, 132) have that value NA; raw anchovy fat (no corrected value yet) and its energy and fatty acids NA, with the 16 entries made from it; energy of the 411 foods with oligosaccharides = published − 2 × OLSAC (the set equals every food with OLSAC > 0); 1,921 zero amino acids in foods with protein NA (errata section 5: false zeros, all amino acids under review). "Logical zero" (5,382 zeros) now labelled; 337 "<LOQ" and 141 "<LOD or <LOQ" labelled (they were already NA). The 6 zinc values of errata Table 4 labelled below a limit; the 53 missing zinc values were already NA |
| Ciqual 2025 | Documentation (French, 3.2.2-3.3.11, read from page images); const file | Vitamin A is retinol + β-carotene/12 (IOM 2001), i.e. retinol activity equivalents, not retinol equivalents: definition and blend group corrected (1,369 foods' values agree with that formula). B9 is given either as total folate (56700, 1,433 foods) or as DFE (56702, 908 foods), never both: the DFE values are now read, labelled "dfe" and blended as DFE. Carbohydrate may be by difference, sum or total minus fibre (was described as "not by difference"); energy uses N × 6.25 and counts unknown polyols and organic acids as 0 |
| Frida 5.5 | Documentation 4.3-4.5, 5.1-5.3, 6.1-6.11; Parameter and Source sheets | Carbohydrate (172) is total carbohydrate by difference minus fibre, not available carbohydrate by weight: definition and blend group corrected. Source 1655 ("natural zero value, not analysed", 3,059 values) now labelled. Vitamin A (β-carotene/6), vitamin D (D2 + D3 + 2.5 × 25-OH), folate (total), niacin equivalents confirmed and recorded. Frida's 0 means zero or insignificant traces |
| Fineli release 20 | Package descript.txt, component and method-type lists, nutrient factors list | Units and codes match. Not settled by the archived documents, and now said so: how "fibre, total" (FIBC, used) differs from "fibre, total dietary" (FIBT; they differ for 2,295 of 4,124 foods), which forms vitamin D counts, how CHOAVL is derived |
| KFCDb 9.3 | Column headings and unit row (no documentation archived) | Units match (fatty and amino acids in mg, per 100 g food; saturated fat never exceeds fat). Definitions rest on the headings only |
| MEXT 8th ed. (2023 supplement) | Documentation chapter 1 (symbols; component identifiers; vitamins) | "0" = below 1/10 of the smallest amount shown (3/10 for iodine and selenium) or not detected: kept as 0. "(0)" = assumed none, not measured: now labelled "z". Two values with a dagger (reduced starch syrup) and three "*" iodine cells are NA |
| CNF 2026 | User guide (missing values, assumed zero, energy, vitamin A, vitamin D, folate); nutrient names and units | Definitions confirmed. 82 values in the file are coded "assumed zero" but given as an amount; the 48 among the planner's nutrients are now NA (label "zx") |

## Blended table (checked 20 Nov 2026, after commit c5d2a95)

All 438 blended foods: every UK blended value lies within the values of its source records, and plant foods carry
no vitamin B12, retinol, EPA or DHA. About 120 familiar foods were read against their per-table values, with no errors.
Both open points were then resolved by the owner and rechecked: KFCDb vitamin D zeros in animal foods are missing
(butter, milk and powders now show other tables' non-zero values), and blended energy is worked out from the blended
parts where it stays close to a table's published energy (familiar foods compared before and after; 33 foods keep
the published value). Record: `pipeline/blend/reviews/2026-11-20-spot-check.md`.
