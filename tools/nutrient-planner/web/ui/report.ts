// A day's results as HTML: the headline, the "At a glance" chart with its side panel, the notices,
// and one collapsible section per nutrient group. Used by both suggestions and the builder.
import { GROUPS, gapWords, tally, type Report, type Row } from "../analysis.ts";
import { detailAxes, noDataLabels, overviewAxes } from "../chart-axes.ts";
import { isAdult } from "../profiles.ts";
import { comparisonTargets, otherStandards } from "../person.ts";
import type { App, Item } from "./app.ts";
import { OVERLAY_STYLE, type Charts } from "./charts.ts";
import { nutrientNotices } from "./notices.ts";
import { esc, fmt } from "./dom.ts";

// The macronutrients of the "At a glance" chart, for its "which foods provide" table.
const OVERVIEW_KEYS = ["energy", "fat", "satfat", "carbohydrate", "sugars", "fibre", "protein", "salt"];

const chip = (r: Row) => {
  // "met" refers to the minimum; where there is also a limit and some foods have no data, the limit can't be confirmed.
  const text = { met: r.missing && r.max !== undefined ? "min met" : "met", short: `${Math.round(r.pctOfMin!)}%`, low: `${Math.round(r.pctOfMin!)}%`, over: "over limit", within: "within limit", info: "no target", unassessed: "not checked", unclear: "unclear", na: "NA" }[r.status];
  return `<span class="chip ${r.status}">${text}</span>`;
};
const targetText = (r: Row) => [r.min !== undefined ? `≥ ${fmt(r.min)}` : "", r.max !== undefined ? `≤ ${fmt(r.max)}` : ""].filter(Boolean).join(", ") || "–";

/**
 * The amount: "NA" when no food in the day has data (this is not zero), or "≥ x" when some foods have no
 * data, so the real amount is at least x. Hover text gives the count.
 */
const amount = (r: Row) => {
  if (r.status === "na") return `<abbr title="No food in this day has data for this nutrient. This is not zero.">NA</abbr>`;
  const text = `${fmt(r.value)} <span class="muted">${esc(r.unit)}</span>`;
  return r.missing ? `<abbr title="${r.missing} of ${r.of} foods in this day have no data for this nutrient, so the amount is at least this.">≥ ${text}</abbr>` : text;
};

