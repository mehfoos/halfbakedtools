"""Tests for the matching decisions (matches/<table>.csv) and their evidence. Run with the other blend tests.

A decision must name a real record, give a reason, and say who decided. A "same" or "equivalent" decision must
have been reviewed against the current evidence (its 'checked' fingerprint), and any difference in that evidence
must be acknowledged in its reason, with one of these phrases:
  "Names differ:"              the names differ (identity: differs)
  "Facet difference accepted:" a facet differs
  "Same food despite:"         the composition check failed
The evidence's name and facet comparisons are recomputed here from the facet tables, so a vocabulary or synonym
change that alters them fails until match.py is re-run and the decisions re-reviewed. (Composition needs the raw
tables, which match.py fetches; it is taken as recorded.)
"""
from __future__ import annotations

import csv
import re
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "crosswalk"))
import match  # noqa: E402

GRADES = {"same", "equivalent", "similar", "different", "none", "pending"}
TABLES = {"cofid": "cofid-2021"}


def read(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


class Matches(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.usda = {r["code"]: r for r in read(HERE / "facets" / "usda-sr-legacy.csv")}
        cls.concepts = read(HERE / "concepts.csv")
        cls.syn = match.load_synonyms()

    def test_concepts(self):
        ids = [c["concept"] for c in self.concepts]
        self.assertEqual(len(ids), len(set(ids)))
        for c in self.concepts:
            self.assertIn(c["anchor"], self.usda, c)
            self.assertEqual(c["concept"], "c:" + self.usda[c["anchor"]]["planner_id"], c)

    def test_decisions(self):
        for tag, table in TABLES.items():
            other = {r["id"]: r for r in read(HERE / "facets" / f"{table}.csv")}
            rows = read(match.MATCHES / f"{tag}.csv")
            self.assertEqual(sorted(r["concept"] for r in rows), sorted(c["concept"] for c in self.concepts),
                             f"{tag}: one decision per concept")
            evidence = {(e["concept"], e["id"]): e for e in read(match.MATCHES / f"evidence-{tag}.csv")}
            for d in rows:
                with self.subTest(table=tag, concept=d["concept"]):
                    self.assertIn(d["grade"], GRADES)
                    self.assertTrue(d["reason"] and d["by"])
                    self.assertRegex(d["date"], r"^\d{4}-\d{2}-\d{2}$")
                    if d["grade"] == "none":
                        self.assertEqual(d["id"], "")
                        continue
                    if d["grade"] != "pending":
                        self.assertIn(d["id"], other, "the record must exist in the facet table")
                    if d["grade"] not in ("same", "equivalent"):
                        continue
                    e = evidence.get((d["concept"], d["id"]))
                    self.assertIsNotNone(e, "no evidence: run match.py")
                    self.assertEqual(d["checked"], e["fingerprint"], "evidence changed since review: re-review")
                    if e["identity"] == "differs":
                        self.assertIn("Names differ:", d["reason"])
                    if e["facets_differ"]:
                        self.assertIn("Facet difference accepted:", d["reason"])
                    if e["composition"] == "differs":
                        self.assertIn("Same food despite:", d["reason"])
                    if d["grade"] == "equivalent":
                        self.assertEqual(e["composition"], "agrees", "equivalent needs agreeing composition")

    def test_evidence_is_current(self):
        concepts = {c["concept"]: c for c in self.concepts}
        for tag, table in TABLES.items():
            other = {r["id"]: r for r in read(HERE / "facets" / f"{table}.csv")}
            for e in read(match.MATCHES / f"evidence-{tag}.csv"):
                with self.subTest(table=tag, concept=e["concept"], id=e["id"]):
                    a, b = self.usda[concepts[e["concept"]]["anchor"]], other[e["id"]]
                    self.assertEqual(e["name"], b["name"])
                    rel = match.identity_relation(match.identity(a, self.syn), match.identity(b, self.syn))
                    differs, unstated = match.compare_facets(a, b)
                    self.assertEqual((e["identity"], e["facets_differ"], e["facets_unstated"]),
                                     (rel, " | ".join(differs), " | ".join(unstated)),
                                     "evidence is out of date: run match.py")
                    self.assertEqual(e["fingerprint"], match.fingerprint(e))

    def test_rule_v2_decisions_follow_the_rule(self):
        """A decision labelled rule v2 must be what the rule gives on the recorded evidence (no hand edits)."""
        for tag in TABLES:
            evidence: dict[str, list[dict]] = {}
            for e in read(match.MATCHES / f"evidence-{tag}.csv"):
                evidence.setdefault(e["concept"], []).append(e)
            for d in read(match.MATCHES / f"{tag}.csv"):
                if d["by"] != match.RULE_V2_BY:
                    continue
                with self.subTest(table=tag, concept=d["concept"]):
                    self.assertEqual((d["grade"], d["id"], d["reason"]),
                                     match.rule_v2(evidence.get(d["concept"], [])))

    def test_rule_v2(self):
        def ev(**k):
            base = {"id": "x:1", "name": "Okra, boiled in unsalted water", "identity": "same", "facets_differ": "",
                    "facets_unstated": "", "composition": "agrees", "composition_flags": "",
                    "compared": "water, protein, fat, sodium, calcium"}
            return base | k
        self.assertEqual(match.rule_v2([ev()])[0], "same")
        self.assertEqual(match.rule_v2([ev(facets_unstated="portion: drained / —")])[0], "same")
        # details the composition check can't catch block "same"
        for u in ("fortification: fortified / —", "sugar: — / with", "medium: — / syrup", "preservation: frozen / —",
                  "form: juice / —", "cooking-fat: — / oil", "part: breast / —"):
            self.assertEqual(match.rule_v2([ev(facets_unstated=u)])[0], "similar", u)
        self.assertEqual(match.rule_v2([ev(identity="narrower")])[0], "similar")
        self.assertEqual(match.rule_v2([ev(compared="water, protein")])[0], "similar")
        self.assertEqual(match.rule_v2([ev(name="Vegetables, mixed, frozen")])[0], "similar")
        self.assertEqual(match.rule_v2([ev(), ev(id="x:2")])[0], "similar", "two fit: choose neither")
        self.assertEqual(match.rule_v2([ev(identity="differs")])[0], "none")

    def test_rule_v1_never_says_same_when_anything_differs(self):
        self.assertEqual(match.auto_grade("same", [], [], "agrees"), "same")
        self.assertNotEqual(match.auto_grade("narrower", [], [], "agrees"), "same")
        self.assertNotEqual(match.auto_grade("same", [], ["salt: without / —"], "agrees"), "same")
        self.assertNotEqual(match.auto_grade("same", [], [], "differs"), "same")
        self.assertNotEqual(match.auto_grade("same", [], [], "no data"), "same")


if __name__ == "__main__":
    unittest.main()
