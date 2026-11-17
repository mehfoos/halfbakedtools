"""Loaders for the food composition tables used by the crosswalk.

Each loader returns {record_code: Record}. A Record keeps the table's own
name and the raw cell text for every nutrient we read, so missing-value codes
("Tr", "N", blank) survive until a later step decides what they mean. Values are
never filled in: if the table has no number, `num()` returns None.

Standard library only.
"""
from __future__ import annotations

import csv
import io
import re
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # run with python3 -I
import xlsx_min  # noqa: E402

NUMBER = re.compile(r"^\s*[0-9]+(\.[0-9]+)?\s*$")


@dataclass
class Record:
    db: str
    code: str
    name: str
    group: str = ""
    raw: dict = field(default_factory=dict)   # nutrient key -> cell text as published

    def num(self, key: str) -> float | None:
        """The published number, or None when the table gives no number (blank, Tr, N, ...)."""
        v = self.raw.get(key)
        return float(v) if v is not None and NUMBER.match(str(v)) else None


# ---------------------------------------------------------------- UK CoFID 2021
# Sheet name -> {planner key: CoFID component code (row 2 of each sheet)}
COFID_COLUMNS = {
    "1.3 Proximates": {"water": "WATER", "protein": "PROT", "fat": "FAT", "energy": "KCALS",
                       "carbohydrate_cofid": "CHO", "fibre_aoac": "AOACFIB"},
    "1.4 Inorganics": {"sodium": "NA", "potassium": "K", "calcium": "CA", "magnesium": "MG",
                       "phosphorus": "P", "iron": "FE", "zinc": "ZN", "copper": "CU",
                       "selenium": "SE", "iodine": "I"},
    "1.5 Vitamins": {"vitaminD": "VITD", "vitaminB12": "VITB12"},
}


def load_cofid(path: Path) -> dict[str, Record]:
    """Records keyed by "code|name". The name is part of the key because CoFID 2021 gives two
    different foods the same code (13-669: roasted aubergine and raw watercress)."""
    book = xlsx_min.read(path)
    recs: dict[str, Record] = {}
    for sheet, wanted in COFID_COLUMNS.items():
        rows = book[sheet]
        codes = rows[1]          # component codes, e.g. "I" for iodine
        for row in rows[3:]:     # rows 0-2 are headers
            if not row or not (row[0] or "").strip():
                continue
            code, name = row[0].strip(), (row[1] or "").strip()
            rec = recs.setdefault(f"{code}|{name}", Record("cofid", code, name, (row[3] or "").strip()))
            for key, comp in wanted.items():
                if comp not in codes:
                    raise KeyError(f"CoFID sheet {sheet!r} has no component {comp!r}")
                i = codes.index(comp)
                cell = row[i] if i < len(row) else None
                rec.raw[key] = cell.strip() if isinstance(cell, str) else cell
    return recs


# ------------------------------------------------------- USDA SR Legacy (ours)
USDA_IDS = {"water": 1051, "protein": 1003, "fat": 1004, "energy": 1008, "sodium": 1093,
            "potassium": 1092, "calcium": 1087, "magnesium": 1090, "phosphorus": 1091,
            "iron": 1089, "zinc": 1095}


def load_usda_subset(zip_path: Path, fdc_ids: set[str]) -> dict[str, Record]:
    """Read SR Legacy values for the given fdc_ids (used only to compare profiles)."""
    zf = zipfile.ZipFile(zip_path)
    def rows(name):
        member = next(n for n in zf.namelist() if n.endswith("/" + name))
        return csv.DictReader(io.TextIOWrapper(zf.open(member), encoding="utf-8"))
    recs = {r["fdc_id"]: Record("usda", r["fdc_id"], r["description"])
            for r in rows("food.csv") if r["fdc_id"] in fdc_ids}
    by_id = {v: k for k, v in USDA_IDS.items()}
    for r in rows("food_nutrient.csv"):
        if r["fdc_id"] in recs and int(r["nutrient_id"]) in by_id:
            recs[r["fdc_id"]].raw[by_id[int(r["nutrient_id"])]] = r["amount"]
    return recs
