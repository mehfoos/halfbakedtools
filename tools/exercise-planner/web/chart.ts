// Small dependency-free SVG charts of fractional sets per muscle (no DOM; returns SVG markup).
// Follows the site's chart rules: linear scale that grows to fit and never clips, a distinct labelled
// "covered" ring, and every value written out so colour is never the only signal.
// With fewer than three axes a radar can't be drawn, so a bar chart is used instead.

export type Axis = { label: string; value: number; target?: number; isTarget: boolean };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const GOOD = "#2d7a2d", BAD = "#a3271c", NEUTRAL = "#666666", NAVY = "#000080", GRID = "#d6d2b8";
export const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

/** Scale top: at least 2 sets (or 1.5 × the target), rounded up to a whole set so bigger always looks bigger. */
export function scaleMax(axes: Axis[]) {
  const target = Math.max(0, ...axes.map((a) => a.target ?? 0));
  const top = Math.max(2, target * 1.5, ...axes.map((a) => a.value));
  return Math.ceil(top);
}

const colour = (a: Axis) => !a.isTarget || a.target === undefined ? NEUTRAL : a.value >= a.target - 1e-9 ? GOOD : BAD;
const mark = (a: Axis) => !a.isTarget || a.target === undefined ? "" : a.value >= a.target - 1e-9 ? " ✓" : " short";

export function chartSvg(axes: Axis[], title: string) {
  return axes.length >= 3 ? radarSvg(axes, title) : barsSvg(axes, title);
}

function radarSvg(axes: Axis[], title: string) {
  const n = axes.length, max = scaleMax(axes);
  const size = 320, pad = 118;
  const cx = size / 2 + pad, cy = size / 2 + 34, r = size / 2 - 10;
  const W = size + pad * 2, H = size + 72;
  const ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt = (i: number, v: number) => {
    const rr = (Math.max(0, v) / max) * r;
    return [cx + rr * Math.cos(ang(i)), cy + rr * Math.sin(ang(i))];
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map((q) => q.toFixed(1)).join(",")).join(" ");
  let g = "";
  for (let v = 1; v <= max; v++) {
    g += `<polygon points="${poly(axes.map(() => v))}" fill="none" stroke="${GRID}" stroke-width="1"/>`;
    const t = -Math.PI / 2 + Math.PI / n, rr = (v / max) * r;
    g += `<text x="${(cx + rr * Math.cos(t) + 3).toFixed(1)}" y="${(cy + rr * Math.sin(t) + 3).toFixed(1)}" font-size="10" fill="#8a8670">${v} set${v > 1 ? "s" : ""}</text>`;
  }
  axes.forEach((_, i) => {
    const [x, y] = pt(i, max);
    g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e4e1cc" stroke-width="1"/>`;
  });
  // "Covered" level: a thick navy line on the target axes only.
  const targets = axes.map((a) => (a.isTarget ? a.target : undefined));
  if (targets.some((t) => t !== undefined)) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (targets[i] === undefined || targets[j] === undefined) {
        if (targets[i] !== undefined) {
          const [x, y] = pt(i, targets[i]!);
          g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="none" stroke="${NAVY}" stroke-width="2"/>`;
        }
        continue;
      }
      const [x1, y1] = pt(i, targets[i]!), [x2, y2] = pt(j, targets[j]!);
      g += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${NAVY}" stroke-width="2.6"/>`;
    }
  }
  g += `<polygon points="${poly(axes.map((a) => a.value))}" fill="rgba(45,122,45,0.18)" stroke="#2d7a2d" stroke-width="1.8" stroke-linejoin="round"/>`;
  axes.forEach((a, i) => {
    const [x, y] = pt(i, a.value);
    const c = colour(a);
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${c}" stroke="#fff" stroke-width="1.2"><title>${esc(a.label)}: ${fmt(a.value)} sets${a.target !== undefined && a.isTarget ? ` (covered at ${fmt(a.target)})` : ""}</title></circle>`;
    const [lx, ly] = pt(i, max * 1.1 + 0.15);
    const cos = Math.cos(ang(i));
    const anchor = Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
    g += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="12.5" fill="#111"${a.isTarget ? ' font-weight="700"' : ""}>${esc(a.label)}`
      + `<tspan x="${lx.toFixed(1)}" dy="14" font-size="12" font-weight="700" fill="${c}">${fmt(a.value)}${mark(a)}</tspan></text>`;
  });
  const legend = targets.some((t) => t !== undefined)
    ? `<line x1="8" y1="${H - 10}" x2="30" y2="${H - 10}" stroke="${NAVY}" stroke-width="2.6"/><text x="34" y="${H - 6}" font-size="10.5" fill="#444">covered level for your targets (bold)</text>` : "";
  return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" font-family="'Averia Sans Libre', Arial, sans-serif"><title>${esc(title)}</title>${g}${legend}</svg>`;
}

function barsSvg(axes: Axis[], title: string) {
  const max = scaleMax(axes), rowH = 34, left = 130, width = 300, W = left + width + 70, H = axes.length * rowH + 40;
  const x = (v: number) => left + (Math.max(0, v) / max) * width;
  let g = "";
  for (let v = 0; v <= max; v++) {
    g += `<line x1="${x(v)}" y1="8" x2="${x(v)}" y2="${H - 22}" stroke="${GRID}"/><text x="${x(v)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#8a8670">${v}</text>`;
  }
  axes.forEach((a, i) => {
    const y = 12 + i * rowH, c = colour(a);
    g += `<text x="${left - 8}" y="${y + 15}" text-anchor="end" font-size="12.5"${a.isTarget ? ' font-weight="700"' : ""}>${esc(a.label)}</text>`;
    g += `<rect x="${left}" y="${y + 3}" width="${(x(a.value) - left).toFixed(1)}" height="16" fill="${c}" opacity="0.75"/>`;
    if (a.isTarget && a.target !== undefined) g += `<line x1="${x(a.target)}" y1="${y}" x2="${x(a.target)}" y2="${y + 22}" stroke="${NAVY}" stroke-width="2.6"/>`;
    g += `<text x="${x(a.value) + 6}" y="${y + 15}" font-size="12" font-weight="700" fill="${c}">${fmt(a.value)}${mark(a)}</text>`;
  });
  return `<svg class="radar bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" font-family="'Averia Sans Libre', Arial, sans-serif"><title>${esc(title)}</title>${g}</svg>`;
}
