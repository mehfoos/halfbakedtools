// Radar charts on the page: drawing, "Zoom to target", showing or hiding the other standards'
// targets, and the "which foods provide..." tables that are worked out only when opened.
import { radarSvg, scaleMax, type Axis, type Overlay } from "../radar.ts";
import { otherStandards } from "../person.ts";
import type { App, Item } from "./app.ts";
import { $$, esc } from "./dom.ts";

// How each standard is drawn when shown for comparison.
export const OVERLAY_STYLE: Record<string, { color: string; dash: string }> = {
  uk: { color: "#0b7a75", dash: "6 3" }, us: { color: "#c25e00", dash: "2 3" }, eu: { color: "#7a2e8e", dash: "8 3 2 3" },
};

export type Charts = ReturnType<typeof createCharts>;

export function createCharts(app: App) {
  const { root } = app;
  const charts = new Map<string, { axes: Axis[]; title: string; zoom: boolean }>();
  const contributions = new Map<string, { items: Item[]; keys: string[] }>();
  let uid = 0;

  const overlays = (): Overlay[] => (app.s.compare
    ? otherStandards(app.person(), app.standards).map((x) => ({ id: x.id, label: x.name, ...OVERLAY_STYLE[x.id] }))
    : []);
  // On a phone the chart is drawn with larger text relative to its size, so labels stay readable.
  const compact = () => window.matchMedia("(max-width: 560px)").matches;
  const draw = (c: { axes: Axis[]; title: string; zoom: boolean }) =>
    radarSvg(c.axes, { title: c.title, zoom: c.zoom, overlays: overlays(), compact: compact() });

  /** A chart, with a zoom button when some value is off the default scale. Needs at least three axes. */
  function chart(axes: Axis[], title: string, noData: string[] = []) {
    // A nutrient no food has data for gets no axis (it would read as zero), so say which ones are left out.
    const note = noData.length ? `<p class="small muted sans">Not drawn, because no food in this day has data (this is not zero): ${noData.map(esc).join(", ")}.</p>` : "";
    if (axes.length < 3) return noData.length ? `<p class="small muted sans">Too few nutrients with data to draw this chart.</p>${note}` : "";
    const id = `c${++uid}`;
    charts.set(id, { axes, title, zoom: false });
    const canZoom = scaleMax(axes, 150, overlays()) > 150;
    return `<figure class="chart" data-chart="${id}">${radarSvg(axes, { title, overlays: overlays(), compact: compact() })}${canZoom ? `<figcaption><button type="button" class="link small" data-zoom="${id}">Zoom to target</button></figcaption>` : ""}</figure>${note}`;
  }

  /** A collapsed section whose table (each food's share of each nutrient) is built when first opened. */
  function contributionSection(items: Item[], keys: string[], what: string) {
    if (app.kind === "finder") return "";   // one food provides all of it
    const id = `k${++uid}`;
    contributions.set(id, { items, keys });
    return `<details data-contrib="${id}"><summary>Which foods provide ${esc(what)}</summary><div class="details-body"></div></details>`;
  }

  function contributionTable(items: Item[], keys: string[]) {
    // D2 and D3 are recorded for too few foods to split the total fairly.
    const known = (it: Item, k: string) => it.food.per100g[k] !== undefined;
    const ks = keys.filter((k) => !["vitaminD2", "vitaminD3"].includes(k) && app.nutrientMeta.has(k) && items.some((it) => (it.food.per100g[k] ?? 0) > 0 || !known(it, k)));
    if (!ks.length) return `<p class="small sans">No values to show.</p>`;
    const amount = (it: Item, k: string) => ((it.food.per100g[k] ?? 0) * it.grams) / 100;
    const gaps = ks.some((k) => items.some((it) => !known(it, k)));
    return `<p class="small sans">Share of the day's total that each food provides.${gaps ? " NA: that food has no data for the nutrient (this is not zero); shares are of the amounts that are known." : ""}</p><div class="table-scroll"><table class="contrib"><thead><tr><th>Nutrient</th>${items.map((it) => `<th class="num">${esc(it.food.name)}</th>`).join("")}</tr></thead><tbody>${
      ks.map((k) => {
        const total = items.reduce((a, it) => a + amount(it, k), 0);
        return `<tr><td>${esc(app.nutrientMeta.get(k)!.label)}</td>${items.map((it) => {
          if (!known(it, k)) return `<td class="num muted">NA</td>`;
          const share = total > 0 ? (amount(it, k) / total) * 100 : 0;
          return `<td class="num"><span class="share" style="--w:${share.toFixed(0)}%">${share >= 0.5 ? Math.round(share) + "%" : "–"}</span></td>`;
        }).join("")}</tr>`;
      }).join("")
    }</tbody></table></div>`;
  }

  // "Zoom to target" / "Show full scale"
  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button[data-zoom]") as HTMLButtonElement | null;
    if (!b) return;
    const c = charts.get(b.dataset.zoom!);
    const fig = b.closest("figure");
    if (!c || !fig) return;
    c.zoom = !c.zoom;
    fig.querySelector("svg")!.outerHTML = draw(c);
    b.textContent = c.zoom ? "Show full scale" : "Zoom to target";
  });

  // Showing or hiding the other standards redraws every chart on the page.
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.classList.contains("cmp-toggle")) return;
    app.s.compare = t.checked;
    app.save();
    root.classList.toggle("no-compare", !app.s.compare);
    $$<HTMLInputElement>(root, ".cmp-toggle").forEach((x) => (x.checked = app.s.compare));
    for (const fig of $$(root, "figure[data-chart]")) {
      const c = charts.get(fig.dataset.chart!);
      if (c) fig.querySelector("svg")!.outerHTML = draw(c);
    }
  });

  // Fill a "which foods provide..." table the first time it is opened.
  root.addEventListener("toggle", (e) => {
    const d = e.target as HTMLDetailsElement;
    if (!d.open || !d.dataset.contrib) return;
    const body = d.querySelector(".details-body")!;
    if (body.childElementCount) return;          // already worked out
    const c = contributions.get(d.dataset.contrib);
    if (c) body.innerHTML = contributionTable(c.items, c.keys);
  }, true);

  return { chart, contributionSection };
}
