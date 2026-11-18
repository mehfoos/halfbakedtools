#!/usr/bin/env python3
"""Compare each blended-food concept with the records of another table (step 3 of the blended food list).

A concept is one planner food (concepts.csv); its anchor is the planner's own USDA record. For every concept this
script compares the anchor with candidate records in the other table and writes the evidence. It never decides:
decisions are made by a person (or an AI, labelled as such) in matches/<table>.csv, with a reason.

Evidence for each candidate (FAO/INFOODS Guidelines for Food Matching, 2012: food, part, state and processing
first, then composition):
  * identity: the words naming the food (base, variety, cut and unrecognised phrases), after synonyms.csv.
    "same", "narrower" (one side names more, e.g. a variety), or "differs";
  * facets: each facet the same, stated on one side only ("unstated"), or different ("differs");
  * composition: water, protein, fat, sodium and calcium per 100 g, as published, within tolerances.

Output (generated, don't edit):
  matches/evidence-<table>.csv    the evidence for every decided record and the top candidates
  matches/REVIEW-<table>.md       per concept, for people: decision, evidence, and where they disagree

Standard library only. The raw tables are fetched from the releases and checked (inputs.py):
  python3 -I tools/nutrient-planner/pipeline/blend/match.py
"""
from __future__ import annotations

import csv
import hashlib
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "crosswalk"))
import facets  # noqa: E402
import inputs  # noqa: E402
import sources  # noqa: E402  (crosswalk loaders for the raw tables)

MATCHES = HERE / "matches"
RULE = "rule v1"
RULE_V2_DATE = "2026-11-18"  # when rule v2 was last changed; its decisions carry this date
# Facets compared. 'origin' and 'grade' are not: a country of sale or a US meat grade doesn't make a different
# food (they are shown). 'detail' (e.g. "3.25% milkfat") is compared as text where both sides state it.
COMPARED = ["state", "cooking", "cooking-fat", "preservation", "salt", "sugar", "medium", "portion",
            "fortification", "fat", "part", "form", "bone", "flavour", "generic"]
# Terms that say the same thing as another facet's term (published names say "mature seeds" or "dried" for pulses).
SAME_AS = {("part", "mature-seeds"): ("preservation", "dried")}
GENERIC_COOKING = {"cooked": None, "moist-heat": {"boiled", "steamed", "stewed", "braised", "poached", "simmered",
                                                  "casseroled"},
                   "dry-heat": {"baked", "roasted", "grilled", "barbecued", "dry-roasted", "toasted"}}
# Composition tolerance per 100 g: (absolute, relative). Water, protein and fat catch the wrong food or cooking
# state; sodium catches added salt; calcium catches bones (canned fish) and fortification.
TOL = {"water": (3.0, 0.08), "protein": (1.0, 0.20), "fat": (1.0, 0.30), "sodium": (50.0, 0.5),
       "calcium": (30.0, 0.4)}
STOP = {"and", "or", "with", "of", "the", "in", "a", "type", "style", "variety", "varieties"}
CLASS_FIRST = {"seeds", "spices", "nuts", "fish", "cereals", "crustaceans", "mollusks", "beverages", "cheese",
               "beans", "oil", "bread", "peppers", "cabbage", "lettuce", "squash", "milk", "noodles", "pasta"}


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_synonyms() -> list[tuple[re.Pattern, str]]:
    rows = sorted(read_csv(HERE / "synonyms.csv"), key=lambda r: -len(r["phrase"]))  # longest first
    return [(re.compile(rf"\b{re.escape(r['phrase'])}\b"), r["canonical"]) for r in rows]


def singular(w: str) -> str:
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 4 and w.endswith("oes"):
        return w[:-2]
    if len(w) > 3 and w.endswith("s") and not w.endswith(("ss", "us", "is")):
        return w[:-1]
    return w


def identity(row: dict, syn) -> set[str]:
    """The words that name the food: base, variety, cut and unrecognised phrases, after synonyms."""
    text = " , ".join(x for x in [row["base"], row["variety"].replace(";", ","), row["cut"].replace(";", ","),
                                  row["rest"].replace(";", ",")] if x).lower()
    for pat, canon in syn:
        text = pat.sub(canon, text)
    words = {singular(w) for w in re.findall(r"[a-z][a-z\-']*", text)} - STOP
    return words


def terms(row: dict, facet: str) -> set[str]:
    return {t for t in row[facet].split("; ") if t}


def normalise(row: dict) -> dict[str, set[str]]:
    f = {k: terms(row, k) for k in COMPARED}
    for (f1, t1), (f2, t2) in SAME_AS.items():
        if t1 in f[f1]:
            f[f1].discard(t1)
            f[f2].add(t2)
    return f


