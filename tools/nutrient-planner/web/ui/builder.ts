// Section 3b, "Build my own": a list of foods and amounts chosen by the person, analysed as they edit.
import { matches, type PlannerFood } from "../foods.ts";
import type { App, Item } from "./app.ts";
import type { Charts } from "./charts.ts";
import { CAVEAT, foodNotes } from "./notices.ts";
import { reportHtml } from "./report.ts";
import { $, $$, esc, fmt } from "./dom.ts";

// Amounts are shown in the food's own unit (grams, or e.g. eggs, slices) and stored in grams.
export const unitAmount = (f: PlannerFood, grams: number) => (f.unit === "g" ? grams : grams / f.unitGrams);
/** The amount a food starts at when added: one unit (an egg, a slice), or 100 g (less if the food's daily cap is lower). */
export const startGrams = (f: PlannerFood) => (f.unit === "g" ? Math.min(100, f.maxGrams) : f.unitGrams);
export const unitLabel = (f: PlannerFood) => (f.unit === "g" ? "g" : `${f.unit}${f.unit.endsWith("h") ? "es" : "s"}`);
const amountOf = (key: string, f: PlannerFood, grams: number) => ((f.per100g[key] ?? 0) * grams) / 100;

export function setupBuilder(app: App, charts: Charts) {
  const { root } = app;
  const addSearch = $<HTMLInputElement>(root, "#addSearch");
  const addList = $<HTMLUListElement>(root, "#addList");
  const list = $(root, "#builderList");
  const result = $(root, "#builderResult");
  const items = () => app.items(app.s.builder);

  /** The table of foods and amounts, then the day's results. */
  function render() {
    const its = items();
    if (!its.length) {
      list.innerHTML = `<p class="small muted sans">No foods yet. Search above to add one, or press "Adjust in builder" on a suggested option.</p>`;
      result.innerHTML = "";
      return;
    }
    list.innerHTML = `<div class="table-scroll builder-table"><table><thead><tr><th>Food</th><th>Amount</th><th class="num">kcal</th><th class="num">Protein</th><th></th></tr></thead><tbody>${
      its.map((it, i) => `<tr><td>${esc(it.food.name)}${it.food.blend ? ' <span class="tag">blended</span>' : ""}</td>
        <td><span class="amt"><input type="number" min="0" step="${it.food.unit === "g" ? 5 : 0.5}" data-row="${i}" value="${Math.round(unitAmount(it.food, it.grams) * 10) / 10}" aria-label="Amount of ${esc(it.food.name)}" /> ${esc(unitLabel(it.food))}${it.food.unit !== "g" ? ` <span class="muted small">(${Math.round(it.grams)} g)</span>` : ""}</span></td>
        <td class="num">${fmt(amountOf("energy", it.food, it.grams))}</td>
        <td class="num">${fmt(amountOf("protein", it.food, it.grams))} g</td>
        <td><button type="button" class="link" data-remove="${i}" aria-label="Remove ${esc(it.food.name)}">Remove</button></td></tr>`).join("")
    }</tbody></table></div><p class="sans small"><button type="button" class="link" id="clearBuilder">Clear all</button></p>`;
    renderResult(its);
  }

  function renderResult(its: Item[] = items()) {
    result.innerHTML = its.length ? `${CAVEAT}<article class="result"><h3><span>Your day</span></h3>${reportHtml(app, charts, app.report(its), its)}${foodNotes(app, its)}</article>` : "";
  }

  // Typing an amount updates that row and the results, without redrawing the table (which would lose the cursor).
  list.addEventListener("input", (e) => {
    const box = e.target as HTMLInputElement;
    if (box.dataset.row === undefined) return;
    const entry = app.s.builder[Number(box.dataset.row)];
    const f = app.foodById.get(entry.id)!;
    const v = Math.max(0, Number(box.value) || 0);
    entry.grams = f.unit === "g" ? v : v * f.unitGrams;
    const row = box.closest("tr")!;
    row.children[2].textContent = fmt(amountOf("energy", f, entry.grams));
    row.children[3].textContent = `${fmt(amountOf("protein", f, entry.grams))} g`;
    app.save();
    renderResult();
  });
  list.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.dataset.remove !== undefined) { app.s.builder.splice(Number(t.dataset.remove), 1); app.save(); render(); }
    if (t.id === "clearBuilder") { app.s.builder = []; app.save(); render(); }
  });

  // ---- "Add a food" search box with a drop-down list of matches (keyboard and mouse)
  let hits: PlannerFood[] = [];
  let active = -1;   // index of the match highlighted with the arrow keys

  function hideMatches() {
    addList.hidden = true;
    addSearch.setAttribute("aria-expanded", "false");
  }
  function showMatches() {
    const q = addSearch.value.trim();
    hits = q.length < 2 ? [] : app.dietFoods().filter((f) => matches(f, q))
      .sort((a, b) => Number(b.common) - Number(a.common) || a.name.length - b.name.length).slice(0, 40);
    active = -1;
    addList.innerHTML = hits.map((f, i) => `<li role="option" id="add-${i}" data-i="${i}">${esc(f.name)}${f.common ? ' <span class="tag">common</span>' : ""}${f.blend ? ' <span class="tag">blended</span>' : ""}<span class="path">${esc(app.categoryName.get(f.cat) ?? "")} › ${esc(f.group)}</span></li>`).join("")
      || (q.length >= 2 ? `<li aria-disabled="true">No matches</li>` : "");
    addList.hidden = !addList.childElementCount;
    addSearch.setAttribute("aria-expanded", String(!addList.hidden));
  }
  // Adds one unit (or 100 g); adding a food already in the list increases its amount.
  function add(f: PlannerFood) {
    const grams = startGrams(f);
    const existing = app.s.builder.find((b) => b.id === f.id);
    if (existing) existing.grams += grams; else app.s.builder.push({ id: f.id, grams });
    addSearch.value = "";
    hideMatches();
    app.save();
    render();
    addSearch.focus();
  }
  addSearch.addEventListener("input", showMatches);
  addSearch.addEventListener("keydown", (e) => {
    if (addList.hidden || !hits.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
      $$(addList, "li").forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
      addSearch.setAttribute("aria-activedescendant", `add-${active}`);
      addList.children[active]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      add(hits[Math.max(0, active)]);
    } else if (e.key === "Escape") { addList.hidden = true; }
  });
  // mousedown rather than click, so the choice is taken before the box loses focus and the list closes
  addList.addEventListener("mousedown", (e) => {
    const li = (e.target as HTMLElement).closest("li[data-i]") as HTMLElement | null;
    if (li) { e.preventDefault(); add(hits[Number(li.dataset.i)]); }
  });
  addSearch.addEventListener("blur", () => setTimeout(() => (addList.hidden = true), 150));

  return { render };
}
