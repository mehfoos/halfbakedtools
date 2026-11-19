"""Blended (beta): every food table combined, for the foods found to be the same food in independent tables.

Run after pipeline/tables/common_list.py and before build_index.py:

  python3 -I tools/nutrient-planner/pipeline/blend/blend_all.py

Writes data/foods/foods-blend.json (+ an empty -more file: the blend is a table of its own, all of its foods
common), data/foods/foods-blend-values.json (each food's values per target standard, with ranges, the definition
used, caveats and every table's published value in words) and data/foods/blend_report.md.

**Which records are the same food.** Only foods on the Common list are used (so no raw foods that aren't normally
eaten raw, and no US-fortified products). Stricter than the Common list (pipeline/tables/common_list.py), because here
the values are combined:
- the same food words after synonyms, or one more word that is only origin or farming ("Atlantic", "farmed"), never
  one that names another food or a colour ("mustard spinach" is not "spinach"; green tomatoes are not tomatoes);
- no fortified products (a name saying fortified, enriched or "added vitamins"): what is added differs by product and
  country, so their values are never combined;
- for canned and bottled foods, the same packing medium (syrup, juice, water, brine, oil), stated in both;
- the same preparation (raw and dried count as one for pulses, grains and nuts; "cooked" fits any cooking method;
  a name with no preparation fits only raw), compatible skin and salt, and not a mixture ("mixed", "assorted");
- composition that agrees: protein (rule v1: 1 g or 20%) and fat (0.5 g or 15%, tighter than rule v1, because 1%
  and skim milk would otherwise agree) known and within tolerance, energy within 30%, and
  at least 3 of sodium, calcium, potassium, iron and magnesium compared with at most one outside its tolerance;
- USDA and CoFID: the reviewed decisions in matches/cofid.csv win. A food decided *same* or *equivalent* is linked to
  that CoFID record; one decided *similar* or *none* is never linked to any CoFID record.
- Pairs listed in matches/blend-apart.csv (decided not the same food, with the reason) are never grouped.
Linked records form a group only if every two of them pass `identity_ok` (complete linkage, not chaining): same
words, preparation, salt (none, reduced, salted), skin, packing, drained or not, flour type, Latin species name and
fortification, and no sign in the values that one is salted (sodium, any food) or fortified (for flour and cereals:
iron, folate, thiamin, riboflavin; dairy: vitamins D and A; drinks: vitamin D, calcium, B12, vitamin C; fat spreads:
vitamins D and A) and the other isn't. One record per table. When in doubt, separate. (Independent review, 19 Nov
2026: chaining had put salted and unsalted, or peeled and unpeeled, records in one group.)

**Which values count.** One record per source family (common_list.family: CNF values from USDA count as USDA, KFCDb
borrowed foods as their named source), the family's own table first; a record whose borrowed source isn't named is
shown but not used; two records with nearly identical values count once. A group needs two independent records.

**How values are combined.** Only within one definition (DEFINITIONS below, from each converter's recorded
definitions). For each standard, the definition its targets use (PREFER) is chosen when any table gives it;
otherwise the definition most tables give, with an *Assumption* caveat. The value is the median of the tables that
give it (two tables: their mean), with the range. A value only one table gives fills the gap, marked with its table.
Missing stays missing. Salt, EPA + DHA, methionine + cysteine, phenylalanine + tyrosine and (if not given) niacin
equivalents are worked out from the blended parts. Values more than two-fold apart are flagged, not dropped.
"""
from __future__ import annotations

import collections
import csv
import datetime as dt
import json
import re
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TABLES = HERE.parent / "tables"
sys.path[:0] = [str(TABLES)]
import common  # noqa: E402
import common_list as cl  # noqa: E402

DATA = common.TOOL / "data/foods"
KEYS = common.KEYS
IX = cl.IX
STANDARDS = ("uk", "us", "eu")
ORDER = ["usda", "cofid", "afcd", "cnf", "ciqual", "frida", "fineli", "bls", "kfcdb", "japan"]   # naming priority

