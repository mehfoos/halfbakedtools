// Tests for profile matching, settings links and food selection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickProfile, groupRange, energyFor, type Standard } from "./profiles.ts";
import { resolveTargets } from "./solver.ts";
import { avoidReason, portionFactor, scaledMax } from "./foods.ts";
import { decode, encode, fresh, MAX_OPTIONS } from "./state.ts";
import { isOn, setOn, unpack, familiarityPenalty, FAMILIARITY_BUDGET, type PlannerFood } from "./foods.ts";
import { analyse } from "./analysis.ts";

const load = (id: string) => JSON.parse(readFileSync(new URL(`../data/targets/${id}.json`, import.meta.url), "utf8")) as Standard;
const eu = load("eu");
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
  assert.equal(decode("o=100000").options, MAX_OPTIONS, "a link can't ask for an endless search");
  assert.equal(decode("o=12").options, 12, "more than five options are allowed");
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

test("the default food preset is Common foods; the page address records any other", () => {
  assert.equal(fresh().base, "common");
  assert.equal(decode(encode(fresh())).base, "common");
  assert.equal(decode("sex=f&age=35").base, "common");
  assert.equal(decode("sex=f&age=35&f=all").base, "all");
  assert.equal(decode(encode({ ...fresh(), base: "all" })).base, "all");
  assert.equal(decode("f=wider").base, "common");                   // the old preset is gone
});

