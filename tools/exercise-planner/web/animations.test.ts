// The "Show how" animations: proportions kept, everything in view, matched to the right exercise version.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, type Equipment } from "./catalogue.ts";
import { ANIMATIONS, animationFor, phase, PERIOD, positionAt } from "./animations.ts";
import { BONES, BOX, floorOf, JOINTS, dist, points, project, viewSvg } from "./figure.ts";

const STEPS = Array.from({ length: 21 }, (_, i) => i / 20);
const name = (a: (typeof ANIMATIONS)[number]) => `${a.exercise}${a.using ? ` (${a.using.join(", ")})` : ""}`;

test("every animation belongs to a catalogue exercise with a how-to link, and matches one of its versions", () => {
  for (const a of ANIMATIONS) {
    const ex = EXERCISES.find((e) => e.id === a.exercise);
    assert.ok(ex, `${name(a)}: no such exercise`);
    const v = a.using && ex.variants?.find((x) => a.using!.some((e) => x.using.includes(e)));
    assert.ok((v && v.howTo) || ex.howTo, `${name(a)}: animations are drawn from the how-to page, so the version needs one`);
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
      const box = a.box ?? BOX, [x, y] = project(pt, v, box);
      assert.ok(x >= 4 && x <= box - 4 && y >= 4 && y <= floorOf(box) + 2, `${name(a)} at ${t}: a point is outside the ${v} view (${x.toFixed(0)}, ${y.toFixed(0)})`);
    }
    assert.ok(!/NaN|undefined/.test(viewSvg(p, "side", a.box) + viewSvg(p, "front", a.box)), `${name(a)} at ${t}: bad drawing`);
  }
});

test("the movement starts at rest, reaches the far end halfway, and repeats", () => {
  assert.equal(phase(0), 0);
  assert.ok(Math.abs(phase(PERIOD / 2) - 1) < 1e-9);
  assert.ok(Math.abs(phase(PERIOD)) < 1e-9);
});

test("a loop ends where it starts, and plays once round per period", () => {
  for (const a of ANIMATIONS.filter((x) => x.loop)) {
    const p0 = a.pose(0), p1 = a.pose(1);
    for (const k of JOINTS) assert.ok(dist(p0.j[k], p1.j[k]) < 1e-6, `${name(a)}: ${k} jumps at the end of the loop`);
  }
  const loop = { exercise: "x", loop: true, pose: ANIMATIONS[0].pose, cues: [] }, back = { ...loop, loop: false };
  assert.equal(positionAt(loop, PERIOD / 4), 0.25);
  assert.equal(positionAt(back, PERIOD / 2), phase(PERIOD / 2));
});

test("the animation shown follows the equipment the visitor has", () => {
  const curl = EXERCISES.find((e) => e.id === "curl")!;
  const has = (...e: Equipment[]) => new Set<Equipment>(e);
  assert.equal(animationFor(curl, has("dumbbells"))?.using?.[0], "dumbbells");
  assert.equal(animationFor(curl, has("barbell"))?.using?.[0], "barbell");
  const raise = EXERCISES.find((e) => e.id === "lateralRaise")!;
  assert.equal(animationFor(raise, has("machines")), undefined, "no machine lateral raise drawn yet, so none is shown rather than the dumbbell one");
  const squat = EXERCISES.find((e) => e.id === "squatBw")!;
  assert.ok(animationFor(squat, has("body")));
});
