"""Tests for the component definitions (definitions.csv, components.csv), the value reader and the blend.

Run with the other blend tests (npm test). The generated output is checked against its own rules, so a stale or
hand-edited file fails: every blended value must be the median of the contributions it says it used, under one
definition, and the blended foods must be exactly the current "same" and "equivalent" matches.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "tables"))
sys.path.insert(0, str(HERE.parent / "crosswalk"))
import blend  # noqa: E402
import values as V  # noqa: E402

TABLES = {"usda-sr-legacy", "cofid-2021"}


class Definitions(unittest.TestCase):
    def test_definitions(self):
        rows = V.read_csv(HERE / "definitions.csv")
        planner_keys = set(json.loads((HERE.parents[1] / "data/foods/foods.json").read_text())["keys"])
        ids = [r["definition"] for r in rows]
        self.assertEqual(len(ids), len(set(ids)))
        labels = [r["label"] for r in rows]
        self.assertEqual(len(labels), len(set(labels)), "labels must tell definitions apart")
        for r in rows:
            self.assertIn(r["key"], planner_keys, r)
            self.assertIn(r["unit"], {"g", "mg", "µg", "kcal"}, r)
            self.assertTrue(r["meaning"] and r["infoods"], r)

    def test_components(self):
        defs = V.definitions()
        archived = {e["file"] for e in json.loads((ROOT / "sources/archive.json").read_text())["files"]}
        for r in V.components():
            with self.subTest(table=r["table"], key=r["key"], source=r["source"]):
                self.assertIn(r["table"], TABLES)
                self.assertIn(r["definition"], defs)
                self.assertEqual(defs[r["definition"]]["key"], r["key"], "a definition belongs to one nutrient")
                self.assertIn(r["reference"].split(",")[0], archived, "cite an archived document")
                V.condition_holds(r["condition"], {}, "")          # raises if unknown
                cells = {i: "2" for i in V.identifiers(r["source"])}
                self.assertIsNotNone(V.evaluate(r["source"], cells).number, "the formula must evaluate")

    def test_kept_apart(self):
        """Definitions the documentation shows to differ are never the same id across these tables."""
        by = {}
        for r in V.components():   # the first (main) row for each table and nutrient
            by.setdefault((r["table"], r["key"]), r["definition"])
        for key in ("energy", "carbohydrate", "sugars", "vitaminE"):
            self.assertNotEqual(by[("usda-sr-legacy", key)], by[("cofid-2021", key)], key)
        for key in ("protein", "fat", "fibre", "calcium", "sodium", "niacinPreformed", "vitaminK", "thiamin",
                    "pantothenic", "vitaminB6"):
            self.assertEqual(by[("usda-sr-legacy", key)], by[("cofid-2021", key)], key)

    def test_caveats(self):
        kinds = json.loads((ROOT / "site/src/lib/caveats.json").read_text())["kinds"]
        cav = {r["id"]: r for r in V.read_csv(HERE / "caveats.csv")}
        defs = V.definitions()
        for cid, c in cav.items():
            self.assertIn(c["kind"], kinds, cid)
            self.assertTrue(c["text"] and c["reason"], cid)
            if c["definition"]:
                self.assertIn(c["definition"], defs, cid)
        for r in V.components():
            if r["caveat"]:
                self.assertIn(r["caveat"], cav)
                self.assertEqual(cav[r["caveat"]]["definition"], r["definition"])
        # combined on an assumption: every table's row for these carries the caveat
        for key in ("thiamin", "pantothenic", "vitaminB6"):
            self.assertTrue(all(r["caveat"] for r in V.components() if r["key"] == key), key)


class Standards(unittest.TestCase):
    def test_standards(self):
        defs = V.definitions()
        archived = {e["file"] for e in json.loads((ROOT / "sources/archive.json").read_text())["files"]}
        std = blend.standards()
        keys_with_choice = {defs[d]["key"] for d in defs if sum(x["key"] == defs[d]["key"] for x in defs.values()) > 1}
        for st in ("uk", "us", "eu"):
            for key in keys_with_choice:
                self.assertIn((st, key), std, f"{st}: which {key} definition does the target use?")
        for (st, key), r in std.items():
            with self.subTest(standard=st, key=key):
                self.assertIn(r["status"], blend.STANDARD_STATUS)
                for d in r["use"]:
                    self.assertIn(d, defs)
                    self.assertEqual(defs[d]["key"], key)
                if r["status"] in ("confirmed", "derived"):
                    self.assertTrue(any(f in r["evidence"] for f in archived), "cite an archived document")

    def test_choice(self):
        defs = V.definitions()
        std = {("uk", "folate"): {"use": ["FOL", "FOLDFE"], "status": "confirmed"},
               ("us", "carbohydrate"): {"use": ["CHOAVLDF", "CHOAVLM"], "status": "assumed"}}
        vals = {"FOLDFE": {"value": 5, "min": 5, "max": 5, "n": 1}, "CHOAVLDF": {"value": 3, "min": 3, "max": 3, "n": 1}}
        uk = blend.for_standard(vals, "uk", defs, std)
        self.assertEqual(uk["folate"], {"definition": "FOLDFE", "caveats": ["other-definition"]})
        us = blend.for_standard(vals, "us", defs, std)
        self.assertEqual(us["carbohydrate"], {"definition": "CHOAVLDF", "caveats": ["definition-not-checked"]})


class Values(unittest.TestCase):
    def test_reading(self):
        self.assertEqual(V.evaluate("PROT", {"PROT": "9.0"}).number, 9.0)
        for text, status in (("Tr", "trace"), ("N", "present, amount not known"), (None, "missing"), ("", "missing")):
            v = V.evaluate("PROT", {"PROT": text})
            self.assertIsNone(v.number)
            self.assertEqual(v.status, status)
        self.assertAlmostEqual(V.evaluate("RET + CAREQU/12", {"RET": "10", "CAREQU": "120"}).number, 20)
        self.assertIsNone(V.evaluate("RET + CAREQU/12", {"RET": "Tr", "CAREQU": "120"}).number, "never zero")
        self.assertEqual(V.evaluate("max(0, 1005 - 1079)", {"1005": "2", "1079": "3"}).number, 0)
        self.assertAlmostEqual(V.evaluate("1167 + 1210 / 0.06", {"1167": "1", "1210": "0.06"}).number, 2)
        with self.assertRaises(ValueError):
            V.evaluate("__import__('os')", {})

    def test_conditions(self):
        self.assertTrue(V.condition_holds("only where 1004 is missing", {"1004": None}, ""))
        self.assertFalse(V.condition_holds("only where 1004 is missing", {"1004": "3"}, ""))
        self.assertTrue(V.condition_holds("food group meat (M...)", {}, "MAA"))
        self.assertFalse(V.condition_holds("food group meat (M...)", {}, "DG"))


class Blending(unittest.TestCase):
    def side(self, table, number, status="value", borrowed=""):
        row = {"reference": "x"}
        return {"table": table, "code": "1", "name": "n", "ref": "", "borrowed": borrowed,
                "values": {"PROCNT": (row, V.Value(number, status, "s", "p"))}}

    def test_median_and_exclusions(self):
        c, d = {"concept": "c:x", "name": "X"}, {"grade": "same", "reason": "", "by": "", "date": ""}
        f = blend.blend_food(c, d, [self.side("usda-sr-legacy", 8.0), self.side("cofid-2021", 10.0)], {})
        e = f["values"]["PROCNT"]
        self.assertEqual((e["value"], e["min"], e["max"], e["n"]), (9.0, 8.0, 10.0, 2))
        f = blend.blend_food(c, d, [self.side("usda-sr-legacy", 8.0), self.side("cofid-2021", None, "trace")], {})
        self.assertEqual((f["values"]["PROCNT"]["value"], f["values"]["PROCNT"]["n"]), (8.0, 1))
        f = blend.blend_food(c, d, [self.side("usda-sr-legacy", 8.0),
                                    self.side("cofid-2021", 10.0, borrowed="usda-sr-legacy")], {})
        self.assertEqual(f["values"]["PROCNT"]["n"], 1, "a borrowed value counts once")
        f = blend.blend_food(c, d, [self.side("usda-sr-legacy", 1.0), self.side("cofid-2021", 3.0)], {})
        self.assertIn("flag", f["values"]["PROCNT"])
        self.assertEqual(f["values"]["PROCNT"]["n"], 2, "flagged, never dropped")


class Output(unittest.TestCase):
    def test_output_follows_its_rules(self):
        path = blend.OUT / "blended-cofid.json"
        data = json.loads(path.read_text())
        decided = {d["concept"] for d in V.read_csv(HERE / "matches/cofid.csv") if d["grade"] in ("same", "equivalent")}
        self.assertEqual({f["concept"] for f in data["foods"]}, decided, "out of date: run blend.py")
        for f in data["foods"]:
            for d, e in f["values"].items():
                with self.subTest(concept=f["concept"], definition=d):
                    self.assertIn(d, data["definitions"])
                    used = [c["number"] for c in e["contributions"] if c["used"]]
                    self.assertEqual(e["n"], len(used))
                    self.assertTrue(all(c["number"] is not None for c in e["contributions"] if c["used"]))
                    if used:
                        self.assertAlmostEqual(e["value"], sorted(used)[len(used) // 2] if len(used) % 2
                                               else sum(sorted(used)[len(used) // 2 - 1:len(used) // 2 + 1]) / 2,
                                               places=5)   # stored rounded to 6 decimal places
                        self.assertEqual((e["min"], e["max"]), (min(used), max(used)))
                    else:
                        self.assertNotIn("value", e)
            std = blend.standards()
            for st, chosen in f["planner"].items():
                for key, c in chosen.items():
                    order = std[(st, key)]["use"]
                    first = next(d for d in order if f["values"].get(d, {}).get("value") is not None)
                    self.assertEqual(c["definition"], first, f"{st} {key}: the first definition with a value")
            for d in ("THIA", "VITB6", "PANTAC"):
                if d in f["values"]:
                    self.assertTrue(f["values"][d].get("caveats"), f"{d} must carry its caveat")
            if "salt" in f["derived"]:
                self.assertAlmostEqual(f["derived"]["salt"]["value"], f["values"]["NA"]["value"] * 2.5 / 1000, places=5)


if __name__ == "__main__":
    unittest.main()
