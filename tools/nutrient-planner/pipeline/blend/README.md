# Blended food list: describing, matching and blending foods (beta)

The aim (not built yet) is one food list where each value is drawn from every national table that has the **same**
food, shown as a median with the range across tables and an account of where each number came from. The full plan,
with its reasons and references, is in the project's strategy notes and in `../../DECISIONS.md`.

Two foods may only be blended if they are the same food. FAO/INFOODS's *Guidelines for Food Matching* (2012) ask
for every match to be documented, and EuroFIR describes foods by **facets** (LanguaL): what the food is, which part,
raw or cooked, how it was cooked or preserved, what was added. This folder does that first step: it describes every
food the planner uses, in every table, in the same terms. **When in doubt, foods stay separate.**

## Files

| File | What it is | Edited by |
|---|---|---|
| `vocabulary.csv` | The terms (facet, term) and the patterns that recognise them in a published food name, in order: earlier rows win, so specific terms come before general ones | hand, reviewed |
| `facets.py` | Applies the vocabulary to a name | hand |
| `build_facets.py` | Writes `facets/<table>.csv` and `facets/REPORT.md` | hand |
| `facets/<table>.csv` | One row per food: permanent id, the table's code and name as published, planner id, and its facets | **generated** |
| `facets/REPORT.md` | How much of each table the vocabulary describes, conflicts, and the most common unclassified phrases | **generated** |
| `test_facets.py` | Rules and past mistakes as tests; also checks the generated files are up to date | hand |
| `synonyms.csv` | Names that mean the same food (US/UK names, spellings, word order), each with a note. Only true synonyms: a close but different food must not be listed | hand, reviewed |
| `concepts.csv` | One row per planner food (2,244; the 116 common ones flagged), anchored to the planner's USDA record | hand |
| `inputs.py` | Fetches the raw tables from the releases and checks their SHA-256 | hand |
| `match.py` | Compares each concept with another table's records; writes the evidence and a review report | hand |
| `matches/<table>.csv` | **The decisions**: one per concept, with grade, reason, who decided, date, and the evidence fingerprint it was reviewed against | hand, reviewed |
| `matches/evidence-<table>.csv`, `matches/REVIEW-<table>.md` | Evidence for each decided record and the top candidates; the review report | **generated** |
| `test_matches.py` | Decisions are complete, acknowledge every difference, and were reviewed against the current evidence | hand |
| `definitions.csv` | Every definition a value can have (e.g. energy with US Atwater factors vs UK factors), with a readable label, INFOODS tagname, unit and meaning | hand, reviewed |
| `components.csv` | For each table and planner nutrient: the column or formula, the definition it gives, any condition, and the section of the table's own documentation that says so | hand, reviewed |
| `borrowed.csv` | When a table's record is borrowed from another table we use (so it counts once) | hand, reviewed |
| `standards.csv` | For each standard (UK, US, EU) and each nutrient with more than one definition: the definitions its targets use, in order, how that was established (confirmed, derived, convention, assumed, no target) and the evidence | hand, reviewed |
| `caveats.csv` | Every data caveat the blend can show (kind, text, reason, evidence), in the site's one caveat style (`site/src/lib/caveats.ts`) | hand, reviewed |
| `values.py` | Reads a value under its definition; evaluates the formulas safely; missing and trace are never zero | hand |
| `blend.py` | Builds the blended values (step 5) | hand |
| `output/blended-<table>.json`, `output/audit-<table>.csv`, `output/PREVIEW-<table>.md` | Blended values with ranges and contributions; the full trail per value; explanations and a check of the definitions | **generated** |
| `test_blend.py` | Definitions are consistent and cited; formulas evaluate; blending rules; the output follows its rules | hand |

Run `python3 -I tools/nutrient-planner/pipeline/blend/build_facets.py` after changing the vocabulary, then
`match.py` (below), then `npm test`.

## How a name is read

- Each pattern is a regular expression applied to the lower-case name. Matched text is blanked, so it can't be
  matched twice.
- `scope = qualifier` terms (cut, variety, origin, bone, flavour, "average") are never looked for in the first
  phrase, so "Sweet potato" and "Orange juice" keep their names.
- `keep` rows protect text that describes something else: an ingredient ("made with nonfat dry milk"), a recipe,
  a coagulant, notes in brackets, or a dish name ("Beans, baked"). That text goes to `rest` unchanged.
- A cooking method implies `state = cooked`. A generic "cooked" is dropped when a specific method is given.
- **`base`** is what is left of the first phrase (usually the food: "lentils"). **`rest`** is every other phrase
  that wasn't recognised, kept verbatim, for example "green and brown", "kidney", "basmati" or "broilers or fryers".
  Many of these are variety or species names that only a reviewed synonym list can link across tables (the next
  step). Until then, a non-empty `rest` counts as a difference.
- Conflicts (for example "raw" and "boiled" in one name) are listed in the report, not resolved.

## Matching (step 3, USDA and CoFID first)

For each concept, `match.py` compares the anchor with candidate records (FAO/INFOODS food-matching guidelines:
food, part, state and processing first, then composition):

