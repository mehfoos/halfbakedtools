// The beta blended source is an overlay: it changes only the foods it covers, follows the chosen standard, never
// turns a missing value into zero, and switching back to USDA restores the USDA values exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applySource, blendValues, unpack, type BlendData } from "./foods.ts";

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
