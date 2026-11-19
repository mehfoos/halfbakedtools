// Nutrient planner: the page's entry point. It loads the data, then wires the sections together.
// Everything runs in the browser; the only network requests are for the site's own data files.
//
// Map of the code (see ../README.md for more):
//   solver.ts, highsSolver.ts, worker.ts   the optimiser
//   profiles.ts, person.ts                 who the person is -> which targets apply
//   foods.ts, plan-input.ts                the food list and the rules applied before a search
//   analysis.ts, chart-axes.ts, radar.ts   measuring a day against the targets, and drawing it
//   state.ts                               settings: defaults, link, file, remembered
//   ui/                                    the page itself, one file per section (ui/boot.ts: shared start-up)
import type { Settings } from "./state.ts";
import { boot, loadBlend, loadTable } from "./ui/boot.ts";
import { setupYou } from "./ui/you.ts";
import { setupFoodList } from "./ui/food-list.ts";
import { setupSuggest } from "./ui/suggest.ts";
import { setupBuilder } from "./ui/builder.ts";
import { setupShare } from "./ui/share.ts";
import { $, $$ } from "./ui/dom.ts";

export async function start(root: HTMLElement) {
  const booted = await boot(root);
  if (!booted) return;
  const { app, charts } = booted;

  // Section 3 has two modes: "Suggest foods for me" and "Build my own".
  function setMode(mode: Settings["mode"]) {
    app.s.mode = mode;
    $$<HTMLInputElement>(root, 'input[name="mode"]').forEach((r) => (r.checked = r.value === mode));
    $(root, "#suggestPane").hidden = mode !== "suggest";
    $(root, "#buildPane").hidden = mode !== "build";
    if (mode === "build") builder.render();
    app.save();
  }

  // Food data: a table (the Blended table also needs its values per standard). Each is loaded the first time it's chosen.
  const sourceStatus = $(root, "#sourceStatus");
  async function ensureSource() {
    if (!app.tables.some((t) => t.id === app.tableId())) app.s.source = "";   // a link to a table not offered: the default
    const t = app.table()!;
    try {
      if (app.data.table !== t.id) {
        sourceStatus.textContent = `Loading ${t.tag}…`;
        app.setData(await loadTable(root, t, false));
      }
      if (app.tableId() === "blend" && !app.blend) {
        sourceStatus.textContent = "Loading the blended values…";
        app.blend = await loadBlend(root);
      }
      sourceStatus.textContent = "";
    } catch {
      app.s.source = "usda";
      app.setData(await loadTable(root, app.table()!, false));
      sourceStatus.textContent = "Sorry, that food data couldn't be loaded, so the USDA data is in use.";
    }
  }
  function renderSource() {
    $$<HTMLInputElement>(root, 'input[name="source"]').forEach((r) => (r.checked = r.value === app.tableId()));
    $(root, "#blendNote").hidden = app.tableId() !== "blend";
    const t = app.table()!;
    $(root, "#tableNote").textContent = `${t.title}, ${t.country}: ${t.basicFoods.toLocaleString("en-GB")} foods here (${t.foods.toLocaleString("en-GB")} in Food Finder). Licence: ${t.licence}.`
      + (app.s.source ? "" : ` This is the default table for the ${app.person().standard.name} recommendations; pick another table to use it instead.`);
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
    // With no table picked, the table follows the standard: a new standard may need another table loaded first.
    if (app.data.table !== app.tableId()) { void ensureSource().then(() => changed({ foods: true })); return; }
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
