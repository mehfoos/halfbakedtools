# Food files from other national tables

Each script here builds one food file for the planner from one national food composition table, with the same
layout as `data/foods/foods.json` (the USDA file), so the planner can offer a choice of table. A food file uses its
own table only: nothing is mixed in from other tables, and a nutrient the table doesn't give is missing (NA).

| Script | Table | Output |
|---|---|---|
| `../build_foods.py` | USDA SR Legacy | `data/foods/foods.json`, `foods-usda-more.json` |
| `cofid.py` | UK CoFID 2021 (McCance and Widdowson's integrated dataset) | `data/foods/foods-cofid.json`, `foods-cofid-more.json`, `cofid_report.md` |
| `bls.py` | Germany BLS 4.0 (Max Rubner-Institut, 2025) | `foods-bls(-more).json`, `bls_report.md` |
| `ciqual.py` | France Ciqual 2025 (ANSES) | `foods-ciqual(-more).json`, `ciqual_report.md` |
| `frida.py` | Denmark Frida 5.5 (DTU, 2025) | `foods-frida(-more).json`, `frida_report.md` |
| `fineli.py` | Finland Fineli release 20 (THL) | `foods-fineli(-more).json`, `fineli_report.md` |
| `kfcdb.py` | Korea KFCDb 9.3, English (RDA) | `foods-kfcdb(-more).json`, `kfcdb_report.md` |
| `japan.py` | Japan, 8th edition, 2023 supplement (MEXT), with `japan_glossary.json` | `foods-japan(-more).json`, `japan_report.md` |
| `cnf.py` | Canada CNF 2026 (Health Canada; built on USDA data, with per-value source codes) | `foods-cnf(-more).json`, `cnf_report.md` |
| `afcd.py` | Australia AFCD Release 3, Dec 2025 (FSANZ) | `foods-afcd(-more).json`, `afcd_report.md` |

`common.py` holds the parts every converter shares (derived values, the basic-food rule, the raw-food default, the
two output files and the report); `fetch.py` downloads an archived file from the `source-archive` release and checks
its checksum against `sources/archive.json` (or, for a zip built from parts, `sources/release-manifest.json`).
Each value keeps what its table says about it in `q`: a code such as trace, a value below a limit, or the table's
own word for an estimate, recipe calculation or borrowed value (each file's `labels` is the legend).
**Common list (owner, 19 Nov 2026).** `common_list.py` marks `common: true` on every basic food that is the same food
in at least two independent tables (not a raw food people don't normally eat raw, not US-fortified). Its notes give the
matching rules, how independence is judged (a table's own borrowed-value labels, and nearly identical values), and its
outputs: `data/foods/common_report.md` and `pipeline/blend/matches/common-list-matches.csv`. The 116 hand-picked USDA
foods it replaced are kept in `handpicked_usda.json`. The Planner's presets are Common foods and All foods.

## Every table on an equal footing (owner, 18 Nov 2026)

No table is the anchor: each is offered on its own, in both tools. Each table has two files with the same nutrient keys:

- `foods-<table>.json`: the **basic foods**, the Planner's list (the rules below), which it can suggest from;
- `foods-<table>-more.json`: **every other food** in the table, for Food Finder only. Their diet is `meat` for meat
  and fish, otherwise `unknown` (a mixed food can hide meat stock, gelatin or animal fat), and an unknown food is
  shown only when no diet is chosen.

`tables.json` lists the tables (tag, title, files, references, licence, the standards it is the default for).
`build_index.py` checks the files and writes `data/foods/tables.json` (the list with counts) and
`data/foods/index.json` (every food's name, for Food Finder's list; a table's values load when one of its foods is
picked). Adding a table: build its two files, add it to `tables.json`, run `build_index.py`, add its reference.

Ids: the planner's curated common foods keep the planner's id (`milk`) in every table, so presets and links carry
across tables. Any other food is `<table>:<code>` (`cofid:13-661`; a reused code gets `:2`), the permanent id the
blend also uses. The common list comes from `common_list.py` (above); the values are always the table's own.

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
for t in bls ciqual frida fineli kfcdb japan cnf afcd; do python3 -I tools/nutrient-planner/pipeline/tables/$t.py; done
python3 -I tools/nutrient-planner/pipeline/tables/common_list.py   # after every converter: sets the common flags
python3 -I tools/nutrient-planner/pipeline/tables/build_index.py
```
