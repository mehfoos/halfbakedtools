// Turns a day's food into a per-nutrient report against the targets, grouped
// for display (overview, vitamins, minerals, amino acids, fats and limits).
import type { Food, ResolvedTarget } from "./solver.ts";

export const GROUPS: { id: string; title: string; keys: string[] }[] = [
  { id: "macros", title: "Energy and macronutrients", keys: ["energy", "protein", "carbohydrate", "fibre", "fat", "satfat", "salt", "sodium"] },
  { id: "vitamins", title: "Vitamins", keys: ["vitaminA", "vitaminD", "vitaminE", "vitaminK", "vitaminC", "thiamin", "riboflavin", "niacinNE", "vitaminB6", "folate", "vitaminB12", "choline", "retinol"] },
  { id: "minerals", title: "Minerals", keys: ["calcium", "iron", "magnesium", "phosphorus", "potassium", "zinc", "copper", "manganese", "selenium", "iodine"] },
  { id: "amino", title: "Essential amino acids", keys: ["histidine", "isoleucine", "leucine", "lysine", "metCys", "pheTyr", "threonine", "tryptophan", "valine"] },
  { id: "fats", title: "Fatty acids", keys: ["la", "ala", "epaDha"] },
];
export const ORDER = GROUPS.flatMap((g) => g.keys);
export const SHORT_LABEL: Record<string, string> = {
  carbohydrate: "Carbs", vitaminA: "A", vitaminD: "D", vitaminE: "E", vitaminK: "K", vitaminC: "C",
  thiamin: "B1", riboflavin: "B2", niacinNE: "B3", vitaminB6: "B6", folate: "Folate", vitaminB12: "B12",
  choline: "Choline", metCys: "Met+Cys", pheTyr: "Phe+Tyr", epaDha: "EPA+DHA", la: "Omega-6 LA", ala: "Omega-3 ALA",
};

export type Row = {
  key: string; label: string; unit: string; value: number;
  min?: number; max?: number; custom?: boolean;
  pctOfMin?: number;        // share of the minimum reached
  pctOfMax?: number;        // share of the upper limit used
  status: "met" | "short" | "low" | "over" | "within" | "info" | "unassessed";
};

export type Report = {
  rows: Row[];
  byKey: Map<string, Row>;
  energy: number;
  metCount: number;
  minCount: number;
  shortfalls: Row[];
  unassessed: Row[];
};

export function totals(items: { food: Food; grams: number }[], keys: string[]) {
  const t: Record<string, number> = {};
  for (const k of keys) t[k] = items.reduce((s, it) => s + ((it.food.per100g[k] ?? 0) * it.grams) / 100, 0);
  return t;
}

export function analyse(
  sums: Record<string, number>,
  targets: ResolvedTarget[],
  notAssessed: Set<string>,
  nutrientMeta: Map<string, { label: string; unit: string }>,
): Report {
  const byTarget = new Map(targets.map((t) => [t.key, t]));
  const rows: Row[] = [];
  for (const key of ORDER) {
    const meta = nutrientMeta.get(key);
    if (!meta) continue;
    const t = byTarget.get(key);
    const value = sums[key] ?? 0;
    const row: Row = { key, label: meta.label, unit: meta.unit, value, status: "info" };
    if (t) {
      row.min = t.min; row.max = t.max; row.custom = t.custom;
      if (notAssessed.has(key)) row.status = "unassessed";
      else {
        if (t.min && t.min > 0) {
          row.pctOfMin = (value / t.min) * 100;
          row.status = row.pctOfMin >= 99.5 ? "met" : row.pctOfMin >= 66 ? "short" : "low";
        }
        if (t.max !== undefined && t.max > 0) {
          row.pctOfMax = (value / t.max) * 100;
          if (value > t.max * 1.001) row.status = "over";
          else if (row.status === "info") row.status = "within";
        }
      }
    }
    rows.push(row);
  }
  const mins = rows.filter((r) => r.pctOfMin !== undefined);
  return {
    rows,
    byKey: new Map(rows.map((r) => [r.key, r])),
    energy: sums.energy ?? 0,
    metCount: mins.filter((r) => r.status === "met").length,
    minCount: mins.length,
    shortfalls: mins.filter((r) => r.status === "short" || r.status === "low").sort((a, b) => a.pctOfMin! - b.pctOfMin!),
    unassessed: rows.filter((r) => r.status === "unassessed"),
  };
}