# Definition groups: values are combined only within one group. A key not listed has one definition everywhere.
D = lambda **groups: {t: g for g, ts in groups.items() for t in ts.split()}  # noqa: E731
DEFINITIONS = {
    "energy": D(atwater="usda cnf", uk="cofid", eu="bls ciqual frida", fineli="fineli", kfcdb="kfcdb", mext="japan", fsanz="afcd"),
    "carbohydrate": D(diff="usda cnf kfcdb", mono="cofid", avail="bls ciqual frida fineli japan afcd"),
    "sugars": D(mono="cofid", weight="usda bls ciqual frida fineli kfcdb japan cnf afcd"),
    "vitaminA": D(re="cofid bls ciqual frida afcd", rae="usda fineli japan cnf"),
    "folate": D(total="cofid ciqual frida fineli japan", dfe="usda bls kfcdb cnf afcd"),
    "vitaminD": D(d2d3="usda bls kfcdb cnf", d25="cofid afcd", frida="frida", fineli="fineli", ciqual="ciqual", mext="japan"),
    "vitaminE": D(ate="cofid", alpha="usda bls ciqual frida fineli kfcdb japan cnf afcd"),
    "vitaminK": D(k1="usda cofid bls ciqual frida kfcdb cnf", total="fineli", k1mk4="japan"),
    "protein": D(nxf="usda cofid ciqual frida fineli kfcdb japan cnf afcd", n625="bls"),
    "fibre": D(tdf="usda cofid ciqual frida fineli kfcdb cnf afcd", bls="bls", mext="japan"),
}
GROUP_LABEL = {
    "energy": {"atwater": "US Atwater factors (USDA, CNF)", "uk": "UK factors (CoFID)", "eu": "EU labelling factors",
               "fineli": "Fineli's factors", "kfcdb": "KFCDb's factors", "mext": "MEXT's factors", "fsanz": "FSANZ factors"},
    "carbohydrate": {"diff": "by difference, without fibre", "mono": "available, as monosaccharides", "avail": "available, by weight"},
    "sugars": {"mono": "as monosaccharides", "weight": "by weight"},
    "vitaminA": {"re": "retinol equivalents", "rae": "retinol activity equivalents"},
    "folate": {"total": "total folate", "dfe": "dietary folate equivalents"},
    "vitaminD": {"d2d3": "D2 + D3", "d25": "including 25-hydroxy vitamin D", "frida": "as Frida gives it",
                 "fineli": "as Fineli gives it", "ciqual": "as Ciqual gives it", "mext": "as MEXT gives it"},
    "vitaminE": {"ate": "alpha-tocopherol equivalents", "alpha": "alpha-tocopherol"},
    "vitaminK": {"k1": "phylloquinone (K1)", "total": "total vitamin K", "k1mk4": "K1 + menaquinone-4"},
    "protein": {"nxf": "nitrogen x food-specific factor", "n625": "nitrogen x 6.25"},
    "fibre": {"tdf": "total dietary fibre (AOAC)", "bls": "as BLS gives it (with low-molecular-weight fibre)",
              "mext": "as MEXT gives it"},
}
# The definition each standard's targets use (pipeline/blend/standards.csv and the old blend's choices).
PREFER = {
    "energy": {"uk": ["uk", "eu"], "us": ["atwater"], "eu": ["eu"]},
    "carbohydrate": {"uk": ["mono", "avail"], "us": ["diff"], "eu": ["avail", "diff"]},
    "sugars": {"uk": ["mono", "weight"], "us": ["weight"], "eu": ["weight"]},
    "vitaminA": {"uk": ["re"], "us": ["rae"], "eu": ["re"]},
    "folate": {"uk": ["total"], "us": ["dfe"], "eu": ["dfe"]},
    "vitaminD": {s: ["d2d3"] for s in STANDARDS}, "vitaminE": {s: ["alpha"] for s in STANDARDS},
    "vitaminK": {s: ["k1"] for s in STANDARDS}, "protein": {s: ["nxf"] for s in STANDARDS},
    "fibre": {s: ["tdf"] for s in STANDARDS},
}
CALC_KEYS = {"salt", "epaDha", "metCys", "pheTyr"}
MINERALS = (("sodium", 50, 0.5), ("calcium", 30, 0.4), ("potassium", 100, 0.3), ("iron", 0.5, 0.4), ("magnesium", 10, 0.4))
MIXTURE = re.compile(r"\b(mixed|assorted|mixture)\b", re.I)
# Stricter than the Common list's qualifiers: colour, ripeness and the like change the food (green tomatoes, green
# soybeans), so only origin and farming may differ.
BLEND_QUALIFIER = set("atlantic pacific farmed norwegian alaskan common standard".split())   # not "wild" (wild pear), not "american" (slip-skin grapes)
PACKING = re.compile(r"\b(?:in|packed in|canned in|pack)\b[^,]*?\b(heavy syrup|light syrup|syrup|juice|water|brine|oil)\b|\b(juice|syrup|water|oil) pack\b", re.I)