def cooking_general(x: set[str], y: set[str]) -> bool:
    """True if one side gives only a general method ("cooked", "moist heat") that covers the other side's."""
    for g, s in ((x, y), (y, x)):
        if g and all(t in GENERIC_COOKING for t in g):
            covered = set().union(*[GENERIC_COOKING[t] or s for t in g])
            if s <= covered | g:
                return True
    return False


def compare_facets(a: dict, b: dict) -> tuple[list[str], list[str]]:
    """(differs, unstated): human-readable facet differences between two facet rows."""
    differs, unstated = [], []
    fa, fb = normalise(a), normalise(b)
    for f in COMPARED:
        x, y = fa[f], fb[f]
        if x == y:
            continue
        shown = f"{f}: {', '.join(sorted(x)) or '—'} / {', '.join(sorted(y)) or '—'}"
        if not x or not y:
            unstated.append(shown)
        elif f == "cooking" and cooking_general(x, y):
            unstated.append(shown + " (one is general)")
        else:
            differs.append(shown)
    da, db = a["detail"], b["detail"]
    if da and db and da != db:
        differs.append(f"detail: {da} / {db}")
    return differs, unstated


def composition(a: sources.Record | None, b: sources.Record | None) -> tuple[str, list[str], list[str]]:
    """(agrees / differs / no data, the differences, the nutrients compared)."""
    if a is None or b is None:
        return "no data", [], []
    flags, compared = [], []
    for key, (abs_tol, rel_tol) in TOL.items():
        x, y = a.num(key), b.num(key)
        if x is None or y is None:
            continue
        compared.append(key)
        if abs(x - y) > max(abs_tol, rel_tol * max(x, y)):
            flags.append(f"{key} {x:g} vs {y:g}")
    if not compared:
        return "no data", [], []
    return ("differs" if flags else "agrees"), flags, compared


def identity_relation(ia: set[str], ib: set[str]) -> str:
    if ia == ib:
        return "same"
    if ia < ib or ib < ia:
        return "narrower"
    return "differs"


def fingerprint(row: dict) -> str:
    """A short checksum of the evidence a decision was reviewed against. A decision records it ('checked');
    if the evidence later changes (new vocabulary, synonyms or data), the decision is flagged for review again."""
    text = "|".join(row[k] for k in ("id", "identity", "facets_differ", "facets_unstated", "composition",
                                     "composition_flags"))
    return hashlib.sha256(text.encode()).hexdigest()[:8]


def auto_grade(rel: str, differs: list[str], unstated: list[str], comp: str) -> str:
    """What rule v1 alone would say. Only a complete agreement is 'same'; everything else needs a person."""
    if rel == "same" and not differs and not unstated and comp == "agrees":
        return "same"
    if rel == "differs" or differs:
        return "review: differs"
    return "review: incomplete"


# ---- rule v2: the owner-confirmed review rule, applied automatically (see README.md) ----
RULE_V2_BY = "Automated rule v2, without manual human verification (beta)"
# A detail stated by one table only is accepted when the composition check would catch a mistake (state, cooking,
# salt, drained or not, fat level, bone), or when it says nothing that changes the food. Fortification, sugar,
# packing medium, form, cooking fat and freezing can't be caught by the check, so they block "same".
ONE_SIDED_OK = {"state", "cooking", "salt", "portion", "flavour", "bone", "fat", "generic"}
ONE_SIDED_OK_TERMS = {"preservation": {"fresh", "pasteurised", "chilled"},
                      "part": {"flesh", "flesh-and-skin", "kernels", "whole-egg"}}
MIN_COMPARED = 3
# A mixture's recipe differs between countries even when a few nutrients agree ("Vegetables, mixed, frozen").
MIXTURE = re.compile(r"\b(mixed|mixture|assorted|medley)\b", re.I)


def one_sided_blockers(unstated: str) -> list[str]:
    out = []
    for item in filter(None, unstated.split(" | ")):
        facet, _, values = item.partition(": ")
        values = values.replace(" (one is general)", "")
        stated = {t for side in values.split(" / ") for t in side.split(", ") if t and t != "—"}
        if facet in ONE_SIDED_OK or (facet in ONE_SIDED_OK_TERMS and stated <= ONE_SIDED_OK_TERMS[facet]):
            continue
        out.append(item)
    return out


def passes_v2(e: dict) -> bool:
    return (e["identity"] == "same" and not e["facets_differ"] and e["composition"] == "agrees"
            and not MIXTURE.search(e["name"])
            and len(e["compared"].split(", ")) >= MIN_COMPARED and not one_sided_blockers(e["facets_unstated"]))


