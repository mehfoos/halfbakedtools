// Pure planning code (no DOM): which exercises are possible with the chosen equipment, how many
// "fractional sets" each muscle gets from one set of each exercise, and the search for short lists of
// exercises that cover the chosen targets.
import { AEROBIC, EXERCISES, MUSCLES, type Equipment, type Exercise, type Muscle, type Target } from "./catalogue.ts";

export const DIRECT = 1;     // a set that trains the muscle directly counts as 1 set
export const INDIRECT = 0.5; // ... indirectly, as half a set (Pelland et al. 2026, "fractional" method)

/** WHO 2020 intensity bands in METs. */
export const MODERATE_MET = 3, VIGOROUS_MET = 6;

export function canDo(ex: Exercise, have: ReadonlySet<Equipment>): boolean {
  return ex.needs.every((anyOf) => anyOf.some((e) => have.has(e)));
}

/** Fractional sets each muscle gets from one set of the exercise. */
export function weights(ex: Exercise): Map<Muscle, number> {
  const w = new Map<Muscle, number>();
  for (const m of ex.indirect) w.set(m, INDIRECT);
  for (const m of ex.direct) w.set(m, DIRECT);
  return w;
}

/** Fractional sets per muscle from one set of each exercise in the list. */
export function coverage(list: Exercise[]): Record<Muscle, number> {
  const c = Object.fromEntries(MUSCLES.map((m) => [m.id, 0])) as Record<Muscle, number>;
  for (const ex of list) for (const [m, v] of weights(ex)) c[m] += v;
  return c;
}

export function intensity(met: number): "light" | "moderate" | "vigorous" {
  return met >= VIGOROUS_MET ? "vigorous" : met >= MODERATE_MET ? "moderate" : "light";
}

export type Options = {
  targets: Target[];
  equipment: Equipment[];
  excluded?: string[];
  /** Most exercises in one suggestion. */
  maxExercises: number;
  /** How many suggestions to return. */
  count: number;
  /** Fractional sets per target muscle (from one set of each exercise) that count as covered. */
  depth: number;
  /** Largest share of exercises a suggestion may have in common with an earlier one (0 = none, 1 = any). */
  overlap: number;
};

export type Suggestion = {
  exercises: Exercise[];
  coverage: Record<Muscle, number>;
  /** Share of the targets covered, 0..1 (each target capped at `depth`). */
  score: number;
  missing: Target[];
};

export type Result = { suggestions: Suggestion[]; available: number; candidates: number; relaxed: boolean; truncated: boolean };

const MAX_CANDIDATES = 30;
const PER_TARGET = 3;
const HARD_MAX_EXERCISES = 10;