FORTIFIED = re.compile(r"\b(fortified|enriched|added vitamins?|vitamins? added|with added|added (?:iron|calcium|vitamins?|minerals?)|vitamins? (?:&|and) minerals|calcium[- ]enriched)\b", re.I)
UNFORTIFIED = re.compile(r"\b(unfortified|not fortified|unenriched|not enriched|without added|no added vitamins?)\b", re.I)


def fortified(name: str) -> bool:
    """Whether the name says nutrients were added (fortified, enriched, "added vitamins & minerals")."""
    return bool(FORTIFIED.search(name)) and not UNFORTIFIED.search(name)


def packing(name: str) -> str:
    """The packing medium of a canned or bottled food (syrup, juice, water, brine, oil), or "" if none is stated."""
    m = PACKING.search(name)
    return "" if not m else (m.group(1) or m.group(2)).lower().split()[-1]


code_of = cl.code_of


def group_of(key: str, table: str) -> str:
    return DEFINITIONS.get(key, {}).get(table, "std")


def def_id(key: str, group: str) -> str:
    return key if group == "std" else f"{key}:{group}"


# ---- same food ------------------------------------------------------------------------------------------------------
def states_same(a: dict, b: dict) -> bool:
    sa, sb, cat = a["state"], b["state"], a["f"]["cat"]
    if sa == sb:
        return True
    if {sa, sb} == {"raw", "dry"} and cat in cl.DRY_IS_RAW:
        return True
    if {sa, sb} == {"", "raw"}:
        return True
    return (sa == "cooked" and sb in cl.COOKED_ANY) or (sb == "cooked" and sa in cl.COOKED_ANY)


def words_same(a: frozenset, b: frozenset) -> bool:
    if a == b:
        return bool(a)
    small, big = (a, b) if len(a) < len(b) else (b, a)
    extra = big - small
    return bool(small) and small < big and len(extra) == 1 and extra <= BLEND_QUALIFIER and not small <= cl.GENERIC


FLOUR_TYPE = re.compile(r"\b(?:type|typ|t)\s?(\d{2,4})\b", re.I)
LATIN = re.compile(r"\(([A-Z][a-z]+ [a-z]+)")
DRAINED = re.compile(r"\bdrained\b", re.I)
# Nutrients added by fortification, with the absolute difference that, with a three-fold ratio, means one record is
# fortified and the other isn't (Canadian flour and milk are fortified without the name saying so).
# Checked only for the kinds of food that get fortified, and only for what is usually added to them.
FORTIFIABLE = {
    "grains": (("iron", 1.0), ("folate", 40), ("thiamin", 0.2), ("riboflavin", 0.2)),
    "cereals": (("iron", 1.0), ("folate", 40), ("thiamin", 0.2), ("riboflavin", 0.2), ("vitaminD", 0.5)),
    "dairy": (("vitaminD", 0.5), ("vitaminA", 60)),
    "drinks": (("vitaminD", 0.5), ("calcium", 150), ("vitaminB12", 0.3)),
    "beverages": (("vitaminC", 15), ("calcium", 150)),
    "oils": (("vitaminD", 0.5), ("vitaminA", 100)),
}


