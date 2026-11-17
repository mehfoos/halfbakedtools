// Builds the axes of the radar charts from a day's report. Pure; no page access.
import { SHORT_LABEL, type Report, type Row } from "./analysis.ts";
import type { Axis } from "./radar.ts";
import type { Comparison, Person } from "./person.ts";

// Plain number formatting for the chart's hover text (same as the page's tables).
type Fmt = (v: number | undefined) => string;

/** Adds the other standards' targets to an axis, as a percentage of the main target. */
function withOthers(axis: Axis, key: string, main: number | undefined, bound: "min" | "max", cmp: Comparison[]): Axis {
  if (!main) return axis;
  const others: Record<string, number> = {};
  for (const c of cmp) {
    const v = key === "energy" ? c.energyMid : c.targets.get(key)?.[bound];
    if (v !== undefined && v > 0) others[c.id] = (v / main) * 100;
  }
  return { ...axis, others };
}

/** One axis per nutrient that has a minimum target: the share of that target reached. */
export function detailAxes(rep: Report, keys: string[], cmp: Comparison[], fmt: Fmt): Axis[] {
  return keys.map((k) => rep.byKey.get(k)).filter((r): r is Row => !!r && r.pctOfMin !== undefined)
    .map((r) => withOthers({ label: SHORT_LABEL[r.key] ?? r.label, pct: r.pctOfMin!, kind: "min" as const, ok: r.status === "met", detail: `${fmt(r.value)} of ${fmt(r.min)} ${r.unit}` }, r.key, r.min, "min", cmp));
}

// The label's adult reference intakes, g a day (Regulation (EU) No 1169/2011, Annex XIII Part B).
const ADULT_RI: Record<string, number> = { fat: 70, satfat: 20, carbohydrate: 260, sugars: 90, protein: 50, salt: 6 };

/**
 * The "At a glance" chart, laid out like a UK/EU nutrition label: energy, fat, saturates, carbohydrate,
 * sugars, fibre, protein, salt. Each is measured against this person's own target where one exists;
 * otherwise, for adults, against the label's reference intake (shown in grey, for reference only).
 */
export function overviewAxes(rep: Report, person: Person, adult: boolean, cmp: Comparison[], fmt: Fmt): Axis[] {
  const b = person.band;
  const e = rep.energy, mid = person.midKcal;
  const axes: Axis[] = [withOthers({ label: "Energy", pct: (e / mid) * 100, kind: "range", ok: e >= b.low && e <= b.high,
    detail: `${fmt(e)} kcal; target range ${fmt(b.low)}–${fmt(b.high)}` }, "energy", mid, "min", cmp)];
  const add = (key: string, label: string) => {
    let r = rep.byKey.get(key);
    // A standard that limits sodium rather than salt (US, EU) is shown as sodium.
    if (key === "salt" && r?.max === undefined && rep.byKey.get("sodium")?.max !== undefined) { r = rep.byKey.get("sodium"); label = "Sodium"; }
    if (!r || r.status === "unassessed") return;
    if (r.min !== undefined && r.min > 0) axes.push(withOthers({ label, pct: r.pctOfMin!, kind: "min", ok: r.status === "met", detail: `${fmt(r.value)} of at least ${fmt(r.min)} ${r.unit}` }, r.key, r.min, "min", cmp));
    else if (r.max !== undefined && r.max > 0) axes.push(withOthers({ label, pct: (r.value / r.max) * 100, kind: "max", ok: r.value <= r.max * 1.001, detail: `${fmt(r.value)} of at most ${fmt(r.max)} ${r.unit}` }, r.key, r.max, "max", cmp));
    else if (ADULT_RI[key] && adult) axes.push({ label, pct: (r.value / ADULT_RI[key]) * 100, kind: "ref", detail: `${fmt(r.value)} g; label reference intake ${ADULT_RI[key]} g for an adult` });
  };
  add("fat", "Fat"); add("satfat", "Saturates"); add("carbohydrate", "Carbs"); add("sugars", "Sugars");
  add("fibre", "Fibre"); add("protein", "Protein"); add("salt", "Salt");
  return axes;
}
