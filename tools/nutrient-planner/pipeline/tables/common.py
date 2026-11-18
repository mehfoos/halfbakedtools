"""Shared parts of the food table converters: the nutrient keys, derived values, food entries and output files.

Each converter (bls.py, ciqual.py, ...) reads its own table and gives, per food: the table's code and name, a
category (or None if it is not one of the basic foods), the values it publishes (already in the planner's units) and
labels for anything that isn't a plain value (a code such as trace, an estimate, a borrowed value). This module
turns them into the two files every table has (see README.md) and a report.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPELINE = HERE.parent
TOOL = PIPELINE.parent
sys.path.insert(0, str(PIPELINE))
import auto_foods  # noqa: E402

USDA = json.loads((TOOL / "data/foods/foods.json").read_text())
KEYS: list[str] = USDA["keys"]
NUTRIENTS = USDA["nutrients"]
UNIT = {n["key"]: n["unit"] for n in NUTRIENTS}
CATEGORIES = [{"id": c, "name": n} for c, n in auto_foods.CATEGORIES]
DERIVED = {"niacinNE", "salt", "metCys", "pheTyr", "epaDha"}
NUMBER = re.compile(r"^\s*-?[0-9]+(?:[.,][0-9]+)?\s*$")


def num(text) -> float | None:
    """A plain number, or None (codes, blanks, '<x' and the like are not numbers)."""
    if text is None:
        return None
    if isinstance(text, (int, float)):
        return float(text)
    t = str(text).strip().replace(",", ".")
    try:
        return float(t) if re.fullmatch(r"-?[0-9.]+(?:[eE][-+]?[0-9]+)?", t) else None
    except ValueError:
        return None


def first_word_group(name: str) -> str:
    """A list group for names without commas: the first word ("Strawberry raw" -> "Strawberry")."""
    return re.split(r"[ ,(/]", name.strip(), maxsplit=1)[0].strip() or name


def derive(v: dict, table_gives_ne: bool = False) -> dict:
    """The planner's derived values, worked out only when every part is known (never completed with zero)."""
    d = {}
    if not table_gives_ne and "niacinPreformed" in v and "tryptophan" in v:
        d["niacinNE"] = v["niacinPreformed"] + v["tryptophan"] * 1000 / 60
    if "sodium" in v:
        d["salt"] = v["sodium"] * 2.5 / 1000
    if "methionine" in v and "cystine" in v:
        d["metCys"] = v["methionine"] + v["cystine"]
    if "phenylalanine" in v and "tyrosine" in v:
        d["pheTyr"] = v["phenylalanine"] + v["tyrosine"]
    if "epa" in v and "dha" in v:
        d["epaDha"] = (v["epa"] + v["dha"]) * 1000
    return d


def pack(vals: dict) -> list:
    return [float(f"{vals[k]:.4g}") if k in vals and vals[k] is not None else None for k in KEYS]


def unique_id(table: str, code: str, seen: set) -> str:
    """Permanent id <table>:<code> (lower case, page-address safe); a reused code gets :2, :3."""
    base = f"{table}:" + re.sub(r"[^a-z0-9-]+", "-", code.lower()).strip("-")
    fid, n = base, 1
    while fid in seen:
        n += 1
        fid = f"{base}:{n}"
    seen.add(fid)
    return fid


# Raw foods people don't normally eat raw stay out of a table's default list (owner, 18 Nov 2026; the USDA rules are
# in wider_selection.json "rawRules"). For tables without a curated common list, the default is every basic food
# except these ("wider" flag); they stay selectable by hand.
RAW = re.compile(r"\b(raw|uncooked)\b", re.I)
RAW_OK_VEG = re.compile(r"\b(cabbage|carrots?|celery|chicory|chives?|cucumbers?|fennel|garlic|lettuce|lamb's lettuce|"
                        r"endive|mangetout|parsley|peppers?|bell pepper|radish(es)?|rocket|spinach|spring onions?|"
                        r"tomato(es)?|watercress|cress|sprouts?|salad|basil|dill|mint|coriander|sorrel)\b", re.I)


def raw_unusual(cat: str, name: str) -> bool:
    if not RAW.search(name) or re.search(r"smoked|cured|dried", name, re.I):
        return False
    if cat == "veg":
        return not RAW_OK_VEG.search(name) or bool(re.search(r"brussels sprouts", name, re.I))
    if cat == "dairy":
        return bool(re.search(r"\begg", name, re.I))
    if cat == "fruit":
        return bool(re.search(r"rhubarb", name, re.I))
    if cat == "nuts":
        return bool(re.search(r"chestnut", name, re.I))
    return cat in ("meat", "fish")


