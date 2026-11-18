"""Japan: Standard Tables of Food Composition in Japan, 8th revised edition, 2023 supplement (MEXT; data files dated
27 March 2026) -> foods-japan.json, foods-japan-more.json.

Reads the archived spreadsheets (fetch.py): the main table (_02), amino acids (_04) and fatty acids (_09), joined by
food number, and MEXT's 2015 English names of food sources (0r10). Each value is MEXT's own. "-" (not measured) and
"*" are missing (NA); "Tr" and "(Tr)" are missing with a trace label; a value in brackets, such as "(0)" or "(1.2)",
is MEXT's estimate: it is used and labelled. Amino acids and the named fatty acids are converted from mg to g.

Food names: MEXT publishes Japanese names only. The English name shown is the MEXT English name of the food source
(plant or animal) followed by this site's translation of the other terms (japan_glossary.json); terms not in the
glossary stay in Japanese. Every name is marked as translated, and the Japanese name is kept with the food.

  python3 -I tools/nutrient-planner/pipeline/tables/japan.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent / "crosswalk")]
import common  # noqa: E402
import fetch  # noqa: E402
import xlsx_min  # noqa: E402

TABLE, TITLE = "japan", "Japan Standard Tables of Food Composition, 8th ed., 2023 supplement (MEXT)"
MAIN, AMINO, FATTY = ("japan_20260327-mxt_kagsei-mext-000029402_02.xlsx", "japan_20260327-mxt_kagsei-mext-000029402_04.xlsx",
                      "japan_20260327-mxt_kagsei-mext-000029402_09.xlsx")
NAMES = "japan_1374049_0r10.xlsx"
MG = 0.001
# planner key -> (file, MEXT component identifier, factor, definition)
MAP = {
    "energy": (MAIN, "ENERC_KCAL", 1, "Energy calculated by MEXT from the components with its own factors (8th edition)"),
    "protein": (MAIN, "PROT-", 1, "Protein from total nitrogen x factor (MEXT also gives protein from amino acids, not used here)"),
    "fat": (MAIN, "FAT-", 1, "Total lipid"),
    "carbohydrate": (MAIN, "CHOAVL", 1, "Available carbohydrate by weight (not by difference; excludes fibre)"),
    "fibre": (MAIN, "FIB-", 1, "Total dietary fibre"),
    "sodium": (MAIN, "NA", 1, ""), "potassium": (MAIN, "K", 1, ""), "calcium": (MAIN, "CA", 1, ""), "magnesium": (MAIN, "MG", 1, ""),
    "phosphorus": (MAIN, "P", 1, ""), "iron": (MAIN, "FE", 1, ""), "zinc": (MAIN, "ZN", 1, ""), "copper": (MAIN, "CU", 1, ""),
    "manganese": (MAIN, "MN", 1, ""), "iodine": (MAIN, "ID", 1, ""), "selenium": (MAIN, "SE", 1, ""),
    "vitaminA": (MAIN, "VITA_RAE", 1, "Retinol activity equivalents (the US definition; UK and EU targets use retinol equivalents)"),
    "retinol": (MAIN, "RETOL", 1, ""), "vitaminD": (MAIN, "VITD", 1, ""), "vitaminE": (MAIN, "TOCPHA", 1, "Alpha-tocopherol"),
    "vitaminK": (MAIN, "VITK", 1, "Vitamin K as MEXT gives it (phylloquinone and menaquinone-4)"),
    "thiamin": (MAIN, "THIA", 1, ""), "riboflavin": (MAIN, "RIBF", 1, ""), "niacinPreformed": (MAIN, "NIA", 1, ""),
    "niacinNE": (MAIN, "NE", 1, "Niacin equivalents as published by MEXT"), "vitaminB6": (MAIN, "VITB6A", 1, ""),
    "vitaminB12": (MAIN, "VITB12", 1, ""), "folate": (MAIN, "FOL", 1, "Total folate (not dietary folate equivalents)"),
    "pantothenic": (MAIN, "PANTAC", 1, ""), "vitaminC": (MAIN, "VITC", 1, ""),
    "satfat": (FATTY, "FASAT", 1, ""), "la": (FATTY, "F18D2N6", MG, "C18:2 n-6"), "ala": (FATTY, "F18D3N3", MG, "C18:3 n-3"),
    "epa": (FATTY, "F20D5N3", MG, "C20:5 n-3"), "dha": (FATTY, "F22D6N3", MG, "C22:6 n-3"),
    "isoleucine": (AMINO, "ILE", MG, ""), "leucine": (AMINO, "LEU", MG, ""), "lysine": (AMINO, "LYS", MG, ""),
    "methionine": (AMINO, "MET", MG, ""), "cystine": (AMINO, "CYS", MG, ""), "phenylalanine": (AMINO, "PHE", MG, ""),
    "tyrosine": (AMINO, "TYR", MG, ""), "threonine": (AMINO, "THR", MG, ""), "tryptophan": (AMINO, "TRP", MG, ""),
    "valine": (AMINO, "VAL", MG, ""), "histidine": (AMINO, "HIS", MG, ""),
}
LABELS = {"e": "MEXT: estimated value (shown in brackets in the table)", "trace": "trace"}
GROUP = {"01": "grains", "02": "veg", "03": "sweets", "04": "pulses", "05": "nuts", "06": "veg", "07": "fruit", "08": "veg",
         "09": "veg", "10": "fish", "11": "meat", "12": "dairy", "13": "dairy", "14": "oils", "15": "sweets",
         "16": "beverages", "17": "dishes", "18": "dishes"}


def table(name: str) -> dict[str, dict[str, str]]:
    """Food number -> {component identifier: cell} for one archived spreadsheet's whole-table sheet."""
    rows = xlsx_min.read(fetch.get(name))["表全体"]
    head = next(i for i, r in enumerate(rows[:15]) if r and any(str(c).strip() == "WATER" for c in r if c))
    codes = [str(c).strip() if c else "" for c in rows[head]]
    out = {}
    for r in rows[head + 1:]:
        if r and len(r) > 4 and r[1] and re.fullmatch(r"\d{5}", str(r[1]).strip()):
            out[str(r[1]).strip()] = {"group": str(r[0]).strip(), "name": str(r[3]).strip()} | {
                c: (str(r[i]).strip() if i < len(r) and r[i] is not None else "") for i, c in enumerate(codes) if c}
    return out


