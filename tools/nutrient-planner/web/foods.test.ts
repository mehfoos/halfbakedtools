// The beta Blended table: its values follow the chosen standard, a missing value never becomes zero, and switching
// back restores the file's values exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applySource, blendValues, dietOk, unpack, valueLabels, type BlendData } from "./foods.ts";

const dir = new URL("../data/foods/", import.meta.url);
const load = () => unpack(JSON.parse(readFileSync(new URL("foods.json", dir), "utf8")));
const loadBlended = () => unpack(JSON.parse(readFileSync(new URL("foods-blend.json", dir), "utf8")));
const blend: BlendData = JSON.parse(readFileSync(new URL("foods-blend-values.json", dir), "utf8"));

test("Blended table: values follow the standard's definitions, and the file's values come back exactly", () => {
  const data = loadBlended();
  const before = new Map(data.foods.map((f) => [f.id, JSON.stringify(f.per100g)]));
  const lentils = data.foods.find((f) => f.id === "blend:lentils")!;
  assert.deepEqual(blend.foods["blend:lentils"].records.map((r) => r.code), ["172421", "F005177", "3393", "H730132"]);
  applySource(data, blend, "blend", "uk");
  assert.equal(lentils.per100g.energy, 119);         // no UK-factor value in the group: EU factors (BLS), the UK's next choice
  assert.deepEqual(lentils.blend!.c.uk.energy, ["one-table"]);
  assert.equal(lentils.per100g.vitaminA, undefined); // retinol equivalents: AFCD and BLS differ five-fold, so no value
  assert.ok(lentils.blend!.c.uk.vitaminA.includes("tables-disagree"));
  applySource(data, blend, "blend", "us");
  assert.equal(lentils.per100g.energy, 116);         // USDA's Atwater energy (CNF's copy of it counts once)
  assert.equal(lentils.per100g.vitaminA, 0);         // retinol activity equivalents
  applySource(data, blend, "", "us");
  for (const f of data.foods) assert.equal(JSON.stringify(f.per100g), before.get(f.id), f.id);
  assert.equal(lentils.blend, null);
  const usda = load();
  const untouched = JSON.stringify(usda.foods.map((f) => f.per100g));
  applySource(usda, blend, "blend", "us");             // other tables are never touched
  assert.equal(JSON.stringify(usda.foods.map((f) => f.per100g)), untouched);
});

test("Blended table: a missing value stays missing, every value has a definition, and each food has 2+ tables", () => {
  const data = loadBlended();
  assert.ok(data.foods.length > 300 && data.foods.every((f) => f.common));
  for (const std of ["uk", "us", "eu"]) {
    applySource(data, blend, "blend", std);
    for (const [id, b] of Object.entries(blend.foods)) {
      const f = data.foods.find((x) => x.id === id)!;
      assert.ok(b.records.filter((r) => !("notUsed" in r)).length >= 2, id);
      for (const v of blendValues(blend, b, std)) {
        if (v.value === null) assert.ok(!(v.key in f.per100g), `${id} ${v.key}`);
        else {
          assert.equal(f.per100g[v.key], v.value);
          assert.ok(v.definition && blend.definitions[v.definition], `${id} ${v.key}`);
        }
        for (const c of v.caveats) assert.ok(blend.caveats[c], `${id} ${v.key} ${c}`);
        if (v.range) assert.ok(v.range[0] <= v.value! * 1.001 + 1e-9 && v.value! <= v.range[1] * 1.001 + 1e-9, `${id} ${v.key}`);
      }
    }
  }
});

// The Common list holds no raw food that people don't normally eat raw. USDA rules and reasons:
// pipeline/raw_rules.json. Everything stays available in the "All foods" preset.
test("default lists leave out raw foods that aren't normally eaten raw", () => {
  const data = load();
  const rules = JSON.parse(readFileSync(new URL("../pipeline/raw_rules.json", import.meta.url), "utf8"));
  const rawOk = new Set<string>(rules.veg.rawOk.map((g: string) => g.toLowerCase()));
  const isRaw = (n: string) => /\b(raw|uncooked)\b/i.test(n);
  const exceptions = new Set<string>();
  const bad: string[] = [];
  for (const f of data.foods.filter((x) => x.common)) {
    if (!isRaw(f.srcName) || exceptions.has(f.name)) continue;
    const g = f.group.toLowerCase();
    if (f.diet === "meat") bad.push(`${f.name}: raw meat or fish`);
    else if (f.cat === "dairy" && /^egg/.test(g)) bad.push(`${f.name}: raw egg`);
    else if (f.cat === "veg" && !rawOk.has(g)) bad.push(`${f.name}: raw vegetable not usually eaten raw`);
    else if (f.cat === "fruit" && /^rhubarb/.test(g)) bad.push(`${f.name}: raw rhubarb`);
    else if (f.cat === "nuts" && /^chestnuts/.test(g)) bad.push(`${f.name}: raw chestnuts`);
  }
  assert.deepEqual(bad, []);
  assert.ok(data.foods.some((f) => !f.common && f.cat === "dairy" && /raw/.test(f.srcName)), "raw eggs remain in the full list");
});