def identity_ok(a: dict, b: dict, reviewed: bool = False) -> bool:
    """What must hold between every two records of a group: the same food and preparation, salt, skin, packing,
    fortification, flour type and species, and no sign in the values that one is salted or fortified and the other
    isn't. Checked for every pair, so a record that says nothing can't join two that say opposite things."""
    if not reviewed:
        if not words_same(a["words"], b["words"]) or not states_same(a, b) or not cl.facet_ok(a["skin"], b["skin"]):
            return False
        fa, fb = FLOUR_TYPE.findall(a["name"]), FLOUR_TYPE.findall(b["name"])
        if (fa or fb) and fa != fb and a["f"]["cat"] in ("grains", "cereals"):
            return False
        if a["f"]["cat"] in ("grains", "cereals", "dairy") and bool(re.search(r"\bfresh\b", a["name"], re.I)) != bool(re.search(r"\bfresh\b", b["name"], re.I)):
            return False   # fresh pasta (often with egg) is not dried pasta; fresh mozzarella is not low-moisture
    if fortified(a["name"]) or fortified(b["name"]):
        return False
    canned = a["state"] == "canned" or b["state"] == "canned" or packing(a["name"]) or packing(b["name"])
    if canned and (packing(a["name"]) != packing(b["name"]) or bool(DRAINED.search(a["name"])) != bool(DRAINED.search(b["name"]))
                   or ("unsweetened" in a["name"].lower()) != ("unsweetened" in b["name"].lower())):
        return False
    la, lb = LATIN.search(a["name"]), LATIN.search(b["name"])
    if la and lb and la.group(1).lower() != lb.group(1).lower():
        return False
    u, v = a["f"]["v"], b["f"]["v"]
    cats = {a["f"]["cat"], b["f"]["cat"]}
    for k, gap in tuple(x for c in cats for x in FORTIFIABLE.get(c, ())) + (("sodium", 100),):
        x, y = u[IX[k]], v[IX[k]]
        if x is not None and y is not None and abs(x - y) > gap and max(x, y) > 3 * max(min(x, y), 1e-9):
            return False
    for k, absol, rel in (("protein", 1, 0.2), ("fat", 0.5, 0.10)):
        if u[IX[k]] is not None and v[IX[k]] is not None and not cl.near(u[IX[k]], v[IX[k]], absol, rel):
            return False
    return True


def composition_same(u: list, v: list) -> bool:
    for k, absol, rel in (("protein", 1, 0.2), ("fat", 0.5, 0.10)):   # fat tighter than rule v1: 1% and skim milk differ
        if u[IX[k]] is None or v[IX[k]] is None or not cl.near(u[IX[k]], v[IX[k]], absol, rel):
            return False
    e1, e2 = u[IX["energy"]], v[IX["energy"]]
    if e1 is not None and e2 is not None and not cl.near(e1, e2, 30, 0.3):
        return False
    compared = off = 0
    for k, absol, rel in MINERALS:
        x, y = u[IX[k]], v[IX[k]]
        if x is not None and y is not None:
            compared += 1
            off += not cl.near(x, y, absol, rel)
    return compared >= 3 and off <= 1


def kept_apart() -> set[frozenset]:
    """Pairs of records decided not to be the same food (matches/blend-apart.csv), as "table:code"."""
    rows = csv.DictReader((HERE / "matches/blend-apart.csv").read_text(encoding="utf-8").splitlines())
    return {frozenset((r["record_a"], r["record_b"])) for r in rows}


