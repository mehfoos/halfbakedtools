// Tests for the optimiser. The foods below are SYNTHETIC test fixtures with
// made-up values chosen so the correct answer is obvious; they are not real
// nutrient data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { plan, resolveTargets, splitAssessable, buildLp, describeAmount, type Food } from "./solver.ts";
import { makeSolver } from "./highsSolver.ts";

const require = createRequire(import.meta.url);
const highs = await require("highs")();
const solve = makeSolver(highs);

const food = (id: string, per100g: Record<string, number>, extra: Partial<Food> = {}): Food => ({
  id, name: id, group: "test", diet: "vegan", unit: "g", unitGrams: 1, step: 10, maxGrams: 500, per100g, ...extra,
});
// Fixture: A is a "protein food", B a "vitamin C food", C is filler, D is salty protein.
const A = food("A", { energy: 100, protein: 20, vitaminC: 0, salt: 0.1 });
const B = food("B", { energy: 50, protein: 1, vitaminC: 50, salt: 0 });
const C = food("C", { energy: 200, protein: 0, vitaminC: 0, salt: 0 });
const D = food("D", { energy: 100, protein: 25, vitaminC: 0, salt: 5 });
const nutrients = [
  { key: "energy", label: "Energy", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "vitaminC", label: "Vitamin C", unit: "mg" },
  { key: "salt", label: "Salt", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "lysine", label: "Lysine", unit: "g" },
];
const keys = nutrients.map((n) => n.key);
const targets = [
  { key: "protein", label: "Protein", unit: "g", min: 50 },
  { key: "vitaminC", label: "Vitamin C", unit: "mg", min: 40 },
  { key: "salt", label: "Salt", unit: "g", max: 6 },
];

test("resolveTargets converts energy percentages and per-kg values", () => {
  const r = resolveTargets(
    { fat: { max: { value: 35, basis: "pctEnergy", source: "x" } }, lysine: { min: { value: 30, basis: "perKg", source: "x" } } },
    nutrients, 2000, 70, "uk",
  );
  assert.equal(Math.round(r.find((t) => t.key === "fat")!.max!), 78); // 2000*0.35/9
  assert.equal(r.find((t) => t.key === "lysine")!.min, 2.1);         // 30 mg/kg * 70 kg = 2.1 g
});

test("overrides replace official values and are flagged custom", () => {
  const r = resolveTargets({ protein: { min: { value: 50, basis: "abs", source: "x" } } }, nutrients, 2000, 70, "uk",
    { protein: { min: 80 } });
  assert.equal(r[0].min, 80);
  assert.equal(r[0].custom, true);
});

test("finds a plan meeting every target with two ingredients", async () => {
  const plans = await plan({ foods: [A, B, C], targets, energyLow: 300, energyHigh: 1500, maxIngredients: 2, options: 1 }, solve, keys);
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0].items.map((i) => i.id).sort(), ["A", "B"]);
  assert.ok(plans[0].score < 1e-9, `score ${plans[0].score}`);
  assert.ok(plans[0].totals.protein >= 50 && plans[0].totals.vitaminC >= 40);
});

test("respects the ingredient cap (one ingredient cannot meet both targets)", async () => {
  const plans = await plan({ foods: [A, B, C], targets, energyLow: 0, energyHigh: 3000, maxIngredients: 1, options: 1 }, solve, keys);
  assert.equal(plans[0].items.length, 1);
  assert.ok(plans[0].score > 0);
});

test("never exceeds an upper limit (salty D is capped)", async () => {
  const plans = await plan({ foods: [D, B], targets, energyLow: 0, energyHigh: 3000, maxIngredients: 2, options: 1 }, solve, keys);
  assert.ok(plans[0].totals.salt <= 6 + 1e-9, `salt ${plans[0].totals.salt}`);
});

test("returns distinct options", async () => {
  const plans = await plan({ foods: [A, B, C, D], targets, energyLow: 300, energyHigh: 1500, maxIngredients: 2, options: 3 }, solve, keys);
  const sets = plans.map((p) => p.items.map((i) => i.id).sort().join(","));
  assert.equal(new Set(sets).size, sets.length);
  assert.ok(plans.length >= 2);
});

test("returns no plan when the calorie band is impossible", async () => {
  const plans = await plan({ foods: [B], targets, energyLow: 5000, energyHigh: 6000, maxIngredients: 1, options: 1 }, solve, keys);
  assert.equal(plans.length, 0);
});

test("amounts follow each food's step and unit", async () => {
  const egg = food("egg", { energy: 143, protein: 12.6, vitaminC: 0 }, { unit: "egg", unitGrams: 50, step: 0.5, maxGrams: 200 });
  const plans = await plan({ foods: [egg, B], targets, energyLow: 0, energyHigh: 3000, maxIngredients: 2, options: 1 }, solve, keys);
  const e = plans[0].items.find((i) => i.id === "egg")!;
  assert.equal(e.grams % 25, 0);
  assert.match(describeAmount(egg, 75), /^1\.5 eggs \(75 g\)$/);
});

test("nutrients missing from most foods are reported, not optimised", () => {
  const t = [{ key: "iodine", label: "Iodine", unit: "µg", min: 140 }, ...targets];
  const { assessable, notAssessed } = splitAssessable(t, [A, B, C]);
  assert.deepEqual(notAssessed.map((x) => x.key), ["iodine"]);
  assert.equal(assessable.length, 3);
});

test("LP text has no exponent notation", () => {
  const tiny = food("T", { energy: 1, protein: 0.0000001, vitaminC: 0 });
  assert.doesNotMatch(buildLp({ foods: [tiny, A], targets, energyLow: 0, energyHigh: 10, maxIngredients: 1, options: 1 }), /\de[-+]\d/);
});
