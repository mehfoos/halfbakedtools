# National food composition tables

Archived copies of the food composition tables used, or being prepared, for the nutrient planner's choice of food
data (UK, France, Germany, Japan, Korea, Finland, Denmark). [`manifest.json`](manifest.json) gives, for every
file, the table, publisher, licence, how and when it was obtained, its origin and its SHA-256 checksum.

- File names start with a short table prefix (`cofid2021_`, `ciqual2025_`, `bls4_`, `japan_`, `kfcdb93_`,
  `fineli20_`, `frida55_`) followed by the publisher's own file name.
- Ciqual's five XML files (72 MB) are zipped here to save space; the checksums of the files inside are listed too.
- Each file keeps its publisher's licence. Licences and attribution are recorded in the manifest and in the tool's
  `references.json` once a table is used on the site.
- New releases are not fetched automatically: formats and addresses change between releases. To update a table,
  raise an issue, download the new release by hand, add it here with a new prefix, and rerun the table's script in
  `tools/nutrient-planner/pipeline/tables/`.
