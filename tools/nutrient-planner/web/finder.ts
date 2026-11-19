// Food Finder: the entry point of the tool's main page. Look up one food, from one food data source, in any amount,
// against the same targets, charts and notes as the Planner. It reuses the Planner's code throughout (see ui/), so a
// change to the Planner's targets, charts or food list shows here too. The only differences: one food at a time,
// no suggestions, and the person's details are tucked away under "About you" with the Planner's defaults.
//
// The food and amount are kept as the Planner's builder list with one item (`b=` in the link), and the source as
// the Planner's source setting (`src=`), so a Food Finder link reads like a one-food Planner day.
//
// The list holds every food of every table (data/foods/index.json, names only). A table's values are loaded when
// one of its foods is picked, with the table's foods outside the Planner's basic foods.
import type { FoodIndex, PlannerFood, Source } from "./foods.ts";
import { boot, loadBlend, loadIndex, loadTable } from "./ui/boot.ts";
import { setupYou } from "./ui/you.ts";
import { setupFoodList, sourceLabel, type Pick } from "./ui/food-list.ts";
import { setupShare } from "./ui/share.ts";
import { startGrams, unitAmount, unitLabel } from "./ui/builder.ts";
import { dataCaveat, foodNotes } from "./ui/notices.ts";
import { reportHtml } from "./ui/report.ts";
import { $, esc, fmt } from "./ui/dom.ts";

export async function startFinder(root: HTMLElement) {
  const booted = await boot(root, "finder");
  if (!booted) return;
  const { app, charts } = booted;
  const result = $(root, "#finderResult");
  const status = $(root, "#sourceStatus");

  // The name index is needed up front; the Blended table's values per standard are loaded when it is first used.
  status.textContent = "Loading the food list…";
  let index: FoodIndex | null = null;
  const problems: string[] = [];
  try { index = await loadIndex(root); } catch { problems.push("only the USDA foods are listed"); }
  status.textContent = problems.length ? `Sorry, some food data couldn't be loaded, so ${problems.join(" and ")}.` : "";
  const entries: PlannerFood[] = index
    ? Object.entries(index.foods).flatMap(([table, rows]) => rows.map(([id, name, cat, group, label, diet, flags]) => ({
        id, name, cat, group, label, diet, table, srcName: name,
        common: !!(flags & index!.flags.common), fortified: !!(flags & index!.flags.fortified),
      }) as unknown as PlannerFood))
    : app.data.foods;
  const sources = (f: PlannerFood): Source[] => [f.table];

  /** Load the picked food's table (with all its foods) and put it in use. */
  async function useTable(source: Source) {
    const t = app.tables.find((x) => x.id === source);
    if (!t) return false;
    if (app.data.table === source && (source === "blend" || app.data.foods.some((f) => f.basic === false))) return true;
    status.textContent = `Loading ${t.tag}…`;
    try {
      if (source === "blend" && !app.blend) app.blend = await loadBlend(root);
      app.setData(await loadTable(root, t, true));
      status.textContent = "";
      return true;
    } catch {
      status.textContent = `Sorry, the ${t.tag} data couldn't be loaded.`;
      return false;
    }
  }

  // A link may carry a Planner day: Food Finder shows its first food only. A table that isn't offered falls back to USDA.
  if (!app.tables.some((t) => t.id === app.tableId())) app.s.source = "usda";
  if (app.s.builder.length && !(await useTable(app.tableId()))) app.s.source = "usda";
  app.s.builder = app.s.builder.filter((b) => app.foodById.has(b.id)).slice(0, 1);

  const picked = (): Pick | null => (app.s.builder[0] ? { id: app.s.builder[0].id, source: app.tableId() } : null);
  const item = () => app.items(app.s.builder)[0];

  /** The amount box, then the Planner's results for this one food. */
  function render() {
    const it = item();
    if (!it) {
      result.innerHTML = `<p class="small muted sans">Pick a food above to see its nutrients.</p>`;
      return;
    }
    const f = it.food;
    const step = f.unit === "g" ? 5 : 0.5;
    result.innerHTML = `<div class="amount-row sans">
        <label for="amount"><b>Amount</b></label>
        <span class="amt"><input type="number" id="amount" min="0" step="${step}" value="${Math.round(unitAmount(f, it.grams) * 10) / 10}" /> ${esc(unitLabel(f))}${f.unit !== "g" ? ` <span class="muted small" id="amountGrams">(${Math.round(it.grams)} g)</span>` : ""}</span>
      </div>
      <div id="finderReport"></div>`;
    renderReport();
  }
  function renderReport() {
    const it = item();
    if (!it) return;
    const f = it.food;
    const n = unitAmount(f, it.grams);
    const amount = f.unit === "g" ? `${fmt(n)} g` : `${fmt(n)} ${esc(n === 1 ? f.unit : unitLabel(f))} (${fmt(it.grams)} g)`;
    $(root, "#finderReport").innerHTML = `${dataCaveat(app)}<article class="result"><h3><span>${esc(f.name)} (${esc(sourceLabel(app, app.tableId()))}), ${amount}</span></h3>${reportHtml(app, charts, app.report([it]), [it])}${foodNotes(app, [it])}</article>`;
  }

  // Typing an amount redraws the results, not the box (which would lose the cursor).
  result.addEventListener("input", (e) => {
    const box = e.target as HTMLInputElement;
    if (box.id !== "amount" || !app.s.builder[0]) return;
    const f = item()!.food;
    const v = Math.max(0, Number(box.value) || 0);
    app.s.builder[0].grams = f.unit === "g" ? v : v * f.unitGrams;
    const g = root.querySelector("#amountGrams");
    if (g) g.textContent = `(${Math.round(app.s.builder[0].grams)} g)`;
    app.save();
    renderReport();
  });

  async function pick(p: Pick) {
    if (!(await useTable(p.source))) return;
    const f = app.foodById.get(p.id);
    if (!f) return;
    // Switching between a food's sources keeps the amount; a new food starts at one unit or 100 g, as in the Planner.
    const grams = app.s.builder[0]?.id === p.id ? app.s.builder[0].grams : startGrams(f);
    app.s.builder = [{ id: p.id, grams }];
    app.s.source = p.source;
    changed();
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Any setting changed: the blend's values depend on the standard, so apply the source first, then redraw.
  function changed() {
    app.applySource();
    app.save();
    you.render();
    const p = app.person();
    $(root, "#youNote").textContent = `${p.standard.name}, ${p.profile.label.toLowerCase().replace(/(\d)-(\d)/, "$1–$2")}`;
    foodList.renderSummary();
    foodList.updateTicks();
    render();
  }

  const you = setupYou(app, changed);
  const foodList = setupFoodList(app, changed, () => { changed(); foodList.refresh(); }, {
    entries: () => entries, sources, picked, onPick: (p) => void pick(p),
    pickedName: () => (app.s.builder[0] ? app.foodById.get(app.s.builder[0].id)?.name ?? null : null),
  });

  function showAll() {
    app.s.builder = app.s.builder.slice(0, 1);
    changed();
    foodList.refresh();
  }
  setupShare(app, showAll);
  showAll();
}
