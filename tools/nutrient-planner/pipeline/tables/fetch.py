"""Fetch an archived food table file from the source-archive release and check it against sources/archive.json.

Files are kept in .cache/tables/ (not committed). A checksum that differs from the archived copy's stops the run.
  python3 -I tools/nutrient-planner/pipeline/tables/fetch.py <file name> [...]
"""
from __future__ import annotations

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
CACHE = ROOT / ".cache" / "tables"
RELEASE = "https://github.com/mehfoos/halfbakedtools/releases/download/source-archive/"


def registry() -> dict[str, dict]:
    data = json.loads((ROOT / "sources" / "archive.json").read_text())
    entries = data["files"] if isinstance(data, dict) else data
    return {e["file"]: e for e in entries}


def manifest_sha(name: str) -> str:
    m = json.loads((ROOT / "sources" / "release-manifest.json").read_text())[name]
    return m["sha256"] if isinstance(m, dict) else m


def get(name: str) -> Path:
    # A file zipped from parts has a checksum per part in the registry; the zip's own checksum is the one verified
    # in the release (sources/release-manifest.json).
    entry = registry()[name]
    want = entry.get("sha256") or manifest_sha(name)
    path = CACHE / name
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(RELEASE + name, headers={"User-Agent": "halfbakedtools-pipeline"})
        with urllib.request.urlopen(req, timeout=600) as r:
            path.write_bytes(r.read())
    h = hashlib.sha256(path.read_bytes()).hexdigest()
    if h != want:
        raise SystemExit(f"{name}: checksum {h} differs from the archived copy's {want}")
    return path


if __name__ == "__main__":
    for n in sys.argv[1:]:
        print(get(n))
