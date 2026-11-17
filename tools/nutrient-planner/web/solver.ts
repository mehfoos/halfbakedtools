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

export type Bound = { value: number; basis: "abs" | "pctEnergy" | "perKg" | "perMJ"; source: string; note?: string; extraG?: number;
  byAge?: Record<string, number>;
  fromAge?: number;                   // the bound applies only from this age (whole years)
  toAge?: number };                   // ... or only up to and including this age   // exact value for a given whole year of age, where the source sets one
export type TargetSpec = { min?: Bound; max?: Bound };
export type NutrientDef = { key: string; label: string; unit: string };
export type Food = {
  id: string; name: string; group: string; diet: "vegan" | "vegetarian" | "meat";
  unit: string; unitGrams: number; step: number; maxGrams: number; notes?: string | null;
  capGroup?: string | null;           // foods in the same group share one daily cap (PlanInput.groupCaps)
  penalty?: number;                   // small cost of including this food at all (same units as a relative shortfall)
  per100g: Record<string, number>;
};

export type ResolvedTarget = {
  key: string; label: string; unit: string;
  min?: number; max?: number;
  // Set when the source gives the target as a share of energy (% of energy, or per MJ): the amount per kcal.
  // min/max then hold the amount at the middle of the calorie range (for display); a plan is judged
  // against its own calories.
  minPerKcal?: number; maxPerKcal?: number;
  minSource?: string; maxSource?: string;
  custom?: boolean;
};

export type Override = { min?: number | null; max?: number | null };

export const KCAL_PER_G: Record<string, number> = { fat: 9, satfat: 9, la: 9, ala: 9, carbohydrate: 4, protein: 4 };

/** Turn a profile's target specs into absolute daily numbers. */
export function resolveTargets(
  specs: Record<string, TargetSpec>,
  nutrients: NutrientDef[],
  energyKcal: number,
  weightKg: number,
  standardId: string,
  overrides: Record<string, Override> = {},
  age?: number,
): ResolvedTarget[] {
  const byKey = new Map(nutrients.map((n) => [n.key, n]));
  const out: ResolvedTarget[] = [];
  const toAbs = (key: string, b: Bound) => {
    const v = age !== undefined && b.byAge?.[String(Math.floor(age))] !== undefined ? b.byAge[String(Math.floor(age))] : b.value;
    if (b.basis === "abs") return v;
    if (b.basis === "perKg") return (v * weightKg) / 1000 + (b.extraG ?? 0); // mg/kg -> g/day
    return energyKcal * perKcal(key, b)!;
  };
  /** Amount per kcal for targets tied to energy; undefined for the rest. */
  const perKcal = (key: string, b: Bound) => {
    const v = age !== undefined && b.byAge?.[String(Math.floor(age))] !== undefined ? b.byAge[String(Math.floor(age))] : b.value;
    if (b.basis === "perMJ") return v * 0.004184;
    if (b.basis !== "pctEnergy") return undefined;
    // PHE converts carbohydrate energy at 3.75 kcal/g; others use 4.
    const perG = key === "carbohydrate" && standardId === "uk" ? 3.75 : KCAL_PER_G[key] ?? 4;
    return v / 100 / perG;
  };
  for (const [key, spec] of Object.entries(specs)) {
    const def = byKey.get(key);
    if (!def) continue;
    const t: ResolvedTarget = { key, label: def.label, unit: def.unit };
    const applies = (b?: Bound): b is Bound => !!b && (age === undefined || ((b.fromAge === undefined || Math.floor(age) >= b.fromAge) && (b.toAge === undefined || Math.floor(age) <= b.toAge)));
    if (applies(spec.min)) { t.min = toAbs(key, spec.min); t.minSource = spec.min.source; t.minPerKcal = perKcal(key, spec.min); }
    if (applies(spec.max)) { t.max = toAbs(key, spec.max); t.maxSource = spec.max.source; t.maxPerKcal = perKcal(key, spec.max); }
    const o = overrides[key];
    if (o) {
      // a custom value is an absolute amount, so it no longer follows the plan's calories
      if (o.min !== undefined) { t.min = o.min ?? undefined; t.minPerKcal = undefined; t.custom = true; }
      if (o.max !== undefined) { t.max = o.max ?? undefined; t.maxPerKcal = undefined; t.custom = true; }
    }
    if (t.min !== undefined || t.max !== undefined) out.push(t);
  }
  return out;
}

