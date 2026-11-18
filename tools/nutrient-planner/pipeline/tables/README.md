# Food files from other national tables

Each script here builds one food file for the planner from one national food composition table, with the same
layout as `data/foods/foods.json` (the USDA file), so the planner can offer a choice of table. A food file uses its
own table only: nothing is mixed in from other tables, and a nutrient the table doesn't give is missing (NA).

| Script | Table | Output |
|---|---|---|
| `cofid.py` | UK CoFID 2021 (McCance and Widdowson's integrated dataset) | `data/foods/foods-cofid.json`, `cofid_report.md` |

The tables are not downloaded by the scripts. Their formats and addresses change between releases, so when a new
release appears (raise a GitHub issue), download it by hand, check its documentation for changed definitions, and
rerun the script with `--table <file>`. The archived copies used so far are listed, with checksums, in the release
manifest kept with the repository's sources.

## Rules every table follows

- **Values as published.** Each value is the table's own. Where the table gives a code instead of a number (CoFID
  "Tr" = trace, "N" = present but no reliable amount), the value is missing and the code is kept in the food's `q`
  field so the page can say what the table said. Where a value comes from a fall-back column (for example CoFID's
  total C20:5 when the n-3 isomer isn't separated), `q` says so.
- **Definitions are recorded.** The file's `definitions` field says how the table defines each nutrient where it
  differs from the USDA definition (for example CoFID carbohydrate is available carbohydrate as monosaccharide
  equivalents; vitamin A is retinol equivalents, not retinol activity equivalents; folate is total folate).
- **Common foods** are the planner's own foods, using the record that is the same food according to
  `crosswalk/crosswalk.json` (`sameFood: true`). Common foods with no such record are missing in that table.
- **Other foods** follow the same policy as the USDA rules in `auto_foods.py`: basic foods by the table's food
  groups; no dishes, cakes, sweets, drinks (except plant drinks), fried, coated or salted foods, offal or raw meat;
  values weighed with inedible parts are left out; meat and fish words keep foods out of the vegetarian categories.
  Diet tags, portion steps and limits and the oily-fish cap use the shared rules.

## Running

```
python3 -I tools/nutrient-planner/pipeline/tables/cofid.py --table McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx
```
