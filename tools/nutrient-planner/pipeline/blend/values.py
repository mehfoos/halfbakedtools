"""Read a food's values from a table, each under its exact definition (components.csv).

Tables use the same word for different measurements ("carbohydrate", "vitamin A", "energy"). INFOODS and EuroFIR
treat a component measured or calculated differently as a different component, so values are only ever combined
within one definition (definitions.csv). components.csv says, for each table and planner nutrient, which column
or formula gives which definition, citing the table's own documentation.

A value is one of:
  * a number, as published (or calculated from published numbers with the formula in components.csv);
  * missing: the table gives no number (blank, or "N" = present but not known). Never zero (principle 2);
  * trace ("Tr"): shown to people, but not used as a number.
A formula needs every part as a number; otherwise its result is missing.

Standard library only.
"""
from __future__ import annotations

import ast
import csv
import io
import operator
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
NUMBER = re.compile(r"^\s*[0-9]+(?:\.[0-9]+)?\s*$")
# identifiers in a source formula: USDA nutrient ids (digits) or CoFID column codes (letters, digits, ':')
IDENT = re.compile(r"(?<![\w.])([A-Z][A-Za-z0-9:]*|\d{4})(?![\w.:])")


@dataclass(frozen=True)
class Value:
    number: float | None       # None = missing or trace
    status: str                # "value", "calculated", "missing", "trace", "present, amount not known"
    source: str                # the column or formula it came from
    published: str             # the published cell(s), verbatim, for the audit trail


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def components() -> list[dict]:
    return read_csv(HERE / "components.csv")


def definitions() -> dict[str, dict]:
    return {r["definition"]: r for r in read_csv(HERE / "definitions.csv")}


_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


def _eval(node, env: dict[str, float]) -> float:
    """Arithmetic only: + - * /, numbers, names, and max(). Anything else is refused."""
    if isinstance(node, ast.Expression):
        return _eval(node.body, env)
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.left, env), _eval(node.right, env))
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.Name):
        return env[node.id]
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "max":
        return max(_eval(a, env) for a in node.args)
    raise ValueError(f"not allowed in a component formula: {ast.dump(node)}")


def identifiers(source: str) -> list[str]:
    return [m for m in IDENT.findall(source)]


def evaluate(source: str, cells: dict[str, str | None]) -> Value:
    """cells: identifier -> published text (or None). Returns the value under this source."""
    ids = identifiers(source)
    published = "; ".join(f"{i}={cells.get(i)!s}" for i in ids)
    if len(ids) == 1 and source.strip() == ids[0]:
        cell = cells.get(ids[0])
        if cell is None or str(cell).strip() == "":
            return Value(None, "missing", source, published)
        text = str(cell).strip()
        if NUMBER.match(text):
            return Value(float(text), "value", source, published)
        if text == "Tr":
            return Value(None, "trace", source, published)
        if text == "N":
            return Value(None, "present, amount not known", source, published)
        return Value(None, "missing", source, published)
    env, safe = {}, source
    for n, i in enumerate(dict.fromkeys(ids)):
        cell = cells.get(i)
        if cell is None or not NUMBER.match(str(cell)):
            return Value(None, "missing", source, published)
        name = f"v{n}"
        env[name] = float(cell)
        safe = re.sub(rf"(?<![\w.]){re.escape(i)}(?![\w.:])", name, safe)
    number = _eval(ast.parse(safe, mode="eval"), env)
    return Value(round(number, 6), "calculated", source, published)


def condition_holds(cond: str, cells: dict, group: str) -> bool:
    cond = cond.strip()
    if not cond or cond in ("both present", "all four present"):
        return True   # informational: evaluate() already gives "missing" when a part is missing
    if cond.startswith("only where ") and cond.endswith(" is missing"):
        other = cond[len("only where "):-len(" is missing")]
        cell = cells.get(other)
        return cell is None or not NUMBER.match(str(cell))
    if cond == "food group meat (M...)":
        return group.startswith("M")
    if cond == "food group not meat (M...)":
        return not group.startswith("M")
    raise ValueError(f"unknown condition in components.csv: {cond!r}")


def values_for(table: str, cells: dict, group: str = "") -> dict[str, tuple[dict, Value]]:
    """definition -> (component row, value) for one food of one table."""
    out = {}
    for row in components():
        if row["table"] != table or not condition_holds(row["condition"], cells, group):
            continue
        v = evaluate(row["source"], cells)
        if row["definition"] not in out or out[row["definition"]][1].number is None:
            out[row["definition"]] = (row, v)
    return out


def usda_cells(zip_path: Path, fdc_ids: set[str]) -> dict[str, dict[str, str]]:
    """fdc_id -> {nutrient id: published amount} from the SR Legacy CSV files."""
    zf = zipfile.ZipFile(zip_path)
    member = next(n for n in zf.namelist() if n.endswith("/food_nutrient.csv"))
    out: dict[str, dict[str, str]] = {f: {} for f in fdc_ids}
    with zf.open(member) as raw:
        for r in csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8")):
            if r["fdc_id"] in out:
                out[r["fdc_id"]][r["nutrient_id"]] = r["amount"]
    return out
