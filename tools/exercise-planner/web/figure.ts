// A simple stick figure for the "Show how" animations. Pure code: a pose is a set of joint positions in 3D, and
// figureSvg() draws it seen from the side and from the front. The animations themselves are in animations.ts.
//
// Coordinates (arbitrary units, about 1 unit per 1.1 cm for a figure of average build): x points to the figure's
// left, y up (0 is the floor), z forward (the way the figure faces). The proportions are round numbers chosen to
// look like an adult, not measurements.

export type V3 = [number, number, number];

/** Segment lengths: every pose must keep these (tested). */
export const SEG = { foot: 12, shin: 38, thigh: 38, torso: 46, lowBack: 20, upBack: 26, neck: 6, head: 8, upper: 28, fore: 26, hipW: 8, shW: 15 } as const;
// The trunk bends at the waist: lowBack (hips to waist) + upBack (waist to neck) = torso.

export const JOINTS = ["head", "neck", "waist", "lsh", "rsh", "lel", "rel", "lwr", "rwr", "hipC", "lhip", "rhip", "lknee", "rknee", "lankle", "rankle", "ltoe", "rtoe"] as const;
export type Joint = (typeof JOINTS)[number];

/** Pairs of joints drawn as limbs, with the length each must keep. */
export const BONES: [Joint, Joint, number][] = [
  ["lankle", "ltoe", SEG.foot], ["rankle", "rtoe", SEG.foot],
  ["lankle", "lknee", SEG.shin], ["rankle", "rknee", SEG.shin],
  ["lknee", "lhip", SEG.thigh], ["rknee", "rhip", SEG.thigh],
  ["lhip", "rhip", 2 * SEG.hipW],
  ["hipC", "waist", SEG.lowBack], ["waist", "neck", SEG.upBack],
  ["lsh", "rsh", 2 * SEG.shW],
  ["lsh", "lel", SEG.upper], ["rsh", "rel", SEG.upper],
  ["lel", "lwr", SEG.fore], ["rel", "rwr", SEG.fore],
  ["neck", "head", SEG.neck + SEG.head],
];

/** Equipment, drawn in grey: a dumbbell (handle along `axis`), a bar, or a plain line (bench, cable, step...). */
export type Prop =
  | { kind: "dumbbell"; at: V3; axis: V3 }
  | { kind: "bar"; at: V3; axis: V3; half: number; plate?: number }
  | { kind: "line"; a: V3; b: V3; width?: number };

export type Pose = { j: Record<Joint, V3>; props: Prop[] };

// --- Vector helpers ---
export const add = (p: V3, v: V3, k = 1): V3 => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];
export const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rad = (d: number) => (d * Math.PI) / 180;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A unit direction. `pitch` is the angle in degrees from straight down, turning forward (0 down, 90 forward,
 * 180 up, -90 back). `out` tilts it towards the figure's left (+) or right (−) by that many degrees.
 */
export function dir(pitch: number, out = 0): V3 {
  const p = rad(pitch), o = rad(out);
  return [Math.sin(o), -Math.cos(p) * Math.cos(o), Math.sin(p) * Math.cos(o)];
}