def groups(recs: list[dict]) -> list[list[int]]:
    same_rev, apart_rev = cl.reviewed_cofid()
    by_key = collections.defaultdict(list)
    for i, r in enumerate(recs):
        if r["f"].get("common") and r["words"] and not MIXTURE.search(r["name"]):   # only the Common list's foods
            by_key[r["words"]].append(i)
    fdc = lambda r: str(r["f"].get("fdcId") or "")  # noqa: E731
    code = lambda r: code_of(r["f"]).upper()  # noqa: E731
    parent = list(range(len(recs)))
    links = collections.Counter()
    edges: set = set()

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def link(i, j):
        parent[find(i)] = find(j)
        links[i] += 1
        links[j] += 1
        edges.add(frozenset((i, j)))

    apart = kept_apart()
    key_of = lambda r: f"{r['table']}:{code_of(r['f'])}"  # noqa: E731

    def ok(i, j) -> bool:
        a, b = recs[i], recs[j]
        if a["table"] == b["table"] or frozenset((key_of(a), key_of(b))) in apart:
            return False
        if {a["table"], b["table"]} == {"usda", "cofid"}:
            u, c = (a, b) if a["table"] == "usda" else (b, a)
            if (fdc(u), code(c)) in same_rev:
                return True
            if fdc(u) in apart_rev:
                return False
        if fortified(a["name"]) or fortified(b["name"]):   # added nutrients differ by product and country: never blended
            return False
        if a["state"] == "canned" or b["state"] == "canned" or packing(a["name"]) or packing(b["name"]):
            if packing(a["name"]) != packing(b["name"]):
                return False
        return (cl.cats_ok(a["f"]["cat"], b["f"]["cat"]) and states_same(a, b) and cl.facet_ok(a["skin"], b["skin"])
                and composition_same(a["f"]["v"], b["f"]["v"]))

    for key, ids in by_key.items():
        cand = set(ids)
        for w in key:
            if w in BLEND_QUALIFIER:
                cand |= set(by_key.get(key - {w}, []))
        for i in ids:
            for j in cand:
                if i < j or (j not in ids and i != j):
                    if words_same(recs[i]["words"], recs[j]["words"]) and ok(i, j):
                        link(i, j)
    # reviewed USDA-CoFID pairs whose names the word rule doesn't read as the same
    usda_by_fdc = {fdc(r): i for i, r in enumerate(recs) if r["table"] == "usda" and r["f"].get("common")}
    cofid_by_code = {code(r): i for i, r in enumerate(recs) if r["table"] == "cofid" and r["f"].get("common")}
    for f_id, c_code in same_rev:
        if f_id in usda_by_fdc and c_code in cofid_by_code:
            i, j = usda_by_fdc[f_id], cofid_by_code[c_code]
            if find(i) != find(j):
                link(i, j)
    comp = collections.defaultdict(list)
    for i in range(len(recs)):
        if links[i]:
            comp[find(i)].append(i)
    reviewed_pair = lambda i, j: {recs[i]["table"], recs[j]["table"]} == {"usda", "cofid"} and (  # noqa: E731
        (fdc(recs[i]), code(recs[j])) in same_rev or (fdc(recs[j]), code(recs[i])) in same_rev)
    out = []
    for members in comp.values():
        # Every two records of a group must pass identity_ok (complete linkage): best-linked records first, each
        # joining the first group where it fits with every member and is linked to at least one; one per table.
        order = sorted(members, key=lambda i: (-links[i], ORDER.index(recs[i]["table"])))
        clusters: list[list[int]] = []
        for i in order:
            for c in clusters:
                if any(recs[j]["table"] == recs[i]["table"] for j in c):
                    continue
                if all(identity_ok(recs[i], recs[j], reviewed_pair(i, j)) and frozenset((key_of(recs[i]), key_of(recs[j]))) not in apart
                       for j in c) and any(frozenset((i, j)) in edges for j in c):
                    c.append(i)
                    break
            else:
                clusters.append([i])
        for kept in clusters:
            if len(kept) >= 2:
                out.append(sorted(kept, key=lambda i: ORDER.index(recs[i]["table"])))
    return out


