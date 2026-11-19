import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, EQUIPMENT, MUSCLES, PRESETS, assumedMuscles, type Equipment, type Muscle } from "./catalogue.ts";
import { TABLE_1A, TABLE_1A_MUSCLES } from "./pelland-table-1a.ts";
import { canDo, coverage, intensity, suggest, weights } from "./planner.ts";

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.equipment;
const base = { maxExercises: 4, count: 3, depth: 1, overlap: 0.5 };
const ids = new Set(EXERCISES.map((e) => e.id));
const muscles = new Set(MUSCLES.map((m) => m.id));
const equipment = new Set(EQUIPMENT.map((e) => e.id));

test("catalogue: ids unique, muscles and equipment known, no muscle both direct and indirect", () => {
  assert.equal(ids.size, EXERCISES.length);
  for (const e of EXERCISES) {
    for (const m of [...e.direct, ...e.indirect, ...(e.steadies ?? [])]) assert.ok(muscles.has(m), `${e.id}: ${m}`);
    for (const g of e.needs) { assert.ok(g.length); for (const q of g) assert.ok(equipment.has(q), `${e.id}: ${q}`); }
    assert.ok(!e.direct.some((m) => e.indirect.includes(m)), `${e.id}: overlap`);
    if (e.kind === "strength") assert.ok(e.direct.length, `${e.id}: no direct muscle`);
    if (e.kind === "aerobic") assert.ok(e.met?.length, `${e.id}: aerobic without a MET value`);
    for (const r of e.met ?? []) assert.match(r.code, /^\d{5}$/);
  }
});

test("every muscle can be trained directly with a full gym and with no equipment", () => {
  for (const p of ["gym", "body"]) {
    const have = new Set(preset(p));
    for (const m of muscles) {
      if (p === "body" && ["forearms", "biceps", "upperBack"].includes(m)) continue; // need something to hold or pull
      assert.ok(EXERCISES.some((e) => canDo(e, have) && e.direct.includes(m)), `${p}: ${m}`);
    }
  }
});

test("fractional sets: direct 1, indirect 0.5", () => {
  const bench = EXERCISES.find((e) => e.id === "benchPress")!;
  const w = weights(bench);
  assert.equal(w.get("chest"), 1);
  assert.equal(w.get("triceps"), 0.5);
  assert.equal(coverage([bench, bench]).triceps, 1);
});

test("equipment is respected", () => {
  const have = new Set<Equipment>(preset("machines"));
  const r = suggest({ ...base, targets: ["chest", "quads", "lats"], equipment: preset("machines") });
  assert.ok(r.suggestions.length);
  for (const s of r.suggestions) for (const e of s.exercises) assert.ok(canDo(e, have), e.id);
  const none = suggest({ ...base, targets: ["chest"], equipment: [] });
  assert.equal(none.suggestions.length, 0);
});

test("covers every target when it can, using as few exercises as possible", () => {
  const r = suggest({ ...base, targets: ["chest", "triceps", "quads", "aerobic"], equipment: preset("body") });
  const s = r.suggestions[0];
  assert.equal(s.score, 1);
  assert.deepEqual(s.missing, []);
  assert.equal(s.exercises.length, 4); // push-up and bench dip (chest and triceps), a leg exercise, an aerobic one
  assert.ok(s.exercises.some((e) => e.kind === "aerobic"));
});

test("reports what it can't cover within the exercise limit", () => {
  const r = suggest({ ...base, maxExercises: 1, targets: ["chest", "hamstrings"], equipment: preset("gym") });
  assert.ok(r.suggestions[0].score < 1);
  assert.equal(r.suggestions[0].missing.length, 1);
});

test("suggestions are varied and none repeats", () => {
  const r = suggest({ ...base, overlap: 0, targets: ["chest", "lats", "quads"], equipment: preset("gym") });
  assert.equal(r.suggestions.length, 3);
  const seen = new Set<string>();
  for (const s of r.suggestions) for (const e of s.exercises) { assert.ok(!seen.has(e.id), `${e.id} repeated`); seen.add(e.id); }
});

test("excluded exercises are never suggested", () => {
  const r = suggest({ ...base, targets: ["chest"], equipment: preset("body"), excluded: ["pushUp"] });
  for (const s of r.suggestions) assert.ok(!s.exercises.some((e) => e.id === "pushUp"));
});

test("WHO intensity bands", () => {
  assert.equal(intensity(2.9), "light");
  assert.equal(intensity(3), "moderate");
  assert.equal(intensity(5.9), "moderate");
  assert.equal(intensity(6), "vigorous");
});

test("whole body with a full gym is fast enough", () => {
  const t = performance.now();
  suggest({ ...base, maxExercises: 10, count: 5, targets: [...muscles, "aerobic"] as never, equipment: preset("gym") });
  assert.ok(performance.now() - t < 2000, `${Math.round(performance.now() - t)} ms`);
});

test("every classification credited to Pelland et al. matches Table 1A exactly (muscle, column and name)", () => {
  let n = 0;
  for (const e of EXERCISES) {
    for (const [m, name] of Object.entries(e.sources ?? {}) as [Muscle, string][]) {
      const row = TABLE_1A[m];
      assert.ok(row, `${e.id}: Table 1A has no row for ${m}`);
      const column = e.direct.includes(m) ? "direct" : e.indirect.includes(m) ? "indirect" : undefined;
      assert.ok(column, `${e.id}: ${m} is credited to the table but not counted`);
      assert.ok(row[column].includes(name), `${e.id}: "${name}" is not in Table 1A's ${column} list for ${m}`);
      n++;
    }
  }
  assert.ok(n >= 20, `only ${n} sourced classifications`);
});

test("muscles the table doesn't classify are always marked as the planner's assumption", () => {
  for (const e of EXERCISES) for (const m of Object.keys(e.sources ?? {}) as Muscle[]) assert.ok(TABLE_1A_MUSCLES.includes(m), `${e.id}: ${m}`);
  const lats = EXERCISES.filter((e) => e.direct.includes("lats"));
  assert.ok(lats.length && lats.every((e) => assumedMuscles(e).includes("lats")));
});

test("the planner doesn't contradict Table 1A for exercises it lists", () => {
  // Every table name the planner cites for an exercise: wherever that name appears in another muscle's row of the
  // same table, the planner must count that muscle in the same column.
  for (const e of EXERCISES) {
    const names = new Set(Object.values(e.sources ?? {}));
    for (const [m, row] of Object.entries(TABLE_1A) as [Muscle, (typeof TABLE_1A)[Muscle]][]) {
      for (const name of names) {
        if (row!.direct.includes(name)) assert.ok(e.direct.includes(m), `${e.id}: table has "${name}" direct for ${m}`);
        if (row!.indirect.includes(name)) assert.ok(e.indirect.includes(m), `${e.id}: table has "${name}" indirect for ${m}`);
      }
    }
  }
  // Squats, lunges and the leg press: "N/A" indirect for the hamstrings in the table.
  for (const id of ["backSquat", "legPress", "lungeDb"]) assert.ok(!EXERCISES.find((e) => e.id === id)!.indirect.includes("hamstrings"));
});
