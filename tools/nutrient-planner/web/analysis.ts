// Turns a day's food into a per-nutrient report against the targets, grouped
// for display (overview, vitamins, minerals, amino acids, fats and limits).
import { boundsAt, type Food, type ResolvedTarget } from "./solver.ts";

export const GROUPS: { id: string; title: string; keys: string[] }[] = [
  { id: "macros", title: "Energy and macronutrients", keys: ["energy", "protein", "carbohydrate", "sugars", "fibre", "fat", "satfat", "salt", "sodium"] },
  { id: "vitamins", title: "Vitamins", keys: ["vitaminA", "vitaminD", "vitaminE", "vitaminK", "vitaminC", "thiamin", "riboflavin", "niacinNE", "pantothenic", "vitaminB6", "folate", "vitaminB12", "choline", "retinol", "vitaminD2", "vitaminD3"] },
  { id: "minerals", title: "Minerals", keys: ["calcium", "iron", "magnesium", "phosphorus", "potassium", "zinc", "copper", "manganese", "selenium", "iodine"] },
  { id: "amino", title: "Essential amino acids (protein building blocks)", keys: ["histidine", "isoleucine", "leucine", "lysine", "metCys", "pheTyr", "threonine", "tryptophan", "valine"] },
  { id: "fats", title: "Essential fats (omega-3 and omega-6)", keys: ["la", "ala", "epaDha", "dha"] },
];
export const ORDER = GROUPS.flatMap((g) => g.keys);
export const SHORT_LABEL: Record<string, string> = {
  carbohydrate: "Carbs", vitaminA: "A", vitaminD: "D", vitaminE: "E", vitaminK: "K", vitaminC: "C",
  thiamin: "B1", riboflavin: "B2", niacinNE: "B3", pantothenic: "B5", vitaminB6: "B6", folate: "Folate (B9)", vitaminB12: "B12",
  choline: "Choline", metCys: "Met+Cys", pheTyr: "Phe+Tyr", epaDha: "EPA+DHA", dha: "DHA", la: "Omega-6 LA", ala: "Omega-3 ALA",
};

export type Row = {
  key: string; label: string; unit: string;
  value: number;            // the sum of the amounts that are known; see `missing`
  missing?: number;         // foods in this day with no data for the nutrient (so `value` is "at least")
  of?: number;              // foods in this day
  min?: number; max?: number; custom?: boolean;
  ofEnergy?: boolean;       // the target is a share of the day's energy
  aside?: boolean;          // reported on its own line, not counted among the targets met or missed
  pctOfMin?: number;        // share of the minimum reached
  pctOfMax?: number;        // share of the upper limit used
  // "unclear": some foods have no data, so the target can't be confirmed (never "within" or "short" then).
  // "na": none of the day's foods has data for it, so there is no amount at all (not zero).
  // "unassessed": too few foods in the whole food list have data for the nutrient to check it.
  status: "met" | "short" | "low" | "over" | "within" | "info" | "unassessed" | "unclear" | "na";
};

export type Report = {
  rows: Row[];
  byKey: Map<string, Row>;
  energy: number;
  metCount: number;
  minUnclear: number;       // of the checked minimums, how many can't be confirmed because some foods have no data
  minNa: number;            // minimum targets with no amount at all (NA); not part of minCount
  minCount: number;
  shortfalls: Row[];
  unassessed: Row[];
  unclear: Row[];           // targets that can't be confirmed because some foods have no data
  noData: Row[];            // targets with no amount at all because no food in the day has data
  aside: Row[];             // targets reported separately (vitamin D, unless the person asks to plan for it)
};

/** Per nutrient, the sum of the amounts that are known. A food with no value adds nothing here, and is counted by `gapsOf`. */
export function totals(items: { food: Food; grams: number }[], keys: string[]) {
  const t: Record<string, number> = {};
  for (const k of keys) t[k] = items.reduce((s, it) => s + ((it.food.per100g[k] ?? 0) * it.grams) / 100, 0);
  return t;
}

export type Gaps = Record<string, { missing: number; of: number }>;

