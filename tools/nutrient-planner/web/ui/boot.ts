// Start-up shared by the Planner and Food Finder pages: load the food data and the target standards, show a
// message if they can't be loaded, then create the page's shared state (App) and its charts.
import { unpack, type BlendData, type FoodsData } from "../foods.ts";
import type { Standard } from "../profiles.ts";
import { createApp, type App } from "./app.ts";
import { createCharts, type Charts } from "./charts.ts";
import { $ } from "./dom.ts";

const STANDARD_FILES = ["targets/uk.json", "targets/us.json", "targets/eu.json"];
const dataUrl = (root: HTMLElement) => root.dataset.data ?? `${root.dataset.base ?? "/"}tools/nutrient-planner/data/`;

async function loadData(root: HTMLElement): Promise<{ data: FoodsData; standards: Standard[] }> {
  const get = (f: string) => fetch(dataUrl(root) + f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
  const [raw, ...standards] = await Promise.all(["foods/foods.json", ...STANDARD_FILES].map(get));
  return { data: unpack(raw), standards };
}

/** The beta blended source (loaded only when it is first needed). */
export async function loadBlend(root: HTMLElement): Promise<BlendData> {
  const r = await fetch(`${dataUrl(root)}foods/foods-blend.json`);
  if (!r.ok) throw new Error("foods-blend.json");
  return r.json();
}

/** Load the data and create the page's state and charts; null (with a message on the page) if loading failed. */
export async function boot(root: HTMLElement): Promise<{ app: App; charts: Charts } | null> {
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
  loading.remove();
  $(root, "#app").hidden = false;
  const app = createApp(root, loaded.data, loaded.standards);
  return { app, charts: createCharts(app) };
}
