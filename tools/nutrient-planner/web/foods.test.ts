// The beta blended source is an overlay: it changes only the foods it covers, follows the chosen standard, never
// turns a missing value into zero, and switching back to USDA restores the USDA values exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applySource, blendValues, dietOk, unpack, type BlendData } from "./foods.ts";

const dir = new URL("../data/foods/", import.meta.url);
const load = () => unpack(JSON.parse(readFileSync(new URL("foods.json", dir), "utf8")));
const blend: BlendData = JSON.parse(readFileSync(new URL("foods-blend.json", dir), "utf8"));

test("blend overlay: covered foods change by standard, others are untouched, and USDA comes back exactly", () => {
  const data = load();
  const before = new Map(data.foods.map((f) => [f.id, JSON.stringify(f.per100g)]));
  const lentils = data.foods.find((f) => f.id === "lentils")!;
  applySource(data, blend, "blend", "uk");
  assert.equal(lentils.per100g.energy, 92);          // CoFID's energy with UK factors
  assert.ok(lentils.blend);
  applySource(data, blend, "blend", "us");
  assert.equal(lentils.per100g.energy, 116);         // USDA's Atwater energy
  for (const f of data.foods) if (!blend.foods[f.id]) assert.equal(JSON.stringify(f.per100g), before.get(f.id), f.id);
  applySource(data, blend, "usda", "us");
  for (const f of data.foods) assert.equal(JSON.stringify(f.per100g), before.get(f.id), f.id);
  assert.equal(lentils.blend, null);
});

test("blend overlay: a missing value stays missing, and every value has its source", () => {
  const data = load();
  for (const std of ["uk", "us", "eu"]) {
    applySource(data, blend, "blend", std);
    for (const [id, b] of Object.entries(blend.foods)) {
      const f = data.foods.find((x) => x.id === id)!;
      for (const v of blendValues(blend, b, std)) {
        if (v.value === null) assert.ok(!(v.key in f.per100g), `${id} ${v.key}`);
        else assert.equal(f.per100g[v.key], v.value);
        if (v.definition === null && v.value !== null) assert.ok(blend.usdaOnly.includes(v.key), `${id} ${v.key}`);
        for (const c of v.caveats) assert.ok(blend.caveats[c], `${id} ${v.key} ${c}`);
        if (v.range) assert.ok(v.range[0] <= v.value! + 1e-9 && v.value! <= v.range[1] + 1e-9, `${id} ${v.key}`);
      }
    }
  }
});

// The default lists (common and wider selection) hold no raw food that people don't normally eat raw. Rules and
// reasons: pipeline/wider_selection.json ("rawRules"). Everything stays available in the "Everything" preset.
test("default lists leave out raw foods that aren't normally eaten raw", () => {
  const data = load();
  const rules = JSON.parse(readFileSync(new URL("../pipeline/wider_selection.json", import.meta.url), "utf8")).rawRules;
  const rawOk = new Set<string>(rules.veg.rawOk.map((g: string) => g.toLowerCase()));
  const isRaw = (n: string) => /\b(raw|uncooked)\b/i.test(n);
  // A special-purpose raw food kept on purpose in the common list: no cooked USDA record exists.
  const exceptions = new Set(["Mushrooms (UV-exposed, 'vitamin D' mushrooms)"]);
  const bad: string[] = [];
  for (const f of data.foods.filter((x) => x.common || x.wider)) {
    if (!isRaw(f.srcName) || exceptions.has(f.name)) continue;
    const g = f.group.toLowerCase();
    if (f.diet === "meat") bad.push(`${f.name}: raw meat or fish`);
    else if (f.cat === "dairy" && /^egg/.test(g)) bad.push(`${f.name}: raw egg`);
    else if (f.cat === "veg" && !rawOk.has(g)) bad.push(`${f.name}: raw vegetable not usually eaten raw`);
    else if (f.cat === "fruit" && /^rhubarb/.test(g)) bad.push(`${f.name}: raw rhubarb`);
    else if (f.cat === "nuts" && /^chestnuts/.test(g)) bad.push(`${f.name}: raw chestnuts`);
  }
  assert.deepEqual(bad, []);
  assert.ok(data.foods.some((f) => !f.common && !f.wider && f.cat === "dairy" && /raw/.test(f.srcName)), "raw eggs remain in the full list");
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
