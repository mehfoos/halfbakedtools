// Nutrient planner user interface. Everything runs in the browser; the only
// network requests are for the site's own data files.
import { resolveTargets, splitAssessable, describeAmount, type Plan, type ResolvedTarget } from "./solver.ts";
import { pickProfile, isAdult, refWeight, energyFor, type Standard } from "./profiles.ts";
import { unpack, isOn, setOn, dietOk, matches, type FoodsData, type PlannerFood, type Base } from "./foods.ts";
import { GROUPS, ORDER, SHORT_LABEL, analyse, totals, type Report, type Row } from "./analysis.ts";
import { radarSvg, scaleMax, type Axis, type Overlay } from "./radar.ts";
import { decode, encode, exportFile, forget, fresh, importFile, loadRemembered, remember, DEFAULTS, type Settings } from "./state.ts";

import { cite } from "../../lib/references.ts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const fmt = (v: number | undefined) => {
  if (v === undefined || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 100) return Math.round(v).toLocaleString("en-GB");
  if (a >= 10) return v.toFixed(1).replace(/\.0$/, "");
  if (a >= 1) return v.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  if (a === 0) return "0";
  return Number(v.toPrecision(2)).toString();
};
type Item = { food: PlannerFood; grams: number };
const CAVEAT = `<p class="small muted sans caveat">These are estimates. They use average food composition, mostly from US data ${cite("usda-sr")}, so real foods vary with brand, variety and cooking. They also don't yet allow for how well the body absorbs each nutrient (for example, iron from plants is absorbed less well than iron from meat).</p>`;
const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const $$ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => Array.from(root.querySelectorAll(sel)) as T[];

