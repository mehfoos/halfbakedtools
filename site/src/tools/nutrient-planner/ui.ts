// Nutrient planner user interface. Everything runs in the browser; the only
// network requests are for the site's own data files.
import {
  resolveTargets, splitAssessable,
  type Food, type NutrientDef, type Plan, type ResolvedTarget, type TargetSpec,
} from "./solver.ts";
import { DEFAULTS, decode, encode, exportFile, forget, importFile, loadRemembered, remember, type Settings } from "./state.ts";

type Profile = {
  id: string; stage: string; group: string; label: string;
  energy: { kcal: number; low: number; high: number; note: string };
  defaultWeightKg: number;
  targets: Record<string, TargetSpec>;
};
type Standard = {
  id: string; name: string; longName: string; status: string;
  sources: { id: string; title: string; url: string }[];
  notes: string[]; profiles: Profile[];
};
type FoodsFile = { missing?: boolean; generated?: string; foods: Food[]; nutrients: NutrientDef[] };

const STAGE_LABELS: Record<string, string> = {
  child: "Children", male: "Males", female: "Females", pregnancy: "Pregnancy", lactation: "Breastfeeding",
};
const NHS_VITD = "https://www.nhs.uk/conditions/vitamins-and-minerals/vitamin-d/";
const NHS_VEGAN = "https://www.nhs.uk/live-well/eat-well/how-to-eat-a-balanced-diet/the-vegan-diet/";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (v: number | undefined) => {
  if (v === undefined || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 100) return Math.round(v).toLocaleString("en-GB");
  if (a >= 10) return v.toFixed(1).replace(/\.0$/, "");
  if (a >= 1) return v.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  return Number(v.toPrecision(2)).toString();
};
const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

