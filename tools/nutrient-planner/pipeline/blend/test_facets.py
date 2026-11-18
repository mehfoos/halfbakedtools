"""Tests for the facet vocabulary and parser. Run: python3 -I -m unittest discover -s tools/nutrient-planner/pipeline/blend

Each case below is a published food name and facets it must (or must not) get. Many are mistakes found while
reviewing samples of the generated tables; keep them, so the mistakes can't come back.
"""
from __future__ import annotations

import csv
import io
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_facets  # noqa: E402
import facets  # noqa: E402

VOCAB = facets.load_vocabulary()

# name -> facets it must have (facet -> exact "; "-joined value, "" meaning must be empty)
CASES = {
    "Lentils, mature seeds, cooked, boiled, without salt":
        {"base": "lentils", "state": "cooked", "cooking": "boiled", "salt": "without", "part": "mature-seeds", "rest": ""},
    "Lentils, green and brown, whole, dried, boiled in unsalted water":
        {"cooking": "boiled", "salt": "without", "preservation": "dried", "variety": "green; brown"},
    "Milk, semi-skimmed, pasteurised, summer and autumn": {"fat": "reduced-fat", "preservation": "pasteurised"},
    "Milk, whole, 3.25% milkfat, with added vitamin D":
        {"fat": "full-fat; percent", "detail": "3.25% milkfat", "fortification": "fortified", "rest": ""},
    "Egg, whole, cooked, hard-boiled": {"part": "whole-egg", "cooking": "boiled", "rest": ""},
    "Eggs, chicken, whole, boiled": {"part": "whole-egg", "cooking": "boiled"},
    "Peanuts, all types, dry-roasted, without salt": {"cooking": "dry-roasted", "generic": "average", "state": "cooked"},
    "Pasta, dry, enriched": {"state": "unprepared", "fortification": "fortified"},
    # an ingredient's description must not describe the food
    "Bread, white, prepared from recipe, made with nonfat dry milk": {"fat": "", "state": ""},
    # a cut name containing 'roast' is not a cooking method
    "Beef, chuck eye roast, boneless, America's Beef Roast, separable lean only, trimmed to 0\" fat, all grades, raw":
        {"cooking": "", "state": "raw", "bone": "boneless", "cut": "chuck"},
    "Muffins, English, whole-wheat": {"variety": "wholemeal", "form": ""},
    "Bagels, oat bran": {"form": "", "rest": "oat bran"},
    "Nuts, coconut milk, raw (liquid expressed from grated meat and water)": {"form": "", "state": "raw"},
    "Pork, cured, ham, extra lean (approximately 4% fat), canned, unheated": {"fat": "extra-lean"},
    "Beef, ground, 93% lean meat / 7% fat, loaf, cooked, baked": {"fat": "percent", "form": "ground"},
    "Beans, baked, home prepared": {"cooking": ""},
    "Flour, wheat, bread/strong, white": {"base": "flour", "form": "flour"},
    # identity terms never eat the food's own name
    "Sweet potato, raw, unprepared": {"base": "sweet potato", "variety": ""},
    "Orange juice, chilled, includes from concentrate, with added calcium and vitamins A, D, E":
        {"base": "orange", "form": "juice; from-concentrate", "fortification": "fortified", "rest": ""},
    "Cherries, sour, red, canned, water pack, solids and liquids":
        {"preservation": "canned", "medium": "water", "portion": "solids-and-liquids", "variety": "red; sour"},
    "Chicken, broilers or fryers, breast, meat only, cooked, roasted":
        {"part": "flesh; breast", "cooking": "roasted", "rest": "broilers or fryers"},
    "Tofu, raw, firm, prepared with calcium sulfate": {"state": "raw", "rest": "firm; prepared with calcium sulfate"},
    "Bread, white, commercially prepared, toasted": {"state": "cooked", "cooking": "toasted"},
}


class Vocabulary(unittest.TestCase):
    def test_rows_are_valid(self):
        known = set(facets.ORDER) | {"keep", "ignore", "ignore-early"}
        with facets.VOCABULARY.open(newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        for r in rows:
            self.assertIn(r["facet"], known, r)
            self.assertIn(r["scope"], ("", "qualifier"), r)
            if r["facet"] not in ("keep", "ignore", "ignore-early"):
                self.assertTrue(r["term"], r)


class Describe(unittest.TestCase):
    def test_cases(self):
        for name, want in CASES.items():
            got = facets.describe(name, VOCAB).row()
            for k, v in want.items():
                with self.subTest(name=name, facet=k):
                    self.assertEqual(got[k], v)

    def test_cooking_implies_cooked(self):
        d = facets.describe("Carrots, boiled", VOCAB)
        self.assertIn("cooked", d.facets["state"])

    def test_conflicts_are_reported(self):
        d = facets.describe("Apples, raw, without skin, cooked, boiled", VOCAB)
        self.assertTrue(d.conflicts)


class Generated(unittest.TestCase):
    def test_tables_are_up_to_date_and_ids_unique(self):
        for table, _title, rows in (build_facets.usda(), build_facets.cofid()):
            path = build_facets.OUT / f"{table}.csv"
            committed = path.read_text(encoding="utf-8")
            buf = io.StringIO()
            w = csv.DictWriter(buf, fieldnames=build_facets.COLUMNS, lineterminator="\n")
            w.writeheader()
            for r in sorted(build_facets.with_ids(table, rows), key=lambda r: (r["name"].lower(), r["code"])):
                w.writerow(r | facets.describe(r["name"], VOCAB).row())
            self.assertEqual(committed, buf.getvalue(),
                             f"{path.name} is out of date: run pipeline/blend/build_facets.py")
            ids = [r["id"] for r in build_facets.with_ids(table, rows)]
            self.assertEqual(len(ids), len(set(ids)), f"{table}: duplicate ids")
            self.assertTrue(all(i.startswith(build_facets.TAGS[table] + ":") for i in ids))


if __name__ == "__main__":
    unittest.main()
