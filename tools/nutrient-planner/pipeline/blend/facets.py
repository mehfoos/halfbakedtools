"""Describe a food by facets (what it is, how it was prepared), from its published name.

The facets are the first step towards a blended food list: two tables' foods can only be blended if they describe
the same food (FAO/INFOODS Guidelines for Food Matching, 2012). See README.md in this folder.

The terms and the patterns that recognise them are plain data in vocabulary.csv, in order: earlier rows win, so
specific terms ("stir-fried") come before general ones ("fried"). Each pattern is a regular expression applied to
the lower-case name; the text it matches is then blanked, so it can't be matched twice.

What is left over is kept, never guessed at:
  * base: what remains of the first comma-separated phrase (usually the food itself, e.g. "lentils");
  * rest: what remains of every other phrase, in order (e.g. "green and brown", "chuck", "granny smith").
A food whose 'rest' is not empty has qualifiers we haven't classified. Matching must treat those as differences
until a person says otherwise.

Standard library only.
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
VOCABULARY = HERE / "vocabulary.csv"
# Facets that hold one term; the others may hold several (a food can be canned AND drained, or diced AND frozen).
SINGLE = {"salt", "sugar", "medium", "portion", "fortification", "grade", "bone"}
ORDER = ["state", "cooking", "cooking-fat", "preservation", "salt", "sugar", "medium", "portion", "fortification",
         "fat", "part", "form", "bone", "cut", "variety", "flavour", "origin", "generic", "grade"]
COOKED_BY = "cooking"  # any cooking term implies state = cooked


@dataclass
class Term:
    facet: str
    term: str
    pattern: re.Pattern
    qualifier_only: bool = False  # identity terms (cut, variety, origin...) never apply to the first phrase


@dataclass
class Description:
    base: str
    facets: dict[str, list[str]] = field(default_factory=dict)
    detail: list[str] = field(default_factory=list)   # matched text worth keeping (e.g. "3.25% milkfat")
    rest: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)

    def row(self) -> dict[str, str]:
        out = {"base": self.base}
        for f in ORDER:
            out[f] = "; ".join(self.facets.get(f, []))
        out["detail"] = "; ".join(self.detail)
        out["rest"] = "; ".join(self.rest)
        out["conflicts"] = "; ".join(self.conflicts)
        return out


def load_vocabulary(path: Path = VOCABULARY) -> list[Term]:
    with path.open(newline="", encoding="utf-8") as f:
        return [Term(r["facet"], r["term"], re.compile(r["pattern"]), r.get("scope") == "qualifier")
                for r in csv.DictReader(f)]


_SPACE = re.compile(r"\s+")


def _tidy(s: str) -> str:
    return _SPACE.sub(" ", s).strip(" ,;:-()")


def describe(name: str, vocab: list[Term]) -> Description:
    text = _SPACE.sub(" ", name.lower().replace("’", "'")).strip()
    found: dict[str, list[str]] = {}
    detail: list[str] = []
    kept: list[str] = []
    ignore = [t.pattern for t in vocab if t.facet == "ignore"]
    for t in vocab:
        if t.facet == "ignore":
            continue
        while (m := t.pattern.search(text, text.find(",") + 1 if t.qualifier_only and "," in text else
                                     (len(text) if t.qualifier_only else 0))):
            if t.facet == "keep":
                kept.append(_tidy(m.group(0)))
            elif t.facet == "ignore-early":
                pass
            elif t.facet == "fat-detail":
                detail.append(_tidy(m.group(0)))
            else:
                if t.term not in found.setdefault(t.facet, []):
                    found[t.facet].append(t.term)
                if t.facet in ("cooking-fat", "medium") and re.search(r"oil|butter|lard", m.group(0)):
                    detail.append(_tidy(m.group(0)))
            # blank the match but keep commas, so the phrase structure survives
            text = text[:m.start()] + re.sub(r"[^,]", " ", m.group(0)) + text[m.end():]
    phrases = [_tidy(p) for p in text.split(",")]

    def meaningful(p: str) -> bool:
        for pat in ignore:
            p = pat.sub(" ", p)
        return bool(_tidy(p))

    # if the first phrase was itself a term ("Flour, wheat"), the food is named by that term: keep it as the base
    base = phrases[0] or _tidy(name.lower().split(",")[0])
    rest = [p for p in phrases[1:] if p and meaningful(p)] + kept
    if len(found.get(COOKED_BY, [])) > 1 and "cooked" in found[COOKED_BY]:
        found[COOKED_BY].remove("cooked")  # a specific method was given as well
    d = Description(base=base, facets=found, detail=detail, rest=rest)
    if found.get(COOKED_BY):
        states = found.setdefault("state", [])
        if "raw" in states:
            d.conflicts.append("raw, but also a cooking method")
        if "cooked" not in states:
            states.append("cooked")
            if "unprepared" in states:
                states.remove("unprepared")
    if "raw" in found.get("state", []) and "prepared" in found.get("state", []):
        d.conflicts.append("raw, but also prepared")
    for f in SINGLE:
        if len(found.get(f, [])) > 1:
            d.conflicts.append(f"{f}: {' and '.join(found[f])}")
    return d
