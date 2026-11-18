// Food Finder: the entry point of the tool's main page. Look up one food, from one food data source, in any amount,
// against the same targets, charts and notes as the Planner. It reuses the Planner's code throughout (see ui/), so a
// change to the Planner's targets, charts or food list shows here too. The only differences: one food at a time,
// no suggestions, and the person's details are tucked away under "About you" with the Planner's defaults.
//
// The food and amount are kept as the Planner's builder list with one item (`b=` in the link), and the source as
// the Planner's source setting (`src=`), so a Food Finder link reads like a one-food Planner day.
import { boot, loadBlend } from "./ui/boot.ts";
import { setupYou } from "./ui/you.ts";
import { setupFoodList, SOURCE_LABEL, type Pick } from "./ui/food-list.ts";
import { setupShare } from "./ui/share.ts";
import { startGrams, unitAmount, unitLabel } from "./ui/builder.ts";
import { CAVEAT, foodNotes } from "./ui/notices.ts";
import { reportHtml } from "./ui/report.ts";
import { $, esc, fmt } from "./ui/dom.ts";

export async function startFinder(root: HTMLElement) {
  const booted = await boot(root, "finder");
  if (!booted) return;
  const { app, charts } = booted;
  const result = $(root, "#finderResult");
  const status = $(root, "#sourceStatus");

  // The blend is needed up front: its foods get a second entry in the list.
  status.textContent = "Loading the blended data…";
  try {
    app.blend = await loadBlend(root);
    status.textContent = "";
  } catch {
    status.textContent = "Sorry, the blended data couldn't be loaded, so only the USDA entries are listed.";
    if (app.s.source === "blend") app.s.source = "usda";
  }
  const blended = new Set(Object.keys(app.blend?.foods ?? {}));

  // A link may carry a Planner day: Food Finder shows its first food only. A blended pick of a food the blend
  // doesn't cover falls back to the USDA entry.
  app.s.builder = app.s.builder.filter((b) => app.foodById.has(b.id)).slice(0, 1);
  if (app.s.source === "blend" && !blended.has(app.s.builder[0]?.id ?? "")) app.s.source = "usda";

  const picked = (): Pick | null => (app.s.builder[0] ? { id: app.s.builder[0].id, source: app.s.source } : null);
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
    $(root, "#finderReport").innerHTML = `${CAVEAT}<article class="result"><h3><span>${esc(f.name)} (${SOURCE_LABEL[app.s.source]}), ${amount}</span></h3>${reportHtml(app, charts, app.report([it]), [it])}${foodNotes(app, [it])}</article>`;
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

  function pick(p: Pick) {
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
  const foodList = setupFoodList(app, changed, () => { changed(); foodList.refresh(); }, { blended: () => blended, picked, onPick: pick });

  function showAll() {
    app.s.builder = app.s.builder.slice(0, 1);
    changed();
    foodList.refresh();
  }
  setupShare(app, showAll);
  showAll();
}