/** Per nutrient, how many of the day's foods have no value for it. */
export function gapsOf(items: { food: Food; grams: number }[], keys: string[]): Gaps {
  const used = items.filter((it) => it.grams > 0);
  const out: Gaps = {};
  for (const k of keys) out[k] = { missing: used.filter((it) => it.food.per100g[k] === undefined).length, of: used.length };
  return out;
}

export function analyse(
  sums: Record<string, number>,
  targets: ResolvedTarget[],
  notAssessed: Set<string>,
  nutrientMeta: Map<string, { label: string; unit: string }>,
  aside: Set<string> = new Set(),
  gaps: Gaps = {},
): Report {
  const byTarget = new Map(targets.map((t) => [t.key, t]));
  const rows: Row[] = [];
  for (const key of ORDER) {
    const meta = nutrientMeta.get(key);
    if (!meta) continue;
    const t = byTarget.get(key);
    const value = sums[key] ?? 0;
    const g = gaps[key];
    const missing = g?.missing ?? 0;
    const na = !!g && g.of > 0 && missing === g.of;      // no food has data: there is no amount to compare
    const row: Row = { key, label: meta.label, unit: meta.unit, value, status: "info" };
    if (missing > 0) { row.missing = missing; row.of = g.of; }
    if (t) {
      // targets tied to energy (% of energy, per MJ) are judged against this day's own calories
      const b = boundsAt(t, sums.energy ?? 0);
      row.min = b.min; row.max = b.max; row.custom = t.custom;
      row.aside = aside.has(key) || undefined;
      row.ofEnergy = t.minPerKcal !== undefined || t.maxPerKcal !== undefined;
      if (notAssessed.has(key)) row.status = "unassessed";
      else if (!na) {
        if (b.min && b.min > 0) {
          row.pctOfMin = (value / b.min) * 100;
          row.status = row.pctOfMin >= 99.5 ? "met" : row.pctOfMin >= 66 ? "short" : "low";
        }
        if (b.max !== undefined && b.max > 0) {
          row.pctOfMax = (value / b.max) * 100;
          if (value > b.max * 1.001) row.status = "over";
          else if (row.status === "info") row.status = "within";
        }
        // The amount is only a lower bound, so only "met" (a minimum already reached) and "over" are certain.
        // "short", "low" and "within" are not: the foods with no data could change them.
        if (missing > 0 && row.status !== "info" && row.status !== "met" && row.status !== "over") row.status = "unclear";
      }
    }
    if (na && row.status !== "unassessed") row.status = "na";
    rows.push(row);
  }
  const mins = rows.filter((r) => r.pctOfMin !== undefined && !r.aside);
  return {
    minUnclear: mins.filter((r) => r.status === "unclear").length,
    minNa: rows.filter((r) => r.status === "na" && (r.min ?? 0) > 0 && !r.aside).length,
    rows,
    byKey: new Map(rows.map((r) => [r.key, r])),
    energy: sums.energy ?? 0,
    metCount: mins.filter((r) => r.status === "met").length,
    minCount: mins.length,
    shortfalls: mins.filter((r) => r.status === "short" || r.status === "low").sort((a, b) => a.pctOfMin! - b.pctOfMin!),
    unassessed: rows.filter((r) => r.status === "unassessed"),
    unclear: rows.filter((r) => r.status === "unclear" && !r.aside),
    noData: rows.filter((r) => r.status === "na" && (r.min !== undefined || r.max !== undefined) && !r.aside),
    aside: rows.filter((r) => r.aside && r.pctOfMin !== undefined),
  };
}

/** How many of these rows' minimum targets are met, can't be confirmed (some foods have no data) or are NA (no food has data). */
export function tally(rows: Row[]) {
  const counted = rows.filter((r) => r.pctOfMin !== undefined && !r.aside);
  return {
    met: counted.filter((r) => r.status === "met").length,
    of: counted.length,
    unclear: counted.filter((r) => r.status === "unclear").length,
    na: rows.filter((r) => r.status === "na" && (r.min ?? 0) > 0 && !r.aside).length,
  };
}

/** "3 unclear · 2 NA" for the counts above (empty when there are none). */
export const gapWords = (t: { unclear: number; na: number }) =>
  [t.unclear ? `${t.unclear} unclear` : "", t.na ? `${t.na} NA` : ""].filter(Boolean).join(" · ");
