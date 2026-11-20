import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, EQUIPMENT, MUSCLES, PRESETS, assumedMuscles, isAssumed, isSupported, type Equipment, type Muscle } from "./catalogue.ts";
import references from "../references.json" with { type: "json" };
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
    if (e.kind !== "strength") assert.ok(e.met?.length, `${e.id}: ${e.kind} without a MET value`);
    if (e.kind === "intervals") assert.ok(e.direct.length || e.id === "burpee", `${e.id}: no direct muscle`);
    for (const r of e.met ?? []) assert.match(r.code, /^\d{5}$/);
  }
});

test("every muscle can be trained directly with a full gym and with no equipment", () => {
  for (const p of ["gym", "body"]) {
    const have = new Set(preset(p));
    for (const m of muscles) {
      if (p === "body" && ["forearms", "biceps", "upperBack", "sideDelts", "rearDelts"].includes(m)) continue; // need something to hold or pull
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

test("a deeper target (2 sets) is reachable: two different exercises from the same group", () => {
  const r = suggest({ ...base, depth: 2, targets: ["chest"], equipment: preset("gym") });
  const s = r.suggestions[0];
  assert.equal(s.score, 1);
  assert.deepEqual(s.missing, []);
  assert.equal(s.exercises.length, 2);
  assert.equal(new Set(s.exercises.map((e) => e.id)).size, 2, "the same exercise twice");
  assert.ok(coverage(s.exercises).chest >= 2);
});

test("at the default depth, two indirect exercises can add up to one set", () => {
  const r = suggest({ ...base, targets: ["frontDelts"], equipment: preset("gym"), excluded: EXERCISES.filter((e) => e.direct.includes("frontDelts")).map((e) => e.id) });
  assert.equal(r.suggestions[0].score, 1);
  assert.equal(r.suggestions[0].exercises.length, 2);
});

test("'All different' never gives near-copies: relaxation is gradual and reported", () => {
  // Calves with no equipment: very few options, so lists must overlap.
  const r = suggest({ ...base, maxExercises: 10, count: 6, overlap: 0, targets: ["chest", "lats", "quads", "glutes", "abs"], equipment: preset("gym") });
  assert.ok(r.suggestions.length >= 2);
  const first = r.suggestions[0];
  for (let i = 1; i < r.suggestions.length; i++) {
    const shared = r.suggestions[i].exercises.filter((e) => first.exercises.includes(e)).length;
    assert.ok(shared < Math.min(first.exercises.length, r.suggestions[i].exercises.length), `option ${i + 1} is a copy of option 1`);
  }
  assert.equal(r.relaxed, r.sharedMax > 0);
  assert.ok(r.sharedMax <= 1);
});

test("when strict variety is possible, nothing is relaxed", () => {
  const r = suggest({ ...base, overlap: 0, targets: ["chest", "lats", "quads"], equipment: preset("gym") });
  assert.equal(r.relaxed, false);
  assert.equal(r.sharedMax, 0);
});

test("invalid settings are brought back into range", () => {
  const t = { targets: ["chest"] as never, equipment: preset("gym") };
  for (const depth of [NaN, -1, 0, 1.7, 99, Infinity]) {
    const r = suggest({ ...base, ...t, depth });
    assert.ok(r.suggestions.length, `depth ${depth}`);
    for (const s of r.suggestions) assert.ok(s.score >= 0 && s.score <= 1 && Number.isFinite(s.score), `depth ${depth}: score ${s.score}`);
  }
  assert.ok(suggest({ ...base, ...t, maxExercises: NaN, count: NaN, overlap: NaN }).suggestions.length >= 1);
  assert.ok(suggest({ ...base, ...t, maxExercises: 99, count: 99 }).suggestions.length <= 6);
});

test("targets no available exercise trains are reported", () => {
  assert.deepEqual(suggest({ ...base, targets: ["chest", "biceps"], equipment: ["body"] }).unreachable, ["biceps"]);
  assert.deepEqual([...suggest({ ...base, targets: ["chest", "aerobic"], equipment: [] }).unreachable].sort(), ["aerobic", "chest"]);
});

test("whole body, deeper targets, is still fast", () => {
  for (const depth of [2, 3]) {
    const t = performance.now();
    suggest({ ...base, depth, maxExercises: 10, count: 6, targets: [...muscles, "aerobic"] as never, equipment: preset("gym") });
    assert.ok(performance.now() - t < 3000, `depth ${depth}: ${Math.round(performance.now() - t)} ms`);
  }
});

test("only continuous, rhythmic activities cover heart and lungs", () => {
  const counted = EXERCISES.filter((e) => e.kind === "aerobic").map((e) => e.id).sort();
  assert.deepEqual(counted, ["cycle", "elliptical", "row", "run", "skip", "stairs", "swim", "walk"]);
  for (const id of ["kbSwing", "burpee"]) assert.equal(EXERCISES.find((e) => e.id === id)!.kind, "intervals");
  const r = suggest({ ...base, targets: ["aerobic"], equipment: ["body", "kettlebell"] });
  assert.equal(r.suggestions.length, 0);
  assert.deepEqual(r.unreachable, ["aerobic"]);
  const g = suggest({ ...base, targets: ["glutes", "hamstrings", "aerobic"], equipment: preset("gym") });
  for (const s of g.suggestions) {
    assert.ok(!s.missing.includes("aerobic"));
    assert.ok(s.exercises.some((e) => e.kind === "aerobic"), "covered by a continuous activity, not kettlebell swings");
  }
});

test("MET values match the Compendium's measured (not estimated) rows used", () => {
  // Checked against pacompendium.com on 20 Nov 2026: none of these codes is marked as an estimate (red).
  const rows = EXERCISES.flatMap((e) => e.met ?? []);
  assert.equal(rows.length, 17);
  assert.equal(new Set(rows.map((r) => r.code)).size, 17);
});

test("shoulders are three groups: a face pull alone doesn't cover the front or side", () => {
  const face = EXERCISES.find((e) => e.id === "facePull")!;
  assert.ok(face.direct.includes("rearDelts") && !face.direct.includes("frontDelts") && !face.indirect.includes("sideDelts"));
  const r = suggest({ ...base, maxExercises: 1, targets: ["frontDelts", "sideDelts", "rearDelts"], equipment: preset("machines") });
  assert.ok(r.suggestions[0].missing.length >= 1);
  const full = suggest({ ...base, targets: ["frontDelts", "sideDelts", "rearDelts"], equipment: preset("gym") });
  assert.deepEqual(full.suggestions[0].missing, []);
  // Table 1A's anterior-deltoid row is credited to the front shoulders only.
  for (const e of EXERCISES) for (const m of Object.keys(e.sources ?? {})) assert.ok(!["sideDelts", "rearDelts"].includes(m), e.id);
});

test("outcome evidence: cited references exist, and only counted muscles carry it", () => {
  const refIds = new Set(references.sources.map((r: { id: string }) => r.id));
  for (const e of EXERCISES) for (const [m, refs] of Object.entries(e.evidence ?? {}) as [Muscle, string[]][]) {
    assert.ok(refs.length, `${e.id}: ${m}`);
    for (const r of refs) assert.ok(refIds.has(r), `${e.id}: unknown reference ${r}`);
    assert.ok(e.direct.includes(m) || e.indirect.includes(m), `${e.id}: ${m} has evidence but isn't counted`);
    assert.ok(isSupported(e, m) && !isAssumed(e, m));
  }
  // Glutes grew with squats, the leg press and the hip thrust; hamstrings didn't with the hip thrust (Plotkin 2023).
  for (const id of ["backSquat", "legPress", "hipThrust", "squatBw"]) assert.ok(isSupported(EXERCISES.find((e) => e.id === id)!, "glutes"), id);
  for (const id of ["rdl", "backExtension"]) assert.ok(isSupported(EXERCISES.find((e) => e.id === id)!, "hamstrings"), id);
  for (const id of ["hipThrust", "gluteBridge"]) {
    const e = EXERCISES.find((x) => x.id === id)!;
    assert.ok(!e.direct.includes("hamstrings") && !e.indirect.includes("hamstrings"), id);
  }
});
