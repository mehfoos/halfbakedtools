"""Turn the blend (output/blended-cofid.json) into the planner's beta food source.

The beta source is the planner's usual USDA data (data/foods/foods.json) with an overlay: for each planner food
found to be the same food in CoFID, its values are replaced by the blended values, per target standard, because
each standard defines some nutrients differently (standards.csv). Every other food is left exactly as it is.

For an overlaid food, each planner nutrient comes from:
  - the definition the standard chooses (blend "planner" section), or else the one definition with that key;
  - salt and EPA + DHA: calculated from the blended sodium, EPA and DHA, as build_foods.py does for USDA;
  - a nutrient no blended definition covers (amino acids, vitamin D2 and D3): the USDA value, marked "USDA only".
A missing value stays missing (null), never zero.

Run with:  python3 -I tools/nutrient-planner/pipeline/blend/planner_pack.py
Writes:    tools/nutrient-planner/data/foods/foods-blend.json
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOL = HERE.parents[1]
BLEND = HERE / "output" / "blended-cofid.json"
FOODS = TOOL / "data" / "foods" / "foods.json"
OUT = TOOL / "data" / "foods" / "foods-blend.json"
STANDARDS = ("uk", "us", "eu")
TABLE_NAMES = {"usda-sr-legacy": "USDA SR Legacy", "cofid-2021": "CoFID 2021"}
SHORT = {"usda-sr-legacy": "USDA", "cofid-2021": "CoFID"}
CALC = {"calc:salt": "Salt, calculated: sodium (mg) x 2.5 / 1000",
        "calc:epaDha": "EPA + DHA, calculated: (EPA + DHA) (g) x 1000, in mg"}


def num(x):
    return f"{x:.6g}"


def sources_text(e: dict) -> str:
    """Each table's published value for one definition, in words, and why any was left out of the median."""
    out = []
    for c in e.get("contributions", []):
        t = SHORT.get(c["table"], c["table"])
        if c["used"]:
            out.append(f"{t} {num(c['number'])}" + (" (calculated here from the table's own columns)" if c["status"] == "calculated" else ""))
        elif c["status"] == "missing":
            out.append(f"{t} no value")
        else:
            shown = num(c["number"]) if c.get("number") is not None else c["status"]
            why = "" if c["why_not"] == c["status"] else f": {c['why_not']}"
            out.append(f"{t} {shown} (not used{why})")
    text = "; ".join(out)
    return f"{text}. Flagged: {e['flag']}" if e.get("flag") else text


def r6(x):
    return None if x is None else round(x, 6)


def derived(values: dict, key: str, choice: dict) -> dict | None:
    """Salt (g) and EPA + DHA (mg), with ranges, from the blended parts (the same formulas as build_foods.py)."""
    if key == "salt":
        na = values.get("NA") or {}
        if na.get("value") is None:
            return None
        f = lambda v: v * 2.5 / 1000  # noqa: E731
        return {"value": f(na["value"]), "min": f(na["min"]), "max": f(na["max"]), "n": na["n"], "definition": "calc:salt",
                "text": "from sodium: " + sources_text(na)}
    if key == "epaDha":
        parts = [values.get(choice.get(k, {}).get("definition", "")) or {} for k in ("epa", "dha")]
        if any(p.get("value") is None for p in parts):
            return None
        s = lambda k: sum(p[k] for p in parts) * 1000  # noqa: E731
        return {"value": s("value"), "min": s("min"), "max": s("max"), "n": min(p["n"] for p in parts),
                "definition": "calc:epaDha",
                "text": "; ".join(f"{k.upper()}: " + sources_text(p) for k, p in zip(("epa", "dha"), parts))}
    return None


def pack() -> dict:
    blend = json.loads(BLEND.read_text())
    base = json.loads(FOODS.read_text())
    keys = base["keys"]
    by_id = {f["id"]: f for f in base["foods"]}
    by_key: dict[str, list[str]] = {}
    for d, meta in blend["definitions"].items():
        by_key.setdefault(meta["key"], []).append(d)

    foods = {}
    usda_only: set[str] = set()
    for f in blend["foods"]:
        pid = f["concept"].removeprefix("c:")
        usda = by_id[pid]
        anchor = next(r for r in f["records"] if r["table"] == "usda-sr-legacy")
        assert anchor["code"] == usda["fdcId"], (pid, anchor["code"], usda["fdcId"])
        entry = {"records": [{"table": TABLE_NAMES[r["table"]], "code": r["code"], "name": r["name"],
                              **({"borrowedFrom": r["borrowed_from"]} if r.get("borrowed_from") else {})}
                             for r in f["records"]],
                 "match": f["match"], "caveats": f["caveats"], "v": {}, "r": {}, "d": {}, "c": {}, "s": {}}
        for st in STANDARDS:
            choice = f["planner"][st]
            v, rng, defs, cav = [], [], [], {}
            for i, k in enumerate(keys):
                e, d, extra = None, None, []
                if f"{st}:{k}" in blend["standards"]:   # the standard chooses; no choice = no value under any
                    d = choice.get(k, {}).get("definition")
                    e = f["values"].get(d) if d else None
                    extra = choice.get(k, {}).get("caveats", [])
                elif k in ("salt", "epaDha"):
                    e = derived(f["values"], k, choice)
                    d = e["definition"] if e else None
                elif k in by_key and len(by_key[k]) == 1:
                    d = by_key[k][0]
                    e = f["values"].get(d)
                elif k in by_key:   # several definitions, but this standard sets no choice: none is assumed
                    raise SystemExit(f"{k}: several definitions and no choice for {st} in standards.csv")
                else:              # no blended definition covers this nutrient: the USDA value
                    usda_only.add(k)
                    v.append(usda["v"][i]); rng.append(None); defs.append(None)
                    continue
                if not e or e.get("value") is None:
                    v.append(None); rng.append(None); defs.append(d)
                    continue
                v.append(r6(e["value"]))
                rng.append([r6(e["min"]), r6(e["max"]), e["n"]] if e["n"] != 1 or e.get("derived") else None)
                defs.append(d)
                entry["s"].setdefault(d, e["text"] if "text" in e else
                                      f"calculated: {e['derived']['formula']}" if e.get("derived") else sources_text(e))
                c = list(dict.fromkeys(extra + e.get("caveats", [])))
                if c:
                    cav[k] = c
            entry["v"][st], entry["r"][st], entry["d"][st], entry["c"][st] = v, rng, defs, cav
        foods[pid] = entry

    return {
        "_comment": "Beta overlay on foods.json, built by pipeline/blend/planner_pack.py from "
                    "pipeline/blend/output/blended-cofid.json. Per standard: v = values in `keys` order (null = "
                    "missing), r = [min, max, number of tables] where more than one table or a calculation gave "
                    "the value, d = the definition used, c = caveat ids per nutrient key; s = each definition's "
                    "values per table, in words. Foods not listed use "
                    "foods.json unchanged.",
        "generated": blend.get("generated") or "",
        "status": blend["status"],
        "pointValue": blend["point_value"],
        "tables": ["USDA SR Legacy", "CoFID 2021"],
        "keys": keys,
        "usdaOnly": sorted(usda_only, key=keys.index),
        "definitions": {**{d: m["label"] for d, m in blend["definitions"].items()}, **CALC},
        "caveats": {i: {"kind": c["kind"], "text": c["text"]} for i, c in blend["caveats"].items()},
        "foods": dict(sorted(foods.items())),
    }


def main():
    data = pack()
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{len(data['foods'])} foods overlaid; USDA only: {', '.join(data['usdaOnly'])}; "
          f"{OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