/** Nutrient, amount, target and status, one row each. */
const table = (rows: Row[]) => `<div class="table-scroll"><table><thead><tr><th>Nutrient</th><th class="num">Amount</th><th class="num">Target</th><th></th></tr></thead><tbody>${
  rows.map((r) => `<tr><td>${esc(r.label)}${r.custom ? '<span class="badge">custom</span>' : ""}</td><td class="num">${amount(r)}</td><td class="num muted">${targetText(r)}${r.ofEnergy ? " *" : ""}</td><td>${chip(r)}</td></tr>`).join("")
}</tbody></table></div>${rows.some((r) => r.ofEnergy) ? `<p class="small muted sans">* Set as a share of energy, so worked out for this day's calories.</p>` : ""}${
  rows.some((r) => r.status === "na" || r.missing) ? `<p class="small muted sans">NA: no food in this day has data for this nutrient. It is not zero. ≥: some foods have no data for this nutrient, so the real amount is at least the figure shown and may be higher (hover for how many foods). Where that could change the answer, the status says "unclear".</p>` : ""}`;

export function reportHtml(app: App, charts: Charts, rep: Report, items: Item[]) {
  const person = app.person();
  const others = otherStandards(person, app.standards);
  // The other standards' targets, worked out for this day's calories.
  const cmp = comparisonTargets(person, app.s, app.standards, app.data.nutrients, rep.energy);

  // Legend, the compare tick box, how many targets each group meets, and anything near a safety limit.
  function sidePanel() {
    const groups = GROUPS.filter((g) => ["vitamins", "minerals", "amino"].includes(g.id)).map((g) => {
      const t = tally(g.keys.map((k) => rep.byKey.get(k)).filter((r): r is Row => !!r));
      if (!t.of) return "";
      // Amber only for a target that is really short; targets that can't be confirmed are grey, not "not met".
      const real = t.of - t.met - t.unclear;
      const gaps = gapWords(t);
      return `<li><span class="chip ${t.met === t.of ? "met" : real > 0 ? "short" : "unclear"}">${t.met} of ${t.of}</span> ${esc(g.title)}${gaps ? ` <span class="muted">(${gaps})</span>` : ""}</li>`;
    }).join("");
    const close = rep.rows.filter((r) => r.max !== undefined && r.status !== "unassessed"
      && !["fat", "satfat", "salt", "sodium"].includes(r.key) && (r.pctOfMax ?? 0) >= 80);
    return `<div class="side sans">
      <ul class="legend">
        <li><span class="sw ring"></span> ${esc(person.standard.name)} target (100%), used for planning</li>
        ${others.map((x) => `<li class="cmp-only"><span class="sw line" style="border-top-color:${OVERLAY_STYLE[x.id].color};border-top-style:${x.id === "us" ? "dotted" : "dashed"}"></span> ${esc(x.name)} target for the same person</li>`).join("")}
        <li><span class="sw dot good"></span> Goal met</li>
        <li><span class="sw dot bad"></span> Goal not met</li>
        <li><span class="sw dot ref"></span> Reference only</li>
      </ul>
      <p class="small muted">≥ aim for at least the target · ≤ stay at or below it.</p>
      <p class="small"><label><input type="checkbox" class="cmp-toggle" ${app.s.compare ? "checked" : ""} /> Show ${others.map((x) => esc(x.name)).join(" and ")} targets too</label></p>
      ${groups ? `<h4>Vitamins, minerals and protein building blocks</h4><ul class="groups">${groups}</ul><p class="small muted">Open each section below for its own chart.</p>` : ""}
      ${close.length ? `<h4>Close to a safety limit</h4>${close.map((r) => `<div class="limit ${r.status === "over" ? "over" : ""}">${esc(r.label)}: <b>${r.missing ? "≥ " : ""}${fmt(r.value)}</b> of max ${fmt(r.max)} ${esc(r.unit)}<div class="lbar"><span style="width:${Math.min(100, r.pctOfMax ?? 0).toFixed(0)}%"></span></div></div>`).join("")}` : ""}
    </div>`;
  }

  // One collapsible section for a nutrient group: chart, table, and which foods provide it.
  function groupSection(id: string) {
    const g = GROUPS.find((x) => x.id === id)!;
    const rows = rep.rows.filter((r) => g.keys.includes(r.key) && (r.min !== undefined || r.max !== undefined || id === "fats"));
    if (id === "fats" && !rows.some((r) => r.min !== undefined)) return "";
    if (!rows.length) return id === "amino" ? `<details><summary>${esc(g.title)}</summary><div class="details-body"><p class="small sans">Amino acid targets are given for adults only.</p></div></details>` : "";
    const t = tally(rows);
    const gaps = gapWords(t);
    return `<details><summary>${esc(g.title)} <span class="summary-note">${t.of ? `${t.met} of ${t.of} met${gaps ? `, ${gaps}` : ""}` : gaps ? gaps : `${rows.length} values`}</span></summary><div class="details-body">
        ${charts.chart(detailAxes(rep, g.keys, cmp, fmt), `${g.title}: share of each target reached`, noDataLabels(rep, g.keys, true))}
        ${id === "vitamins" ? `<p class="small sans muted">Vitamin D targets cover all vitamin D from food (D2 and D3 together). The difference matters mainly for supplements, where D3 raises blood levels more effectively. B5 (pantothenic acid) has a US target only; biotin (B7) isn't shown because the food data rarely includes it.</p>` : ""}
        ${table(rows)}
        ${charts.contributionSection(items, g.keys, g.id === "amino" ? "these amino acids" : `these ${g.title.toLowerCase()}`)}</div></details>`;
  }

  const unknown = rep.unclear.length || rep.noData.length;
  const shortTxt = rep.shortfalls.length
    ? `Short on ${rep.shortfalls.slice(0, 5).map((r) => `${esc(r.label)} (${Math.round(r.pctOfMin!)}%)`).join(", ")}${rep.shortfalls.length > 5 ? ` and ${rep.shortfalls.length - 5} more` : ""}.`
    : unknown ? "" : "Every checked minimum is met.";
  // Foods with no data are never counted as zero: their targets are "unclear" (a lower bound) or "NA".
  const names = (rows: Row[]) => `${rows.slice(0, 6).map((r) => esc(r.label)).join(", ")}${rows.length > 6 ? ` and ${rows.length - 6} more` : ""}`;
  const unknownTxt = (rep.unclear.length ? ` Can't confirm, because some foods have no data: ${names(rep.unclear)}.` : "")
    + (rep.noData.length ? ` No data in this day's foods (shown as NA, not zero): ${names(rep.noData)}.` : "");
  const over = rep.rows.filter((r) => r.status === "over");
  const custom = rep.rows.some((r) => r.custom) || person.customEnergy;
  const notChecked = rep.unassessed.length ? ` Not checked (no food data): ${rep.unassessed.map((r) => esc(r.label)).join(", ")}.` : "";
  const asideTxt = rep.aside.map((r) => ` ${esc(r.label)}, which suggestions don't plan for: ${fmt(r.value)} of ${fmt(r.min)} ${esc(r.unit)} (see the note below).`).join("");

  const overview = charts.chart(overviewAxes(rep, person, isAdult(app.s.age), cmp, fmt), "Overview: energy, fat, saturates, carbohydrate, sugars, fibre, protein and salt as a share of target", noDataLabels(rep, ["fat", "satfat", "carbohydrate", "sugars", "fibre", "protein", rep.byKey.get("salt")?.max !== undefined ? "salt" : "sodium"]));
  return `<p class="headline"><b>${rep.metCount} of ${rep.minCount}</b> checked targets met${gapWords({ unclear: rep.minUnclear, na: rep.minNa }) ? ` (${gapWords({ unclear: rep.minUnclear, na: rep.minNa })}: see below)` : ""} · <b>${fmt(rep.energy)}</b> kcal. ${shortTxt}${unknownTxt}${asideTxt}${notChecked}
        ${over.length ? ` <span class="chip over">Over the limit for ${over.map((r) => esc(r.label)).join(", ")}</span>` : ""}</p>
      ${custom ? `<p class="small muted sans">Using some custom targets.</p>` : ""}
      <h4 class="chart-title">At a glance <span class="muted small">(laid out like a food label)</span></h4>
      <div class="charts">${overview}${sidePanel()}</div>
      ${charts.contributionSection(items, OVERVIEW_KEYS, "energy, fat, carbs, fibre, protein and salt")}
      ${nutrientNotices(app, rep)}
      ${groupSection("vitamins")}${groupSection("minerals")}${groupSection("amino")}${groupSection("fats")}
      <details><summary>All values <span class="summary-note">including fats and values without targets</span></summary><div class="details-body">${table(rep.rows.filter((r) => r.key !== "energy"))}</div></details>`;
}