test("EU targets: per-MJ, per-kg and energy-percentage values convert correctly", async () => {

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

test("carbohydrate excludes fibre (USDA's by-difference value minus fibre)", () => {
  const raw = JSON.parse(readFileSync(new URL("../data/foods/foods.json", import.meta.url), "utf8"));
  const c = raw.keys.indexOf("carbohydrate"), f = raw.keys.indexOf("fibre");
  const lentils = raw.foods.find((x: { id: string }) => x.id === "lentils");
  assert.ok(Math.abs(lentils.v[c] + lentils.v[f] - 20.13) < 0.01);   // USDA: 20.13 g by difference, 7.9 g fibre
  assert.ok(raw.foods.every((x: { v: (number | null)[] }) => x.v[c] === null || x.v[c]! >= 0));
});

test("US saturated fat: under 10% of calories from age 2; EU sets no number", () => {
  const sat = (std: Standard, age: number) => {
    const p = pickProfile(std, "female", age, "none").profile;
    return resolveTargets(p.targets, [{ key: "satfat", label: "Saturated fat", unit: "g" }], 1800, 60, std.id, {}, age).find((t) => t.key === "satfat");
  };
  assert.ok(Math.abs(sat(us, 35)!.max! - 20) < 1e-9);          // 10% of 1800 kcal / 9 kcal per g
  assert.ok(Math.abs(sat(us, 35)!.maxPerKcal! - 0.1 / 9) < 1e-12);
  assert.ok(sat(us, 2)?.max !== undefined);
  assert.equal(sat(us, 1), undefined);                          // no limit before age 2
  assert.equal(sat(eu, 35), undefined);
});

test("EU omega-3: 100 mg DHA at age 1, 250 mg EPA+DHA from age 2", () => {
  const defs = [{ key: "epaDha", label: "EPA+DHA", unit: "mg" }, { key: "dha", label: "DHA", unit: "g" }];
  const at = (age: number) => new Map(resolveTargets(pickProfile(eu, "female", age, "none").profile.targets, defs, 1000, 12, "eu", {}, age).map((t) => [t.key, t.min]));
  assert.deepEqual([...at(1)], [["dha", 0.1]]);
  assert.deepEqual([...at(2)], [["epaDha", 250]]);
  assert.deepEqual([...at(30)], [["epaDha", 250]]);
});

test("every food note's reference is in the reference list", () => {
  const ids = new Set(JSON.parse(readFileSync(new URL("../references.json", import.meta.url), "utf8")).sources.map((s: { id: string }) => s.id));
  const raw = JSON.parse(readFileSync(new URL("../data/foods/foods.json", import.meta.url), "utf8"));
  const refs = raw.foods.filter((f: { noteRef?: string }) => f.noteRef).map((f: { noteRef: string }) => f.noteRef);
  assert.ok(refs.length >= 6);
  for (const r of refs) assert.ok(ids.has(r), `unknown reference ${r}`);
});

test("oily fish share one 140 g daily cap; tuna and white fish don't count", () => {
  const raw = JSON.parse(readFileSync(new URL("../data/foods/foods.json", import.meta.url), "utf8"));
  const by = (id: string) => raw.foods.find((f: { id: string }) => f.id === id);
  for (const id of ["salmon", "tinned-salmon", "sardines", "mackerel"]) { assert.equal(by(id).capGroup, "oily-fish"); assert.equal(by(id).maxGrams, 140); }
  for (const id of ["tuna", "cod", "haddock", "prawns"]) assert.equal(by(id).capGroup ?? null, null);
  const oily = raw.foods.filter((f: { capGroup?: string }) => f.capGroup === "oily-fish");
  assert.ok(oily.every((f: { cat: string; maxGrams: number }) => f.cat === "fish" && f.maxGrams <= 140));
});

test("EU calories come from EFSA Table 1 for the exact age and sex", () => {
  const e = (sex: "male" | "female", age: number, life: "none" | "pregnancy" = "none") => energyFor(pickProfile(eu, sex, age, life).profile, age, sex).kcal;
  assert.equal(e("female", 35), 1815);   // 7.6 MJ x 238.83, PAL 1.4
  assert.equal(e("male", 25), 2341);     // 9.8 MJ
  assert.equal(e("female", 65), 1624);   // 6.8 MJ
  assert.equal(e("male", 85), 1982);     // 8.3 MJ (70-79 value; none given for 80+)
  assert.equal(e("female", 1), 716);     // 3.0 MJ
  assert.equal(e("male", 12), 2173);     // 9.1 MJ, PAL 1.6 (lowest given for ages 10-17)
  assert.equal(e("female", 30, "pregnancy"), 1815);
});

test("foods the NHS says to avoid: liver in pregnancy; swordfish in pregnancy and under 16", () => {
  const liver = { srcName: "Beef, variety meats and by-products, liver, cooked, braised" };
  const sword = { srcName: "Fish, swordfish, cooked, dry heat" };
  const salmon = { srcName: "Fish, salmon, Atlantic, farmed, cooked, dry heat" };
  assert.equal(avoidReason(liver, { age: 30, life: "pregnancy" })?.ref, "nhs-meat");
  assert.equal(avoidReason(liver, { age: 30, life: "none" }), null);
  assert.equal(avoidReason(liver, { age: 30, life: "lactation" }), null);
  assert.equal(avoidReason(sword, { age: 30, life: "pregnancy" })?.ref, "nhs-fish");
  assert.equal(avoidReason(sword, { age: 15, life: "none" })?.ref, "nhs-fish");
  assert.equal(avoidReason(sword, { age: 16, life: "none" }), null);
  assert.equal(avoidReason(salmon, { age: 5, life: "none" }), null);
});

test("children's portion limits are scaled by calories; adults' are not", () => {
  assert.equal(portionFactor(35, 1500), 1);
  assert.equal(portionFactor(5, 1400), 0.7);
  assert.equal(portionFactor(16, 2600), 1);
  assert.equal(scaledMax({ maxGrams: 300, step: 10, unitGrams: 1 }, 0.7), 210);
  assert.equal(scaledMax({ maxGrams: 200, step: 0.5, unitGrams: 50 }, 0.33), 50);   // eggs: 200 g x 0.33 = 66 g -> 1 egg
  assert.equal(scaledMax({ maxGrams: 5, step: 5, unitGrams: 1 }, 0.3), 5);          // never below one step
});

test("US-fortified products are flagged and left out of the Everything preset; dry staples are labelled", () => {
  const data = unpack(JSON.parse(readFileSync(new URL("../data/foods/foods.json", import.meta.url), "utf8")));
  const fort = data.foods.filter((f) => f.fortified);
  assert.ok(fort.length > 50 && fort.every((f) => !f.common));
  assert.ok(fort.every((f) => !isOn(f, "all", new Set()) && isOn(f, "all", new Set([f.id]))));
  assert.ok(data.foods.filter((f) => !f.fortified).every((f) => isOn(f, "all", new Set())));
  assert.ok(fort.some((f) => /Peanut butter.*vitamin and mineral fortified/i.test(f.srcName)));
  const soy = data.foods.find((f) => f.srcName === "Soybeans, mature seeds, raw")!;
  assert.match(soy.name, /dry \(uncooked weight\)/);
  assert.equal(data.foods.find((f) => /^Bread, crumbs, dry, grated, plain/.test(f.srcName))!.maxGrams, 60);
  assert.equal(data.foods.find((f) => /coconut cream, raw/.test(f.srcName))!.diet, "vegan");
});

test("EU sodium is EFSA's own value (2019, Table 12), not the borrowed US one", () => {
  const na = (age: number, life: "none" | "pregnancy" = "none") => pickProfile(eu, "female", age, life).profile.targets.sodium.max!;
  assert.deepEqual([na(2).value, na(5).value, na(8).value, na(12).value, na(16).value, na(40).value, na(30, "pregnancy").value], [1100, 1300, 1700, 2000, 2000, 2000, 2000]);
  assert.equal(na(40).source, "efsa-sodium-2019");
});

test("a target set aside (vitamin D) is reported separately and not counted as met or missed", () => {
  const targets = [{ key: "protein", label: "Protein", unit: "g", min: 50 }, { key: "vitaminD", label: "Vitamin D", unit: "µg", min: 10 }];
  const m = new Map([["protein", { label: "Protein", unit: "g" }], ["vitaminD", { label: "Vitamin D", unit: "µg" }]]);
  const counted = analyse({ protein: 60, vitaminD: 2 }, targets, new Set(), m);
  assert.deepEqual([counted.metCount, counted.minCount, counted.shortfalls.map((r) => r.key), counted.aside.length], [1, 2, ["vitaminD"], 0]);
  const aside = analyse({ protein: 60, vitaminD: 2 }, targets, new Set(), m, new Set(["vitaminD"]));
  assert.deepEqual([aside.metCount, aside.minCount, aside.shortfalls.length, aside.aside.map((r) => r.key)], [1, 1, 0, ["vitaminD"]]);
  assert.equal(aside.byKey.get("vitaminD")!.status, "low");   // still shown with its real status in tables and charts
});

test("every table has a Common list: in 2+ independent tables, none US-fortified, a subset of its basic foods", () => {
  const tables = JSON.parse(readFileSync(new URL("../data/foods/tables.json", import.meta.url), "utf8")).tables;
  for (const t of tables) {
    const data = unpack(JSON.parse(readFileSync(new URL(`../data/foods/${t.basic}`, import.meta.url), "utf8")));
    const common = data.foods.filter((f) => isOn(f, "common", new Set()));
    assert.ok(common.length >= 150 && common.length <= 1200, `${t.id}: ${common.length} common foods`);
    assert.ok(common.every((f) => !f.fortified || f.common), t.id);
    assert.ok(!common.some((f) => /\bliver\b/i.test(f.srcName)), t.id);
    assert.ok(data.foods.filter((f) => isOn(f, "all", new Set())).length > common.length, t.id);
  }
});

test("the preference for familiar foods can cost at most 1% of one target per plan", () => {
  const f = (o: Partial<PlannerFood>) => ({ common: false, ...o }) as PlannerFood;
  for (const n of [1, 6, 15]) {
    assert.equal(familiarityPenalty(f({ common: true }), n), 0);
    assert.ok(familiarityPenalty(f({ common: true }), n) < familiarityPenalty(f({}), n));
    assert.ok(n * familiarityPenalty(f({}), n) <= FAMILIARITY_BUDGET + 1e-12);
  }
});

test("UK CoFID food file: same layout as the USDA file, no zero-filled codes, diet tags safe", () => {
  const usda = JSON.parse(readFileSync(new URL("../data/foods/foods.json", import.meta.url), "utf8"));
  const raw = JSON.parse(readFileSync(new URL("../data/foods/foods-cofid.json", import.meta.url), "utf8"));
  assert.deepEqual(raw.keys, usda.keys, "same nutrient keys in the same order");
  assert.ok(raw.foods.every((f: any) => f.v.length === raw.keys.length && f.src?.table === "cofid" && f.srcName));
  const ids = raw.foods.map((f: any) => f.id);
  assert.equal(new Set(ids).size, ids.length, "food ids are unique");
  // A CoFID code ("Tr", "N") is shown as a label and the value stays missing: never zero.
  const iodine = raw.keys.indexOf("iodine");
  for (const f of raw.foods) {
    if (f.q) for (const k of Object.keys(f.q)) {
      if (f.q[k] === "trace" || f.q[k] === "present, amount not known") assert.equal(f.v[raw.keys.indexOf(k)], null, `${f.name} ${k}`);
    }
  }
  // Values are CoFID's own: semi-skimmed milk iodine 30 µg/100 g (CoFID 12-313).
  assert.equal(raw.foods.find((f: any) => f.id === "milk").v[iodine], 30);
  const meat = /\b(beef|pork|chicken|bacon|ham|meat|fish|lard|dripping|anchov\w*|gelatin|cod liver)\b/i;
  for (const f of raw.foods) if (f.diet !== "meat") assert.ok(!meat.test(f.srcName.replace(/eggs, chicken/i, "")), `${f.srcName} is tagged ${f.diet}`);
});

test("links keep the food table and table food ids", () => {
  const s = fresh();
  s.source = "cofid";
  s.builder = [{ id: "cofid:12-313", grams: 200 }, { id: "milk", grams: 150 }];
  s.toggled = ["cofid:13-661"];
  const back = decode(encode(s));
  assert.equal(back.source, "cofid");
  assert.deepEqual(back.builder, s.builder);
  assert.deepEqual(back.toggled, s.toggled);
  assert.equal(decode(encode(fresh())).source, "usda");
  assert.equal(decode("src=blend").source, "blend");
  assert.equal(decode("src=%3Cscript%3E").source, "usda", "a damaged table name is ignored");
});
