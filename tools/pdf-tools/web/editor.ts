// The single-page editor for adding text and pictures ("marks") to a page. Browser-only.
// What is shown is the real thing: after every change the page is rebuilt as a PDF, exactly as it will be saved,
// and drawn. The boxes laid over it are only handles for selecting, dragging and resizing.
import { baseToView, viewToBase, turn, textBox, SIZE_MIN, SIZE_MAX, type Mark, type TextMark, type ShapeMark, type RedactMark, type Quarter, type Measurer } from "./marks.ts";
import type { PageItem } from "./session.ts";

export type EditorHost = {
  root: HTMLElement;
  page(i: number): PageItem | undefined;
  count(): number;
  /** Size in points of the page as the file shows it, before any turn made in this tool. */
  baseSize(p: PageItem): Promise<{ w: number; h: number }>;
  /** Draws the page as it will be saved (turned, with its marks) at `pxPerPoint`. */
  draw(p: PageItem, pxPerPoint: number): Promise<HTMLCanvasElement>;
  font(m: TextMark): Measurer;
  cantDraw(m: TextMark): string[];
  /** Replaces the page's marks. `quiet` = part of the same edit as the last call (one Undo step). */
  setMarks(i: number, marks: Mark[], quiet?: boolean): void;
  addPicture(file: File): Promise<{ id: string; width: number; height: number } | null>;
  onClose(): void;
  say(text: string, kind?: "info" | "bad" | "warn"): void;
};

