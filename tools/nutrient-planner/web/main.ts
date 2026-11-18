// Nutrient planner: the page's entry point. It loads the data, then wires the sections together.
// Everything runs in the browser; the only network requests are for the site's own data files.
//
// Map of the code (see ../README.md for more):
//   solver.ts, highsSolver.ts, worker.ts   the optimiser
//   profiles.ts, person.ts                 who the person is -> which targets apply
//   foods.ts, plan-input.ts                the food list and the rules applied before a search
//   analysis.ts, chart-axes.ts, radar.ts   measuring a day against the targets, and drawing it
//   state.ts                               settings: defaults, link, file, remembered
//   ui/                                    the page itself, one file per section
import { unpack, type BlendData, type FoodsData } from "./foods.ts";
import type { Standard } from "./profiles.ts";
import type { Settings } from "./state.ts";
import { createApp } from "./ui/app.ts";
import { createCharts } from "./ui/charts.ts";
import { setupYou } from "./ui/you.ts";
import { setupFoodList } from "./ui/food-list.ts";
import { setupSuggest } from "./ui/suggest.ts";
import { setupBuilder } from "./ui/builder.ts";
import { setupShare } from "./ui/share.ts";
import { $, $$ } from "./ui/dom.ts";

const STANDARD_FILES = ["targets/uk.json", "targets/us.json", "targets/eu.json"];

async function loadData(root: HTMLElement): Promise<{ data: FoodsData; standards: Standard[] }> {
  const dataUrl = root.dataset.data ?? `${root.dataset.base ?? "/"}tools/nutrient-planner/data/`;
  const get = (f: string) => fetch(dataUrl + f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
  const [raw, ...standards] = await Promise.all(["foods/foods.json", ...STANDARD_FILES].map(get));
  return { data: unpack(raw), standards };
}

async function loadBlend(root: HTMLElement): Promise<BlendData> {
  const dataUrl = root.dataset.data ?? `${root.dataset.base ?? "/"}tools/nutrient-planner/data/`;
  const r = await fetch(`${dataUrl}foods/foods-blend.json`);
  if (!r.ok) throw new Error("foods-blend.json");
  return r.json();
}

export async function start(root: HTMLElement) {
  const loading = $(root, "#loading");
  let loaded: Awaited<ReturnType<typeof loadData>>;
  try {
    loaded = await loadData(root);
  } catch {
    loading.textContent = "Sorry, the planner's data couldn't be loaded. Please try again later.";
    return;
  }
  if (loaded.data.missing || !loaded.data.foods.length) {
    loading.innerHTML = `<span class="notice">The food data snapshot hasn't been built yet.</span>`;
    return;
  }
  loading.remove();
  $(root, "#app").hidden = false;

  const app = createApp(root, loaded.data, loaded.standards);
  const charts = createCharts(app);

  // Section 3 has two modes: "Suggest foods for me" and "Build my own".
  function setMode(mode: Settings["mode"]) {
    app.s.mode = mode;
    $$<HTMLInputElement>(root, 'input[name="mode"]').forEach((r) => (r.checked = r.value === mode));
    $(root, "#suggestPane").hidden = mode !== "suggest";
    $(root, "#buildPane").hidden = mode !== "build";
    if (mode === "build") builder.render();
    app.save();
  }

  // Food data: the beta blend is loaded the first time it is chosen (or when a link asks for it).
  const sourceStatus = $(root, "#sourceStatus");
  async function ensureSource() {
    if (app.s.source !== "blend" || app.blend) return;
    sourceStatus.textContent = "Loading the blended data…";
    try {
      app.blend = await loadBlend(root);
      sourceStatus.textContent = "";
    } catch {
      app.s.source = "usda";
      sourceStatus.textContent = "Sorry, the blended data couldn't be loaded, so the USDA data is in use.";
    }
  }
  function renderSource() {
    $$<HTMLInputElement>(root, 'input[name="source"]').forEach((r) => (r.checked = r.value === app.s.source));
    $(root, "#blendNote").hidden = app.s.source !== "blend";
    app.applySource();
  }
  $$<HTMLInputElement>(root, 'input[name="source"]').forEach((r) => r.addEventListener("change", async () => {
    app.s.source = r.value as Settings["source"];
    await ensureSource();
    changed({ foods: true });
  }));

  // A food was switched on or off: nothing about the person changed, so only the count and the stale flag update.
  function foodsToggled() {
    app.save();
    foodList.renderSummary();
    suggest.markStale();
  }
  // Any other setting changed: redraw what depends on it. Suggestions are flagged, not recalculated.
  function changed(opts: { foods?: boolean } = {}) {
    renderSource();   // the standard may have changed, and the blend's values depend on it
    app.save();
    you.render();
    foodList.renderSummary();
    if (opts.foods) foodList.refresh();
    suggest.markStale();
    if (app.s.mode === "build") builder.render();
  }

  const you = setupYou(app, changed);
  const foodList = setupFoodList(app, foodsToggled, () => changed({ foods: true }));
  const builder = setupBuilder(app, charts);
  const suggest = setupSuggest(app, charts, (plan) => {
    app.s.builder = plan.items.map((i) => ({ id: i.id, grams: i.grams }));
    setMode("build");
    $(root, "#h-plan").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $$<HTMLInputElement>(root, 'input[name="mode"]').forEach((r) => r.addEventListener("change", () => setMode(r.value as Settings["mode"])));

  // Draw everything from the settings: at start-up, and again after settings are imported from a file.
  async function showAll() {
    await ensureSource();
    renderSource();
    root.classList.toggle("no-compare", !app.s.compare);
    you.render();
    foodList.renderSummary();
    foodList.redrawIfBuilt();
    suggest.reset();
    setMode(app.s.mode);
  }
  setupShare(app, () => void showAll());
  await showAll();
}
