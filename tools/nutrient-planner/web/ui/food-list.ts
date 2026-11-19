// Section 2, "Choose foods": the diet and preset buttons, the count of foods switched on,
// and the tree of categories > groups > foods with tick boxes (or a flat list while searching).
// Food Finder uses the same list in single mode: one entry per food and food data source, and only one can be picked.
import { dietOk, isOn, matches, setOn, type Base, type PlannerFood, type Source } from "../foods.ts";
import type { Settings } from "../state.ts";
import type { App } from "./app.ts";
import { $, $$, esc, int } from "./dom.ts";
import { caveat } from "../../../../site/src/lib/caveats.ts";
import { blendFoodHtml } from "./notices.ts";

type Node = { id: string; name: string; foods: PlannerFood[] };

/** A food and the data source to read it from: what Food Finder's list picks. */
export type Pick = { id: string; source: Source };
/**
 * Single mode (Food Finder): `entries` is every food of every table (from the name index, before any table's values
 * are loaded); `sources` the entries each one gets (its table, and for some USDA foods also the blend).
 */
export type SingleMode = {
  entries: () => PlannerFood[]; sources: (f: PlannerFood) => Source[];
  picked: () => Pick | null; pickedName: () => string | null; onPick: (p: Pick) => void;
};

/** How each source is named after a food in Food Finder's list: the table's short tag, or "blended, beta". */
export const sourceLabel = (app: App, src: Source) => app.tables.find((t) => t.id === src)?.tag ?? src;

const PRESET_TEXT: Record<Base, string> = { common: "common foods", all: "all foods except US-fortified products", none: "nothing" };
const commonFirst = (a: { common?: boolean }, b: { common?: boolean }) => Number(b.common) - Number(a.common);

/**
 * `onToggle` is called when individual foods are switched on or off;
 * `onChange` when the diet or preset changes (which changes the whole list).
 */
