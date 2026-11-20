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
    def test_flavoured_and_fortified_names(self):
        self.assertIn("flavoured", cl.read_name("Yoghurt, flavoured, 2.5% fat")[0])   # flavoured is another product
        self.assertIn("flavoured", cl.DISTINCT)
        self.assertTrue(b.fortified("Yoghurt, plain, fat-free, lactose-free, 1 ug vitamin d"))
        self.assertTrue(cl.NAMED_DOSE.search("(arc)milk, 0% fat, with added calcium and 0.5 ug vitamin d"))

    def test_fresh_milk_is_plain_milk_but_fresh_mozzarella_is_not_low_moisture(self):
        vals = dict(protein=3.4, fat=0.1, calcium=123)
        bls = rec("bls", "Milk skimmed, fresh, max. 0.1 % fat, pasteurised", "dairy", **vals)
        cofid = rec("cofid", "Milk, skimmed, pasteurised, average", "dairy", **vals)
        self.assertTrue(b.identity_ok(bls, cofid))
        fresh = rec("a", "Mozzarella, fresh", "dairy", protein=18, fat=17)
        dry = rec("b", "Mozzarella", "dairy", protein=18, fat=17)
        self.assertFalse(b.identity_ok(fresh, dry))

    def test_a_fat_limit_in_the_name_is_not_a_food_word(self):
        # BLS "max. 0.1 % fat" must read as the milk, not as a word "max"; the fat level stays with the values
        w = cl.read_name("Milk skimmed, fresh, max. 0.1 % fat, pasteurised")[0]
        self.assertEqual(w, cl.read_name("Milk, skimmed, pasteurised")[0])
        self.assertNotIn("max", w)
        self.assertEqual(cl.read_name("Milk, whole, fresh, min. 3.5 % fat, pasteurised")[0],
                         cl.read_name("Milk, whole, pasteurised")[0])

    def test_colour_and_other_foods_are_not_qualifiers(self):
        self.assertFalse(b.words_same(cl.read_name("Tomatoes, green, raw")[0], cl.read_name("Tomato, raw")[0]))
        self.assertFalse(b.words_same(cl.read_name("Mustard spinach, raw")[0], cl.read_name("Spinach, raw")[0]))
        self.assertTrue(b.words_same(cl.read_name("Salmon, Atlantic, farmed")[0], cl.read_name("Salmon, Atlantic")[0]))
        self.assertFalse(b.words_same(cl.read_name("Cod, Pacific, cooked")[0], cl.read_name("Cod, cooked")[0]))   # species

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


class GroupWide(unittest.TestCase):
    """Found by the independent review (19 Nov 2026): groups built by chaining joined opposites."""

    def nuts(self, table, name, sodium):
        r = rec(table, name, "nuts", protein=24, fat=50, energy=580, sodium=sodium, calcium=50, potassium=650, iron=1.5, magnesium=170)
        r["f"]["common"] = True
        return r

    def test_no_chaining_through_a_record_that_says_nothing(self):
        recs = [self.nuts("usda", "Peanuts, dry roasted, without salt", 6), self.nuts("bls", "Peanuts, dry roasted", 8),
                self.nuts("cofid", "Peanuts, dry roasted, salted", 790)]
        for g in b.groups(recs):
            names = {recs[i]["name"] for i in g}
            self.assertFalse({"Peanuts, dry roasted, without salt", "Peanuts, dry roasted, salted"} <= names, names)

    def test_salt_levels(self):
        self.assertFalse(cl.facet_ok(cl.read_name("Butter, reduced salt")[2], cl.read_name("Butter")[2]))
        self.assertEqual(cl.read_name("Nut, pistachio nut, salt")[2], "/yes")
        self.assertEqual(cl.read_name("Lentils, boiled in unsalted water")[0], frozenset({"lentil"}))

    def test_identity_rules(self):
        flour = lambda t, n: rec(t, n, "grains", protein=12, fat=2, energy=340, sodium=2, calcium=30, potassium=300)  # noqa: E731
        self.assertFalse(b.identity_ok(flour("ciqual", "Wheat flour, type 150"), flour("bls", "Wheat flour, Type 1050")))
        self.assertFalse(b.identity_ok(rec("usda", "Spinach, raw"), rec("afcd", "Spinach, water, fresh, raw")))
        self.assertNotEqual(cl.read_name("Brown rice boiled, fried without fat (pan)")[1], cl.read_name("Rice, brown, boiled")[1])
        pita_us = rec("usda", "Bread, pita, white, unenriched", "grains", protein=9, fat=1.2, energy=275, iron=1.4, folate=24)
        pita_ca = rec("cnf", "Bread, pita, white", "grains", protein=9, fat=1.2, energy=275, iron=4.2, folate=201)
        self.assertFalse(b.identity_ok(pita_us, pita_ca))   # Canadian flour is fortified without the name saying so


class SecondReview(unittest.TestCase):
    """Found by the second independent review (19 Nov 2026)."""

    def test_cooking_methods(self):
        st = lambda n: cl.read_name(n)[1]  # noqa: E731
        self.assertEqual(st("Sweet potato, steamed"), "steamed")
        self.assertEqual(st("Broccoli, Blanched"), "blanched")
        self.assertEqual(st("Fish, salmon, pink, cooked, dry heat"), "dryheat")
        self.assertEqual(st("Beans, butter, canned, re-heated, drained"), "canned")
        boiled, steamed = rec("usda", "Cassava, boiled"), rec("cofid", "Cassava, steamed")
        self.assertFalse(b.states_same(boiled, steamed))
        self.assertFalse(b.states_same(rec("ciqual", "Celeriac, cooked"), rec("bls", "Celeriac baked")))
        self.assertTrue(b.states_same(rec("usda", "Barley, pearled, cooked", "grains"), rec("bls", "Barley, pearl, boiled", "grains")))

    def test_fortified_names_and_salt_phrases(self):
        self.assertTrue(b.fortified("Soya drink, vitamins"))
        self.assertEqual(cl.read_name("Millet, boiled, no added fat or salt")[2], "/no")

    def test_core_copies(self):
        core = {k: float(i + 1) for i, k in enumerate(cl.CORE_KEYS)}
        u = rec("usda", "a", **core)["f"]["v"]
        v = list(u)
        for k in ("epa", "dha", "lysine", "leucine", "valine", "histidine"):
            v[cl.IX[k]] = 5.0   # recalculated fatty and amino acids don't hide a copy
        self.assertTrue(cl.copies(u, v))


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
                if want in food["s"] and "not used" not in food["s"][want].split(";")[0] and food["v"][std][i] is not None:
                    self.assertEqual(food["d"][std][i], want, fid)

    def test_kept_apart_pairs_never_share_a_food(self):
        foods = json.loads((DATA / "foods-blend.json").read_text())["foods"]
        for pair in b.kept_apart():
            self.assertFalse(any(pair <= set(f["src"]["members"]) for f in foods), pair)

    def test_each_food_has_two_independent_tables(self):
        for fid, food in self.values["foods"].items():
            self.assertGreaterEqual(sum("notUsed" not in r for r in food["records"]), 2, fid)


if __name__ == "__main__":
    unittest.main()
