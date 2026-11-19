"""Rules of the Blended table (blend_all.py): which records are the same food, which count, and definitions."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent / "tables")]
import blend_all as b  # noqa: E402
import common_list as cl  # noqa: E402

DATA = HERE.parents[1] / "data/foods"


def rec(table: str, name: str, cat: str = "veg", **vals) -> dict:
    v = [None] * len(cl.KEYS)
    for k, x in vals.items():
        v[cl.IX[k]] = x
    words, state, facets = cl.read_name(name)
    return {"table": table, "name": name, "words": words, "state": state, "skin": facets, "family": table,
            "f": {"cat": cat, "v": v, "src": {"code": name}, "id": f"{table}:{name}"}}


class SameFood(unittest.TestCase):
    def test_colour_and_other_foods_are_not_qualifiers(self):
        self.assertFalse(b.words_same(cl.read_name("Tomatoes, green, raw")[0], cl.read_name("Tomato, raw")[0]))
        self.assertFalse(b.words_same(cl.read_name("Mustard spinach, raw")[0], cl.read_name("Spinach, raw")[0]))
        self.assertTrue(b.words_same(cl.read_name("Salmon, Atlantic, farmed")[0], cl.read_name("Salmon, farmed")[0]))

    def test_packing_medium(self):
        self.assertEqual(b.packing("Peaches, canned, juice pack, solids and liquids"), "juice")
        self.assertEqual(b.packing("Peaches, canned in juice, whole contents"), "juice")
        self.assertEqual(b.packing("Pears, canned, heavy syrup pack"), "syrup")
        self.assertEqual(b.packing("Pear, canned"), "")

    def test_fortification(self):
        self.assertTrue(b.fortified("Breakfast cereal, flakes of corn, added vitamins & minerals (Kellogg's Cornflakes)"))
        self.assertTrue(b.fortified("Soya drink unsweetened, fortified with calcium"))
        self.assertFalse(b.fortified("Breakfast cereal, cornflakes, unfortified"))
        self.assertFalse(b.fortified("Cereals, oats, regular and quick, not fortified, dry"))

    def test_fat_level_and_salt(self):
        whole = dict(protein=3.3, fat=0.97, energy=42, sodium=44, calcium=125, potassium=150)
        skim = dict(protein=3.4, fat=0.1, energy=34, sodium=42, calcium=122, potassium=156)
        self.assertFalse(b.composition_same(rec("x", "a", **whole)["f"]["v"], rec("y", "a", **skim)["f"]["v"]))
        self.assertFalse(cl.facet_ok(cl.read_name("Pasta, cooked, with added salt")[2], cl.read_name("Pasta, cooked, no added salt")[2]))

    def test_composition_needs_minerals(self):
        a = dict(protein=3, fat=0.4, energy=30, sodium=10, calcium=40, potassium=300)
        self.assertTrue(b.composition_same(rec("x", "a", **a)["f"]["v"], rec("y", "a", **a)["f"]["v"]))
        few = dict(protein=3, fat=0.4, energy=30, sodium=10)
        self.assertFalse(b.composition_same(rec("x", "a", **few)["f"]["v"], rec("y", "a", **few)["f"]["v"]))


class Counting(unittest.TestCase):
    def setUp(self):
        b.TAG.update({t: t.upper() for t in b.ORDER})

    def test_one_record_per_family_and_unknown_not_used(self):
        recs = [rec("usda", "Lentils, raw", protein=24, fat=1), rec("cnf", "Lentils, raw", protein=24, fat=1),
                rec("afcd", "Lentils, raw", protein=23, fat=1.2)]
        recs[1]["family"] = "usda"
        recs[2]["family"] = "?"
        used, why = b.used_members(recs, [0, 1, 2])
        self.assertEqual(used, [0])
        self.assertIn("USDA", why[1])
        self.assertIn("without naming", why[2])


class Output(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.values = json.loads((DATA / "foods-blend-values.json").read_text())
        cls.keys = cls.values["keys"]

    def test_definitions_never_mixed(self):
        """Every value's definition is one a contributing table has for that nutrient, per standard."""
        for fid, food in self.values["foods"].items():
            for s in b.STANDARDS:
                for k, d in zip(self.keys, food["d"][s]):
                    if d is None or d.startswith("calc:"):
                        continue
                    self.assertEqual(d.split(":")[0], k, fid)
                    self.assertIn(d, food["s"], f"{fid} {k}")

    def test_preferred_definition_used_when_given(self):
        for fid, food in self.values["foods"].items():
            for k, std, want in (("vitaminA", "us", "vitaminA:rae"), ("vitaminA", "uk", "vitaminA:re"), ("folate", "uk", "folate:total")):
                i = self.keys.index(k)
                if want in food["s"] and "not used" not in food["s"][want].split(";")[0]:
                    self.assertEqual(food["d"][std][i], want, fid)

    def test_each_food_has_two_independent_tables(self):
        for fid, food in self.values["foods"].items():
            self.assertGreaterEqual(sum("notUsed" not in r for r in food["records"]), 2, fid)


if __name__ == "__main__":
    unittest.main()
