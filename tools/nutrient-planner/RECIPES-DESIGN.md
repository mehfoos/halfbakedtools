# Recipe suggestions: design note (draft, 27 Nov 2026)

Status: proposal for the owner. Nothing here is built yet.

## Goal
After the Planner suggests foods (or a person builds a day), show a few recipes that use those foods, with each
recipe's nutrients worked out from the same food tables, so the numbers stay traceable.

## Where the recipes come from
| Option | Licence | Fit |
|---|---|---|
| Recipes written for this site | Ours to choose | Best: no third-party terms; method text in our own words |
| Wikibooks Cookbook | CC BY-SA 4.0 (most text dual-licensed with GFDL) [1] | Usable with attribution; an adapted recipe must be shared under the same licence, so recipe files from it would carry CC BY-SA |
| Recipe1M+ | CC BY-NC-SA 4.0 [2]; download terms say research, not commercial use [3] | Excluded: non-commercial terms clash with a possible side business, and the recipes were scraped from other sites |
| Recipe websites | Copyright of each site | Excluded |

A list of ingredients is factual; the method text and the selection are what's protected, so even our own recipes
write the method in our own words. Proposal: start with about 30 recipes written for the site; Wikibooks only for
recipes we adapt and attribute.

## Recipe format
One file per recipe in `tools/nutrient-planner/recipes/` (JSON, diffable):
- `id`, `title`, `servings`, `source` (ours, or the Wikibooks page and revision, with licence), `method` (short steps).
- `ingredients`: each with a food id from a table (`table:code`), the weight in grams, and whether the weight is
  raw or as served. Optional ingredients and substitutes marked.
- Tags worked out from the ingredients, not typed by hand: diet (vegan, vegetarian) and allergens (from the foods'
  categories and names), so a recipe can't claim to be vegan while holding egg.

## Nutrients of a recipe
- Prefer a table entry for the ingredient as cooked (for example boiled lentils, not dry). Then the recipe is a
  plain sum, with no cooking factors.
- Where only the raw entry exists, apply the USDA Table of Nutrient Retention Factors, Release 6 (2007), public
  domain (CC0 on data.gov) [4], and a weight change for cooking. The source for the weight change is still to be
  chosen and checked; until then, such ingredients are refused by the build rather than guessed.
- Missing values stay NA: a recipe's total for a nutrient is NA if any ingredient that matters for it is NA, with
  the same caveats as the foods.
- Which table: the Blended food where one exists, else a named table; shown per ingredient on the recipe.

## How the Planner shows them
- **Version 1 (no solver change):** after a plan, score each recipe by how much of its weight the plan's foods make
  up, and show the top three as "ideas using these foods", each with its nutrients per serving and how it compares
  with the plan. Diet and "foods to avoid" settings filter recipes out.
- **Version 2 (later, if version 1 is used):** offer a recipe to the solver as one more food, with per-serving values
  and a serving step. The solver already takes any food with values, so this needs little solver change.

## Checks
Tests that every ingredient id exists in its table, that weights and servings are positive, that tags match the
ingredients, and that a recipe's totals equal the sum of its ingredients. Each recipe's nutrients reviewed against
a hand calculation for the first ten. The methods page gets a section and a Changes entry when it ships.

## Effort (estimate)
Version 1 with 30 recipes: a few days, most of it writing and mapping recipes. Version 2: about a week more.

## Owner's answers (27 Nov 2026, 23:05)
- **Sources:** any openly licensed or factual recipe source may be used, linked and cited. No copy goes in the
  repository or the `source-archive` release: a recipe gives no numbers in a visitor's result (the nutrients come from
  the food tables), so AGENTS.md principle 3 already doesn't call for one. The owner's private copy (Google Drive,
  recorded by file name and SHA-256) still applies, as for every source.
- **Pilot:** start small. The aim is a Planner tick box, "only foods that make up recipes": the day is then one or
  more recipes (several meals) that together use the suggested foods. This is version 2 above, and needs a larger
  library than the pilot.
- **Weights:** as cooked by default, unless the recipe says raw; the table entry must match the state the recipe uses.
- **Allergens:** list the ingredients; no separate allergen claim. Cooking doesn't make an allergen safe, so the
  state doesn't change this. Ingredients that are themselves made of several foods (bread, pesto, stock) are listed
  with a note to check the packet, because their allergens aren't in the name.

## Still open
1. With the tick box on, may a day also hold a few loose foods outside recipes (a banana, a glass of milk)?
2. Which meals first (breakfasts, lunches, dinners), and the pilot size (about 30 proposed).

## References
[1] Wikibooks, "Wikibooks:Copyrights". https://en.wikibooks.org/wiki/Wikibooks:COPY
[2] MIT DSpace, "Recipe1M+: A Dataset for Learning Cross-Modal Embeddings for Cooking Recipes and Food Images",
    terms of use. https://dspace.mit.edu/handle/1721.1/130340
[3] Cadene, recipe1m.bootstrap.pytorch, README (download terms). https://github.com/Cadene/recipe1m.bootstrap.pytorch
[4] USDA ARS, "USDA Table of Nutrient Retention Factors, Release 6 (2007)", data.gov.
    https://catalog.data.gov/dataset/usda-table-of-nutrient-retention-factors-release-6-2007