def source_names() -> dict[str, str]:
    """Food number -> MEXT's English name of the food source, from item ranges such as "01005-010, 01144"."""
    out = {}
    for r in xlsx_min.read(fetch.get(NAMES))["Scientific name of food source"]:
        if not r or len(r) < 2 or not r[0] or not r[1] or not re.match(r"\d{5}", str(r[0])):
            continue
        eng = re.sub(r"\s*\[Syn\..*?\]|\s+", " ", str(r[1])).strip().replace('"', "")
        for part in re.split(r",\s*", str(r[0]).strip()):
            m = re.fullmatch(r"(\d{5})(?:\s*-\s*(\d+))?", part.strip())
            if not m:
                continue
            a = m.group(1)
            b = m.group(2)
            end = a if not b else (a[: 5 - len(b)] + b)
            for n in range(int(a), int(end) + 1):
                out.setdefault(f"{n:05d}", eng)
    return out


def main() -> int:
    gloss = json.loads((HERE / "japan_glossary.json").read_text())["terms"]
    files = {MAIN: table(MAIN), AMINO: table(AMINO), FATTY: table(FATTY)}
    eng = source_names()
    seen, out_basic, out_more, untranslated = set(), [], [], 0
    for code, row in sorted(files[MAIN].items()):
        vals, labels = {}, {}
        for key, (f, comp, factor, _d) in MAP.items():
            t = files[f].get(code, {}).get(comp, "")
            est = t.startswith("(") and t.endswith(")")
            if est:
                t = t[1:-1].strip()
            if t == "Tr":
                labels[key] = "trace"
                continue
            v = common.num(t)
            if v is None:
                continue
            vals[key] = v * factor
            if est:
                labels[key] = "e"
        if not vals:
            continue
        vals |= common.derive(vals, table_gives_ne=True)
        ja = row["name"]
        toks = [t for t in re.split(r"[　 ]+", ja) if t]
        # Names run: [<category>] [(group)] species [[subgroup]] descriptors. With MEXT's English source name, the
        # leading group markers and the species are what that name already says, so they are dropped.
        if eng.get(code):
            while toks and toks[0][0] in "＜（":
                toks = toks[1:]
            head, rest = eng[code], [gloss.get(t, t) for t in toks[1:]]
        else:
            while len(toks) > 1 and toks[0][0] == "＜":   # a broad category marker, when a more specific term follows
                toks = toks[1:]
            head, rest = gloss.get(toks[0], toks[0]), [gloss.get(t, t) for t in toks[1:]]
        untranslated += sum(1 for t in [head, *rest] if re.search(r"[぀-ヿ一-鿿]", t))
        name = ", ".join([head, *rest])
        cat = GROUP.get(row["group"], "other")
        if cat == "veg" and row["group"] == "02" and re.search(r"でん粉|はるさめ|くずきり", ja):
            cat = "other"
        bcat = common.basic_category(cat, name) if "energy" in vals and row["group"] not in ("15", "16", "17", "18") else None
        fid = common.unique_id(TABLE, code, seen)
        e = common.entry(TABLE, fid, code, name, bcat or cat, vals, labels, basic=bool(bcat),
                         extra={"nameJa": ja, "translated": True, "sourceEn": eng.get(code)})
        (out_basic if bcat else out_more).append(e)
    common.write(TABLE, TITLE, {"main": MAIN, "aminoAcids": AMINO, "fattyAcids": FATTY, "englishNames": NAMES},
                 {k: m[3] for k, m in MAP.items() if m[3]}, out_basic, out_more,
                 ["Food names are translated by this site (MEXT publishes Japanese names only): the MEXT English name of "
                  "the food source, then the glossary's translation of each other term (`japan_glossary.json`).",
                  f"Terms left in Japanese (not in the glossary): {untranslated}.",
                  "Sugars aren't in the archived files (MEXT publishes them in a separate carbohydrate table): NA."], LABELS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
