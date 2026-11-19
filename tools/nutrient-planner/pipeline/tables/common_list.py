"""The Common list: basic foods found as the same food in at least two independent tables (owner, 19 Nov 2026).

Run after the table converters and before build_index.py:

  python3 -I tools/nutrient-planner/pipeline/tables/common_list.py

For every table's basic foods (the Planner's lists) it reads the published name into a set of food words, a
preparation (raw, dried, boiled, roasted, ...) and skin on or off, and compares records of different tables:

- **same food**: the same food words (after synonyms and singular forms), or one extra qualifier word on one side
  ("lentils" and "lentils, red"), or two if both are harmless qualifiers (origin, farmed, colour, split), unless that word makes it another product (juice, flour, dried, leaves, ...);
  compatible preparation, skin and salt; and composition that agrees (protein, fat and energy within tolerance, at least
  two of them known, and not
  both sodium and calcium outside it). The tolerances are the blend's rule v1 (pipeline/blend/README.md), with energy
  widened to 30% or 30 kcal because the tables use different energy factors.
- **USDA and CoFID**: the reviewed decisions in pipeline/blend/matches/cofid.csv win: a pair decided same or
  equivalent is a match, and a USDA food decided similar or none matches no CoFID record.
- **independent**: each record belongs to a *source family*, its own table, unless most of its values are labelled
  as taken from another table: CNF values unchanged from, adjusted from or imputed from USDA count as USDA; KFCDb's
  borrowed foods count as the table their source column names; borrowed foods whose source isn't named (AFCD
  "borrowed", BLS "another database", CNF "another country's table", KFCDb from other tables) count as unknown and
  can't confirm a food on their own. Two records whose values are nearly identical (at least 8 shared non-zero values
  other than energy, carbohydrate and definition-dependent vitamins, 70% of them within 2%) are treated as copies of
  the same data, whatever their tables say.

A record is **common** when it and the records it matches include two of different known families that are not copies,
and it is not a raw food people don't normally eat raw (the shared raw rule) or a US-fortified product. Every table's file gets `common: true`
on those foods; nothing else changes. The matches are used only to choose foods, never for values (values are always
the table's own). Outputs: the flags in data/foods/foods-<table>.json, data/foods/common_report.md and
pipeline/blend/matches/common-list-matches.csv (every match, with why it is or isn't independent), for review and the blend.

The 116 hand-picked USDA foods are kept, as they were, in pipeline/tables/handpicked_usda.json; they pass the same
test as everything else.
"""
from __future__ import annotations

import collections
import csv
import datetime as dt
import itertools
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE)]
import common  # noqa: E402

DATA = common.TOOL / "data/foods"
KEYS = common.KEYS
IX = {k: i for i, k in enumerate(KEYS)}

