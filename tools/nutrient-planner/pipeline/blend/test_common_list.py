"""Rules of the Common list matcher (pipeline/tables/common_list.py), including past mistakes."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tables"))
import common_list as c  # noqa: E402


def same(a: str, b: str, cat: str = "veg") -> bool:
    wa, sa, fa = c.read_name(a)
    wb, sb, fb = c.read_name(b)
    return wa == wb and c.states_ok(sa, sb, cat) and c.facet_ok(fa, fb)


class ReadName(unittest.TestCase):
    def test_word_order_and_plurals_dont_matter(self):
        self.assertTrue(same("Broccoli raw", "Broccoli, fresh, raw"))
        self.assertTrue(same("Lentils, red, dried", "Lentil red mature", "pulses"))

    def test_preparation_must_agree(self):
        self.assertFalse(same("Apple, dried", "Apple, raw", "fruit"))
        self.assertFalse(same("Grapefruit, canned in juice", "Grapefruit, raw", "fruit"))  # was matched: "canned in" dropped
        self.assertTrue(same("Lentils, pink or red, raw", "Lentils, pink or red, dried", "pulses"))  # raw = dried for pulses

    def test_salt_and_skin_must_agree(self):
        self.assertFalse(same("Pecans, no added salt", "Pecans, salt added", "nuts"))
        self.assertFalse(same("Potato, peeled, boiled", "Potato, with skin, boiled"))

    def test_untranslated_terms_count(self):
        self.assertNotEqual(c.read_name("Soybean, [other], テンペ")[0], c.read_name("Soybeans, mature seeds, boiled")[0])

    def test_what_isnt_a_preparation(self):
        self.assertEqual(c.read_name("Cottage cheese < 10 % fat in dry matter")[1], "")
        self.assertEqual(c.read_name("Tofu, firm, prepared with calcium sulfate")[1], "")


class Families(unittest.TestCase):
    def test_cnf_values_taken_from_usda_count_as_usda(self):
        f = {"v": [1.0] * 10 + [None] * (len(c.KEYS) - 10), "q": {k: "u" for k in c.KEYS[:10]}, "src": {}}
        self.assertEqual(c.family("cnf", f), "usda")
        f["q"] = {k: "c" for k in c.KEYS[:10]}
        self.assertEqual(c.family("cnf", f), "cnf")

    def test_unnamed_borrowed_source_is_unknown(self):
        f = {"v": [1.0] * 10 + [None] * (len(c.KEYS) - 10), "q": {k: "b" for k in c.KEYS[:10]}, "src": {}}
        self.assertEqual(c.family("afcd", f), "?")

    def test_nearly_identical_values_are_copies(self):
        u = [float(i + 1) for i in range(len(c.KEYS))]
        self.assertTrue(c.copies(u, [x * 1.005 for x in u]))
        self.assertFalse(c.copies(u, [x * 1.2 for x in u]))


if __name__ == "__main__":
    unittest.main()
