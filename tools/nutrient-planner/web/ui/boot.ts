// Start-up shared by the Planner and Food Finder pages: load the food data and the target standards, show a
// message if they can't be loaded, then create the page's shared state (App) and its charts.
import { unpack, type BlendData, type FoodIndex, type FoodsData, type RawFoods, type TableInfo } from "../foods.ts";
import type { Standard } from "../profiles.ts";
import type { PageKind } from "../state.ts";
import { createApp, type App } from "./app.ts";
import { createCharts, type Charts } from "./charts.ts";
import { $ } from "./dom.ts";

const STANDARD_FILES = ["targets/uk.json", "targets/us.json", "targets/eu.json"];
const dataUrl = (root: HTMLElement) => root.dataset.data ?? `${root.dataset.base ?? "/"}tools/nutrient-planner/data/`;

const getJson = (root: HTMLElement, f: string) => fetch(dataUrl(root) + f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });

async function loadData(root: HTMLElement): Promise<{ data: FoodsData; standards: Standard[]; tables: TableInfo[] }> {
  const [raw, tables, ...standards] = await Promise.all(["foods/foods.json", "foods/tables.json", ...STANDARD_FILES].map((f) => getJson(root, f)));
  return { data: unpack(raw), standards, tables: tables.tables };
}

// Each table's food files, loaded once per page. `more` adds the table's foods outside the basic foods (Food Finder).
const tableCache = new Map<string, Promise<FoodsData>>();
export function loadTable(root: HTMLElement, t: TableInfo, more: boolean): Promise<FoodsData> {
  const key = `${t.id}${more ? "+" : ""}`;
  if (!tableCache.has(key)) {
    const p = Promise.all([getJson(root, `foods/${t.basic}`), more ? getJson(root, `foods/${t.more}`) : null])
      .then(([basic, rest]: [RawFoods, RawFoods | null]) => unpack(basic, rest ?? undefined));
    p.catch(() => tableCache.delete(key));
    tableCache.set(key, p);
  }
  return tableCache.get(key)!;
}

/** Food Finder's list: the name of every food in every table. */
export const loadIndex = (root: HTMLElement): Promise<FoodIndex> => getJson(root, "foods/index.json");

/** The Blended table's values per standard (loaded only when the Blended table is first used). */
export async function loadBlend(root: HTMLElement): Promise<BlendData> {
  const r = await fetch(`${dataUrl(root)}foods/foods-blend-values.json`);
  if (!r.ok) throw new Error("foods-blend-values.json");
  return r.json();
}

/** Load the data and create the page's state and charts; null (with a message on the page) if loading failed. */
export async function boot(root: HTMLElement, kind: PageKind = "planner"): Promise<{ app: App; charts: Charts } | null> {
  const loading = $(root, "#loading");
  let loaded: Awaited<ReturnType<typeof loadData>>;
  try {
    loaded = await loadData(root);
  } catch {
    loading.textContent = "Sorry, the food data couldn't be loaded. Please try again later.";
    return null;
  }
  if (loaded.data.missing || !loaded.data.foods.length) {
    loading.innerHTML = `<span class="notice">The food data snapshot hasn't been built yet.</span>`;
    return null;
  }
  tableCache.set("usda", Promise.resolve(loaded.data));   // the USDA basic foods, loaded with the page
  loading.remove();
  $(root, "#app").hidden = false;
  const app = createApp(root, loaded.data, loaded.standards, kind, loaded.tables);
  return { app, charts: createCharts(app) };
}