# ---- reading a name -------------------------------------------------------------------------------------------------
SKIN_NO = re.compile(r"\b(without skin|skinless|skin removed|no skin|peeled|flesh only|meat only|lean only|lean flesh|without peel)\b|\bflesh\b(?! and skin)(?!,? skin)")
SALT_NO = re.compile(r"\b(unsalted|no added salt|without added salt|without salt|no salt added|salt[- ]free|low sodium|no sodium added|in unsalted water)\b")
SALT_YES = re.compile(r"\b(salted|salt added|with salt|with added salt|added salt|in salted water)\b")
SALT_REDUCED = re.compile(r"\b(reduced salt|reduced sodium|low salt|lightly salted)\b")
SKIN_YES = re.compile(r"\b(with skin|unpeeled|flesh and skin|meat and skin|skin (?:&|and) fat|with peel)\b")
STATES = [  # (state, pattern); a cooking method beats "dried", which beats "raw"
    ("moist", r"\b(boiled|boil|simmered|poached|steamed|blanched|cooked in (?:unsalted |salted )?water)\b"),
    ("stewed", r"\b(stewed|braised|casseroled|stew)\b"),
    ("roast", r"\b(roasted|roast|baked|oven[- ]baked|oven)\b"),
    ("grill", r"\b(grilled|broiled|barbecued|bbq'?d|bbq|griddled|pan[- ]broiled|char[- ]grilled)\b"),
    ("micro", r"\b(microwaved|microwave)\b"),
    ("fried", r"\b(fried|sauteed|sautéed|pan[- ]fried|stir[- ]fried)\b"),
    ("cooked", r"\b(cooked|heated|re-heated|reheated|prepared)\b"),
    ("canned", r"\b(canned|tinned)\b"),
]
# Phrases that describe something other than the preparation of the food itself
NOT_STATE = re.compile(r"\b(?:boiled |cooked )?in (?:unsalted |salted |boiling )?water\b|\b(?:prepared|made) (?:with|from) [^,]*|\bin (?:water|brine|oil|own juice|tomato juice|syrup|juice)\b|\b(?:dry|moist) heat\b|\bmay contain [^,]*|\bin dry matter\b|\bdry matter\b|\bfidm\b|\buncooked weight\b")
DRY = re.compile(r"\b(dried|dry|dehydrated|mature seeds?|mature|uncooked weight)\b")
RAW = re.compile(r"\b(raw|uncooked|unprepared|unheated|unroasted)\b")
COOKED_ANY = {"moist", "stewed", "roast", "grill", "micro", "fried", "cooked"}
# A food's fat level ("lowfat", "2% milkfat", "reduced fat", "extra virgin") is left to the composition check.
FINELI_PROCESS = {"RAW": "raw", "DRIE": "dry", "BOIL": "moist", "BAK": "roast", "ROAS": "roast"}
NOISE = set("""average all variety varieties var fresh plain edible portion part parts with without no added unsalted salt
salted unsweetened in of and or the a an from drained solids undrained cow fluid conventional konventional not organic
domestic imported prepacked commercial commercially mixed species purchased home homemade store type ns nfs regular
standard sliced diced chopped piece pieces spear spears floret florets flower head heads cluster clusters whole-
retail cut cuts trimmed untrimmed fat lean meat flesh skin boneless bone bones only ready eat usa us uk canada canadian
australia australian india indian japan korea denmark danish finland finnish france french germany german
domestic market supermarket bought frozen-thawed thawed unsalted including includes include also enriched
unenriched fortified unfortified vitamin vitamins added ascorbic acid unheated large small medium mini cereal cereals
grain grains breakfast hot lowfat low reduced milkfat nonfat fat-free lite matter min creamed full part skim skimmed
semi-skim semi-skimmed extra virgin value values as purchased type fish crustacean mollusk mollusc
shellfish finfish kernel cob off heat include""".split())
FAT_MILK = re.compile(r"\b(?:made with |with )?(?:whole|skim|skimmed|semi-skimmed|part[- ]skim|low[- ]fat|reduced[- ]fat|full[- ]fat|fat-free|nonfat|lowfat) milk\b")
DISTINCT = set("""juice nectar dried frozen powder flour oil sauce seed leaf sprout sprouted puree paste milk butter cream
cheese bran germ flake meal starch concentrate canned pickled smoked syrup drink beverage liver egg white yolk spread
noodle pasta bread chip stock soup jam roe drumstick wing thigh breast leg mince ground minced liquid deep-frozen
mustard sweet soured sour yoghurt kefir cultured fermented mixed squash content prickly""".split())
# A second extra word is allowed only when both are harmless qualifiers like these (origin, farming, colour, grain).
QUALIFIER = set("""atlantic pacific farmed wild north american european norwegian alaskan rainbow long-grain long short-grain
medium-grain short medium red green yellow white brown black golden split whole kernel skinned pink purple common
standard ripe mature young baby hulled pearled unpolished polished""".split())
GENERIC = {"vegetable", "fruit", "fish", "seafood", "nut", "seed", "herb", "spice", "berry", "mushroom", "bean", "meat", "cheese", "oil", "bread", "pasta", "flour"}


def singular(w: str) -> str:
    if len(w) <= 3 or w.endswith(("ss", "us", "is")):
        return w
    for a, b in (("ies", "y"), ("oes", "o"), ("ves", "f"), ("ches", "ch"), ("shes", "sh")):
        if w.endswith(a):
            return w[: -len(a)] + b
    return w[:-1] if w.endswith("s") else w