export async function start(root: HTMLElement) {
  const base = root.dataset.base ?? "/";
  const loading = $(root, "#loading");

  // ---------- data
  let data: FoodsData;
  const standards: Standard[] = [];
  try {
    const get = (f: string) => fetch(`${base}data/${f}`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
    const [raw, ...stds] = await Promise.all([get("foods.json"), get("targets-uk.json"), get("targets-us.json"), get("targets-eu.json")]);
    data = unpack(raw);
    standards.push(...stds);
  } catch {
    loading.textContent = "Sorry, the planner's data couldn't be loaded. Please try again later.";
    return;
  }
  if (data.missing || !data.foods.length) {
    loading.innerHTML = `<span class="notice">The food data snapshot hasn't been built yet.</span>`;
    return;
  }
  loading.remove();
  const app = $(root, "#app");
  app.hidden = false;

  const foodById = new Map(data.foods.map((f) => [f.id, f]));
  const meta = new Map(data.nutrients.map((n) => [n.key, { label: n.label, unit: n.unit }]));
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));

  // ---------- state: page address first, then opt-in remembered settings, then defaults
  const rememberBox = $<HTMLInputElement>(root, "#rememberBox");
  const remembered = loadRemembered();
  let s: Settings = location.search.length > 1 ? decode(location.search) : remembered ?? fresh();
  rememberBox.checked = !!remembered;
  let toggled = new Set(s.toggled);

  const std = () => standards.find((x) => x.id === s.standard && x.status === "available") ?? standards[0];
  const pick = () => pickProfile(std(), s.sex, s.age, s.life);
  const profile = () => pick().profile;
  const defaultWeight = () => refWeight(s.sex, s.age, s.life);
  const weight = () => s.weight ?? defaultWeight();
  const energy = () => energyFor(profile(), s.age, s.sex);
  const band = () => ({ low: s.energyLow ?? energy().low, high: s.energyHigh ?? energy().high });
  const resolve = (withOverrides: boolean) => {
    const b = band();
    return resolveTargets(profile().targets, data.nutrients, (b.low + b.high) / 2, weight(), std().id, withOverrides ? s.overrides : {}, s.age)
      .sort((a, z) => ORDER.indexOf(a.key) - ORDER.indexOf(z.key));
  };
  const dietFoods = () => data.foods.filter((f) => dietOk(f, s.diet));
  const selectedFoods = () => dietFoods().filter((f) => isOn(f, s.base, toggled));

  function save() {
    s.toggled = [...toggled];
    history.replaceState(null, "", `?${encode(s)}`);
    if (rememberBox.checked) remember(s);
  }

  // ---------- 1. About you
  const age = $<HTMLInputElement>(root, "#age");
  const weightIn = $<HTMLInputElement>(root, "#weight");
  const life = $<HTMLSelectElement>(root, "#life");
  $(root, "#standardSeg").innerHTML = standards.map((st) =>
    `<label><input type="radio" name="standard" value="${st.id}" ${st.status !== "available" ? "disabled" : ""} /><span>${esc(st.name)}${st.status !== "available" ? " (soon)" : ""}</span></label>`).join("");

  function renderYou() {
    $$<HTMLInputElement>(root, 'input[name="sex"]').forEach((r) => (r.checked = r.value === s.sex));
    $$<HTMLInputElement>(root, 'input[name="standard"]').forEach((r) => (r.checked = r.value === std().id));
    age.value = String(s.age);
    weightIn.value = s.weight === null ? "" : String(s.weight);
    weightIn.placeholder = String(defaultWeight());
    life.value = s.life;
    const p = pick();
    const b = band();
    const src = std().sources[0];
    $(root, "#profileLine").innerHTML =
      `Targets: <b>${esc(std().name)}</b> recommendations for <b>${esc(p.profile.label.toLowerCase().replace(/(\d)-(\d)/, "$1–$2"))}</b> · ${b.low.toLocaleString("en-GB")}–${b.high.toLocaleString("en-GB")} kcal a day`
      + (p.note ? ` <span class="muted">(${esc(p.note)})</span>` : "");
    const v = std().verified;
    $(root, "#sourceLine").innerHTML = `Source: ${esc(src.title)} ${cite(src.id)}. ${std().sources.length > 1 ? std().sources.slice(1).map((x) => `${esc(x.role ?? x.title)}: ${cite(x.id)}`).join("; ") + "." : ""}`
      + (v ? `<br>${v.checked ? `<b>Checked</b> against the original document (${esc(v.against)}) on ${esc(new Date(v.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}.` : `<b>Not yet checked against the original document.</b> ${esc(v.against)}.`}` : "");
    $(root, "#unverified").hidden = !!v?.checked;
    if (v?.pending) $(root, "#sourceLine").innerHTML += ` <b>Not yet checked:</b> ${esc(v.pending)}`;
    $<HTMLInputElement>(root, "#energyLow").value = String(b.low);
    $<HTMLInputElement>(root, "#energyHigh").value = String(b.high);
    $(root, "#energyNote").textContent = `Recommended: ${energy().low.toLocaleString("en-GB")}–${energy().high.toLocaleString("en-GB")} kcal. ${energy().note}`;
    const eCustom = s.energyLow !== null || s.energyHigh !== null;
    $(root, "#energyCustom").hidden = !eCustom;
    $(root, "#energyReset").hidden = !eCustom;
    renderTargets();
  }

  function renderTargets() {
    const official = new Map(resolve(false).map((t) => [t.key, t]));
    const current = resolve(true);
    const custom = current.filter((t) => t.custom).length + (s.energyLow !== null || s.energyHigh !== null ? 1 : 0);
    $(root, "#customBanner").hidden = custom === 0;
    $(root, "#tuneNote").textContent = `${std().name} · ${current.length} nutrient targets${custom ? ` · ${custom} custom` : ""}`;
    const openNow = new Set($$<HTMLDetailsElement>(root, "#targetGroups details[open]").map((d) => d.dataset.group));
    const input = (t: ResolvedTarget, bound: "min" | "max") => {
      const o = s.overrides[t.key]?.[bound];
      const off = official.get(t.key)?.[bound];
      return `<input type="number" step="any" min="0" data-key="${t.key}" data-bound="${bound}" aria-label="${esc(t.label)} ${bound === "min" ? "minimum" : "maximum"}" value="${o ?? ""}" placeholder="${off !== undefined ? fmt(off) : "none"}" />`;
    };
    const range = (t?: ResolvedTarget) => t ? [t.min !== undefined ? `≥ ${fmt(t.min)}` : "", t.max !== undefined ? `≤ ${fmt(t.max)}` : ""].filter(Boolean).join(", ") || "–" : "–";
    const notes: Record<string, string> = { amino: isAdult(s.age) ? `Per-kg amino acid needs (WHO 2007 ${cite("who-2007")}) worked out for ${weight()} kg.` : "Amino acid targets are given for adults only." };
    $(root, "#targetGroups").innerHTML = GROUPS.map((g) => {
      const ts = current.filter((t) => g.keys.includes(t.key));
      if (!ts.length) return g.id === "amino" ? `<p class="small muted sans">${notes.amino}</p>` : "";
      const nCustom = ts.filter((t) => t.custom).length;
      return `<details data-group="${g.id}" ${openNow.has(g.id) ? "open" : ""}><summary>${esc(g.title)} <span class="summary-note">${ts.length} targets${nCustom ? `, ${nCustom} custom` : ""}</span></summary>
        <div class="details-body">${notes[g.id] ? `<p class="small sans">${notes[g.id]}</p>` : ""}<div class="table-scroll"><table>
        <thead><tr><th>Nutrient</th><th class="num">Official</th><th>Your minimum</th><th>Your maximum</th></tr></thead><tbody>
        ${ts.map((t) => `<tr><td>${esc(t.label)} <span class="muted">${esc(t.unit)}</span>${t.custom ? '<span class="badge">custom</span>' : ""}</td>
          <td class="num">${range(official.get(t.key))}</td><td>${input(t, "min")}</td><td>${input(t, "max")}</td></tr>`).join("")}
        </tbody></table></div></div></details>`;
    }).join("");
  }

  const numOrNull = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  function changed(opts: { foods?: boolean } = {}) {
    save();
    renderYou();
    renderFoodSummary();
    if (opts.foods) refreshTree();
    markStale();
    if (s.mode === "build") renderBuilder();
  }

  $$<HTMLInputElement>(root, 'input[name="sex"]').forEach((r) => r.addEventListener("change", () => { s.sex = r.value as Settings["sex"]; s.energyLow = s.energyHigh = null; changed(); }));
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "standard") { s.standard = t.value; s.overrides = {}; s.energyLow = s.energyHigh = null; changed(); }
  });
  age.addEventListener("change", () => { s.age = Math.min(110, Math.max(1, Math.round(Number(age.value) || DEFAULTS.age))); s.energyLow = s.energyHigh = null; changed(); });
  weightIn.addEventListener("change", () => {
    const w = numOrNull(weightIn.value);
    s.weight = w === null ? null : Math.min(300, Math.max(10, Math.round(w)));
    changed();
  });
  life.addEventListener("change", () => { s.life = life.value as Settings["life"]; s.energyLow = s.energyHigh = null; changed(); });
  for (const [id, key] of [["#energyLow", "energyLow"], ["#energyHigh", "energyHigh"]] as const) {
    $<HTMLInputElement>(root, id).addEventListener("change", (e) => {
      const v = numOrNull((e.target as HTMLInputElement).value);
      const rec = energy()[key === "energyLow" ? "low" : "high"];
      s[key] = v === null || v === rec ? null : Math.min(6000, Math.max(300, Math.round(v)));
      changed();
    });
  }
  $(root, "#energyReset").addEventListener("click", () => { s.energyLow = s.energyHigh = null; changed(); });
  $(root, "#resetTargets").addEventListener("click", () => { s.overrides = {}; s.energyLow = s.energyHigh = null; changed(); });
  $(root, "#targetGroups").addEventListener("change", (e) => {
    const inp = e.target as HTMLInputElement;
    if (!inp.dataset.key) return;
    const key = inp.dataset.key, bound = inp.dataset.bound as "min" | "max";
    const v = numOrNull(inp.value);
    const o = { ...(s.overrides[key] ?? {}) };
    if (v === null) delete o[bound]; else o[bound] = v;
    if (Object.keys(o).length) s.overrides[key] = o; else delete s.overrides[key];
    changed();
  });

  // ---------- 2. Foods
  const tree = $(root, "#foodTree");
  const search = $<HTMLInputElement>(root, "#foodSearch");

  function renderFoodSummary() {
    $$<HTMLInputElement>(root, 'input[name="diet"]').forEach((r) => (r.checked = r.value === s.diet));
    const all = dietFoods();
    const on = all.filter((f) => isOn(f, s.base, toggled)).length;
    const baseText = { common: "common foods", all: "everything", none: "nothing" }[s.base];
    $(root, "#foodCount").innerHTML = `<b>${on.toLocaleString("en-GB")}</b> of ${all.length.toLocaleString("en-GB")} foods switched on`;
    $(root, "#foodsNote").textContent = `starting from ${baseText}${toggled.size ? `, ${toggled.size} changed` : ""}`;
  }

  type Node = { id: string; name: string; foods: PlannerFood[] };
  function categoriesTree(): { cat: Node; groups: Node[] }[] {
    const out: { cat: Node; groups: Node[] }[] = [];
    for (const c of data.categories) {
      const foods = dietFoods().filter((f) => f.cat === c.id);
      if (!foods.length) continue;
      const byGroup = new Map<string, PlannerFood[]>();
      for (const f of foods) byGroup.set(f.group, [...(byGroup.get(f.group) ?? []), f]);
      const groups = [...byGroup].map(([name, fs]) => ({
        id: `${c.id}:${name}`, name,
        foods: fs.sort((a, b) => Number(b.common) - Number(a.common) || a.label.localeCompare(b.label)),
      })).sort((a, b) => Number(b.foods.some((f) => f.common)) - Number(a.foods.some((f) => f.common)) || a.name.localeCompare(b.name));
      out.push({ cat: { id: c.id, name: c.name, foods }, groups });
    }
    return out;
  }

  const itemHtml = (f: PlannerFood, label: string, path = "") =>
    `<label class="item"><input type="checkbox" data-food="${f.id}" /> <span>${esc(label)}${f.common ? ' <span class="tag">common</span>' : ""}${path ? ` <span class="path">${esc(path)}</span>` : ""}</span></label>`;
  const triBox = (attr: string, id: string) => `<input type="checkbox" ${attr}="${esc(id)}" />`;
  let treeModel = categoriesTree();
  const groupFoods = new Map<string, PlannerFood[]>();

  function renderTree() {
    const q = search.value.trim();
    if (q.length >= 2) {
      const hits = dietFoods().filter((f) => matches(f, q)).sort((a, b) => Number(b.common) - Number(a.common) || a.name.length - b.name.length).slice(0, 200);
      tree.innerHTML = hits.length
        ? `<p class="small muted sans">${hits.length === 200 ? "First 200 matches" : `${hits.length} match${hits.length === 1 ? "" : "es"}`}</p><ul class="flat">${hits.map((f) => `<li>${itemHtml(f, f.name, `${catName.get(f.cat)} › ${f.group}`)}</li>`).join("")}</ul>`
        : `<p class="small muted sans">No foods match "${esc(q)}".</p>`;
      updateTreeStates();
      return;
    }
    treeModel = categoriesTree();
    groupFoods.clear();
    tree.innerHTML = `<div class="tree">${treeModel.map(({ cat }) => `<details data-cat-box="${cat.id}"><summary>${triBox("data-cat", cat.id)} ${esc(cat.name)} <span class="count" data-count="${cat.id}"></span></summary><div class="cat-body"></div></details>`).join("")}</div>`;
    for (const { cat, groups } of treeModel) {
      groupFoods.set(cat.id, cat.foods);
      for (const g of groups) groupFoods.set(g.id, g.foods);
    }
    updateTreeStates();
  }

  function fillCategory(box: HTMLDetailsElement) {
    const body = $(box, ".cat-body");
    if (body.childElementCount) return;
    const entry = treeModel.find((x) => x.cat.id === box.dataset.catBox);
    if (!entry) return;
    const singles = entry.groups.filter((g) => g.foods.length === 1);
    const multis = entry.groups.filter((g) => g.foods.length > 1);
    body.innerHTML =
      multis.map((g) => `<details><summary>${triBox("data-group", g.id)} ${esc(g.name)} <span class="count" data-count="${esc(g.id)}"></span></summary><div class="items">${g.foods.map((f) => itemHtml(f, f.common ? f.name : f.label)).join("")}</div></details>`).join("")
      + (singles.length ? `<div class="items">${singles.map((g) => itemHtml(g.foods[0], g.foods[0].common ? g.foods[0].name : g.foods[0].name)).join("")}</div>` : "");
    updateTreeStates();
  }

  function updateTreeStates() {
    for (const cb of $$<HTMLInputElement>(tree, "input[data-food]")) cb.checked = isOn(foodById.get(cb.dataset.food!)!, s.base, toggled);
    for (const cb of $$<HTMLInputElement>(tree, "input[data-cat], input[data-group]")) {
      const id = cb.dataset.cat ?? cb.dataset.group!;
      const fs = groupFoods.get(id) ?? [];
      const on = fs.filter((f) => isOn(f, s.base, toggled)).length;
      cb.checked = on === fs.length && on > 0;
      cb.indeterminate = on > 0 && on < fs.length;
      const count = tree.querySelector(`[data-count="${CSS.escape(id)}"]`);
      if (count) count.textContent = `${on} of ${fs.length}`;
    }
  }
  const refreshTree = () => { if ((root.querySelector("#foodsBox") as HTMLDetailsElement).open) renderTree(); };

  tree.addEventListener("toggle", (e) => {
    const d = e.target as HTMLDetailsElement;
    if (d.open && d.dataset.catBox) fillCategory(d);
  }, true);
  tree.addEventListener("click", (e) => {
    // A tick box inside a heading shouldn't open or close that section.
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.closest("summary")) e.stopPropagation();
  });
  tree.addEventListener("change", (e) => {
    const cb = e.target as HTMLInputElement;
    if (cb.dataset.food) setOn(foodById.get(cb.dataset.food)!, cb.checked, s.base, toggled);
    else {
      const id = cb.dataset.cat ?? cb.dataset.group;
      for (const f of groupFoods.get(id!) ?? []) setOn(f, cb.checked, s.base, toggled);
    }
    updateTreeStates();
    save();
    renderFoodSummary();
    markStale();
  });
  $(root, "#foodsBox").addEventListener("toggle", (e) => { if ((e.target as HTMLDetailsElement).open && !tree.childElementCount) renderTree(); });
  let searchTimer = 0;
  search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = window.setTimeout(renderTree, 150); });
  $$<HTMLButtonElement>(root, "button[data-base]").forEach((b) => b.addEventListener("click", () => {
    s.base = b.dataset.base as Base; toggled.clear(); changed({ foods: true });
  }));
  $$<HTMLInputElement>(root, 'input[name="diet"]').forEach((r) => r.addEventListener("change", () => { s.diet = r.value as Settings["diet"]; changed({ foods: true }); }));

  // ---------- reports (shared by suggestions and the builder)
  function report(items: { food: PlannerFood; grams: number }[]) {
    const current = resolve(true);
    const { notAssessed } = splitAssessable(current, selectedFoods().length ? selectedFoods() : dietFoods());
    const sums = totals(items, ORDER);
    return analyse(sums, current, new Set(notAssessed.map((t) => t.key)), meta);
  }

  const chip = (r: Row) => {
    const text = { met: "met", short: `${Math.round(r.pctOfMin!)}%`, low: `${Math.round(r.pctOfMin!)}%`, over: "over limit", within: "within limit", info: "no target", unassessed: "no data" }[r.status];
    return `<span class="chip ${r.status}">${text}</span>`;
  };
  const target = (r: Row) => [r.min !== undefined ? `≥ ${fmt(r.min)}` : "", r.max !== undefined ? `≤ ${fmt(r.max)}` : ""].filter(Boolean).join(", ") || "–";
  const tableHtml = (rows: Row[]) => `<div class="table-scroll"><table><thead><tr><th>Nutrient</th><th class="num">Amount</th><th class="num">Target</th><th></th></tr></thead><tbody>${
    rows.map((r) => `<tr><td>${esc(r.label)}${r.custom ? '<span class="badge">custom</span>' : ""}</td><td class="num">${fmt(r.value)} <span class="muted">${esc(r.unit)}</span></td><td class="num muted">${target(r)}</td><td>${chip(r)}</td></tr>`).join("")
  }</tbody></table></div>`;

  // ---------- other standards' targets, for comparison on the charts
  const OVERLAY_STYLE: Record<string, { color: string; dash: string }> = {
    uk: { color: "#0b7a75", dash: "6 3" }, us: { color: "#c25e00", dash: "2 3" }, eu: { color: "#7a2e8e", dash: "8 3 2 3" },
  };
  const others = () => standards.filter((x) => x.status === "available" && x.id !== std().id);
  const overlays = (): Overlay[] => (s.compare ? others().map((x) => ({ id: x.id, label: x.name, ...OVERLAY_STYLE[x.id] })) : []);
  function otherTargets() {
    const b = band(), mid = (b.low + b.high) / 2;
    return others().map((x) => {
      const p = pickProfile(x, s.sex, s.age, s.life).profile;
      const t = new Map(resolveTargets(p.targets, data.nutrients, mid, weight(), x.id, {}, s.age).map((r) => [r.key, r]));
      return { id: x.id, targets: t, energyMid: (energyFor(p, s.age, s.sex).low + energyFor(p, s.age, s.sex).high) / 2 };
    });
  }
  function withOthers(axis: Axis, key: string, main: number | undefined, bound: "min" | "max", cmp: ReturnType<typeof otherTargets>): Axis {
    if (!main) return axis;
    const o: Record<string, number> = {};
    for (const c of cmp) {
      const v = key === "energy" ? c.energyMid : c.targets.get(key)?.[bound];
      if (v !== undefined && v > 0) o[c.id] = (v / main) * 100;
    }
    return { ...axis, others: o };
  }

  function axesFor(rep: Report, keys: string[]): Axis[] {
    const cmp = otherTargets();
    return keys.map((k) => rep.byKey.get(k)).filter((r): r is Row => !!r && r.pctOfMin !== undefined)
      .map((r) => withOthers({ label: SHORT_LABEL[r.key] ?? r.label, pct: r.pctOfMin!, kind: "min" as const, ok: r.status === "met", detail: `${fmt(r.value)} of ${fmt(r.min)} ${r.unit}` }, r.key, r.min, "min", cmp));
  }

  // Overview laid out like a UK/EU nutrition label (Regulation 1169/2011): energy, fat, saturates,
  // carbohydrate, sugars, fibre, protein, salt. Each is measured against this person's own target where
  // one exists; otherwise against the label's adult reference intake (shown in grey as a reference).
  const ADULT_RI: Record<string, number> = { fat: 70, satfat: 20, carbohydrate: 260, sugars: 90, protein: 50, salt: 6 };
  function overviewAxes(rep: Report): Axis[] {
    const b = band();
    const cmp = otherTargets();
    const e = rep.energy, mid = (b.low + b.high) / 2;
    const axes: Axis[] = [withOthers({ label: "Energy", pct: (e / mid) * 100, kind: "range", ok: e >= b.low && e <= b.high,
      detail: `${fmt(e)} kcal; target range ${fmt(b.low)}–${fmt(b.high)}` }, "energy", mid, "min", cmp)];
    const add = (key: string, label: string) => {
      let r = rep.byKey.get(key);
      if (key === "salt" && r?.max === undefined && rep.byKey.get("sodium")?.max !== undefined) { r = rep.byKey.get("sodium"); label = "Sodium"; }
      if (!r || r.status === "unassessed") return;
      if (r.min !== undefined && r.min > 0) axes.push(withOthers({ label, pct: r.pctOfMin!, kind: "min", ok: r.status === "met", detail: `${fmt(r.value)} of at least ${fmt(r.min)} ${r.unit}` }, r.key, r.min, "min", cmp));
      else if (r.max !== undefined && r.max > 0) axes.push(withOthers({ label, pct: (r.value / r.max) * 100, kind: "max", ok: r.value <= r.max * 1.001, detail: `${fmt(r.value)} of at most ${fmt(r.max)} ${r.unit}` }, r.key, r.max, "max", cmp));
      else if (ADULT_RI[key] && isAdult(s.age)) axes.push({ label, pct: (r.value / ADULT_RI[key]) * 100, kind: "ref", detail: `${fmt(r.value)} g; label reference intake ${ADULT_RI[key]} g for an adult` });
    };
    add("fat", "Fat"); add("satfat", "Saturates"); add("carbohydrate", "Carbs"); add("sugars", "Sugars");
    add("fibre", "Fibre"); add("protein", "Protein"); add("salt", "Salt");
    return axes;
  }

  function sideHtml(rep: Report) {
    const groups = GROUPS.filter((g) => ["vitamins", "minerals", "amino"].includes(g.id)).map((g) => {
      const rs = g.keys.map((k) => rep.byKey.get(k)).filter((r): r is Row => !!r && r.pctOfMin !== undefined);
      if (!rs.length) return "";
      const met = rs.filter((r) => r.status === "met").length;
      return `<li><span class="chip ${met === rs.length ? "met" : "short"}">${met} of ${rs.length}</span> ${esc(g.title)}</li>`;
    }).join("");
    const close = rep.rows.filter((r) => r.max !== undefined && r.status !== "unassessed"
      && !["fat", "satfat", "salt", "sodium"].includes(r.key) && (r.pctOfMax ?? 0) >= 80);
    return `<div class="side sans">
      <ul class="legend">
        <li><span class="sw ring"></span> ${esc(std().name)} target (100%), used for planning</li>
        ${others().map((x) => `<li class="cmp-only"><span class="sw line" style="border-top-color:${OVERLAY_STYLE[x.id].color};border-top-style:${x.id === "us" ? "dotted" : "dashed"}"></span> ${esc(x.name)} target for the same person</li>`).join("")}
        <li><span class="sw dot good"></span> Goal met</li>
        <li><span class="sw dot bad"></span> Goal not met</li>
        <li><span class="sw dot ref"></span> Reference only</li>
      </ul>
      <p class="small muted">≥ aim for at least the target · ≤ stay at or below it.</p>
      <p class="small"><label><input type="checkbox" class="cmp-toggle" ${s.compare ? "checked" : ""} /> Show ${others().map((x) => esc(x.name)).join(" and ")} targets too</label></p>
      ${groups ? `<h4>Vitamins, minerals and protein building blocks</h4><ul class="groups">${groups}</ul><p class="small muted">Open each section below for its own chart.</p>` : ""}
      ${close.length ? `<h4>Close to a safety limit</h4>${close.map((r) => `<div class="limit ${r.status === "over" ? "over" : ""}">${esc(r.label)}: <b>${fmt(r.value)}</b> of max ${fmt(r.max)} ${esc(r.unit)}<div class="lbar"><span style="width:${Math.min(100, r.pctOfMax ?? 0).toFixed(0)}%"></span></div></div>`).join("")}` : ""}
    </div>`;
  }

  function noticesHtml(rep: Report) {
    const short = (k: string) => { const r = rep.byKey.get(k); return r ? r.status === "short" || r.status === "low" : false; };
    const out: string[] = [];
    if (short("vitaminD")) out.push(`<b>Vitamin D:</b> few foods contain much. UK advice is that everyone should consider a 10 µg daily supplement in autumn and winter, and some groups all year round (NHS ${cite("nhs-vitd")}).`);
    if (short("vitaminB12")) out.push(`<b>Vitamin B12:</b> comes almost only from animal foods and fortified products${s.diet === "none" ? "" : ", so a fortified food or supplement may be needed"} (NHS ${cite("nhs-vegan")}).`);
    if ((rep.byKey.get("epaDha")?.value ?? 0) < 250 && rep.byKey.get("epaDha")?.min === undefined) out.push(s.diet === "none"
      ? `<b>Omega-3 EPA and DHA:</b> found mainly in oily fish such as salmon, mackerel and sardines; the NHS advises at least one portion of oily fish a week. Plant omega-3 (ALA) converts to them poorly.`
      : `<b>Omega-3 EPA and DHA:</b> found mainly in oily fish; plant omega-3 (ALA) converts to them poorly. The UK and US set no target; EFSA (EU) advises 250 mg a day ${cite("efsa-2017")}. An algae-based supplement is the vegetarian and vegan source.`);
    if (rep.unassessed.some((r) => r.key === "iodine")) out.push(`<b>Iodine</b> isn't in the food database, so it isn't checked. Milk and yoghurt are the main UK sources; if you use plant drinks, choose one with added iodine (NHS ${cite("nhs-iodine")}).`);
    return out.length ? `<div class="notice small">${out.map((x) => `<p>${x}</p>`).join("")}</div>` : "";
  }

  // Charts can be zoomed to the target; contributions are worked out only when opened.
  const charts = new Map<string, { axes: Axis[]; title: string; zoom: boolean }>();
  const contribs = new Map<string, { items: Item[]; keys: string[] }>();
  let uid = 0;
  function chart(axes: Axis[], title: string) {
    if (axes.length < 3) return "";
    const id = `c${++uid}`;
    charts.set(id, { axes, title, zoom: false });
    const canZoom = scaleMax(axes, 150, overlays()) > 150;
    return `<figure class="chart" data-chart="${id}">${radarSvg(axes, { title, overlays: overlays() })}${canZoom ? `<figcaption><button type="button" class="link small" data-zoom="${id}">Zoom to target</button></figcaption>` : ""}</figure>`;
  }
  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button[data-zoom]") as HTMLButtonElement | null;
    if (!b) return;
    const c = charts.get(b.dataset.zoom!);
    const fig = b.closest("figure");
    if (!c || !fig) return;
    c.zoom = !c.zoom;
    fig.querySelector("svg")!.outerHTML = radarSvg(c.axes, { title: c.title, zoom: c.zoom, overlays: overlays() });
    b.textContent = c.zoom ? "Show full scale" : "Zoom to target";
  });
  // Showing or hiding the other standards redraws every chart on the page.
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.classList.contains("cmp-toggle")) return;
    s.compare = t.checked;
    save();
    root.classList.toggle("no-compare", !s.compare);
    $$<HTMLInputElement>(root, ".cmp-toggle").forEach((x) => (x.checked = s.compare));
    for (const fig of $$(root, "figure[data-chart]")) {
      const c = charts.get(fig.dataset.chart!);
      if (c) fig.querySelector("svg")!.outerHTML = radarSvg(c.axes, { title: c.title, zoom: c.zoom, overlays: overlays() });
    }
  });
  function contribSection(items: Item[], keys: string[], what: string) {
    const id = `k${++uid}`;
    contribs.set(id, { items, keys });
    return `<details data-contrib="${id}"><summary>Which foods provide ${esc(what)}</summary><div class="details-body"></div></details>`;
  }
  root.addEventListener("toggle", (e) => {
    const d = e.target as HTMLDetailsElement;
    if (!d.open || !d.dataset.contrib) return;
    const body = d.querySelector(".details-body")!;
    if (body.childElementCount) return;          // already worked out
    const c = contribs.get(d.dataset.contrib);
    if (c) body.innerHTML = contribTable(c.items, c.keys);
  }, true);
  function contribTable(items: Item[], keys: string[]) {
    // D2 and D3 are recorded for too few foods to split the total fairly.
    const ks = keys.filter((k) => !["vitaminD2", "vitaminD3"].includes(k) && meta.has(k) && items.some((it) => (it.food.per100g[k] ?? 0) > 0));
    if (!ks.length) return `<p class="small sans">No values to show.</p>`;
    const amount = (it: Item, k: string) => ((it.food.per100g[k] ?? 0) * it.grams) / 100;
    return `<p class="small sans">Share of the day's total that each food provides.</p><div class="table-scroll"><table class="contrib"><thead><tr><th>Nutrient</th>${items.map((it) => `<th class="num">${esc(it.food.name)}</th>`).join("")}</tr></thead><tbody>${
      ks.map((k) => {
        const total = items.reduce((a, it) => a + amount(it, k), 0);
        return `<tr><td>${esc(meta.get(k)!.label)}</td>${items.map((it) => {
          const share = total > 0 ? (amount(it, k) / total) * 100 : 0;
          return `<td class="num"><span class="share" style="--w:${share.toFixed(0)}%">${share >= 0.5 ? Math.round(share) + "%" : "–"}</span></td>`;
        }).join("")}</tr>`;
      }).join("")
    }</tbody></table></div>`;
  }

  function reportHtml(rep: Report, items: Item[]) {
    const shortTxt = rep.shortfalls.length
      ? `Short on ${rep.shortfalls.slice(0, 5).map((r) => `${esc(r.label)} (${Math.round(r.pctOfMin!)}%)`).join(", ")}${rep.shortfalls.length > 5 ? ` and ${rep.shortfalls.length - 5} more` : ""}.`
      : "Every checked minimum is met.";
    const over = rep.rows.filter((r) => r.status === "over");
    const custom = rep.rows.some((r) => r.custom) || s.energyLow !== null || s.energyHigh !== null;
    const detail = (id: string) => {
      const g = GROUPS.find((x) => x.id === id)!;
      const rows = rep.rows.filter((r) => g.keys.includes(r.key) && (r.min !== undefined || r.max !== undefined || id === "fats"));
      if (id === "fats" && !rows.some((r) => r.min !== undefined)) return "";
      if (!rows.length) return id === "amino" ? `<details><summary>${esc(g.title)}</summary><div class="details-body"><p class="small sans">Amino acid targets are given for adults only.</p></div></details>` : "";
      const axes = axesFor(rep, g.keys);
      const met = rows.filter((r) => r.status === "met").length, mins = rows.filter((r) => r.pctOfMin !== undefined).length;
      return `<details><summary>${esc(g.title)} <span class="summary-note">${mins ? `${met} of ${mins} met` : `${rows.length} values`}</span></summary><div class="details-body">
        ${chart(axes, `${g.title}: share of each target reached`)}
        ${id === "vitamins" ? `<p class="small sans muted">Vitamin D targets cover all vitamin D from food (D2 and D3 together). The difference matters mainly for supplements, where D3 raises blood levels more effectively. B5 (pantothenic acid) has a US target only; biotin (B7) isn't shown because the food data rarely includes it.</p>` : ""}
        ${tableHtml(rows)}
        ${contribSection(items, g.keys, g.id === "amino" ? "these amino acids" : `these ${g.title.toLowerCase()}`)}</div></details>`;
    };
    const notChecked = rep.unassessed.length ? ` Not checked (no food data): ${rep.unassessed.map((r) => esc(r.label)).join(", ")}.` : "";
    return `<p class="headline"><b>${rep.metCount} of ${rep.minCount}</b> checked targets met · <b>${fmt(rep.energy)}</b> kcal. ${shortTxt}${notChecked}
        ${over.length ? ` <span class="chip over">Over the limit for ${over.map((r) => esc(r.label)).join(", ")}</span>` : ""}</p>
      ${custom ? `<p class="small muted sans">Using some custom targets.</p>` : ""}
      <h4 class="chart-title">At a glance <span class="muted small">(laid out like a food label)</span></h4>
      <div class="charts">${chart(overviewAxes(rep), "Overview: energy, fat, saturates, carbohydrate, sugars, fibre, protein and salt as a share of target")}${sideHtml(rep)}</div>
      ${contribSection(items, ["energy", "fat", "satfat", "carbohydrate", "sugars", "fibre", "protein", "salt"], "energy, fat, carbs, fibre, protein and salt")}
      ${noticesHtml(rep)}
      ${detail("vitamins")}${detail("minerals")}${detail("amino")}${detail("fats")}
      <details><summary>All values <span class="summary-note">including fats and values without targets</span></summary><div class="details-body">${tableHtml(rep.rows.filter((r) => r.key !== "energy"))}</div></details>`;
  }

  // ---------- 3a. Suggest
  const results = $(root, "#results");
  const status = $(root, "#status");
  const runBtn = $<HTMLButtonElement>(root, "#run");
  const nIn = $<HTMLInputElement>(root, "#n");
  const optIn = $<HTMLInputElement>(root, "#options");
  let lastPlans: Plan[] = [];
  function markStale() {
    if (results.childElementCount && !results.querySelector(".stale")) {
      results.insertAdjacentHTML("afterbegin", `<p class="notice info stale">Settings changed. Press "Find combinations" to update these suggestions.</p>`);
    }
  }
  nIn.addEventListener("change", () => { s.n = Math.min(15, Math.max(1, Math.round(Number(nIn.value) || DEFAULTS.n))); nIn.value = String(s.n); save(); markStale(); });
  optIn.addEventListener("change", () => { s.options = Math.min(5, Math.max(1, Math.round(Number(optIn.value) || DEFAULTS.options))); optIn.value = String(s.options); save(); });

  let worker: Worker | null = null;
  runBtn.addEventListener("click", () => {
    worker?.terminate();
    const foods = selectedFoods();
    const current = resolve(true);
    const { assessable } = splitAssessable(current, foods);
    const b = band();
    if (!foods.length) { results.innerHTML = `<p class="notice bad">No foods are switched on. Open "Choose foods" above to pick some.</p>`; return; }
    if (b.low > b.high) { results.innerHTML = `<p class="notice bad">The lower calorie value is higher than the upper one.</p>`; return; }
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    runBtn.disabled = true;
    lastPlans = [];
    results.innerHTML = CAVEAT;
    status.textContent = `Finding option 1 of ${s.options}…`;
    worker.onmessage = (m) => {
      const d = m.data;
      if (d.type === "plan") {
        lastPlans.push(d.plan);
        const k = lastPlans.length;
        const items = (d.plan as Plan).items.map((i) => ({ food: foodById.get(i.id)!, grams: i.grams }));
        const notes = items.map((i) => i.food.notes).filter(Boolean) as string[];
        results.insertAdjacentHTML("beforeend", `<article class="result">
          <h3><span>Option ${k}</span><span class="result-actions"><button type="button" class="small" data-edit="${k - 1}">Adjust in builder</button></span></h3>
          <ul class="ingredients">${items.map((i) => `<li><b>${esc(i.food.name)}</b> · ${esc(describeAmount(i.food, i.grams))}</li>`).join("")}</ul>
          ${reportHtml(report(items), items)}
          ${notes.length ? `<p class="small muted sans">${notes.map(esc).join(" ")}</p>` : ""}
        </article>`);
        status.textContent = k < s.options ? `Finding option ${k + 1} of ${s.options}…` : "";
      } else {
        runBtn.disabled = false;
        status.textContent = "";
        if (d.type === "error") results.insertAdjacentHTML("beforeend", `<p class="notice bad">Something went wrong: ${esc(d.message)}</p>`);
        else if (!lastPlans.length) results.insertAdjacentHTML("beforeend", `<p class="notice bad">No combination fits all the limits. Try allowing more foods, widening the calorie range, or switching more foods on.</p>`);
        else if (lastPlans.length < s.options) results.insertAdjacentHTML("beforeend", `<p class="small muted sans">Only ${lastPlans.length} distinct option${lastPlans.length > 1 ? "s" : ""} could be found with these settings.</p>`);
        worker?.terminate(); worker = null;
      }
    };
    worker.postMessage({
      input: { foods, targets: assessable, energyLow: b.low, energyHigh: b.high, maxIngredients: s.n, options: s.options },
      keys: ORDER,
    });
  });
  results.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button[data-edit]") as HTMLButtonElement | null;
    if (!btn) return;
    const p = lastPlans[Number(btn.dataset.edit)];
    s.builder = p.items.map((i) => ({ id: i.id, grams: i.grams }));
    setMode("build");
    $(root, "#h-plan").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ---------- 3b. Build my own
  const addSearch = $<HTMLInputElement>(root, "#addSearch");
  const addList = $<HTMLUListElement>(root, "#addList");
  const builderList = $(root, "#builderList");
  const builderResult = $(root, "#builderResult");
  let addHits: PlannerFood[] = [];
  let addActive = -1;

  const unitAmount = (f: PlannerFood, grams: number) => (f.unit === "g" ? grams : grams / f.unitGrams);
  const unitLabel = (f: PlannerFood) => (f.unit === "g" ? "g" : `${f.unit}${f.unit.endsWith("h") ? "es" : "s"}`);

  function renderBuilder() {
    const items = s.builder.map((b) => ({ food: foodById.get(b.id), grams: b.grams })).filter((x): x is { food: PlannerFood; grams: number } => !!x.food);
    if (!items.length) {
      builderList.innerHTML = `<p class="small muted sans">No foods yet. Search above to add one, or press "Adjust in builder" on a suggested option.</p>`;
      builderResult.innerHTML = "";
      return;
    }
    builderList.innerHTML = `<div class="table-scroll builder-table"><table><thead><tr><th>Food</th><th>Amount</th><th class="num">kcal</th><th class="num">Protein</th><th></th></tr></thead><tbody>${
      items.map((it, i) => `<tr><td>${esc(it.food.name)}</td>
        <td><span class="amt"><input type="number" min="0" step="${it.food.unit === "g" ? 5 : 0.5}" data-row="${i}" value="${Math.round(unitAmount(it.food, it.grams) * 10) / 10}" aria-label="Amount of ${esc(it.food.name)}" /> ${esc(unitLabel(it.food))}${it.food.unit !== "g" ? ` <span class="muted small">(${Math.round(it.grams)} g)</span>` : ""}</span></td>
        <td class="num">${fmt(((it.food.per100g.energy ?? 0) * it.grams) / 100)}</td>
        <td class="num">${fmt(((it.food.per100g.protein ?? 0) * it.grams) / 100)} g</td>
        <td><button type="button" class="link" data-remove="${i}" aria-label="Remove ${esc(it.food.name)}">Remove</button></td></tr>`).join("")
    }</tbody></table></div><p class="sans small"><button type="button" class="link" id="clearBuilder">Clear all</button></p>`;
    renderBuilderResult(items);
  }
  function renderBuilderResult(items = s.builder.map((b) => ({ food: foodById.get(b.id)!, grams: b.grams })).filter((x) => x.food)) {
    builderResult.innerHTML = items.length ? `${CAVEAT}<article class="result"><h3><span>Your day</span></h3>${reportHtml(report(items), items)}</article>` : "";
  }
  builderList.addEventListener("input", (e) => {
    const inp = e.target as HTMLInputElement;
    if (inp.dataset.row === undefined) return;
    const i = Number(inp.dataset.row);
    const f = foodById.get(s.builder[i].id)!;
    const v = Math.max(0, Number(inp.value) || 0);
    s.builder[i].grams = f.unit === "g" ? v : v * f.unitGrams;
    const row = inp.closest("tr")!;
    row.children[2].textContent = fmt(((f.per100g.energy ?? 0) * s.builder[i].grams) / 100);
    row.children[3].textContent = `${fmt(((f.per100g.protein ?? 0) * s.builder[i].grams) / 100)} g`;
    save();
    renderBuilderResult();
  });
  builderList.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.dataset.remove !== undefined) { s.builder.splice(Number(t.dataset.remove), 1); save(); renderBuilder(); }
    if (t.id === "clearBuilder") { s.builder = []; save(); renderBuilder(); }
  });

  function showAddList() {
    const q = addSearch.value.trim();
    addHits = q.length < 2 ? [] : dietFoods().filter((f) => matches(f, q))
      .sort((a, b) => Number(b.common) - Number(a.common) || a.name.length - b.name.length).slice(0, 40);
    addActive = -1;
    addList.innerHTML = addHits.map((f, i) => `<li role="option" id="add-${i}" data-i="${i}">${esc(f.name)}${f.common ? ' <span class="tag">common</span>' : ""}<span class="path">${esc(catName.get(f.cat) ?? "")} › ${esc(f.group)}</span></li>`).join("")
      || (q.length >= 2 ? `<li aria-disabled="true">No matches</li>` : "");
    addList.hidden = !addList.childElementCount;
    addSearch.setAttribute("aria-expanded", String(!addList.hidden));
  }
  function addFood(f: PlannerFood) {
    const grams = f.unit === "g" ? Math.min(100, f.maxGrams) : f.unitGrams;
    const existing = s.builder.find((b) => b.id === f.id);
    if (existing) existing.grams += grams; else s.builder.push({ id: f.id, grams });
    addSearch.value = "";
    addList.hidden = true;
    addSearch.setAttribute("aria-expanded", "false");
    save();
    renderBuilder();
    addSearch.focus();
  }
  addSearch.addEventListener("input", showAddList);
  addSearch.addEventListener("keydown", (e) => {
    if (addList.hidden || !addHits.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      addActive = (addActive + (e.key === "ArrowDown" ? 1 : -1) + addHits.length) % addHits.length;
      $$(addList, "li").forEach((li, i) => li.setAttribute("aria-selected", String(i === addActive)));
      addSearch.setAttribute("aria-activedescendant", `add-${addActive}`);
      addList.children[addActive]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      addFood(addHits[Math.max(0, addActive)]);
    } else if (e.key === "Escape") { addList.hidden = true; }
  });
  addList.addEventListener("mousedown", (e) => {
    const li = (e.target as HTMLElement).closest("li[data-i]") as HTMLElement | null;
    if (li) { e.preventDefault(); addFood(addHits[Number(li.dataset.i)]); }
  });
  addSearch.addEventListener("blur", () => setTimeout(() => (addList.hidden = true), 150));

  // ---------- mode
  function setMode(m: Settings["mode"]) {
    s.mode = m;
    $$<HTMLInputElement>(root, 'input[name="mode"]').forEach((r) => (r.checked = r.value === m));
    $(root, "#suggestPane").hidden = m !== "suggest";
    $(root, "#buildPane").hidden = m !== "build";
    if (m === "build") renderBuilder();
    save();
  }
  $$<HTMLInputElement>(root, 'input[name="mode"]').forEach((r) => r.addEventListener("change", () => setMode(r.value as Settings["mode"])));

  // ---------- share / remember
  $(root, "#copyLink").addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    try { await navigator.clipboard.writeText(location.href); btn.textContent = "Link copied"; }
    catch { window.prompt("Copy this link:", location.href); }
    setTimeout(() => (btn.textContent = "Copy link"), 2000);
  });
  $(root, "#exportBtn").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(exportFile(s));
    a.download = "nutrient-planner-settings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $<HTMLInputElement>(root, "#importFile").addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try { s = await importFile(file); toggled = new Set(s.toggled); init(); }
    catch (err) { alert(err instanceof Error ? err.message : "Couldn't read that file."); }
    (e.target as HTMLInputElement).value = "";
  });
  rememberBox.addEventListener("change", () => { if (rememberBox.checked) remember(s); else forget(); });
  $(root, "#forgetBtn").addEventListener("click", () => { forget(); rememberBox.checked = false; });
  const refreshUrl = root.dataset.refreshUrl;
  $(root, "#dataInfo").innerHTML = `Food data: USDA FoodData Central, snapshot from ${esc(data.generated ?? "unknown date")} (${data.foods.length.toLocaleString("en-GB")} foods). `
    + (refreshUrl ? `<a href="${esc(refreshUrl)}">Request a data refresh</a> (allowed once every 3 months). ` : "")
    + `<a href="${esc(root.dataset.methodsUrl)}">Methods and sources</a>`;

  function init() {
    root.classList.toggle("no-compare", !s.compare);
    nIn.value = String(s.n);
    optIn.value = String(s.options);
    renderYou();
    renderFoodSummary();
    if (tree.childElementCount) renderTree();
    results.innerHTML = "";
    setMode(s.mode);
  }
  init();
}
