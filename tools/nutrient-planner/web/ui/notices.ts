// The advice and caveats shown with a day's results. Each statement of fact carries its reference.
import type { Report } from "../analysis.ts";
import { avoidReasons } from "../foods.ts";
import type { App, Item } from "./app.ts";
import { cite } from "./app.ts";
import { esc } from "./dom.ts";

/** Shown above every set of results. */
export const CAVEAT = `<p class="small muted sans caveat">These are estimates. They use average food composition, mostly from US data ${cite("usda-sr")}, so real foods vary with brand, variety and cooking. They also don't yet allow for how well the body absorbs each nutrient (for example, iron from plants is absorbed less well than iron from meat).</p>`;

/** Notices about nutrients that food data or food alone handles poorly: vitamin D, B12, EPA/DHA, iodine. */
export function nutrientNotices(app: App, rep: Report) {
  const s = app.s;
  const short = (k: string) => { const r = rep.byKey.get(k); return r ? ["short", "low", "unclear", "na"].includes(r.status) : false; };
  const out: string[] = [];
  if (short("vitaminD")) out.push(`<b>Vitamin D:</b> few foods contain much${s.vitaminD ? "" : ", so suggestions don't try to reach this target from food and it isn't counted above, unless you ask (tick the box under “Suggest foods for me”)"}. UK advice is that everyone should consider a 10 µg daily supplement in autumn and winter, and some groups all year round (NHS ${cite("nhs-vitd")}).`);
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
  return warnings + (notes.length ? `<p class="small muted sans">${notes.join(" ")}</p>` : "");
}