def synonyms() -> list[tuple[re.Pattern, str]]:
    out = []
    for path in (common.PIPELINE / "blend/synonyms.csv", common.PIPELINE / "blend/synonyms_common.csv"):
        for r in csv.DictReader(path.read_text(encoding="utf-8").splitlines()):
            out.append((re.compile(rf"\b{re.escape(r['phrase'].lower())}\b"), r["canonical"].lower()))
    out.sort(key=lambda x: -len(x[0].pattern))  # longer phrases first
    return out


SYN = synonyms()


def read_name(name: str, process: str | None = None) -> tuple[frozenset, str, str]:
    t = name.lower()
    t = re.sub(r"\([^)]*\)|\[[^\]]*\]|（[^）]*）", " ", t)
    t = re.sub(r"\b(?:packed|canned) in [^,]*", " canned ", t)
    t = NOT_STATE.sub(" ", t)
    if not re.match(r"\s*(?:whole |skim |skimmed |semi-skimmed |)milk\b", t):
        t = FAT_MILK.sub(" ", t)  # "Cheese, mozzarella, whole milk": the fat level, left to the composition check
    skin = "no" if SKIN_NO.search(t) else "yes" if SKIN_YES.search(t) else ""
    t = SKIN_YES.sub(" ", SKIN_NO.sub(" ", t))
    salt = ("no" if SALT_NO.search(t) else "reduced" if SALT_REDUCED.search(t)
            else "yes" if SALT_YES.search(t) or re.search(r"\bsalt\b", t) else "")
    methods = [s for s, p in STATES if s not in ("cooked", "canned") and re.search(p, t)]
    state = "+".join(sorted(set(methods))) if len(set(methods)) > 1 else ""   # "boiled, fried": two steps
    for s, p in STATES:
        if not state and re.search(p, t):
            state = s
            break
    if not state and DRY.search(t):
        state = "dry"
    if not state and RAW.search(t):
        state = "raw"
    if not state and process:
        state = FINELI_PROCESS.get(process, "")
    for _s, p in STATES:
        t = re.sub(p, " ", t)
    t = RAW.sub(" ", DRY.sub(" ", t))  # the preparation is kept in `state`, not in the words
    t = re.sub(r"\s+", " ", re.sub(r"[,;:/&.]", " ", t)).strip()
    for pat, canon in SYN:
        t = pat.sub(canon, t)
    words = set()
    for w in re.findall(r"[a-zà-ÿ]+(?:-[a-zà-ÿ]+)*|[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+", t):  # untranslated terms count
        w = singular(w)
        if w not in NOISE and len(w) > 1:
            words.add(w)
    return frozenset(words), state, skin + "/" + salt


def facet_ok(a: str, b: str) -> bool:
    """skin/salt: each the same or unknown on one side; "reduced" salt only matches "reduced"."""
    return all(x == y or (not x or not y) and "reduced" not in (x, y) for x, y in zip(a.split("/"), b.split("/")))


DRY_IS_RAW = {"pulses", "grains", "cereals", "nuts", "herbs"}


def states_ok(a: str, b: str, cat: str = "") -> bool:
    if a == b or not a or not b:
        return True
    if {a, b} == {"raw", "dry"} and cat in DRY_IS_RAW:
        return True
    return (a == "cooked" and b in COOKED_ANY) or (b == "cooked" and a in COOKED_ANY)


# ---- composition ----------------------------------------------------------------------------------------------------
def near(a, b, absol, rel) -> bool:
    return abs(a - b) <= max(absol, rel * max(abs(a), abs(b)))


def composition_ok(u: list, v: list) -> bool:
    known = 0
    for k, absol, rel in (("protein", 1, 0.2), ("fat", 1, 0.3), ("energy", 30, 0.3)):
        a, b = u[IX[k]], v[IX[k]]
        if a is None or b is None:
            continue
        if not near(a, b, absol, rel):
            return False
        known += 1
    if known < 2:
        return False
    off = 0
    for k, absol, rel in (("sodium", 50, 0.5), ("calcium", 30, 0.4)):
        a, b = u[IX[k]], v[IX[k]]
        if a is not None and b is not None and not near(a, b, absol, rel):
            off += 1
    return off < 2


