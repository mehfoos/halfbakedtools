// The "Show how" animations: one per exercise version, each drawn from the instructions on the page the
// exercise's "How to do it" link points to (`howTo` in catalogue.ts). They are first-pass illustrations made by
// this site, not reviewed by a fitness professional, and are labelled so on the page. What each was compared with,
// and when, is in VERIFICATION.md; the tests check that every one keeps its proportions and stays in view.
import type { Equipment, Exercise } from "./catalogue.ts";
import { variantFor } from "./planner.ts";
import { add, body, dir, grounded, hipsOf, lerp, SEG, shouldersOf, twoBone, yaw, type Joint, type Pose, type Prop, type V3 } from "./figure.ts";

export type Animation = {
  /** The exercise id in catalogue.ts. */
  exercise: string;
  /** For an exercise with variants: the equipment of the variant drawn (matched against the visitor's variant). */
  using?: Equipment[];
  /**
   * The movement, given the position t in it: 0 at the start, 1 at the far end. For a `loop`, t runs from 0 to 1
   * once round the cycle and pose(1) is the same as pose(0).
   */
  pose: (t: number) => Pose;
  /** A movement that goes round in one direction (pedalling, strides, a swimming stroke) rather than there and back. */
  loop?: boolean;
  /** The size of each view's square, if the default (BOX) is too small, as for poses lying full length. */
  box?: number;
  /** Short cues in plain words, summarised from the linked page. */
  cues: string[];
};

/** Move a pose so the average of some joints sits at `at` (for example, keeping the feet still). */
function anchored(p: Pose, joints: Joint[], at: V3): Pose {
  const n = joints.length;
  const mid = [0, 1, 2].map((i) => joints.reduce((s, k) => s + p.j[k][i], 0) / n);
  const d: V3 = [at[0] - mid[0], at[1] - mid[1], at[2] - mid[2]];
  const j = Object.fromEntries(Object.entries(p.j).map(([k, v]) => [k, add(v, d)])) as Record<Joint, V3>;
  const props = p.props.map((q): Prop => q.kind === "line" ? { ...q, a: add(q.a, d), b: add(q.b, d) } : { ...q, at: add(q.at, d) });
  return { j, props };
}
const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
const UP = dir(180), DOWN = dir(0), FWD: V3 = [0, 0, 1];
const dumbbellsAt = (p: Pose, axis: (s: "l" | "r") => V3): Pose =>
  ({ ...p, props: [...p.props, ...(["l", "r"] as const).map((s): Prop => ({ kind: "dumbbell", at: p.j[`${s}wr`], axis: axis(s) }))] });

/** A bench with a backrest, seen from the side as a seat, legs and back, and from the front as cross pieces. */
function benchWithBack(seatY: number, backZ: number, frontZ: number): Prop[] {
  const mid = (backZ + frontZ) / 2;
  return [
    { kind: "line", a: [0, seatY, backZ], b: [0, seatY, frontZ] },
    { kind: "line", a: [-16, seatY, mid], b: [16, seatY, mid] },
    { kind: "line", a: [0, seatY, backZ + 3], b: [0, 0, backZ + 3] },
    { kind: "line", a: [0, seatY, frontZ - 3], b: [0, 0, frontZ - 3] },
    { kind: "line", a: [0, seatY, backZ], b: [0, seatY + 80, backZ] },
    { kind: "line", a: [-14, seatY + 70, backZ], b: [14, seatY + 70, backZ] },
  ];
}

/** A flat bench seen along its length, from z0 to z1, with its top at seatY. */
function flatBench(seatY: number, z0: number, z1: number, x = 0): Prop[] {
  return [
    { kind: "line", a: [x, seatY, z0], b: [x, seatY, z1], width: 5 },
    { kind: "line", a: [x - 12, seatY, (z0 + z1) / 2], b: [x + 12, seatY, (z0 + z1) / 2] },
    { kind: "line", a: [x, seatY, z0 + 4], b: [x, 0, z0 + 4] },
    { kind: "line", a: [x, seatY, z1 - 4], b: [x, 0, z1 - 4] },
  ];
}
/** A barbell, drawn shorter than a real one (about 120 units instead of about 200) to fit the view; plates of 45 cm. */
const barbell = (at: V3): Prop => ({ kind: "bar", at, axis: [1, 0, 0], half: 62, plate: 20 });
/** A machine handle or rope end in the hand: a short grey bar through the wrist, along `axis`. */
const grip = (at: V3, axis: V3 = [0, 1, 0], half = 5): Prop => ({ kind: "line", a: add(at, axis, -half), b: add(at, axis, half), width: 4 });
const cable = (a: V3, b: V3): Prop => ({ kind: "line", a, b, width: 2 });
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/** A forward lunge: step forward with the left leg and lower; `half` is half the starting gap between the feet. */
function lungePose(t: number, half: number): Pose {
      const stepT = Math.min(1, t * 1.6), lowT = Math.max(0, (t - 0.25) / 0.75);
      const heel = lerp(0, 50, lowT) * Math.PI / 180;
      const backAnkle: V3 = [-half, 12 * Math.sin(heel), -6 - 12 * Math.cos(heel)];
      const front: V3 = [half, 6 * Math.sin(Math.PI * stepT) * (1 - lowT), lerp(-18, 52, stepT)];
      const shin = 10 * Math.PI / 180;
      const bottomHip: V3 = [0, SEG.shin * Math.cos(shin) + 2, 52 + SEG.shin * Math.sin(shin) - SEG.thigh];
      const standHip: V3 = [0, SEG.shin + SEG.thigh - 0.5, -9];
      const hipC: V3 = [0, lerp(standHip[1], bottomHip[1], lowT), lerp(standHip[2], bottomHip[2] + 4, t)];
      const [lh, rh] = hipsOf(hipC);
      const L = twoBone(lh, front, SEG.thigh, SEG.shin, [0, 0, 1]);
      const R = twoBone(rh, backAnkle, SEG.thigh, SEG.shin, [0, -0.3, 1]);
      const lean = lerp(0, 10, lowT);
      return body({ hipC, torso: dir(180 - lean), thigh: [L[0], R[0]], shin: [L[1], R[1]], foot: [dir(90), dir(90 - (heel * 180) / Math.PI)], upper: [DOWN, DOWN], fore: [DOWN, DOWN] });
}

/** A squat with the feet still: `depth` is the thigh's angle from straight down at the bottom (90 = parallel). */
function squatPose(t: number, o: { depth: number; shin: number; lean: number; wide: number; toes?: number },
  arms: (sh: [V3, V3], torso: V3, neck: V3) => [[V3, V3], [V3, V3]]): Pose {
  const toes = o.toes ?? 10, lean = lerp(0, o.lean, t);
  const leg = (s: 1 | -1) => ({
    thigh: yaw(dir(lerp(0, o.depth, t), s * o.wide), s * toes),
    shin: yaw(neg(dir(180 - lerp(0, o.shin, t), -s * o.wide)), s * toes),
    foot: yaw(FWD, s * toes),
  });
  const L = leg(1), R = leg(-1), hipC: V3 = [0, 80, 0], torso = dir(180 - lean);
  const neck = add(hipC, torso, SEG.torso), [u, f] = arms(shouldersOf(hipC, torso), torso, neck);
  const p = body({ hipC, torso, head: dir(180 - lean * 0.6), thigh: [L.thigh, R.thigh], shin: [L.shin, R.shin], foot: [L.foot, R.foot], upper: u, fore: f });
  return anchored(p, ["lankle", "rankle"], [0, 0, -6]);
}
const front = (torso: V3): V3 => [0, -torso[2], torso[1]]; // the way the chest faces, for a trunk leaning forward

const frac = (x: number) => x - Math.floor(x);
const TAU = 2 * Math.PI;

/**
 * Walking or running on the spot (as on a treadmill): `u` is the left leg's place in its stride, 0 → 1 (the right
 * is half a stride behind). Each foot is on the floor for `stance` of the stride, sliding back from `land` to
 * `push` (forward distances from the hips), then swings forward, lifted by `lift`.
 */
function stride(u: number, o: { hipY: number; land: number; push: number; stance: number; lift: number; kick: number; lean: number; bob: number; arm: number; elbow: number }): Pose {
  const foot = (v: number): { at: V3; pitch: number } => {
    if (v < o.stance) {
      const s = v / o.stance, z = lerp(o.land, o.push, s);
      const heel = Math.max(0, (s - 0.7) / 0.3) * 30; // the heel comes up as the foot pushes off, toes still down
      return { at: [0, SEG.foot * Math.sin((heel * Math.PI) / 180), z + SEG.foot * (1 - Math.cos((heel * Math.PI) / 180))], pitch: 90 - heel };
    }
    const s = (v - o.stance) / (1 - o.stance), forward = 0.5 - 0.5 * Math.cos(Math.PI * s);
    // On the way forward the foot first rises behind (the heel towards the seat when running), then reaches forward.
    // It leaves the floor as the push-off ended (heel up 30°, toes down), so the pose doesn't jump.
    const off = SEG.foot * Math.sin(Math.PI / 6), offZ = o.push + SEG.foot * (1 - Math.cos(Math.PI / 6));
    return { at: [0, off * (1 - s) + o.lift * Math.sin(Math.PI * s) + o.kick * Math.sin(Math.PI * Math.min(1, s * 1.6)) * (1 - s), lerp(offZ, o.land, forward)], pitch: lerp(60, 90, s) };
  };
  const L = foot(frac(u)), R = foot(frac(u + 0.5));
  // Hips at their lowest just after each foot lands, highest mid-stride.
  const hipC: V3 = [0, o.hipY + o.bob * Math.sin(TAU * 2 * u - Math.PI / 2), 0], [lh, rh] = hipsOf(hipC);
  const legL = twoBone(lh, add(L.at, [SEG.hipW, 0, 0]), SEG.thigh, SEG.shin, FWD), legR = twoBone(rh, add(R.at, [-SEG.hipW, 0, 0]), SEG.thigh, SEG.shin, FWD);
  // Each arm swings with the opposite leg, from the shoulder, forward and back.
  const swing = (s: 1 | -1) => -s * o.arm * Math.cos(TAU * u);
  const arm = (s: 1 | -1) => ({ upper: dir(swing(s), s * 4), fore: dir(swing(s) + o.elbow, s * 2) });
  const a = arm(1), b = arm(-1);
  return body({ hipC, torso: dir(180 - o.lean), head: dir(180 - o.lean * 0.5), thigh: [legL[0], legR[0]], shin: [legL[1], legR[1]],
    foot: [dir(L.pitch), dir(R.pitch)], upper: [a.upper, b.upper], fore: [a.fore, b.fore] });
}

