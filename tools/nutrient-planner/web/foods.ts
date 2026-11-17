// Food data loading and the "which foods are switched on" logic.
import type { Food, NutrientDef } from "./solver.ts";

export type PlannerFood = Food & {
  cat: string; label: string; common: boolean; fdcId: string; usdaName: string;
  noteRef?: string | null;   // the reference a food's note rests on
  fortified?: boolean | null; // a US product with nutrients added; not part of the "Everything" preset
  wider?: boolean | null;     // part of the "Wider selection" preset (rules in pipeline/wider_selection.json)
};
export type FoodsData = {
  generated?: string; missing?: boolean;
  nutrients: NutrientDef[];
  categories: { id: string; name: string }[];
  foods: PlannerFood[];
};

type RawFood = Omit<PlannerFood, "per100g"> & { v: (number | null)[] };

export function unpack(raw: { keys: string[]; foods: RawFood[]; nutrients: NutrientDef[]; categories: FoodsData["categories"]; generated?: string; missing?: boolean }): FoodsData {
  const foods = (raw.foods ?? []).map((f) => {
    const per100g: Record<string, number> = {};
    raw.keys.forEach((k, i) => { const v = f.v[i]; if (v !== null && v !== undefined) per100g[k] = v; });
    const { v: _v, ...rest } = f;
    return { ...rest, per100g } as PlannerFood;
  });
  return { generated: raw.generated, missing: raw.missing, nutrients: raw.nutrients ?? [], categories: raw.categories ?? [], foods };
}

export type Base = "common" | "wider" | "all" | "none";

/** What a preset switches on. "Everything" leaves out US-fortified products (they can be switched on one by one). */
export const inPreset = (f: PlannerFood, base: Base) =>
  base === "all" ? !f.fortified : base === "none" ? false : base === "wider" ? f.common || !!f.wider : f.common;

/**
 * A mild preference for familiar foods in suggestions: each less familiar food in a plan costs a little, so that
 * among near-equal plans the one built from common foods wins. The whole plan's cost is capped at 0.01, which is
 * 1% of one target, so the preference can never cost more than that in targets met.
 */
export const FAMILIARITY_BUDGET = 0.01;
export const familiarityPenalty = (f: PlannerFood, maxIngredients: number) =>
  ((f.common ? 0 : f.wider ? 0.4 : 1) * FAMILIARITY_BUDGET) / Math.max(1, maxIngredients);

/** A food is on if the preset says so, unless the person has toggled it. */
export function isOn(f: PlannerFood, base: Base, toggled: Set<string>) {
  const fromBase = inPreset(f, base);
  return toggled.has(f.id) ? !fromBase : fromBase;
}

export function setOn(f: PlannerFood, on: boolean, base: Base, toggled: Set<string>) {
  const fromBase = inPreset(f, base);
  if (on === fromBase) toggled.delete(f.id); else toggled.add(f.id);
}

export type Diet = "none" | "vegetarian" | "vegan";
/** "none" allows everything; vegetarian hides meat and fish; vegan also hides dairy, eggs and honey. */
export const dietOk = (f: PlannerFood, diet: Diet) =>
  diet === "none" || (diet === "vegetarian" ? f.diet !== "meat" : f.diet === "vegan");

/** Simple case-insensitive match on all words. */
export function matches(f: PlannerFood, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${f.name} ${f.group} ${f.label} ${f.usdaName}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * Shared daily caps, in grams, for groups of foods (Food.capGroup). Oily fish: one portion of about 140 g
 * a day in total (NHS "Fish and shellfish": a portion is around 140 g; weekly limits apply on top).
 */
export const GROUP_CAPS: Record<string, number> = { "oily-fish": 140 };

/**
 * Foods the NHS says a group should not eat. Suggestions leave them out; the builder warns.
 *  - liver and liver products: pregnant women should avoid them (NHS "Meat in your diet");
 *  - shark, swordfish and marlin: not if pregnant, and not for children under 16 (NHS "Fish and shellfish").
 */
export function avoidReason(f: { usdaName: string }, who: { age: number; life: string }): { text: string; ref: string } | null {
  const name = f.usdaName.toLowerCase();
  if (who.life === "pregnancy" && /\bliver\b|\bpate\b|pâté|liverwurst|braunschweiger/.test(name))
    return { text: "The NHS advises pregnant women to avoid liver and liver products, which are very high in vitamin A.", ref: "nhs-meat" };
  if (/\b(shark|swordfish|marlin)\b/.test(name)) {
    if (who.life === "pregnancy") return { text: "The NHS advises not eating shark, swordfish or marlin when pregnant or trying to get pregnant.", ref: "nhs-fish" };
    if (who.age < 16) return { text: "The NHS advises that children under 16 avoid shark, swordfish and marlin.", ref: "nhs-fish" };
  }
  return null;
}

/** The distinct reasons any of these foods should be avoided by this person. */
export function avoidReasons(foods: { usdaName: string }[], who: { age: number; life: string }) {
  const reasons = foods.map((f) => avoidReason(f, who)).filter((r) => r !== null);
  return [...new Map(reasons.map((r) => [r.text, r])).values()];
}

/**
 * Portion limits for children. The daily caps in the food data are sized for adults, so for under-18s they are
 * scaled by the child's calories relative to a 2,000 kcal adult day (a planner rule of thumb, not an official figure).
 */
export function portionFactor(age: number, kcal: number) {
  return age < 18 ? Math.min(1, kcal / 2000) : 1;
}
export function scaledMax(f: { maxGrams: number; step: number; unitGrams: number }, factor: number) {
  const step = f.step * f.unitGrams;
  return factor >= 1 ? f.maxGrams : Math.max(step, Math.floor((f.maxGrams * factor) / step + 1e-9) * step);
}