export function setupFoodList(app: App, onToggle: () => void, onChange: () => void, single?: SingleMode) {
  const { root } = app;
  const tree = $(root, "#foodTree");
  const search = $<HTMLInputElement>(root, "#foodSearch");
  const foodsBox = $<HTMLDetailsElement>(root, "#foodsBox");
  const on = (f: PlannerFood) => isOn(f, app.base(), app.toggled);
  // The foods the list shows: in single mode every table's foods, otherwise the table in use.
  const listFoods = () => (single ? single.entries().filter((f) => dietOk(f, app.s.diet)) : app.dietFoods());

  function renderSummary() {
    $$<HTMLInputElement>(root, 'input[name="diet"]').forEach((r) => (r.checked = r.value === app.s.diet));
    const all = listFoods();
    if (single) {
      const p = single.picked();
      const name = p ? single.pickedName() : null;
      $(root, "#foodsNote").textContent = name ? `${name} (${sourceLabel(app, p!.source)})` : `${int(all.length)} foods`;
      return;
    }
    $(root, "#foodCount").innerHTML = `<b>${int(all.filter(on).length)}</b> of ${int(all.length)} foods switched on`;
    $(root, "#foodsNote").textContent = `starting from ${PRESET_TEXT[app.base()]}${app.toggled.size ? `, ${app.toggled.size} changed` : ""}`;
  }

  // Categories, each split into groups; common foods and groups come first.
  function categories(): { cat: Node; groups: Node[] }[] {
    const out: { cat: Node; groups: Node[] }[] = [];
    for (const c of app.data.categories) {
      const foods = listFoods().filter((f) => f.cat === c.id);
      if (!foods.length) continue;
      const byGroup = new Map<string, PlannerFood[]>();
      for (const f of foods) byGroup.set(f.group, [...(byGroup.get(f.group) ?? []), f]);
      const groups = [...byGroup].map(([name, fs]) => ({
        id: `${c.id}:${name}`, name,
        foods: fs.sort((a, b) => commonFirst(a, b) || a.label.localeCompare(b.label)),
      })).sort((a, b) => Number(b.foods.some((f) => f.common)) - Number(a.foods.some((f) => f.common)) || a.name.localeCompare(b.name));
      out.push({ cat: { id: c.id, name: c.name, foods }, groups });
    }
    return out;
  }
  let model = categories();
  const foodsOf = new Map<string, PlannerFood[]>();   // category or group id -> its foods

  const tags = (f: PlannerFood) => `${f.common ? ' <span class="tag">common</span>' : ""}${f.fortified ? ' <span class="tag">US-fortified</span>' : ""}`;
  // Single mode: one entry per source of the food, e.g. "Eggs (USDA)", "Eggs (blended, beta)", "Eggs (CoFID)".
  const pickBoxes = (f: PlannerFood, label: string, path = "") =>
    single!.sources(f).map((src) =>
      `<label class="item"><input type="radio" name="pick" data-food="${esc(f.id)}" data-src="${src}" /> <span>${esc(label)} (${esc(sourceLabel(app, src))})${tags(f)}${path ? ` <span class="path">${esc(path)}</span>` : ""}</span></label>`).join("");
  const foodBox = (f: PlannerFood, label: string, path = "") => single ? pickBoxes(f, label, path) :
    `<label class="item"><input type="checkbox" data-food="${f.id}" /> <span>${esc(label)}${f.common ? ' <span class="tag">common</span>' : ""}${f.fortified ? ' <span class="tag">US-fortified</span>' : ""}${f.blend ? ` <span class="tag">blended</span> <button type="button" class="link" data-sources="${esc(f.id)}" aria-expanded="false">sources</button>` : ""}${path ? ` <span class="path">${esc(path)}</span>` : ""}</span></label>`;
  const groupBox = (attr: string, id: string) => (single ? "" : `<input type="checkbox" ${attr}="${esc(id)}" />`);

  function renderTree() {
    const q = search.value.trim();
    if (q.length >= 2) {
      const hits = listFoods().filter((f) => matches(f, q)).sort((a, b) => commonFirst(a, b) || a.name.length - b.name.length).slice(0, 200);
      tree.innerHTML = hits.length
        ? `<p class="small muted sans">${hits.length === 200 ? "First 200 matches" : `${hits.length} match${hits.length === 1 ? "" : "es"}`}</p><ul class="flat">${hits.map((f) => `<li>${foodBox(f, f.name, `${app.categoryName.get(f.cat)} › ${f.group}`)}</li>`).join("")}</ul>`
        : `<p class="small muted sans">No foods match "${esc(q)}".</p>`;
      updateTicks();
      return;
    }
    // Only the category headings are drawn at first; each is filled in when opened (see fillCategory).
    model = categories();
    foodsOf.clear();
    tree.innerHTML = `<div class="tree">${model.map(({ cat }) => `<details data-cat-box="${cat.id}"><summary>${groupBox("data-cat", cat.id)} ${esc(cat.name)} <span class="count" data-count="${cat.id}"></span></summary><div class="cat-body"></div></details>`).join("")}</div>`;
    for (const { cat, groups } of model) {
      foodsOf.set(cat.id, cat.foods);
      for (const g of groups) foodsOf.set(g.id, g.foods);
    }
    updateTicks();
  }

  function fillCategory(box: HTMLDetailsElement) {
    const body = $(box, ".cat-body");
    if (body.childElementCount) return;
    const entry = model.find((x) => x.cat.id === box.dataset.catBox);
    if (!entry) return;
    // Groups of several foods get their own heading; groups of one are listed together below.
    const singles = entry.groups.filter((g) => g.foods.length === 1);
    const multis = entry.groups.filter((g) => g.foods.length > 1);
    body.innerHTML =
      multis.map((g) => `<details><summary>${groupBox("data-group", g.id)} ${esc(g.name)} <span class="count" data-count="${esc(g.id)}"></span></summary><div class="items">${g.foods.map((f) => foodBox(f, f.common ? f.name : f.label)).join("")}</div></details>`).join("")
      + (singles.length ? `<div class="items">${singles.map((g) => foodBox(g.foods[0], g.foods[0].name)).join("")}</div>` : "");
    updateTicks();
  }

  // Set every tick box from the settings; a heading is ticked, part-ticked or clear, with a count.
  function updateTicks() {
    if (single) {
      const p = single.picked();
      for (const r of $$<HTMLInputElement>(tree, "input[data-food]")) r.checked = !!p && r.dataset.food === p.id && r.dataset.src === p.source;
      for (const [id, fs] of foodsOf) {
        const count = tree.querySelector(`[data-count="${CSS.escape(id)}"]`);
        if (count) count.textContent = `${fs.length}`;
      }
      return;
    }
    for (const cb of $$<HTMLInputElement>(tree, "input[data-food]")) cb.checked = on(app.foodById.get(cb.dataset.food!)!);
    for (const cb of $$<HTMLInputElement>(tree, "input[data-cat], input[data-group]")) {
      const id = cb.dataset.cat ?? cb.dataset.group!;
      const fs = foodsOf.get(id) ?? [];
      const n = fs.filter(on).length;
      cb.checked = n === fs.length && n > 0;
      cb.indeterminate = n > 0 && n < fs.length;
      const count = tree.querySelector(`[data-count="${CSS.escape(id)}"]`);
      if (count) count.textContent = `${n} of ${fs.length}`;
    }
  }

  tree.addEventListener("toggle", (e) => {
    const d = e.target as HTMLDetailsElement;
    if (d.open && d.dataset.catBox) fillCategory(d);
  }, true);
  // "sources" on a blended food opens its sources, values and caveats under it; pressing again closes it.
  tree.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const id = t instanceof HTMLButtonElement ? t.dataset.sources : undefined;
    if (!id) return;
    e.preventDefault();
    const holder = t.closest("li") ?? t.closest("label")!;
    const next = holder.nextElementSibling?.classList.contains("food-sources") ? holder.nextElementSibling : null;
    const existing = (holder.querySelector(":scope > .food-sources") ?? next) as HTMLElement | null;
    if (existing) { existing.remove(); t.setAttribute("aria-expanded", "false"); return; }
    const f = app.foodById.get(id);
    if (!f?.blend) return;
    const box = document.createElement("div");
    box.className = "food-sources blend-notes sans";
    box.innerHTML = caveat("beta", "Blended values: the median of the independent food tables that give it, under the definition your standard uses, matched and combined by automated steps without manual human verification.") + blendFoodHtml(app, f, true);
    if (holder.tagName === "LI") holder.append(box); else holder.after(box);
    t.setAttribute("aria-expanded", "true");
  });
  tree.addEventListener("click", (e) => {
    // A tick box inside a heading shouldn't open or close that section.
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.closest("summary")) e.stopPropagation();
  });
  tree.addEventListener("change", (e) => {
    const cb = e.target as HTMLInputElement;
    if (single) {
      if (cb.dataset.food) single.onPick({ id: cb.dataset.food, source: cb.dataset.src as Source });
      return;
    }
    const foods = cb.dataset.food ? [app.foodById.get(cb.dataset.food)!] : foodsOf.get((cb.dataset.cat ?? cb.dataset.group)!) ?? [];
    for (const f of foods) setOn(f, cb.checked, app.base(), app.toggled);
    updateTicks();
    onToggle();
  });
  // The tree is built the first time the section is opened.
  foodsBox.addEventListener("toggle", () => { if (foodsBox.open && !tree.childElementCount) renderTree(); });
  let searchTimer = 0;
  search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = window.setTimeout(renderTree, 150); });

  $$<HTMLButtonElement>(root, "button[data-base]").forEach((b) => b.addEventListener("click", () => {
    app.s.base = b.dataset.base as Base; app.toggled.clear(); onChange();
  }));
  $$<HTMLInputElement>(root, 'input[name="diet"]').forEach((r) => r.addEventListener("change", () => { app.s.diet = r.value as Settings["diet"]; onChange(); }));

  return {
    renderSummary,
    /** Redraw the tree if it is on show (after a change of diet or preset). */
    refresh: () => { if (foodsBox.open) renderTree(); },
    /** Redraw the tree if it has ever been drawn (after importing settings). */
    redrawIfBuilt: () => { if (tree.childElementCount) renderTree(); },
    /** Show the current pick in the list (single mode). */
    updateTicks,
  };
}
