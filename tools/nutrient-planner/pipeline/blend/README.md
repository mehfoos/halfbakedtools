# Blended food list: describing and matching foods

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
| `concepts.csv` | One row per blended food (now the planner's 116 common foods), anchored to the planner's USDA record | hand |
| `inputs.py` | Fetches the raw tables from the releases and checks their SHA-256 | hand |
| `match.py` | Compares each concept with another table's records; writes the evidence and a review report | hand |
| `matches/<table>.csv` | **The decisions**: one per concept, with grade, reason, who decided, date, and the evidence fingerprint it was reviewed against | hand, reviewed |
| `matches/evidence-<table>.csv`, `matches/REVIEW-<table>.md` | Evidence for each decided record and the top candidates; the review report | **generated** |
| `test_matches.py` | Decisions are complete, acknowledge every difference, and were reviewed against the current evidence | hand |

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

**Review rule** (owner: when in doubt, keep foods separate):

- *Same* when the facets agree and either the composition agrees, or the food is a single unprocessed raw food
  and the difference is within natural variation.
- *Similar* when the difference could be a product difference: recipe, added salt, fortification, part, degree
  of drying, cooking water, packing oil. Any unexplained difference in a processed or cooked food is also similar.
- A *same* or *equivalent* decision must acknowledge every difference in its reason ("Names differ:", "Facet
  difference accepted:", "Same food despite:"). It also records the fingerprint of the evidence it was reviewed
  against, so a later change to the vocabulary, synonyms or data flags it for review again. The tests enforce
  both.

Decisions so far (CoFID, 18 Nov 2026, by Claude (AI), not yet checked by the owner): 63 same, 3 equivalent,
35 similar, 15 none.

`../crosswalk/crosswalk.json` (17 Nov) is kept only for the single-table CoFID file, where "the planner's food"
can be a UK record whose composition differs. Blending uses `matches/` only.

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
