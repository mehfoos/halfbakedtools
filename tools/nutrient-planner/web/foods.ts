// Food data loading and the "which foods are switched on" logic.
import type { Food, NutrientDef } from "./solver.ts";

export type PlannerFood = Food & {
  cat: string; label: string; common: boolean;
  table: string;              // the food table it comes from (pipeline/tables/tables.json)
  srcName: string;            // the food's name in its table (USDA: the SR Legacy description)
  fdcId?: string;             // USDA only
  basic?: boolean | null;     // false: outside the Planner's basic foods (Food Finder only)
  q?: Record<string, string> | null;   // what the table gave where a value is missing or isn't a plain value ("trace")
  noteRef?: string | null;   // the reference a food's note rests on
  fortified?: boolean | null; // a US product with nutrients added; not part of the "Everything" preset
  blend?: BlendFood | null;   // set while the beta blended source is in use and this food is blended
  basePer100g?: Record<string, number>;   // the file's own values, kept while the blend's values for a standard are applied
};
export type FoodsData = {
  generated?: string; missing?: boolean;
  table?: string;
  definitions?: Record<string, string>;   // how the table defines nutrients, where that differs from USDA
  labels?: Record<string, string>;        // what each value label (a food's `q`) means, in the table's words
  nutrients: NutrientDef[];
  categories: { id: string; name: string }[];
  foods: PlannerFood[];
};

type RawFood = Omit<PlannerFood, "per100g" | "table" | "srcName"> & { v: (number | null)[]; srcName?: string; usdaName?: string };
export type RawFoods = {
  keys: string[]; foods: RawFood[]; nutrients?: NutrientDef[]; categories: FoodsData["categories"];
  generated?: string; missing?: boolean; table?: string; definitions?: Record<string, string>; labels?: Record<string, string>;
};

/** Unpack a table's food file. `more` (Food Finder) adds the table's other foods, with the same nutrient keys. */
export function unpack(raw: RawFoods, more?: RawFoods): FoodsData {
  const table = raw.table ?? "usda";
  const conv = (r: RawFoods, basic: boolean) => (r.foods ?? []).map((f) => {
    const per100g: Record<string, number> = {};
    r.keys.forEach((k, i) => { const v = f.v[i]; if (v !== null && v !== undefined) per100g[k] = v; });
    const { v: _v, usdaName, ...rest } = f;
    return { ...rest, table, srcName: f.srcName ?? usdaName ?? f.name, basic: basic ? null : false, per100g } as PlannerFood;
  });
  const foods = [...conv(raw, true), ...(more ? conv(more, false) : [])];
  // The categories of the "more" file include those that only hold foods outside the basic foods.
  const categories = more?.categories ?? raw.categories ?? [];
  return { generated: raw.generated, missing: raw.missing, table, definitions: raw.definitions, labels: raw.labels ?? {}, nutrients: raw.nutrients ?? [], categories, foods };
}

/** The table used until one is picked: the table whose registry entry names this standard (UK CoFID, US USDA, EU BLS). */
export const defaultTable = (tables: { id: string; standards: string[] }[], standard: string) =>
  tables.find((t) => t.standards.includes(standard))?.id ?? "usda";

/** One food table, as listed in data/foods/tables.json (built from pipeline/tables/tables.json). */
export type TableInfo = {
  id: string; tag: string; title: string; country: string; basic: string; more: string;
  refs: string[]; licence: string; standards: string[]; foods: number; basicFoods: number; generated?: string;
  translated?: boolean;   // food names translated by this site (shown with a Translated caveat)
  notice?: string; noticeUrl?: string;   // a notice the table's licence requires wherever its data are shown
};

/**
 * The values a table labels (estimated, from a recipe, borrowed, a trace, below a limit), for the given foods and
 * nutrients: per food, the nutrients that share each label, with the label in the table's own words.
 */
export function valueLabels(foods: PlannerFood[], legend: Record<string, string>, keep: (key: string) => boolean, label: (key: string) => string) {
  const out: { food: string; groups: { text: string; nutrients: string[] }[] }[] = [];
  for (const f of foods) {
    const byText = new Map<string, string[]>();
    for (const [k, code] of Object.entries(f.q ?? {})) {
      if (!keep(k)) continue;
      const text = legend[code] ?? code;
      byText.set(text, [...(byText.get(text) ?? []), label(k)]);
    }
    if (byText.size) out.push({ food: f.name, groups: [...byText].map(([text, nutrients]) => ({ text, nutrients })) });
  }
  return out;
}

/** Food Finder's list of every food in every table, before any table's values are loaded (data/foods/index.json). */
export type FoodIndex = {
  flags: { common: number; basic: number; fortified: number };
  categories: { id: string; name: string }[];
  foods: Record<string, [string, string, string, string, string, string, number][]>;
};

