// The pad where a signature is drawn. The geometry is pure (and tested); the drawing needs a browser.
export type Pt = { x: number; y: number };
export type Stroke = { pts: Pt[]; width: number };

/** The smallest box holding all the ink (each stroke's own thickness included), or null if nothing is drawn. */
export function inkBounds(strokes: Stroke[], pad = 0): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s.pts) {
    x0 = Math.min(x0, p.x - s.width / 2); y0 = Math.min(y0, p.y - s.width / 2);
    x1 = Math.max(x1, p.x + s.width / 2); y1 = Math.max(y1, p.y + s.width / 2);
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

/** Draws strokes as smooth curves (through the midpoints of the sampled points); a single tap becomes a dot. */
export function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], color: string, dx = 0, dy = 0): void {
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = color; ctx.fillStyle = color;
  for (const s of strokes) {
    const p = s.pts; if (!p.length) continue;
    ctx.lineWidth = s.width;
    if (p.length < 3) { ctx.beginPath(); ctx.arc(p[0].x + dx, p[0].y + dy, s.width / 2, 0, Math.PI * 2); ctx.fill(); if (p.length === 2) { ctx.beginPath(); ctx.moveTo(p[0].x + dx, p[0].y + dy); ctx.lineTo(p[1].x + dx, p[1].y + dy); ctx.stroke(); } continue; }
    ctx.beginPath(); ctx.moveTo(p[0].x + dx, p[0].y + dy);
    for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i].x + dx, p[i].y + dy, (p[i].x + p[i + 1].x) / 2 + dx, (p[i].y + p[i + 1].y) / 2 + dy);
    ctx.lineTo(p[p.length - 1].x + dx, p[p.length - 1].y + dy); ctx.stroke();
  }
}

/** Wires the pad's canvas and buttons inside `root`. `use` receives the signature as a transparent PNG, trimmed to the ink. */
export function createSignPad(root: HTMLElement, use: (png: Blob) => void, say: (t: string, k?: "info" | "bad" | "warn") => void) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const pad = $("sigPad"), canvas = $<HTMLCanvasElement>("sigCanvas");
  const ctx = canvas.getContext("2d")!;
  const SCALE = 2;                                   // drawn at twice the screen size so the signature stays sharp when placed
  let strokes: Stroke[] = [], live: Stroke | null = null;
  const color = () => $<HTMLSelectElement>("sigInk").value, thick = () => Number($<HTMLSelectElement>("sigWidth").value) * SCALE;
  function size() { const w = Math.max(200, Math.round(canvas.clientWidth)); canvas.width = w * SCALE; canvas.height = Math.round(w * 0.38) * SCALE; canvas.style.height = `${Math.round(w * 0.38)}px`; redraw(); }
  function redraw() { ctx.clearRect(0, 0, canvas.width, canvas.height); paint(ctx, live ? [...strokes, live] : strokes, color()); }
  const at = (e: PointerEvent): Pt => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height }; };
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); live = { pts: [at(e)], width: thick() }; redraw(); });
  canvas.addEventListener("pointermove", (e) => { if (!live) return; live.pts.push(at(e)); redraw(); });
  const up = () => { if (live) { strokes.push(live); live = null; redraw(); } };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  $("sigInk").addEventListener("change", redraw);
  $("sigClear").addEventListener("click", () => { strokes = []; live = null; redraw(); });
  $("sigUndo").addEventListener("click", () => { strokes.pop(); redraw(); });
  $("sigCancel").addEventListener("click", () => close());
  $("sigUse").addEventListener("click", () => {
    const b = inkBounds(strokes, 8 * SCALE); if (!b) return say("Draw your signature first.", "bad");
    const out = document.createElement("canvas"); out.width = Math.ceil(b.w); out.height = Math.ceil(b.h);
    paint(out.getContext("2d")!, strokes, color(), -b.x, -b.y);
    out.toBlob((png) => { if (png) { close(); use(png); } else say("The signature couldn't be made into a picture.", "bad"); }, "image/png");
  });
  function open() { pad.hidden = false; size(); }
  function close() { pad.hidden = true; strokes = []; live = null; }
  window.addEventListener("resize", () => { if (!pad.hidden) { const keep = strokes; size(); strokes = keep; redraw(); } });
  return { open, close };
}
