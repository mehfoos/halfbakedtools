// Tests for profile matching, settings links and food selection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickProfile, groupRange, type Standard } from "./profiles.ts";
import { decode, encode, fresh } from "./state.ts";
import { isOn, setOn, type PlannerFood } from "./foods.ts";
import { analyse } from "./analysis.ts";

const load = (id: string) => JSON.parse(readFileSync(new URL(`../../../../data/targets/${id}.json`, import.meta.url), "utf8")) as Standard;
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