export function suggest(o: Options): Result {
  const have = new Set(o.equipment);
  const excluded = new Set(o.excluded ?? []);
  const muscleTargets = o.targets.filter((t): t is Muscle => t !== AEROBIC);
  const wantAerobic = o.targets.includes(AEROBIC);
  const nT = muscleTargets.length + (wantAerobic ? 1 : 0);
  const depth = Math.max(o.depth, 0.5);
  const K = Math.min(Math.max(1, Math.round(o.maxExercises)), HARD_MAX_EXERCISES);
  const available = EXERCISES.filter((e) => canDo(e, have) && !excluded.has(e.id));
  if (!nT) return { suggestions: [], available: available.length, candidates: 0, relaxed: false, truncated: false };

  // Candidates: available exercises that help with at least one target.
  const gain = (e: Exercise) => {
    const w = weights(e);
    return muscleTargets.reduce((s, m) => s + (w.get(m) ?? 0), 0) + (wantAerobic && e.kind === "aerobic" ? 1 : 0);
  };
  const maxMet = (e: Exercise) => Math.max(0, ...(e.met ?? []).map((r) => r.met));
  // Every target keeps its best few direct exercises (so single-muscle exercises such as calf raises aren't
  // crowded out), then the rest are filled by how much they do for all targets together.
  const helpful = available.filter((e) => gain(e) > 0)
    .sort((a, b) => gain(b) - gain(a) || maxMet(b) - maxMet(a) || a.name.localeCompare(b.name));
  const keep = new Set<Exercise>();
  for (const m of muscleTargets) helpful.filter((e) => e.direct.includes(m)).slice(0, PER_TARGET).forEach((e) => keep.add(e));
  if (wantAerobic) helpful.filter((e) => e.kind === "aerobic").slice(0, PER_TARGET).forEach((e) => keep.add(e));
  for (const e of helpful) if (keep.size < MAX_CANDIDATES) keep.add(e);
  const truncated = helpful.length > keep.size;
  const cands = helpful.filter((e) => keep.has(e));
  // Exercises that do exactly the same for the chosen targets (e.g. bench press and push-up for "chest") are
  // grouped, the search runs over groups, and the groups' members are swapped in afterwards to make varied lists.
  const allW = (e: Exercise) => [...weights(e).values()].reduce((s, v) => s + v, 0);
  const keyOf = (e: Exercise) => muscleTargets.map((m) => weights(e).get(m) ?? 0).join(",") + (wantAerobic && e.kind === "aerobic" ? "|a" : "");
  const groupMap = new Map<string, Exercise[]>();
  for (const e of cands) groupMap.set(keyOf(e), [...(groupMap.get(keyOf(e)) ?? []), e]);
  const groups = [...groupMap.values()].map((g) => g.sort((a, b) => allW(b) - allW(a) || maxMet(b) - maxMet(a) || a.name.localeCompare(b.name)));
  const W = groups.map((g) => muscleTargets.map((m) => weights(g[0]).get(m) ?? 0));
  const isAero = groups.map((g) => wantAerobic && g[0].kind === "aerobic");

  // Depth-first search over sets of up to K groups. A group is only added if it raises the capped score;
  // because the capped score has diminishing returns, a set containing a group that adds nothing is always
  // beaten by the same set without it, so nothing worthwhile is skipped.
  type Found = { idx: number[]; capped: number; extra: number };
  const found: Found[] = [];
  const cov = new Array(muscleTargets.length).fill(0);
  const pick: number[] = [];
  let aero = 0;
  const capped = () => cov.reduce((s, v) => s + Math.min(v, depth), 0) + (aero > 0 ? depth : 0);
  const dfs = (start: number, current: number) => {
    if (pick.length) found.push({ idx: [...pick], capped: current, extra: cov.reduce((s, v) => s + Math.min(v, 2 * depth), 0) });
    if (pick.length === K) return;
    for (let i = start; i < groups.length; i++) {
      for (let j = 0; j < cov.length; j++) cov[j] += W[i][j];
      if (isAero[i]) aero++;
      const next = capped();
      if (next > current + 1e-9) { pick.push(i); dfs(i + 1, next); pick.pop(); }
      for (let j = 0; j < cov.length; j++) cov[j] -= W[i][j];
      if (isAero[i]) aero--;
    }
  };
  dfs(0, 0);

  // Best first: most of the targets covered, then fewest exercises, then most work on the targets
  // (up to twice the depth). Within that, lists are made from each group's members, preferring the
  // hardest aerobic option and the most muscles worked overall.
  found.sort((a, b) => b.capped - a.capped || a.idx.length - b.idx.length || b.extra - a.extra);
  type Concrete = { ex: Exercise[]; capped: number };
  const concretes: Concrete[] = [];
  const MAX_PER = 60, MAX_ALL = 6000;
  for (const f of found) {
    if (concretes.length >= MAX_ALL) break;
    const batch: Exercise[][] = [];
    const walk = (k: number, acc: Exercise[]) => {
      if (batch.length >= MAX_PER) return;
      if (k === f.idx.length) { batch.push([...acc]); return; }
      for (const e of groups[f.idx[k]]) { acc.push(e); walk(k + 1, acc); acc.pop(); if (batch.length >= MAX_PER) return; }
    };
    walk(0, []);
    const score = (ex: Exercise[]) => Math.max(0, ...ex.map(maxMet)) * 100 + ex.reduce((s, e) => s + allW(e), 0);
    batch.sort((x, y) => score(y) - score(x));
    for (const ex of batch) concretes.push({ ex, capped: f.capped });
  }

  // Pick varied suggestions: each may share at most `overlap` of its exercises with every earlier one.
  const choose = (overlap: number, from: Concrete[], chosen: Concrete[]) => {
    for (const f of from) {
      if (chosen.length >= o.count) break;
      if (chosen.includes(f)) continue;
      const ok = chosen.every((c) => {
        const shared = f.ex.filter((e) => c.ex.includes(e)).length;
        return shared <= Math.floor(overlap * Math.min(f.ex.length, c.ex.length));
      });
      if (ok) chosen.push(f);
    }
    return chosen;
  };
  const chosen = choose(o.overlap, concretes, []);
  let relaxed = false;
  if (chosen.length < o.count && o.overlap < 1) {
    const before = chosen.length;
    choose(1, concretes.filter((f) => f.capped >= (chosen[0]?.capped ?? 0) - 1e-9), chosen);
    relaxed = chosen.length > before;
  }

  const suggestions = chosen.map((f) => {
    const exercises = f.ex;
    const c = coverage(exercises);
    const missing: Target[] = muscleTargets.filter((m) => c[m] < depth - 1e-9);
    if (wantAerobic && !exercises.some((e) => e.kind === "aerobic")) missing.push(AEROBIC);
    return { exercises, coverage: c, score: f.capped / (depth * nT), missing };
  });
  return { suggestions, available: available.length, candidates: cands.length, relaxed, truncated };
}
