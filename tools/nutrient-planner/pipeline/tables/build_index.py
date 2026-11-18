"""Write the list of food tables and the name index of every food in every table.

  data/foods/tables.json  the tables (from tables.json), with food counts: read by both pages
  data/foods/index.json   every food's id, name, category, group, label, diet and flags, per table: Food Finder's
                          list, loaded before any table's values (which load when one of its foods is picked)

Run after any table's food files change:  python3 -I tools/nutrient-planner/pipeline/tables/build_index.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FOODS = HERE.parent.parent / "data" / "foods"
# Flags in the index: 1 = common, 2 = basic (in the Planner's list), 4 = US-fortified.
COMMON, BASIC, FORTIFIED = 1, 2, 4


def main() -> int:
    spec = json.loads((HERE / "tables.json").read_text())
    tables, index, categories = [], {}, {}
    for t in spec["tables"]:
        basic = json.loads((FOODS / t["basic"]).read_text())
        more = json.loads((FOODS / t["more"]).read_text())
        if basic["keys"] != more["keys"]:
            raise SystemExit(f"{t['id']}: the basic and more files have different nutrient keys")
        rows, ids = [], set()
        for f, is_basic in [(f, True) for f in basic["foods"]] + [(f, False) for f in more["foods"]]:
            if f["id"] in ids:
                raise SystemExit(f"{t['id']}: food id {f['id']} appears twice")
            ids.add(f["id"])
            flags = (COMMON if f.get("common") else 0) | (BASIC if is_basic else 0) | (FORTIFIED if f.get("fortified") else 0)
            rows.append([f["id"], f["name"], f["cat"], f["group"], f["label"], f["diet"], flags])
        index[t["id"]] = rows
        for c in more["categories"]:
            categories.setdefault(c["id"], c["name"])
        tables.append({k: v for k, v in t.items()} | {"foods": len(rows), "basicFoods": len(basic["foods"]),
                                                      "generated": basic.get("generated")})
    (FOODS / "tables.json").write_text(json.dumps({"tables": tables}, ensure_ascii=False, indent=1) + "\n")
    (FOODS / "index.json").write_text(json.dumps({
        "flags": {"common": COMMON, "basic": BASIC, "fortified": FORTIFIED},
        "categories": [{"id": k, "name": v} for k, v in categories.items()], "foods": index,
    }, ensure_ascii=False, separators=(",", ":")))
    print(", ".join(f"{t['id']}: {t['foods']} foods ({t['basicFoods']} basic)" for t in tables), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
