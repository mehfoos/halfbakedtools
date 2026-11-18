"""The raw table files the matching step reads, fetched from the repository's releases and checked.

Each file is downloaded once into .cache/blend/ (not committed) and its SHA-256 compared with the checksum
recorded here; a mismatch stops the run. The checksums are those of the copies archived in the releases
(sources/archive.json for the source-archive release; the USDA snapshot release for SR Legacy).
"""
from __future__ import annotations

import hashlib
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
CACHE = ROOT / ".cache" / "blend"
RELEASES = "https://github.com/mehfoos/halfbakedtools/releases/download/"

FILES = {
    "cofid-2021": (RELEASES + "source-archive/"
                   "cofid2021_McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021.xlsx",
                   "436e9445ef2adb2a75f3d7edd51302de3adad25385f9795fc94ba58bd030e97d"),
    "usda-sr-legacy": (RELEASES + "usda-data-2026-11-08/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
                       "b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0"),
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def get(table: str) -> Path:
    url, want = FILES[table]
    path = CACHE / url.rsplit("/", 1)[1]
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "halfbakedtools-pipeline"})
        with urllib.request.urlopen(req, timeout=300) as r:
            path.write_bytes(r.read())
    got = sha256(path)
    if got != want:
        raise SystemExit(f"{path.name}: checksum {got} differs from the archived copy's {want}")
    return path
