# Crosswalk: linking planner foods to other food composition tables

The planner's food data comes from USDA SR Legacy, which has **no iodine** and some other gaps. Other national
tables (UK CoFID, French Ciqual, Australian AFCD, Canadian CNF) have some of these values. This folder holds the
method for linking a planner food to the right record in another table, and the reviewed links themselves.

Nothing in this folder changes the planner's data yet. Merging is a later step that needs the owner's approval
(see "Not done yet" below).

## Why not match food names automatically?

It was tried (November 2026, scratch prototype) and it gives wrong pairs that look plausible: Fontina matched to
Colby, Hubbard squash to butternut, baked to boiled, salted to unsalted, pineapple juice to tinned pineapple.
Adding rules reduced the errors but never removed them. A wrong pair would put another food's value into the
planner, which breaks principle 2 ("never borrow a value from a similar item").

So a script only **proposes**; a reviewer **decides**; the decision is committed with a note.

## The method

It follows the FAO/INFOODS food-matching guidelines [1]: identify the food, its part, its state and processing,
then compare composition.

1. **Match planner foods, not USDA record names.** Each planner food (for example "Semi-skimmed milk") is a
   concept with its own name. We look for the record in each table that *is* that food, as the catalogue already
   does for USDA. Start with the common foods (on by default); the rest can follow.
2. **`propose.py`** ranks candidate records for each food by shared words (with a short British/American synonym
   list: courgette/zucchini, rapeseed/canola, ...), checks that cooking and preservation words agree (raw,
   boiled, baked, tinned, frozen, ...), and compares composition with our USDA record:
   - water: the best single sign of cooking state (boiled rice about 70 g per 100 g, dry rice about 12 g);
   - protein and fat: the wrong food or product type;
   - sodium: salted vs unsalted (catches "salt added" however it is worded);
   - calcium: bones (tinned fish) and fortification.
   It writes `data/foods/crosswalk_candidates_<table>.md`.
3. **A reviewer** reads the candidates and records one verdict per food in `crosswalk.json`:
   - `accept`: same food, part and state, and the composition agrees (or the note explains a small, known
     difference);
   - `check`: plausible, but something differs (salt, variety, a nutrient well outside tolerance). The owner
     decides; until then it is treated as no match;
   - `none`: the table has no record of the same food.
   Each entry stores the record's **code and name**. Both must match: CoFID 2021 gives code 13-669 to two foods
   (roasted aubergine and raw watercress).
4. **`check.py`** re-reads the table, confirms every linked record still exists with the same code and name,
   recomputes the flags and writes `data/foods/crosswalk_report_<table>.md`. It fails if a linked record has gone
   or been renamed, so a refreshed table can't silently change a link.

## Rules for merging (when approved)

- Only `accept` links are used.
- A value from another table only fills a nutrient our USDA record does **not** have. It never replaces a USDA
  value. Each value keeps its own source (table, record code and name), shown on the page under a show/hide
  "sources" detail pointing at the shared reference list.
- Missing-value codes are not numbers. CoFID's `Tr` (trace), `N` (present, amount unknown) and blank stay NA in
  calculations (principle 2). Showing "trace" in the food's details is an open question for the owner.
- Iodine depends strongly on where and when a food was produced: milk iodine ranges about 3 to 50 µg per 100 g
  between countries [2], and CoFID itself gives UK semi-skimmed milk 20 µg in summer/autumn and 41 µg in
  winter/spring. A UK value should be labelled as a UK value.

## Running

Standard library only. Download the tables first (links in `crosswalk.json`; USDA as in `build_foods.py`):

```
python3 -I propose.py --db cofid --table McCance_...2021..xlsx --usda-zip FoodData_Central_sr_legacy_food_csv_2018-04.zip
python3 -I check.py   --db cofid --table McCance_...2021..xlsx --usda-zip FoodData_Central_sr_legacy_food_csv_2018-04.zip
```

Files: `sources.py` (table loaders, which keep each cell exactly as published), `xlsx_min.py` (a small .xlsx
reader, since only the standard library is allowed), `propose.py`, `check.py`, `crosswalk.json` (the reviewed
links: edit by hand, with a note).

## Not done yet

- Owner review of the `accept` and `check` verdicts for CoFID (first pass by Claude, 17 November 2026).
- Ciqual 2025 (newer than the 2020 file checked before): its files are on a host this environment can't reach.
- AFCD and CNF loaders. CNF records carry the USDA NDB code, so many links can be exact rather than reviewed.
- The merge into `foods.json`, the per-value source display and the archived copy of each table in `sources/`.

## References

[1] FAO/INFOODS, *Guidelines for Food Matching*, version 1.2. Rome: FAO, 2012.
https://www.fao.org/fileadmin/templates/food_composition/documents/upload/INFOODSGuidelinesforFoodMatching_version_1_2.pdf

[2] J. Tattersall, M. Arai, M. P. Rayman, S. Stergiadis and S. C. Bath, "A systematic review of the iodine
concentration in milk from around the world," *Proceedings of the Nutrition Society*, vol. 82, no. OCE5, p. E357,
2023 (conference abstract). doi:10.1017/S0029665123004561. Archived copy to be added before it is cited on the site.
