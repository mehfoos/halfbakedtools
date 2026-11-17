"""Shared helpers and the output format for every standard.

Output: profiles[].targets[nutrientKey] = {"min": bound?, "max": bound?}, where a bound is
{"value", "basis", "source", "note"?} and basis is one of:
  abs        an absolute daily amount in the nutrient's unit
  pctEnergy  percent of energy (converted to grams in the browser)
  perKg      mg per kg body weight per day (converted using the person's weight)
  perMJ      amount per MJ of energy
A bound may also carry "byAge" (exact value for each whole year of age), "fromAge" (applies from
that age), "toAge" (applies up to and including that age) or "extraG" (grams added per day).
The planner tries to reach every min (a shortfall is penalised) and never exceeds a max.
"""
from __future__ import annotations

import json
from pathlib import Path

TOOL = Path(__file__).resolve().parents[2]   # tools/nutrient-planner
_REFERENCES = {r["id"]: r for r in json.loads((TOOL / "references.json").read_text())["sources"]}


def ref(rid: str, role: str | None = None) -> dict:
    """A reference from the tool's references.json (the site numbers and lists them from there)."""
    r = _REFERENCES[rid]
    out = {"id": rid, "title": r["title"], "url": r["url"]}
    if role:
        out["role"] = role
    return out


def put(t: dict, key: str, bound: str, value, basis: str, source: str, note: str | None = None) -> dict:
    """Set targets[key][bound] ("min" or "max") and return the bound, so extra fields can be added to it."""
    b = {"value": value, "basis": basis, "source": source}
    if note:
        b["note"] = note
    t.setdefault(key, {})[bound] = b
    return b


def years(group: str) -> str:
    """'1 year', '2-3 years', '75+ years'."""
    return f"{group} year" if group == "1" else f"{group} years"


def age_range(group: str) -> tuple[int, int]:
    """'4-8' -> (4, 8); '71+' -> (71, 120); '1' -> (1, 1)."""
    lo, _, hi = group.replace("+", "-120").partition("-")
    return int(lo), int(hi or lo)


def energy_band(kcal: int) -> dict:
    """A calorie estimate with the planner's default range of +/-10%."""
    return {"kcal": kcal, "low": round(kcal * 0.9), "high": round(kcal * 1.1)}


def check_rows(table: dict, length: int, name: str) -> None:
    """Fail loudly if a transcribed row has the wrong number of values (a short row would otherwise be cut silently)."""
    for key, rows in table.items():
        for row in rows if isinstance(rows, tuple) else (rows,):
            assert len(row) == length, f"{name} {key}: {len(row)} values, expected {length}"


# ---------------------------------------------------------------------------
# WHO/FAO/UNU (2007) adult indispensable amino acid requirements, mg per kg body weight per day.
# WHO Technical Report Series 935, Table 23 (page 150): these are AVERAGE requirements.
# Section 8.4 (same page): safe levels of intake are 24% higher (coefficient of variation 12%,
# as for protein). The safe level is used as the target, to match the other nutrients' targets,
# which cover nearly everyone. Applied to adults in every standard; children are not assessed.
# Section 8.5: no separate values for older people, so the adult values apply at every adult age.
# ---------------------------------------------------------------------------
WHO_AA = {"histidine": 10, "isoleucine": 20, "leucine": 39, "lysine": 30, "metCys": 15,
          "pheTyr": 25, "threonine": 15, "tryptophan": 4, "valine": 26}
WHO_SAFE_FACTOR = 1.24


def add_amino_acids(t: dict) -> None:
    for k, v in WHO_AA.items():
        put(t, k, "min", round(v * WHO_SAFE_FACTOR, 2), "perKg", "who-2007",
            f"Safe level: average requirement {v} mg/kg (Table 23) plus 24% (section 8.4)")
