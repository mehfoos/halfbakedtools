// Missing food data is never turned into zero (docs/PRINCIPLES.md, principle 2): a day's totals count the
// foods that have no value, targets that can't be confirmed say so, and a nutrient with no data at all is "NA".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyse, gapsOf, gapWords, tally, totals } from "./analysis.ts";
import { detailAxes, noDataLabels } from "./chart-axes.ts";
import type { Food, ResolvedTarget } from "./solver.ts";

const food = (id: string, per100g: Record<string, number>) => ({ id, name: id, per100g }) as unknown as Food;
const meta = new Map([["iron", { label: "Iron", unit: "mg" }], ["sodium", { label: "Sodium", unit: "mg" }], ["zinc", { label: "Zinc", unit: "mg" }], ["energy", { label: "Energy", unit: "kcal" }]]);
const target = (key: string, b: { min?: number; max?: number }) => ({ key, label: key, unit: "", ...b }) as unknown as ResolvedTarget;
const day = (items: { food: Food; grams: number }[], targets: ResolvedTarget[]) =>
  analyse(totals(items, ["energy", "iron", "sodium", "zinc"]), targets, new Set(), meta, new Set(), gapsOf(items, ["energy", "iron", "sodium", "zinc"]));

const withData = { food: food("a", { energy: 100, iron: 2, sodium: 400 }), grams: 100 };
const noIron = { food: food("b", { energy: 100, sodium: 300 }), grams: 100 };
const noData = { food: food("c", { energy: 100 }), grams: 100 };

test("gaps: foods with no value are counted, and foods eaten in zero grams are ignored", () => {
  const g = gapsOf([withData, noIron, { ...noData, grams: 0 }], ["iron", "sodium"]);
  assert.deepEqual(g.iron, { missing: 1, of: 2 });
  assert.deepEqual(g.sodium, { missing: 0, of: 2 });
});

test("a minimum already reached by the known amounts is met, whatever the missing foods hold", () => {
  const r = day([withData, noIron], [target("iron", { min: 2 })]).byKey.get("iron")!;
  assert.equal(r.status, "met");
  assert.equal(r.missing, 1);
});

test("a minimum not reached is 'unclear', not 'short', when some foods have no data", () => {
  const rep = day([withData, noIron], [target("iron", { min: 10 })]);
  const r = rep.byKey.get("iron")!;
  assert.equal(r.status, "unclear");
  assert.equal(r.value, 2);                 // the known amount, not an estimate
  assert.equal(rep.shortfalls.length, 0);
  assert.deepEqual(rep.unclear.map((x) => x.key), ["iron"]);
  // with complete data the same amount is a real shortfall
  assert.equal(day([withData], [target("iron", { min: 10 })]).byKey.get("iron")!.status, "low");
});

test("a row with both a minimum and a limit stays 'met' for the minimum; only 'over' overrides it", () => {
  const both = (max: number) => day([withData, noData], [target("sodium", { min: 100, max })]).byKey.get("sodium")!;
  assert.equal(both(2000).status, "met");
  assert.equal(both(300).status, "over");
});

test("a limit is never 'within' when some foods have no data, but 'over' is certain once the known amounts pass it", () => {
  const limit = (max: number) => day([withData, noData], [target("sodium", { max })]).byKey.get("sodium")!;   // one food has no sodium value
  assert.equal(limit(2000).status, "unclear");
  assert.equal(limit(300).status, "over");   // the known 400 already exceeds it
  assert.equal(day([withData], [target("sodium", { max: 2000 })]).byKey.get("sodium")!.status, "within");
});

test("a nutrient no food in the day has data for is NA: no percentage, not counted as met or short", () => {
  const rep = day([withData, noData], [target("zinc", { min: 8 })]);
  const r = rep.byKey.get("zinc")!;
  assert.equal(r.status, "na");
  assert.equal(r.pctOfMin, undefined);
  assert.equal(rep.minCount, 0);
  assert.deepEqual(rep.noData.map((x) => x.key), ["zinc"]);
});

test("charts: NA has no axis, and a lower bound is drawn as 'at least'", () => {
  const rep = day([withData, noIron], [target("iron", { min: 10 }), target("zinc", { min: 8 }), target("sodium", { min: 100 })]);
  const axes = detailAxes(rep, ["iron", "zinc", "sodium"], [], (v) => String(v));
  assert.deepEqual(axes.map((a) => a.label), ["Iron", "Sodium"]);   // zinc: no data at all
  assert.equal(axes[0].atLeast, true);
  assert.match(axes[0].detail!, /at least 2 of 10 mg; 1 of 2 foods have no data/);
  assert.equal(axes[1].atLeast, false);
});

// The pipeline only works out a derived value when every part is known (build_foods.py, derive).
test("food data: derived values exist only where all their parts do", () => {
  const d = JSON.parse(readFileSync(new URL("../data/foods/foods.json", import.meta.url), "utf8"));
  const at = (k: string) => d.keys.indexOf(k);
  const has = (f: { v: (number | null)[] }, k: string) => f.v[at(k)] !== null;
  const parts: Record<string, string[]> = { epaDha: ["epa", "dha"], niacinNE: ["niacinPreformed", "tryptophan"], metCys: ["methionine", "cystine"], pheTyr: ["phenylalanine", "tyrosine"], salt: ["sodium"] };
  for (const [derived, needs] of Object.entries(parts)) {
    for (const f of d.foods) {
      assert.equal(has(f, derived), needs.every((k) => has(f, k)), `${f.name}: ${derived}`);
    }
  }
});

test("a nutrient with no data in the day gets no chart axis, and is named as not drawn rather than drawn at zero", () => {
  const rep = day([noData], [target("iron", { min: 8 }), target("sodium", { max: 2300 })]);
  assert.equal(detailAxes(rep, ["iron"], [], String as never).length, 0);
  assert.deepEqual(noDataLabels(rep, ["iron", "sodium"], true), ["Iron"]); // sodium has only a limit: no axis in the detail charts
  assert.deepEqual(noDataLabels(rep, ["iron", "sodium"]), ["Iron", "Sodium"]);
});

test("counts say how many minimums are met, how many can't be confirmed and how many are NA", () => {
  const rep = day([withData, noIron, noData], [target("iron", { min: 5 }), target("sodium", { min: 100 }), target("zinc", { min: 1 })]);
  const t = tally(["iron", "sodium", "zinc"].map((k) => rep.byKey.get(k)!));
  assert.deepEqual(t, { met: 1, of: 2, unclear: 1, na: 1 }); // sodium met; iron unclear (some foods lack it); zinc NA
  assert.equal(gapWords(t), "1 unclear · 1 NA");
  assert.equal(rep.minUnclear, 1);
  assert.equal(rep.minNa, 1);
});