/** Turn a direction about the vertical axis by `deg` (positive turns the forward direction towards the left). */
export function yaw(v: V3, deg: number): V3 {
  const a = rad(deg);
  return [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
}

/**
 * Build a whole pose from a hip centre and directions for each segment. Directions are unit vectors (use dir()).
 * Side-specific parts take [left, right]. Everything else follows from SEG, so lengths always hold.
 */
export function body(o: {
  hipC: V3;
  torso: V3; // from the hip centre up to the waist, and on to the neck unless `chest` is given
  chest?: V3; // from the waist up to the neck, for a bent trunk (a crunch); defaults to `torso`
  head?: V3; // from the neck to the head; defaults to the torso direction
  thigh: [V3, V3]; // from each hip down to the knee
  shin: [V3, V3]; // from each knee down to the ankle
  foot?: [V3, V3]; // from each ankle to the toes; defaults to forward
  shrug?: number; // how far the shoulders are raised above their usual height
  upper: [V3, V3]; // from each shoulder to the elbow
  fore: [V3, V3]; // from each elbow to the wrist
  props?: Prop[];
}): Pose {
  const j = {} as Record<Joint, V3>;
  j.hipC = o.hipC;
  j.lhip = add(o.hipC, [SEG.hipW, 0, 0]);
  j.rhip = add(o.hipC, [-SEG.hipW, 0, 0]);
  j.waist = add(o.hipC, o.torso, SEG.lowBack);
  j.neck = add(j.waist, o.chest ?? o.torso, SEG.upBack);
  j.head = add(j.neck, o.head ?? o.chest ?? o.torso, SEG.neck + SEG.head);
  j.lsh = add(j.neck, [SEG.shW, o.shrug ?? 0, 0]);
  j.rsh = add(j.neck, [-SEG.shW, o.shrug ?? 0, 0]);
  const foot = o.foot ?? [[0, 0, 1], [0, 0, 1]];
  ([["l", 0], ["r", 1]] as const).forEach(([s, i]) => {
    j[`${s}knee`] = add(j[`${s}hip`], o.thigh[i], SEG.thigh);
    j[`${s}ankle`] = add(j[`${s}knee`], o.shin[i], SEG.shin);
    j[`${s}toe`] = add(j[`${s}ankle`], foot[i], SEG.foot);
    j[`${s}el`] = add(j[`${s}sh`], o.upper[i], SEG.upper);
    j[`${s}wr`] = add(j[`${s}el`], o.fore[i], SEG.fore);
  });
  return { j, props: o.props ?? [] };
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: V3): V3 => { const n = Math.hypot(...v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };

/**
 * Two segments (lengths l1, l2) from `start` reaching towards `end`, bending towards `hint`: returns the direction
 * of each segment, for body(). If `end` is out of reach the limb straightens towards it.
 */
export function twoBone(start: V3, end: V3, l1: number, l2: number, hint: V3): [V3, V3] {
  const d = sub(end, start), D = Math.min(Math.hypot(...d), l1 + l2 - 1e-6), u = unit(d);
  const h = unit(sub(hint, [u[0] * dot(hint, u), u[1] * dot(hint, u), u[2] * dot(hint, u)]));
  const a = (l1 * l1 + D * D - l2 * l2) / (2 * D), up = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mid = add(add(start, u, a), h, up);
  return [unit(sub(mid, start)), unit(sub(add(start, u, D), mid))];
}

/** The shoulder positions body() will give for a hip centre and torso direction (for reaching with twoBone). */
export const shouldersOf = (hipC: V3, torso: V3, chest: V3 = torso): [V3, V3] => {
  const neck = add(add(hipC, torso, SEG.lowBack), chest, SEG.upBack);
  return [add(neck, [SEG.shW, 0, 0]), add(neck, [-SEG.shW, 0, 0])];
};
export const hipsOf = (hipC: V3): [V3, V3] => [add(hipC, [SEG.hipW, 0, 0]), add(hipC, [-SEG.hipW, 0, 0])];

/** Move a pose so its lowest point (joints only) rests on the floor. */
export function grounded(p: Pose): Pose {
  const low = Math.min(...JOINTS.map((k) => p.j[k][1]));
  const shift = (v: V3): V3 => [v[0], v[1] - low, v[2]];
  const j = Object.fromEntries(JOINTS.map((k) => [k, shift(p.j[k])])) as Record<Joint, V3>;
  const props = p.props.map((q): Prop => q.kind === "line" ? { ...q, a: shift(q.a), b: shift(q.b) } : { ...q, at: shift(q.at) });
  return { j, props };
}

// --- Drawing ---
export type View = "side" | "front";
export const BOX = 200; // each view is a BOX × BOX square by default; a longer pose can use a bigger box
export const floorOf = (box: number) => box - 12; // the floor's height on screen

/** Screen x, screen y and nearness (bigger = nearer the viewer). The side view is seen from the figure's right. */
export function project(p: V3, view: View, box = BOX): [number, number, number] {
  const fl = floorOf(box);
  return view === "side" ? [box / 2 + p[2], fl - p[1], -p[0]] : [box / 2 + p[0], fl - p[1], p[2]];
}

const NAVY = "#000080", GREY = "#555", DARK = "#333";
const f = (n: number) => Math.round(n * 10) / 10;

/** Every point a pose draws (joints and equipment ends), for checking it stays inside the box. */
export function points(p: Pose): V3[] {
  const out: V3[] = JOINTS.map((k) => p.j[k]);
  for (const q of p.props) {
    if (q.kind === "line") out.push(q.a, q.b);
    else { const h = q.kind === "bar" ? q.half : 9; out.push(add(q.at, q.axis, -h), add(q.at, q.axis, h)); }
  }
  return out;
}

/** The inside of one view's <svg>: far limbs (in the side view) pale, drawn nearest last. */
export function viewSvg(p: Pose, view: View, box = BOX): string {
  const P = (v: V3) => project(v, view, box);
  const parts: { d: number; svg: (far: boolean) => string }[] = [];
  const line = (a: V3, b: V3, colour: string, w: number) => {
    const A = P(a), B = P(b);
    parts.push({ d: (A[2] + B[2]) / 2, svg: (far) => `<line x1="${f(A[0])}" y1="${f(A[1])}" x2="${f(B[0])}" y2="${f(B[1])}" stroke="${colour}"${far ? ` stroke-opacity="0.4"` : ""} stroke-width="${w}" stroke-linecap="round"/>` });
  };
  const disc = (c: V3, r: number, colour: string, ring = false) => {
    const C = P(c);
    parts.push({ d: C[2] + 0.5, svg: (far) => ring
      ? `<circle cx="${f(C[0])}" cy="${f(C[1])}" r="${r}" fill="none" stroke="${colour}" stroke-width="3"${far ? ` stroke-opacity="0.6"` : ""}/>`
      : `<circle cx="${f(C[0])}" cy="${f(C[1])}" r="${r}" fill="${colour}"${far ? ` fill-opacity="0.6"` : ""}/>` });
  };
  for (const [a, b] of BONES) if (!(a === "neck" && b === "head")) line(p.j[a], p.j[b], NAVY, 6);
  const H = P(p.j.head);
  parts.push({ d: H[2], svg: () => `<circle cx="${f(H[0])}" cy="${f(H[1])}" r="${SEG.head}" fill="${NAVY}"/>` });
  for (const q of p.props) {
    if (q.kind === "line") line(q.a, q.b, GREY, q.width ?? 4);
    else {
      const h = q.kind === "bar" ? q.half : 9, a = add(q.at, q.axis, -h), b = add(q.at, q.axis, h);
      line(a, b, GREY, 3);
      const ends = q.kind === "bar" ? [add(q.at, q.axis, -h + 6), add(q.at, q.axis, h - 6)] : [a, b];
      // Barbell plates are drawn as rings, so they don't hide the figure behind them.
      for (const e of ends) disc(e, q.kind === "bar" ? q.plate ?? 9 : 6, DARK, q.kind === "bar");
    }
  }
  parts.sort((a, b) => a.d - b.d);
  const far = (d: number) => view === "side" && d < -2;
  return `<line x1="6" y1="${floorOf(box) + 1}" x2="${box - 6}" y2="${floorOf(box) + 1}" stroke="#c9c5a8" stroke-width="2"/>` + parts.map((x) => x.svg(far(x.d))).join("");
}
