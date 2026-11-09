// Nutrient planner optimiser.
//
// Picks at most N ingredients and practical amounts of each so that the day's
// food gets as close as possible to every minimum target without breaking any
// upper limit or the calorie band. Formulated as a mixed-integer program and
// solved with HiGHS (compiled to WebAssembly, runs in the browser).
//
//   minimise    Σ_j shortfall_j / target_j          (relative shortfall)
//             + tiny tie-breakers (less food, fewer ingredients)
//   subject to  Σ_i a_ij·q_i + shortfall_j ≥ target_j   for each minimum
//               Σ_i a_ij·q_i ≤ limit_j                   for each maximum
//               energyLow ≤ Σ_i kcal_i·q_i ≤ energyHigh
//               q_i = step_i · n_i,  n_i integer,  n_i ≤ maxSteps_i · y_i
//               Σ_i y_i ≤ N,  y_i binary
//
// Several distinct options are found by re-solving with "no-good" cuts that
// forbid reusing most of an earlier option's ingredients.

export type Bound = { value: number; basis: "abs" | "pctEnergy" | "perKg"; source: string; note?: string };
export type TargetSpec = { min?: Bound; max?: Bound };
export type NutrientDef = { key: string; label: string; unit: string };
export type Food = {
  id: string; name: string; group: string; diet: "vegan" | "vegetarian" | "meat";
  unit: string; unitGrams: number; step: number; maxGrams: number; notes?: string | null;
  per100g: Record<string, number>;
};

export type ResolvedTarget = {
  key: string; label: string; unit: string;
  min?: number; max?: number;
  minSource?: string; maxSource?: string;
  custom?: boolean;
};

export type Override = { min?: number | null; max?: number | null };

export const KCAL_PER_G: Record<string, number> = { fat: 9, satfat: 9, carbohydrate: 4, protein: 4 };

/** Turn a profile's target specs into absolute daily numbers. */
export function resolveTargets(
  specs: Record<string, TargetSpec>,
  nutrients: NutrientDef[],
  energyKcal: number,
  weightKg: number,
  standardId: string,
  overrides: Record<string, Override> = {},
): ResolvedTarget[] {
  const byKey = new Map(nutrients.map((n) => [n.key, n]));
  const out: ResolvedTarget[] = [];
  const toAbs = (key: string, b: Bound) => {
    if (b.basis === "abs") return b.value;
    if (b.basis === "perKg") return (b.value * weightKg) / 1000; // mg/kg -> g/day
    // PHE converts carbohydrate energy at 3.75 kcal/g; others use 4.
    const perG = key === "carbohydrate" && standardId === "uk" ? 3.75 : KCAL_PER_G[key] ?? 4;
    return (energyKcal * b.value) / 100 / perG;
  };
  for (const [key, spec] of Object.entries(specs)) {
    const def = byKey.get(key);
    if (!def) continue;
    const t: ResolvedTarget = { key, label: def.label, unit: def.unit };
    if (spec.min) { t.min = toAbs(key, spec.min); t.minSource = spec.min.source; }
    if (spec.max) { t.max = toAbs(key, spec.max); t.maxSource = spec.max.source; }
    const o = overrides[key];
    if (o) {
      if (o.min !== undefined) { t.min = o.min ?? undefined; t.custom = true; }
      if (o.max !== undefined) { t.max = o.max ?? undefined; t.custom = true; }
    }
    if (t.min !== undefined || t.max !== undefined) out.push(t);
  }
  return out;
}

/**
 * Nutrients with values for at least `minCoverage` of the chosen foods are optimised (a food with no
 * value counts as zero, which errs on the safe side); the rest are reported as not assessed.
 */
export function splitAssessable(targets: ResolvedTarget[], foods: Food[], minCoverage = 0.25) {
  const assessable: ResolvedTarget[] = [];
  const notAssessed: ResolvedTarget[] = [];
  for (const t of targets) {
    const have = foods.filter((f) => typeof f.per100g[t.key] === "number").length;
    (foods.length && have / foods.length >= minCoverage ? assessable : notAssessed).push(t);
  }
  return { assessable, notAssessed };
}

export type PlanInput = {
  foods: Food[];
  targets: ResolvedTarget[];   // assessable targets only
  energyLow: number;
  energyHigh: number;
  maxIngredients: number;
  options: number;            // how many distinct plans to return
};

export type PlanItem = { id: string; name: string; grams: number; amountLabel: string };
export type Plan = {
  items: PlanItem[];
  totals: Record<string, number>;
  energy: number;
  score: number;               // sum of relative shortfalls (0 = every target met)
};

export type Solver = (lp: string) => Promise<{ status: string; values: Record<string, number> }>;

// Plain decimal formatting (no exponent notation) for the LP file.
const num = (x: number) => {
  if (!Number.isFinite(x)) throw new Error("non-finite coefficient");
  if (Math.abs(x) < 1e-12) return "0";
  const s = Number(x.toPrecision(10)).toString();
  return s.includes("e") ? x.toFixed(15).replace(/0+$/, "").replace(/\.$/, "") : s;
};