// ---- The beta Blended table (pipeline/blend/blend_all.py): its foods' values differ per target standard.
// Each overlaid food has values per target standard, because the standards define some nutrients differently.
/** A table id (tables.json); "blend" is the beta Blended table. */
export type Source = string;
type StdRows<T> = Record<string, T>;
export type BlendFood = {
  records: { table: string; code: string; name: string; borrowedFrom?: string }[];
  match: { by: string; date: string; reason: string };
  caveats: string[];
  v: StdRows<(number | null)[]>;
  r: StdRows<([number, number, number] | null)[]>;   // [min, max, number of tables] where more than one source
  d: StdRows<(string | null)[]>;                     // the definition used, or null for a USDA-only value
  c: StdRows<Record<string, string[]>>;              // caveat ids per nutrient key
  s: Record<string, string>;                         // each definition's values per table, in words
};
export type BlendData = {
  keys: string[]; usdaOnly: string[]; tables: string[];
  definitions: Record<string, string>;
  caveats: Record<string, { kind: string; text: string }>;
  foods: Record<string, BlendFood>;
};

/** One nutrient of a blended food under a standard, for display. */
export type BlendValue = { key: string; value: number | null; range: [number, number, number] | null; definition: string | null; caveats: string[] };

/**
 * Put the Blended table's values for one standard on its foods (the file holds the UK values). The file's values
 * are kept on each food the first time, so switching back restores them exactly. Other tables are never touched.
 */
export function applySource(data: FoodsData, blend: BlendData | null, source: Source, standard: string) {
  const std = blend && ["uk", "us", "eu"].includes(standard) ? standard : "uk";
  for (const f of data.foods) {
    const b = source === "blend" ? blend?.foods[f.id] : undefined;
    if (!b && !f.basePer100g) continue;
    f.basePer100g ??= f.per100g;
    f.blend = b ?? null;
    if (!b) { f.per100g = f.basePer100g; continue; }
    const per100g: Record<string, number> = {};
    blend!.keys.forEach((k, i) => { const v = b.v[std][i]; if (v !== null && v !== undefined) per100g[k] = v; });
    f.per100g = per100g;
  }
}

/** The lowest and highest value the tables publish for one nutrient of a blended food, or null if there is no range. */
export function foodRange(f: { blend?: BlendFood | null }, key: string, keys: string[], standard: string): [number, number] | null {
  const i = keys.indexOf(key);
  const r = f.blend && i >= 0 ? f.blend.r[["uk", "us", "eu"].includes(standard) ? standard : "uk"][i] : null;
  return r && r[0] !== r[1] ? [r[0], r[1]] : null;
}

/** Every nutrient of a blended food under a standard. */
export function blendValues(blend: BlendData, b: BlendFood, standard: string): BlendValue[] {
  const std = ["uk", "us", "eu"].includes(standard) ? standard : "uk";
  return blend.keys.map((key, i) => ({ key, value: b.v[std][i], range: b.r[std][i], definition: b.d[std][i], caveats: b.c[std][key] ?? [] }));
}

export type Base = "common" | "all" | "none";

/** What a preset switches on. "All foods" leaves out US-fortified products (they can be switched on one by one). */
export const inPreset = (f: PlannerFood, base: Base) =>
  base === "all" ? !f.fortified : base === "none" ? false : f.common;

/**
 * A mild preference for familiar foods in suggestions: each less familiar food in a plan costs a little, so that
 * among near-equal plans the one built from common foods wins. The whole plan's cost is capped at 0.01, which is
 * 1% of one target, so the preference can never cost more than that in targets met.
 */
export const FAMILIARITY_BUDGET = 0.01;
export const familiarityPenalty = (f: PlannerFood, maxIngredients: number) =>
  ((f.common ? 0 : 1) * FAMILIARITY_BUDGET) / Math.max(1, maxIngredients);

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
// A food tagged "unknown" (a mixed food outside the basic foods, which may hide meat stock, gelatin or animal fat)
// is only shown when no diet is chosen.
export const dietOk = (f: { diet: string }, diet: Diet) =>
  diet === "none" || (diet === "vegetarian" ? f.diet !== "meat" && f.diet !== "unknown" : f.diet === "vegan");

/** Simple case-insensitive match on all words. */
export function matches(f: { name: string; group: string; label: string; srcName: string }, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${f.name} ${f.group} ${f.label} ${f.srcName}`.toLowerCase();
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
export function avoidReason(f: { srcName: string }, who: { age: number; life: string }): { text: string; ref: string } | null {
  const name = f.srcName.toLowerCase();
  if (who.life === "pregnancy" && /\bliver\b|\bpate\b|pâté|liverwurst|braunschweiger/.test(name))
    return { text: "The NHS advises pregnant women to avoid liver and liver products, which are very high in vitamin A.", ref: "nhs-meat" };
  if (/\b(shark|swordfish|marlin)\b/.test(name)) {
    if (who.life === "pregnancy") return { text: "The NHS advises not eating shark, swordfish or marlin when pregnant or trying to get pregnant.", ref: "nhs-fish" };
    if (who.age < 16) return { text: "The NHS advises that children under 16 avoid shark, swordfish and marlin.", ref: "nhs-fish" };
  }
  return null;
}

/** The distinct reasons any of these foods should be avoided by this person. */
export function avoidReasons(foods: { srcName: string }[], who: { age: number; life: string }) {
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
