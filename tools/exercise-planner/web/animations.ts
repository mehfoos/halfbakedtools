// The "Show how" animations: one per exercise version, each drawn from the instructions on the page the
// exercise's "How to do it" link points to (`howTo` in catalogue.ts). They are first-pass illustrations made by
// this site, not reviewed by a fitness professional, and are labelled so on the page. What each was compared with,
// and when, is in VERIFICATION.md; the tests check that every one keeps its proportions and stays in view.
import type { Equipment, Exercise } from "./catalogue.ts";
import { variantFor } from "./planner.ts";
import { add, body, dir, grounded, lerp, yaw, type Joint, type Pose, type Prop, type V3 } from "./figure.ts";

export type Animation = {
  /** The exercise id in catalogue.ts. */
  exercise: string;
  /** For an exercise with variants: the equipment of the variant drawn (matched against the visitor's variant). */
  using?: Equipment[];
  /** The movement, given the position t in it: 0 at the start, 1 at the far end. */
  pose: (t: number) => Pose;
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
];

/** The animation for the version of an exercise the visitor will see, if there is one. */
export function animationFor(ex: Exercise, have: ReadonlySet<Equipment>): Animation | undefined {
  const v = variantFor(ex, have);
  return ANIMATIONS.find((a) => a.exercise === ex.id && (a.using ? !!v && a.using.some((e) => v.using.includes(e)) : !v));
}

/** Where in the movement to be at a moment, as 0 → 1 → 0 over one repetition of `period` milliseconds. */
export const PERIOD = 3200;
export const phase = (ms: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (ms % PERIOD)) / PERIOD);