# Tables that borrow values recalculate energy and carbohydrate and may restate definition-dependent vitamins, so a
# copy is judged on the values they take over unchanged: at least 8 shared non-zero values, 70% within 2%.
COPY_KEYS = [k for k in KEYS if k not in common.DERIVED and k not in
             ("energy", "carbohydrate", "sugars", "fibre", "vitaminA", "folate", "vitaminD", "vitaminE", "vitaminK", "niacinNE")]


def copies(u: list, v: list) -> bool:
    shared = [(u[IX[k]], v[IX[k]]) for k in COPY_KEYS if u[IX[k]] and v[IX[k]]]
    if len(shared) < 8:
        return False
    same = sum(1 for a, b in shared if abs(a - b) <= 0.02 * max(abs(a), abs(b)))
    return same >= 0.7 * len(shared)


# ---- source families ------------------------------------------------------------------------------------------------
COPY_LABELS = {"cnf": {"u": "usda", "r": "usda", "cu": "usda", "i": "usda", "x": "?"},
               "afcd": {"b": "?"}, "bls": {"d": "?"}, "kfcdb": {"b": "kfcdb-borrowed"}}


def family(table: str, f: dict) -> str:
    q = f.get("q") or {}
    n = sum(1 for x in f["v"] if x is not None)
    labels = COPY_LABELS.get(table, {})
    if not labels or not n:
        return table
    counts = collections.Counter(labels[l] for l in q.values() if l in labels)
    if not counts:
        return table
    fam, c = counts.most_common(1)[0]
    if c * 2 <= n:
        return table
    if fam == "kfcdb-borrowed":
        src = (f["src"].get("dataSource") or "").upper()
        return "usda" if "USDA" in src else "japan" if "JAPAN" in src else "?"
    return fam


RAW_RULES = {k: v for k, v in json.loads((common.PIPELINE / "raw_rules.json").read_text()).items() if not k.startswith("_")}
RAW_WORD = re.compile(r"\b(?:raw|uncooked)\b", re.I)


def usda_raw_unusual(f: dict, src: str) -> bool:
    """USDA: the owner-reviewed rules in pipeline/raw_rules.json (by category and USDA group); raw meat and fish too."""
    if not RAW_WORD.search(src):
        return False
    if f["cat"] in ("meat", "fish"):
        return True
    rule = RAW_RULES.get(f["cat"])
    if not rule:
        return False
    group = f["group"].lower()
    if "rawOk" in rule:
        return group not in {g.lower() for g in rule["rawOk"]}
    return any(group.startswith(w.lower()) for w in rule.get("rawNot", []))


# ---- the list -------------------------------------------------------------------------------------------------------
def load() -> tuple[list[dict], list[dict], dict]:
    tables = [t for t in json.loads((HERE / "tables.json").read_text())["tables"] if t["id"] != "blend"]   # the blend is built from these
    recs, files = [], {}
    for t in tables:
        d = json.loads((DATA / t["basic"]).read_text())
        files[t["id"]] = d
        for f in d["foods"]:
            src = f.get("srcName") or f.get("usdaName") or f["name"]
            words, state, skin = read_name(src, (f.get("src") or {}).get("process"))
            process = (f.get("src") or {}).get("process")
            raw_bad = usda_raw_unusual(f, src) if t["id"] == "usda" else \
                common.raw_unusual(f["cat"], f"{src}, raw" if process == "RAW" else src)
            recs.append({"table": t["id"], "f": f, "name": src, "words": words, "state": state, "skin": skin,
                         "family": family(t["id"], f), "raw_bad": raw_bad})
    return tables, recs, files


def reviewed_cofid() -> tuple[set, set]:
    """USDA-CoFID decisions already reviewed (pipeline/blend/matches/cofid.csv): (USDA fdcId, CoFID code) pairs decided
    same or equivalent, and USDA fdcIds decided similar or none (no CoFID record is the same food)."""
    blend = common.PIPELINE / "blend"
    anchor = {r["concept"]: r["anchor"] for r in csv.DictReader((blend / "concepts.csv").read_text(encoding="utf-8").splitlines())}
    same, apart = set(), set()
    for r in csv.DictReader((blend / "matches/cofid.csv").read_text(encoding="utf-8").splitlines()):
        fdc = anchor.get(r["concept"]) or r["concept"].removeprefix("c:u")
        code = r["id"].removeprefix("cofid:").split("~")[0].upper() if r["id"] else ""
        if r["grade"] in ("same", "equivalent") and code:
            same.add((fdc, code))
        else:
            apart.add(fdc)
    return same, apart