def entry(table: str, fid: str, code: str, name: str, cat: str, vals: dict, labels: dict, *, basic: bool,
          src_name: str | None = None, extra: dict | None = None, diet: str | None = None,
          group: str | None = None, rule_name: str | None = None) -> dict:
    """One food. Basic foods get the shared diet, amount and cap rules; other foods are Food Finder only.
    The list group is the name up to its first comma; a table whose names have no commas can pass its own."""
    g, variant = auto_foods.group_and_variant(name)
    if group:
        g, variant = group, name
    group = g
    f = {"id": fid, "name": name, "cat": cat, "group": group, "label": variant or name}
    if basic:
        step, max_g = auto_foods.amounts_for(cat, name)
        f |= {"diet": diet or auto_foods.diet_for(cat, name), "unit": "g", "unitGrams": 1, "step": step, "maxGrams": max_g,
              "notes": None, "noteRef": None, "capGroup": auto_foods.cap_group(cat, name), "common": False,
              "wider": None if raw_unusual(cat, rule_name or name) else True}
    else:
        f |= {"diet": "meat" if cat in auto_foods.MEAT_CATS else "unknown", "unit": "g", "unitGrams": 1, "step": 10,
              "maxGrams": 1000, "notes": None, "noteRef": None, "capGroup": None, "common": False, "basic": False}
    f |= {"src": {"table": table, "code": code, "name": src_name or name} | (extra or {}),
          "srcName": src_name or name, "q": labels or None, "v": pack(vals)}
    return f


# Words that keep a food out of the basic foods, whatever its group (the same policy as the USDA rules).
BASIC_EXCLUDE = re.compile(
    r"\b(fried|deep[- ]fried|breaded|coated|batter|battered|in sauce|with sauce|sandwich|pizza|burger|filled|stuffed|"
    r"pastry|takeaway|infant|baby|toddler|child|children|dish|meal|ready[- ]meal|salted|crisps|chips|sweetened|"
    r"candied|in syrup|liver|kidney|offal|tongue|heart|brain|tripe|pate|pâté|sausage|salami|nugget|soup|sugar|"
    r"syrup|chocolate|cocoa|cake|cakes|biscuit|biscuits|cookie|cookies|snack|snacks|candy|confectionery|jam|jelly|dessert|pudding|mousse|custard|flan|liegeois|li\u00e9geois|ice cream|whipped)\b(?! snap| pea)", re.I)
RAW_MEAT = re.compile(r"\braw\b", re.I)
MEAT_WORDS = re.compile(r"\b(" + "|".join(re.escape(w) for w in auto_foods.MEAT_WORDS) + r")", re.I)


def basic_category(cat: str | None, name: str) -> str | None:
    """The shared basic-food rule on top of a table's own group mapping: no excluded words, no raw meat or fish,
    and no meat or fish words outside the meat and fish categories (so vegetarian categories stay free of them)."""
    if cat is None or cat in ("dishes", "sweets", "beverages", "baby", "other") or BASIC_EXCLUDE.search(name):
        return None
    if cat in auto_foods.MEAT_CATS:
        if RAW_MEAT.search(name) and not re.search(r"smoked|cured|dried", name, re.I):
            return None
        return cat
    if MEAT_WORDS.search(name):
        return None
    return cat


def write(table: str, title: str, files: dict, definitions: dict, basic: list, more: list, report: list[str],
          labels_text: dict | None = None) -> None:
    today = dt.date.today().isoformat()
    head = {"generated": today, "table": table, "source": title, "files": files, "keys": KEYS}
    out = TOOL / "data/foods"
    (out / f"foods-{table}.json").write_text(json.dumps(head | {
        "definitions": definitions, "labels": labels_text or {}, "nutrients": NUTRIENTS, "categories": CATEGORIES,
        "foods": basic}, ensure_ascii=False, separators=(",", ":")))
    (out / f"foods-{table}-more.json").write_text(json.dumps(head | {"categories": CATEGORIES, "foods": more},
                                                             ensure_ascii=False, separators=(",", ":")))
    allf = basic + more
    counts = {k: sum(1 for f in allf if f["v"][KEYS.index(k)] is not None) for k in KEYS}
    lines = [f"# {title}: food file report ({today})", "",
             f"Generated by `pipeline/tables/{table}.py` from {', '.join(f'`{v}`' for v in files.values())}. "
             "Values are this table's only; anything it doesn't give is NA.", "",
             f"Basic foods (the Planner's list, `foods-{table}.json`): {len(basic)}.",
             f"Other foods (Food Finder only, `foods-{table}-more.json`): {len(more)}.", "", *report, "",
             "## Foods with a value, per nutrient", "", "| Nutrient | Foods with a value | Definition in this table |",
             "|---|---|---|"]
    for k in KEYS:
        lines.append(f"| {k} | {counts[k]} | {definitions.get(k, 'derived' if k in DERIVED else ('not in this table' if not counts[k] else ''))} |")
    (out / f"{table}_report.md").write_text("\n".join(lines) + "\n")
    print(f"foods-{table}.json: {len(basic)} basic; foods-{table}-more.json: {len(more)} more", file=sys.stderr)