def rule_v2(rows: list[dict]) -> tuple[str, str, str]:
    """(grade, record id, reason) for one concept, from its evidence rows (best candidates first)."""
    passing = [e for e in rows if passes_v2(e)]
    if len(passing) == 1:
        e = passing[0]
        extra = f" Stated by one table only: {e['facets_unstated']}." if e["facets_unstated"] else ""
        return "same", e["id"], (f"Rule v2: same name, no facet differs, composition agrees "
                                 f"({e['compared']}).{extra}")
    if len(passing) > 1:
        return "similar", passing[0]["id"], ("Rule v2: more than one CoFID record fits ("
                                            + ", ".join(e["id"] for e in passing) + "), so none is chosen.")
    plausible = [e for e in rows if e["identity"] in ("same", "narrower")]
    if not plausible:
        return "none", "", "Rule v2: no CoFID record with the same food name was found."
    e = sorted(plausible, key=lambda e: (e["identity"] != "same", e["facets_differ"].count("|") + bool(e["facets_differ"]),
                                         e["composition"] != "agrees"))[0]
    why = []
    if MIXTURE.search(e["name"]):
        why.append("a mixture, whose recipe may differ")
    if e["identity"] != "same":
        why.append("the names differ in detail")
    if e["facets_differ"]:
        why.append("facets differ: " + e["facets_differ"])
    blockers = one_sided_blockers(e["facets_unstated"])
    if blockers:
        why.append("stated by one table only: " + " | ".join(blockers))
    if e["composition"] == "differs":
        why.append("composition differs: " + e["composition_flags"])
    elif e["composition"] == "no data" or len(e["compared"].split(", ")) < MIN_COMPARED:
        why.append("too few nutrients to compare")
    return "similar", e["id"], "Rule v2: closest record by name, kept separate: " + "; ".join(why) + "."