export async function start(root: HTMLElement) {
  const base = root.dataset.base ?? "/";
  const loading = $(root, "#loading");
  let foodsFile: FoodsFile;
  const standards: Standard[] = [];
  let meta: Record<string, unknown> = {};
  try {
    const get = (f: string) => fetch(`${base}data/${f}`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
    [foodsFile, meta] = await Promise.all([get("foods.json"), get("meta.json")]);
    for (const id of ["uk", "us", "eu"]) standards.push(await get(`targets-${id}.json`));
  } catch {
    loading.textContent = "Sorry, the planner's data couldn't be loaded. Please try again later.";
    return;
  }
  if (foodsFile.missing || !foodsFile.foods.length) {
    loading.innerHTML = `<span class="notice">The food data snapshot hasn't been built yet. It's created by the repository's "Refresh food data" workflow.</span>`;
    return;
  }
  loading.remove();

  const nutrients = foodsFile.nutrients;
  // Display order: energy and macros, then vitamins, minerals, amino acids.
  const ORDER = ["protein", "fat", "satfat", "carbohydrate", "fibre", "salt", "sodium", "la", "ala",
    "vitaminA", "retinol", "vitaminD", "vitaminE", "vitaminK", "vitaminC", "thiamin", "riboflavin", "niacinNE",
    "vitaminB6", "folate", "vitaminB12", "choline", "calcium", "iron", "magnesium", "phosphorus", "potassium",
    "zinc", "copper", "manganese", "selenium", "iodine", "histidine", "isoleucine", "leucine", "lysine",
    "metCys", "pheTyr", "threonine", "tryptophan", "valine"];
  const nutrientOrder = new Map(ORDER.map((k, i) => [k, i]));
  const form = $<HTMLFormElement>(root, "#settings");
  const results = $(root, "#results");
  const status = $(root, "#status");
  form.hidden = false;
  $(root, "#share").hidden = false;

  // ---------- initial settings: page address, then (opt-in) remembered, then defaults
  const rememberBox = $<HTMLInputElement>(root, "#rememberBox");
  let s: Settings;
  const remembered = loadRemembered();
  if (location.search.length > 1) s = decode(location.search);
  else if (remembered) s = remembered;
  else s = { ...DEFAULTS, excluded: [], overrides: {} };
  rememberBox.checked = !!remembered;

  const standard = () => standards.find((x) => x.id === s.standard && x.status === "available") ?? standards[0];
  const profile = () => standard().profiles.find((p) => p.id === s.profile) ?? standard().profiles.find((p) => p.stage === "female") ?? standard().profiles[0];
  const weight = () => s.weight ?? profile().defaultWeightKg;
  const energyBand = () => ({ low: s.energyLow ?? profile().energy.low, high: s.energyHigh ?? profile().energy.high });
  const officialTargets = () => {
    const b = energyBand();
    return resolveTargets(profile().targets, nutrients, (b.low + b.high) / 2, weight(), standard().id);
  };
  const currentTargets = () => {
    const b = energyBand();
    return resolveTargets(profile().targets, nutrients, (b.low + b.high) / 2, weight(), standard().id, s.overrides)
      .sort((a, z) => (nutrientOrder.get(a.key) ?? 99) - (nutrientOrder.get(z.key) ?? 99));
  };
  const availableFoods = () => foodsFile.foods.filter((f) => s.diet === "vegetarian" || f.diet === "vegan");

  // ---------- controls
  const el = {
    standard: $<HTMLSelectElement>(root, "#standard"),
    profile: $<HTMLSelectElement>(root, "#profile"),
    diet: $<HTMLSelectElement>(root, "#diet"),
    n: $<HTMLInputElement>(root, "#n"),
    options: $<HTMLInputElement>(root, "#options"),
    weight: $<HTMLInputElement>(root, "#weight"),
    energyLow: $<HTMLInputElement>(root, "#energyLow"),
    energyHigh: $<HTMLInputElement>(root, "#energyHigh"),
  };
  el.standard.innerHTML = standards.map((st) =>
    `<option value="${st.id}" ${st.status !== "available" ? "disabled" : ""}>${esc(st.longName)}${st.status !== "available" ? " (coming soon)" : ""}</option>`).join("");

  function renderProfiles() {
    const groups = new Map<string, Profile[]>();
    for (const p of standard().profiles) groups.set(p.stage, [...(groups.get(p.stage) ?? []), p]);
    el.profile.innerHTML = [...groups].map(([stage, ps]) =>
      `<optgroup label="${esc(STAGE_LABELS[stage] ?? stage)}">${ps.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join("")}</optgroup>`).join("");
  }

  function syncControls() {
    s.standard = standard().id;
    renderProfiles();
    s.profile = profile().id;
    el.standard.value = s.standard;
    el.profile.value = s.profile;
    el.diet.value = s.diet;
    el.n.value = String(s.n);
    el.options.value = String(s.options);
    el.weight.value = String(weight());
    const b = energyBand();
    el.energyLow.value = String(b.low);
    el.energyHigh.value = String(b.high);
    $(root, "#energyNote").textContent = `Recommended: ${profile().energy.low}–${profile().energy.high} kcal. ${profile().energy.note}`;
    const energyCustom = s.energyLow !== null || s.energyHigh !== null;
    $(root, "#energyCustom").hidden = !energyCustom;
    $(root, "#energyReset").hidden = !energyCustom;
    renderTargets();
    renderFoods();
  }

  function renderTargets() {
    const official = new Map(officialTargets().map((t) => [t.key, t]));
    const current = currentTargets();
    const customCount = current.filter((t) => t.custom).length;
    $(root, "#customBanner").hidden = customCount === 0;
    $(root, "#targetsSummary").textContent = `(${current.length} nutrients${customCount ? `, ${customCount} custom` : ""})`;
    const input = (t: ResolvedTarget, bound: "min" | "max") => {
      const o = s.overrides[t.key]?.[bound];
      const off = official.get(t.key)?.[bound];
      return `<input type="number" step="any" min="0" data-key="${t.key}" data-bound="${bound}" aria-label="${esc(t.label)} ${bound === "min" ? "minimum" : "maximum"}"
        value="${o !== undefined && o !== null ? o : ""}" placeholder="${off !== undefined ? fmt(off) : "none"}" />`;
    };
    $(root, "#targetsTable").innerHTML = `<thead><tr><th>Nutrient</th><th class="num">Official min</th><th class="num">Official max</th><th>Your min</th><th>Your max</th></tr></thead><tbody>${
      current.map((t) => {
        const off = official.get(t.key);
        return `<tr><td>${esc(t.label)} <span class="muted small">${esc(t.unit)}</span>${t.custom ? '<span class="badge">custom</span>' : ""}</td>
          <td class="num">${fmt(off?.min)}</td><td class="num">${fmt(off?.max)}</td>
          <td>${input(t, "min")}</td><td>${input(t, "max")}</td></tr>`;
      }).join("")}</tbody>`;
  }

  function renderFoods() {
    const foods = availableFoods();
    const groups = new Map<string, Food[]>();
    for (const f of foods) groups.set(f.group, [...(groups.get(f.group) ?? []), f]);
    $(root, "#foodsList").innerHTML = [...groups].map(([g, fs]) =>
      `<h4>${esc(g)}</h4>` + fs.map((f) =>
        `<label class="check"><input type="checkbox" data-food="${f.id}" ${s.excluded.includes(f.id) ? "" : "checked"} /> ${esc(f.name)}</label>`).join("")).join("");
    const on = foods.filter((f) => !s.excluded.includes(f.id)).length;
    $(root, "#foodsSummary").textContent = `(${on} of ${foods.length} selected)`;
  }

  function saveState() {
    history.replaceState(null, "", `?${encode(s)}`);
    if (rememberBox.checked) remember(s);
  }

  function changed() {
    saveState();
    syncControls();
    if (results.childElementCount) {
      results.innerHTML = `<p class="notice info">Settings changed. Press "Find combinations" to update the results.</p>`;
    }
  }

  const numOrNull = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

  el.standard.addEventListener("change", () => { s.standard = el.standard.value; s.overrides = {}; s.energyLow = s.energyHigh = null; changed(); });
  el.profile.addEventListener("change", () => { s.profile = el.profile.value; s.energyLow = s.energyHigh = null; s.weight = null; changed(); });
  el.diet.addEventListener("change", () => { s.diet = el.diet.value as Settings["diet"]; changed(); });
  el.n.addEventListener("change", () => { s.n = Math.min(15, Math.max(1, Math.round(Number(el.n.value) || DEFAULTS.n))); changed(); });
  el.options.addEventListener("change", () => { s.options = Math.min(5, Math.max(1, Math.round(Number(el.options.value) || DEFAULTS.options))); changed(); });
  el.weight.addEventListener("change", () => {
    const w = numOrNull(el.weight.value);
    s.weight = w === null || w === profile().defaultWeightKg ? null : Math.min(300, Math.max(10, Math.round(w)));
    changed();
  });
  for (const k of ["energyLow", "energyHigh"] as const) {
    el[k].addEventListener("change", () => {
      const v = numOrNull(el[k].value);
      const rec = profile().energy[k === "energyLow" ? "low" : "high"];
      s[k] = v === null || v === rec ? null : Math.min(6000, Math.max(300, Math.round(v)));
      changed();
    });
  }
  $(root, "#energyReset").addEventListener("click", () => { s.energyLow = s.energyHigh = null; changed(); });
  $(root, "#resetTargets").addEventListener("click", () => { s.overrides = {}; changed(); });
  $(root, "#targetsTable").addEventListener("change", (e) => {
    const inp = e.target as HTMLInputElement;
    const key = inp.dataset.key!, bound = inp.dataset.bound as "min" | "max";
    const v = numOrNull(inp.value);
    const o = { ...(s.overrides[key] ?? {}) };
    if (v === null) delete o[bound]; else o[bound] = v;
    if (Object.keys(o).length) s.overrides[key] = o; else delete s.overrides[key];
    changed();
  });
  $(root, "#foodsList").addEventListener("change", (e) => {
    const id = (e.target as HTMLInputElement).dataset.food!;
    s.excluded = (e.target as HTMLInputElement).checked ? s.excluded.filter((x) => x !== id) : [...s.excluded, id];
    changed();
  });

  // ---------- share / remember
  $(root, "#copyLink").addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    try { await navigator.clipboard.writeText(location.href); btn.textContent = "Link copied"; }
    catch { prompt("Copy this link:", location.href); }
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
    try { s = await importFile(file); changed(); }
    catch (err) { alert(err instanceof Error ? err.message : "Couldn't read that file."); }
    (e.target as HTMLInputElement).value = "";
  });
  rememberBox.addEventListener("change", () => { if (rememberBox.checked) remember(s); else forget(); });
  $(root, "#forgetBtn").addEventListener("click", () => { forget(); rememberBox.checked = false; });

  const refreshUrl = root.dataset.refreshUrl;
  $(root, "#dataInfo").innerHTML = `Food data: USDA FoodData Central snapshot from ${esc(foodsFile.generated ?? meta.foodsLastUpdated ?? "unknown date")}. ` +
    (refreshUrl ? `<a href="${esc(refreshUrl)}">Request a data refresh</a> (allowed once every 3 months). ` : "") +
    `<a href="${esc(root.dataset.methodsUrl)}">Methods and sources</a>`;

  // ---------- run the optimiser in a worker
  let worker: Worker | null = null;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    worker?.terminate();
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const foods = availableFoods().filter((f) => !s.excluded.includes(f.id));
    const targets = currentTargets();
    const { assessable, notAssessed } = splitAssessable(targets, foods);
    const band = energyBand();
    const runBtn = $<HTMLButtonElement>(root, "#run");
    if (!foods.length) { results.innerHTML = `<p class="notice bad">Select at least one food.</p>`; return; }
    if (band.low > band.high) { results.innerHTML = `<p class="notice bad">The lower calorie value is higher than the upper one.</p>`; return; }

    runBtn.disabled = true;
    const plans: Plan[] = [];
    status.textContent = `Finding option 1 of ${s.options}…`;
    results.innerHTML = headerHtml(targets, notAssessed);
    worker.onmessage = (m) => {
      const d = m.data;
      if (d.type === "plan") {
        plans.push(d.plan);
        results.insertAdjacentHTML("beforeend", planHtml(d.plan, plans.length, assessable, foods));
        status.textContent = plans.length < s.options ? `Finding option ${plans.length + 1} of ${s.options}…` : "";
      } else {
        runBtn.disabled = false;
        status.textContent = "";
        if (d.type === "error") results.insertAdjacentHTML("beforeend", `<p class="notice bad">Something went wrong: ${esc(d.message)}</p>`);
        else if (!plans.length) results.insertAdjacentHTML("beforeend",
          `<p class="notice bad">No combination fits all the limits. Try allowing more ingredients, widening the calorie range, or selecting more foods.</p>`);
        else if (plans.length < s.options) results.insertAdjacentHTML("beforeend",
          `<p class="muted small">Only ${plans.length} distinct option${plans.length > 1 ? "s" : ""} could be found with these settings.</p>`);
        worker?.terminate(); worker = null;
      }
    };
    worker.postMessage({
      input: { foods, targets: assessable, energyLow: band.low, energyHigh: band.high, maxIngredients: s.n, options: s.options },
      keys: nutrients.map((n) => n.key),
    });
  });

  function headerHtml(targets: ResolvedTarget[], notAssessed: ResolvedTarget[]) {
    const custom = targets.some((t) => t.custom) || s.energyLow !== null || s.energyHigh !== null;
    let h = custom ? `<p class="notice">These results use custom targets that differ from the official ${esc(standard().name)} recommendations for ${esc(profile().label.toLowerCase())}.</p>` : "";
    if (notAssessed.length) {
      h += `<p class="notice info small"><strong>Not assessed:</strong> ${notAssessed.map((t) => esc(t.label)).join(", ")}. The food database has no values for these in most foods, so the planner can't check them.` +
        (notAssessed.some((t) => t.key === "iodine") ? ` For iodine, milk and yoghurt are the main UK sources; if you use plant drinks, choose one fortified with iodine.` : "") + `</p>`;
    }
    return h;
  }

  function planHtml(p: Plan, k: number, targets: ResolvedTarget[], foods: Food[]) {
    const mins = targets.filter((t) => t.min && t.min > 0);
    const met = mins.filter((t) => (p.totals[t.key] ?? 0) >= t.min! * 0.999).length;
    const avg = mins.length ? mins.reduce((a, t) => a + Math.min(1, (p.totals[t.key] ?? 0) / t.min!), 0) / mins.length : 1;
    const foodById = new Map(foods.map((f) => [f.id, f]));
    const rows = targets.map((t) => {
      const v = p.totals[t.key] ?? 0;
      let chip = "", pct = 100, cls = "";
      if (t.min && t.min > 0) {
        pct = (v / t.min) * 100;
        cls = pct >= 99.9 ? "met" : pct >= 66 ? "short" : "low";
        chip = `<span class="chip ${cls}">${pct >= 99.9 ? "met" : Math.round(pct) + "%"}</span>`;
      } else {
        chip = `<span class="chip limit">within limit</span>`;
      }
      const range = [t.min !== undefined ? `≥ ${fmt(t.min)}` : "", t.max !== undefined ? `≤ ${fmt(t.max)}` : ""].filter(Boolean).join(", ");
      return `<tr><td>${esc(t.label)}${t.custom ? '<span class="badge">custom</span>' : ""}</td>
        <td class="num">${fmt(v)} <span class="muted small">${esc(t.unit)}</span></td>
        <td class="num muted">${range}</td>
        <td style="width:22%">${t.min ? `<div class="bar"><span class="${cls === "met" ? "" : cls}" style="width:${Math.min(100, pct).toFixed(0)}%"></span></div>` : ""}</td>
        <td>${chip}</td></tr>`;
    }).join("");

    const notes = p.items.map((i) => foodById.get(i.id)?.notes).filter(Boolean) as string[];
    return `<article class="card plan">
      <h2>Option ${k}</h2>
      <p class="score"><strong>${met} of ${mins.length}</strong> minimum targets met · average coverage <strong>${Math.round(avg * 100)}%</strong> · ${fmt(p.energy)} kcal</p>
      <ul class="ingredients">${p.items.map((i) => `<li><strong>${esc(i.name)}</strong>${esc(i.amountLabel)}</li>`).join("")}</ul>
      ${noticesHtml(p, targets)}
      ${notes.length ? `<p class="small muted">${notes.map(esc).join(" ")}</p>` : ""}
      <details><summary>Nutrient breakdown</summary>
        <div class="table-scroll"><table><thead><tr><th>Nutrient</th><th class="num">Amount</th><th class="num">Target</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      </details>
    </article>`;
  }

  function noticesHtml(p: Plan, targets: ResolvedTarget[]) {
    const short = (key: string) => {
      const t = targets.find((x) => x.key === key);
      return t?.min ? (p.totals[key] ?? 0) < t.min * 0.999 : false;
    };
    const out: string[] = [];
    if (short("vitaminD")) out.push(`<strong>Vitamin D:</strong> very few foods contain much. UK advice is that everyone should consider a 10 µg daily supplement in autumn and winter, and some groups all year round (<a href="${NHS_VITD}">NHS</a>).`);
    if (short("vitaminB12")) out.push(`<strong>Vitamin B12:</strong> this combination falls short. B12 comes almost only from animal foods and fortified products, so a fortified food or supplement may be needed (<a href="${NHS_VEGAN}">NHS</a>).`);
    if ((p.totals.epaDha ?? 0) < 250) out.push(`<strong>Omega-3 EPA and DHA:</strong> these come mainly from oily fish; plant omega-3 (ALA) converts to them poorly. There's no official UK or US target, but an algae-based omega-3 supplement is the vegetarian and vegan source.`);
    return out.length ? `<div class="notice small">${out.map((x) => `<p>${x}</p>`).join("")}</div>` : "";
  }

  syncControls();
  saveState();
}