function stepGrams(f: Food) { return f.step * f.unitGrams; }
function maxSteps(f: Food) { return Math.max(0, Math.floor(f.maxGrams / stepGrams(f) + 1e-9)); }

/** Build a CPLEX-LP-format model for HiGHS. Exported for testing. */
export function buildLp(input: PlanInput, forbidden: string[][] = []): string {
  const { foods, targets } = input;
  const lines: string[] = [];
  const obj: string[] = [];
  // tie-breakers: prefer fewer grams and fewer ingredients, far smaller than any real shortfall
  foods.forEach((f, i) => {
    obj.push(`${num(1e-6 * stepGrams(f))} n${i}`);
    obj.push(`0.0001 y${i}`);
  });
  targets.forEach((t, j) => { if (t.min && t.min > 0) obj.push(`${num(1 / t.min)} s${j}`); });

  lines.push("Minimize", " obj: " + obj.join(" + "), "Subject To");
  const coef = (f: Food, key: string) => ((f.per100g[key] ?? 0) * stepGrams(f)) / 100;
  const row = (key: string) => foods
    .map((f, i) => [coef(f, key), i] as const)
    .filter(([c]) => Math.abs(c) > 1e-12)
    .map(([c, i]) => `${num(c)} n${i}`);

  targets.forEach((t, j) => {
    const r = row(t.key);
    if (t.min && t.min > 0) lines.push(` min${j}: ${[...r, `s${j}`].join(" + ")} >= ${num(t.min)}`);
    if (t.max !== undefined && r.length) lines.push(` max${j}: ${r.join(" + ")} <= ${num(t.max)}`);
  });
  const e = row("energy");
  lines.push(` elo: ${e.join(" + ")} >= ${num(input.energyLow)}`);
  lines.push(` ehi: ${e.join(" + ")} <= ${num(input.energyHigh)}`);
  foods.forEach((f, i) => lines.push(` link${i}: n${i} - ${maxSteps(f)} y${i} <= 0`));
  lines.push(` count: ${foods.map((_, i) => `y${i}`).join(" + ")} <= ${input.maxIngredients}`);
  forbidden.forEach((ids, k) => {
    const idx = ids.map((id) => foods.findIndex((f) => f.id === id)).filter((i) => i >= 0);
    const keepAtMost = idx.length - Math.max(1, Math.ceil(idx.length / 3));
    lines.push(` cut${k}: ${idx.map((i) => `y${i}`).join(" + ")} <= ${keepAtMost}`);
  });

  lines.push("Bounds");
  foods.forEach((f, i) => lines.push(` 0 <= n${i} <= ${maxSteps(f)}`));
  targets.forEach((t, j) => { if (t.min && t.min > 0) lines.push(` 0 <= s${j} <= ${num(t.min)}`); });
  lines.push("General", " " + foods.map((_, i) => `n${i}`).join(" "));
  lines.push("Binary", " " + foods.map((_, i) => `y${i}`).join(" "));
  lines.push("End");
  return lines.join("\n");
}

export function describeAmount(f: Food, grams: number): string {
  if (f.unit === "g") return `${Math.round(grams)} g`;
  const units = grams / f.unitGrams;
  const n = Number.isInteger(units) ? String(units) : units.toFixed(1).replace(/\.0$/, "");
  const plural = units === 1 ? f.unit : f.unit + (f.unit.endsWith("h") ? "es" : "s");
  return `${n} ${plural} (${Math.round(grams)} g)`;
}

export function totalsFor(items: { food: Food; grams: number }[], keys: string[]) {
  const totals: Record<string, number> = {};
  for (const k of keys) totals[k] = items.reduce((s, it) => s + ((it.food.per100g[k] ?? 0) * it.grams) / 100, 0);
  return totals;
}

export function shortfallScore(targets: ResolvedTarget[], totals: Record<string, number>) {
  return targets.reduce((s, t) => (t.min && t.min > 0 ? s + Math.max(0, 1 - (totals[t.key] ?? 0) / t.min) : s), 0);
}

/** Find up to `options` distinct plans. Returns [] if the constraints cannot all be met. */
export async function plan(input: PlanInput, solve: Solver, allKeys: string[], onPlan?: (p: Plan) => void): Promise<Plan[]> {
  const plans: Plan[] = [];
  const forbidden: string[][] = [];
  for (let k = 0; k < input.options; k++) {
    const res = await solve(buildLp(input, forbidden));
    if (res.status !== "Optimal" && res.status !== "Time limit reached") break;
    const chosen = input.foods
      .map((food, i) => ({ food, grams: Math.round((res.values[`n${i}`] ?? 0)) * stepGrams(food) }))
      .filter((x) => x.grams > 0);
    if (!chosen.length) break;
    const totals = totalsFor(chosen, Array.from(new Set([...allKeys, "energy"])));
    plans.push({
      items: chosen.map(({ food, grams }) => ({ id: food.id, name: food.name, grams, amountLabel: describeAmount(food, grams) })),
      totals,
      energy: totals.energy,
      score: shortfallScore(input.targets, totals),
    });
    onPlan?.(plans[plans.length - 1]);
    forbidden.push(chosen.map((c) => c.food.id));
  }
  return plans;
}
