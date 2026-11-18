# Blended food list: step 1, describing foods

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

Run `python3 -I tools/nutrient-planner/pipeline/blend/build_facets.py` after changing the vocabulary, then `npm test`.

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
