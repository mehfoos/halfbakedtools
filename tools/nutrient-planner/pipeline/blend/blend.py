#!/usr/bin/env python3
"""Build the blended values for every food matched as the same food in two or more tables (step 5, beta).

For each concept whose match (matches/<table>.csv) is "same" or "equivalent", and for each definition
(definitions.csv), the blended value is the **median** of the values the tables publish under that definition
(owner's decision, 18 Nov 2026), with the range. Nothing is combined across definitions: a table whose value
uses another definition (e.g. energy from EU factors vs US Atwater factors) is listed separately.

A table's value is left out of the median, and the reason shown, when it is:
  * missing, "present, amount not known", or trace (never counted as zero);
  * borrowed from another table already used (borrowed.csv), so the same measurement isn't counted twice.
Two values more than two-fold apart are flagged, never dropped.

Derived values are worked out from the blended parts, never blended themselves: salt from sodium; EPA + DHA.

Output (generated, don't edit; beta, not yet used by the planner):
  output/blended-<table>.json   values, ranges and every contribution
  output/audit-<table>.csv      one row per contribution: the full trail to table, file, code, column and cell
  output/PREVIEW-<table>.md     the explanation for each food, and a check of the definitions

  python3 -I tools/nutrient-planner/pipeline/blend/blend.py
"""
from __future__ import annotations

import csv
import json
import re
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "tables"))
sys.path.insert(0, str(HERE.parent / "crosswalk"))
import cofid  # noqa: E402  (the CoFID reader used for the planner's CoFID file)
import inputs  # noqa: E402
import values as V  # noqa: E402

OUT = HERE / "output"
ROOT = HERE.parents[3]
# One style for data caveats everywhere: the site's kinds and labels (site/src/lib/caveats.ts; JSON copy)
KINDS = json.loads((ROOT / "site/src/lib/caveats.json").read_text())["kinds"]


def caveat_md(kind: str, text: str) -> str:
    """A data caveat in a generated Markdown report: the same label as on the site."""
    return f"> **[{KINDS[kind]['label']}]** {text}"


def caveats() -> dict[str, dict]:
    return {r["id"]: r for r in V.read_csv(HERE / "caveats.csv")}
TABLES = {
    "usda-sr-legacy": {"tag": "usda", "title": "USDA SR Legacy", "version": "2018-04"},
    "cofid-2021": {"tag": "cofid", "title": "CoFID 2021", "version": "2021"},
}
FLAG_RATIO = 2.0
STATUS_TEXT = {"missing": "no value", "trace": "trace", "present, amount not known": "present, amount not known"}
# The definitions explained in the preview (the rest are in the JSON and audit files)
HEADLINE = ["ENERC_KCAL:atwater-specific", "ENERC_KCAL:eu-factors", "PROCNT", "FAT", "CHOAVLDF", "CHOAVLM",
            "FIBTG", "SUGAR", "SUGARM", "NA", "CA", "FE", "VITA_RAE", "VITA", "FOL", "THIA", "VITB6", "PANTAC"]


def fmt(x: float) -> str:
    if x == 0:
        return "0"
    if abs(x) >= 100:
        return f"{x:.0f}"
    if abs(x) >= 10:
        return f"{x:.1f}".rstrip("0").rstrip(".")
    return f"{x:.3g}"


def borrowed_rules() -> list[tuple[str, str, re.Pattern, str]]:
    return [(r["table"], r["borrowed_from"], re.compile(r["pattern"]), r["note"])
            for r in V.read_csv(HERE / "borrowed.csv")]


