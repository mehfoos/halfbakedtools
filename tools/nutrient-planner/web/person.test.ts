// Tests for the steps between the settings and the optimiser or charts:
// who the person is (person.ts), what the optimiser is given (plan-input.ts), and the chart axes (chart-axes.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Standard } from "./profiles.ts";
import type { NutrientDef } from "./solver.ts";
import { avoidReasons, type PlannerFood } from "./foods.ts";
import { analyse } from "./analysis.ts";
import { fresh } from "./state.ts";
import { comparisonTargets, otherStandards, personFrom, targetsFor } from "./person.ts";
import { planInput } from "./plan-input.ts";
import { detailAxes, overviewAxes } from "./chart-axes.ts";

const load = (id: string) => JSON.parse(readFileSync(new URL(`../data/targets/${id}.json`, import.meta.url), "utf8")) as Standard;
const standards = [load("uk"), load("us"), load("eu")];
const nutrients: NutrientDef[] = JSON.parse(readFileSync(new URL("../data/foods/foods.json", import.meta.url), "utf8")).nutrients;
const fmt = (v: number | undefined) => String(v === undefined ? "–" : Math.round(v));

const food = (id: string, usdaName: string, extra: Partial<PlannerFood> = {}) => ({
  id, name: id, usdaName, label: id, cat: "c", group: "g", diet: "vegan", common: true,
  maxGrams: 300, step: 10, unit: "g", unitGrams: 1, per100g: { energy: 100, protein: 5, vitaminD: 1 }, ...extra,
}) as unknown as PlannerFood;

test("person: the recommended calorie range is used until the person sets their own", () => {
  const p = personFrom(fresh(), standards);
  assert.equal(p.standard.id, "uk");
  assert.deepEqual(p.band, { low: p.energy.low, high: p.energy.high });
  assert.equal(p.customEnergy, false);
  assert.equal(p.weight, p.defaultWeight);

  const mine = personFrom({ ...fresh(), energyLow: 1500, weight: 80 }, standards);
  assert.deepEqual(mine.band, { low: 1500, high: p.energy.high });
  assert.equal(mine.midKcal, (1500 + p.energy.high) / 2);
  assert.equal(mine.customEnergy, true);
  assert.equal(mine.weight, 80);
});

test("person: pregnancy is ignored for males, and an unknown standard falls back to the first", () => {
  assert.equal(personFrom({ ...fresh(), sex: "male", life: "pregnancy" }, standards).life, "none");
  assert.equal(personFrom({ ...fresh(), sex: "female", life: "pregnancy" }, standards).life, "pregnancy");
  assert.equal(personFrom({ ...fresh(), standard: "nowhere" }, standards).standard.id, "uk");
});

test("targets: custom values apply only when asked for, and the official ones stay available", () => {
  const s = { ...fresh(), overrides: { protein: { min: 90 } } };
  const p = personFrom(s, standards);
  const protein = (withOverrides: boolean) => targetsFor(p, s, nutrients, withOverrides).find((t) => t.key === "protein")!;
  assert.equal(protein(true).min, 90);
  assert.equal(protein(true).custom, true);
  assert.notEqual(protein(false).min, 90);
  assert.ok(!protein(false).custom);
});

test("comparison: the other two standards, with energy-tied targets worked out for the day's calories", () => {
  const s = { ...fresh(), standard: "us" };
  const p = personFrom(s, standards);
  assert.deepEqual(otherStandards(p, standards).map((x) => x.id), ["uk", "eu"]);
  const at = (kcal: number) => comparisonTargets(p, s, standards, nutrients, kcal).find((c) => c.id === "uk")!.targets.get("fat")!.max!;
  assert.ok(Math.abs(at(3000) / at(1500) - 2) < 1e-9);      // UK fat limit is a share of energy
  assert.equal(comparisonTargets(p, s, standards, nutrients)[0].targets.get("fat")!.max, at(p.midKcal));
});