# ---- which values count ---------------------------------------------------------------------------------------------
def used_members(recs: list[dict], members: list[int]) -> tuple[list[int], dict[int, str]]:
    """The records whose values count, and why each other one doesn't."""
    why, used, fams = {}, [], {}
    order = sorted(members, key=lambda i: (recs[i]["table"] != recs[i]["family"], ORDER.index(recs[i]["table"])))
    for i in order:
        r = recs[i]
        if r["family"] == "?":
            why[i] = "its table says the values are borrowed, without naming the source"
            continue
        if r["family"] in fams:
            why[i] = f"values taken from {TAG[recs[fams[r['family']]]['table']]}, which is already counted"
            continue
        dup = next((j for j in used if cl.copies(r["f"]["v"], recs[j]["f"]["v"])), None)
        if dup is not None:
            why[i] = f"values nearly identical to {TAG[recs[dup]['table']]}'s, counted once"
            continue
        fams[r["family"]] = i
        used.append(i)
    return used, why


# ---- values ---------------------------------------------------------------------------------------------------------
def fmt(x: float) -> str:
    return f"{x:.4g}"


def blend_food(recs: list[dict], members: list[int], labels: dict) -> dict:
    used, why = used_members(recs, members)
    out = {s: {"v": {}, "r": {}, "d": {}, "c": collections.defaultdict(list)} for s in STANDARDS}
    texts = {}
    for k in KEYS:
        if k in common.DERIVED:
            continue
        by_group = collections.defaultdict(list)   # group -> [(record, value)]
        for i in members:
            x = recs[i]["f"]["v"][IX[k]]
            if x is not None:
                by_group[group_of(k, recs[i]["table"])].append((i, x))
        for g, vals in by_group.items():
            parts = []
            for i, x in vals:
                t = TAG[recs[i]["table"]]
                lab = (recs[i]["f"].get("q") or {}).get(k)
                lab_txt = f" ({labels[recs[i]['table']].get(lab, lab)})" if lab else ""
                parts.append(f"{t} {fmt(x)}{lab_txt}" if i in used else f"{t} {fmt(x)} (not used: {why[i]})")
            texts[def_id(k, g)] = "; ".join(parts)
        usable = {g: [x for i, x in vals if i in used] for g, vals in by_group.items()}
        usable = {g: xs for g, xs in usable.items() if xs}
        for s in STANDARDS:
            if not usable:
                continue
            pref = [g for g in PREFER.get(k, {}).get(s, ["std"]) if g in usable]
            if pref:
                g = pref[0]
            else:
                g = max(usable, key=lambda g: (len(usable[g]), -min(ORDER.index(recs[i]["table"]) for i, _ in by_group[g])))
                if k in PREFER:
                    out[s]["c"][k].append("other-definition")
            xs = usable[g]
            out[s]["v"][k] = statistics.median(xs)
            out[s]["d"][k] = def_id(k, g)
            if len(xs) >= 2:
                out[s]["r"][k] = [min(xs), max(xs), len(xs)]
                if min(xs) > 0 and max(xs) / min(xs) > 2:
                    out[s]["c"][k].append("two-fold")
            else:
                out[s]["c"][k].append("one-table")
            if k in ("thiamin", "vitaminB6", "pantothenic") and any(recs[i]["table"] == "cofid" for i in used) and len(xs) >= 2:
                out[s]["c"][k].append(f"salt-basis-{k}")
        if k == "fibre" and "fibre" in out["us"]["v"]:
            out["us"]["c"]["fibre"].append("closest-definition")
    for s in STANDARDS:
        v = out[s]["v"]
        calc = common.derive(v, table_gives_ne="niacinNE" in v)
        for k, x in calc.items():
            v[k] = x
            out[s]["d"][k] = f"calc:{k}"
        if "salt" in calc and "sodium" in out[s]["r"]:
            lo, hi, n = out[s]["r"]["sodium"]
            out[s]["r"]["salt"] = [lo * 2.5 / 1000, hi * 2.5 / 1000, n]
    pack = lambda s: [float(f"{out[s]['v'][k]:.4g}") if k in out[s]["v"] else None for k in KEYS]  # noqa: E731
    return {
        "records": [{"table": TITLE[recs[i]["table"]], "code": code_of(recs[i]["f"]),
                     "name": recs[i]["name"], **({"notUsed": why[i]} if i in why else {})} for i in members],
        "match": {"by": "Automated rule (blend of all tables), without manual human verification (beta)",
                  "date": dt.date.today().isoformat(),
                  "reason": "Same food words and preparation in each table; protein, fat, energy and minerals agree"
                            + ("; USDA and CoFID as reviewed" if {recs[i]["table"] for i in members} >= {"usda", "cofid"} else "") + "."},
        "caveats": ["blend-beta"] + (["borrowed-record"] if why else []),
        "v": {s: pack(s) for s in STANDARDS},
        "r": {s: [[float(f"{x:.4g}") for x in out[s]["r"][k][:2]] + [out[s]["r"][k][2]] if k in out[s]["r"] else None for k in KEYS] for s in STANDARDS},
        "d": {s: [out[s]["d"].get(k) for k in KEYS] for s in STANDARDS},
        "c": {s: dict(out[s]["c"]) for s in STANDARDS},
        "s": texts,
        "_used": used,
    }