def main() -> int:
    table, tag = "cofid-2021", "cofid"
    syn = load_synonyms()
    usda_rows = {r["code"]: r for r in read_csv(HERE / "facets" / "usda-sr-legacy.csv")}
    other_rows = read_csv(HERE / "facets" / f"{table}.csv")
    by_id = {r["id"]: r for r in other_rows}
    concepts = read_csv(HERE / "concepts.csv")
    decisions = {r["concept"]: r for r in read_csv(MATCHES / f"{tag}.csv")}

    print("loading raw tables (checked against the archived copies)...", file=sys.stderr)
    cofid_raw = {k.split("|", 1)[0] + "|" + k.split("|", 1)[1]: v
                 for k, v in sources.load_cofid(inputs.get(table)).items()}
    usda_raw = sources.load_usda_subset(inputs.get("usda-sr-legacy"), {c["anchor"] for c in concepts})

    def raw_other(r):
        return cofid_raw.get(f"{r['code']}|{r['name']}")

    other_ident = {r["id"]: identity(r, syn) for r in other_rows}
    index: dict[str, list[dict]] = {}
    for r in other_rows:
        for w in other_ident[r["id"]]:
            index.setdefault(w, []).append(r)
    common = {c["concept"] for c in concepts if c.get("common") == "yes"}
    evidence, report, disagree = [], [], []
    for c in concepts:
        anchor = usda_rows[c["anchor"]]
        ia = identity(anchor, syn)
        # candidates: records sharing an identity word, best overlap first; plus the decided record
        pool = {r["id"]: r for w in ia for r in index.get(w, [])}
        scored = [(len(ia & other_ident[i]) / len(ia | other_ident[i]), r) for i, r in pool.items()]
        scored.sort(key=lambda s: (-s[0], s[1]["name"]))
        cands = [r for _, r in scored[:5 if c["concept"] in common else 3]]
        d = decisions.get(c["concept"])
        if d and d["id"] and d["id"] in by_id and by_id[d["id"]] not in cands:
            cands.insert(0, by_id[d["id"]])
        rows = []
        for r in cands:
            rel = identity_relation(ia, other_ident[r["id"]])
            differs, unstated = compare_facets(anchor, r)
            comp, flags, compared = composition(usda_raw.get(c["anchor"]), raw_other(r))
            auto = auto_grade(rel, differs, unstated, comp)
            row = {"concept": c["concept"], "id": r["id"], "name": r["name"], "decided": "",
                   "identity": rel, "facets_differ": " | ".join(differs), "facets_unstated": " | ".join(unstated),
                   "composition": comp, "composition_flags": " | ".join(flags), "rule_v1": auto,
                   "compared": ", ".join(compared)}
            row["fingerprint"] = fingerprint(row)
            rows.append(row)
        # concepts without a reviewed decision get rule v2's (re-made on every run, so they follow the evidence)
        if not d or d["by"] == RULE_V2_BY:
            grade, rid, reason = rule_v2(rows)
            fp = next((x["fingerprint"] for x in rows if x["id"] == rid), "")
            d = {"concept": c["concept"], "id": rid, "grade": grade, "reason": reason, "by": RULE_V2_BY,
                 "date": RULE_V2_DATE, "checked": fp}
            decisions[c["concept"]] = d
        for row in rows:
            if d["id"] == row["id"]:
                row["decided"] = d["grade"]
        evidence += rows
        # a decision needs attention if it was never reviewed, or if its evidence changed since it was reviewed
        note = ""
        if not d or d["grade"] == "pending":
            note = "no decision yet"
        elif d["id"]:
            row = next(x for x in rows if x["id"] == d["id"])
            if d.get("checked") != row["fingerprint"]:
                note = f"evidence changed since the decision was reviewed (now {row['fingerprint']}; rule v1: {row['rule_v1']})"
        elif any(x["rule_v1"] == "same" for x in rows):
            note = f"decided {d['grade']}, but rule v1 finds a complete match"
        if note:
            disagree.append((c, note))
        report.append((c, anchor, d, rows, note))

    MATCHES.mkdir(exist_ok=True)
    with (MATCHES / f"{tag}.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["concept", "id", "grade", "reason", "by", "date", "checked"],
                           lineterminator="\n")
        w.writeheader()
        w.writerows(decisions[c["concept"]] for c in concepts)
    cols = ["concept", "id", "name", "decided", "identity", "facets_differ", "facets_unstated", "composition",
            "composition_flags", "rule_v1", "fingerprint", "compared"]
    with (MATCHES / f"evidence-{tag}.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, lineterminator="\n")
        w.writeheader()
        w.writerows(evidence)
    write_report(tag, report, disagree)
    print(f"{len(concepts)} concepts; {len(disagree)} need attention", file=sys.stderr)
    return 0


def write_report(tag: str, report, disagree) -> None:
    grades = {}
    for _c, _a, d, _r, _n in report:
        g = d["grade"] if d else "pending"
        grades[g] = grades.get(g, 0) + 1
    out = [f"# Matching review: USDA SR Legacy (planner anchors) and {tag}", "",
           "Generated by `match.py`; don't edit. Decisions are in `" + tag + ".csv`; the rules are in README.md.", "",
           "Decisions: " + ", ".join(f"{g} {n}" for g, n in sorted(grades.items())), "",
           f"## Needs attention ({len(disagree)})", ""]
    out += [f"- `{c['concept']}` {c['name']}: {n}" for c, n in disagree] or ["None."]
    out += ["", "## Reviewed decisions", "",
            "Each decided one by one against the evidence below.", ""]
    ruled = []
    for c, anchor, d, rows, note in report:
        if d and d["by"] == RULE_V2_BY:
            ruled.append((c, anchor, d))
            continue
        out += [f"### {c['name']} (`{c['concept']}`)", "",
                f"Anchor: USDA {anchor['code']}, {anchor['name']}", "",
                f"Decision: **{d['grade'] if d else 'pending'}**" + (f" → `{d['id']}`" if d and d['id'] else "")
                + (f". {d['reason']}" if d and d['reason'] else "") + (f" ({d['by']}, {d['date']})" if d else ""),
                ""]
        if note:
            out += [f"> Attention: {note}", ""]
        out += ["| Candidate | Identity | Facets differ | Stated on one side only | Composition | Rule v1 | Evidence |",
                "|---|---|---|---|---|---|---|"]
        for r in rows:
            mark = " ✔" if r["decided"] else ""
            comp = r["composition"] + (f": {r['composition_flags']}" if r["composition_flags"] else "")
            out.append(f"| `{r['id']}` {r['name']}{mark} | {r['identity']} | {r['facets_differ'] or '—'} | "
                       f"{r['facets_unstated'] or '—'} | {comp} | {r['rule_v1']} | `{r['fingerprint']}` |")
        out.append("")
    out += ["## Decisions by rule v2", "",
            f"{len(ruled)} foods, decided automatically by rule v2 (README.md) from the evidence in "
            f"`evidence-{tag}.csv`. Only *same* is blended.", "",
            "| Planner food (USDA) | Decision | CoFID record | Reason |", "|---|---|---|---|"]
    for c, anchor, d in sorted(ruled, key=lambda x: ({"same": 0, "similar": 1}.get(x[2]["grade"], 2), x[0]["name"])):
        out.append(f"| {c['name']} ({anchor['code']}) | {d['grade']} | {('`' + d['id'] + '`') if d['id'] else '—'} | "
                   f"{d['reason'].replace('|', '/')} |")
    out.append("")
    (MATCHES / f"REVIEW-{tag}.md").write_text("\n".join(out))


if __name__ == "__main__":
    sys.exit(main())
