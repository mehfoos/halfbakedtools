// Turns the person's settings and chosen foods into the optimiser's input. Pure; no page access.
// This is where the planner's own rules are applied before any search:
//   - foods the NHS says this person should avoid are left out;
//   - children's portion limits are scaled down;
//   - less familiar foods carry a small penalty;
//   - vitamin D is not planned for unless the person asks.
import { splitAssessable, type PlanInput, type ResolvedTarget } from "./solver.ts";
import { GROUP_CAPS, avoidReason, avoidReasons, familiarityPenalty, portionFactor, scaledMax, type PlannerFood } from "./foods.ts";
import type { Person } from "./person.ts";
import type { Settings } from "./state.ts";

export function planInput(selected: PlannerFood[], targets: ResolvedTarget[], s: Settings, person: Person): { input: PlanInput; avoided: { text: string; ref: string }[] } {
  const who = { age: s.age, life: person.life };
  // A target is planned for only if enough of the chosen foods have data for it.
  const { assessable } = splitAssessable(targets, selected);
  const factor = portionFactor(s.age, person.midKcal);
  const foods = selected.filter((f) => !avoidReason(f, who))
    .map((f) => ({ ...f, maxGrams: factor < 1 ? scaledMax(f, factor) : f.maxGrams, penalty: familiarityPenalty(f, s.n) }));
  const groupCaps = Object.fromEntries(Object.entries(GROUP_CAPS)
    .map(([g, v]) => [g, factor < 1 ? Math.max(10, Math.floor((v * factor) / 10) * 10) : v]));
  return {
    avoided: avoidReasons(selected, who),
    input: {
      foods,
      // Vitamin D is left to the notice (sunlight and supplements) unless the person asks for it from food.
      targets: assessable.filter((t) => s.vitaminD || t.key !== "vitaminD"),
      energyLow: person.band.low, energyHigh: person.band.high,
      maxIngredients: s.n, options: s.options, groupCaps,
      quickFoods: foods.filter((f) => f.common),
    },
  };
}