- **identity**: the words naming the food (base, variety, cut, unrecognised phrases), after `synonyms.csv`:
  *same*, *narrower* (one side names more, such as a variety), or *differs*;
- **facets**: each the same, stated on one side only, or different. "Mature seeds" counts as "dried". A general
  cooking method ("cooked", "dry heat") is compatible with a specific one ("baked"), but is shown. Origin and US
  meat grade are not compared;
- **composition**: water, protein, fat, sodium and calcium per 100 g as published, within tolerances (water ±3 g
  or 8%; protein ±1 g or 20%; fat ±1 g or 30%; sodium ±50 mg or 50%; calcium ±30 mg or 40%).

**Rule v1** (automatic) says *same* only when all three agree completely. Otherwise a person decides. Grades:

| Grade | Meaning | Blended? |
|---|---|---|
| same | the same food | yes |
| equivalent | a stated difference that doesn't change composition beyond tolerance (e.g. US 2% vs UK semi-skimmed milk) | yes, with the difference shown |
| similar | the closest record, but a different product | no: kept separate |
| different / none | not the same food / the table has no such food | no |
| pending | not reviewed yet | no |

**Review rule** (owner: when in doubt, keep foods separate; this reading confirmed by the owner, 18 Nov 2026):

- *Same* when the facets agree and either the composition agrees, or the food is a single unprocessed raw food
  and the difference is within natural variation.
- *Similar* when the difference could be a product difference: recipe, added salt, fortification, part, degree
  of drying, cooking water, packing oil. Any unexplained difference in a processed or cooked food is also similar.
- A *same* or *equivalent* decision must acknowledge every difference in its reason ("Names differ:", "Facet
  difference accepted:", "Same food despite:"). It also records the fingerprint of the evidence it was reviewed
  against, so a later change to the vocabulary, synonyms or data flags it for review again. The tests enforce
  both.

Decisions so far (CoFID, 18 Nov 2026; automated review, without manual human verification, beta): 64 same, 3 equivalent,
34 similar, 15 none (six common foods were switched from raw to cooked on 18 Nov and re-reviewed). The owner has agreed that such reviews may be used, labelled this way; the blended list will be
marked beta wherever it is shown.

### Rule v2: the review rule applied automatically (all 2,244 planner foods)

The 116 common foods were decided one by one. The other 2,128 planner foods are decided by **rule v2**, which
applies the same review rule mechanically and is re-run by `match.py` (its decisions follow the evidence). A food is
*same* only if exactly one CoFID record has:

- the **same name** after synonyms ("narrower" is not enough: "Chinese cabbage" is narrower than "cabbage");
- **no facet that differs**;
- details stated by one table only **only where the composition check would catch a mistake** (state, cooking,
  salt, drained or not, fat level, bone, flavour, "average") or where the term changes nothing (fresh, pasteurised,
  chilled; flesh, kernels). Fortification, sugar, packing medium, form, cooking fat and freezing block *same*;
- **agreeing composition**, with at least 3 of the 5 nutrients compared;
- and isn't a **mixture** ("mixed", "assorted"), whose recipe differs between countries.

If two records fit, neither is chosen. Otherwise the closest record by name is recorded as *similar*, with what
failed, or *none*. Rule v2 never gives *equivalent*. Its decisions say "Automated rule v2, without manual human
verification (beta)", and a test checks each is exactly what the rule gives on the recorded evidence.

Checked (18 Nov 2026): on the 116 foods decided one by one, rule v2 never said *same* where the review didn't (it
found 23 of the 63); and all of its own *same* matches were read against their published names (one mixture
found, which led to the mixture rule).

Result for CoFID: 139 same (64 reviewed + 75 by rule), 3 equivalent, 1,424 similar, 678 none. Most foods are kept
separate: that is the rule working ("when in doubt, keep separate"), and they stay available on their own.

`../crosswalk/crosswalk.json` (17 Nov) is kept only for the single-table CoFID file, where "the planner's food"
can be a UK record whose composition differs. Blending uses `matches/` only.

## Definitions (step 4)

Tables use one word for different measurements. INFOODS and EuroFIR treat a component measured or calculated
differently as a different component, so **values are only ever combined within one definition**. Each value is
stored under its definition (`definitions.csv`); `components.csv` says where each table gives it, citing its
documentation (USDA SR28 Documentation and User Guide, which SR Legacy refers to; CoFID 2021 user guide).

USDA SR Legacy and CoFID 2021, by planner nutrient:

| Same definition: blended | Different: kept apart | Converted to a shared definition |
|---|---|---|
| protein, fat, saturated fat, fibre (AOAC), all minerals, retinol, vitamin K1, vitamin C, riboflavin, niacin (preformed), niacin equivalents, total folate, vitamin B12, linoleic acid, alpha-linolenic acid, EPA, DHA; and, **with an Assumption caveat**, thiamin, vitamin B6 and pantothenic acid (CoFID states the salt form, USDA doesn't; combined on a data check showing no salt-basis factor, owner's decision) | energy (US Atwater vs UK factors), carbohydrate (by difference vs available as monosaccharides), sugars (by weight vs monosaccharide equivalents), vitamin E (alpha-tocopherol vs alpha-tocopherol equivalents), vitamin D for meat (CoFID adds 25-hydroxy D3) | vitamin A: both tables give retinol equivalents *and* retinol activity equivalents, each calculated from published retinol and carotenoids |