/** A target's minimum and maximum for a day with this many calories. */
export function boundsAt(t: ResolvedTarget, energyKcal: number): { min?: number; max?: number } {
  return {
    min: t.minPerKcal !== undefined && energyKcal > 0 ? t.minPerKcal * energyKcal : t.min,
    max: t.maxPerKcal !== undefined && energyKcal > 0 ? t.maxPerKcal * energyKcal : t.max,
  };
}

/**
 * Nutrients with values for at least `minCoverage` of the chosen foods are optimised; the rest are reported
 * as not assessed. For the search only, a food with no value adds nothing to a nutrient's total (the amount
 * is a lower bound). The plans it returns are measured again by analysis.ts, which counts the foods with no
 * data and never states a target as passed when that missing data could change the answer.
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
  groupCaps?: Record<string, number>;   // grams a day, in total, for all foods of a capGroup
  quickFoods?: Food[];                  // a shorter list to fall back on if the full search runs out of time
};

export type PlanItem = { id: string; name: string; grams: number; amountLabel: string };
export type Plan = {
  items: PlanItem[];
  totals: Record<string, number>;
  energy: number;
  score: number;               // sum of relative shortfalls (0 = every target met)
  timedOut?: boolean;          // the search hit its time limit, so a better combination may exist
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
    obj.push(`${num(0.0001 + (f.penalty ?? 0))} y${i}`);
  });
  // Shortfalls are relative to the target. For a target tied to energy the shortfall is measured against
  // the plan's own calories; its weight uses the middle of the calorie range (the objective must be linear).
  const eMid = (input.energyLow + input.energyHigh) / 2;
  targets.forEach((t, j) => { if (t.min && t.min > 0) obj.push(`${num(1 / (t.minPerKcal !== undefined ? t.minPerKcal * eMid : t.min))} s${j}`); });

  lines.push("Minimize", " obj: " + obj.join(" + "), "Subject To");
  const coef = (f: Food, key: string) => ((f.per100g[key] ?? 0) * stepGrams(f)) / 100;
  // Σ (nutrient − perKcal × energy) × amount: zero when the day's nutrient is exactly its share of the day's energy.
  const row = (key: string, perKcal = 0) => foods
    .map((f, i) => [coef(f, key) - perKcal * coef(f, "energy"), i] as const)
    .filter(([c]) => Math.abs(c) > 1e-12)
    .map(([c, i]) => `${num(c)} n${i}`);
  const sum = (r: string[]) => r.join(" + ").replace(/\+ -/g, "- ");

  targets.forEach((t, j) => {
    if (t.min && t.min > 0) {
      if (t.minPerKcal !== undefined) lines.push(` min${j}: ${sum([...row(t.key, t.minPerKcal), `s${j}`])} >= 0`);
      else lines.push(` min${j}: ${sum([...row(t.key), `s${j}`])} >= ${num(t.min)}`);
    }
    if (t.max !== undefined) {
      const r = t.maxPerKcal !== undefined ? row(t.key, t.maxPerKcal) : row(t.key);
      if (r.length) lines.push(` max${j}: ${sum(r)} <= ${t.maxPerKcal !== undefined ? "0" : num(t.max)}`);
    }
  });
  const e = row("energy");
  lines.push(` elo: ${e.join(" + ")} >= ${num(input.energyLow)}`);
  lines.push(` ehi: ${e.join(" + ")} <= ${num(input.energyHigh)}`);
  foods.forEach((f, i) => lines.push(` link${i}: n${i} - ${maxSteps(f)} y${i} <= 0`));
  lines.push(` count: ${foods.map((_, i) => `y${i}`).join(" + ")} <= ${input.maxIngredients}`);
  Object.entries(input.groupCaps ?? {}).forEach(([group, grams], k) => {
    const members = foods.map((f, i) => [f, i] as const).filter(([f]) => f.capGroup === group);
    if (members.length) lines.push(` group${k}: ${members.map(([f, i]) => `${num(stepGrams(f))} n${i}`).join(" + ")} <= ${num(grams)}`);
  });
  forbidden.forEach((ids, k) => {
    const idx = ids.map((id) => foods.findIndex((f) => f.id === id)).filter((i) => i >= 0);
    if (!idx.length) return;   // none of that option's foods are in this list
    const keepAtMost = idx.length - Math.max(1, Math.ceil(idx.length / 3));
    lines.push(` cut${k}: ${idx.map((i) => `y${i}`).join(" + ")} <= ${keepAtMost}`);
  });

  lines.push("Bounds");
  foods.forEach((f, i) => lines.push(` 0 <= n${i} <= ${maxSteps(f)}`));
  targets.forEach((t, j) => { if (t.min && t.min > 0) lines.push(` 0 <= s${j} <= ${num(t.minPerKcal !== undefined ? t.minPerKcal * input.energyHigh : t.min)}`); });
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
  return targets.reduce((s, t) => {
    const min = boundsAt(t, totals.energy ?? 0).min;
    return min && min > 0 ? s + Math.max(0, 1 - (totals[t.key] ?? 0) / min) : s;
  }, 0);
}

type Chosen = { food: Food; grams: number }[];

/** One search: the foods and amounts chosen, and whether the search was stopped by its time limit. */
async function solveOnce(input: PlanInput, forbidden: string[][], solve: Solver): Promise<{ chosen: Chosen; timedOut: boolean } | null> {
  const res = await solve(buildLp(input, forbidden));
  if (res.status !== "Optimal" && res.status !== "Time limit reached") return null;
  const chosen = input.foods
    .map((food, i) => ({ food, grams: Math.round(res.values[`n${i}`] ?? 0) * stepGrams(food) }))
    .filter((x) => x.grams > 0);
  return chosen.length ? { chosen, timedOut: res.status === "Time limit reached" } : null;
}

