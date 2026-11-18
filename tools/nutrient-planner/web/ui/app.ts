// The planner's shared state: the loaded data, the person's settings, and the values derived
// from them that every part of the page needs. One `App` is created per page and passed to
// each section (see main.ts).
import { splitAssessable, type ResolvedTarget } from "../solver.ts";
import type { Standard } from "../profiles.ts";
import { applySource, dietOk, foodRange, isOn, type BlendData, type FoodsData, type PlannerFood } from "../foods.ts";
import { ORDER, analyse, dayBounds, gapsOf, totals, type Report } from "../analysis.ts";
import { personFrom, targetsFor, type Person } from "../person.ts";
import { decode, encode, fresh, loadRemembered, remember, type PageKind, type Settings } from "../state.ts";
import { referencesFor } from "@site/lib/references.ts";
import references from "../../references.json";
import { $ } from "./dom.ts";

/** In-text citation of one of this tool's references, e.g. cite("nhs-fish") -> [12]. */
export const { cite } = referencesFor(references as Parameters<typeof referencesFor>[0]);

/** A food and how much of it, in grams. */
export type Item = { food: PlannerFood; grams: number };

export type App = {
  root: HTMLElement;
  kind: PageKind;                   // "planner" (combinations of foods) or "finder" (one food at a time)
  data: FoodsData;
  blend: BlendData | null;          // the beta blended source, once loaded
  standards: Standard[];
  s: Settings;                      // the settings; the single source of truth for what the page shows
  toggled: Set<string>;             // food ids switched away from the preset (kept as a set for speed)
  foodById: Map<string, PlannerFood>;
  nutrientMeta: Map<string, { label: string; unit: string }>;
  categoryName: Map<string, string>;

  person(): Person;                               // standard, age band, calories, weight
  targets(withOverrides: boolean): ResolvedTarget[];
  dietFoods(): PlannerFood[];                     // foods allowed by the diet setting
  selectedFoods(): PlannerFood[];                 // ... of those, the ones switched on
  items(list: { id: string; grams: number }[]): Item[];
  report(items: Item[]): Report;                  // a day's foods measured against the targets

  /** Put the values of the chosen food source (and, for the blend, standard) on the foods. */
  applySource(): void;
  save(): void;                                   // write the settings to the page address (and device, if opted in)
  load(s: Settings): void;                        // replace the settings (import)
};

export function createApp(root: HTMLElement, data: FoodsData, standards: Standard[], kind: PageKind = "planner"): App {
  // Settings come from the page address first, then opt-in remembered settings, then defaults.
  const rememberBox = $<HTMLInputElement>(root, "#rememberBox");
  const remembered = loadRemembered(kind);
  rememberBox.checked = !!remembered;
  const s = location.search.length > 1 ? decode(location.search) : remembered ?? fresh();

  const app: App = {
    root, kind, data, standards, s, blend: null,
    toggled: new Set(s.toggled),
    foodById: new Map(data.foods.map((f) => [f.id, f])),
    nutrientMeta: new Map(data.nutrients.map((n) => [n.key, { label: n.label, unit: n.unit }])),
    categoryName: new Map(data.categories.map((c) => [c.id, c.name])),

    person: () => personFrom(app.s, standards),
    targets: (withOverrides) => targetsFor(app.person(), app.s, data.nutrients, withOverrides),
    dietFoods: () => data.foods.filter((f) => dietOk(f, app.s.diet)),
    selectedFoods: () => app.dietFoods().filter((f) => isOn(f, app.s.base, app.toggled)),
    items: (list) => list.map((b) => ({ food: app.foodById.get(b.id), grams: b.grams })).filter((x): x is Item => !!x.food),

    report(items) {
      const targets = app.targets(true);
      // A nutrient is "not checked" if too few of the foods in play have data for it. In Food Finder every food in
      // the list is in play (there are no presets).
      const selected = app.kind === "finder" ? app.dietFoods() : app.selectedFoods();
      const { notAssessed } = splitAssessable(targets, selected.length ? selected : app.dietFoods());
      // In the Planner, vitamin D is reported on its own line unless the person has asked for it to be planned from
      // food. Food Finder plans nothing, so vitamin D is an ordinary row there.
      const aside = new Set(app.s.vitaminD || app.kind === "finder" ? [] : ["vitaminD"]);
      const rep = analyse(totals(items, ORDER), targets, new Set(notAssessed.map((t) => t.key)), app.nutrientMeta, aside, gapsOf(items, ORDER));
      // With blended foods, the day's total also has a lowest and highest possible value (see dayBounds).
      if (app.blend && items.some((i) => i.food.blend)) {
        const std = app.person().standard.id;
        const bounds = dayBounds(items, ORDER, (f, k) => foodRange(f, k, app.blend!.keys, std));
        for (const r of rep.rows) if (bounds[r.key]) { r.low = bounds[r.key].low; r.high = bounds[r.key].high; }
      }
      return rep;
    },

    applySource() {
      applySource(app.data, app.blend, app.blend ? app.s.source : "usda", app.person().standard.id);
    },

    save() {
      app.s.toggled = [...app.toggled];
      history.replaceState(null, "", `?${encode(app.s)}`);
      if (rememberBox.checked) remember(app.s, kind);
    },
    load(next) {
      app.s = next;
      app.toggled = new Set(next.toggled);
    },
  };
  return app;
}
