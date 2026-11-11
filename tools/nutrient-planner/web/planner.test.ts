// Tests for profile matching, settings links and food selection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickProfile, groupRange, energyFor, type Standard } from "./profiles.ts";
import { decode, encode, fresh } from "./state.ts";
import { isOn, setOn, type PlannerFood } from "./foods.ts";
import { analyse } from "./analysis.ts";

const load = (id: string) => JSON.parse(readFileSync(new URL(`../data/targets/${id}.json`, import.meta.url), "utf8")) as Standard;
const uk = load("uk"), us = load("us");

test("age bands parse", () => {
  assert.deepEqual(groupRange("19-50"), [19, 50]);
  assert.deepEqual(groupRange("75+"), [75, 200]);
  assert.deepEqual(groupRange("1"), [1, 1]);
});

test("UK profile matches sex and age", () => {
  assert.equal(pickProfile(uk, "female", 35, "none").profile.id, "female-19-50");
  assert.equal(pickProfile(uk, "female", 50.5, "none").profile.id, "female-19-50");
  assert.equal(pickProfile(uk, "male", 51, "none").profile.id, "male-51-64");
  assert.equal(pickProfile(uk, "male", 80, "none").profile.id, "male-75+");
  assert.equal(pickProfile(uk, "female", 2, "none").profile.id, "female-2-3");
});

test("US profile: children are sex-neutral; pregnancy uses its own values", () => {
  assert.equal(pickProfile(us, "male", 5, "none").profile.id, "child-4-8");
  assert.equal(pickProfile(us, "female", 30, "pregnancy").profile.id, "pregnancy-19-30");
  const late = pickProfile(us, "female", 45, "lactation");
  assert.equal(late.profile.id, "lactation-31-50");
  const old = pickProfile(us, "female", 55, "pregnancy");
  assert.equal(old.profile.id, "pregnancy-31-50");
  assert.ok(old.note);
});

