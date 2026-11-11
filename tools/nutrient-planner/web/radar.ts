// Small dependency-free SVG radar chart showing each nutrient as a percentage
// of its target. The scale is linear and never clips: it runs to 150% by
// default and grows (in steps of 50%) to fit the largest value, so 400% always
// looks bigger than 300%. The target (100%) is a thick navy ring, labelled, so
// it stays easy to find whatever the scale.
//
// Axis kinds: "min" (reach at least the target), "max" (stay at or below it),
// "range" (stay inside a band; used for energy), "ref" (a reference amount,
// not a goal). Points are green when that axis's goal is met, red when not,
// grey for references.

export type Axis = {
  label: string; pct: number; kind: "min" | "max" | "range" | "ref"; ok?: boolean; detail?: string;
  others?: Record<string, number>;   // other standards' targets on this axis, as % of the main target
};
export type Overlay = { id: string; label: string; color: string; dash: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const GOOD = "#2d7a2d", BAD = "#a3271c", NEUTRAL = "#666666", NAVY = "#000080";

export function scaleMax(axes: Axis[], base = 150, overlays: Overlay[] = []) {
  const top = Math.max(0, ...axes.map((a) => a.pct), ...axes.flatMap((a) => overlays.map((o) => a.others?.[o.id] ?? 0)));
  return top <= base ? base : Math.ceil(top / 50) * 50;
}

export function radarSvg(axes: Axis[], opts: { title: string; base?: number; size?: number; zoom?: boolean; overlays?: Overlay[] }) {
  const n = axes.length;
  if (n < 3) return "";
  // zoom: keep the scale at `base` and mark anything beyond it with an arrow instead.
  const overlays = opts.overlays ?? [];
  const max = opts.zoom ? (opts.base ?? 150) : scaleMax(axes, opts.base ?? 150, overlays);
  const size = opts.size ?? 340;
  const pad = 82;
  const cx = size / 2 + pad, cy = size / 2 + 30, r = size / 2 - 10;
  const W = size + pad * 2, H = size + 64;
  const ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt = (i: number, pct: number) => {
    const rr = (Math.min(Math.max(pct, 0), max) / max) * r;
    return [cx + rr * Math.cos(ang(i)), cy + rr * Math.sin(ang(i))];
  };
  const ring = (pct: number) => axes.map((_, i) => pt(i, pct).map((v) => v.toFixed(1)).join(",")).join(" ");
  const shape = axes.map((a, i) => pt(i, a.pct).map((v) => v.toFixed(1)).join(",")).join(" ");
  const step = max <= 200 ? 50 : max <= 500 ? 100 : max <= 1000 ? 200 : 500;

  let g = "";
  // Grid rings with their percentages along the first axis.
  for (let p = step; p <= max; p += step) {
    if (p === 100) continue;
    g += `<polygon points="${ring(p)}" fill="none" stroke="#d6d2b8" stroke-width="1"/>`;
    // Ring labels sit between the first two axes, away from the axis labels.
    const t = -Math.PI / 2 + Math.PI / n, rr = (p / max) * r;
    g += `<text x="${(cx + rr * Math.cos(t) + 3).toFixed(1)}" y="${(cy + rr * Math.sin(t) + 3).toFixed(1)}" font-size="10" fill="#8a8670">${p}%</text>`;
  }
  axes.forEach((_, i) => {
    const [x, y] = pt(i, max);
    g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e4e1cc" stroke-width="1"/>`;
  });
  // Target ring: shaded inside, thick navy edge, labelled.
  g += `<polygon points="${ring(100)}" fill="rgba(0,0,128,0.05)" stroke="${NAVY}" stroke-width="2.6"/>`;
  {
    const t = -Math.PI / 2 + Math.PI / n, rr = (100 / max) * r;
    g += `<text x="${(cx + rr * Math.cos(t) + 3).toFixed(1)}" y="${(cy + rr * Math.sin(t) - 3).toFixed(1)}" font-size="11" font-weight="700" fill="${NAVY}">target</text>`;
  }
  // Other standards' targets: thin coloured outlines, broken where a standard has no value for an axis.
  for (const o of overlays) {
    const has = axes.map((a) => a.others?.[o.id]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (has[i] === undefined) continue;
      const [x1, y1] = pt(i, has[i]!);
      g += `<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="2.6" fill="${o.color}"><title>${esc(o.label)} target for ${esc(axes[i].label)}: ${Math.round(has[i]!)}% of the main target</title></circle>`;
      if (has[j] === undefined) continue;
      const [x2, y2] = pt(j, has[j]!);
      g += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${o.color}" stroke-width="1.6" stroke-dasharray="${o.dash}"/>`;
    }
  }
  // Achieved shape.
  g += `<polygon points="${shape}" fill="rgba(45,122,45,0.18)" stroke="#2d7a2d" stroke-width="1.8" stroke-linejoin="round"/>`;
  axes.forEach((a, i) => {
    const [x, y] = pt(i, a.pct);
    const colour = a.kind === "ref" ? NEUTRAL : a.ok ? GOOD : BAD;
    const sign = a.kind === "min" ? "at least" : a.kind === "max" ? "at most" : a.kind === "range" ? "within range" : "reference";
    if (a.pct > max) {
      // Beyond the zoomed scale: an outward arrow on the edge.
      const t = ang(i), ux = Math.cos(t), uy = Math.sin(t), px = -uy, py = ux;
      const tip = [x + ux * 11, y + uy * 11], b1 = [x + px * 6, y + py * 6], b2 = [x - px * 6, y - py * 6];
      g += `<polygon points="${[tip, b1, b2].map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="${colour}"/>`;
    }
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${colour}" stroke="#fff" stroke-width="1.2"><title>${esc(a.label)}: ${Math.round(a.pct)}% of ${sign}${a.detail ? ` (${esc(a.detail)})` : ""}</title></circle>`;
    const [lx, ly] = pt(i, max * 1.1 + 4);
    const cos = Math.cos(ang(i));
    const anchor = Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
    const mark = a.kind === "min" ? " ≥" : a.kind === "max" ? " ≤" : "";
    g += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="12.5" fill="#111">${esc(a.label)}${mark}`
      + `<tspan x="${lx.toFixed(1)}" dy="14" font-size="12" font-weight="700" fill="${colour}">${Math.round(a.pct)}%</tspan></text>`;
  });
  const clipped = axes.filter((a) => a.pct > max).length;
  const note = clipped ? `<text x="${W - 6}" y="${H - 6}" text-anchor="end" font-size="10.5" fill="#8a8670">Zoomed to ${max}%: arrows mark ${clipped} value${clipped > 1 ? "s" : ""} beyond the edge</text>`
    : max > (opts.base ?? 150) ? `<text x="${W - 6}" y="${H - 6}" text-anchor="end" font-size="10.5" fill="#8a8670">Scale extended to ${max}% to fit the highest value</text>` : "";
  return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title)}" font-family="'Averia Sans Libre', Arial, sans-serif">`
    + `<title>${esc(opts.title)}</title>${g}${note}</svg>`;
}
