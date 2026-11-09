#!/usr/bin/env python3
"""Build the planner's local food snapshot from USDA FoodData Central.

Downloads the SR Legacy and latest Foundation Foods CSV releases, matches each
food in foods_catalogue.json, and writes:

  data/foods/foods.json         per-100 g nutrient values used by the website
  data/foods/match_report.md    which USDA record each food matched (review this)
  data/meta.json                when the snapshot was built and from what

Foods come from two places:
  * the curated catalogue (foods_catalogue.json): common foods with friendly
    names and units, switched on by default ("common": true);
  * every other SR Legacy food that passes the rules in auto_foods.py
    (vegetables, fruit, pulses, grains, nuts, dairy, eggs, oils, herbs...),
    switched off by default so people can add them from the food list.

Foundation Foods (newer lab analyses) is preferred for a curated food that has
a "foundation" query; any nutrient it lacks is filled from SR Legacy.

Standard library only. Usage:
  python3 data/pipeline/build_foods.py                  # download and build
  python3 data/pipeline/build_foods.py --sr-zip X.zip --foundation-zip Y.zip
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / "data" / "pipeline"
sys.path.insert(0, str(PIPELINE))  # explicit, because the script is run with python3 -I
import auto_foods  # noqa: E402
OUT_DIR = ROOT / "data" / "foods"
META = ROOT / "data" / "meta.json"

DOWNLOAD_PAGE = "https://fdc.nal.usda.gov/download-datasets"
DATASETS_BASE = "https://fdc.nal.usda.gov/fdc-datasets/"
SR_LEGACY_ZIP = "FoodData_Central_sr_legacy_food_csv_2018-04.zip"
FOUNDATION_RE = re.compile(r"FoodData_Central_foundation_food_csv_(\d{4}-\d{2}-\d{2})\.zip")
UNIT_MAP = {"g": "G", "mg": "MG", "µg": "UG", "kcal": "KCAL"}
USER_AGENT = "halfbakedtools-data-pipeline (+https://github.com/)"

csv.field_size_limit(sys.maxsize)


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=300) as resp:
        return resp.read()


def latest_foundation_name() -> str:
    html = fetch(DOWNLOAD_PAGE).decode("utf-8", "replace")
    found = sorted(set(FOUNDATION_RE.findall(html)))
    if not found:
        raise RuntimeError("Could not find a Foundation Foods CSV link on " + DOWNLOAD_PAGE)
    return f"FoodData_Central_foundation_food_csv_{found[-1]}.zip"


def get_zip(name: str, cache: Path, local: str | None) -> Path:
    if local:
        return Path(local)
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / name
    if not path.exists():
        log(f"Downloading {name} ...")
        path.write_bytes(fetch(DATASETS_BASE + name))
    return path


def read_csv(zf: zipfile.ZipFile, filename: str):
    matches = [n for n in zf.namelist() if n.rsplit("/", 1)[-1].lower() == filename]
    if not matches:
        listing = ", ".join(zf.namelist()[:30])
        raise RuntimeError(f"{filename} not found in {zf.filename}. Archive contains: {listing}")
    with zf.open(matches[0]) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig"))


class Dataset:
    def __init__(self, label: str, path: Path, data_types: set[str]):
        self.label = label
        self.path = path
        self.zf = zipfile.ZipFile(path)
        self.foods: dict[str, str] = {}
        self.category: dict[str, str] = {}
        for row in read_csv(self.zf, "food.csv"):
            if row.get("data_type") in data_types:
                self.foods[row["fdc_id"]] = row["description"]
                self.category[row["fdc_id"]] = row.get("food_category_id", "")
        self.nutrient_meta = {
            int(row["id"]): (row["name"], row["unit_name"].upper())
            for row in read_csv(self.zf, "nutrient.csv")
        }
        log(f"{label}: {len(self.foods)} foods")

    def values(self, fdc_ids: set[str]) -> dict[str, dict[int, float]]:
        out: dict[str, dict[int, float]] = {i: {} for i in fdc_ids}
        for row in read_csv(self.zf, "food_nutrient.csv"):
            fid = row["fdc_id"]
            if fid in out and row.get("amount") not in (None, ""):
                out[fid][int(row["nutrient_id"])] = float(row["amount"])
        return out


def match(food: dict, ds: Dataset) -> tuple[str, str] | None:
    inc = [t.lower() for t in food["include"]]
    if not inc:
        return None
    exc = [t.lower() for t in food.get("exclude", [])]
    pref = [t.lower() for t in food.get("prefer", [])]
    hits = []
    for fid, desc in ds.foods.items():
        d = desc.lower()
        if all(t in d for t in inc) and not any(t in d for t in exc):
            score = sum(t in d for t in pref)
            hits.append((-score, len(desc), desc, fid))
    if not hits:
        return None
    hits.sort()
    return hits[0][3], hits[0][2]


def extract(nutrients: list[dict], raw: dict[int, float], meta: dict[int, tuple[str, str]]):
    """Return {key: value} for nutrients present in raw, validating names and units."""
    out = {}
    for n in nutrients:
        for nid in n["ids"]:
            if nid not in raw:
                continue
            name, unit = meta.get(nid, ("", ""))
            if n["name"].lower() not in name.lower():
                raise RuntimeError(f"Nutrient id {nid} is '{name}', expected '{n['name']}' for {n['key']}")
            expected = n.get("usdaUnit") or UNIT_MAP[n["unit"]]
            if unit != expected:
                raise RuntimeError(f"Nutrient {nid} unit {unit}, expected {expected} for {n['key']}")
            out[n["key"]] = raw[nid]
            break
    return out


def derive(v: dict) -> dict:
    d = {}
    if "niacinPreformed" in v:
        d["niacinNE"] = v["niacinPreformed"] + (v["tryptophan"] * 1000 / 60 if "tryptophan" in v else 0)
    if "sodium" in v:
        d["salt"] = v["sodium"] * 2.5 / 1000
    if "methionine" in v and "cystine" in v:
        d["metCys"] = v["methionine"] + v["cystine"]
    if "phenylalanine" in v and "tyrosine" in v:
        d["pheTyr"] = v["phenylalanine"] + v["tyrosine"]
    d["epaDha"] = (v.get("epa", 0) + v.get("dha", 0)) * 1000
    return d


def write_foundation_candidates(catalogue: list[dict], fnd: Dataset) -> None:
    """List Foundation records that look like each catalogue food, to help add "foundation" queries."""
    lines = ["# Foundation Foods candidates", "",
             "Foundation Foods holds newer lab analyses. To use one for a food, add a",
             '`"foundation": {"include": [...]}` query to that food in `foods_catalogue.json`.', ""]
    for food in catalogue:
        word = food["include"][0].split(",")[0].strip().lower().rstrip("s")
        hits = sorted(d for d in fnd.foods.values() if word in d.lower())[:15]
        lines.append(f"## {food['name']}" + (" (has foundation query)" if food.get("foundation") else ""))
        lines += [f"- {h}" for h in hits] or ["- (none found)"]
        lines.append("")
    (OUT_DIR / "foundation_candidates.md").write_text("\n".join(lines))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default=str(ROOT / ".cache" / "usda"))
    ap.add_argument("--sr-zip", help="local SR Legacy CSV zip (skip download)")
    ap.add_argument("--foundation-zip", help="local Foundation Foods CSV zip (skip download)")
    ap.add_argument("--no-foundation", action="store_true", help="use SR Legacy only")
    args = ap.parse_args()

    spec = json.loads((PIPELINE / "nutrients.json").read_text())
    catalogue = json.loads((PIPELINE / "foods_catalogue.json").read_text())["foods"]
    cache = Path(args.cache)

    sr = Dataset("SR Legacy", get_zip(SR_LEGACY_ZIP, cache, args.sr_zip), {"sr_legacy_food"})
    fnd = None
    if not args.no_foundation:
        name = Path(args.foundation_zip).name if args.foundation_zip else latest_foundation_name()
        try:
            fnd = Dataset("Foundation", get_zip(name, cache, args.foundation_zip), {"foundation_food"})
        except Exception as err:  # Foundation is an optional enhancement; SR Legacy alone is enough
            log(f"WARNING: skipping Foundation Foods ({err})")
            fnd = None

    matches, unmatched = [], []
    for food in catalogue:
        m_sr = match(food, sr)
        # Foundation descriptions use a different style, so a food only matches
        # there when its catalogue entry has a "foundation" query.
        m_fn = match(food["foundation"], fnd) if fnd and food.get("foundation") else None
        if not m_sr and not m_fn:
            unmatched.append(food["id"])
        matches.append((food, m_fn, m_sr))
    if unmatched:
        log("No USDA match for: " + ", ".join(unmatched) + " (see match_report.md)")

    curated_ids = {m[2][0] for m in matches if m[2]}
    auto = []
    for fid, desc in sr.foods.items():
        if fid in curated_ids:
            continue
        cat = auto_foods.auto_include(sr.category.get(fid, ""), desc)
        if cat:
            auto.append((fid, desc, cat))

    sr_vals = sr.values(curated_ids | {a[0] for a in auto})
    fn_vals = fnd.values({m[1][0] for m in matches if m[1]}) if fnd else {}

    nutrients = spec["nutrients"]
    keys = [n["key"] for n in nutrients] + [d["key"] for d in spec["derived"]]
    sig = lambda x: float(f"{x:.4g}")
    foods_out, report = [], []

    def pack(vals: dict) -> list:
        return [sig(vals[k]) if k in vals else None for k in keys]

    for food, m_fn, m_sr in matches:
        if not m_fn and not m_sr:
            report.append(f"| {food['name']} | **no match** | | |")
            continue
        vals = {}
        if m_sr:
            vals.update(extract(nutrients, sr_vals[m_sr[0]], sr.nutrient_meta))
        if m_fn:
            vals.update(extract(nutrients, fn_vals[m_fn[0]], fnd.nutrient_meta))
        if "energy" not in vals:
            report.append(f"| {food['name']} | skipped: no energy value | | |")
            continue
        vals.update(derive(vals))
        primary = m_fn or m_sr
        group, _ = auto_foods.group_and_variant(auto_foods.uk_name(primary[1]))
        foods_out.append({
            "id": food["id"], "name": food["name"],
            "cat": auto_foods.CURATED_CATEGORY.get(food["group"], "other"), "group": food.get("listGroup") or group,
            "label": food["name"], "diet": food["diet"], "common": True,
            "unit": food["unit"], "unitGrams": food["unitGrams"], "step": food["step"], "maxGrams": food["maxGrams"],
            "notes": food.get("notes"), "fdcId": primary[0], "usdaName": primary[1],
            "dataset": "foundation" if m_fn else "sr", "v": pack(vals),
        })
        fn_txt = f"{m_fn[1]} ({m_fn[0]})" if m_fn else "–"
        sr_txt = f"{m_sr[1]} ({m_sr[0]})" if m_sr else "–"
        report.append(f"| {food['name']} | {fn_txt} | {sr_txt} | {len(vals)} |")

    auto_counts: dict[str, int] = {}
    for fid, desc, cat in auto:
        vals = extract(nutrients, sr_vals.get(fid, {}), sr.nutrient_meta)
        if "energy" not in vals:
            continue
        vals.update(derive(vals))
        name = auto_foods.uk_name(desc)
        group, variant = auto_foods.group_and_variant(name)
        step, cap = auto_foods.amounts_for(cat, name)
        foods_out.append({
            "id": f"u{fid}", "name": name, "cat": cat, "group": group, "label": variant,
            "diet": auto_foods.diet_for(cat, desc), "common": False,
            "unit": "g", "unitGrams": 1, "step": step, "maxGrams": cap, "notes": None,
            "fdcId": fid, "usdaName": desc, "dataset": "sr", "v": pack(vals),
        })
        auto_counts[cat] = auto_counts.get(cat, 0) + 1

    if fnd:
        write_foundation_candidates(catalogue, fnd)

    today = dt.date.today().isoformat()
    sources = {"srLegacy": SR_LEGACY_ZIP, "foundation": fnd.path.name if fnd else None}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "foods.json").write_text(json.dumps({
        "generated": today,
        "source": "USDA FoodData Central (public domain)",
        "files": sources,
        "nutrients": nutrients + spec["derived"],
        "keys": keys,
        "categories": [{"id": c, "name": n} for c, n in auto_foods.CATEGORIES],
        "foods": foods_out,
    }, ensure_ascii=False, separators=(",", ":")))
    cat_names = dict(auto_foods.CATEGORIES)
    (OUT_DIR / "match_report.md").write_text(
        f"# Food match report ({today})\n\n"
        "## Common foods (curated, on by default)\n\n"
        "Check that each food matched the record you expect. Edit `foods_catalogue.json` to fix a match.\n\n"
        "| Food | Foundation match (fdc_id) | SR Legacy match (fdc_id) | Nutrient values |\n|---|---|---|---|\n"
        + "\n".join(report) + "\n\n"
        "## Other foods (added automatically, off by default)\n\n"
        "Rules are in `auto_foods.py`.\n\n| Category | Foods |\n|---|---|\n"
        + "\n".join(f"| {cat_names[c]} | {n} |" for c, n in sorted(auto_counts.items(), key=lambda x: list(cat_names).index(x[0])))
        + "\n"
    )
    meta = json.loads(META.read_text()) if META.exists() else {}
    meta.update({"foodsLastUpdated": today, "foodsSources": sources, "foodCount": len(foods_out)})
    META.write_text(json.dumps(meta, indent=2) + "\n")
    log(f"Wrote {len(foods_out)} foods ({len(foods_out) - sum(auto_counts.values())} common, {sum(auto_counts.values())} more; {len(unmatched)} unmatched)")
    return 1 if len(foods_out) == 0 else 0


if __name__ == "__main__":
    sys.exit(main())