CAVEATS = {
    "blend-beta": {"kind": "beta", "text": "Blended values are built by automated steps without manual human verification. Each value names the tables and codes it came from; each table's file traces its values to the published source."},
    "borrowed-record": {"kind": "borrowed", "text": "Some of these records take their values from another table, or have values nearly identical to another table's, so they count once: they are shown, but not used in the median."},
    "other-definition": {"kind": "assumption", "text": "No table in this blend gives this nutrient for this food under the definition your standard's target uses, so the value uses another definition (named with the value)."},
    "one-table": {"kind": "estimate", "text": "Only one table gives this value for this food, so it fills the gap unconfirmed."},
    "two-fold": {"kind": "assumption", "text": "The tables' values differ more than two-fold. The median is shown with the range; check which table suits you."},
    "closest-definition": {"kind": "assumption", "text": "The US target is for total fibre (dietary plus functional fibre); food tables measure fibre by AOAC methods, which capture most of it but not all."},
    "salt-basis-thiamin": {"kind": "assumption", "text": "Combined, as in the earlier USDA and CoFID blend, where a data check showed no salt-basis factor. CoFID says it expresses thiamin as thiamine chloride hydrochloride; the other tables don't say. If they differed, CoFID's values would be about 27% higher (molar masses 337.3 and 265.4)."},
    "salt-basis-vitaminB6": {"kind": "assumption", "text": "Combined, as in the earlier USDA and CoFID blend, where a data check showed no salt-basis factor. CoFID says it expresses vitamin B6 as pyridoxine hydrochloride; the other tables don't say. If they differed, CoFID's values would be about 22% higher (molar masses 205.6 and 169.2)."},
    "salt-basis-pantothenic": {"kind": "assumption", "text": "Combined, as in the earlier USDA and CoFID blend, where a data check showed no salt-basis factor. CoFID says it expresses pantothenate as calcium D-pantothenate; the other tables don't say. If they differed, CoFID's values would be about 9% higher (238.3 and 219.2 per pantothenate)."},
}
TAG, TITLE = {}, {}