/** What the optimiser minimises, worked out for a finished plan: relative shortfalls plus the foods' penalties. */
function planCost(input: PlanInput, chosen: Chosen) {
  const totals = totalsFor(chosen, [...input.targets.map((t) => t.key), "energy"]);
  return shortfallScore(input.targets, totals) + chosen.reduce((s, c) => s + (c.food.penalty ?? 0), 0);
}

/**
 * Find up to `options` distinct plans. Returns [] if the constraints cannot all be met.
 *
 * If a search over the full food list is stopped by its time limit and `input.quickFoods` names a smaller
 * list (the common foods), that smaller list is searched too and the better of the two plans is kept, so a
 * long food list can never give a worse suggestion than the short one would have.
 */
export async function plan(input: PlanInput, solve: Solver, allKeys: string[], onPlan?: (p: Plan) => void): Promise<Plan[]> {
  const plans: Plan[] = [];
  const forbidden: string[][] = [];
  const quick = input.quickFoods && input.quickFoods.length < input.foods.length ? { ...input, foods: input.quickFoods } : null;
  for (let k = 0; k < input.options; k++) {
    let best = await solveOnce(input, forbidden, solve);
    if (quick && (!best || best.timedOut)) {
      const alt = await solveOnce(quick, forbidden, solve);
      if (alt && (!best || planCost(input, alt.chosen) < planCost(input, best.chosen))) best = { chosen: alt.chosen, timedOut: true };
    }
    if (!best) break;
    const { chosen } = best;
    const totals = totalsFor(chosen, Array.from(new Set([...allKeys, "energy"])));
    plans.push({
      ...(best.timedOut ? { timedOut: true } : {}),
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