def blend_food(concept: dict, decision: dict, sides: list[dict], defs: dict) -> dict:
    """sides: [{table, code, name, ref, values: {definition: (row, Value)}, borrowed: note or ''}]"""
    used_tables = {s["table"] for s in sides}
    values = {}
    for d in sorted({d for s in sides for d in s["values"]}):
        contribs = []
        for s in sides:
            if d not in s["values"]:
                continue
            row, v = s["values"][d]
            why = ""
            if v.number is None:
                why = STATUS_TEXT.get(v.status, v.status)
            elif s["borrowed"]:
                why = f"borrowed from {TABLES[s['borrowed']]['title']} (counted once)"
            contribs.append({"table": s["table"], "code": s["code"], "source": v.source, "published": v.published,
                             "number": v.number, "status": v.status, "used": not why, "why_not": why})
        nums = [c["number"] for c in contribs if c["used"]]
        entry = {"n": len(nums), "contributions": contribs}
        cav = sorted({s["values"][d][0].get("caveat", "") for s in sides if d in s["values"]} - {""})
        if cav:
            entry["caveats"] = cav
        if nums:
            entry |= {"value": round(statistics.median(nums), 6), "min": min(nums), "max": max(nums)}
            if len(nums) > 1 and min(nums) > 0 and max(nums) / min(nums) > FLAG_RATIO:
                entry["flag"] = f"values differ more than {FLAG_RATIO:g}-fold"
        values[d] = entry
    derived = {}
    if values.get("NA", {}).get("value") is not None:
        derived["salt"] = {"value": round(values["NA"]["value"] * 2.5 / 1000, 6), "formula": "sodium (mg) x 2.5 / 1000",
                           "from": ["NA"]}
    if all(values.get(d, {}).get("value") is not None for d in ("F20D5N3", "F22D6N3")):
        derived["epaDha"] = {"value": round((values["F20D5N3"]["value"] + values["F22D6N3"]["value"]) * 1000, 6),
                             "formula": "(EPA + DHA) (g) x 1000, in mg", "from": ["F20D5N3", "F22D6N3"]}
    return {"concept": concept["concept"], "name": concept["name"], "grade": decision["grade"],
            "match": {"reason": decision["reason"], "by": decision["by"], "date": decision["date"]},
            "records": [{"table": s["table"], "code": s["code"], "name": s["name"], "reference": s["ref"],
                         "borrowed_from": s["borrowed"] or None} for s in sides],
            "tables": sorted(used_tables), "values": values, "derived": derived,
            "caveats": ["borrowed-record"] if any(s["borrowed"] for s in sides) else []}


CAVEATS = caveats()


def explain(food: dict, d: str, defs: dict) -> str:
    e = food["values"].get(d)
    meaning = defs[d]
    unit = meaning["unit"]
    label = meaning["label"]
    if not e:
        return ""
    def who(c):
        return f"{TABLES[c['table']]['title']} {c['code']}"
    used = [c for c in e["contributions"] if c["used"]]
    unused = [c for c in e["contributions"] if not c["used"]]
    if not used:
        text = f"{label}: no value to use"
    elif len(used) == 1:
        text = f"{label}: {fmt(e['value'])} {unit}, from {who(used[0])} only"
    else:
        parts = "; ".join(f"{who(c)}: {fmt(c['number'])}" for c in used)
        text = (f"{label}: {fmt(e['value'])} {unit}, median of {len(used)} tables, range {fmt(e['min'])}–"
                f"{fmt(e['max'])} ({parts})")
    if unused:
        text += ". Not used: " + "; ".join(f"{who(c)} ({c['why_not']}"
                                          + (f", {fmt(c['number'])} {unit}" if c["number"] is not None else "") + ")"
                                          for c in unused)
    if e.get("flag"):
        text += f". ⚠ {e['flag']}"
    text += "."
    for cid in e.get("caveats", []):
        text += f" **[{KINDS[CAVEATS[cid]['kind']]['label']}]** see caveat `{cid}`."
    return text