def code_of(f: dict) -> str:
    """The record's code in its table (USDA: the FDC id)."""
    return str((f.get("src") or {}).get("code") or f.get("fdcId") or "")


def cats_ok(a: str, b: str) -> bool:
    return a == b or {a, b} <= {"veg", "pulses"} or {a, b} <= {"grains", "cereals"} or {a, b} <= {"nuts", "herbs"}


def match_all(recs: list[dict]) -> dict[int, list[tuple[int, str]]]:
    by_key = collections.defaultdict(list)
    for i, r in enumerate(recs):
        if r["words"]:
            by_key[r["words"]].append(i)
    links = collections.defaultdict(list)

    def try_pair(i: int, j: int, how: str) -> None:
        a, b = recs[i], recs[j]
        if a["table"] == b["table"] or not cats_ok(a["f"]["cat"], b["f"]["cat"]):
            return
        if not states_ok(a["state"], b["state"], a["f"]["cat"]) or not facet_ok(a["skin"], b["skin"]):
            return
        if not composition_ok(a["f"]["v"], b["f"]["v"]):
            return
        links[i].append((j, how))
        links[j].append((i, how))

    for key, ids in by_key.items():
        for x in range(len(ids)):
            for y in range(x + 1, len(ids)):
                try_pair(ids[x], ids[y], "same words")
        # one or two more words on one side (a variety, an origin), unless they make it another product
        for drop in [frozenset([w]) for w in key] + [frozenset(c) for c in itertools.combinations(sorted(key), 2)]:
            rest = key - drop
            if not rest or rest <= GENERIC or drop & DISTINCT or (len(drop) == 2 and not drop <= QUALIFIER):
                continue
            for i in by_key.get(rest, []):
                for j in ids:
                    try_pair(i, j, f"more words: {' '.join(sorted(drop))}")
    # USDA and CoFID: the reviewed decisions win (same: linked; similar or none: never linked to CoFID)
    same_rev, apart_rev = reviewed_cofid()
    usda = {code_of(r["f"]): i for i, r in enumerate(recs) if r["table"] == "usda"}
    cofid = {code_of(r["f"]).upper(): i for i, r in enumerate(recs) if r["table"] == "cofid"}
    for i in list(links):
        if recs[i]["table"] == "usda" and code_of(recs[i]["f"]) in apart_rev:
            for j, _ in [x for x in links[i] if recs[x[0]]["table"] == "cofid"]:
                links[i] = [x for x in links[i] if x[0] != j]
                links[j] = [x for x in links[j] if x[0] != i]
    for fdc, code in same_rev:
        i, j = usda.get(fdc), cofid.get(code)
        if i is not None and j is not None and all(x[0] != j for x in links.get(i, [])):
            links[i].append((j, "reviewed: same"))
            links[j].append((i, "reviewed: same"))
    return links


