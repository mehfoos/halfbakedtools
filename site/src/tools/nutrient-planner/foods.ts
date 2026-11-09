// Food data loading and the "which foods are switched on" logic.
import type { Food, NutrientDef } from "./solver.ts";

export type PlannerFood = Food & {
  cat: string; label: string; common: boolean; fdcId: string; usdaName: string;
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

export type Base = "common" | "all" | "none";

/** A food is on if the preset says so, unless the person has toggled it. */
export function isOn(f: PlannerFood, base: Base, toggled: Set<string>) {
  const fromBase = base === "all" ? true : base === "none" ? false : f.common;
  return toggled.has(f.id) ? !fromBase : fromBase;
}

export function setOn(f: PlannerFood, on: boolean, base: Base, toggled: Set<string>) {
  const fromBase = base === "all" ? true : base === "none" ? false : f.common;
  if (on === fromBase) toggled.delete(f.id); else toggled.add(f.id);
}

export const dietOk = (f: PlannerFood, diet: "vegetarian" | "vegan") => diet === "vegetarian" || f.diet === "vegan";

/** Simple case-insensitive match on all words. */
export function matches(f: PlannerFood, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${f.name} ${f.group} ${f.label} ${f.usdaName}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
