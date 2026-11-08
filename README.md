# Half-Baked Tools

Open, evolving tools for life's questions, with the evidence shown. Live at **https://halfbakedtools.com**.

## Tools

| Tool | What it does |
|---|---|
| [Nutrient planner](site/src/tools/nutrient-planner/) | Picks a small number of everyday ingredients, with amounts, that together come as close as possible to UK or US daily nutrient recommendations without exceeding upper limits. Runs entirely in the browser. |

## Repository layout

```
site/                      Astro website (deployed to GitHub Pages)
  src/pages/               pages: home, methods, privacy, one folder per tool
  src/layouts/, src/styles/  shared layout and design
  src/tools/<tool>/        each tool's code (planner: solver, UI, worker, tests)
  scripts/sync-data.mjs    copies data/ into the site at build time
data/
  pipeline/                Python scripts (standard library only)
    build_foods.py         downloads USDA data, builds data/foods/foods.json
    build_targets.py       reference intakes transcribed from official tables
    foods_catalogue.json   the curated food list and how each matches USDA records
    nutrients.json         nutrient keys ↔ USDA nutrient ids
  foods/                   generated food snapshot + match report
  targets/                 generated UK / US (EU planned) targets
  meta.json                when the snapshot was last built
docs/                      setup and maintenance notes
.github/workflows/         deploy, quarterly data refresh, refresh requests
```

## Running locally

```bash
python3 data/pipeline/build_targets.py
python3 data/pipeline/build_foods.py      # downloads ~10 MB from USDA
cd site && npm ci && npm test && npm run dev
```

## Data and licences

- Code: MIT (see `LICENSE`).
- Food composition: [USDA FoodData Central](https://fdc.nal.usda.gov/), public domain.
- UK recommendations: Public Health England (2016) *Government Dietary Recommendations*, Open Government Licence v3.0.
- US recommendations: National Academies Dietary Reference Intakes summary tables.
- Amino acid requirements: WHO/FAO/UNU (2007), WHO Technical Report Series 935.

Information only, not medical advice. See the site's Methods page for limitations.