test("plan input: foods to avoid are left out and reported once each", () => {
  const s = { ...fresh(), life: "pregnancy" as const };
  const p = personFrom(s, standards);
  const foods = [food("oats", "Oats"), food("liver", "Beef, liver, cooked"), food("pate", "Pate, chicken liver, canned")];
  const { input, avoided } = planInput(foods, targetsFor(p, s, nutrients, true), s, p);
  assert.deepEqual(input.foods.map((f) => f.id), ["oats"]);
  assert.equal(avoided.length, 1);
  assert.equal(avoided[0].ref, "nhs-meat");
  assert.deepEqual(avoidReasons(foods, { age: 30, life: "none" }), []);
});

test("plan input: vitamin D is planned for only when asked; calorie range and options come from the settings", () => {
  const foods = [food("a", "A"), food("b", "B", { common: false })];
  const build = (vitaminD: boolean) => {
    const s = { ...fresh(), vitaminD, n: 4, options: 2 };
    const p = personFrom(s, standards);
    return { p, ...planInput(foods, targetsFor(p, s, nutrients, true), s, p) };
  };
  const off = build(false), on = build(true);
  assert.ok(!off.input.targets.some((t) => t.key === "vitaminD"));
  assert.ok(on.input.targets.some((t) => t.key === "vitaminD"));
  assert.equal(off.input.energyLow, off.p.band.low);
  assert.equal(off.input.energyHigh, off.p.band.high);
  assert.equal(off.input.maxIngredients, 4);
  assert.equal(off.input.options, 2);
  assert.deepEqual(off.input.quickFoods!.map((f) => f.id), ["a"]);          // the fallback search uses common foods only
  assert.equal(off.input.foods[0].penalty, 0);                               // common foods carry no penalty
  assert.ok(off.input.foods[1].penalty! > 0);
});

test("plan input: a child's portion limits and the oily fish cap are scaled down; an adult's are not", () => {
  const foods = [food("a", "A")];
  const build = (age: number) => {
    const s = { ...fresh(), age };
    const p = personFrom(s, standards);
    return { p, ...planInput(foods, targetsFor(p, s, nutrients, true), s, p) };
  };
  const adult = build(35), child = build(4);
  assert.equal(adult.input.foods[0].maxGrams, 300);
  assert.equal(adult.input.groupCaps!["oily-fish"], 140);
  assert.ok(child.p.midKcal < 2000);
  assert.ok(child.input.foods[0].maxGrams < 300);
  assert.ok(child.input.groupCaps!["oily-fish"] < 140 && child.input.groupCaps!["oily-fish"] >= 10);
});

test("chart axes: each nutrient with a minimum is a share of target, with the other standards alongside", () => {
  const s = fresh();
  const p = personFrom(s, standards);
  const targets = targetsFor(p, s, nutrients, true);
  const meta = new Map(nutrients.map((n) => [n.key, { label: n.label, unit: n.unit }]));
  const iron = targets.find((t) => t.key === "iron")!;
  const rep = analyse({ energy: p.midKcal, iron: iron.min! / 2, fat: 10, salt: 3 }, targets, new Set(), meta);
  const cmp = comparisonTargets(p, s, standards, nutrients, rep.energy);

  const axis = detailAxes(rep, ["iron"], cmp, fmt)[0];
  assert.equal(Math.round(axis.pct), 50);
  assert.equal(axis.ok, false);
  const usIron = cmp.find((c) => c.id === "us")!.targets.get("iron")!.min!;
  assert.ok(Math.abs(axis.others!.us - (usIron / iron.min!) * 100) < 1e-9);

  const overview = overviewAxes(rep, p, true, cmp, fmt);
  assert.equal(overview[0].label, "Energy");
  assert.equal(Math.round(overview[0].pct), 100);
  assert.equal(overview[0].ok, true);
  assert.ok(overview.some((a) => a.label === "Salt" && a.kind === "max"));
  // Where the person has no target of their own, adults see the label's reference intake; children see nothing.
  const refs = (adult: boolean) => overviewAxes(rep, p, adult, cmp, fmt).filter((a) => a.kind === "ref").length;
  assert.ok(refs(true) > 0);
  assert.equal(refs(false), 0);
});