Caveats (`caveats.csv`) are attached to the values they apply to and shown with them, in the site's one caveat
style. Fallbacks are separate definitions too: USDA's C18:2 "undifferentiated" when n-6 isn't given, CoFID's total C20:5
when n-3 isn't given, USDA's label fat when total lipid isn't given.

## Blending (step 5, beta)

For each food matched *same* or *equivalent*, and each definition, `blend.py` gives the **median** of the tables'
values (owner's decision; with two tables, their average) and the range. A value is left out, with the reason shown,
when it is missing, "present, amount not known", trace, or **borrowed** from a table already used: CoFID records
whose main data reference cites USDA data (13 of the 142) count once. Values more than two-fold apart are flagged,
never dropped. Salt and EPA + DHA are worked out from the blended parts. Each value's explanation says which tables
and codes it came from and what was left out; the audit CSV traces every number to the table, file checksum, code,
column and published cell.

The preview's **check of the definitions** compares the tables across the matched foods: same-definition pairs
centre near 1 (protein 0.97, calcium and potassium 1.00); different definitions show the expected gap (UK-factor
energy about 9% lower; vitamin E equivalents about 26% higher).

## In the planner (step 6, beta)

`planner_pack.py` turns the blend into `data/foods/foods-blend.json`, an overlay on the USDA data that the planner
loads when the visitor chooses "USDA + UK CoFID, blended". Only the 142 blended foods change; every other food keeps
its USDA values. Per standard, each nutrient comes from the definition `standards.csv` chooses; salt and EPA + DHA
are calculated from the blended parts; nutrients CoFID doesn't give (amino acids, vitamin D2 and D3) keep the USDA
value, marked "USDA only". A missing value stays missing. For each blended food in a day, the page shows the median,
the range, each table's published value (and why any was left out), the two-fold flags, and the caveats, in the
site's caveat style. `test_planner_pack.py` checks the file is current and follows the blend; `web/foods.test.ts`
checks that switching source and standard changes only the blended foods and restores USDA exactly.

```bash
python3 -I tools/nutrient-planner/pipeline/blend/blend.py
python3 -I tools/nutrient-planner/pipeline/blend/planner_pack.py
```

## Definitions by standard

Targets are compared with values under the definition they are expressed in (`standards.csv`):

| | UK | US | EU |
|---|---|---|---|
| Energy | UK factors (derived: PHE's carbohydrate grams use 3.75 kcal/g) | USDA's Atwater factors (convention) | EU labelling factors, calculated from blended parts (confirmed: Regulation 1169/2011, Annex XIV) |
| Carbohydrate | available, as monosaccharides (derived, as above) | by difference, without fibre: digestible carbohydrate by weight (confirmed: NASEM summary) | the same (confirmed: Regulation 1169/2011, Annex I point 7) |
| Vitamin A | retinol equivalents (confirmed via the 1991 DRV report) | retinol activity equivalents (confirmed) | retinol equivalents (confirmed) |
| Vitamin E | no target | alpha-tocopherol (confirmed) | alpha-tocopherol (confirmed) |
| Folate | total folate (confirmed) | dietary folate equivalents (confirmed) | dietary folate equivalents (confirmed) |
| Fibre | AOAC (confirmed: SACN 2015, S.21–S.22) | AOAC, the *closest* to the target's total fibre (NASEM summary; SACN 2015, 2.32–2.33) | AOAC-type (confirmed) |

If a food lacks the preferred definition, the next one is used with an *Assumption* caveat; the *closest* choice
(US fibre) carries an *Assumption* caveat saying what differs; an *assumed* choice would carry *Not yet checked*
(none remain). `blend.py` writes each food's choice per standard (`planner` in the JSON).

## Permanent ids

`<table tag>:<code>`, for example `usda:172421` or `cofid:13-661`. The tag has no version, so ids survive a new
release; the version each value came from is recorded with the value. If a publisher used one code for several
foods (CoFID 2021 13-669: roasted aubergine and raw watercress), each gets `~` and a short form of its name.

## Standards

The `langual` and `foodex2` columns are for each term's equivalent in LanguaL and EFSA's FoodEx2. They are empty
until checked against the published thesauri. Frida 5.5 publishes both codes for each food, which will let its
foods be described directly and the mapping be checked.

## Known limits

- English names only so far (USDA, CoFID). Other tables are added one at a time, using their own codes first.
- USDA often names a class first ("Seeds, ...", "Spices, ...", "Fish, ..."), so the real food is in `rest`. The
  matching step handles this.
- A pattern can't tell a dish from a method in every case (see the "Beans, baked" rule). Matching also compares
  composition, which catches such slips, and every match is reviewable.