/** Clip a line to a rectangle in (z, y) (for equipment that runs off the edge of the view, like a staircase). */
function clipped(a: V3, b: V3, zMin: number, zMax: number, yMin: number, yMax: number): Prop[] {
  let t0 = 0, t1 = 1;
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  for (const [p, q] of [[-d[2], a[2] - zMin], [d[2], zMax - a[2]], [-d[1], a[1] - yMin], [d[1], yMax - a[1]]]) {
    if (p === 0) { if (q < 0) return []; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
  }
  return t0 < t1 ? [{ kind: "line", a: add(a, d, t0), b: add(a, d, t1) }] : [];
}

export const ANIMATIONS: Animation[] = [
  {
    // ACE "Seated Biceps Curl" (dumbbells): seated against a backrest, palms forward, elbows bend together to bring
    // the dumbbells towards the chest without the elbows moving forward.
    exercise: "curl", using: ["dumbbells"],
    pose: (t) => {
      const seat = 36;
      const p = body({
        hipC: [0, seat + 4, 0], torso: UP,
        thigh: [dir(90), dir(90)], shin: [DOWN, DOWN],
        upper: [DOWN, DOWN], fore: [dir(lerp(0, 140, t)), dir(lerp(0, 140, t))],
        props: benchWithBack(seat, -8, 30),
      });
      return dumbbellsAt(p, () => [1, 0, 0]); // palms forward: the handles run left to right
    },
    cues: [
      "Sit with your back against the backrest and your feet flat on the floor",
      "Hold the weights with your palms forward, arms hanging close to your sides",
      "Bend both elbows to bring the weights towards your chest, keeping the elbows from moving forward",
      "Lower slowly to the start",
    ],
  },
  {
    // ACE "Lateral Raise" (dumbbells): standing, feet a little wider than hip-width, neutral grip beside the thighs;
    // raise out to the sides to shoulder height, elbows straight or slightly bent; past about 60–70° the front of the
    // dumbbells tilts slightly up.
    exercise: "lateralRaise", using: ["dumbbells"],
    pose: (t) => {
      const a = lerp(6, 90, t);
      const p = grounded(body({
        hipC: [0, 80, 0], torso: UP,
        thigh: [dir(0, 3), dir(0, -3)], shin: [dir(0, 3), dir(0, -3)],
        upper: [dir(0, a), dir(0, -a)], fore: [dir(0, Math.max(a - 8, 3)), dir(0, -Math.max(a - 8, 3))],
      }));
      const tilt = a > 65 ? ((a - 65) / 25) * 15 : 0;
      return dumbbellsAt(p, () => [0, Math.sin((tilt * Math.PI) / 180), Math.cos((tilt * Math.PI) / 180)]);
    },
    cues: [
      "Stand with your feet a little wider than hip-width, weights beside your thighs, palms facing you",
      "Raise your arms out to the sides until they are level with your shoulders, elbows straight or slightly bent",
      "Keep your body upright, without arching your lower back",
      "Lower slowly to the start",
    ],
  },
  {
    // ACE "Bodyweight Squat": feet a little wider than hip-width, toes turned slightly out, hands by the sides; hips
    // back then down; knees over the second toe; thighs to about parallel; shins and trunk roughly parallel; heels flat.
    exercise: "squatBw",
    pose: (t) => {
      const lean = lerp(0, 38, t), toes = 10, wide = 4;
      const leg = (s: 1 | -1) => ({
        thigh: yaw(dir(lerp(0, 90, t), s * wide), s * toes),
        shin: yaw(neg(dir(180 - lean, -s * wide)), s * toes),
        foot: yaw(FWD, s * toes),
      });
      const L = leg(1), R = leg(-1);
      const p = body({
        hipC: [0, 80, 0], torso: dir(180 - lean), head: dir(180 - lean * 0.6),
        thigh: [L.thigh, R.thigh], shin: [L.shin, R.shin], foot: [L.foot, R.foot],
        upper: [DOWN, DOWN], fore: [DOWN, DOWN],
      });
      return anchored(p, ["lankle", "rankle"], [0, 0, -6]); // the feet stay put
    },
    cues: [
      "Feet a little wider than hip-width, toes turned slightly out, arms by your sides",
      "Push your hips back first, then down, keeping your chest up and your back flat",
      "Go down until your thighs are about parallel to the floor, or less if your heels lift; knees stay over your second toes",
      "Push through your heels to stand back up",
    ],
  },
  {
    // ACE "Push-up": hands shoulder-width apart under the shoulders, feet together, toes tucked; body straight with
    // no bend at the hips or knees; lower until the chest or chin touches the floor, elbows flaring outwards; press
    // until the elbows are straight.
    exercise: "pushUp",
    pose: (t) => {
      const handZ = 58, ankle: V3 = [0, 12, -56];
      const sh = lerp(53, 16, t), ang = Math.asin((sh - ankle[1]) / (SEG.shin + SEG.thigh + SEG.torso));
      const b: V3 = [0, Math.sin(ang), Math.cos(ang)], hipC = add(ankle, b, SEG.shin + SEG.thigh);
      const [ls, rs] = shouldersOf(hipC, b);
      const L = twoBone(ls, [SEG.shW, 0, handZ], SEG.upper, SEG.fore, [1, 0.6, 0]);
      const R = twoBone(rs, [-SEG.shW, 0, handZ], SEG.upper, SEG.fore, [-1, 0.6, 0]);
      const down: V3 = [-b[0], -b[1], -b[2]];
      return body({ hipC, torso: b, thigh: [down, down], shin: [down, down], foot: [dir(15), dir(15)], upper: [L[0], R[0]], fore: [L[1], R[1]] });
    },
    cues: [
      "Hands flat, shoulder-width apart, with your shoulders over your hands; feet together, toes tucked under",
      "Keep your body straight from head to heels, without your back sagging or hips lifting",
      "Lower until your chest or chin touches the floor, letting your elbows go out a little",
      "Press back up until your arms are straight",
    ],
  },
  {
    // ACE "Forward Lunge": start with the feet together; step forward, heel first; lower until the front thigh is
    // parallel with the floor, front shin leaning slightly forward, hips dropping rather than driving forward, a slight
    // forward lean with a flat back; push off the front leg back to the start. The arms and the back knee aren't
    // described: drawn hanging and bending.
    exercise: "lunge",
    pose: (t) => lungePose(t, 3),
    cues: [
      "Stand with your feet together",
      "Step forward, heel first, and lower your hips towards the floor until your front thigh is parallel with it",
      "Keep your front shin only slightly forward and your back flat; avoid leaning sideways",
      "Push off the front foot to return to standing",
    ],
  },
  {
    // ACE "Glute Bridge": on the back, knees bent, feet flat and hip-width apart; press the hips up by squeezing the
    // glutes, heels pressing down; not too high (it arches the lower back); lower slowly. Arms not described: drawn
    // resting on the floor.
    exercise: "gluteBridge",
    pose: (t) => {
      const h = lerp(5, 34, t), neckY = 5, neckZ = -40;
      const hipC: V3 = [0, h, neckZ + Math.sqrt(SEG.torso ** 2 - (h - neckY) ** 2)];
      const torso: V3 = [0, (neckY - h) / SEG.torso, (neckZ - hipC[2]) / SEG.torso];
      const [lh, rh] = hipsOf(hipC);
      const L = twoBone(lh, [SEG.hipW, 0, 48], SEG.thigh, SEG.shin, [0, 1, 0]);
      const R = twoBone(rh, [-SEG.hipW, 0, 48], SEG.thigh, SEG.shin, [0, 1, 0]);
      const [ls, rs] = shouldersOf(hipC, torso);
      const LA = twoBone(ls, [SEG.shW + 4, 1, ls[2] + 50], SEG.upper, SEG.fore, [0, 1, 0]);
      const RA = twoBone(rs, [-SEG.shW - 4, 1, rs[2] + 50], SEG.upper, SEG.fore, [0, 1, 0]);
      return body({ hipC, torso, head: dir(-90), thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
    },
    cues: [
      "Lie on your back, knees bent, feet flat on the floor and hip-width apart",
      "Tighten your stomach muscles and press your hips up by squeezing your glutes, pressing your heels down",
      "Don't push your hips too high, which arches the lower back",
      "Lower slowly to the start",
    ],
  },
  {
    // ACE "Front Plank": lie face down, elbows under the shoulders, forearms on the floor, palms down, legs straight,
    // toes tucked; lift the whole body off the floor, keeping it straight (no sagging, hips not lifted, knees straight),
    // shoulders over the elbows; hold. The drawing shows the lift into the hold.
    exercise: "plank",
    pose: (t) => {
      const neck: V3 = [0, 30, 52], ankleY = 12;
      const straight = ankleY + ((SEG.shin + SEG.thigh) * (neck[1] - ankleY)) / (SEG.shin + SEG.thigh + SEG.torso);
      const h = lerp(7, straight, t), dz = Math.sqrt(SEG.torso ** 2 - (neck[1] - h) ** 2);
      const hipC: V3 = [0, h, neck[2] - dz];
      const torso: V3 = [0, (neck[1] - h) / SEG.torso, dz / SEG.torso];
      const legLen = SEG.shin + SEG.thigh, a = Math.asin((h - ankleY) / legLen);
      const down: V3 = [0, -Math.sin(a), -Math.cos(a)];
      return body({ hipC, torso, thigh: [down, down], shin: [down, down], foot: [dir(15), dir(15)], upper: [DOWN, DOWN], fore: [dir(90), dir(90)] });
    },
    cues: [
      "Lie face down with your elbows under your shoulders and your forearms on the floor, palms down",
      "Tighten your stomach muscles and lift your whole body off the floor, resting on your forearms and toes",
      "Keep a straight line: no sagging in the lower back, hips not raised, knees straight",
      "Hold, breathing normally, then lower",
    ],
  },
  {
    // ACE "Supermans": face down, legs straight, toes pointed, arms straight overhead with palms facing each other;
    // raise both arms and both legs a few inches off the floor, keeping them straight and the head in line; hold briefly
    // and lower. "A few inches" is drawn as about 7 cm at the hands and feet.
    exercise: "superman", box: 224,
    pose: (t) => {
      const lift = lerp(0, 1, t), y = 4, hipC: V3 = [0, y, -12];
      const arm = dir(90 + lift * 7), leg = dir(-90 - lift * 5);
      return body({ hipC, torso: dir(90), head: dir(90), thigh: [leg, leg], shin: [leg, leg], foot: [dir(-80 - lift * 5), dir(-80 - lift * 5)], upper: [arm, arm], fore: [arm, arm] });
    },
    cues: [
      "Lie face down, legs straight and toes pointed, arms straight out past your head, palms facing each other",
      "Tighten your stomach muscles, then lift both arms and both legs a few inches off the floor, keeping them straight",
      "Keep your head in line with your back; don't arch or lift your head",
      "Hold briefly, then lower slowly",
    ],
  },
  {
    // ACE "Standing Calf Raises - Wall": stand 6–12 inches from a wall, feet hip-width apart facing forward, palms on
    // the wall at chest or shoulder height; lift the heels with the knees straight; hold briefly; lower slowly. Drawn for
    // the bodyweight version (the linked page); the wall is the grey upright, 9 inches (about 21 units) from the toes.
    exercise: "calfRaise", using: ["body"],
    pose: (t) => {
      const toeZ = 6, wallZ = toeZ + 21, rise = lerp(0, 38, t) * Math.PI / 180;
      const foot: V3 = [0, -Math.sin(rise), Math.cos(rise)];
      const ankle: V3 = [0, 12 * Math.sin(rise), toeZ - 12 * Math.cos(rise)];
      const hipC: V3 = [0, ankle[1] + SEG.shin + SEG.thigh, ankle[2]];
      const [ls, rs] = shouldersOf(hipC, UP);
      const handY = SEG.shin + SEG.thigh + SEG.torso - 6;
      const L = twoBone(ls, [SEG.shW, handY, wallZ], SEG.upper, SEG.fore, [0.6, -1, 0]);
      const R = twoBone(rs, [-SEG.shW, handY, wallZ], SEG.upper, SEG.fore, [-0.6, -1, 0]);
      const wall: Prop[] = [-40, 40].map((x): Prop => ({ kind: "line", a: [x, 0, wallZ + 2], b: [x, 160, wallZ + 2] }));
      return body({ hipC, torso: UP, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], foot: [foot, foot], upper: [L[0], R[0]], fore: [L[1], R[1]], props: wall });
    },
    cues: [
      "Stand 6 to 12 inches from a wall, feet hip-width apart and facing forward, palms on the wall at chest or shoulder height",
      "Lift your heels off the floor, keeping your knees straight and without turning your feet",
      "Hold briefly at the top",
      "Lower your heels slowly",
    ],
  },
  {
    // ACE "Seated Overhead Press" (dumbbells): seated against a backrest, feet flat; dumbbells at shoulder level, palms
    // forward, shoulder-width or slightly wider, elbows pointing a little forward; press until the elbows are straight
    // without arching the lower back; lower slowly.
    exercise: "dbPress", using: ["dumbbells"],
    pose: (t) => {
      const seat = 36, hipC: V3 = [0, seat + 4, 0];
      const [ls, rs] = shouldersOf(hipC, UP);
      const y = lerp(ls[1] + 4, ls[1] + SEG.upper + SEG.fore - 1, t), z = lerp(8, 4, t), x = lerp(SEG.shW + 7, SEG.shW + 3, t);
      const L = twoBone(ls, [x, y, z], SEG.upper, SEG.fore, [1, -0.6, 0.5]);
      const R = twoBone(rs, [-x, y, z], SEG.upper, SEG.fore, [-1, -0.6, 0.5]);
      const p = body({ hipC, torso: UP, thigh: [dir(90), dir(90)], shin: [DOWN, DOWN], upper: [L[0], R[0]], fore: [L[1], R[1]], props: benchWithBack(seat, -8, 30) });
      return dumbbellsAt(p, () => [1, 0, 0]);
    },
    cues: [
      "Sit with your back, shoulders and head against the backrest, feet flat on the floor",
      "Hold the weights at shoulder level, palms forward, about shoulder-width apart, elbows pointing a little forward",
      "Press up until your elbows are straight, without arching your lower back",
      "Lower slowly, pulling the weights down rather than letting them drop",
    ],
  },
  {
    // ACE "Crunch": on the back, knees bent, feet flat, heels 12–18 inches from the tailbone; hands behind the head,
    // elbows pulled back; curl up until the upper back is off the mat (the lower back stays down), the head following
    // with the chin slightly towards the chest; lower slowly. The curl is drawn at the waist, about 35°.
    exercise: "crunch",
    pose: (t) => {
      const c = lerp(0, 35, t), hipC: V3 = [0, 5, 0], torso = dir(-90), chest = dir(-90 - c), head = dir(-90 - c - lerp(0, 15, t));
      const [lh, rh] = hipsOf(hipC);
      const L = twoBone(lh, [SEG.hipW, 0, 36], SEG.thigh, SEG.shin, [0, 1, 0]);
      const R = twoBone(rh, [-SEG.hipW, 0, 36], SEG.thigh, SEG.shin, [0, 1, 0]);
      const [ls, rs] = shouldersOf(hipC, torso, chest);
      const neck = add(add(hipC, torso, SEG.lowBack), chest, SEG.upBack), hd = add(neck, head, SEG.neck + SEG.head);
      const behind = add(hd, chest, -4);
      const LA = twoBone(ls, add(behind, [5, 0, 0]), SEG.upper, SEG.fore, [1, 0.2, 0.3]);
      const RA = twoBone(rs, add(behind, [-5, 0, 0]), SEG.upper, SEG.fore, [-1, 0.2, 0.3]);
      return body({ hipC, torso, chest, head, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
    },
    cues: [
      "Lie on your back, knees bent, feet flat, heels about 12 to 18 inches from your tailbone",
      "Hands behind your head, elbows pulled back, and keep them there",
      "Curl up until your upper back lifts off the mat, letting your chin come slightly towards your chest",
      "Lower slowly",
    ],
  },
  {
    // ACE "Standing Crunch" (cable): stand hip-width, knees slightly bent, hips straight, facing away from a cable
    // pulley at its highest setting; rope ends by the ears, elbows tucked in front; roll the rib cage down against the
    // cable and return slowly. Drawn as the upper trunk bending about 40° at the waist.
    exercise: "cableCrunch",
    pose: (t) => {
      const c = lerp(0, 40, t), knee = 10;
      const p0 = body({ hipC: [0, 80, 0], torso: UP, chest: dir(180 - c), head: dir(180 - c - lerp(0, 10, t)),
        thigh: [dir(knee), dir(knee)], shin: [dir(-knee), dir(-knee)], upper: [DOWN, DOWN], fore: [DOWN, DOWN] });
      const g = grounded(p0), { j } = g;
      const chest = dir(180 - c), behind = add(j.head, chest, -2);
      const LA = twoBone(j.lsh, add(behind, [7, 0, 2]), SEG.upper, SEG.fore, [0.3, -1, 1]);
      const RA = twoBone(j.rsh, add(behind, [-7, 0, 2]), SEG.upper, SEG.fore, [-0.3, -1, 1]);
      const p = body({ hipC: j.hipC, torso: UP, chest, head: dir(180 - c - lerp(0, 10, t)),
        thigh: [dir(knee), dir(knee)], shin: [dir(-knee), dir(-knee)], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
      const mid: V3 = [0, 1, 2].map((i) => (p.j.lwr[i] + p.j.rwr[i]) / 2) as V3;
      const pulley: V3 = [0, 168, -46];
      return { ...p, props: [{ kind: "line", a: mid, b: pulley, width: 2 }, { kind: "line", a: [0, 0, -50], b: [0, 172, -50], width: 5 }] };
    },
    cues: [
      "Stand facing away from a high cable pulley, feet hip-width apart, knees slightly bent",
      "Hold the rope ends by your ears, elbows tucked in front of you",
      "Pull your belly button in and roll your rib cage down towards your hips, against the cable",
      "Return slowly to upright",
    ],
  },
  {
    // ACE "Single-arm Row" (dumbbell): left knee and left hand on a bench, hand under the shoulder, knee under the hip,
    // right foot on the floor; back flat; the right arm hangs towards the floor, then pulls the dumbbell up, bending
    // the elbow and drawing the upper arm back, until it can't go further without twisting; lower slowly. The palm's
    // direction isn't given: drawn facing in. Drawn rowing with the right arm.
    exercise: "dbRow", using: ["dumbbells"],
    pose: (t) => {
      const benchY = 40, hipC: V3 = [0, benchY + 2 + SEG.thigh, -12], torso = dir(98);
      const [ls, rs] = shouldersOf(hipC, torso), [, rh] = hipsOf(hipC);
      const LA = twoBone(ls, [SEG.shW, benchY + 1, ls[2]], SEG.upper, SEG.fore, [1, 0, -0.3]);
      const hang: V3 = [rs[0], rs[1] - SEG.upper - SEG.fore + 1, rs[2]], top: V3 = [rs[0] - 2, rs[1] - 16, rs[2] - 14];
      const RA = twoBone(rs, [lerp(hang[0], top[0], t), lerp(hang[1], top[1], t), lerp(hang[2], top[2], t)], SEG.upper, SEG.fore, [0, 1, -1]);
      const RL = twoBone(rh, [-14, 0, -10], SEG.thigh, SEG.shin, [0, 0, 1]);
      const p = body({ hipC, torso, head: dir(95), thigh: [DOWN, RL[0]], shin: [dir(-90), RL[1]], foot: [dir(-170), FWD],
        upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: flatBench(benchY, -62, 40, 8) });
      return { ...p, props: [...p.props, { kind: "dumbbell", at: p.j.rwr, axis: [0, 0, 1] }] };
    },
    cues: [
      "Left knee and left hand on a bench, hand under your shoulder and knee under your hip; right foot on the floor",
      "Back flat and head in line, the weight hanging from your straight right arm",
      "Pull the weight up by bending the elbow and drawing your upper arm back, without twisting your body",
      "Lower slowly, keeping your back flat",
    ],
  },
  {
    // ACE "Romanian Deadlift" (barbell): hold the bar on the front of the thighs, slight knee bend, straight back;
    // push the hips back, lowering the bar towards the floor until there's tension along the back of the legs; stand by
    // pushing the heels down and pulling the knees back, the bar close to the body. How far is a feeling, not a
    // position: drawn to a trunk lean of 70°.
    exercise: "rdl", using: ["barbell"],
    pose: (t) => {
      const lean = lerp(0, 70, t) * Math.PI / 180, hipZ = 6 - SEG.torso * Math.sin(lean);
      const hipC: V3 = [0, Math.sqrt(73 ** 2 - hipZ ** 2), hipZ], torso: V3 = [0, Math.cos(lean), Math.sin(lean)];
      const [lh, rh] = hipsOf(hipC);
      const L = twoBone(lh, [SEG.hipW, 0, 0], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-SEG.hipW, 0, 0], SEG.thigh, SEG.shin, FWD);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [DOWN, DOWN], fore: [DOWN, DOWN] });
      return { ...p, props: [barbell(mid(p.j.lwr, p.j.rwr))] };
    },
    cues: [
      "Hold the bar against the front of your thighs, knees slightly bent, back straight",
      "Push your hips back, lowering the bar towards the floor, until you feel tension along the backs of your legs",
      "Keep the bar close to your body and your back straight",
      "Push your heels into the floor and bring your hips forward to stand",
    ],
  },
  {
    // ACE "Deadlift" (barbell): feet about shoulder-width, toes slightly out, shins almost touching the bar; sit back
    // slightly, straight back, chest up; grip; push the hips forward to stand tall with straight legs; return by sending
    // the hips back and bending the knees, back straight. Starts at the floor, so t = 0 is the bottom here.
    exercise: "deadlift", using: ["barbell"],
    pose: (t) => {
      const u = 1 - t, lean = lerp(0, 55, u) * Math.PI / 180;
      const hipY = lerp(SEG.shin + SEG.thigh - 0.5, 52, u), hipZ = lerp(0, 7 - SEG.torso * Math.sin(55 * Math.PI / 180), u);
      const hipC: V3 = [0, hipY, hipZ], torso: V3 = [0, Math.cos(lean), Math.sin(lean)];
      const toes = 10, [lh, rh] = hipsOf(hipC);
      const L = twoBone(lh, [13, 0, 0], SEG.thigh, SEG.shin, yaw(FWD, toes)), R = twoBone(rh, [-13, 0, 0], SEG.thigh, SEG.shin, yaw(FWD, -toes));
      const [ls, rs] = shouldersOf(hipC, torso);
      const barY = Math.max(20, ls[1] - SEG.upper - SEG.fore);
      const LA = twoBone(ls, [ls[0] + 2, barY, ls[2]], SEG.upper, SEG.fore, [1, 0, 0]), RA = twoBone(rs, [rs[0] - 2, barY, rs[2]], SEG.upper, SEG.fore, [-1, 0, 0]);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], foot: [yaw(FWD, toes), yaw(FWD, -toes)], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
      return { ...p, props: [barbell(mid(p.j.lwr, p.j.rwr))] };
    },
    cues: [
      "Feet about shoulder-width apart, toes turned slightly out, shins almost touching the bar",
      "Sit back slightly with a straight back and your chest up, and grip the bar",
      "Press your feet into the floor and push your hips forward to stand tall, legs straight",
      "Return by sending your hips back and bending your knees, keeping your back straight",
    ],
  },
  {
    // ACE "Chest Press" (dumbbells): on the back on a flat bench, feet on the floor; dumbbells pressed up to straight
    // elbows, at or just below eye level, palms facing forward (towards the feet); lowered together towards the
    // mid-chest, touching lightly; elbows either close to the sides or flared out (drawn flared).
    exercise: "dbBench",
    pose: (t) => {
      const benchY = 38, hipC: V3 = [0, benchY + 6, 0], torso = dir(-90);
      const [ls, rs] = shouldersOf(hipC, torso), [lh, rh] = hipsOf(hipC);
      const top = (s: V3, k: 1 | -1): V3 => [s[0], s[1] + SEG.upper + SEG.fore - 1, s[2] - 4], low = (s: V3, k: 1 | -1): V3 => [s[0] + 7 * k, s[1] + 9, s[2] + 10];
      const at = (s: V3, k: 1 | -1): V3 => { const a = top(s, k), b = low(s, k); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; };
      const LA = twoBone(ls, at(ls, 1), SEG.upper, SEG.fore, [1, -0.6, 0]), RA = twoBone(rs, at(rs, -1), SEG.upper, SEG.fore, [-1, -0.6, 0]);
      const L = twoBone(lh, [12, 0, 44], SEG.thigh, SEG.shin, [0, 1, 1]), R = twoBone(rh, [-12, 0, 44], SEG.thigh, SEG.shin, [0, 1, 1]);
      const p = body({ hipC, torso, head: dir(-90), thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: flatBench(benchY, -72, 14) });
      return dumbbellsAt(p, () => [1, 0, 0]);
    },
    cues: [
      "Lie on a flat bench, feet flat on the floor; head, shoulders and hips on the bench",
      "Press the weights up until your elbows are straight, at or just below eye level, palms facing your feet",
      "Lower them slowly together towards the middle of your chest, touching lightly without bouncing",
      "Press back up",
    ],
  },
  {
    // ACE "Lying Chest Fly" (dumbbells): on a flat bench; dumbbells pressed up shoulder-width apart, arms turned so the
    // palms face in, elbows slightly bent throughout; lowered together in a wide arc until level with the shoulders or
    // chest; raised along the same arc.
    exercise: "dbFly",
    pose: (t) => {
      const benchY = 38, hipC: V3 = [0, benchY + 6, 0], torso = dir(-90);
      const [lh, rh] = hipsOf(hipC), a = lerp(4, 84, t), bend = 14;
      const L = twoBone(lh, [12, 0, 44], SEG.thigh, SEG.shin, [0, 1, 1]), R = twoBone(rh, [-12, 0, 44], SEG.thigh, SEG.shin, [0, 1, 1]);
      const p = body({ hipC, torso, head: dir(-90), thigh: [L[0], R[0]], shin: [L[1], R[1]],
        upper: [dir(180, a), dir(180, -a)], fore: [dir(180, Math.max(a - bend, -4)), dir(180, -Math.max(a - bend, -4))], props: flatBench(benchY, -72, 14) });
      return dumbbellsAt(p, () => [0, 0, 1]); // palms facing in: the handles run head to foot
    },
    cues: [
      "Lie on a flat bench, feet on the floor, weights pressed up above your chest with palms facing each other",
      "Keep a slight bend in your elbows throughout",
      "Lower the weights out to the sides in a wide arc until they are level with your shoulders or chest",
      "Bring them back up along the same arc",
    ],
  },
  {
    // ACE "Standing Shrug" (dumbbells): split stance; dumbbells beside the thighs, palms facing the body, elbows
    // straight; shrug the shoulders up without rolling them or bending the elbows; lower slowly. The height of the shrug
    // isn't given: drawn as 7 units.
    exercise: "shrug", using: ["dumbbells"],
    pose: (t) => {
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, shrug: lerp(0, 7, t),
        thigh: [dir(8), dir(-8)], shin: [dir(8), dir(-8)], upper: [dir(0, 3), dir(0, -3)], fore: [dir(0, 3), dir(0, -3)] }));
      return dumbbellsAt(p, () => [0, 0, 1]);
    },
    cues: [
      "Stand with one foot a little ahead of the other, weights beside your thighs, palms facing you, arms straight",
      "Shrug your shoulders straight up towards your ears",
      "Don't roll your shoulders or bend your elbows",
      "Lower slowly",
    ],
  },
  {
    // ACE "Bent-over Row" (barbell): palms-down grip; bend forward at the hips, back straight, knees slightly bent;
    // arms straight below; pull the bar towards the belly button, back flat; lower slowly. The trunk angle isn't given:
    // drawn at 60° from upright.
    exercise: "bbRow",
    pose: (t) => {
      const lean = 60 * Math.PI / 180, hipZ = 4 - SEG.torso * Math.sin(lean);
      const hipC: V3 = [0, Math.sqrt(72 ** 2 - hipZ ** 2), hipZ], torso: V3 = [0, Math.cos(lean), Math.sin(lean)];
      const [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, torso);
      const L = twoBone(lh, [SEG.hipW, 0, 0], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-SEG.hipW, 0, 0], SEG.thigh, SEG.shin, FWD);
      const waist = add(hipC, torso, SEG.lowBack), belly = add(waist, [0, -Math.sin(lean), Math.cos(lean)], 7);
      const hand = (s: V3): V3 => { const hang: V3 = [s[0], s[1] - SEG.upper - SEG.fore + 1, s[2]], b: V3 = [s[0] * 1.1, belly[1] - 4, belly[2]];
        return [lerp(hang[0], b[0], t), lerp(hang[1], b[1], t), lerp(hang[2], b[2], t)]; };
      const LA = twoBone(ls, hand(ls), SEG.upper, SEG.fore, [0.4, 1, -1]), RA = twoBone(rs, hand(rs), SEG.upper, SEG.fore, [-0.4, 1, -1]);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
      return { ...p, props: [barbell(mid(p.j.lwr, p.j.rwr))] };
    },
    cues: [
      "Grip the bar palms down; bend forward at the hips with a straight back and slightly bent knees",
      "Let the bar hang until your elbows are straight",
      "Pull the bar towards your belly button, keeping your back flat",
      "Lower slowly",
    ],
  },
  {
    // ACE "Chest Press" (barbell): on the back on a flat bench, hands slightly wider than shoulder-width; lift the bar
    // off the rack; lower it to the chest, elbows bending out to the sides, stopping when the elbows are just below the
    // bench; press straight up.
    exercise: "benchPress",
    pose: (t) => {
      const benchY = 38, hipC: V3 = [0, benchY + 6, 0], torso = dir(-90);
      const [ls, rs] = shouldersOf(hipC, torso), [lh, rh] = hipsOf(hipC);
      const hand = (s: V3, k: 1 | -1): V3 => [s[0] + 7 * k, lerp(s[1] + SEG.upper + SEG.fore - 2, s[1] + 11, t), lerp(s[2], s[2] + 8, t)];
      const LA = twoBone(ls, hand(ls, 1), SEG.upper, SEG.fore, [1, -0.7, 0]), RA = twoBone(rs, hand(rs, -1), SEG.upper, SEG.fore, [-1, -0.7, 0]);
      const L = twoBone(lh, [12, 0, 44], SEG.thigh, SEG.shin, [0, 1, 1]), R = twoBone(rh, [-12, 0, 44], SEG.thigh, SEG.shin, [0, 1, 1]);
      const rack: Prop[] = [-1, 1].map((k): Prop => ({ kind: "line", a: [k * 50, 0, -70], b: [k * 50, 112, -70] }));
      const p = body({ hipC, torso, head: dir(-90), thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: [...flatBench(benchY, -72, 14), ...rack] });
      return { ...p, props: [...p.props, barbell(mid(p.j.lwr, p.j.rwr))] };
    },
    cues: [
      "Lie on a flat bench, feet pressed into the floor; grip the bar slightly wider than shoulder-width",
      "Lift the bar off the rack and hold it above your chest, arms straight",
      "Lower it slowly to your chest, elbows bending out to the sides, until they are just below the bench",
      "Press the bar straight back up",
    ],
  },
  {
    // ACE "Seated Leg Press": back and tailbone against the backrest; feet on the plate, toes forward, knees bent
    // about 90° with the heels flat; hands lightly on the handles; push the plate away, heels on the plate, without
    // locking the knees; return under control without the thighs pressing into the ribs. Backrest angle: this site's
    // choice (15° back).
    exercise: "legPress",
    pose: (t) => {
      const hipC: V3 = [0, 40, -6], torso = dir(195), knee = 90 - lerp(0, 80, t);
      const reach = 2 * SEG.thigh * Math.sin(((180 - knee) / 2) * Math.PI / 180), ankleY = 46;
      const az = hipC[2] + Math.sqrt(reach ** 2 - (ankleY - hipC[1]) ** 2);
      const [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, torso);
      const L = twoBone(lh, [SEG.hipW, ankleY, az], SEG.thigh, SEG.shin, [0, 1, 0]), R = twoBone(rh, [-SEG.hipW, ankleY, az], SEG.thigh, SEG.shin, [0, 1, 0]);
      const LA = twoBone(ls, [22, 40, 0], SEG.upper, SEG.fore, [1, 0, -0.5]), RA = twoBone(rs, [-22, 40, 0], SEG.upper, SEG.fore, [-1, 0, -0.5]);
      const pz = az + 3;
      const machine: Prop[] = [
        { kind: "line", a: [0, 36, -16], b: [0, 36, 18], width: 5 }, { kind: "line", a: [0, 36, -16], b: [0, 96, -32], width: 5 },
        { kind: "line", a: [0, 36, 2], b: [0, 0, 2] }, { kind: "line", a: [-16, 36, 2], b: [16, 36, 2] },
        { kind: "line", a: [0, 28, pz], b: [0, 78, pz], width: 5 }, { kind: "line", a: [-22, 53, pz], b: [22, 53, pz], width: 5 },
      ];
      return body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], foot: [UP, UP], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: machine });
    },
    cues: [
      "Sit with your back and tailbone against the backrest; feet flat on the plate, toes forward, knees bent to about a right angle",
      "Hold the handles lightly",
      "Push the plate away, heels staying on it, without locking your knees",
      "Return slowly, without letting your thighs press into your ribs",
    ],
  },
  {
    // ACE "Lying Hamstrings Curl": face down, knees in line with the machine's pivot, pads on the backs of the lower
    // third of the lower legs (not on the heels), hands on the handles; bend the knees until they pass 90°, the lower
    // legs are upright or the pads come close to the buttocks, without arching the back; return slowly. Drawn to 110°.
    exercise: "legCurl",
    pose: (t) => {
      const k = lerp(0, 110, t), hipC: V3 = [0, 45, -2], torso = dir(90);
      const shin = dir(-90 - k), [ls, rs] = shouldersOf(hipC, torso);
      const LA = twoBone(ls, [20, 39, ls[2] + 20], SEG.upper, SEG.fore, [1, 0, 0]), RA = twoBone(rs, [-20, 39, rs[2] + 20], SEG.upper, SEG.fore, [-1, 0, 0]);
      const p = body({ hipC, torso, head: dir(98), thigh: [dir(-90), dir(-90)], shin: [shin, shin], foot: [dir(-k), dir(-k)],
        upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: flatBench(40, -40, 62) });
      const pad = add(p.j.lknee, shin, SEG.shin * 0.72), pad2: V3 = [0, pad[1] + 4 * Math.cos(k * Math.PI / 180), pad[2] + 4 * Math.sin(k * Math.PI / 180)];
      return { ...p, props: [...p.props, { kind: "line", a: [-14, pad2[1], pad2[2]], b: [14, pad2[1], pad2[2]], width: 9 }] };
    },
    cues: [
      "Lie face down with your knees in line with the machine's pivot and the pads on the backs of your lower legs, above the heels",
      "Hold the handles lightly and keep your back from arching",
      "Bend your knees, bringing the pads towards your buttocks, until your lower legs are about upright or further",
      "Pause, then lower slowly",
    ],
  },
  {
    // ACE "Seated Lat Pulldown": thighs under the pad; grip the bar with arms straight overhead; lean back slightly
    // (no more than 30°; drawn at 20°); pull the bar down towards the top or middle of the chest, elbows driving down
    // to the sides, stopping as it nears the chest; return until the elbows are straight. Grip width isn't given: drawn
    // a little wider than the shoulders.
    exercise: "latPulldown",
    pose: (t) => {
      const hipC: V3 = [0, 42, 0], torso = dir(200), [ls, rs] = shouldersOf(hipC, torso), [lh, rh] = hipsOf(hipC);
      const neck = add(add(hipC, torso, SEG.lowBack), torso, SEG.upBack);
      const hand = (s: V3, k: 1 | -1): V3 => lerp3([s[0] + 11 * k, s[1] + SEG.upper + SEG.fore - 2, s[2] + 6], [s[0] + 13 * k, neck[1] - 4, neck[2] + 12], t);
      const LA = twoBone(ls, hand(ls, 1), SEG.upper, SEG.fore, [1, -1, 0]), RA = twoBone(rs, hand(rs, -1), SEG.upper, SEG.fore, [-1, -1, 0]);
      const L = twoBone(lh, [SEG.hipW, 0, 40], SEG.thigh, SEG.shin, [0, 1, 0.3]), R = twoBone(rh, [-SEG.hipW, 0, 40], SEG.thigh, SEG.shin, [0, 1, 0.3]);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]],
        props: [{ kind: "line", a: [0, 38, -14], b: [0, 38, 16], width: 5 }, { kind: "line", a: [0, 38, 0], b: [0, 0, 0] }, { kind: "line", a: [-14, 52, 28], b: [14, 52, 28], width: 7 }] });
      const bar = mid(p.j.lwr, p.j.rwr);
      return { ...p, props: [...p.props, { kind: "line", a: [-34, bar[1], bar[2]], b: [34, bar[1], bar[2]], width: 4 }, cable(bar, [0, 182, bar[2]])] };
    },
    cues: [
      "Sit with your thighs under the pad and grip the bar with your arms straight overhead",
      "Lean back slightly, no more than about 30 degrees",
      "Pull the bar down towards the top or middle of your chest, driving your elbows down to your sides",
      "Let the bar back up slowly until your arms are straight",
    ],
  },
  {
    // ACE "Seated Row" (cable): seated at a low pulley with a narrow handle, feet down, knees bent, back straight; lift
    // the chest and pull the elbows back close to the ribs until the handle touches the stomach; pause; straighten the
    // arms slowly.
    exercise: "cableRow",
    pose: (t) => {
      const hipC: V3 = [0, 38, 0], torso = UP, [ls, rs] = shouldersOf(hipC, torso), [lh, rh] = hipsOf(hipC);
      const hy = hipC[1] + 22, hand = (k: 1 | -1): V3 => lerp3([4 * k, hy, 52], [4 * k, hy, 11], t);
      const LA = twoBone(ls, hand(1), SEG.upper, SEG.fore, [0.4, -0.3, -1]), RA = twoBone(rs, hand(-1), SEG.upper, SEG.fore, [-0.4, -0.3, -1]);
      const L = twoBone(lh, [SEG.hipW, 0, 52], SEG.thigh, SEG.shin, [0, 1, 0]), R = twoBone(rh, [-SEG.hipW, 0, 52], SEG.thigh, SEG.shin, [0, 1, 0]);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]],
        props: [{ kind: "line", a: [0, 34, -16], b: [0, 34, 16], width: 5 }, { kind: "line", a: [0, 34, 0], b: [0, 0, 0] }, { kind: "line", a: [0, 0, 92], b: [0, 70, 92], width: 5 }] });
      const h = mid(p.j.lwr, p.j.rwr);
      return { ...p, props: [...p.props, grip(h, [1, 0, 0], 6), cable(h, [0, hy, 92])] };
    },
    cues: [
      "Sit facing the low pulley, feet down, knees bent, back straight, holding the narrow handle with straight arms",
      "Lift your chest",
      "Pull your elbows back, close to your ribs, until the handle touches your stomach",
      "Pause, then straighten your arms slowly",
    ],
  },
  {
    // ACE "Seated Chest Press" (machine): back against the backrest; handles at mid-chest height and no further back
    // than the front of the chest; press forward until the elbows are straight but not locked, shoulder blades on the
    // backrest; return slowly. Handles drawn upright; elbows drawn a little out.
    exercise: "chestPress",
    pose: (t) => {
      const seat = 36, hipC: V3 = [0, seat + 4, 0], [ls, rs] = shouldersOf(hipC, UP), y = ls[1] - 12;
      const hand = (s: V3, k: 1 | -1): V3 => lerp3([s[0] + 6 * k, y, 8], [s[0] + 2 * k, y, Math.sqrt((SEG.upper + SEG.fore - 2) ** 2 - 144) - 1], t);
      const LA = twoBone(ls, hand(ls, 1), SEG.upper, SEG.fore, [1, -0.6, 0]), RA = twoBone(rs, hand(rs, -1), SEG.upper, SEG.fore, [-1, -0.6, 0]);
      const p = body({ hipC, torso: UP, thigh: [dir(90), dir(90)], shin: [DOWN, DOWN], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: benchWithBack(seat, -8, 30) });
      return { ...p, props: [...p.props, grip(p.j.lwr), grip(p.j.rwr)] };
    },
    cues: [
      "Sit with your back against the backrest, handles at mid-chest height and level with the front of your chest",
      "Grip the handles with your wrists straight",
      "Press forward until your elbows are straight but not locked, keeping your shoulder blades against the backrest",
      "Return slowly",
    ],
  },
  {
    // ACE "Standing Chest Fly" (cable): pulleys slightly above shoulder height; a handle in each hand, step forward so
    // the arms are out to the sides; elbows slightly bent, bring the hands together in front of the body; pause; return
    // slowly. Drawn for the cable version (the linked page).
    exercise: "pecFly",
    pose: (t) => {
      const p0 = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], upper: [DOWN, DOWN], fore: [DOWN, DOWN] }));
      const th = lerp(-8, 95, t) * Math.PI / 180, fr = th + 0.27;
      const up: [V3, V3] = [[Math.cos(th), 0, Math.sin(th)], [-Math.cos(th), 0, Math.sin(th)]];
      const fo: [V3, V3] = [[Math.cos(fr), 0, Math.sin(fr)], [-Math.cos(fr), 0, Math.sin(fr)]];
      const p = body({ hipC: p0.j.hipC, torso: UP, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], upper: up, fore: fo });
      const py = p.j.lsh[1] + 8;
      return { ...p, props: [grip(p.j.lwr), grip(p.j.rwr), cable(p.j.lwr, [80, py, -14]), cable(p.j.rwr, [-80, py, -14]),
        { kind: "line", a: [84, 0, -14], b: [84, py + 20, -14], width: 5 }, { kind: "line", a: [-84, 0, -14], b: [-84, py + 20, -14], width: 5 }] };
    },
    cues: [
      "Set the pulleys slightly above shoulder height, take a handle in each hand and step forward so your arms are out to the sides",
      "Keep a slight bend in your elbows",
      "Bring your hands together in front of you and pause for a second",
      "Return slowly to the start",
    ],
  },
  {
    // ACE "Seated Shoulder Press" (machine): back supported; handles level with or just above the shoulders, elbows a
    // little forward ("4 and 8 o'clock"); press up until the elbows are straight but not locked; pull back down slowly.
    exercise: "shoulderPressMachine",
    pose: (t) => {
      const seat = 36, hipC: V3 = [0, seat + 4, 0], [ls, rs] = shouldersOf(hipC, UP);
      const hand = (s: V3, k: 1 | -1): V3 => lerp3([s[0] + 8 * k, s[1] + 6, 8], [s[0] + 3 * k, s[1] + SEG.upper + SEG.fore - 2, 4], t);
      const LA = twoBone(ls, hand(ls, 1), SEG.upper, SEG.fore, [1, -0.6, 0.5]), RA = twoBone(rs, hand(rs, -1), SEG.upper, SEG.fore, [-1, -0.6, 0.5]);
      const p = body({ hipC, torso: UP, thigh: [dir(90), dir(90)], shin: [DOWN, DOWN], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: benchWithBack(seat, -8, 30) });
      return { ...p, props: [...p.props, grip(p.j.lwr, [0, 0, 1]), grip(p.j.rwr, [0, 0, 1])] };
    },
    cues: [
      "Sit with your back supported, handles level with or just above your shoulders",
      "Elbows slightly in front of your body",
      "Press up until your elbows are straight but not locked",
      "Lower the handles slowly",
    ],
  },
  {
    // ACE "Triceps Pushdowns" (cable): facing the machine, attachment above head height; feet hip-width or staggered;
    // trunk upright; elbows at the sides, by the middle of the trunk; press the handle down until the elbows are
    // straight; return slowly. Drawn for the cable version (the linked page), with a single handle.
    exercise: "pushdown", using: ["machines"],
    pose: (t) => {
      const p0 = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], upper: [DOWN, DOWN], fore: [DOWN, DOWN] }));
      const fore = dir(lerp(115, 4, t)), upper = dir(6);
      const p = body({ hipC: p0.j.hipC, torso: UP, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], upper: [upper, upper], fore: [fore, fore] });
      const h = mid(p.j.lwr, p.j.rwr);
      return { ...p, props: [grip(h, [1, 0, 0], 12), cable(h, [0, 180, 34]), { kind: "line", a: [0, 0, 40], b: [0, 184, 40], width: 5 }] };
    },
    cues: [
      "Stand facing the cable machine with the attachment above head height, feet hip-width apart or one slightly ahead",
      "Keep your body upright and your elbows at your sides",
      "Press the handle down until your elbows are straight",
      "Let it back up slowly, keeping your elbows still",
    ],
  },
  {
    // NSCA "Face Pull (Machine)": face a high pulley, rope held palms down; step back so there's tension with the arms
    // straight in front of the face, elbows out to the sides; feet parallel, knees bent, trunk upright; first draw the
    // shoulder blades back, then pull the rope towards the face, elbows out and bending; as the upper arms line up
    // with the shoulders, turn them so the hands go up and back, until the middle of the rope is close to the face;
    // return the same way. Drawn for the cable version (the linked page).
    exercise: "facePull", using: ["machines"],
    pose: (t) => {
      const p0 = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [dir(8), dir(8)], shin: [dir(-8), dir(-8)], upper: [DOWN, DOWN], fore: [DOWN, DOWN] }));
      const hipC = p0.j.hipC, [ls, rs] = shouldersOf(hipC, UP), headY = ls[1] + SEG.neck + SEG.head;
      const hand = (s: V3, k: 1 | -1): V3 => lerp3([s[0] * 0.3, headY - 2, Math.sqrt((SEG.upper + SEG.fore - 1) ** 2 - (headY - 2 - s[1]) ** 2 - (s[0] * 0.7) ** 2)], [s[0] * 0.9, headY + 6, 10], t);
      const LA = twoBone(ls, hand(ls, 1), SEG.upper, SEG.fore, [1, -0.2, -0.6]), RA = twoBone(rs, hand(rs, -1), SEG.upper, SEG.fore, [-1, -0.2, -0.6]);
      const p = body({ hipC, torso: UP, thigh: [dir(8), dir(8)], shin: [dir(-8), dir(-8)], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
      const h = mid(p.j.lwr, p.j.rwr), pulley: V3 = [0, 176, 90];
      return { ...p, props: [{ kind: "line", a: p.j.lwr, b: h, width: 3 }, { kind: "line", a: p.j.rwr, b: h, width: 3 }, cable(h, pulley), { kind: "line", a: [0, 0, 94], b: [0, 184, 94], width: 5 }] };
    },
    cues: [
      "Face a high pulley holding the rope palms down, arms straight in front of your face, elbows pointing out",
      "Stand with feet side by side and knees slightly bent, body upright",
      "Draw your shoulder blades back, then pull the rope towards your face with your elbows out",
      "As your upper arms come level with your shoulders, turn your hands up and back; return slowly",
    ],
  },
  {
    // Mayo Clinic video "Knee extension with weight machine" (transcript): seated, pad on the tops of the ankles, about
    // 90° between thighs and lower legs; raise the lower legs slowly until the knees are nearly straight, not locked;
    // return slowly all the way to the start. Back support and the handles are drawn as on a typical machine.
    exercise: "legExtension",
    pose: (t) => {
      const seat = 40, hipC: V3 = [0, seat + 4, 0], shin = dir(lerp(0, 78, t));
      const [ls, rs] = shouldersOf(hipC, UP);
      const LA = twoBone(ls, [22, seat + 2, 6], SEG.upper, SEG.fore, [1, 0, -0.4]), RA = twoBone(rs, [-22, seat + 2, 6], SEG.upper, SEG.fore, [-1, 0, -0.4]);
      const p = body({ hipC, torso: UP, thigh: [dir(90), dir(90)], shin: [shin, shin], foot: [dir(lerp(90, 168, t)), dir(lerp(90, 168, t))],
        upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: benchWithBack(seat, -8, 36) });
      const k = lerp(0, 78, t), pad = add(add(p.j.lknee, shin, SEG.shin - 4), dir(k + 90), 4); // just in front of the ankles
      return { ...p, props: [...p.props, { kind: "line", a: [-14, pad[1], pad[2]], b: [14, pad[1], pad[2]], width: 9 }] };
    },
    cues: [
      "Sit on the machine with the pad on the tops of your ankles and your knees bent to about a right angle",
      "Slowly raise your lower legs until your knees are nearly straight, without locking them",
      "Lower slowly all the way back to the start",
      "Keep the movement smooth; moving the pad higher up the lower legs reduces strain on the knees",
    ],
  },
  {
    // ACE-sponsored study "What Is the Best Back Exercise?", the inverted row as performed: bar on a rack at about
    // waist height, grip wider than the shoulders; hang underneath with the body straight, heels on the floor, arms
    // straight; bend the elbows, pulling the chest towards the bar with the shoulder blades drawn back; pause; lower
    // slowly. How close the chest comes isn't given: drawn to about 12 units below the bar.
    exercise: "invertedRow", box: 224,
    pose: (t) => {
      const barY = 80, barZ = 40, heel: V3 = [0, 4, -80];
      const shY = lerp(barY - SEG.upper - SEG.fore + 2, barY - 13, t), len = SEG.shin + SEG.thigh + SEG.torso;
      const th = Math.asin((shY - heel[1]) / len), b: V3 = [0, Math.sin(th), Math.cos(th)], down: V3 = [0, -b[1], -b[2]];
      const hipC = add(heel, b, SEG.shin + SEG.thigh), [ls, rs] = shouldersOf(hipC, b);
      const LA = twoBone(ls, [24, barY, barZ], SEG.upper, SEG.fore, [0.6, -1, -0.3]), RA = twoBone(rs, [-24, barY, barZ], SEG.upper, SEG.fore, [-0.6, -1, -0.3]);
      const toes: V3 = [0, Math.cos(th), -Math.sin(th)];
      const p = body({ hipC, torso: b, thigh: [down, down], shin: [down, down], foot: [toes, toes], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
      const rack: Prop[] = [-48, 48].map((x): Prop => ({ kind: "line", a: [x, 0, barZ + 8], b: [x, barY + 12, barZ + 8], width: 5 }));
      return { ...p, props: [...rack, { kind: "line", a: [-48, barY, barZ], b: [48, barY, barZ], width: 4 }] };
    },
    cues: [
      "Set a bar at about waist height and grip it wider than your shoulders",
      "Hang underneath with your body straight, heels on the floor and arms straight",
      "Bend your elbows to pull your chest towards the bar, drawing your shoulder blades back",
      "Pause at the top, then lower slowly until your arms are straight",
    ],
  },
  {
    // ACE blog "10-minute Shoulder Workout" (Sabrena Jo): stand with the feet under the hips, knees slightly bent; hold
    // a band with the hands in front of the shoulders, palms up; pull the hands apart by squeezing the backs of the
    // shoulders and shoulder blades; pause; reverse slowly. How far apart isn't given: drawn to the arms out to the
    // sides, 10° short of straight out.
    exercise: "bandPullApart",
    pose: (t) => {
      const p0 = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [dir(6), dir(6)], shin: [dir(-6), dir(-6)], upper: [DOWN, DOWN], fore: [DOWN, DOWN] }));
      const a = lerp(80, 10, t) * Math.PI / 180;
      const L: V3 = [Math.cos(a), 0, Math.sin(a)], R: V3 = [-Math.cos(a), 0, Math.sin(a)];
      const p = body({ hipC: p0.j.hipC, torso: UP, thigh: [dir(6), dir(6)], shin: [dir(-6), dir(-6)], upper: [L, R], fore: [L, R] });
      return { ...p, props: [{ kind: "line", a: p.j.lwr, b: p.j.rwr, width: 3 }] };
    },
    cues: [
      "Stand with your feet under your hips and knees slightly bent",
      "Hold a band with your hands in front of your shoulders, palms up, arms straight",
      "Pull your hands apart by squeezing the backs of your shoulders and your shoulder blades together",
      "Pause, then slowly return",
    ],
  },
  {
    // ACE CERTIFIED "Total-body Sprint/Body-weight Circuit" (Jason R. Karp), triceps dips: back to a bench, hands on
    // its edge with the arms nearly straight, legs straight out in front; elbows close to the body; lower by bending the
    // elbows to 90° or slightly less; push back up. The hips move down near the bench as the legs pivot on the heels.
    exercise: "benchDip",
    pose: (t) => {
      const benchY = 42, handZ = -12, heelZ = 60, hy = lerp(48, 34, t);
      const hipC: V3 = [0, hy, heelZ - Math.sqrt((SEG.shin + SEG.thigh) ** 2 - hy ** 2)];
      const leg: V3 = (() => { const d: V3 = [0, -hy, heelZ - hipC[2]], n = Math.hypot(...d); return [0, d[1] / n, d[2] / n]; })();
      const [ls, rs] = shouldersOf(hipC, UP);
      const LA = twoBone(ls, [16, benchY, handZ], SEG.upper, SEG.fore, [0.15, 0, -1]), RA = twoBone(rs, [-16, benchY, handZ], SEG.upper, SEG.fore, [-0.15, 0, -1]);
      const bench: Prop[] = [
        { kind: "line", a: [-44, benchY, handZ - 6], b: [44, benchY, handZ - 6], width: 5 }, { kind: "line", a: [0, benchY, handZ], b: [0, benchY, handZ - 26], width: 5 },
        { kind: "line", a: [-38, benchY, handZ - 6], b: [-38, 0, handZ - 6] }, { kind: "line", a: [38, benchY, handZ - 6], b: [38, 0, handZ - 6] },
      ];
      return body({ hipC, torso: UP, thigh: [leg, leg], shin: [leg, leg], foot: [dir(150), dir(150)], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: bench });
    },
    cues: [
      "Stand with your back to a bench, then lower yourself and hold its edge with your arms nearly straight, legs straight out in front",
      "Keep your elbows close to your body",
      "Lower yourself by bending your elbows to a right angle or slightly less",
      "Push back up with your arms to the start",
    ],
  },
  {
    // ACE "Pull-ups": hang from the bar with the palms facing away, legs crossed; pull up with the elbows driving down
    // to the sides until the chin is level with the bar or the hands; pause; lower until the arms are straight. Grip
    // width isn't given: drawn a little wider than the shoulders.
    exercise: "pullUp", box: 224,
    pose: (t) => {
      const barY = 196, rise = lerp(0, SEG.upper + SEG.fore - 10, t), neckY = barY - SEG.upper - SEG.fore + 1 + rise;
      const hipC: V3 = [0, neckY - SEG.torso, 0], [ls, rs] = shouldersOf(hipC, UP);
      const LA = twoBone(ls, [22, barY, 2], SEG.upper, SEG.fore, [1, -1, 0.2]), RA = twoBone(rs, [-22, barY, 2], SEG.upper, SEG.fore, [-1, -1, 0.2]);
      const p = body({ hipC, torso: UP, thigh: [dir(14, -4), dir(14, 4)], shin: [dir(-30, -6), dir(-30, 6)], foot: [dir(60), dir(60)], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
      return { ...p, props: [{ kind: "line", a: [-44, barY, 2], b: [44, barY, 2], width: 4 }] };
    },
    cues: [
      "Hang from the bar with your palms facing away and your arms straight; cross one leg over the other",
      "Draw your shoulders back and down",
      "Pull up, driving your elbows down towards your sides, until your chin is level with the bar or your hands",
      "Pause, then lower slowly until your arms are straight",
    ],
  },
  {
    // NASM "Pike Push-Up": start in an inverted V (a "downward dog"), hands slightly wider than the shoulders; lower the
    // head towards the floor by bending the elbows, about 45° from the body, until it nearly touches; press back up.
    // How far the hips move isn't given: drawn moving forward a little as the head goes down.
    exercise: "pikePushUp",
    pose: (t) => {
      const hands: [V3, V3] = [[18, 0, 40], [-18, 0, 40]], ankleY = 8, ankleZ = -36;
      const hipTop: V3 = [0, 75, -26], hipLow: V3 = [0, 70, 0];
      const hipC = lerp3(hipTop, hipLow, t);
      const topDir: V3 = (() => { const d: V3 = [0, -hipTop[1], 40 - hipTop[2]], n = Math.hypot(...d); return [0, d[1] / n, d[2] / n]; })();
      const lowDir: V3 = [0, -54 / 60, 26 / 60];
      const torso: V3 = (() => { const d = lerp3(topDir, lowDir, t), n = Math.hypot(...d); return [0, d[1] / n, d[2] / n]; })();
      const [ls, rs] = shouldersOf(hipC, torso), [lh, rh] = hipsOf(hipC);
      const LA = twoBone(ls, hands[0], SEG.upper, SEG.fore, [0.7, 0.3, -0.7]), RA = twoBone(rs, hands[1], SEG.upper, SEG.fore, [-0.7, 0.3, -0.7]);
      const L = twoBone(lh, [6, ankleY, ankleZ], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-6, ankleY, ankleZ], SEG.thigh, SEG.shin, FWD);
      return body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], foot: [dir(48), dir(48)], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
    },
    cues: [
      "Start in an upside-down V: hands slightly wider than your shoulders, hips high",
      "Bend your elbows, at about 45 degrees from your body, to lower your head towards the floor",
      "Stop when your head nearly touches the floor",
      "Press back up to the V",
    ],
  },
  {
    // ACE "Goblet Squat" (dumbbell): feet about shoulder-width; one dumbbell held upright in front of the chest, elbows
    // close to the ribs, back straight; lower until the hips are below the knees; push the feet down to stand.
    exercise: "gobletSquat", using: ["dumbbells"],
    pose: (t) => {
      const p = squatPose(t, { depth: 108, shin: 40, lean: 32, wide: 8 }, (sh, torso, neck) => {
        const chest = add(add(neck, torso, -12), front(torso), 12);
        const L = twoBone(sh[0], add(chest, [3, 0, 0]), SEG.upper, SEG.fore, [0.3, -1, 0.2]), R = twoBone(sh[1], add(chest, [-3, 0, 0]), SEG.upper, SEG.fore, [-0.3, -1, 0.2]);
        return [[L[0], R[0]], [L[1], R[1]]];
      });
      const torso: V3 = (() => { const d: V3 = [0, p.j.neck[1] - p.j.hipC[1], p.j.neck[2] - p.j.hipC[2]], n = Math.hypot(...d); return [0, d[1] / n, d[2] / n]; })();
      return { ...p, props: [{ kind: "dumbbell", at: mid(p.j.lwr, p.j.rwr), axis: torso }] };
    },
    cues: [
      "Stand with your feet about shoulder-width apart, holding one dumbbell upright in front of your chest",
      "Keep your elbows close to your ribs and your back straight",
      "Lower into a squat until your hips are below your knees",
      "Push both feet into the floor to stand back up",
    ],
  },
  {
    // ACE "Lunge" (dumbbells): feet hip-width, a dumbbell in each hand at the sides, palms facing in; step forward and
    // lower the back knee towards the floor to a comfortable depth; push off the front foot to bring the feet back
    // together. Drawn like the forward lunge, starting hip-width, with the depth at the front thigh about parallel.
    exercise: "lungeDb",
    pose: (t) => dumbbellsAt(lungePose(t, SEG.hipW), () => [0, 0, 1]),
    cues: [
      "Stand with your feet hip-width apart, a dumbbell in each hand at your sides, palms facing in",
      "Keep your back straight and step forward with one leg",
      "As the front foot lands, lower your back knee towards the floor, as far as is comfortable",
      "Push off the front foot to return to the start",
    ],
  },
  {
    // ACE "Front Raise" (dumbbells): dumbbells in front of the thighs, palms facing the thighs, elbows straight or
    // slightly bent; split stance or feet slightly wider than hip-width; raise until the arms are level with the
    // shoulders, roughly parallel to the floor; past about 60–70° the inner ends tilt slightly up; lower slowly.
    exercise: "frontRaise",
    pose: (t) => {
      const a = lerp(8, 90, t);
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [dir(0, 4), dir(0, -4)], shin: [dir(0, 4), dir(0, -4)],
        upper: [dir(a, 3), dir(a, -3)], fore: [dir(a - 6, 2), dir(a - 6, -2)] }));
      const tilt = (a > 65 ? ((a - 65) / 25) * 15 : 0) * Math.PI / 180;
      return dumbbellsAt(p, (s) => (s === "l" ? [Math.cos(tilt), -Math.sin(tilt), 0] : [Math.cos(tilt), Math.sin(tilt), 0]));
    },
    cues: [
      "Stand with your feet slightly wider than hip-width, dumbbells in front of your thighs, palms facing them",
      "Keep your elbows straight or slightly bent",
      "Raise the weights in front of you until your arms are level with your shoulders",
      "Lower slowly to the start",
    ],
  },
  {
    // ACE "Standing Shoulder Press" (barbell): bar resting across the front of the shoulders, hands about
    // shoulder-width, palms up, elbows pointing forward; press the bar straight overhead; lower slowly to the shoulders.
    exercise: "ohp", box: 224,
    pose: (t) => {
      const p0 = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], upper: [DOWN, DOWN], fore: [DOWN, DOWN] }));
      const hipC = p0.j.hipC, [ls, rs] = shouldersOf(hipC, UP), neck = add(hipC, UP, SEG.torso);
      const bar = lerp3([0, neck[1] + 1, 10], [0, neck[1] + SEG.upper + SEG.fore - 2, 2], t);
      const LA = twoBone(ls, [17, bar[1], bar[2]], SEG.upper, SEG.fore, [0.25, -0.6, 1]), RA = twoBone(rs, [-17, bar[1], bar[2]], SEG.upper, SEG.fore, [-0.25, -0.6, 1]);
      const p = body({ hipC, torso: UP, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
      return { ...p, props: [barbell(mid(p.j.lwr, p.j.rwr))] };
    },
    cues: [
      "Take the bar from a rack at about shoulder height, hands about shoulder-width apart, palms up",
      "Rest it across the front of your shoulders with your elbows pointing forward, then step back, standing tall",
      "Press the bar straight overhead",
      "Lower it slowly back to your shoulders",
    ],
  },
  {
    // ACE "Elevated Glute Bridge" (dumbbells), the linked page for the hip thrust: upper back and shoulders across a
    // bench, body at right angles to it; feet hip-width on the floor; a dumbbell in each hand resting on the hips; lower
    // the tailbone towards the floor; press the feet down and squeeze the glutes to rise. Drawn for the dumbbell version
    // (the linked page); the top is drawn with the trunk about level.
    exercise: "hipThrust", using: ["dumbbells"],
    pose: (t) => {
      const benchY = 40, neck: V3 = [0, benchY + 6, -36], hy = lerp(benchY + 4, 14, t);
      const hz = neck[2] + Math.sqrt(SEG.torso ** 2 - (neck[1] - hy) ** 2), hipC: V3 = [0, hy, hz];
      const torso: V3 = [0, (neck[1] - hy) / SEG.torso, (neck[2] - hz) / SEG.torso];
      const [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, torso);
      const L = twoBone(lh, [SEG.hipW, 0, 46], SEG.thigh, SEG.shin, [0, 1, 0.3]), R = twoBone(rh, [-SEG.hipW, 0, 46], SEG.thigh, SEG.shin, [0, 1, 0.3]);
      const LA = twoBone(ls, [13, hy + 7, hz - 2], SEG.upper, SEG.fore, [1, 1, 0]), RA = twoBone(rs, [-13, hy + 7, hz - 2], SEG.upper, SEG.fore, [-1, 1, 0]);
      const bench: Prop[] = [{ kind: "line", a: [-40, benchY, neck[2]], b: [40, benchY, neck[2]], width: 5 }, { kind: "line", a: [0, benchY, neck[2] - 8], b: [0, benchY, neck[2] + 6], width: 5 },
        { kind: "line", a: [-34, benchY, neck[2]], b: [-34, 0, neck[2]] }, { kind: "line", a: [34, benchY, neck[2]], b: [34, 0, neck[2]] }];
      const p = body({ hipC, torso, head: dir(-90), thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: bench });
      return dumbbellsAt(p, () => [1, 0, 0]);
    },
    cues: [
      "Rest your upper back and shoulders across a bench, feet hip-width apart on the floor",
      "Hold a dumbbell in each hand resting on your hips",
      "Lower your tailbone slowly towards the floor",
      "Press your feet into the floor and squeeze your glutes to rise back up",
    ],
  },
  {
    // ACE "Triceps Extension" (dumbbell): split stance; both hands round one dumbbell, pressed overhead with the upper
    // arms upright and the elbows forward, shoulder-width apart; lower it behind the head without moving the upper
    // arms until the elbows reach 90° (or the upper arms start to move); press it back up.
    exercise: "overheadExt", using: ["dumbbells"], box: 224,
    pose: (t) => {
      const bend = lerp(4, 90, t), inward = 30;
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [dir(8), dir(-8)], shin: [dir(8), dir(-8)],
        upper: [dir(178), dir(178)], fore: [dir(178 + bend, -inward), dir(178 + bend, inward)] }));
      return { ...p, props: [{ kind: "dumbbell", at: mid(p.j.lwr, p.j.rwr), axis: [0, 1, 0] }] };
    },
    cues: [
      "Stand with one foot ahead of the other, holding one dumbbell overhead in both hands",
      "Upper arms upright, elbows pointing forward and about shoulder-width apart",
      "Lower the weight behind your head, without moving your upper arms, until your elbows are at a right angle",
      "Press it back up overhead",
    ],
  },
  {
    // ACE "Farmer's Carry" (dumbbells): a dumbbell in each hand, firm grip, arms at the sides with the weights beside
    // the hips; back straight; walk a set distance, turn and come back. Drawn walking on the spot. The page says
    // "palms facing down", which doesn't fit weights held at the sides; drawn with the handles front to back.
    exercise: "farmerCarry", using: ["dumbbells"],
    pose: (t) => {
      const swing = Math.cos(Math.PI * t) * 20, knee = (s: number) => Math.max(0, -s) * 1.2;
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [dir(swing), dir(-swing)], shin: [dir(swing - knee(swing)), dir(-swing - knee(-swing))],
        foot: [dir(90 - knee(swing) * 0.4), dir(90 - knee(-swing) * 0.4)], upper: [dir(0, 4), dir(0, -4)], fore: [dir(0, 3), dir(0, -3)] }));
      return dumbbellsAt(p, () => [0, 0, 1]);
    },
    cues: [
      "Hold a dumbbell in each hand with a firm grip, arms at your sides, weights beside your hips",
      "Keep your back straight",
      "Walk a set distance",
      "Turn round and walk back",
    ],
  },
  {
    // ACE "Single-leg Romanian Deadlift" (no equipment): feet hip-width, back straight, knees slightly bent; push the
    // hips back and lift one foot, straightening that leg behind; lean forward as far as is comfortable; stand back up,
    // bringing the leg down. Hands "in any fashion for balance": drawn hanging. Drawn for the bodyweight version.
    exercise: "singleLegRdl", using: ["body"],
    pose: (t) => {
      const L = lerp(0, 72, t) * Math.PI / 180, torso: V3 = [0, Math.cos(L), Math.sin(L)];
      const ankle: V3 = [-SEG.hipW, 0, 0], hz = -18 * Math.sin(L), hipC: V3 = [0, Math.sqrt(74 ** 2 - hz ** 2), hz];
      const [, rh] = hipsOf(hipC), R = twoBone(rh, ankle, SEG.thigh, SEG.shin, FWD);
      const back: V3 = [0, -Math.cos(L), -Math.sin(L)], [lh] = hipsOf(hipC);
      const LL = twoBone(lh, add(lh, back, 74), SEG.thigh, SEG.shin, FWD); // the lifted leg keeps the same slight bend
      return body({ hipC, torso, thigh: [LL[0], R[0]], shin: [LL[1], R[1]], foot: [dir(90 - Math.max(0, (L * 180) / Math.PI - 14)), FWD], upper: [DOWN, DOWN], fore: [DOWN, DOWN] });
    },
    cues: [
      "Stand with your feet hip-width apart, back straight and knees slightly bent",
      "Push your hips back and lift one foot, straightening that leg behind you",
      "Lean forward as far as is comfortable, keeping your back straight",
      "Stand back up, bringing the raised leg back down; do all reps on one leg, then switch",
    ],
  },
  {
    // ACE "Back Squat" (barbell): bar across the top of the back behind the neck, hands wider than shoulder-width,
    // chest up, shoulder blades squeezed; feet a little wider than shoulder-width; sit back with the back straight and
    // chest up until the hips are below the knees; push the feet down and the hips forward to stand.
    exercise: "backSquat",
    pose: (t) => {
      const p = squatPose(t, { depth: 106, shin: 38, lean: 42, wide: 9 }, (sh, torso, neck) => {
        const bar = add(add(neck, front(torso), -5), torso, 2);
        const L = twoBone(sh[0], add(bar, [28, 0, 0]), SEG.upper, SEG.fore, [0.4, -1, -0.5]), R = twoBone(sh[1], add(bar, [-28, 0, 0]), SEG.upper, SEG.fore, [-0.4, -1, -0.5]);
        return [[L[0], R[0]], [L[1], R[1]]];
      });
      return { ...p, props: [barbell(mid(p.j.lwr, p.j.rwr))] };
    },
    cues: [
      "Take the bar from a rack just below shoulder height onto the top of your back, hands wider than your shoulders",
      "Step back and set your feet a little wider than shoulder-width; chest up, shoulder blades squeezed",
      "Sit back into your hips, back straight, until your hips are below your knees",
      "Press your feet into the floor and push your hips forward to stand",
    ],
  },
  {
    // Mayo Clinic "Walking: Trim your waistline, improve your health": head up, looking forward; neck, shoulders and
    // back relaxed; arms swinging freely with a slight bend in the elbows; stomach a little tight, back straight;
    // rolling each foot from heel to toe. Drawn on the spot, as on a treadmill, three strides per loop.
    exercise: "walk", loop: true,
    pose: (t) => stride(frac(3 * t), { hipY: 72, land: 20, push: -20, stance: 0.6, lift: 6, kick: 0, lean: 0, bob: 1.5, arm: 18, elbow: 20 }),
    cues: [
      "Keep your head up and look forward, not down",
      "Relax your neck, shoulders and back",
      "Swing your arms freely with a slight bend in your elbows",
      "Keep your back straight and roll each foot from heel to toe",
    ],
  },
  {
    // ACE "5 Tips for Optimizing Running Form" (Nicole Thompson, 2024): the foot lands directly under the hips (no
    // overstriding); arms bent at about 90°, swinging forward and back from the shoulder without crossing the body's
    // midline; a slight forward lean from the ankles, not the waist; cadence often around 180 steps a minute. Drawn
    // on the spot with the trunk nearly upright and the feet landing just ahead of the hips; four strides per loop.
    exercise: "run", loop: true,
    pose: (t) => stride(frac(4 * t), { hipY: 66, land: 6, push: -30, stance: 0.4, lift: 10, kick: 28, lean: 3, bob: 3, arm: 30, elbow: 90 }),
    cues: [
      "Land with your foot under your hips rather than reaching out in front",
      "Keep your elbows bent at about a right angle, swinging forward and back without crossing your body",
      "Lean slightly forward from your ankles, not your waist",
      "Take short, quick steps",
    ],
  },
  {
    // ACE "Indoor Cycling: The Breakdown on Bike Set-Up" (read through search excerpts; the page itself could not be
    // opened here): saddle height so the leg is as long as possible with the pedal at the bottom while staying
    // comfortable in the saddle; the knee lined up over the pedal. Riding position, the slight lean and the hand
    // position on the bars are this site's choices. Four turns of the pedals per loop.
    exercise: "cycle", loop: true,
    pose: (t) => {
      const C: V3 = [0, 34.7, 16], r = 17, hipC: V3 = [0, 90, 0], torso = dir(155), a = TAU * frac(4 * t);
      const pedal = (s: 1 | -1, th: number): V3 => [s * 10, C[1] + r * Math.cos(th), C[2] + r * Math.sin(th)];
      const P = [pedal(1, a), pedal(-1, a + Math.PI)];
      const [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, torso);
      const L = twoBone(lh, add(P[0], [0, 3, -6]), SEG.thigh, SEG.shin, [0, 0.3, 1]), R = twoBone(rh, add(P[1], [0, 3, -6]), SEG.thigh, SEG.shin, [0, 0.3, 1]);
      const bars: [V3, V3] = [[17, 113, 58], [-17, 113, 58]];
      const AL = twoBone(ls, bars[0], SEG.upper, SEG.fore, [0.5, -1, 0]), AR = twoBone(rs, bars[1], SEG.upper, SEG.fore, [-0.5, -1, 0]);
      const props: Prop[] = [
        { kind: "line", a: [0, 86, -8], b: [0, 86, 6], width: 5 },
        { kind: "line", a: [0, 86, -1], b: C },
        { kind: "line", a: [0, 2, -30], b: [0, 2, 70] },
        { kind: "line", a: [-22, 2, -25], b: [22, 2, -25] },
        { kind: "line", a: [-22, 2, 64], b: [22, 2, 64] },
        { kind: "line", a: [0, 2, -22], b: C },
        { kind: "line", a: [0, 2, 62], b: [0, 113, 56] },
        { kind: "line", a: [-19, 113, 58], b: [19, 113, 58] },
        ...P.map((p): Prop => ({ kind: "line", a: C, b: [0, p[1], p[2]], width: 3 })),
        ...P.map((p): Prop => ({ kind: "line", a: [Math.sign(p[0]) * 5, p[1], p[2]], b: [Math.sign(p[0]) * 14, p[1], p[2]], width: 3 })),
      ];
      return body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], foot: [dir(80), dir(80)], upper: [AL[0], AR[0]], fore: [AL[1], AR[1]], props });
    },
    cues: [
      "Set the saddle so your leg is almost straight with the pedal at the bottom, while you still sit comfortably",
      "Line your knee up over the pedal",
      "Pedal in smooth circles",
    ],
  },
  {
    // Concept2 "Indoor Rowing Technique". Catch: arms straight, shoulders level, leaning forward from the hips with the
    // shoulders in front of the hips, shins vertical. Drive: legs first, then the back swings through vertical, then
    // the arms pull; hands move in a straight line. Finish: leaning back slightly, legs extended, handle lightly below
    // the ribs. Recovery: the reverse (arms, then lean forward, then knees bend once the hands have passed them).
    // Drawn with the drive and recovery taking equal time, though the page's drills suggest a slower recovery.
    exercise: "row",
    pose: (t) => {
      const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
      const legs = ease(t / 0.5), back = ease((t - 0.3) / 0.45), arms = ease((t - 0.65) / 0.35);
      const hipC: V3 = [0, 25, lerp(-4.7, -53, legs)], torso = dir(lerp(150, 195, back)), [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, torso);
      const L = twoBone(lh, [9, 14, 22], SEG.thigh, SEG.shin, [0, 1, 0]), R = twoBone(rh, [-9, 14, 22], SEG.thigh, SEG.shin, [0, 1, 0]);
      const H = 50, dy = Math.min(53.9, Math.abs(ls[1] - H)), reach = ls[2] + Math.sqrt(53.9 ** 2 - dy ** 2);
      const ribs = add(hipC, torso, 28), hz = lerp(reach, ribs[2] + 5, arms);
      const AL = twoBone(ls, [10, H, hz], SEG.upper, SEG.fore, [0.6, -0.3, -1]), AR = twoBone(rs, [-10, H, hz], SEG.upper, SEG.fore, [-0.6, -0.3, -1]);
      const props: Prop[] = [
        { kind: "line", a: [0, 10, -82], b: [0, 10, 80] },
        { kind: "line", a: [0, 21, hipC[2] - 7], b: [0, 21, hipC[2] + 7], width: 5 },
        { kind: "line", a: [0, 10, 18], b: [0, 27, 32] },
        { kind: "line", a: [-14, 18, 26], b: [14, 18, 26] },
        { kind: "line", a: [0, 4, 82], b: [0, 58, 82], width: 6 },
        { kind: "line", a: [0, H, hz], b: [0, H, 80], width: 2 },
        { kind: "line", a: [-14, H, hz], b: [14, H, hz] },
      ];
      return body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], foot: [dir(140), dir(140)], upper: [AL[0], AR[0]], fore: [AL[1], AR[1]], props });
    },
    cues: [
      "Start at the catch: arms straight, leaning forward from the hips, shins vertical",
      "Push with your legs first, then swing your back past upright, then pull the handle to just below your ribs",
      "Return in reverse: arms out, lean forward from the hips, then bend your knees once your hands pass them",
      "Keep your shoulders low and relaxed and your hands moving in a straight line",
    ],
  },
  {
    // Cleveland Clinic "Treadmill or Elliptical?" (Katie Lawton, 2022): feet on the pedals about shoulder-width apart,
    // moving in an oval like riding a bike while standing; hands on the handles, moving the arms towards and away from
    // the body as the feet move. The page doesn't describe posture: drawn upright, and with each arm moving with the
    // opposite leg as in walking, both this site's choices. The machine itself is simplified. Three cycles per loop.
    exercise: "elliptical", loop: true,
    pose: (t) => {
      const a = TAU * frac(3 * t), hipC: V3 = [0, 82, -4], [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, UP);
      const pedal = (s: 1 | -1, th: number): V3 => [s * 10, 18 + 8 * Math.cos(th), -4 + 22 * Math.sin(th)];
      const P = [pedal(1, a), pedal(-1, a + Math.PI)];
      const L = twoBone(lh, P[0], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, P[1], SEG.thigh, SEG.shin, FWD);
      const hand = (s: 1 | -1, th: number): V3 => { const al = (18 * Math.sin(th) * Math.PI) / 180; return [s * 20, 75 + 38 * Math.cos(al), 30 - 38 * Math.sin(al)]; };
      const Hn = [hand(1, a), hand(-1, a + Math.PI)];
      const AL = twoBone(ls, Hn[0], SEG.upper, SEG.fore, [0.3, -1, -0.3]), AR = twoBone(rs, Hn[1], SEG.upper, SEG.fore, [-0.3, -1, -0.3]);
      const props: Prop[] = [
        { kind: "line", a: [0, 2, -50], b: [0, 2, 55] },
        { kind: "line", a: [-22, 2, -44], b: [22, 2, -44] },
        { kind: "line", a: [-22, 2, 48], b: [22, 2, 48] },
        { kind: "line", a: [0, 2, 46], b: [0, 96, 40], width: 5 },
        { kind: "line", a: [-20, 75, 30], b: [20, 75, 30] },
        ...P.map((p): Prop => ({ kind: "line", a: [p[0], p[1] - 1, p[2] - 4], b: [p[0], p[1] - 1, p[2] + 15], width: 5 })),
        ...Hn.map((h): Prop => ({ kind: "line", a: [h[0], 75, 30], b: add(h, [0, 6 * (h[1] - 75) / 38, 6 * (h[2] - 30) / 38]), width: 4 })),
      ];
      return body({ hipC, torso: UP, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [AL[0], AR[0]], fore: [AL[1], AR[1]], props });
    },
    cues: [
      "Hold the handles and step onto the pedals, feet about shoulder-width apart",
      "Move your feet round in the machine's oval path",
      "Push and pull the handles, moving your arms towards and away from your body in time with your feet",
    ],
  },
  {
    // ACE "6 Exercise Swaps That Will Kick up the Intensity of Your Workout" (Stephanie Thielen, 2015), swap 6: a rope
    // that reaches the shoulders when folded in half; handles in each hand, forearms at least a foot from the body;
    // arms still, turning the rope with the hands and wrists; jumping off the balls of the feet, the motion in the
    // ankles rather than the knees. Four turns of the rope per loop, one small jump for each.
    exercise: "skip", loop: true,
    pose: (t) => {
      const u = frac(4 * t), lift = 3 + 3 * Math.cos(TAU * u);
      const ankleY = lift + SEG.foot * Math.cos((50 * Math.PI) / 180), ankleZ = 8 - SEG.foot * Math.sin((50 * Math.PI) / 180);
      const hipC: V3 = [0, ankleY + 74, -1], [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, UP);
      const L = twoBone(lh, [SEG.hipW, ankleY, ankleZ], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-SEG.hipW, ankleY, ankleZ], SEG.thigh, SEG.shin, FWD);
      const w: V3 = [0, 2 * Math.sin(TAU * u), 2 * Math.cos(TAU * u)];
      const hands: [V3, V3] = [add([26, hipC[1] + 2, 10], w), add([-26, hipC[1] + 2, 10], w)];
      const AL = twoBone(ls, hands[0], SEG.upper, SEG.fore, [0.2, -1, -0.4]), AR = twoBone(rs, hands[1], SEG.upper, SEG.fore, [-0.2, -1, -0.4]);
      const loopAt = (x: number): V3 => [x, 81 - 80.5 * Math.cos(TAU * u), -1 - 28 * Math.sin(TAU * u)];
      const rope: V3[] = Array.from({ length: 13 }, (_, i) => {
        const s = i / 12, x = lerp(hands[1][0], hands[0][0], s), k = Math.sin(Math.PI * s) ** 0.6;
        return lerp3(lerp3(hands[1], hands[0], s), loopAt(x), k);
      });
      const props: Prop[] = rope.slice(1).map((p, i): Prop => ({ kind: "line", a: rope[i], b: p, width: 2 }));
      return body({ hipC, torso: UP, thigh: [L[0], R[0]], shin: [L[1], R[1]], foot: [dir(50), dir(50)], upper: [AL[0], AR[0]], fore: [AL[1], AR[1]], props });
    },
    cues: [
      "Choose a rope that reaches your shoulders when folded in half",
      "Hold a handle in each hand with your forearms about a foot from your body",
      "Keep your arms still and turn the rope with your hands and wrists",
      "Jump just high enough to clear the rope, pushing off the balls of your feet and moving mostly at the ankles",
    ],
  },
  {
    // NHS South Tees Hospitals "Strength and balance exercise programme for falls prevention" (South Tees Falls Team,
    // 2023), "Stair practice": hold the handrail without pulling too much with the arms; go up and down the stairs;
    // if taking one step at a time, lead with the stronger leg going up and the weaker leg coming down; place the foot
    // fully on each step; look down with the eyes only, without leaning forward. Drawn going up, one foot per step,
    // with the stairs moving down past the figure so it stays in view; two strides per loop.
    exercise: "stairs", loop: true,
    pose: (t) => {
      const u = frac(2 * t), rise = 16, going = 25;
      const foot = (v: number): V3 => {
        if (v < 0.5) return [0, 40 - 32 * v, 10 - 50 * v];
        const s = (v - 0.5) / 0.5;
        return [0, lerp(24, 40, s) + 12 * Math.sin(Math.PI * s), lerp(-15, 10, 0.5 - 0.5 * Math.cos(Math.PI * s))];
      };
      const FL = foot(u), FR = foot(frac(u + 0.5));
      const hipC: V3 = [0, 95, -2], [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, UP);
      const L = twoBone(lh, add(FL, [SEG.hipW, 0, 0]), SEG.thigh, SEG.shin, FWD), R = twoBone(rh, add(FR, [-SEG.hipW, 0, 0]), SEG.thigh, SEG.shin, FWD);
      const railY = (z: number) => 40 + (rise / going) * (z - 29) + 76;
      const AR = twoBone(rs, [-26, railY(8), 8], SEG.upper, SEG.fore, [-0.3, -1, -0.5]);
      const sw = 10 * Math.sin(TAU * u);
      const props: Prop[] = [];
      for (let k = -8; k <= 8; k++) {
        const m = k - 2 * u, y = 40 + rise * m, z0 = 4 + going * m;
        props.push(...clipped([0, y, z0], [0, y, z0 + going], -90, 90, 0, 180), ...clipped([0, y - rise, z0], [0, y, z0], -90, 90, 0, 180));
        if (y >= 0 && Math.abs(z0 + going / 2) <= 40) props.push({ kind: "line", a: [-22, y, z0 + going / 2], b: [22, y, z0 + going / 2], width: 2 });
      }
      props.push(...clipped([-26, railY(-90), -90], [-26, railY(90), 90], -90, 90, 0, 180).map((q) => ({ ...q, width: 3 })));
      return body({ hipC, torso: UP, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [dir(sw, 4), AR[0]], fore: [dir(sw + 15, 2), AR[1]], props });
    },
    cues: [
      "Hold the handrail, but try not to pull yourself up with your arms",
      "Place your whole foot on each step",
      "Look down with your eyes only, without leaning forward",
      "If going one step at a time, lead with your stronger leg going up and your weaker leg coming down",
    ],
  },
  {
    // Swim England "Tips for getting front crawl right": float face down, body stretched long; legs long, toes
    // pointed, kicking up and down fast and continuously with loose ankles; one arm pulls under the body to the thigh,
    // comes out and sweeps over the water to enter in front of the head, the arms moving continuously so one enters as
    // the other leaves at the thigh; breathe by turning the head to the side, one ear in the water. The head turn for
    // breathing isn't drawn; the shoulders' roll and the six kicks per stroke cycle are this site's choices.
    exercise: "swim", loop: true, box: 240,
    pose: (t) => {
      const hipC: V3 = [0, 70, -14], kick = (s: number) => 6 * Math.sin(TAU * 3 * t + (s > 0 ? 0 : Math.PI));
      const p = body({ hipC, torso: FWD, head: FWD, thigh: [dir(-90 + kick(1)), dir(-90 + kick(-1))], shin: [dir(-90 + 1.6 * kick(1)), dir(-90 + 1.6 * kick(-1))],
        foot: [dir(-90), dir(-90)], upper: [DOWN, DOWN], fore: [DOWN, DOWN] });
      const roll = (20 * Math.sin(TAU * t) * Math.PI) / 180, neck = p.j.neck;
      const arm = (side: 1 | -1, phi: number) => {
        let up: number, fore: number, out: number;
        if (phi < 0.5) { const s = phi / 0.5; up = 90 - 180 * s; fore = up * (1 - 0.5 * Math.sin(Math.PI * s)); out = -10 * Math.sin(Math.PI * s); }
        else { const s = (phi - 0.5) / 0.5; up = -90 - 180 * s; fore = up - 150 * Math.sin(Math.PI * s); out = 20 * Math.sin(Math.PI * s); }
        const sh = add(neck, [side * SEG.shW * Math.cos(roll), -side * SEG.shW * Math.sin(roll), 0]);
        const el = add(sh, dir(up, side * out), SEG.upper);
        return { sh, el, wr: add(el, dir(fore, side * out), SEG.fore) };
      };
      const l = arm(1, frac(t)), r = arm(-1, frac(t + 0.5));
      const j = { ...p.j, lsh: l.sh, lel: l.el, lwr: l.wr, rsh: r.sh, rel: r.el, rwr: r.wr };
      return { j, props: [{ kind: "line", a: [0, 74, -114], b: [0, 74, 114], width: 2 }, { kind: "line", a: [-60, 74, 0], b: [60, 74, 0], width: 2 }] };
    },
    cues: [
      "Float face down with your body stretched out long",
      "Kick your legs up and down continuously, legs long and toes pointed, ankles loose",
      "Pull one arm under your body to your thigh, then sweep it over the water to enter in front of your head",
      "Turn your head to the side to breathe in, keeping one ear in the water; breathe out with your face in the water",
    ],
  },
  {
    // ACE "Swing" (kettlebell; read through search excerpts): feet shoulder-width apart, knees slightly bent, both
    // hands on the handle, palms down; back straight, sit back into the hips to swing the kettlebell back between the
    // legs under the hips; lift the chest, push the hips forward and straighten the knees to swing it up in front, the
    // power coming from the legs and hips, not the shoulders; let it rise to chest height, then back down.
    exercise: "kbSwing",
    pose: (t) => {
      const hipC: V3 = [0, lerp(72, 75, t), lerp(-14, -1, t)], torso = dir(lerp(120, 180, t)), [lh, rh] = hipsOf(hipC);
      const L = twoBone(lh, [12, 0, 0], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-12, 0, 0], SEG.thigh, SEG.shin, FWD);
      const neck = add(hipC, torso, SEG.torso), [ls, rs] = shouldersOf(hipC, torso), aim = add(neck, dir(lerp(-40, 80, t)), 53);
      const toward = (sh: V3, x: number): V3 => { const d: V3 = [aim[0] + x - sh[0], aim[1] - sh[1], aim[2] - sh[2]], n = Math.hypot(...d); return [d[0] / n, d[1] / n, d[2] / n]; };
      const ul = toward(ls, 3), ur = toward(rs, -3);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [ul, ur], fore: [ul, ur] });
      const hang: V3 = [0, (ul[1] + ur[1]) / 2, (ul[2] + ur[2]) / 2], n = Math.hypot(...hang);
      return { ...p, props: [{ kind: "kettlebell", at: mid(p.j.lwr, p.j.rwr), hang: [0, hang[1] / n, hang[2] / n] }] };
    },
    cues: [
      "Stand with your feet shoulder-width apart, knees slightly bent, both hands on the handle, palms down",
      "Keep your back straight and sit back into your hips to swing the kettlebell back between your legs",
      "Lift your chest and push your hips forward to swing it up in front; the power comes from your hips, not your shoulders",
      "Let it rise to chest height, then swing it back down for the next one",
    ],
  },
  {
    // ACE "Calorie-Burning 20-Minute HIIT Workout" (Stephanie Thielen, 2014), "Burpees": squat and put both hands on
    // the floor; jump or walk back to a high plank and do one push-up; jump or walk the feet back to the squat and
    // jump up with the arms overhead. Drawn with the feet jumping. The movement plays there and back, so the reverse
    // half (push up, feet in, stand, jump) matches the page's order. (First drawn from NASM's "Squat Thrust Burpees",
    // whose steps say the same; that page was replaced for its copy-paste errors.)
    exercise: "burpee", box: 224,
    pose: (t) => {
      const seg = (a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
      const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
      const jump = ease(seg(0, 0.15)), down = ease(seg(0.15, 0.38)), back = ease(seg(0.38, 0.58)), push = ease(seg(0.58, 1));
      const hands: [V3, V3] = [[16, 0, 55], [-16, 0, 55]];
      // The push-up position, as in the push-up drawing: body straight from the ankles, shoulders `sh` above the floor.
      const sh = lerp(53, 16, push), ankleP: V3 = [0, 12, -58], ang = Math.asin((sh - ankleP[1]) / (SEG.shin + SEG.thigh + SEG.torso));
      const plankHip = add(ankleP, [0, Math.sin(ang), Math.cos(ang)], SEG.shin + SEG.thigh);
      let hipC: V3, tp: number, ankleY: number, ankleZ: number, footP: number;
      if (t < 0.38) {
        hipC = [0, lerp(lerp(87.5, 75.5, jump), 30, down), lerp(35, 15, down)];
        tp = lerp(180, 120, down); ankleY = lerp(12, 0, jump); ankleZ = 35; footP = lerp(30, 90, jump);
      } else {
        const sq: V3 = [0, 30, 15], hop = 10 * Math.sin(Math.PI * back);
        hipC = add(lerp3(sq, plankHip, back), [0, hop, 0]);
        tp = lerp(120, 90 + (ang * 180) / Math.PI, back);
        ankleY = lerp(0, 12, back) + hop; ankleZ = lerp(35, -58, back); footP = lerp(90, 15, back);
      }
      const torso = dir(tp), [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, torso);
      const L = twoBone(lh, [SEG.hipW, ankleY, ankleZ], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-SEG.hipW, ankleY, ankleZ], SEG.thigh, SEG.shin, FWD);
      let target: [V3, V3];
      if (t < 0.15) { const a = lerp(180, 0, jump); target = [add(ls, dir(a, 4), 53.9), add(rs, dir(a, -4), 53.9)]; }
      else if (t < 0.38) target = [lerp3(add(ls, DOWN, 53.9), hands[0], down), lerp3(add(rs, DOWN, 53.9), hands[1], down)];
      else target = hands;
      const AL = twoBone(ls, target[0], SEG.upper, SEG.fore, [1, 0.6, 0]), AR = twoBone(rs, target[1], SEG.upper, SEG.fore, [-1, 0.6, 0]);
      return body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], foot: [dir(footP), dir(footP)], upper: [AL[0], AR[0]], fore: [AL[1], AR[1]] });
    },
    cues: [
      "Stand tall",
      "Squat down and put both hands on the floor",
      "Jump or walk your feet back into a high plank and do one push-up",
      "Jump or walk your feet back to the squat, then jump straight up with your arms overhead",
    ],
  },
  {
    // ACE "Bicep Curl" (barbell): hands about shoulder-width, palms up, wrists, elbows and shoulders in line; lift the
    // bar towards the shoulders by bending the elbows, keeping them by the body; lower slowly; chest still. Standing,
    // which the page's photos may show but its text doesn't say; drawn standing, feet hip-width.
    exercise: "curl", using: ["barbell"],
    pose: (t) => {
      const b = lerp(0, 140, t);
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], upper: [dir(-4), dir(-4)], fore: [dir(b), dir(b)] }));
      return { ...p, props: [barbell(mid(p.j.lwr, p.j.rwr))] };
    },
    cues: [
      "Hold the bar with both palms facing up, hands about shoulder-width apart",
      "Bend your elbows to lift the bar towards your shoulders, keeping your elbows by your sides",
      "Keep your chest still, moving only your arms",
      "Lower the bar slowly to the start",
    ],
  },
  {
    // ACE "Standing Bicep Curl" (resistance band): the middle of the band under one foot, a handle in each hand; palms
    // facing the ceiling, bend the elbows to bring the hands towards the shoulders, elbows close to the sides; lower
    // slowly. Drawn with the band under the left foot, feet hip-width.
    exercise: "curl", using: ["bands"],
    pose: (t) => {
      const b = lerp(0, 140, t);
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], upper: [DOWN, DOWN], fore: [dir(b), dir(b)] }));
      const under: V3 = [p.j.lankle[0], 0.5, p.j.lankle[2] + 5];
      return { ...p, props: [cable(under, p.j.lwr), cable(under, p.j.rwr), grip(p.j.lwr, [1, 0, 0]), grip(p.j.rwr, [1, 0, 0])] };
    },
    cues: [
      "Stand on the middle of the band with one foot and hold a handle in each hand",
      "With your palms facing up, bend your elbows to bring your hands up towards your shoulders",
      "Keep your elbows close to your sides",
      "Lower slowly to the start",
    ],
  },
  {
    // ACE "Seated Biceps Curl" (machine): seated, arms over the incline pad, the elbows lined up with the machine's
    // pivot; handles gripped, wrists straight; start with the elbows extended but not locked; curl until the elbows
    // bend no further; return slowly until the arms are extended and the forearms lightly touch the pad. The pad's
    // slope (45°), the seat and the trunk's lean are this site's choices; the machine is simplified.
    exercise: "curl", using: ["machines"],
    pose: (t) => {
      const seat = 40, hipC: V3 = [0, seat + 4, 0], torso = dir(162), b = 45 + lerp(12, 140, t);
      const p = body({ hipC, torso, thigh: [dir(90), dir(90)], shin: [DOWN, DOWN], upper: [dir(45, 6), dir(45, -6)], fore: [dir(b, 4), dir(b, -4)] });
      const el = mid(p.j.lel, p.j.rel), sh = mid(p.j.lsh, p.j.rsh), padDir = dir(45), under: V3 = [0, -4, 2];
      const props: Prop[] = [
        { kind: "line", a: [0, seat, -8], b: [0, seat, 30], width: 5 },
        { kind: "line", a: [0, seat, 12], b: [0, 0, 12] },
        { kind: "line", a: add(add(sh, padDir, 4), under), b: add(add(el, padDir, 6), under), width: 6 },
        { kind: "line", a: add(add(el, padDir, 6), under), b: [0, 0, el[2] + 8] },
        { kind: "line", a: add(el, [-22, 0, 0]), b: add(el, [22, 0, 0]), width: 2 },
        { kind: "line", a: add(p.j.lwr, [-4, 0, 0]), b: add(p.j.rwr, [4, 0, 0]) },
        { kind: "line", a: add(el, [22, 0, 0]), b: add(p.j.lwr, [18, 0, 0]), width: 3 },
        { kind: "line", a: add(el, [-22, 0, 0]), b: add(p.j.rwr, [-18, 0, 0]), width: 3 },
      ];
      return { ...p, props };
    },
    cues: [
      "Sit with your arms over the pad and the seat set so your elbows line up with the machine's pivot",
      "Grip the handles with straight wrists, elbows extended but not locked",
      "Curl the handles towards your chest until your elbows bend no further, keeping your body still",
      "Lower slowly until your arms are extended and your forearms lightly touch the pad",
    ],
  },
  {
    // ACE "Single Arm Overhead Press" (kettlebell): feet hip-width, the right foot slightly in front; the kettlebell in
    // the right hand in front of the chest near the shoulder, resting on the forearm, elbow close to the ribs; push the
    // right foot into the floor to shift the weight forward and press the arm straight overhead; pull the elbow back
    // down to the ribs to lower. A standing, one-arm press, unlike the seated two-dumbbell press. The free arm isn't
    // described: drawn hanging.
    exercise: "dbPress", using: ["kettlebell"], box: 224,
    pose: (t) => {
      const hipC: V3 = [0, 75.5, lerp(0, 3, t)], [lh, rh] = hipsOf(hipC), [, rs] = shouldersOf(hipC, UP);
      const L = twoBone(lh, [SEG.hipW, 0, -4], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-SEG.hipW, 0, 8], SEG.thigh, SEG.shin, FWD);
      const wr = lerp3([rs[0] + 6, rs[1] - 14, rs[2] + 13], [rs[0] + 1, rs[1] + 53.5, rs[2] + 2], t);
      const A = twoBone(rs, wr, SEG.upper, SEG.fore, [-0.3, -1, 0.4]);
      const p = body({ hipC, torso: UP, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [dir(0, 4), A[0]], fore: [dir(0, 3), A[1]] });
      const h: V3 = [lerp(-0.85, -0.3, t), -0.2 * t, lerp(-0.5, -0.9, t)], n = Math.hypot(...h);
      return { ...p, props: [{ kind: "kettlebell", at: p.j.rwr, hang: [h[0] / n, h[1] / n, h[2] / n] }] };
    },
    cues: [
      "Stand with your feet hip-width apart, one foot slightly in front",
      "Hold the kettlebell in front of your chest near that side's shoulder, resting on your forearm, elbow close to your ribs",
      "Push the front foot into the floor and press the arm straight overhead",
      "Pull your elbow back down to your ribs to lower it; do all reps on one side, then switch",
    ],
  },
  {
    // ACE "How to Get Started With Kettlebells" (Anthony J. Wall, 2015), "Kettlebell Deadlifts": feet shoulder-width,
    // toes slightly out, chest up, back straight; bend at the hips and slightly at the knees to grip the kettlebell
    // with both hands; with the weight on the heels, drive the hips open to stand; brace and squeeze the glutes. Where
    // the kettlebell starts isn't stated: drawn on the floor between the feet. Starts at the floor (t = 0).
    exercise: "deadlift", using: ["kettlebell"],
    pose: (t) => {
      const lean = lerp(70, 0, t) * Math.PI / 180, hipC: V3 = [0, lerp(55, 75.5, t), lerp(-37, 0, t)], torso: V3 = [0, Math.cos(lean), Math.sin(lean)];
      const toes = 10, [lh, rh] = hipsOf(hipC);
      const L = twoBone(lh, [13, 0, 0], SEG.thigh, SEG.shin, yaw(FWD, toes)), R = twoBone(rh, [-13, 0, 0], SEG.thigh, SEG.shin, yaw(FWD, -toes));
      const [ls, rs] = shouldersOf(hipC, torso), y = Math.max(17, ls[1] - 53.5), z = lerp(ls[2], ls[2] + 2, t);
      const LA = twoBone(ls, [3, y, z], SEG.upper, SEG.fore, [1, 0, 0]), RA = twoBone(rs, [-3, y, z], SEG.upper, SEG.fore, [-1, 0, 0]);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], foot: [yaw(FWD, toes), yaw(FWD, -toes)], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
      return { ...p, props: [{ kind: "kettlebell", at: mid(p.j.lwr, p.j.rwr), hang: DOWN }] };
    },
    cues: [
      "Stand with your feet shoulder-width apart, toes slightly out, chest up and back straight",
      "Bend at the hips and slightly at the knees to grip the kettlebell with both hands",
      "Keeping your weight on your heels, drive your hips forward to stand",
      "Brace your stomach and squeeze your glutes at the top",
    ],
  },
  {
    // ACE "How to Get Started With Kettlebells" (Anthony J. Wall, 2015), "Goblet Squat": the kettlebell held in both
    // hands at chest height; feet shoulder-width, toes slightly out, chest up, back straight; bend at the hips and
    // knees, pushing the hips back, elbows forward, and sit down into a squat; weight on the heels, drive back up. The
    // depth isn't given: drawn to the thighs about level with the floor.
    exercise: "gobletSquat", using: ["kettlebell"],
    pose: (t) => {
      const p = squatPose(t, { depth: 92, shin: 34, lean: 30, wide: 9 }, (sh, torso, neck) => {
        const chest = add(add(neck, torso, -10), front(torso), 13);
        const L = twoBone(sh[0], add(chest, [4, 0, 0]), SEG.upper, SEG.fore, [0.05, -1, 0.5]), R = twoBone(sh[1], add(chest, [-4, 0, 0]), SEG.upper, SEG.fore, [-0.05, -1, 0.5]);
        return [[L[0], R[0]], [L[1], R[1]]];
      });
      return { ...p, props: [{ kind: "kettlebell", at: mid(p.j.lwr, p.j.rwr), hang: DOWN }] };
    },
    cues: [
      "Hold the kettlebell in both hands at chest height",
      "Stand with your feet shoulder-width apart, toes slightly out, chest up and back straight",
      "Bend at your hips and knees, pushing your hips back and keeping your elbows forward, and sit down into a squat",
      "Keep your weight on your heels as you drive back up to standing",
    ],
  },
  {
    // ACE "Farmer's Carry" (listed with kettlebells): a weight in each hand, firm grip, arms at the sides beside the
    // hips; back straight; walk a set distance, turn and come back. Drawn walking on the spot, as for the dumbbells.
    exercise: "farmerCarry", using: ["kettlebell"],
    pose: (t) => {
      const swing = Math.cos(Math.PI * t) * 20, knee = (s: number) => Math.max(0, -s) * 1.2;
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [dir(swing), dir(-swing)], shin: [dir(swing - knee(swing)), dir(-swing - knee(-swing))],
        foot: [dir(90 - knee(swing) * 0.4), dir(90 - knee(-swing) * 0.4)], upper: [dir(0, 10), dir(0, -10)], fore: [dir(0, 8), dir(0, -8)] }));
      return { ...p, props: [{ kind: "kettlebell", at: p.j.lwr, hang: DOWN }, { kind: "kettlebell", at: p.j.rwr, hang: DOWN }] };
    },
    cues: [
      "Hold a kettlebell in each hand with a firm grip, arms at your sides, weights beside your hips",
      "Keep your back straight",
      "Walk a set distance",
      "Turn round and walk back",
    ],
  },
  {
    // ACE "Shrug" (barbell): palms-down grip, hands about shoulder-width; knees slightly bent, hips straight, back tall;
    // shoulders raised straight up towards the ears as high as possible and lowered slowly; pull the hands apart on the
    // bar; don't roll the shoulders. The rise is drawn as 7 units, as for the dumbbell shrug.
    exercise: "shrug", using: ["barbell"],
    pose: (t) => {
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, shrug: lerp(0, 7, t),
        thigh: [dir(6), dir(6)], shin: [dir(-4), dir(-4)], upper: [dir(5), dir(5)], fore: [dir(8), dir(8)] }));
      return { ...p, props: [barbell(mid(p.j.lwr, p.j.rwr))] };
    },
    cues: [
      "Hold the bar with your palms down, hands about shoulder-width apart",
      "Keep your knees slightly bent, hips straight and back tall",
      "Raise your shoulders straight up towards your ears as high as you can, without rolling them",
      "Lower slowly to the start",
    ],
  },
  {
    // ACE "Single-arm Lateral Raise" (cable): pulley at about waist height with a single handle; stand with the right
    // side to the machine, handle in the left hand; chest tall, hips straight; lift the left hand out to the side until
    // the arm is level with the floor, the cable passing in front of the body; pause; lower slowly. The free arm isn't
    // described: drawn hanging. The machine is drawn as a post with the pulley.
    exercise: "lateralRaise", using: ["machines"], box: 224,
    pose: (t) => {
      const a = lerp(6, 90, t);
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [dir(0, 3), dir(0, -3)], shin: [dir(0, 3), dir(0, -3)],
        upper: [yaw(dir(0, a), -14), dir(0, -4)], fore: [yaw(dir(0, Math.max(a - 6, 3)), -14), dir(0, -3)] }));
      const pulley: V3 = [-38, 100, 14];
      return { ...p, props: [{ kind: "line", a: [-44, 0, 14], b: [-44, 170, 14], width: 3 }, cable(pulley, p.j.lwr), grip(p.j.lwr, [0, 0, 1])] };
    },
    cues: [
      "Set the pulley at about waist height and stand with that side to the machine, handle in the far hand",
      "Keep your chest tall and hips straight",
      "Lift the arm out to the side until it is level with the floor, the cable passing in front of you",
      "Pause for a second, then lower slowly; do all reps on one side, then switch",
    ],
  },
  {
    // ACE "Single-arm, Single-leg Romanian Dead Lift" (dumbbell): balance on one leg, the dumbbell in the opposite hand;
    // standing knee slightly bent, back straight, leaning forward at the hip while the free leg straightens behind,
    // toes pointed; the arm straight so the dumbbell lowers in front of the standing leg; push the foot down, pull the
    // knee back and lower the free leg to stand. Drawn standing on the right leg, the dumbbell in the left hand.
    exercise: "singleLegRdl", using: ["dumbbells"],
    pose: (t) => {
      const L = lerp(0, 72, t) * Math.PI / 180, torso: V3 = [0, Math.cos(L), Math.sin(L)];
      const ankle: V3 = [-SEG.hipW, 0, 0], hz = -18 * Math.sin(L), hipC: V3 = [0, Math.sqrt(74 ** 2 - hz ** 2), hz];
      const [lh, rh] = hipsOf(hipC), R = twoBone(rh, ankle, SEG.thigh, SEG.shin, FWD);
      const back: V3 = [0, -Math.cos(L), -Math.sin(L)], LL = twoBone(lh, add(lh, back, 74), SEG.thigh, SEG.shin, FWD);
      const [ls] = shouldersOf(hipC, torso), aim: V3 = [-6 - ls[0], -50, 6], n = Math.hypot(...aim), arm: V3 = [aim[0] / n, aim[1] / n, aim[2] / n];
      const p = body({ hipC, torso, thigh: [LL[0], R[0]], shin: [LL[1], R[1]], foot: [dir(90 - Math.max(0, (L * 180) / Math.PI - 14)), FWD], upper: [arm, DOWN], fore: [arm, DOWN] });
      return { ...p, props: [{ kind: "dumbbell", at: p.j.lwr, axis: [1, 0, 0] }] };
    },
    cues: [
      "Stand on one leg, knee slightly bent, holding a dumbbell in the opposite hand",
      "Keep your back straight and lean forward from the hip, straightening the free leg behind you with the toes pointed",
      "Keep the arm straight so the dumbbell lowers in front of your standing leg",
      "Push the foot into the floor and bring the free leg down to stand; do all reps on one leg, then switch",
    ],
  },
  {
    // ACE "4 Deadlift Variations to Spice Up Your Programming" (Pete McCall, 2018), "Kettlebell (or Vertical
    // Dumbbell) Deadlift": the weight directly in front; feet shoulder-width, slight knee bend; hinge at the hips,
    // spine straight, hips back; for a dumbbell, stand it on end and grip each side of its top end; push the feet down
    // and the hips forward, pulling the knees back, to stand with the weight resting on the fronts of the thighs; the
    // strength comes from the legs and hips. Starts at the floor (t = 0); the 70° lean at the bottom is this site's.
    exercise: "deadlift", using: ["dumbbells"],
    pose: (t) => {
      const lean = lerp(70, 0, t) * Math.PI / 180, hipC: V3 = [0, lerp(58, 75.5, t), lerp(-37, 0, t)], torso: V3 = [0, Math.cos(lean), Math.sin(lean)];
      const [lh, rh] = hipsOf(hipC);
      const L = twoBone(lh, [13, 0, 0], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-13, 0, 0], SEG.thigh, SEG.shin, FWD);
      const [ls, rs] = shouldersOf(hipC, torso), y = Math.max(22, ls[1] - 53.5), z = lerp(ls[2], ls[2] + 3, t);
      const LA = twoBone(ls, [3, y, z], SEG.upper, SEG.fore, [1, 0, 0]), RA = twoBone(rs, [-3, y, z], SEG.upper, SEG.fore, [-1, 0, 0]);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
      return { ...p, props: [{ kind: "dumbbell", at: add(mid(p.j.lwr, p.j.rwr), DOWN, 9), axis: [0, 1, 0] }] };
    },
    cues: [
      "Stand the dumbbell on end in front of you; feet shoulder-width apart, knees slightly bent",
      "Hinge forward at the hips, spine straight, pushing your hips back, and grip the top of the dumbbell with both hands",
      "Push your feet into the floor and press your hips forward to stand, the weight resting on the fronts of your thighs",
      "The strength comes from your legs and hips, not your shoulders",
    ],
  },
  {
    // ACE "Build Your Triceps Workout" (Stephanie Thielen, 2015), "Overhead Extension" (resistance band): one end of
    // the band under the right foot, the other end in the right hand; the right arm up by the ear, palm facing in; bend
    // the elbow to lower the handle behind the head; press it back up. How far to lower isn't given: drawn to about a
    // right angle and a little more. The free arm isn't described: drawn hanging.
    exercise: "overheadExt", using: ["bands"], box: 224,
    pose: (t) => {
      const bend = lerp(4, 100, t);
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [dir(0, 3), dir(0, -3)], shin: [dir(0, 3), dir(0, -3)],
        upper: [dir(0, 4), dir(178, -4)], fore: [dir(0, 3), dir(178 + bend, 6)] }));
      const under: V3 = [p.j.rankle[0], 0.5, p.j.rankle[2] + 5];
      return { ...p, props: [cable(under, p.j.rwr), grip(p.j.rwr, [0, 0, 1])] };
    },
    cues: [
      "Stand on one end of the band with one foot and hold the other end in the same-side hand",
      "Raise that arm up by your ear, palm facing in",
      "Bend the elbow to lower the handle behind your head",
      "Press it back up until the arm is straight; do all reps on one side, then switch",
    ],
  },
  {
    // ACE "Resistance Tubing Workout" (Seated row; read through search-result excerpts only, the page itself could not
    // be opened): sit on the floor; the tubing wrapped round an anchor close to the ground, a handle in each hand; sit
    // back so the band is taut with the arms straight forward; legs extended, knees slightly bent; pull the handles so
    // the elbows form right angles, squeezing the shoulder blades together; elbows back as far as they go, spine
    // neutral. The anchor's distance and height are this site's choices.
    exercise: "bandRow",
    pose: (t) => {
      const hipC: V3 = [0, 8, -10], torso = UP, [ls, rs] = shouldersOf(hipC, torso), [lh, rh] = hipsOf(hipC);
      const hy = 40, hand = (k: 1 | -1): V3 => lerp3([9 * k, hy, 42], [11 * k, hy, 12], t);
      const LA = twoBone(ls, hand(1), SEG.upper, SEG.fore, [0.4, -0.4, -1]), RA = twoBone(rs, hand(-1), SEG.upper, SEG.fore, [-0.4, -0.4, -1]);
      const L = twoBone(lh, [SEG.hipW, 2, 63], SEG.thigh, SEG.shin, [0, 1, 0]), R = twoBone(rh, [-SEG.hipW, 2, 63], SEG.thigh, SEG.shin, [0, 1, 0]);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], foot: [dir(170), dir(170)], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]],
        props: [{ kind: "line", a: [0, 0, 94], b: [0, 30, 94], width: 6 }] });
      const anchor: V3 = [0, 12, 94];
      return { ...p, props: [...p.props, cable(p.j.lwr, anchor), cable(p.j.rwr, anchor), grip(p.j.lwr), grip(p.j.rwr)] };
    },
    cues: [
      "Sit on the floor with your legs out in front, knees slightly bent, and the band anchored low in front of you",
      "Hold a handle in each hand and sit back until the band is taut with your arms straight forward",
      "Pull the handles back until your elbows are bent to a right angle, squeezing your shoulder blades together",
      "Take your elbows back as far as they go with your spine neutral, then return slowly",
    ],
  },
  {
    // ExRx.net "45° Hyperextension (hands behind neck)" (read through search-result excerpts; the site blocks the
    // agent's page reader): thighs face down on the pad, heels hooked under the brace, hands behind the neck or at the
    // sides of the head; raise the upper body until the hips and waist are straight; lower by bending the hips and
    // waist until a mild stretch is felt or the trunk is about at right angles to the legs. The page notes that
    // starting with the arms lower is easier. Drawn from the top (t = 0); the bench is simplified.
    exercise: "backExtension",
    pose: (t) => {
      const ankle: V3 = [0, 12, -40], leg: V3 = [0, Math.SQRT1_2, Math.SQRT1_2], hipC = add(ankle, leg, SEG.shin + SEG.thigh);
      const torso = dir(lerp(135, 60, t)), chest = dir(lerp(135, 35, t)), down: V3 = [-leg[0], -leg[1], -leg[2]];
      const [ls, rs] = shouldersOf(hipC, torso, chest), neck = add(add(hipC, torso, SEG.lowBack), chest, SEG.upBack);
      const behind = add(add(neck, front(chest), -6), chest, 4);
      const LA = twoBone(ls, add(behind, [4, 0, 0]), SEG.upper, SEG.fore, [1, 0, 0]), RA = twoBone(rs, add(behind, [-4, 0, 0]), SEG.upper, SEG.fore, [-1, 0, 0]);
      const under: V3 = [0, -Math.SQRT1_2 * 5, Math.SQRT1_2 * 5];
      const padA = add(add(hipC, down, 6), under), padB = add(add(hipC, down, 34), under);
      const props: Prop[] = [
        { kind: "line", a: padA, b: padB, width: 6 },
        { kind: "line", a: [-14, padA[1], padA[2]], b: [14, padA[1], padA[2]], width: 4 },
        { kind: "line", a: padB, b: [0, 0, padB[2]] },
        { kind: "line", a: [0, 7, -44], b: [0, 7, -34], width: 5 },
        { kind: "line", a: [0, 7, -38], b: [0, 0, -38] },
        { kind: "line", a: [0, 1, -50], b: [0, 1, padB[2] + 6] },
      ];
      return body({ hipC, torso, chest, head: chest, thigh: [down, down], shin: [down, down], foot: [dir(45), dir(45)], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props });
    },
    cues: [
      "Lie face down on the 45° bench with your thighs on the pad and your heels hooked under the brace",
      "Put your hands behind your neck or at the sides of your head (arms lower, such as hands behind the hips, is easier)",
      "Lower your upper body by bending at the hips and waist until you feel a mild stretch, or your trunk is about at right angles to your legs",
      "Raise your upper body until your hips and waist are straight; don't bounce at the bottom",
    ],
  },
  {
    // ExRx.net "Weighted Hanging Leg-Hip Raise", done with no added weight as the page allows (search-result excerpts
    // only): hang from a high bar; raise the legs by bending the hips and knees until the hips are fully bent, then keep
    // raising the knees towards the shoulders by bending the waist (curling the pelvis up); return until the waist,
    // hips and knees are straight. Grip width as in the pull-up drawing; how far the pelvis curls is this site's choice.
    exercise: "hangingKneeRaise", box: 224,
    pose: (t) => {
      const barY = 196, a = Math.min(1, t / 0.6), b = Math.max(0, (t - 0.6) / 0.4);
      const neck: V3 = [0, barY - SEG.upper - SEG.fore + 1, 0];
      const torso = dir(lerp(180, 230, b)), chest = dir(lerp(180, 192, b));
      const waist = add(neck, chest, -SEG.upBack), hipC = add(waist, torso, -SEG.lowBack), [ls, rs] = shouldersOf(hipC, torso, chest);
      const LA = twoBone(ls, [22, barY, 2], SEG.upper, SEG.fore, [1, -1, 0.2]), RA = twoBone(rs, [-22, barY, 2], SEG.upper, SEG.fore, [-1, -1, 0.2]);
      const th = lerp(4, 112, a) + lerp(0, 40, b), sh = lerp(-4, 4, a) + lerp(0, 30, b);
      return body({ hipC, torso, chest, thigh: [dir(th, 2), dir(th, -2)], shin: [dir(sh, 2), dir(sh, -2)], foot: [dir(sh + 50), dir(sh + 50)],
        upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: [{ kind: "line", a: [-44, barY, 2], b: [44, barY, 2], width: 4 }] });
    },
    cues: [
      "Hang from a high bar with your arms straight",
      "Bend your hips and knees to raise your legs until your hips are fully bent",
      "Keep raising your knees towards your shoulders by curling your pelvis up",
      "Lower until your waist, hips and knees are straight again, without swinging",
    ],
  },
  {
    // ExRx.net "Barbell Hip Thrust" (search-result excerpts only): sit on the floor with the long side of a bench behind
    // the back; roll the bar back over the hips; upper back on the bench; feet on the floor about shoulder-width, knees
    // bent; grip the bar to each side; raise the bar by straightening the hips; lower and repeat. The page suggests a
    // bench of 40 to 46 cm, with the trunk at about 45° at the start. Drawn from the bottom (t = 0).
    exercise: "hipThrust", using: ["barbell"],
    pose: (t) => {
      const benchY = 38, neck: V3 = [0, benchY + 6, -36], hy = lerp(12, benchY + 2, t);
      const hz = neck[2] + Math.sqrt(SEG.torso ** 2 - (neck[1] - hy) ** 2), hipC: V3 = [0, hy, hz];
      const torso: V3 = [0, (neck[1] - hy) / SEG.torso, (neck[2] - hz) / SEG.torso];
      const [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, torso), bar: V3 = [0, hy + 10, hz];
      const L = twoBone(lh, [13, 0, 44], SEG.thigh, SEG.shin, [0, 1, 0.3]), R = twoBone(rh, [-13, 0, 44], SEG.thigh, SEG.shin, [0, 1, 0.3]);
      const LA = twoBone(ls, add(bar, [24, 0, 0]), SEG.upper, SEG.fore, [1, 1, 0]), RA = twoBone(rs, add(bar, [-24, 0, 0]), SEG.upper, SEG.fore, [-1, 1, 0]);
      const bench: Prop[] = [{ kind: "line", a: [-40, benchY, neck[2] - 2], b: [40, benchY, neck[2] - 2], width: 5 }, { kind: "line", a: [0, benchY, neck[2] - 10], b: [0, benchY, neck[2] + 4], width: 5 },
        { kind: "line", a: [-34, benchY, neck[2] - 2], b: [-34, 0, neck[2] - 2] }, { kind: "line", a: [34, benchY, neck[2] - 2], b: [34, 0, neck[2] - 2] }];
      return body({ hipC, torso, head: dir(-90), thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: [...bench, barbell(bar)] });
    },
    cues: [
      "Sit on the floor with the long side of a low bench behind your back and roll the bar over your hips",
      "Rest your upper back on the bench, feet on the floor about shoulder-width apart, knees bent, hands on the bar to each side",
      "Raise the bar by straightening your hips",
      "Lower and repeat",
    ],
  },
  {
    // ExRx.net "Cable Triceps Extension (with rope)" (search-result excerpts only): from a low pulley, grip the rope
    // ends; face away from the pulley, feet staggered; rope behind the head, elbows up overhead; straighten the arms
    // overhead; lower until the forearms are against the upper arms; let the cable keep the arms pulled back. Drawn to
    // 140° of elbow bend (the head stops a full fold); the pulley's distance is this site's choice.
    exercise: "overheadExt", using: ["machines"], box: 224,
    pose: (t) => {
      const bend = lerp(4, 140, t), hipC: V3 = [0, 75.5, 0], [lh, rh] = hipsOf(hipC);
      const L = twoBone(lh, [SEG.hipW, 0, 10], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-SEG.hipW, 0, -14], SEG.thigh, SEG.shin, FWD);
      const p = body({ hipC, torso: UP, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [dir(178, 6), dir(178, -6)], fore: [dir(178 + bend, -18), dir(178 + bend, 18)] });
      const knot = add(mid(p.j.lwr, p.j.rwr), [0, -8, -3]), pulley: V3 = [0, 8, -70];
      return { ...p, props: [{ kind: "line", a: [0, 0, -74], b: [0, 60, -74], width: 6 }, cable(p.j.lwr, knot), cable(p.j.rwr, knot), cable(knot, pulley)] };
    },
    cues: [
      "Hold the rope from a low pulley and turn to face away from it, feet staggered",
      "Hold the rope behind your head with your elbows up overhead",
      "Straighten your arms overhead",
      "Lower until your forearms are against your upper arms, letting the cable keep your arms back",
    ],
  },
  {
    // ExRx.net "Lever Standing Calf Raise" (search-result excerpts only): shoulders under the padded lever, toes and
    // balls of the feet on the calf block with the arches and heels off; grip the handles; stand straight; raise the
    // heels as high as possible; lower until the calves are stretched; knees straight. The 35° rise and 20° drop are
    // this site's choices; the machine is simplified.
    exercise: "calfRaise", using: ["machines"],
    pose: (t) => {
      const blockY = 10, toeZ = 8, rise = lerp(-20, 35, t) * Math.PI / 180, foot: V3 = [0, -Math.sin(rise), Math.cos(rise)];
      const ankle: V3 = [0, blockY + SEG.foot * Math.sin(rise), toeZ - SEG.foot * Math.cos(rise)], hipC: V3 = [0, ankle[1] + SEG.shin + SEG.thigh, ankle[2]];
      const [ls, rs] = shouldersOf(hipC, UP), padY = ls[1] + 4;
      const LA = twoBone(ls, [21, padY, ls[2] + 4], SEG.upper, SEG.fore, [1, -1, 0]), RA = twoBone(rs, [-21, padY, rs[2] + 4], SEG.upper, SEG.fore, [-1, -1, 0]);
      const props: Prop[] = [
        { kind: "line", a: [0, blockY, toeZ - 14], b: [0, blockY, toeZ + 4], width: 6 },
        { kind: "line", a: [-16, blockY, toeZ - 4], b: [16, blockY, toeZ - 4], width: 4 },
        { kind: "line", a: [0, blockY, toeZ - 4], b: [0, 0, toeZ - 4] },
        { kind: "line", a: [-22, padY, ls[2]], b: [22, padY, ls[2]], width: 6 },
        { kind: "line", a: [0, padY, ls[2]], b: [0, padY, -34] },
        { kind: "line", a: [0, 0, -34], b: [0, 175, -34], width: 5 },
      ];
      return body({ hipC, torso: UP, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], foot: [foot, foot], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props });
    },
    cues: [
      "Put your shoulders under the padded lever and the balls of your feet on the block, heels hanging off",
      "Hold the handles and stand up straight",
      "Raise your heels as high as you can, knees straight",
      "Lower your heels until your calves are stretched",
    ],
  },
  {
    // ExRx.net "Dumbbell Standing Calf Raise" (search-result excerpts only): a dumbbell in one hand at the side; toes and
    // balls of the feet on a calf block (a step that won't tip over will do) with the arches and heels off; the other
    // hand on a support; raise the heels as high as possible; lower until the calves are stretched; knees straight.
    exercise: "calfRaise", using: ["dumbbells"],
    pose: (t) => {
      const blockY = 10, toeZ = 8, rise = lerp(-20, 35, t) * Math.PI / 180, foot: V3 = [0, -Math.sin(rise), Math.cos(rise)];
      const ankle: V3 = [0, blockY + SEG.foot * Math.sin(rise), toeZ - SEG.foot * Math.cos(rise)], hipC: V3 = [0, ankle[1] + SEG.shin + SEG.thigh, ankle[2]];
      const [, rs] = shouldersOf(hipC, UP), support: V3 = [-30, 100, 14];
      const RA = twoBone(rs, support, SEG.upper, SEG.fore, [-1, -1, 0]);
      const props: Prop[] = [
        { kind: "line", a: [0, blockY, toeZ - 14], b: [0, blockY, toeZ + 4], width: 6 },
        { kind: "line", a: [-16, blockY, toeZ - 4], b: [16, blockY, toeZ - 4], width: 4 },
        { kind: "line", a: [0, blockY, toeZ - 4], b: [0, 0, toeZ - 4] },
        { kind: "line", a: [-34, 0, 14], b: [-34, 104, 14], width: 5 },
      ];
      const p = body({ hipC, torso: UP, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], foot: [foot, foot], upper: [dir(0, 6), RA[0]], fore: [dir(0, 5), RA[1]], props });
      return { ...p, props: [...p.props, { kind: "dumbbell", at: p.j.lwr, axis: [0, 0, 1] }] };
    },
    cues: [
      "Hold a dumbbell in one hand at your side and put the balls of your feet on a block or a step that won't tip, heels off",
      "Hold a support with your other hand for balance",
      "Raise your heels as high as you can, knees straight",
      "Lower your heels until your calves are stretched",
    ],
  },
  {
    // ExRx.net "Lever Shrug" (search-result excerpts only): stand holding the lever bar with a shoulder-width overhand
    // or mixed grip; raise the shoulders as high as possible; lower and repeat. The machine is drawn as a bar on two
    // lever arms; the rise is drawn as 7 units, as for the other shrugs.
    exercise: "shrug", using: ["machines"],
    pose: (t) => {
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, shrug: lerp(0, 7, t), thigh: [DOWN, DOWN], shin: [DOWN, DOWN], upper: [dir(5), dir(5)], fore: [dir(8), dir(8)] }));
      const c = mid(p.j.lwr, p.j.rwr);
      const props: Prop[] = [
        { kind: "line", a: add(c, [-24, 0, 0]), b: add(c, [24, 0, 0]), width: 4 },
        { kind: "line", a: add(c, [24, 0, 0]), b: [24, 30, -40] }, { kind: "line", a: add(c, [-24, 0, 0]), b: [-24, 30, -40] },
        { kind: "line", a: [-24, 30, -40], b: [-24, 0, -40] }, { kind: "line", a: [24, 30, -40], b: [24, 0, -40] },
      ];
      return { ...p, props };
    },
    cues: [
      "Stand holding the machine's bar with your hands shoulder-width apart",
      "Raise your shoulders as high as you can",
      "Lower and repeat",
    ],
  },
  {
    // Bodylastics "Resistance Band Triceps Pushdown": band in a door anchor at the top of the door; stand facing the
    // door 3 to 4 feet away, back flat, chest up, a slight forward bend at the waist; upper arms in line with the body,
    // elbows tight to the sides, hands at chest height about 8 inches apart, palms in; push the hands down until they
    // are just below the hips and the arms are straight; let them rise under control to chest height; elbows fixed.
    exercise: "pushdown", using: ["bands"], box: 224,
    pose: (t) => {
      const hipC: V3 = [0, 75.5, 0], torso = dir(170), f = lerp(125, -10, t);
      const p = grounded(body({ hipC, torso, thigh: [DOWN, DOWN], shin: [DOWN, DOWN], upper: [dir(-10, 3), dir(-10, -3)], fore: [dir(f, -6), dir(f, 6)] }));
      const anchor: V3 = [0, 196, 92];
      return { ...p, props: [{ kind: "line", a: [0, 0, 96], b: [0, 205, 96], width: 3 }, cable(p.j.lwr, anchor), cable(p.j.rwr, anchor), grip(p.j.lwr), grip(p.j.rwr)] };
    },
    cues: [
      "Fix the band in a door anchor at the top of the door and stand facing it, 3 to 4 feet away",
      "Keep your back flat and chest up with a slight forward bend, elbows tight to your sides, hands at chest height, palms in",
      "Push your hands down until they are just below your hips and your arms are straight",
      "Let your hands rise under control back to chest height, keeping your elbows fixed",
    ],
  },
  {
    // Physitrack "Kettlebell single arm bent over row": hinge over at the waist holding a kettlebell in one hand, the
    // other hand on a bench for support; back aligned, shoulder blades slid back and down; pull the kettlebell up
    // towards the side of the rib cage; lower to the start. Feet and lean aren't given: drawn standing, feet
    // hip-width, knees slightly bent, the trunk 75° forward; the bench's position is this site's choice.
    exercise: "dbRow", using: ["kettlebell"],
    pose: (t) => {
      const hipC: V3 = [0, 72, -8], torso = dir(105), [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, torso);
      const L = twoBone(lh, [SEG.hipW, 0, 0], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-SEG.hipW, 0, 0], SEG.thigh, SEG.shin, FWD);
      const LA = twoBone(ls, [16, 40, 40], SEG.upper, SEG.fore, [0.5, 0, 1]);
      const low = add(rs, DOWN, 53.6), ribs = add(add(add(hipC, torso, 24), [-15, 0, 0]), front(torso), 4);
      const RA = twoBone(rs, lerp3(low, ribs, t), SEG.upper, SEG.fore, [-0.2, 0.6, -1]);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]], props: flatBench(40, 22, 72, 16) });
      return { ...p, props: [...p.props, { kind: "kettlebell", at: p.j.rwr, hang: DOWN }] };
    },
    cues: [
      "Hinge over at the waist holding a kettlebell in one hand, the other hand on a bench for support",
      "Keep your back aligned and slide your shoulder blades back and down",
      "Pull the kettlebell up towards the side of your rib cage",
      "Lower it back to the start; do all reps on one side, then switch",
    ],
  },
  {
    // Physitrack "Kettlebell stiff leg deadlift - single arm, single leg": knees slightly bent, kettlebell in one hand;
    // hinge forward at the waist and fully extend the opposite leg to the rear, lowering the kettlebell towards the
    // shin; back straight, body not rotating; squeeze the glutes and hamstrings to stand. Drawn on the right leg with
    // the kettlebell in the right hand (the leg opposite the hand goes back), to the same 72° lean as the other drawings.
    exercise: "singleLegRdl", using: ["kettlebell"],
    pose: (t) => {
      const L = lerp(0, 72, t) * Math.PI / 180, torso: V3 = [0, Math.cos(L), Math.sin(L)];
      const ankle: V3 = [-SEG.hipW, 0, 0], hz = -18 * Math.sin(L), hipC: V3 = [0, Math.sqrt(74 ** 2 - hz ** 2), hz];
      const [lh, rh] = hipsOf(hipC), R = twoBone(rh, ankle, SEG.thigh, SEG.shin, FWD);
      const back: V3 = [0, -Math.cos(L), -Math.sin(L)], LL = twoBone(lh, add(lh, back, 74), SEG.thigh, SEG.shin, FWD);
      const [, rs] = shouldersOf(hipC, torso), aim: V3 = [-SEG.hipW - rs[0], -50, 6], n = Math.hypot(...aim), arm: V3 = [aim[0] / n, aim[1] / n, aim[2] / n];
      const p = body({ hipC, torso, thigh: [LL[0], R[0]], shin: [LL[1], R[1]], foot: [dir(90 - Math.max(0, (L * 180) / Math.PI - 14)), FWD], upper: [DOWN, arm], fore: [DOWN, arm] });
      return { ...p, props: [{ kind: "kettlebell", at: p.j.rwr, hang: DOWN }] };
    },
    cues: [
      "Stand with your knees slightly bent, holding a kettlebell in one hand",
      "Hinge forward at the waist and stretch the other leg straight out behind you, lowering the kettlebell towards your shin",
      "Keep your back straight and don't let your body twist",
      "Squeeze your glutes and hamstrings to stand back up; do all reps on one side, then switch",
    ],
  },
  {
    // Fitness Volt "Face Pulls with Resistance Bands" (Patrick Dale; a weaker source, marked so on the page): the
    // band's middle round an anchor at eye height; an end in each hand, arms straight in front, palms down; step back to
    // tension the band; brace, shoulders down and back; leading with the elbows, pull the hands to the sides of the
    // head, elbows level with or slightly above the shoulders, turning the forearms up; straighten the arms and repeat.
    exercise: "facePull", using: ["bands"],
    pose: (t) => {
      const p0 = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [dir(6), dir(6)], shin: [dir(-6), dir(-6)], upper: [DOWN, DOWN], fore: [DOWN, DOWN] }));
      const hipC = p0.j.hipC, [ls, rs] = shouldersOf(hipC, UP), headY = ls[1] + SEG.neck + SEG.head;
      const hand = (s: V3): V3 => lerp3([s[0] * 0.4, s[1] + 6, s[2] + Math.sqrt((SEG.upper + SEG.fore - 1) ** 2 - 36 - (s[0] * 0.6) ** 2)], [s[0] * 1.05, headY, 4], t);
      const LA = twoBone(ls, hand(ls), SEG.upper, SEG.fore, [1, 0.1, -0.6]), RA = twoBone(rs, hand(rs), SEG.upper, SEG.fore, [-1, 0.1, -0.6]);
      const p = body({ hipC, torso: UP, thigh: [dir(6), dir(6)], shin: [dir(-6), dir(-6)], upper: [LA[0], RA[0]], fore: [LA[1], RA[1]] });
      const anchor: V3 = [0, headY - 4, 92];
      return { ...p, props: [cable(p.j.lwr, anchor), cable(p.j.rwr, anchor), grip(p.j.lwr, [1, 0, 0]), grip(p.j.rwr, [1, 0, 0]), { kind: "line", a: [0, 0, 96], b: [0, 184, 96], width: 5 }] };
    },
    cues: [
      "Loop the middle of the band round an anchor at eye height and hold one end in each hand, arms straight in front, palms down",
      "Step back until the band is taut; brace and draw your shoulders down and back",
      "Leading with your elbows, pull your hands to the sides of your head, elbows level with or a little above your shoulders",
      "Straighten your arms and repeat",
    ],
  },
  {
    // Sworkit "Kettlebell Overhead Tricep Extensions" (a weaker source, marked so on the page): feet shoulder-width,
    // core tight; the kettlebell in both hands, lifted straight overhead with the elbows by the ears; lower it behind
    // the head by bending the elbows, under control. How far isn't given: drawn to a right angle at the elbows, as in
    // the dumbbell drawing; the bell is drawn hanging from the handle.
    exercise: "overheadExt", using: ["kettlebell"], box: 224,
    pose: (t) => {
      const bend = lerp(4, 90, t), inward = 30;
      const p = grounded(body({ hipC: [0, 80, 0], torso: UP, thigh: [dir(0, 6), dir(0, -6)], shin: [dir(0, 6), dir(0, -6)],
        upper: [dir(178), dir(178)], fore: [dir(178 + bend, -inward), dir(178 + bend, inward)] }));
      return { ...p, props: [{ kind: "kettlebell", at: mid(p.j.lwr, p.j.rwr), hang: DOWN }] };
    },
    cues: [
      "Stand with your feet shoulder-width apart and tighten your core",
      "Hold the kettlebell in both hands and lift it straight overhead, elbows by your ears",
      "Bend your elbows to lower it behind your head, slowly and under control",
      "Straighten your arms to lift it back overhead",
    ],
  },
  {
    // Sweat "Romanian Kettlebell Deadlift" (a weaker source, marked so on the page): kettlebell in both hands, palms to
    // the body; feet hip- to shoulder-width; shoulder blades down and back, core braced; hinge from the hips, the bell
    // travelling down the front of the thighs towards mid-shin, back flat, until a strong hamstring stretch (typically
    // around mid-shin); drive through the heels to stand, the bell close to the legs. Drawn like the barbell drawing.
    exercise: "rdl", using: ["kettlebell"],
    pose: (t) => {
      const lean = lerp(0, 72, t) * Math.PI / 180, hipZ = 6 - SEG.torso * Math.sin(lean);
      const hipC: V3 = [0, Math.sqrt(73 ** 2 - hipZ ** 2), hipZ], torso: V3 = [0, Math.cos(lean), Math.sin(lean)];
      const [lh, rh] = hipsOf(hipC), [ls, rs] = shouldersOf(hipC, torso);
      const L = twoBone(lh, [SEG.hipW, 0, 0], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-SEG.hipW, 0, 0], SEG.thigh, SEG.shin, FWD);
      const toward = (s: V3, x: number): V3 => { const d: V3 = [x - s[0], -50, 0], n = Math.hypot(...d); return [d[0] / n, d[1] / n, d[2] / n]; };
      const ul = toward(ls, 3), ur = toward(rs, -3);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [ul, ur], fore: [ul, ur] });
      return { ...p, props: [{ kind: "kettlebell", at: mid(p.j.lwr, p.j.rwr), hang: DOWN }] };
    },
    cues: [
      "Hold the kettlebell in both hands, palms facing you, feet hip- to shoulder-width apart, shoulder blades down and back",
      "Hinge from your hips so the kettlebell travels down the front of your thighs, back flat",
      "Stop when you feel a strong stretch in your hamstrings, usually around mid-shin",
      "Drive through your heels to stand, keeping the kettlebell close to your legs",
    ],
  },
  {
    // Sweat "How To Do A Romanian Deadlift With Dumbbells" (a weaker source, marked so on the page): feet hip-width, a
    // dumbbell in each hand in front of the thighs, palms to the body, arms straight; a soft knee bend that stays the
    // same; push the hips back, the dumbbells close to the legs, until a strong hamstring stretch (for most people
    // between just below the knee and mid-shin); drive the hips forward to stand tall without leaning back.
    exercise: "rdl", using: ["dumbbells"],
    pose: (t) => {
      const lean = lerp(0, 70, t) * Math.PI / 180, hipZ = 6 - SEG.torso * Math.sin(lean);
      const hipC: V3 = [0, Math.sqrt(73 ** 2 - hipZ ** 2), hipZ], torso: V3 = [0, Math.cos(lean), Math.sin(lean)];
      const [lh, rh] = hipsOf(hipC);
      const L = twoBone(lh, [SEG.hipW, 0, 0], SEG.thigh, SEG.shin, FWD), R = twoBone(rh, [-SEG.hipW, 0, 0], SEG.thigh, SEG.shin, FWD);
      const p = body({ hipC, torso, thigh: [L[0], R[0]], shin: [L[1], R[1]], upper: [dir(0, -3), dir(0, 3)], fore: [dir(0, -3), dir(0, 3)] });
      return dumbbellsAt(p, () => [1, 0, 0]);
    },
    cues: [
      "Stand with your feet hip-width apart, a dumbbell in each hand in front of your thighs, palms facing you",
      "Unlock your knees into a soft bend and keep that bend the whole way",
      "Push your hips back, keeping the dumbbells close to your legs, until you feel a strong stretch in your hamstrings",
      "Drive your hips forward to stand tall, without leaning back",
    ],
  },
];

/** The animation for the version of an exercise the visitor will see, if there is one. */
export function animationFor(ex: Exercise, have: ReadonlySet<Equipment>): Animation | undefined {
  const v = variantFor(ex, have);
  return ANIMATIONS.find((a) => a.exercise === ex.id && (a.using ? !!v && a.using.some((e) => v.using.includes(e)) : !v));
}

/** Where in the movement to be at a moment, as 0 → 1 → 0 over one repetition of `period` milliseconds. */
export const PERIOD = 3200;
export const phase = (ms: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (ms % PERIOD)) / PERIOD);
/** Where an animation is at a moment: there and back for most, once round per period for a loop. */
export const positionAt = (a: Animation, ms: number) => a.loop ? (ms % PERIOD) / PERIOD : phase(ms);
