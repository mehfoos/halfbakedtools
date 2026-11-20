"""Checks of the food-table conversions against each table's documentation and errata (spot-checks of 20 Nov 2026).

Run: python3 -I -m unittest discover -s tools/nutrient-planner/pipeline/blend
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent / "tables")]
import afcd  # noqa: E402
import blend_all  # noqa: E402
import common  # noqa: E402

DATA = common.TOOL / "data/foods"


def foods(table: str) -> tuple[list, dict]:
    keys, out = None, {}
    for name in (f"foods-{table}.json", f"foods-{table}-more.json"):
        d = json.loads((DATA / name).read_text())
        keys = d["keys"]
        for f in d["foods"]:
            out[str(f["src"]["code"])] = f
    return keys, out


def value(keys: list, f: dict, key: str):
    i = keys.index(key)
    return f["v"][i] if i < len(f["v"]) else None


class AfcdZeros(unittest.TestCase):
    """AFCD reports results below the limit of reporting as 0 (About Release 3, page 3) and names imputed zeros in
    each food's Sampling Details: neither may appear as a plain, unlabelled 0."""

    def test_sampling_details_reading(self):
        z = afcd.imputed_zero("Alcohol, vitamins (B12, folic acid, retinol, D), caffeine and cholesterol were imputed zero.")
        self.assertTrue({"vitaminB12", "retinol", "vitaminD", "vitaminD2", "vitaminD3"} <= z)
        self.assertNotIn("vitaminA", z)        # needs beta-carotene too
        self.assertNotIn("folate", z)          # folic acid alone is not folate
        self.assertIn("iodine", afcd.imputed_zero("Vitamins (D, retinol, B12), caffeine, alcohol, cholesterol, I and fatty acids were imputed zero."))
        self.assertIn("epa", afcd.imputed_zero("Proximates (alcohol), fatty acids and caffeine were imputed zero."))
        self.assertNotIn("epa", afcd.imputed_zero("Some polyunsaturated fatty acids were imputed zero."))

    def test_no_unlabelled_zero(self):
        keys, fs = foods("afcd")
        for f in fs.values():
            q = f.get("q") or {}
            for k in afcd.MAP:
                if value(keys, f, k) == 0:
                    self.assertEqual(q.get(k), "z", f"{f['name']} {k}")

    def test_cinnamon(self):
        keys, fs = foods("afcd")
        f = fs["F002963"]   # Cinnamon, dried, ground: retinol, D and B12 imputed zero; EPA given as 0 with no reason
        self.assertEqual((value(keys, f, "retinol"), f["q"]["retinol"]), (0, "z"))
        self.assertEqual((value(keys, f, "epa"), f["q"]["epa"]), (None, "lor"))


class BelowLimit(unittest.TestCase):
    """An AFCD value below its limit of reporting is NA, but matching compares it as "at most the limit"."""

    def test_agree(self):
        lim = {"fat": 0.2}
        self.assertTrue(blend_all.agree(None, 0.1, lim, {}, "fat", 0.4, 0.1))
        self.assertFalse(blend_all.agree(None, 0.5, lim, {}, "fat", 0.4, 0.1))
        self.assertIsNone(blend_all.agree(None, 0.1, {}, {}, "fat", 0.4, 0.1))
        self.assertTrue(blend_all.agree(None, None, lim, lim, "fat", 0.4, 0.1))

    def test_limits_from_the_table(self):
        self.assertEqual(afcd.LOR["protein"], 0.2)   # Release 3 - Nutrient details, Proximates; afcd.py checks the file


class BlsErratum(unittest.TestCase):
    """BLS 4.0 errata, August 2026 (bls4_Erratum_BLS_4_0_DE.pdf)."""

    def setUp(self):
        self.keys, self.fs = foods("bls")

    def v(self, code, key):
        f = self.fs[code]
        return value(self.keys, f, key), (f.get("q") or {}).get(key)

    def test_corrected_values(self):
        self.assertEqual(self.v("M111100", "retinol"), (2.4, "err"))    # skimmed milk: 414 µg in BLS 4.0 (Table 1)
        self.assertEqual(self.v("M111100", "vitaminA"), (3.1, "err"))
        self.assertEqual(self.v("M111200", "iodine"), (9.5, "err"))     # low-fat milk: 2.8 µg (Table 2)
        self.assertEqual(self.v("H210100", "calcium"), (254, "err"))    # sweet almond: 84.9 mg (Table 3)

    def test_affected_recipes_missing(self):
        self.assertEqual(self.v("M200100", "retinol"), (None, "errna"))   # annex 7.1
        self.assertEqual(self.v("M200200", "iodine"), (None, "errna"))    # annex 7.2
        self.assertEqual(self.v("C512300", "calcium"), (None, "errna"))   # annex 7.3
        self.assertEqual(self.v("T104100", "fat"), (None, "errna"))       # raw anchovy, section 6
        self.assertEqual(self.v("T104162", "energy"), (None, "errna"))    # annex 7.7

    def test_energy_without_double_counted_oligosaccharides(self):
        # Glucose syrup: 4 x 79.5 g carbohydrate = 318 kcal; BLS 4.0 published 413 (47.7 g OLSAC counted again at 2 kcal/g)
        e, q = self.v("S151000", "energy")
        self.assertEqual(q, "erren")
        self.assertAlmostEqual(e, 318, delta=1)

    def test_amino_zero_with_protein_missing(self):
        self.assertEqual(self.v("F140100", "phenylalanine"), (None, "erraa"))   # quince, annex 7.6

    def test_logical_zero_labelled(self):
        self.assertEqual(self.v("H210100", "retinol"), (0, "z"))


