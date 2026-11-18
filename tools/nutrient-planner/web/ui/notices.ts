// The advice and caveats shown with a day's results. Each statement of fact carries its reference.
import type { Report } from "../analysis.ts";
import { avoidReasons, blendValues, type PlannerFood } from "../foods.ts";
import type { App, Item } from "./app.ts";
import { cite } from "./app.ts";
import { esc, fmt } from "./dom.ts";
import { caveat, KINDS, type CaveatKind } from "../../../../site/src/lib/caveats.ts";

/** Shown above every set of results: which table the values come from, and how it defines nutrients differently. */
export function dataCaveat(app: App) {
  const t = app.table();
  const from = !t ? "food composition tables"
    : app.s.source === "blend" ? `the USDA table ${cite("usda-sr")}, with the beta blend of USDA and UK CoFID ${cite("cofid-2021")} for some foods`
    : `${esc(t.title)} ${t.refs[0] ? cite(t.refs[0]) : ""}`;
  const est = caveat("estimate", `Results use average food composition from ${from}, so real foods vary with brand, variety and cooking. Nutrients the table doesn't give are shown as not available, never as zero. They also don't yet allow for how well the body absorbs each nutrient (for example, iron from plants is absorbed less well than iron from meat).`);
  // A table other than USDA: say where its definitions differ, because the targets may define a nutrient another way.
  const defs = app.data.definitions ?? {};
  const keys = app.s.source === "blend" || app.data.table === "usda" ? [] : Object.keys(defs).filter((k) => app.nutrientMeta.has(k));
  if (!keys.length) return est;
  return est + caveat("assumption", `${esc(t?.tag ?? "This table")}'s values are shown as the table publishes them, and compared with the targets without conversion. Where the table defines a nutrient differently from the target's definition, the comparison is approximate. The table's definitions: ${keys.map((k) => `${esc(app.nutrientMeta.get(k)!.label)}: ${esc(defs[k])}`).join("; ")}.`);
}

/** Notices about nutrients that food data or food alone handles poorly: vitamin D, B12, EPA/DHA, iodine. */
export function nutrientNotices(app: App, rep: Report) {
  const s = app.s;
  const short = (k: string) => { const r = rep.byKey.get(k); return r ? ["short", "low", "unclear", "na"].includes(r.status) : false; };
  const out: string[] = [];
  if (short("vitaminD")) out.push(`<b>Vitamin D:</b> few foods contain much${s.vitaminD || app.kind === "finder" ? "" : ", so suggestions don't try to reach this target from food and it isn't counted above, unless you ask (tick the box under “Suggest foods for me”)"}. UK advice is that everyone should consider a 10 µg daily supplement in autumn and winter, and some groups all year round (NHS ${cite("nhs-vitd")}).`);
  if (short("vitaminB12")) out.push(`<b>Vitamin B12:</b> comes almost only from animal foods and fortified products${s.diet === "none" ? "" : ", so a fortified food or supplement may be needed"} (NHS ${cite("nhs-vegan")}).`);
  // Shown when the standard sets no EPA+DHA target (UK, US) and the day provides less than EFSA's 250 mg.
  if ((rep.byKey.get("epaDha")?.value ?? 0) < 250 && rep.byKey.get("epaDha")?.min === undefined) out.push(s.diet === "none"
    ? `<b>Omega-3 EPA and DHA:</b> found mainly in oily fish such as salmon, mackerel and sardines; the NHS advises at least one portion (about 140 g) of oily fish a week ${cite("nhs-fish")}. Plant omega-3 (ALA) converts to them poorly.`
    : `<b>Omega-3 EPA and DHA:</b> found mainly in oily fish; plant omega-3 (ALA) converts to them poorly. The UK and US set no target; EFSA (EU) advises 250 mg a day ${cite("efsa-2017")}. An algae-based supplement is the vegetarian and vegan source.`);
  if (rep.unassessed.some((r) => r.key === "iodine")) out.push(`<b>Iodine</b> isn't in the food database, so it isn't checked. Milk and yoghurt are the main UK sources; if you use plant drinks, choose one with added iodine (NHS ${cite("nhs-iodine")}).`);
  return out.length ? `<div class="notice small">${out.map((x) => `<p>${x}</p>`).join("")}</div>` : "";
}