def main() -> int:
    tag, table = "cofid", "cofid-2021"
    defs = V.definitions()
    concepts = {r["concept"]: r for r in V.read_csv(HERE / "concepts.csv")}
    other = {r["id"]: r for r in V.read_csv(HERE / "facets" / f"{table}.csv")}
    decisions = [d for d in V.read_csv(HERE / "matches" / f"{tag}.csv") if d["grade"] in ("same", "equivalent")]
    rules = [r for r in borrowed_rules() if r[0] == table]

    print("loading raw tables (checked against the archived copies)...", file=sys.stderr)
    usda = V.usda_cells(inputs.get("usda-sr-legacy"), {concepts[d["concept"]]["anchor"] for d in decisions})
    cof = cofid.load(inputs.get(table))

    foods = []
    for d in decisions:
        c = concepts[d["concept"]]
        rec = other[d["id"]]
        f = cof[f"{rec['code']}|{rec['name']}"]
        borrowed = next((frm for _t, frm, pat, _n in rules if pat.search(f["ref"] or "")), "")
        sides = [
            {"table": "usda-sr-legacy", "code": c["anchor"], "name": usda_names()[c["anchor"]], "ref": "",
             "values": V.values_for("usda-sr-legacy", usda[c["anchor"]]), "borrowed": ""},
            {"table": table, "code": rec["code"], "name": rec["name"], "ref": f["ref"],
             "values": V.values_for(table, f["cells"], f["group"]), "borrowed": borrowed},
        ]
        foods.append(blend_food(c, d, sides, defs))

    OUT.mkdir(exist_ok=True)
    meta = {"format": "hbt-blend/1", "status": "beta: automated, without manual human verification",
            "point_value": "median of the tables that publish the value under the same definition",
            "tables": {t: TABLES[t] | {"file": inputs.FILES[t][0].rsplit("/", 1)[1], "sha256": inputs.FILES[t][1]}
                       for t in TABLES},
            "caveats": {k: {f: v[f] for f in ("kind", "definition", "text", "reason", "evidence", "checked")}
                        for k, v in CAVEATS.items()},
            "caveat_kinds": KINDS,
            "definitions": {k: {"label": v["label"], "key": v["key"], "unit": v["unit"], "infoods": v["infoods"],
                                "meaning": v["meaning"]}
                            for k, v in defs.items()}}
    def compact(food: dict) -> dict:
        # the JSON keeps what the explanation needs; the audit CSV keeps the full trail (column, published cell)
        food = json.loads(json.dumps(food))
        for e in food["values"].values():
            e["contributions"] = [{k: c[k] for k in ("table", "code", "number", "status", "used", "why_not")
                                   if c[k] not in ("", None) or k == "number"} for c in e["contributions"]]
        return food

    with (OUT / f"blended-{tag}.json").open("w", encoding="utf-8") as fh:
        fh.write(json.dumps(meta, ensure_ascii=False, sort_keys=True)[:-1] + ',\n"foods": [\n')
        fh.write(",\n".join(json.dumps(compact(x), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                             for x in foods))
        fh.write("\n]}\n")
    write_audit(tag, foods)
    write_preview(tag, foods, defs)
    print(f"{len(foods)} blended foods", file=sys.stderr)
    return 0


_USDA_NAMES: dict[str, str] = {}


def usda_names() -> dict[str, str]:
    if not _USDA_NAMES:
        _USDA_NAMES.update({r["code"]: r["name"] for r in V.read_csv(HERE / "facets" / "usda-sr-legacy.csv")})
    return _USDA_NAMES


def write_audit(tag: str, foods: list[dict]) -> None:
    cols = ["concept", "definition", "table", "code", "source", "published", "number", "status", "used", "why_not",
            "value", "min", "max", "n", "flag"]
    with (OUT / f"audit-{tag}.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, lineterminator="\n")
        w.writeheader()
        for f in foods:
            for d, e in f["values"].items():
                for c in e["contributions"]:
                    w.writerow({"concept": f["concept"], "definition": d, "table": c["table"], "code": c["code"],
                                "source": c["source"], "published": c["published"],
                                "number": "" if c["number"] is None else c["number"], "status": c["status"],
                                "used": "yes" if c["used"] else "no", "why_not": c["why_not"],
                                "value": e.get("value", ""), "min": e.get("min", ""), "max": e.get("max", ""),
                                "n": e["n"], "flag": e.get("flag", "")})


def write_preview(tag: str, foods: list[dict], defs: dict) -> None:
    flagged = sum(1 for f in foods for e in f["values"].values() if e.get("flag"))
    borrowed = [f for f in foods if any(r["borrowed_from"] for r in f["records"])]
    out = ["# Blended values: preview", "",
           caveat_md("beta", CAVEATS["blend-beta"]["text"] + " Not yet used by the planner."), "",
           "Generated by `blend.py`; don't edit.", "",
           f"{len(foods)} foods are the same food (or equivalent) in USDA SR Legacy and CoFID 2021 "
           f"(`../matches/{tag}.csv`). For each definition the value is the **median** of the tables that publish it "
           "under that definition; with two tables the median is their average. Values under different definitions "
           "are never combined, so some nutrients come from one table only.", "",
           f"- Values more than {FLAG_RATIO:g}-fold apart (flagged, not dropped): {flagged}",
           f"- Foods whose CoFID record is borrowed from USDA data (counted once): {len(borrowed)}"
           + (" (" + ", ".join(f["name"] for f in borrowed) + ")" if borrowed else ""), "",
           "Definitions used below:", ""]
    out += [f"- **{defs[d]['label']}**: {defs[d]['meaning']} ({defs[d]['unit']})" for d in HEADLINE]
    out += ["", "## Caveats", "", "Shown with every value they apply to (the same labels as on the site).", ""]
    for cid, c in CAVEATS.items():
        if cid == "blend-beta":
            continue
        where = f" Applies to: {defs[c['definition']]['label']}." if c["definition"] else ""
        ev = f" Evidence: {c['evidence']} (checked {c['checked']})." if c["evidence"] else ""
        out += [caveat_md(c["kind"], f"`{cid}`. {c['text']}{where} Reason: {c['reason']}.{ev}"), ""]
    out += ["## Check of the definitions", "",
            "For each nutrient, CoFID's value divided by USDA's across these foods (both above zero; borrowed records "
            "excluded). Definitions that are the same should centre near 1; a different basis shows as a steady factor. "
            "This supports, but doesn't replace, the documentation cited in `../components.csv`.", "",
            "| Nutrient | USDA definition | CoFID definition | Same definition? | Foods | Median | Middle half |",
            "|---|---|---|---|---|---|---|"]
    pairs: dict[tuple, list[float]] = {}
    for f in foods:
        if any(r["borrowed_from"] for r in f["records"]):
            continue
        by_table: dict[str, dict[str, float]] = {}
        for d, e in f["values"].items():
            for c in e["contributions"]:
                if c["number"]:
                    by_table.setdefault(c["table"], {})[d] = c["number"]
        u, o = by_table.get("usda-sr-legacy", {}), by_table.get("cofid-2021", {})
        for du, x in u.items():
            for do, y in o.items():
                if defs[du]["key"] == defs[do]["key"] and x > 0 and y > 0:
                    pairs.setdefault((defs[du]["key"], du, do), []).append(y / x)
    for (key, du, do), rs in sorted(pairs.items()):
        if len(rs) < 5:
            continue
        q = statistics.quantiles(rs, n=4)
        out.append(f"| {key} | {defs[du]['label']} | {defs[do]['label']} | {'yes' if du == do else 'no'} | {len(rs)} | "
                   f"{statistics.median(rs):.2f} | {q[0]:.2f}–{q[2]:.2f} |")
    out += ["", "## Foods", "", "The full trail for every value (table, file checksum, code, column, published cell) is in "
            f"`audit-{tag}.csv`; all definitions are in `blended-{tag}.json`.", ""]
    for f in sorted(foods, key=lambda f: f["name"].lower()):
        recs = "; ".join(f"{TABLES[r['table']]['title']} {r['code']} *{r['name']}*" for r in f["records"])
        why = f" ({f['match']['reason']})" if f["grade"] == "equivalent" else ""
        out += [f"## {f['name']} (`{f['concept']}`)", "", f"Records: {recs}. Match: {f['grade']}{why}.", ""]
        out += [caveat_md(CAVEATS[cid]["kind"], CAVEATS[cid]["text"]) + "\n" for cid in f["caveats"]]
        out += [f"- {t}" for d in HEADLINE if (t := explain(f, d, defs))]
        if f["derived"].get("salt"):
            out.append(f"- Salt: {fmt(f['derived']['salt']['value'])} g, from the blended sodium (x 2.5 / 1000).")
        out.append("")
    (OUT / f"PREVIEW-{tag}.md").write_text("\n".join(out))


if __name__ == "__main__":
    sys.exit(main())