export function createEditor(host: EditorHost) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => host.root.querySelector<T>(`#${id}`)!;
  const stage = $("edStage"), layer = $("edLayer"), props = $("markProps");
  let index = -1, chosen = -1, base = { w: 1, h: 1 }, run = 0, typing = false;
  const page = () => host.page(index);
  const marks = () => page()?.marks ?? [];
  const turned = () => (page()?.rotate ?? 0) as Quarter;
  const view = () => (turned() % 180 ? { w: base.h, h: base.w } : { w: base.w, h: base.h });
  const cssPerPoint = () => stage.clientWidth / view().w;
  const upright = () => (360 - turned()) % 360;                 // stored angle that looks level on the turned page
  const sizeOf = (m: Mark) => (m.type === "text" ? textBox(m, host.font(m)) : { w: m.w, h: Math.max(m.h, m.type === "shape" && m.shape === "line" ? 8 : 0) });
  const q = <T extends HTMLElement = HTMLElement>(id: string) => host.root.querySelector<T>(`#${id}`);
  const NAMES: Record<string, string> = { text: "Added text", image: "Added picture", ink: "Freehand line", rect: "Rectangle", ellipse: "Ellipse", line: "Line", redact: "Area to remove" };
  const least = (m: Mark) => (m.type === "redact" ? 2 : 8);    // smallest size a drag can leave, in points (an area may cover one small letter)

  function change(next: Mark[], quiet = false) { host.setMarks(index, next, quiet); }
  function update(patch: Partial<TextMark> & Partial<Mark>, quiet = false) {
    const m = marks()[chosen]; if (!m) return;
    change(marks().map((x, k) => (k === chosen ? ({ ...x, ...patch } as Mark) : x)), quiet);
  }

  async function refresh() {
    const p = page();
    if (!p) return close();
    const mine = ++run;
    $("edWhere").innerHTML = `<span class="wide">Page </span>${index + 1} of ${host.count()}`;
    $<HTMLButtonElement>("edPrev").disabled = index <= 0; $<HTMLButtonElement>("edNext").disabled = index >= host.count() - 1;
    try {
      base = await host.baseSize(p);
      let canvas: HTMLCanvasElement;
      const zoom = (stage.clientWidth / view().w) * Math.min(2, window.devicePixelRatio || 1);
      try { canvas = await host.draw(p, zoom); host.say(""); }
      catch (e) {                                              // e.g. a character that can't be written: show the page without additions
        host.say(e instanceof Error ? e.message : String(e), "bad");
        canvas = await host.draw({ ...p, marks: undefined }, zoom);
      }
      if (mine !== run) return;
      canvas.id = "edCanvas"; stage.querySelector("canvas")?.replaceWith(canvas);
    } catch (e) { console.error(e); host.say("This page couldn't be drawn.", "bad"); }
    drawHandles(); showProps();
  }

  function drawHandles() {
    const z = cssPerPoint(), T = turned();
    layer.replaceChildren(...marks().map((m, k) => {
      const at = baseToView(m.x, m.y, base.w, base.h, T), s = sizeOf(m);
      const box = document.createElement("div");
      box.className = `mark${m.type === "redact" ? " area" : ""}${k === chosen ? " sel" : ""}`; box.dataset.k = String(k); box.tabIndex = 0;
      box.setAttribute("role", "button");
      box.setAttribute("aria-label", m.type === "text" ? `Added text: ${m.text.slice(0, 40)}` : NAMES[m.type === "shape" ? m.shape : m.type]);
      Object.assign(box.style, { left: `${at.x * z}px`, top: `${at.y * z}px`, width: `${s.w * z}px`, height: `${s.h * z}px`, transform: `rotate(${m.rotate + T}deg)` });
      if (k === chosen) { const grip = document.createElement("span"); grip.className = "grip"; grip.title = "Drag to resize"; box.append(grip); }
      return box;
    }));
  }

  let focusText = false;
  let shownFor = -1;                                           // the addition whose settings were last opened
  function showProps() {
    const m = marks()[chosen];
    props.hidden = !m;
    host.root.classList.toggle("sheet", !!m);
    if (!m) { shownFor = -1; return; }
    const opened = shownFor !== chosen; shownFor = chosen;
    if (opened && window.matchMedia("(max-width: 760px)").matches) requestAnimationFrame(() => {   // on a phone the settings cover the bottom of the screen: keep the addition above them
      const box = layer.querySelector<HTMLElement>(`.mark[data-k="${chosen}"]`)?.getBoundingClientRect(), sheet = props.getBoundingClientRect();
      if (box && box.bottom > sheet.top - 8) window.scrollBy({ top: box.bottom - sheet.top + 24 });
    });
    const isText = m.type === "text";
    host.root.querySelectorAll<HTMLElement>("#markProps [data-for]").forEach((e) => (e.hidden = !(e.dataset.for ?? "").split(" ").includes(m.type)));
    const set = (id: string, v: string) => { const e = $<HTMLInputElement>(id); if (document.activeElement !== e) e.value = v; };
    set("mRotate", String(((Math.round(m.rotate + turned()) % 360) + 360) % 360));
    const del = q("mDelete"); if (del) del.textContent = m.type === "redact" ? "Remove this area" : "Remove this addition";
    const term = q("mTerm"); if (term) term.textContent = m.type === "redact" && m.term ? `, placed by finding \u201c${m.term}\u201d` : "";
    if (m.type === "shape" || m.type === "ink") {
      set("mStroke", m.color); set("mLine", String(m.width)); set("mOpacity", String(Math.round((m.opacity ?? 1) * 100)));
      const note = q("mOpacityNote"); if (note) note.textContent = `${Math.round((m.opacity ?? 1) * 100)}%`;
      if (m.type === "shape") {
        const fo = q<HTMLInputElement>("mFillOn")!; fo.checked = !!m.fill; fo.disabled = m.shape === "line"; set("mFill", m.fill || "#ffeb3b");
        q("mFillOn")!.closest("p")!.hidden = m.shape === "line"; q("mFlipRow")!.hidden = m.shape !== "line";
        q<HTMLInputElement>("mFlip")!.checked = !!m.flip;
      }
    }
    if (isText) {
      set("mText", m.text);
      if (focusText) { focusText = false; const t = $<HTMLTextAreaElement>("mText"); t.focus({ preventScroll: true }); t.select(); }
      set("mSize", String(m.size)); set("mColor", m.color); set("mFont", m.font);
      $<HTMLInputElement>("mBold").checked = m.bold;
      const bad = host.cantDraw(m), warn = $("mWarn");
      warn.hidden = !bad.length;
      warn.textContent = !bad.length ? "" : m.font === "own"
        ? `Your font has no letters for: ${bad.slice(0, 12).join(" ")}. Choose a font that covers them, or remove them to save.`
        : m.font === "noto"
          ? `The Noto fonts on this site have no letters for: ${bad.slice(0, 12).join(" ")}. For these (for example Chinese, Japanese or Korean), choose \u201cYour own font\u201d.`
          : `The built-in fonts can't write: ${bad.slice(0, 12).join(" ")}. They cover Western European letters. For other alphabets choose \u201cNoto Sans (many alphabets)\u201d or \u201cYour own font\u201d in the Font list.`;
    }
  }

  // ----- pointer: select, drag to move, drag the grip to resize a picture -----
  let drag: { k: number; x0: number; y0: number; box: HTMLElement; grip: boolean; moved: boolean } | null = null;
  layer.addEventListener("pointerdown", (e) => {
    const box = (e.target as Element).closest<HTMLElement>(".mark"); if (!box) return;
    e.preventDefault();
    const k = Number(box.dataset.k), grip = (e.target as Element).classList.contains("grip");
    if (k !== chosen) { chosen = k; typing = false; drawHandles(); showProps(); }
    const live = layer.querySelector<HTMLElement>(`.mark[data-k="${k}"]`)!;
    drag = { k, x0: e.clientX, y0: e.clientY, box: live, grip, moved: false };
    live.setPointerCapture(e.pointerId);
    live.focus({ preventScroll: true });   // so the arrow keys and Delete act on it (the handles were just redrawn)
  });
  layer.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0, m = marks()[drag.k]; if (!m) return;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    if (drag.grip && m.type === "text") {        // a text's corner square changes its size
      const d = turn(dx, dy, -(m.rotate + turned())), z = cssPerPoint(), s = sizeOf(m), k = textScale(m, s.w, d.dx / z);
      drag.box.style.width = `${s.w * k * z}px`; drag.box.style.height = `${s.h * k * z}px`;
    } else if (drag.grip && m.type !== "text") {
      const d = turn(dx, dy, -(m.rotate + turned())), z = cssPerPoint();
      const w = Math.max(least(m), m.w + d.dx / z), h = m.type === "image" ? (w * m.h) / m.w : Math.max(least(m), m.h + d.dy / z);
      drag.box.style.width = `${w * z}px`; drag.box.style.height = `${h * z}px`;
    } else drag.box.style.translate = `${dx}px ${dy}px`;
  });
  const drop = (e: PointerEvent) => {
    if (!drag) return;
    const d = drag, dx = e.clientX - d.x0, dy = e.clientY - d.y0, m = marks()[d.k]; drag = null;
    if (!m || !d.moved) return;
    const z = cssPerPoint();
    if (d.grip && m.type === "text") {
      const t = turn(dx, dy, -(m.rotate + turned()));
      update({ size: Math.round(m.size * textScale(m, sizeOf(m).w, t.dx / z) * 2) / 2 });
    } else if (d.grip && m.type !== "text") {
      const t = turn(dx, dy, -(m.rotate + turned())), w = Math.max(least(m), m.w + t.dx / z);
      update({ w, h: m.type === "image" ? (w * m.h) / m.w : Math.max(least(m), m.h + t.dy / z) });
    }
    else { const b = turn(dx / z, dy / z, -turned()); update({ x: m.x + b.dx, y: m.y + b.dy }); }
    requestAnimationFrame(() => layer.querySelector<HTMLElement>(`.mark[data-k="${d.k}"]`)?.focus({ preventScroll: true }));
  };
  layer.addEventListener("pointerup", drop); layer.addEventListener("pointercancel", () => { drag = null; drawHandles(); });
  stage.addEventListener("pointerdown", (e) => { if (e.target === stage || (e.target as Element).tagName === "CANVAS" || e.target === layer) { chosen = -1; typing = false; drawHandles(); showProps(); } });
  layer.addEventListener("focusin", (e) => { const box = (e.target as Element).closest<HTMLElement>(".mark"); if (box && Number(box.dataset.k) !== chosen && !drag) { chosen = Number(box.dataset.k); typing = false; drawHandles(); showProps(); layer.querySelector<HTMLElement>(`.mark[data-k="${chosen}"]`)?.focus(); } });
  layer.addEventListener("keydown", (e) => {
    const m = marks()[chosen]; if (!m) return;
    const step = e.shiftKey ? 10 : 1, by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
    else if (by[e.key]) { e.preventDefault(); const b = turn(by[e.key][0], by[e.key][1], -turned()); update({ x: m.x + b.dx, y: m.y + b.dy }); requestAnimationFrame(() => layer.querySelector<HTMLElement>(`.mark[data-k="${chosen}"]`)?.focus()); }
  });

  /** How much a drag of `dx` points on a text's corner square scales it, keeping its size within the allowed range. */
  function textScale(m: TextMark, w: number, dx: number) {
    const k = Math.max(0.05, (w + dx) / Math.max(1, w));
    return Math.min(SIZE_MAX / m.size, Math.max(SIZE_MIN / m.size, k));
  }

  /** Where a new addition `w` × `h` points (as the page is shown) goes: in the middle of the part of the page that
   *  is on screen, so it appears where you are looking even when zoomed in or scrolled down a long page; moved down
   *  (or up) past the additions already there, so it doesn't land on top of one of them. */
  function spot(w: number, h: number) {
    const v = view(), z = cssPerPoint(), r = stage.getBoundingClientRect(), sc = (q("edScroll") ?? stage).getBoundingClientRect();
    const bar = q("editor")?.querySelector(".bar")?.getBoundingClientRect();
    const left = Math.max(r.left, sc.left, 0), right = Math.min(r.right, sc.right, window.innerWidth);
    const top = Math.max(r.top, sc.top, bar && bar.bottom > 0 ? bar.bottom : 0), bottom = Math.min(r.bottom, sc.bottom, window.innerHeight);
    const seen = right - left > 40 && bottom - top > 40;
    const cx = seen ? ((left + right) / 2 - r.left) / z : v.w / 2, cy = seen ? ((top + bottom) / 2 - r.top) / z : v.h / 2;
    const clamp = (a: number, hi: number) => Math.min(Math.max(0, hi), Math.max(0, a));
    const x = clamp(cx - w / 2, v.w - w);
    const boxes = marks().map((m) => { const at = baseToView(m.x, m.y, base.w, base.h, turned()), s = sizeOf(m); return { x: at.x, y: at.y, w: s.w, h: s.h }; });
    const free = (y: number) => boxes.every((b) => x + w <= b.x || b.x + b.w <= x || y + h <= b.y || b.y + b.h <= y);
    const step = Math.max(h, 12) + 6;
    let y = clamp(cy - h / 2, v.h - h);
    for (let k = 1; k < 40 && !free(y); k++) {                // try below, then above, further each time
      const t = cy - h / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
      if (t >= 0 && t + h <= v.h) y = t;
    }
    return viewToBase(x, y, base.w, base.h, turned());
  }
  /** Adds `m` and selects it. */
  function add(m: Mark) { chosen = marks().length; typing = false; change([...marks(), m]); }

  function remove() { const k = chosen; chosen = -1; change(marks().filter((_, i) => i !== k)); }

  // ----- adding -----
  q("edText")?.addEventListener("click", () => {
    const v = view(), size = Math.max(8, Math.round(v.w / 40)), draft: TextMark = { type: "text", x: 0, y: 0, rotate: upright(), text: "Your text", size, color: "#000000", font: "sans", bold: false };
    const s = sizeOf(draft), at = spot(s.w, s.h);
    add({ ...draft, x: at.x, y: at.y });
    focusText = true;                                          // put the cursor in its Text box once that is shown
  });
  const picker = q<HTMLInputElement>("stampPicker");
  /** Adds a picture to the page being edited, near its top-left, `share` of the page's width wide. */
  async function placePicture(f: File, share = 1 / 3) {
    const pic = await host.addPicture(f); if (!pic) return;
    const v = view(), w = Math.min(v.w * share, (v.h * 0.5 * pic.width) / pic.height), h = (w * pic.height) / pic.width, at = spot(w, h);
    add({ type: "image", x: at.x, y: at.y, rotate: upright(), w, h, src: pic.id });
  }
  picker?.addEventListener("change", () => { const f = picker.files?.[0]; picker.value = ""; if (f) placePicture(f); });

  // ----- for forms: a tick, a cross, today's date -----
  // A tick or cross is drawn as a line (not a letter), so it needs no font and can be resized freely.
  const MARKS_FOR: Record<string, number[][]> = { tick: [[0, 0.55, 0.36, 1, 1, 0]], cross: [[0, 0, 1, 1], [1, 0, 0, 1]] };
  function addSign(kind: "tick" | "cross") {
    const side = Math.max(8, Math.round(view().w / 50)), at = spot(side, side);
    add({ type: "ink", x: at.x, y: at.y, rotate: upright(), w: side, h: side, strokes: MARKS_FOR[kind], color: "#000000", width: Math.max(1, side / 8) });
  }
  q("edTick")?.addEventListener("click", () => addSign("tick"));
  q("edCross")?.addEventListener("click", () => addSign("cross"));
  q("edDate")?.addEventListener("click", () => {
    // in the order this browser's language setting writes dates (for example 25/11/2026 in British English), digits as 0–9
    const text = today(), v = view(), draft: TextMark = { type: "text", x: 0, y: 0, rotate: upright(), text, size: Math.max(8, Math.round(v.w / 50)), color: "#000000", font: "sans", bold: false };
    const s = sizeOf(draft), at = spot(s.w, s.h);
    add({ ...draft, x: at.x, y: at.y });
  });

  // ----- areas to remove (Redact PDF): drag a rectangle over the page -----
  let marking = false, area: { x0: number; y0: number; div: HTMLElement } | null = null;
  const setMarking = (on: boolean) => {
    const b = q("edArea"); if (!b) return;
    marking = on; layer.classList.toggle("drawing", on); const bar = q("areaBar"); if (bar) bar.hidden = !on;
    b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "✓ Stop marking" : "▮ Mark areas";
    if (on) { chosen = -1; drawHandles(); showProps(); }
  };
  q("edArea")?.addEventListener("click", () => setMarking(!marking));
  layer.addEventListener("pointerdown", (e) => {
    if (!marking || (e.target as Element).closest(".mark")) return;
    e.preventDefault(); layer.setPointerCapture(e.pointerId);
    const r = layer.getBoundingClientRect(), div = document.createElement("div"); div.className = "mark area live";
    area = { x0: e.clientX - r.left, y0: e.clientY - r.top, div }; layer.append(div);
  });
  layer.addEventListener("pointermove", (e) => {
    if (!area) return;
    const r = layer.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    Object.assign(area.div.style, { left: `${Math.min(x, area.x0)}px`, top: `${Math.min(y, area.y0)}px`, width: `${Math.abs(x - area.x0)}px`, height: `${Math.abs(y - area.y0)}px` });
  });
  const endArea = (e: PointerEvent) => {
    if (!area) return; const a = area; area = null; a.div.remove();
    const r = layer.getBoundingClientRect(), z = cssPerPoint(), x1 = e.clientX - r.left, y1 = e.clientY - r.top;
    if (Math.abs(x1 - a.x0) < 3 || Math.abs(y1 - a.y0) < 3) return;   // a click, not a drag
    const p = viewToBase(a.x0 / z, a.y0 / z, base.w, base.h, turned()), q2 = viewToBase(x1 / z, y1 / z, base.w, base.h, turned());
    const m: RedactMark = { type: "redact", x: Math.min(p.x, q2.x), y: Math.min(p.y, q2.y), rotate: 0, w: Math.abs(q2.x - p.x), h: Math.abs(q2.y - p.y) };
    chosen = marks().length; change([...marks(), m]);
  };
  layer.addEventListener("pointerup", endArea); layer.addEventListener("pointercancel", () => { area?.div.remove(); area = null; });

  // ----- shapes, highlights and freehand lines -----
  function addShape(shape: ShapeMark["shape"], highlight = false) {
    const v = view();
    const w = v.w * (highlight ? 0.4 : 0.3), h = highlight ? Math.max(12, v.h * 0.025) : shape === "line" ? v.h * 0.08 : v.h * 0.15, at = spot(w, h);
    const m: ShapeMark = highlight
      ? { type: "shape", shape: "rect", x: at.x, y: at.y, rotate: upright(), w, h, color: "#ffeb3b", fill: "#ffeb3b", width: 0, opacity: 0.4 }
      : { type: "shape", shape, x: at.x, y: at.y, rotate: upright(), w, h, color: "#c00000", fill: "", width: 2 };
    add(m);
  }
  q("edRect")?.addEventListener("click", () => addShape("rect")); q("edEllipse")?.addEventListener("click", () => addShape("ellipse"));
  q("edLine")?.addEventListener("click", () => addShape("line")); q("edHi")?.addEventListener("click", () => addShape("rect", true));
  let drawing = false, pen: { x: number; y: number }[] | null = null;
  const setDrawing = (on: boolean) => {
    const b = q("edDraw"), bar = q("penBar"); if (!b || !bar) return;                // (absent on pages without the shapes tools)
    drawing = on; layer.classList.toggle("drawing", on); bar.hidden = !on;
    b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "✓ Stop drawing" : "✎ Draw";
    if (on) { chosen = -1; drawHandles(); showProps(); }
  };
  q("edDraw")?.addEventListener("click", () => setDrawing(!drawing));
  const livePath = () => { let svg = layer.querySelector("svg"); if (!svg) { svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.append(document.createElementNS("http://www.w3.org/2000/svg", "polyline")); layer.append(svg); } return svg.firstChild as SVGPolylineElement; };
  layer.addEventListener("pointerdown", (e) => {
    if (!drawing || (e.target as Element).closest(".mark")) return;
    e.preventDefault(); layer.setPointerCapture(e.pointerId);
    const r = layer.getBoundingClientRect(); pen = [{ x: e.clientX - r.left, y: e.clientY - r.top }];
  });
  layer.addEventListener("pointermove", (e) => {
    if (!drawing || !pen) return;
    const r = layer.getBoundingClientRect(); pen.push({ x: e.clientX - r.left, y: e.clientY - r.top });
    const pl = livePath(); pl.setAttribute("points", pen.map((p) => `${p.x},${p.y}`).join(" "));
    pl.setAttribute("fill", "none"); pl.setAttribute("stroke", q<HTMLInputElement>("penColor")!.value); pl.setAttribute("stroke-linecap", "round"); pl.setAttribute("stroke-linejoin", "round");
    pl.setAttribute("stroke-width", String(Number(q<HTMLSelectElement>("penWidth")!.value) * cssPerPoint()));
  });
  const endPen = () => {
    if (!pen) return; const pts = pen; pen = null; layer.querySelector("svg")?.remove();
    const z = cssPerPoint(); if (!pts.length) return;
    const xs = pts.map((p) => p.x / z), ys = pts.map((p) => p.y / z);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(1, Math.max(...xs) - x0), h = Math.max(1, Math.max(...ys) - y0);
    const stroke = pts.flatMap((p) => [Math.min(1, Math.max(0, (p.x / z - x0) / w)), Math.min(1, Math.max(0, (p.y / z - y0) / h))]).map((n) => Math.round(n * 1000) / 1000);
    // thin the stroke: drop points closer than a third of a point to the last kept one
    const kept: number[] = [stroke[0], stroke[1]];
    for (let i = 2; i < stroke.length - 2; i += 2) if (Math.hypot((stroke[i] - kept[kept.length - 2]) * w, (stroke[i + 1] - kept[kept.length - 1]) * h) > 0.33) kept.push(stroke[i], stroke[i + 1]);
    if (stroke.length > 2) kept.push(stroke[stroke.length - 2], stroke[stroke.length - 1]);
    const at = viewToBase(x0, y0, base.w, base.h, turned());
    chosen = marks().length; typing = false;
    change([...marks(), { type: "ink", x: at.x, y: at.y, rotate: upright(), w, h, strokes: [kept.slice(0, 20000)], color: q<HTMLInputElement>("penColor")!.value, width: Number(q<HTMLSelectElement>("penWidth")!.value) }]);
  };
  layer.addEventListener("pointerup", endPen); layer.addEventListener("pointercancel", () => { pen = null; layer.querySelector("svg")?.remove(); });

  // ----- the properties panel -----
  const num = (id: string, lo: number, hi: number) => { const v = Number($<HTMLInputElement>(id).value); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null; };
  props.addEventListener("input", (e) => {
    const id = (e.target as HTMLElement).id, m = marks()[chosen]; if (!m) return;
    const quiet = typing; typing = true;                       // one Undo step per burst of edits to the same mark
    if (id === "mRotate") { const v = num("mRotate", -360, 360); if (v !== null) update({ rotate: (((v - turned()) % 360) + 360) % 360 }, quiet); }
    if (m.type === "shape" || m.type === "ink") {
      if (id === "mStroke") update({ color: $<HTMLInputElement>("mStroke").value }, quiet);
      if (id === "mLine") { const v = num("mLine", m.type === "ink" ? 0.1 : 0, 100); if (v !== null) update({ width: v }, quiet); }
      if (id === "mOpacity") { const v = num("mOpacity", 5, 100); if (v !== null) update({ opacity: v >= 100 ? undefined : v / 100 }, quiet); }
      if (m.type === "shape") {
        if (id === "mFillOn" || id === "mFill") update({ fill: $<HTMLInputElement>("mFillOn").checked ? $<HTMLInputElement>("mFill").value : "" }, quiet);
        if (id === "mFlip") update({ flip: $<HTMLInputElement>("mFlip").checked || undefined }, quiet);
      }
    }
    if (m.type !== "text") return;
    if (id === "mText") update({ text: $<HTMLTextAreaElement>("mText").value }, quiet);
    if (id === "mSize") { const v = num("mSize", SIZE_MIN, SIZE_MAX); if (v !== null) update({ size: v }, quiet); }
    if (id === "mColor") update({ color: $<HTMLInputElement>("mColor").value }, quiet);
    if (id === "mFont") update({ font: $<HTMLSelectElement>("mFont").value as TextMark["font"] }, quiet);
    if (id === "mBold") update({ bold: $<HTMLInputElement>("mBold").checked }, quiet);
  });
  props.addEventListener("focusout", () => { typing = false; });
  $("mDelete").addEventListener("click", remove);
  q("mDone")?.addEventListener("click", () => { chosen = -1; typing = false; drawHandles(); showProps(); });

  // ----- zoom: makes the page wider than the screen (it then scrolls), and draws it sharper -----
  const ZOOMS = [1, 1.5, 2, 3, 4];
  let zoomAt = 0;
  function setZoom(k: number) {
    const before = ZOOMS[zoomAt], sc = q("edScroll");
    zoomAt = Math.max(0, Math.min(ZOOMS.length - 1, k));
    const z = ZOOMS[zoomAt]; stage.style.width = z === 1 ? "" : `${z * 100}%`;
    const note = q("edZoomNote"); if (note) note.textContent = `${Math.round(z * 100)}%`;
    q<HTMLButtonElement>("edZoomOut")!.disabled = zoomAt === 0; q<HTMLButtonElement>("edZoomIn")!.disabled = zoomAt === ZOOMS.length - 1;
    if (sc && before !== z) {                                  // keep the middle of what was on screen in the middle
      const mid = (sc.scrollLeft + sc.clientWidth / 2) / before; sc.scrollLeft = mid * z - sc.clientWidth / 2;
    }
    drawHandles(); void refresh();
  }
  q("edZoomIn")?.addEventListener("click", () => setZoom(zoomAt + 1));
  q("edZoomOut")?.addEventListener("click", () => setZoom(zoomAt - 1));

  // ----- moving between pages -----
  function open(i: number) { index = i; chosen = -1; typing = false; $("editor").hidden = false; $("gridView").hidden = true; refresh(); }
  function close() { setDrawing(false); setMarking(false); index = -1; chosen = -1; $("editor").hidden = true; $("gridView").hidden = false; props.hidden = true; host.root.classList.remove("sheet"); host.onClose(); }
  $("edBack").addEventListener("click", close);
  $("edPrev").addEventListener("click", () => { if (index > 0) open(index - 1); });
  $("edNext").addEventListener("click", () => { if (index < host.count() - 1) open(index + 1); });
  let resizeTimer = 0;
  window.addEventListener("resize", () => { if (index < 0) return; clearTimeout(resizeTimer); resizeTimer = window.setTimeout(refresh, 200); });

  return { open, close, refresh, placePicture, isOpen: () => index >= 0, current: () => index, select: (k: number) => { chosen = k; } };
}

/** Today's date as this browser's language setting writes it, with digits 0–9 (which every font on this site has). */
export function today(now = new Date(), locale?: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", numberingSystem: "latn" }).format(now).replace(/[\u200e\u200f\u061c]/g, "");   // without the invisible direction marks some languages put in dates
}