// Every table is offered on an equal footing (pipeline/tables/tables.json): two files per table, the Planner's basic
// foods and the rest (Food Finder only), and Food Finder's name index of every food in every table.
test("food tables: two files each, same nutrient keys, unique ids, index complete", () => {
  const read = (f: string) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  const tables = read("tables.json").tables;
  const index = read("index.json");
  const usdaKeys = read("foods.json").keys;
  assert.ok(tables.length >= 2 && tables.some((t: any) => t.id === "usda"));
  for (const t of tables) {
    const basic = read(t.basic), more = read(t.more);
    assert.deepEqual(basic.keys, usdaKeys, `${t.id}: same nutrient keys as the USDA file`);
    assert.deepEqual(more.keys, usdaKeys, `${t.id} more: same nutrient keys`);
    const ids = [...basic.foods, ...more.foods].map((f: any) => f.id);
    assert.equal(new Set(ids).size, ids.length, `${t.id}: ids are unique`);
    assert.ok(ids.every((id: string) => /^[a-z0-9:-]{1,40}$/.test(id)), `${t.id}: ids fit the page address`);
    assert.equal(t.foods, ids.length);
    assert.equal(t.basicFoods, basic.foods.length);
    assert.deepEqual(index.foods[t.id].map((r: any[]) => r[0]), ids, `${t.id}: the index lists every food, in order`);
    // Foods outside the basic foods: never in the Planner; mixed foods are "unknown" for diet unless meat or fish.
    for (const f of more.foods) {
      assert.ok(f.diet === "meat" || f.diet === "unknown", `${t.id} ${f.name}: diet ${f.diet}`);
      assert.ok(f.v.some((x: number | null) => x !== null), `${t.id} ${f.name}: has at least one value`);
    }
  }
});

test("a food of unknown diet is shown only when no diet is chosen", () => {
  assert.equal(dietOk({ diet: "unknown" }, "none"), true);
  assert.equal(dietOk({ diet: "unknown" }, "vegetarian"), false);
  assert.equal(dietOk({ diet: "unknown" }, "vegan"), false);
});

// One value per table, checked by hand against the archived source file, so a mapping or unit mistake shows up.
test("each table's values are its own, in the planner's units (spot checks against the source files)", () => {
  const read = (f: string) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  const value = (table: string, code: string, key: string) => {
    const t = read("tables.json").tables.find((x: any) => x.id === table);
    const all = [...read(t.basic).foods, ...read(t.more).foods];
    const f = all.find((x: any) => x.src?.code === code);
    assert.ok(f, `${table} ${code} is listed`);
    return f.v[read(t.basic).keys.indexOf(key)];
  };
  assert.equal(value("bls", "C131000", "energy"), 343);          // BLS: oat whole grain, raw, ENERCC 343 kcal
  assert.equal(value("bls", "C131000", "protein"), 11.38);       // PROT625 11.375 g (stored to 4 significant figures)
  assert.equal(value("ciqual", "19024", "iodine"), 12.4);        // Ciqual: whole pasteurised milk, iodine 12.4 µg
  assert.equal(value("frida", "1", "folate"), 117);              // Frida: strawberry, raw, folate 117 µg (16 analyses)
  assert.equal(value("kfcdb", "A001001A010a", "energy"), 373);   // KFCDb: oat, polished, raw, 373 kcal
  assert.equal(value("japan", "01004", "lysine"), 0.62);         // MEXT: oatmeal, lysine 620 mg -> 0.62 g
  assert.equal(value("japan", "01004", "energy"), 350);          // MEXT: oatmeal, 350 kcal
  assert.equal(value("cnf", "1413", "energy"), 382);             // CNF: instant oatmeal, dry, 382 kcal
  assert.equal(value("cnf", "1413", "protein"), 12.98);
  assert.equal(value("cnf", "1413", "carbohydrate"), 57.43);     // by difference 67.53 g minus fibre 10.1 g
  assert.equal(value("cnf", "1413", "folate"), 107.6);           // dietary folate equivalents 107.6 µg
  assert.equal(value("cnf", "1413", "lysine"), null);            // no lysine value: NA, not zero
  assert.equal(value("afcd", "F006136", "energy"), 379.8);       // AFCD: oats, hulled, uncooked, 1589 kJ / 4.184
  assert.equal(value("afcd", "F006136", "selenium"), 17);
  assert.equal(value("afcd", "F006136", "lysine"), null);        // no amino acid values: NA, not zero
});

test("codes are labels, never numbers: trace and below-limit values are missing", () => {
  const read = (f: string) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  for (const t of read("tables.json").tables) {
    for (const file of [t.basic, t.more]) {
      const d = read(file);
      for (const f of d.foods) for (const [k, q] of Object.entries(f.q ?? {})) {
        if (q === "trace" || q === "lod" || String(q).startsWith("<")) assert.equal(f.v[d.keys.indexOf(k)], null, `${t.id} ${f.name} ${k}`);
      }
    }
  }
});

test("value labels: each table's labelled values are listed in its own words, grouped by label", () => {
  const raw = JSON.parse(readFileSync(new URL("foods-bls.json", dir), "utf8"));
  const data = unpack(raw);
  assert.ok(data.labels && data.labels.r, "the legend is kept");
  const f = data.foods.find((x) => x.q && Object.values(x.q).includes("r"))!;
  const rows = valueLabels([f], data.labels!, () => true, (k) => k);
  const recipe = rows[0].groups.find((g) => g.text === data.labels!.r)!;
  assert.deepEqual(recipe.nutrients.sort(), Object.entries(f.q!).filter(([, c]) => c === "r").map(([k]) => k).sort());
  assert.deepEqual(valueLabels([f], data.labels!, () => false, (k) => k), []);
});
