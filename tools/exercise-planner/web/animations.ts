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
  /** The movement, given the position t in it: 0 at the start, 1 at the far end. */
  pose: (t: number) => Pose;
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
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

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
    pose: (t) => {
      const stepT = Math.min(1, t * 1.6), lowT = Math.max(0, (t - 0.25) / 0.75);
      const heel = lerp(0, 50, lowT) * Math.PI / 180;
      const backAnkle: V3 = [-3, 12 * Math.sin(heel), -6 - 12 * Math.cos(heel)];
      const front: V3 = [3, 6 * Math.sin(Math.PI * stepT) * (1 - lowT), lerp(-18, 52, stepT)];
      const shin = 10 * Math.PI / 180;
      const bottomHip: V3 = [0, SEG.shin * Math.cos(shin), 52 + SEG.shin * Math.sin(shin) - SEG.thigh];
      const standHip: V3 = [0, SEG.shin + SEG.thigh - 0.5, -9];
      const hipC: V3 = [0, lerp(standHip[1], bottomHip[1], lowT), lerp(standHip[2], bottomHip[2] + 4, t)];
      const [lh, rh] = hipsOf(hipC);
      const L = twoBone(lh, front, SEG.thigh, SEG.shin, [0, 0, 1]);
      const R = twoBone(rh, backAnkle, SEG.thigh, SEG.shin, [0, -0.3, 1]);
      const lean = lerp(0, 10, lowT);
      return body({ hipC, torso: dir(180 - lean), thigh: [L[0], R[0]], shin: [L[1], R[1]], foot: [dir(90), dir(90 - (heel * 180) / Math.PI)], upper: [DOWN, DOWN], fore: [DOWN, DOWN] });
    },
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
];

/** The animation for the version of an exercise the visitor will see, if there is one. */
export function animationFor(ex: Exercise, have: ReadonlySet<Equipment>): Animation | undefined {
  const v = variantFor(ex, have);
  return ANIMATIONS.find((a) => a.exercise === ex.id && (a.using ? !!v && a.using.some((e) => v.using.includes(e)) : !v));
}

/** Where in the movement to be at a moment, as 0 → 1 → 0 over one repetition of `period` milliseconds. */
export const PERIOD = 3200;
export const phase = (ms: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (ms % PERIOD)) / PERIOD);