/** Notes attached to the foods in a day: warnings for foods this person is advised to avoid, then advice and data caveats. */
export function foodNotes(app: App, items: Item[]) {
  const seen = new Set<string>();
  const notes = items.filter((i) => i.food.notes && !seen.has(i.food.notes) && seen.add(i.food.notes))
    .map((i) => esc(i.food.notes) + (i.food.noteRef ? ` ${cite(i.food.noteRef)}` : ""));
  if (items.some((i) => i.food.fortified)) notes.push("Includes a US product with added nutrients (marked US-fortified in the food list); the UK version may contain different amounts, so check the label.");
  // Suggestions leave such foods out, so these warnings matter in the builder.
  const warnings = avoidReasons(items.map((i) => i.food), { age: app.s.age, life: app.person().life })
    .map((r) => `<p class="notice bad small"><b>Advised to avoid:</b> ${esc(r.text)} ${cite(r.ref)}</p>`).join("");
  return warnings + (notes.length ? `<p class="small muted sans">${notes.join(" ")}</p>` : "") + blendNotes(app, items);
}

/**
 * For blended foods in a day (beta source only): where each value came from, its range across the tables, the
 * definition used under the chosen standard, and its caveats, each in the site's one caveat style.
 */
/** One blended food: its sources, the match, and each nutrient's median, range, per-table values and caveats. */
export function blendFoodHtml(app: App, f: PlannerFood, open = false) {
  const blend = app.blend;
  const b = f.blend;
  if (!blend || !b) return "";
  const std = app.person().standard.id;
  const kind = (k: string): CaveatKind => (k in KINDS ? (k as CaveatKind) : "assumption");
  const used = new Map<string, number>();   // caveat id -> its number in this food's list
  const mark = (ids: string[]) => ids.map((id) => {
    if (!used.has(id)) used.set(id, used.size + 1);
    return `<sup>${used.get(id)}</sup>`;
  }).join("");
  b.caveats.forEach((id) => mark([id]));
  const rows = blendValues(blend, b, std).filter((v) => v.value !== null && app.nutrientMeta.has(v.key)).map((v) => {
    const meta = app.nutrientMeta.get(v.key)!;
    const name = v.definition ? (blend.definitions[v.definition] ?? meta.label).replace(/, calculated:.*$/, "") : meta.label;
    const range = v.range && v.range[0] !== v.range[1] ? `${fmt(v.range[0])}–${fmt(v.range[1])}` : "";
    const from = v.definition === null ? "USDA only (CoFID doesn't give it)" : b.s[v.definition] ?? "";
    const how = v.definition && blend.definitions[v.definition]?.includes("calculated:") ? `${blend.definitions[v.definition].replace(/^.*?calculated: /, "Calculated: ")}. ` : "";
    const detail = `${esc(how)}${esc(from).replace(/\. Flagged: (.*)$/, ". <b>Flagged: $1</b>")}`;
    return `<tr><td>${esc(name)}${mark(v.caveats)}<br /><span class="muted">${detail}</span></td><td class="num">${fmt(v.value!)} ${esc(meta.unit)}</td><td class="num">${range}</td></tr>`;
  }).join("");
  const records = b.records.map((r) => `${esc(r.table)} ${esc(r.code)}, “${esc(r.name)}”${r.borrowedFrom ? ` (cites ${esc(r.borrowedFrom)})` : ""}`).join("; ");
  const notes = [...used].map(([id, n]) => {
    const c = blend.caveats[id];
    return c ? caveat(kind(c.kind), `<sup>${n}</sup> ${esc(c.text)}`) : "";
  }).join("");
  return `<details${open ? " open" : ""}><summary>${esc(f.name)}</summary>
    <p class="small">Sources: ${records}.<br />Match: ${esc(b.match.reason)} (${esc(b.match.by)}, ${esc(b.match.date)})</p>
    <div class="table-scroll"><table class="small"><thead><tr><th>Nutrient (definition), per 100 g; each table's value</th><th class="num">Value (median)</th><th class="num">Range</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${notes}</details>`;
}

export function blendNotes(app: App, items: Item[]) {
  const foods = [...new Map(items.filter((i) => i.food.blend).map((i) => [i.food.id, i.food])).values()];
  if (!app.blend || !foods.length) return "";
  return `<div class="blend-notes sans">${caveat("beta", `${foods.length === 1 ? "One food in this day uses" : `${foods.length} foods in this day use`} blended values (the median of the USDA and UK CoFID tables), matched and combined by automated steps without manual human verification. Open a food to see each value's range, sources and caveats.`)}${foods.map((f) => blendFoodHtml(app, f)).join("")}</div>`;
}
