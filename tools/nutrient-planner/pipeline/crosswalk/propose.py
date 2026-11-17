#!/usr/bin/env python3
"""Propose candidate records in another food composition table for each planner food.

This script never decides a match. It writes a review list; a person (or an AI,
checked by a person) picks the right record, or none, and records the choice in
crosswalk.json with a note. See README.md in this folder for the whole method.

How candidates are ranked (FAO/INFOODS food-matching guidelines: match on the food,
its part, its state and its processing, then compare composition):
  1. Name score: shared words between the candidate's name and the planner food
     (planner name counts double, USDA description once), after mapping US/UK
     spellings to one word (zucchini -> courgette, canola -> rapeseed, ...).
  2. State check: words like raw / boiled / baked / canned / dried / frozen found in the
     USDA description must also be in the candidate, and vice versa. A clash is shown,
     not hidden.
  3. Profile check: water, protein and fat per 100 g are compared with our USDA
     record. Water is the best single signal of cooking state (boiled rice ~70 g,
     dry rice ~12 g). Differences beyond a tolerance are flagged.

Usage (standard library only):
  python3 -I propose.py --db cofid --table PATH.xlsx --usda-zip SR_LEGACY.zip [--all]
Writes ../../data/foods/crosswalk_candidates_<db>.md
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOL = HERE.parents[1]
sys.path.insert(0, str(HERE))
import sources  # noqa: E402

# US or alternative word -> the word we compare on. Kept short and literal on purpose.
SYNONYMS = {
    "zucchini": "courgette", "eggplant": "aubergine", "garbanzo": "chickpeas", "chickpea": "chickpeas",
    "navy": "haricot", "lima": "butter", "canola": "rapeseed", "shrimp": "prawns", "prawn": "prawns",
    "beets": "beetroot", "beet": "beetroot", "yogurt": "yoghurt", "ground": "mince", "minced": "mince",
    "soymilk": "soya", "soy": "soya", "whole-wheat": "wholemeal", "wholewheat": "wholemeal",
    "whole-grain": "wholemeal", "canned": "tinned", "canned,": "tinned", "broiled": "grilled",
    "flaxseed": "linseed", "flaxseeds": "linseed", "filberts": "hazelnuts", "brazilnuts": "brazil",
    "kiwifruit": "kiwi", "mangos": "mango", "mangoes": "mango", "potatoes": "potato", "onions": "onion",
    "carrots": "carrot", "apples": "apple", "bananas": "banana", "oranges": "orange", "pears": "pear",
    "plums": "plum", "grapes": "grape", "eggs": "egg", "avocados": "avocado", "leeks": "leek",
    "parsnips": "parsnip", "lentils": "lentil", "peppers": "pepper", "mushrooms": "mushroom",
    "tomatoes": "tomato", "raisins": "raisin", "apricots": "apricot", "walnuts": "walnut",
    "almonds": "almond", "peanuts": "peanut", "cashew": "cashew", "cashews": "cashew",
    "hazelnuts": "hazelnut", "sprouts": "sprout", "beans": "bean", "peas": "pea", "seeds": "seed",
    "mussels": "mussel", "sardines": "sardine", "oats": "oat", "strawberries": "strawberry",
    "raspberries": "raspberry", "blueberries": "blueberry", "nonfat": "skimmed", "skim": "skimmed",
    "milkfat": "", "cantaloupe": "cantaloupe", "romaine": "cos", "garbanzos": "chickpeas",
    "snap": "green", "kernels": "kernel", "pearled": "pearl", "sulfured": "sulphured",
}
STOP = {"and", "or", "with", "without", "of", "the", "in", "a", "e", "g", "includes", "foods", "for",
        "usda", "s", "food", "distribution", "program", "all", "commercial", "varieties", "type",
        "fluid", "fresh", "regular", "plain", "added", "vitamin", "vitamins", "mature", "style",
        "flesh", "whole", "skin", "only", "separable", "lean", "meat", "broilers", "fryers", "fish",
        "nuts", "seeds", "seed", "cereals", "beverages", "crustaceans", "mollusks", "variety", "products"}
# State words: if one side has one and the other doesn't have a compatible one, flag it.
COOKED = {"boiled", "baked", "roasted", "grilled", "fried", "steamed", "stewed", "microwaved", "poached",
          "braised", "casseroled"}
STATES = {
    "raw": {"raw"}, "cooked": {"cooked"}, "boiled": {"boiled"}, "poached": {"poached"},
    "stewed": {"stewed", "braised"}, "baked": {"baked"}, "roasted": {"roasted"},
    "grilled": {"grilled"}, "fried": {"fried"}, "tinned": {"tinned"}, "dried": {"dried"},
    "frozen": {"frozen"}, "steamed": {"steamed"}, "microwaved": {"microwaved"},
}
# Phrases rewritten before splitting into words.
PHRASES = {"dry heat": "cooked", "moist heat": "cooked", "dry-roasted": "roasted", "mature seeds": "dried",
           "salt added": "salted"}
# (absolute, relative) tolerance per 100 g. Water/protein/fat catch the wrong food or cooking state;
# sodium catches salted vs unsalted; calcium catches bones (tinned fish) and fortification.
TOL = {"water": (3.0, 0.08), "protein": (1.0, 0.20), "fat": (1.0, 0.30), "sodium": (50.0, 0.5),
       "calcium": (30.0, 0.4)}


def words(text: str) -> list[str]:
    text = text.lower()
    for a, b in PHRASES.items():
        text = text.replace(a, b)
    out = []
    for w in re.findall(r"[a-z][a-z\-]*", text):
        w = SYNONYMS.get(w, w)
        if w and w not in STOP:
            out.append(w)
    return out


def states(ws: set[str]) -> set[str]:
    return {s for s, alts in STATES.items() if ws & alts or s in ws}


def states_agree(a: set[str], b: set[str]) -> bool | None:
    """True if the states agree, False if they clash, None if one name states nothing.

    A plain "cooked" matches any specific cooking method. "Dried" next to a cooking word or
    "raw" ("dried, boiled" pulses, "dried, raw" lentils) describes the product, not its
    state, so it is ignored there. Dried fruit vs fresh is caught by the water check.
    """
    if not a or not b:
        return None
    def norm(x, other):
        x = set(x)
        if "cooked" in x and (x & COOKED or other & COOKED):
            x.discard("cooked")
            x |= other & COOKED
        if "dried" in x and (x & COOKED or "raw" in x) and "dried" not in other:
            x.discard("dried")  # "dried, boiled" pulses or "dried, raw" lentils: describes the product
        return x
    return norm(a, b) == norm(b, a)


def name_score(planner: str, usda: str, cand: str) -> float:
    c = set(words(cand))
    if not c:
        return 0.0
    p, u = set(words(planner)), set(words(usda))
    hit = 2 * len(p & c) + len(u & c)
    return hit / (2 * len(p) + len(u) + 0.5 * len(c - p - u))


def profile_flags(usda: sources.Record, cand: sources.Record) -> list[str]:
    flags = []
    for key, (abs_tol, rel_tol) in TOL.items():
        a, b = usda.num(key), cand.num(key)
        if a is None or b is None:
            continue  # nothing to compare: not a disagreement (shown in the values column)
        if abs(a - b) > max(abs_tol, rel_tol * max(a, b)):
            flags.append(f"{key} {a:g} vs {b:g}")
    return flags


def fmt(v):
    """Cell text as published, tidied: Excel float noise (64.900000000000006) shown as 64.9."""
    try:
        return f"{float(v):.4g}"
    except (TypeError, ValueError):
        return "blank" if v is None else str(v)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True, choices=["cofid"])
    ap.add_argument("--table", required=True, help="path to the downloaded table")
    ap.add_argument("--usda-zip", required=True, help="FoodData_Central_sr_legacy_food_csv_2018-04.zip")
    ap.add_argument("--all", action="store_true", help="every food, not just the common ones")
    ap.add_argument("--top", type=int, default=5)
    args = ap.parse_args()

    foods = json.loads((TOOL / "data/foods/foods.json").read_text())["foods"]
    foods = [f for f in foods if f["common"] or args.all]
    usda = sources.load_usda_subset(Path(args.usda_zip), {f["fdcId"] for f in foods})
    table = sources.load_cofid(Path(args.table))
    nutrient = "iodine"

    lines = [f"# Crosswalk candidates: {args.db}", "",
             "Generated by `pipeline/crosswalk/propose.py`. Candidates only: nothing here is a match until it is "
             "recorded in `pipeline/crosswalk/crosswalk.json`. Flags: `state` = cooking/preservation words "
             "disagree; `water/protein/fat a vs b` = our USDA value vs the candidate's, beyond tolerance.", ""]
    for f in foods:
        u = usda[f["fdcId"]]
        u_states = states(set(words(u.name)))
        scored = []
        for rec in table.values():
            s = name_score(f["name"], u.name, rec.name)
            if s <= 0.15:
                continue
            c_states = states(set(words(rec.name)))
            flags = []
            agree = states_agree(u_states, c_states)
            if agree is None:
                flags.append("state not stated")
            elif not agree:
                flags.append(f"state {'/'.join(sorted(u_states)) or '-'} vs {'/'.join(sorted(c_states)) or '-'}")
            flags += profile_flags(u, rec)
            scored.append((s - 0.1 * len(flags), s, rec, flags))
        scored.sort(key=lambda t: -t[0])
        lines.append(f"## {f['id']}: {f['name']}")
        lines.append(f"USDA {u.code}: {u.name} | " + ", ".join(f"{k} {fmt(u.raw.get(k))}" for k in TOL))
        lines.append("")
        if not scored:
            lines.append("- no candidates")
        for rank, (_, s, rec, flags) in enumerate(scored[: args.top], 1):
            lines.append(f"{rank}. `{rec.code}` {rec.name} | name {s:.2f} | "
                         + ", ".join(f"{k} {fmt(rec.raw.get(k))}" for k in TOL)
                         + f" | {nutrient} {fmt(rec.raw.get(nutrient))} | {'; '.join(flags) or 'profile agrees'}")
        lines.append("")
    out = TOOL / f"data/foods/crosswalk_candidates_{args.db}.md"
    out.write_text("\n".join(lines))
    print(f"wrote {out.relative_to(TOOL)} ({len(foods)} foods)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
