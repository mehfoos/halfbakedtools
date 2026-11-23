// The "Show how" animations: proportions kept, everything in view, matched to the right exercise version.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, type Equipment } from "./catalogue.ts";
import { ANIMATIONS, animationFor, phase, PERIOD } from "./animations.ts";
import { BONES, BOX, FLOOR, JOINTS, dist, points, project, viewSvg } from "./figure.ts";

const STEPS = Array.from({ length: 21 }, (_, i) => i / 20);
const name = (a: (typeof ANIMATIONS)[number]) => `${a.exercise}${a.using ? ` (${a.using.join(", ")})` : ""}`;

test("every animation belongs to a catalogue exercise with a how-to link, and matches one of its versions", () => {
  for (const a of ANIMATIONS) {
    const ex = EXERCISES.find((e) => e.id === a.exercise);
    assert.ok(ex, `${name(a)}: no such exercise`);
    assert.ok(ex.howTo, `${name(a)}: animations are drawn from the how-to page, so the exercise needs one`);
    if (ex.variants) assert.ok(a.using && ex.variants.some((v) => a.using!.some((e) => v.using.includes(e))), `${name(a)}: say which variant it draws`);
    else assert.equal(a.using, undefined, `${name(a)}: the exercise has no variants`);
    assert.ok(a.cues.length >= 2, `${name(a)}: give the cues`);
  }
  const keys = ANIMATIONS.map(name);
  assert.equal(new Set(keys).size, keys.length, "one animation per exercise version");
});

test("every animation keeps the figure's proportions throughout the movement", () => {
  for (const a of ANIMATIONS) for (const t of STEPS) {
    const p = a.pose(t);
    for (const [x, y, len] of BONES) assert.ok(Math.abs(dist(p.j[x], p.j[y]) - len) < 1e-6, `${name(a)} at ${t}: ${x}–${y} is ${dist(p.j[x], p.j[y]).toFixed(2)}, not ${len}`);
  }
});

test("nothing goes through the floor, and everything stays inside both views", () => {
  for (const a of ANIMATIONS) for (const t of STEPS) {
    const p = a.pose(t);
    for (const k of JOINTS) assert.ok(p.j[k][1] >= -0.5, `${name(a)} at ${t}: ${k} below the floor`);
    for (const v of ["side", "front"] as const) for (const pt of points(p)) {
      const [x, y] = project(pt, v);
      assert.ok(x >= 4 && x <= BOX - 4 && y >= 4 && y <= FLOOR + 2, `${name(a)} at ${t}: a point is outside the ${v} view (${x.toFixed(0)}, ${y.toFixed(0)})`);
    }
    assert.ok(!/NaN|undefined/.test(viewSvg(p, "side") + viewSvg(p, "front")), `${name(a)} at ${t}: bad drawing`);
  }
});

test("the movement starts at rest, reaches the far end halfway, and repeats", () => {
  assert.equal(phase(0), 0);
  assert.ok(Math.abs(phase(PERIOD / 2) - 1) < 1e-9);
  assert.ok(Math.abs(phase(PERIOD)) < 1e-9);
});

test("the animation shown follows the equipment the visitor has", () => {
  const curl = EXERCISES.find((e) => e.id === "curl")!;
  const has = (...e: Equipment[]) => new Set<Equipment>(e);
  assert.equal(animationFor(curl, has("dumbbells"))?.using?.[0], "dumbbells");
  assert.equal(animationFor(curl, has("barbell")), undefined, "no barbell curl drawn yet, so none is shown rather than the dumbbell one");
  const squat = EXERCISES.find((e) => e.id === "squatBw")!;
  assert.ok(animationFor(squat, has("body")));
});
