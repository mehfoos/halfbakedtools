// Picks the reference-intake profile (age band) that matches a person.
import type { TargetSpec } from "./solver.ts";

export type Profile = {
  id: string; stage: string; group: string; label: string;
  energy: Energy & { note: string; byAge?: Record<string, Energy>; bySex?: Record<string, Record<string, Energy>> };
  defaultWeightKg: number;
  targets: Record<string, TargetSpec>;
};
export type Energy = { kcal: number; low: number; high: number };
export type Standard = {
  id: string; name: string; longName: string; status: string;
  sources: { id: string; title: string; url: string; role?: string }[];
  notes: string[]; profiles: Profile[];
  verified?: { checked: boolean; date?: string; against: string; pending?: string };
};

export type Sex = "female" | "male";
export type LifeStage = "none" | "pregnancy" | "lactation";

/** Parse "19-50", "75+", "1" into [min, max] ages. */
export function groupRange(group: string): [number, number] {
  if (group.endsWith("+")) return [Number(group.slice(0, -1)), 200];
  const [a, b] = group.split("-").map(Number);
  return [a, Number.isFinite(b) ? b : a];
}

export type Pick = { profile: Profile; note?: string };

export function pickProfile(std: Standard, sex: Sex, age: number, life: LifeStage): Pick {
  const inRange = (p: Profile) => {
    const [lo, hi] = groupRange(p.group);
    return age >= lo && age < hi + 1;
  };
  let note: string | undefined;
  if (life !== "none") {
    const pool = std.profiles.filter((p) => p.stage === life);
    if (!pool.length) {
      note = `${std.name} values for ${life === "pregnancy" ? "pregnancy" : "breastfeeding"} aren't included yet, so standard values for your age are used.`;
    } else {
      const hit = pool.find(inRange);
      if (hit) return { profile: hit };
      const nearest = age < groupRange(pool[0].group)[0] ? pool[0] : pool[pool.length - 1];
      return { profile: nearest, note: `The nearest available age group (${nearest.group}) is used.` };
    }
  }
  const pool = std.profiles.filter((p) => p.stage === sex || p.stage === "child");
  const hit = pool.find(inRange);
  if (hit) return { profile: hit, note };
  const sorted = [...pool].sort((a, b) => groupRange(a.group)[0] - groupRange(b.group)[0]);
  const nearest = age < groupRange(sorted[0].group)[0] ? sorted[0] : sorted[sorted.length - 1];
  return { profile: nearest, note: note ?? `The nearest available age group (${nearest.group}) is used.` };
}

export const isAdult = (age: number) => age >= 19;

/**
 * Default body weight (kg) until the person enters their own: EFSA reference body weights
 * (EFSA 2017 summary report, Table 17, page 91), used for every standard.
 */
const REF: [number, number, number, number][] = [ // [fromAge, toAge, male, female]
  [1, 3, 12.2, 11.5], [4, 6, 19.2, 18.7], [7, 10, 29.0, 28.4], [11, 14, 44.0, 45.1], [15, 17, 64.1, 56.4], [18, 200, 68.1, 58.5],
];
export function refWeight(sex: Sex, age: number, life: LifeStage = "none") {
  if (life === "pregnancy" && age >= 18) return 70.5;
  const row = REF.find(([lo, hi]) => age >= lo && age < hi + 1) ?? REF[REF.length - 1];
  return sex === "male" ? row[2] : row[3];
}

/** Calorie estimate for a person: the exact value for their age (and sex) where the source gives one. */
export function energyFor(p: Profile, age: number, sex: Sex): Energy & { note: string } {
  const a = String(Math.floor(age));
  const e = p.energy.bySex?.[sex]?.[a] ?? p.energy.byAge?.[a];
  return e ? { kcal: e.kcal, low: e.low, high: e.high, note: p.energy.note } : p.energy;
}
