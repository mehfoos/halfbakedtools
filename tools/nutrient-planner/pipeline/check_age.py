#!/usr/bin/env python3
"""Exit 0 and print due=true if the food snapshot is older than --days (default 90)."""
import argparse, datetime as dt, json, os, sys
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--days", type=int, default=90)
a = ap.parse_args()
meta = json.loads((Path(__file__).resolve().parents[1] / "data" / "meta.json").read_text())
last = meta.get("foodsLastUpdated")
age = (dt.date.today() - dt.date.fromisoformat(last)).days if last else None
due = age is None or age >= a.days
next_allowed = (dt.date.fromisoformat(last) + dt.timedelta(days=a.days)).isoformat() if last else "now"
lines = [f"due={'true' if due else 'false'}", f"age={age if age is not None else 'never'}", f"last={last or 'never'}", f"next={next_allowed}"]
print("\n".join(lines))
if os.environ.get("GITHUB_OUTPUT"):
    with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
        fh.write("\n".join(lines) + "\n")
