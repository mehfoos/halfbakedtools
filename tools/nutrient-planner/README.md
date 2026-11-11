# Nutrient planner

Suggests a small number of everyday foods, with practical amounts, that together come as close as possible to a
day's UK, US or EU nutrient recommendations without exceeding upper limits, or lets visitors build their own day
and see how it measures up. Live at https://halfbakedtools.com/tools/nutrient-planner/.

## Files

```
tool.json             name, summary, status, pages
pages/index.astro     the planner
pages/methods.astro   methods, sources, verification status and limitations
web/                  solver (mixed-integer programme, HiGHS in a Web Worker), UI, charts, settings links; tests
references.json       references, in citation order
VERIFICATION.md       what was checked against which document, and when
data/
  foods/              food snapshot built from USDA FoodData Central + match report
  targets/            UK / US / EU targets (generated)
  meta.json           when the snapshot was built
pipeline/             Python (standard library only)
  build_foods.py      downloads USDA data, builds data/foods/
  build_targets.py    reference intakes transcribed from the official tables; edit here, not the JSON
  foods_catalogue.json  curated common foods and how each matches a USDA record
  auto_foods.py       rules for adding the other USDA foods (categories, UK names, portion caps)
  nutrients.json      nutrient keys ↔ USDA nutrient ids
  check_age.py        is the snapshot due for a refresh?
```

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