def main() -> int:
    tables, recs, files = cl.load()
    for t in json.loads((TABLES / "tables.json").read_text())["tables"]:
        TAG[t["id"]], TITLE[t["id"]] = t["tag"], t["title"]
    labels = {t: files[t].get("labels", {}) for t in files}
    nutrient_label = {n["key"]: n["label"] for n in common.NUTRIENTS}
    definitions = {}
    for k in KEYS:
        groups_k = set(DEFINITIONS.get(k, {}).values()) or {"std"}
        for g in groups_k | {"std"}:
            definitions[def_id(k, g)] = nutrient_label.get(k, k) + (f" ({GROUP_LABEL[k][g]})" if g != "std" else "")
    definitions |= {"calc:salt": "Salt, calculated: sodium (mg) x 2.5 / 1000", "calc:epaDha": "EPA + DHA, calculated: (EPA + DHA) (g) x 1000, in mg",
                    "calc:metCys": "Methionine + cysteine, calculated: their sum", "calc:pheTyr": "Phenylalanine + tyrosine, calculated: their sum",
                    "calc:niacinNE": "Niacin equivalents, calculated: niacin + tryptophan (mg) / 60"}
    groups_ = groups(recs)
    foods, values, seen = [], {}, set()
    diet_rank = {"vegan": 0, "vegetarian": 1, "meat": 2}
    for members in groups_:
        b = blend_food(recs, members, labels)
        used = b.pop("_used")
        if len(used) < 2:
            continue
        rep = min(members, key=lambda i: (not (recs[i]["table"] in ("usda", "cofid") and ":" not in recs[i]["f"]["id"]),
                                          ORDER.index(recs[i]["table"])))
        base = recs[rep]["f"]
        fid = "blend:" + re.sub(r"[^a-z0-9-]+", "-", base["id"].lower())
        fid = fid[:40]
        n = 1
        while fid in seen:
            n += 1
            fid = f"{fid[:37]}-{n}"
        seen.add(fid)
        f = {k: v for k, v in base.items() if k not in ("v", "q", "src", "srcName", "fdcId", "usdaName", "dataset", "fortified", "basic")}
        f |= {"id": fid, "common": True,
              "diet": max((recs[i]["f"].get("diet", "vegan") for i in members), key=lambda d: diet_rank.get(d, 2)),
              "src": {"table": "blend", "code": fid, "name": base["name"],
                      "members": [f"{recs[i]['table']}:{code_of(recs[i]['f'])}" for i in members]},
              "srcName": base["name"], "q": None, "v": b["v"]["uk"]}
        foods.append(f)
        values[fid] = b
    foods.sort(key=lambda f: f["name"].lower())
    defs_note = {k: "Combined only within one definition; the definition used depends on the target standard (see foods-blend-values.json)" for k in DEFINITIONS}
    common.write("blend", "Blended (beta): every table", {"tables": "the ten table files in data/foods"}, defs_note, foods, [],
                 [], {}, notice=common.AFCD_NOTICE)
    (DATA / "foods-blend-values.json").write_text(json.dumps({
        "_comment": "Beta values for the Blended table (foods-blend.json), built by pipeline/blend/blend_all.py. Per standard: v = values in "
                    "`keys` order (null = missing), r = [min, max, number of tables] where two or more tables gave the value, d = the "
                    "definition used, c = caveat ids per nutrient key; s = each definition's values per table, in words.",
        "generated": dt.date.today().isoformat(), "status": "beta: automated, without manual human verification",
        "notice": common.AFCD_NOTICE,
        "pointValue": "median of the independent tables that publish the value under the same definition",
        "tables": [TITLE[t["id"]] for t in tables], "keys": KEYS, "usdaOnly": [], "definitions": definitions,
        "caveats": CAVEATS, "foods": values}, ensure_ascii=False, separators=(",", ":")))
    # report
    n_tab = collections.Counter(len(v["records"]) for v in values.values())
    fill = collections.Counter()
    gaps_before = gaps_after = 0
    for fid, b in values.items():
        uk = b["v"]["uk"]
        for k_i, k in enumerate(KEYS):
            if k in common.DERIVED:
                continue
            fill[k] += uk[k_i] is not None
    per_table = collections.Counter(m.split(":")[0] for f in foods for m in f["src"]["members"])
    lines = [f"# Blended (beta): report ({dt.date.today().isoformat()})", "",
             "Generated by `pipeline/blend/blend_all.py`; don't edit. Rules: the script's notes. Automated, without manual human verification (beta).", "",
             f"Blended foods: {len(foods)}. Records per blended food: " + ", ".join(f"{k} records: {v}" for k, v in sorted(n_tab.items())) + ".", "",
             "Records used from each table: " + ", ".join(f"{TAG[t]} {per_table[t]}" for t in ORDER) + ".", "",
             "| Nutrient | Blended foods with a value (UK standard) |", "|---|---|"]
    lines += [f"| {k} | {fill[k]} |" for k in KEYS if k not in common.DERIVED]
    (DATA / "blend_report.md").write_text("\n".join(lines) + "\n")
    print(f"blended foods: {len(foods)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
