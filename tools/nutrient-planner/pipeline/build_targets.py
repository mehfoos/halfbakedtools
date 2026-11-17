#!/usr/bin/env python3
"""Generate tools/nutrient-planner/data/targets/*.json from the reference tables in targets/.

Every table is copied from the cited official document, one module per standard:
targets/uk.py, targets/us.py, targets/eu.py (shared helpers and the output format: targets/common.py).
To correct or update a value, edit the table there (not the JSON) and re-run:

  python3 -I tools/nutrient-planner/pipeline/build_targets.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))  # explicit, because the script is run with python3 -I
from targets import eu, uk, us  # noqa: E402

OUT = PIPELINE.parent / "data" / "targets"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for data in (uk.build(), us.build(), eu.build()):
        (OUT / f"{data['id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    (OUT / "index.json").write_text(json.dumps({"standards": ["uk", "us", "eu"]}, indent=1) + "\n")
    print("Wrote targets for uk, us, eu")


if __name__ == "__main__":
    main()