class Definitions(unittest.TestCase):
    def test_ciqual_vitamin_a_is_rae(self):
        # Ciqual 2025 documentation 3.3.7: retinol + beta-carotene/12 (IOM 2001)
        self.assertEqual(blend_all.group_of("vitaminA", "ciqual"), "rae")

    def test_ciqual_folate_dfe_by_label(self):
        self.assertEqual(blend_all.group_of("folate", "ciqual"), "total")
        self.assertEqual(blend_all.group_of("folate", "ciqual", "dfe"), "dfe")
        keys, fs = foods("ciqual")
        labelled = [f for f in fs.values() if (f.get("q") or {}).get("folate") == "dfe"]
        self.assertGreater(len(labelled), 800)
        self.assertTrue(all(value(keys, f, "folate") is not None for f in labelled))

    def test_frida_carbohydrate_by_difference(self):
        # Frida 5.5 documentation 5.2, Table 5.2: available carbohydrate = total (by difference) - fibre
        self.assertEqual(blend_all.group_of("carbohydrate", "frida"), "diff")

    def test_mext_estimated_zero(self):
        keys, fs = foods("japan")
        z = [(f, k) for f in fs.values() for k, q in (f.get("q") or {}).items() if q == "z"]
        self.assertTrue(z)
        self.assertTrue(all(value(keys, f, k) == 0 for f, k in z))



class KfcdbVitaminD(unittest.TestCase):
    """KFCDb writes 0 for vitamin D in foods that contain it; in animal foods it is missing (owner, 20 Nov 2026)."""
    def test_animal_zeros_are_missing_but_plants_and_egg_white_stay_zero(self):
        keys, f = foods("kfcdb")
        by_name = {x["name"]: x for x in f.values()}
        for name in ("Chicken, Breast, Meat only, Boiled", "Milk powder, Whole milk"):
            x = by_name[name]
            self.assertIsNone(value(keys, x, "vitaminD"), name)
            self.assertEqual(x["q"]["vitaminD"], "znd", name)
        white = by_name["Egg, White, Raw"]
        self.assertEqual(value(keys, white, "vitaminD"), 0)
        plant = next(x for x in f.values() if x["cat"] in ("veg", "fruit", "grains") and value(keys, x, "vitaminD") == 0)
        self.assertNotIn("znd", (plant.get("q") or {}).values())
        for x in f.values():
            if (x.get("q") or {}).get("vitaminD") == "znd":
                self.assertIsNone(value(keys, x, "vitaminD"))
            if x["cat"] in ("meat", "fish", "dairy") and "egg, " not in x["name"].lower() and "white" not in x["name"].lower():
                self.assertNotEqual(value(keys, x, "vitaminD"), 0, x["name"])


class BlendedEnergy(unittest.TestCase):
    def test_worked_out_with_the_eu_factors_only_when_every_part_is_known(self):
        v = {"protein": 10, "fat": 5, "carbohydrate": 20, "fibre": 3}
        self.assertEqual(blend_all.energy_from_parts(v), 4 * 10 + 9 * 5 + 4 * 20 + 2 * 3)
        self.assertIsNone(blend_all.energy_from_parts({"protein": 10, "fat": 5, "carbohydrate": 20}))   # no fibre: not zero
        self.assertIsNone(blend_all.energy_from_parts({**v, "fibre": None}))

    def test_calculation_is_kept_near_a_table_and_dropped_far_from_all(self):
        self.assertEqual(blend_all.choose_energy(305, [266, 337]), "calc")        # 337 is within 10% (kidney beans: 307)
        self.assertEqual(blend_all.choose_energy(10, [24, 30]), "published")      # organic acids: lime juice
        self.assertEqual(blend_all.choose_energy(91, [73, 81]), "published")      # carbohydrate that includes fibre
        self.assertEqual(blend_all.choose_energy(200, []), "calc")
        self.assertEqual(blend_all.choose_energy(None, [50]), "published")
        self.assertEqual(blend_all.choose_energy(None, []), "none")

    def test_every_blended_energy_is_either_calculated_or_a_table_value(self):
        d = json.loads((DATA / "foods-blend-values.json").read_text())
        ei = d["keys"].index("energy")
        for fid, e in d["foods"].items():
            for std in ("uk", "us", "eu"):
                v = e["v"][std][ei]
                defn = e["d"][std][ei] if isinstance(e["d"][std], list) else e["d"][std].get("energy")
                if defn == "calc:energy":
                    parts = [e["v"][std][d["keys"].index(k)] for k in ("protein", "fat", "carbohydrate", "fibre")]
                    self.assertNotIn(None, parts, fid)
                    self.assertAlmostEqual(v, 4 * parts[0] + 9 * parts[1] + 4 * parts[2] + 2 * parts[3], delta=0.01 * max(v, 1) + 0.05, msg=fid)


if __name__ == "__main__":
    unittest.main()
