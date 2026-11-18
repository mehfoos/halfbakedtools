"""The planner's beta source (data/foods/foods-blend.json) is up to date and follows the blend exactly."""
import json
import unittest

import planner_pack as P


class PlannerPack(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = P.pack()
        cls.blend = json.loads(P.BLEND.read_text())
        cls.usda = {f["id"]: f for f in json.loads(P.FOODS.read_text())["foods"]}

    def test_file_is_up_to_date(self):
        self.assertEqual(json.loads(P.OUT.read_text()), json.loads(json.dumps(self.pack)),
                         "run pipeline/blend/planner_pack.py")

    def test_keys_and_foods(self):
        self.assertEqual(self.pack["keys"], json.loads(P.FOODS.read_text())["keys"])
        self.assertEqual(len(self.pack["foods"]), len(self.blend["foods"]))
        for pid in self.pack["foods"]:
            self.assertIn(pid, self.usda)

    def test_values_follow_the_blend(self):
        blended = {f["concept"].removeprefix("c:"): f for f in self.blend["foods"]}
        keys = self.pack["keys"]
        for pid, e in self.pack["foods"].items():
            for st in P.STANDARDS:
                for i, k in enumerate(keys):
                    v, d = e["v"][st][i], e["d"][st][i]
                    with self.subTest(food=pid, standard=st, key=k):
                        if k in self.pack["usdaOnly"]:
                            self.assertIsNone(d)
                            self.assertEqual(v, self.usda[pid]["v"][i])
                        elif v is None:
                            continue
                        elif k in ("salt", "epaDha"):
                            self.assertEqual(d, f"calc:{k}")
                            self.assertIn(d, e["s"])
                        else:
                            self.assertAlmostEqual(v, blended[pid]["values"][d]["value"], places=5)
                            self.assertEqual(blended[pid]["planner"][st].get(k, {"definition": d})["definition"], d)
                            self.assertTrue(e["s"][d])


if __name__ == "__main__":
    unittest.main()
