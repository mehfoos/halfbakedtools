# Nutrient planner

Suggests a small number of everyday foods, with practical amounts, that together come as close as possible to a
day's UK, US or EU nutrient recommendations without exceeding upper limits, or lets visitors build their own day
and see how it measures up. Live at https://halfbakedtools.com/tools/nutrient-planner/.

## Files

```
tool.json             name, summary, status, pages
pages/index.astro     the planner
pages/methods.astro   methods, sources, verification status and limitations
web/                  browser code and tests (see "Code map" below)
references.json       references, in citation order
VERIFICATION.md       what was checked against which document, and when
data/
  foods/              food snapshot built from USDA FoodData Central + match report
  targets/            UK / US / EU targets (generated)
  meta.json           when the snapshot was built
pipeline/             Python (standard library only)
  build_foods.py      downloads USDA data, builds data/foods/
  build_targets.py    writes data/targets/ from the tables in targets/
  targets/            reference intakes transcribed from the official tables, one file per standard
                      (uk.py, us.py, eu.py; common.py: shared helpers, WHO amino acids); edit here, not the JSON
  foods_catalogue.json  curated common foods and how each matches a USDA record
  auto_foods.py       rules for adding the other USDA foods (categories, UK names, portion caps)
  nutrients.json      nutrient keys ↔ USDA nutrient ids
  check_age.py        is the snapshot due for a refresh?
```

## Code map (`web/`)

Calculations are in plain modules that never touch the page, each with tests beside it. The page code is in `web/ui/`,
one file per section of the planner.

```
main.ts          entry point: loads the data, wires the sections together
solver.ts        targets -> numbers for one person; builds the mixed-integer programme; picks plans
highsSolver.ts   runs the programme with HiGHS (WebAssembly); time limit and tolerances
worker.ts        runs the search off the main thread
profiles.ts      which age band of a standard fits a person; calories; reference weight
person.ts        settings -> the person's standard, calorie range, weight and targets
foods.ts         the food list: presets, diet filter, search, foods to avoid, child portions, familiarity
plan-input.ts    settings + chosen foods -> what the optimiser is given (the rules applied before a search)
analysis.ts      a day's foods measured against the targets (met, short, over, not checked)
chart-axes.ts    a day's report -> the axes of the radar charts
radar.ts         draws a radar chart as SVG
state.ts         settings: defaults, link encoding, file export/import, opt-in remembering
*.test.ts        tests (run with `npm test`)
ui/app.ts        shared state for the page: data, settings, and the values derived from them
ui/you.ts        section 1: about you, and "Fine-tune targets"
ui/food-list.ts  section 2: choose foods
ui/suggest.ts    section 3: suggest foods for me
ui/builder.ts    section 3: build my own
ui/report.ts     a day's results as HTML (used by both modes)
ui/charts.ts     charts on the page: zoom, compare, "which foods provide" tables
ui/notices.ts    advice and caveats shown with results, each with its reference
ui/share.ts      copy link, export/import, remember on this device
ui/dom.ts        small helpers: element lookup, escaping, number formatting
```

Where to change things:

- a target or its source: `pipeline/targets/<standard>.py` (never the generated JSON), then `VERIFICATION.md`;
- a rule about which foods or amounts are allowed: `foods.ts` and `plan-input.ts`;
- the optimiser's objective or constraints: `solver.ts` (`buildLp`);
- wording of advice shown with results: `ui/notices.ts`; every factual statement needs a `cite("id")`.

## Building the data

```bash
python3 -I tools/nutrient-planner/pipeline/build_targets.py
python3 -I tools/nutrient-planner/pipeline/build_foods.py     # downloads ~10 MB from USDA
```

## First-time setup

1. Create the issue labels `data-refresh` and `nutrient-planner`. The planner's "Request a data refresh" link opens
   an issue with both.
2. Run Actions → *Nutrient planner: refresh food data* with *force* ticked. It downloads the USDA data, commits
   `data/foods/`, archives the raw files as a release and redeploys. Then read `data/foods/match_report.md` to check
   each food matched the USDA record you'd expect; fix any in `pipeline/foods_catalogue.json` and run it again.

## Ongoing

- The food data refreshes automatically on 1 January, April, July and October
  (`.github/workflows/nutrient-planner-refresh.yml`).
- Refresh requests from the site (`nutrient-planner-refresh-request.yml`) are honoured only when the snapshot is at
  least 90 days old; maintainers can always run the refresh manually with *force*.