def main() -> int:
    tables, recs, files = load()
    usda = files["usda"]
    keep = HERE / "handpicked_usda.json"
    if not keep.exists():
        keep.write_text(json.dumps({"_comment": "The 116 hand-picked USDA common foods as they were before the Common list "
                                    "was derived from the tables (19 Nov 2026). Kept for reference; not used by the tools.",
                                    "foods": [{"id": f["id"], "name": f["name"], "usdaName": f.get("usdaName"), "fdcId": f.get("fdcId"),
                                               "cat": f["cat"]} for f in usda["foods"] if f.get("common")]},
                                   ensure_ascii=False, indent=1) + "\n")
    links = match_all(recs)
    common_ids, why, n_fams = set(), {}, {}
    pair_rows = []
    for i, r in enumerate(recs):
        wit = ([(i, r["family"])] if r["family"] != "?" else []) + [(j, recs[j]["family"]) for j, _ in links.get(i, []) if recs[j]["family"] != "?"]
        found = None
        for x in range(len(wit)):
            for y in range(x + 1, len(wit)):
                (p, fp), (s, fs) = wit[x], wit[y]
                if fp != fs and not copies(recs[p]["f"]["v"], recs[s]["f"]["v"]):
                    found = (p, s)
                    break
            if found:
                break
        if found and not r["raw_bad"] and not r["f"].get("fortified"):
            common_ids.add(i)
            why[i] = found
            # for the report: how many independent families confirm it (copies of this record don't count)
            fams = {fp for p, fp in wit if p == i or not copies(r["f"]["v"], recs[p]["f"]["v"])}
            n_fams[i] = len(fams)
    for i, js in links.items():
        for j, how in js:
            if i < j:
                a, b = recs[i], recs[j]
                indep = "copies (values nearly identical)" if copies(a["f"]["v"], b["f"]["v"]) else \
                    "same source family" if a["family"] == b["family"] else \
                    "source unknown" if "?" in (a["family"], b["family"]) else "independent"
                pair_rows.append([a["table"], a["f"]["id"], a["name"], b["table"], b["f"]["id"], b["name"], how,
                                  a["family"], b["family"], indep])
    with (common.PIPELINE / "blend/matches/common-list-matches.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["table_a", "id_a", "name_a", "table_b", "id_b", "name_b", "match", "family_a", "family_b", "independence"])
        w.writerows(sorted(pair_rows))
    # write the flags
    for i, r in enumerate(recs):
        r["f"]["common"] = i in common_ids
    for t in tables:
        (DATA / t["basic"]).write_text(json.dumps(files[t["id"]], ensure_ascii=False, separators=(",", ":")))
    # report
    today = dt.date.today().isoformat()
    lines = [f"# Common list ({today})", "", "Generated by `pipeline/tables/common_list.py`; don't edit. A basic food is common when "
             "it is the same food in at least two independent tables (see the script's notes for the rules), and is not a "
             "raw food people don't normally eat raw. The matching is automated, without manual human verification (beta); "
             "it chooses foods only, never values.", "", "| Table | Basic foods | Common | Matched to another table | Raw, left out |",
             "|---|---|---|---|---|"]
    for t in tables:
        rs = [i for i, r in enumerate(recs) if r["table"] == t["id"]]
        lines.append(f"| {t['tag']} | {len(rs)} | {sum(i in common_ids for i in rs)} | {sum(1 for i in rs if links.get(i))} | "
                     f"{sum(1 for i in rs if recs[i]['raw_bad'] and links.get(i))} |")
    lines += ["", "With three independent tables instead of two, the Common list would have: " + ", ".join(
        f"{t['tag']} {sum(1 for i in common_ids if recs[i]['table'] == t['id'] and n_fams[i] >= 3)}" for t in tables) + "."]
    cats = collections.Counter(recs[i]["f"]["cat"] for i in common_ids)
    lines += ["", f"Common foods in all tables: {len(common_ids)}. By category: " + ", ".join(f"{c} {n}" for c, n in cats.most_common()) + ".",
              "", f"Matches: {len(pair_rows)} (`pipeline/blend/matches/common-list-matches.csv`). Independence of the matched pairs: " +
              ", ".join(f"{k} {v}" for k, v in collections.Counter(r[-1] for r in pair_rows).most_common()) + ".", "",
              "## The hand-picked USDA foods", ""]
    hp = json.loads(keep.read_text())["foods"]
    hp_ids = {f["id"] for f in hp}
    kept = [i for i in common_ids if recs[i]["table"] == "usda" and recs[i]["f"]["id"] in hp_ids]
    lines.append(f"{len(kept)} of the {len(hp)} hand-picked foods pass the test. Not passing:")
    lines.append("")
    for f in hp:
        idx = next((i for i, r in enumerate(recs) if r["table"] == "usda" and r["f"]["id"] == f["id"]), None)
        if idx is not None and idx not in common_ids:
            r = recs[idx]
            reason = "raw, not normally eaten raw" if r["raw_bad"] else "no match in another table" if not links.get(idx) else "matched only within one source family or to copies"
            lines.append(f"- {f['name']} (`{r['name']}`): {reason}")
    (DATA / "common_report.md").write_text("\n".join(lines) + "\n")
    print(f"common: {len(common_ids)} of {len(recs)} basic foods", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