test("UK has no pregnancy values yet, so standard values are used with a note", () => {
  const p = pickProfile(uk, "female", 30, "pregnancy");
  assert.equal(p.profile.id, "female-19-50");
  assert.match(p.note ?? "", /aren't included/);
});

test("settings survive a round trip through the page address", () => {
  const s = fresh();
  Object.assign(s, { sex: "male", age: 44, weight: 82, diet: "vegetarian", standard: "us", n: 4, base: "all", toggled: ["lentils", "u12345"],
    overrides: { protein: { min: 90 } }, mode: "build", builder: [{ id: "egg", grams: 100 }, { id: "u170567", grams: 25.5 }] });
  assert.deepEqual(decode(encode(s)), s);
});

test("damaged or hostile links are ignored safely", () => {
  const s = decode("age=999&n=-4&x=<script>.ok-id&b=bad~x_egg~50&t=!!!");
  assert.equal(s.age, 110);
  assert.equal(s.n, 1);
  assert.deepEqual(s.toggled, ["ok-id"]);
  assert.deepEqual(s.builder, [{ id: "egg", grams: 50 }]);
  assert.deepEqual(s.overrides, {});
});

test("food selection: preset plus toggles", () => {
  const common = { id: "a", common: true } as PlannerFood, extra = { id: "b", common: false } as PlannerFood;
  const t = new Set<string>();
  assert.equal(isOn(common, "common", t), true);
  assert.equal(isOn(extra, "common", t), false);
  setOn(extra, true, "common", t);
  assert.equal(isOn(extra, "common", t), true);
  setOn(extra, false, "common", t);
  assert.equal(t.size, 0);
  assert.equal(isOn(common, "none", t), false);
  assert.equal(isOn(extra, "all", t), true);
});

test("analysis marks shortfalls, limits and missing data", () => {
  const meta = new Map([["protein", { label: "Protein", unit: "g" }], ["salt", { label: "Salt", unit: "g" }], ["iodine", { label: "Iodine", unit: "µg" }]]);
  const r = analyse({ protein: 30, salt: 7, iodine: 0 },
    [{ key: "protein", label: "Protein", unit: "g", min: 50 }, { key: "salt", label: "Salt", unit: "g", max: 6 }, { key: "iodine", label: "Iodine", unit: "µg", min: 140 }],
    new Set(["iodine"]), meta);
  assert.equal(r.byKey.get("protein")!.status, "low");
  assert.equal(r.byKey.get("salt")!.status, "over");
  assert.equal(r.byKey.get("iodine")!.status, "unassessed");
  assert.equal(r.minCount, 1);
});

test("diet filter: no restriction, vegetarian, vegan", async () => {
  const { dietOk } = await import("./foods.ts");
  const meat = { diet: "meat" } as PlannerFood, veg = { diet: "vegetarian" } as PlannerFood, vegan = { diet: "vegan" } as PlannerFood;
  assert.deepEqual([meat, veg, vegan].map((f) => dietOk(f, "none")), [true, true, true]);
  assert.deepEqual([meat, veg, vegan].map((f) => dietOk(f, "vegetarian")), [false, true, true]);
  assert.deepEqual([meat, veg, vegan].map((f) => dietOk(f, "vegan")), [false, false, true]);
  assert.equal(fresh().diet, "none");
  assert.equal(decode("d=veg").diet, "vegetarian");
});

test("EU targets: per-MJ, per-kg and energy-percentage values convert correctly", async () => {
  const { resolveTargets } = await import("./solver.ts");
  const eu = load("eu");
  const p = pickProfile(eu, "male", 30, "none").profile;
  assert.equal(p.id, "male-25-50");
  const nutrients = ["thiamin", "protein", "ala", "epaDha", "iron"].map((key) => ({ key, label: key, unit: "" }));
  const t = new Map(resolveTargets(p.targets, nutrients, 2500, 70, "eu").map((x) => [x.key, x]));
  assert.ok(Math.abs(t.get("thiamin")!.min! - 1.046) < 0.01);   // 0.1 mg/MJ x 10.46 MJ
  assert.ok(Math.abs(t.get("protein")!.min! - 58.1) < 0.1);     // 0.83 g/kg x 70 kg
  assert.ok(Math.abs(t.get("ala")!.min! - 1.389) < 0.01);       // 0.5% of 2500 kcal / 9
  assert.equal(t.get("epaDha")!.min, 250);
  assert.equal(pickProfile(eu, "female", 30, "pregnancy").profile.id, "pregnancy-18-50");
  assert.equal(pickProfile(eu, "female", 55, "none").profile.targets.iron.min!.value, 11);
});

test("EU exact age bands and per-year protein (EFSA 2017 Tables 3, 7, 9, 11)", async () => {
  const { resolveTargets } = await import("./solver.ts");
  const { refWeight } = await import("./profiles.ts");
  const eu = load("eu");
  const nutrients = ["iron", "vitaminE", "protein", "fat"].map((key) => ({ key, label: key, unit: "" }));
  const at = (sex: "male" | "female", age: number, w: number) =>
    new Map(resolveTargets(pickProfile(eu, sex, age, "none").profile.targets, nutrients, 2000, w, "eu", {}, age).map((x) => [x.key, x]));
  assert.equal(at("female", 11, 45).get("iron")!.min, 11);       // girls 7-11 y: 11 mg
  assert.equal(at("female", 12, 45).get("iron")!.min, 13);       // girls 12-14 y: 13 mg
  assert.equal(at("male", 10, 29).get("vitaminE")!.min, 13);     // 10-17 y: 13 mg (boys)
  assert.equal(at("male", 9, 29).get("vitaminE")!.min, 9);       // 3-9 y: 9 mg
  assert.ok(Math.abs(at("male", 1, 12.2).get("protein")!.min! - 1.14 * 12.2) < 0.01);
  assert.ok(Math.abs(at("male", 2, 12.2).get("fat")!.max! - (2000 * 0.40) / 9) < 0.01); // 35-40% at 1-3 y
  assert.equal(refWeight("female", 30), 58.5);
  assert.equal(refWeight("male", 16), 64.1);
});

test("UK fibre: 15 g at age 4, 20 g at ages 5-6 (PHE 2016 Table 1)", () => {
  assert.equal(pickProfile(uk, "male", 4, "none").profile.targets.fibre.min!.value, 15);
  assert.equal(pickProfile(uk, "male", 5, "none").profile.targets.fibre.min!.value, 20);
});

test("US calories follow the Dietary Guidelines table for the exact age", () => {
  const e = (sex: "male" | "female", age: number) => energyFor(pickProfile(us, sex, age, "none").profile, age, sex).kcal;
  assert.equal(e("male", 20), 2600);   // Table A2-2, 19-20, sedentary
  assert.equal(e("male", 25), 2400);
  assert.equal(e("female", 30), 1800);
  assert.equal(e("female", 75), 1600);
  assert.equal(e("male", 6), 1400);
  assert.equal(e("female", 6), 1200);
  assert.equal(e("female", 1), 900);   // Table A2-1, 800-1,000
});

test("every source the targets cite is in this tool's reference list", () => {
  const reg = JSON.parse(readFileSync(new URL("../references.json", import.meta.url), "utf8"));
  const ids = new Set(reg.sources.map((s: { id: string }) => s.id));
  for (const std of ["uk", "us", "eu"]) {
    const d = load(std);
    for (const s of d.sources) assert.ok(ids.has(s.id), `${std} cites unregistered ${s.id}`);
    for (const p of d.profiles) for (const spec of Object.values(p.targets)) for (const b of [spec.min, spec.max])
      if (b) assert.ok(ids.has(b.source), `${std} bound cites unregistered ${b.source}`);
  }
});

test("amino acid targets are the WHO safe level (average requirement + 24%)", () => {
  const t = pickProfile(uk, "female", 40, "none").profile.targets;
  assert.equal(t.lysine.min!.value, 37.2);
  assert.equal(t.leucine.min!.value, 48.36);
});
