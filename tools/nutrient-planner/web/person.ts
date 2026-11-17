// Everything the planner works out about the person from their settings: which standard and age
// band apply, their calorie range, weight and targets. Pure functions; no page access.
import { resolveTargets, type NutrientDef, type ResolvedTarget } from "./solver.ts";
import { energyFor, pickProfile, refWeight, type Energy, type LifeStage, type Profile, type Standard } from "./profiles.ts";
import { ORDER } from "./analysis.ts";
import type { Settings } from "./state.ts";

export type Person = {
  standard: Standard;                 // the standard used for planning
  life: LifeStage;                    // pregnancy and breastfeeding apply to females only
  profile: Profile;                   // the age band of that standard that fits
  note?: string;                      // e.g. "the nearest available age group is used"
  defaultWeight: number;              // reference weight, used until the person enters their own
  weight: number;
  energy: Energy & { note: string };  // the standard's recommended calories
  band: { low: number; high: number };  // the calorie range in use (recommended, or the person's own)
  midKcal: number;                    // middle of that range
  customEnergy: boolean;
};

export function personFrom(s: Settings, standards: Standard[]): Person {
  const standard = standards.find((x) => x.id === s.standard && x.status === "available") ?? standards[0];
  // Pregnancy and breastfeeding apply to females only, whatever a link or saved setting says.
  const life: LifeStage = s.sex === "female" ? s.life : "none";
  const { profile, note } = pickProfile(standard, s.sex, s.age, life);
  const defaultWeight = refWeight(s.sex, s.age, life);
  const energy = energyFor(profile, s.age, s.sex);
  const band = { low: s.energyLow ?? energy.low, high: s.energyHigh ?? energy.high };
  return {
    standard, life, profile, note, defaultWeight, weight: s.weight ?? defaultWeight, energy, band,
    midKcal: (band.low + band.high) / 2, customEnergy: s.energyLow !== null || s.energyHigh !== null,
  };
}

/** The person's daily targets, in display order. Targets tied to energy are shown for the middle of the calorie range. */
export function targetsFor(p: Person, s: Settings, nutrients: NutrientDef[], withOverrides: boolean): ResolvedTarget[] {
  return resolveTargets(p.profile.targets, nutrients, p.midKcal, p.weight, p.standard.id, withOverrides ? s.overrides : {}, s.age)
    .sort((a, z) => ORDER.indexOf(a.key) - ORDER.indexOf(z.key));
}

/** The standards not used for planning, shown on the charts for comparison. */
export const otherStandards = (p: Person, standards: Standard[]) =>
  standards.filter((x) => x.status === "available" && x.id !== p.standard.id);

export type Comparison = { id: string; targets: Map<string, ResolvedTarget>; energyMid: number };

/**
 * The other standards' targets for the same person. Targets tied to energy are worked out for the
 * day's own calories (`dayKcal`), like the main standard's.
 */
export function comparisonTargets(p: Person, s: Settings, standards: Standard[], nutrients: NutrientDef[], dayKcal = 0): Comparison[] {
  const kcal = dayKcal > 0 ? dayKcal : p.midKcal;
  return otherStandards(p, standards).map((x) => {
    const profile = pickProfile(x, s.sex, s.age, p.life).profile;
    const e = energyFor(profile, s.age, s.sex);
    return {
      id: x.id,
      targets: new Map(resolveTargets(profile.targets, nutrients, kcal, p.weight, x.id, {}, s.age).map((r) => [r.key, r])),
      energyMid: (e.low + e.high) / 2,
    };
  });
}
