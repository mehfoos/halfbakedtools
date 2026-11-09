// Small dependency-free SVG radar chart: share of each target achieved.
// The dashed ring is the target (100%). Values beyond the outer ring are
// drawn on the ring and marked, so one huge value can't distort the chart.

export type Axis = { label: string; pct: number; detail?: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function radarSvg(axes: Axis[], opts: { max?: number; size?: number; title: string }) {
  const max = opts.max ?? 150;
  const size = opts.size ?? 340;
  const n = axes.length;
  if (n < 3) return "";
  const pad = 78;
  const cx = size / 2 + pad, cy = size / 2 + 28, r = size / 2 - 10;
  const W = size + pad * 2, H = size + 56;
  const ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt = (i: number, pct: number) => {
    const rr = (Math.min(Math.max(pct, 0), max) / max) * r;
    return [cx + rr * Math.cos(ang(i)), cy + rr * Math.sin(ang(i))];
  };
  const ring = (pct: number) => axes.map((_, i) => pt(i, pct).map((v) => v.toFixed(1)).join(",")).join(" ");
  const shape = axes.map((a, i) => pt(i, a.pct).map((v) => v.toFixed(1)).join(",")).join(" ");

  let g = "";
  for (const p of [50, max]) g += `<polygon points="${ring(p)}" fill="none" stroke="#cfcbb0" stroke-width="1"/>`;
  axes.forEach((_, i) => {
    const [x, y] = pt(i, max);
    g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e2dfc8" stroke-width="1"/>`;
  });
  g += `<polygon points="${ring(100)}" fill="none" stroke="#000080" stroke-width="1.6" stroke-dasharray="5 4"/>`;
  g += `<polygon points="${shape}" fill="rgba(45,122,45,0.22)" stroke="#2d7a2d" stroke-width="2" stroke-linejoin="round"/>`;
  axes.forEach((a, i) => {
    const [x, y] = pt(i, a.pct);
    const short = a.pct < 99.5;
    const over = a.pct > max;
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${over ? 4.5 : 3.2}" fill="${short ? "#a3271c" : "#2d7a2d"}" stroke="#fff" stroke-width="1"><title>${esc(a.label)}: ${Math.round(a.pct)}% of target${a.detail ? ` (${esc(a.detail)})` : ""}</title></circle>`;
    const [lx, ly] = pt(i, max + 16);
    const cos = Math.cos(ang(i));
    const anchor = Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
    const pctText = `${Math.round(a.pct)}%`;
    g += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="12.5" fill="#111">${esc(a.label)}`
      + `<tspan x="${lx.toFixed(1)}" dy="14" font-size="12" font-weight="700" fill="${short ? "#a3271c" : "#2d7a2d"}">${pctText}</tspan></text>`;
  });
  g += `<text x="${(cx + 4).toFixed(1)}" y="${(cy - (100 / max) * r - 4).toFixed(1)}" font-size="10.5" fill="#000080">target</text>`;
  return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title)}" font-family="'Averia Sans Libre', Arial, sans-serif">`
    + `<title>${esc(opts.title)}</title>${g}</svg>`;
}
