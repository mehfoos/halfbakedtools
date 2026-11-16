// The tool's browser interface. Calculations and file handling live in the other modules; this file wires
// them to the page. Nothing here sends data anywhere: files are read with the browser's File API, kept in
// memory, and results are handed back as downloads created inside the page.
import { zipSync } from "fflate";
import { PDFDocument } from "@cantoo/pdf-lib";
import { NO_COMPRESSION, PRESETS, saving, greyInPlace, type CompressOptions, type CompressStats } from "./compress-core.ts";
import { recompressImages } from "./compress.ts";
import {
  emptySession, addSource, removeSource, nudge, moveTo, duplicate, remove, rotate, setScale, planFiles, safeName,
  serialise, parseSettings, defaultName, clashes, setMarks, usage, SCALE_MIN, SCALE_MAX, DPI_MIN, DPI_MAX,
  type Session, type PageItem, type Edit, type OutputFormat, type SplitMode, type Rotation, type SourceRef,
} from "./session.ts";
import { parsePageList, formatRanges } from "./ranges.ts";
import { makeBuilder, inspectPdf, protect, fontSet, cantDraw, type SourceData } from "./build.ts";
import { createEditor } from "./editor.ts";
import type { Mark } from "./marks.ts";
import { encodeBmp } from "./bmp.ts";
import { pagesToText } from "./text.ts";
import { jpegOrientation, orientationToRotation } from "./exif.ts";
import { taskBySlug, type Part } from "./tasks.ts";
import { openPdf, closePdf, drawPage, pageText, pageSize, decodeImage, canvasBlob, NeedsPassword, type Handle } from "./render.ts";

// The TIFF library is only fetched (from this site) when a TIFF is read or written.
const utif = async () => { const m = await import("utif2"); return ((m as { default?: typeof m }).default ?? m); };
type Loaded = { data: SourceData; handle: Handle; usedPassword: boolean; restricted?: boolean };
const THUMB = 150; // longest side of a preview, in CSS pixels

export function start(root: HTMLElement, vendor: string, taskSlug: string) {
  const task = taskBySlug(taskSlug);
  const can = (p: Part) => task.parts.includes(p);
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const fresh = (): Session => { const s = emptySession(); return { ...s, output: { ...s.output, format: task.formats[0], split: can("split") ? task.split ?? "none" : "none", compress: { ...(task.slug === "compress" ? PRESETS.recommended : NO_COMPRESSION) } } }; };
  type Level = "none" | keyof typeof PRESETS | "custom";
  const levelOf = (c: CompressOptions): Level => c.mode === "none" ? "none" : (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).find((k) => JSON.stringify(PRESETS[k]) === JSON.stringify(c)) ?? "custom";
  let level: Level = task.slug === "compress" ? "recommended" : "none";
  let session: Session = fresh();
  const loaded = new Map<string, Loaded>();      // by SHA-256 of the file, so it survives loading a settings file
  let sel = new Set<number>();
  let anchor = -1;                               // last page ticked, for shift-click ranges
  const undo: { pages: PageItem[]; sel: number[] }[] = [];
  const thumbs = new Map<string, string>();      // "sha:page" -> preview image address (inside the page)
  let busy = false;

  const src = (id: string) => session.sources.find((s) => s.id === id)!;
  const has = (p: PageItem) => loaded.has(src(p.src).sha256);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => {
    const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e;
  };

  // ---------- messages ----------
  const status = $("status");
  function say(text: string, kind: "info" | "bad" | "warn" = "info") {
    status.hidden = !text; status.textContent = text;
    status.className = `notice ${kind === "warn" ? "" : kind}`;
  }
  async function work<T>(label: string, job: (progress: (t: string) => void) => Promise<T>): Promise<T | undefined> {
    if (busy) return;
    busy = true; root.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = true));
    say(label);
    try { return await job((t) => say(t)); }
    catch (e) { console.error(e); say(e instanceof Error ? e.message : String(e), "bad"); }
    finally { busy = false; root.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = false)); refreshButtons(); }
  }

  // ---------- adding files ----------
  const sha256 = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const isPdf = (b: Uint8Array) => { for (let i = 0; i < Math.min(1024, b.length - 4); i++) if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46) return true; return false; };
  const isTiff = (b: Uint8Array) => (b[0] === 0x49 && b[1] === 0x49 && b[2] === 42 && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 42);
  const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;

  async function loadPdf(name: string, bytes: Uint8Array): Promise<Loaded & { pages: number } | null> {
    let password: string | undefined;
    for (;;) {
      try {
        const doc = await openPdf(bytes, vendor, password);
        // The writer library must be able to open it too; a file with an owner password only opens with "".
        let pw = password;
        try { await inspectPdf(bytes, pw); }
        catch (e) { if (pw !== undefined) throw e; pw = ""; await inspectPdf(bytes, pw); }
        return { data: { kind: "pdf", bytes, password: pw }, handle: { kind: "pdf", doc }, usedPassword: password !== undefined, restricted: password === undefined && pw !== undefined, pages: doc.numPages };
      } catch (e) {
        if (!(e instanceof NeedsPassword)) throw e;
        const typed = window.prompt(`${e.wrong ? "That password didn't work. " : ""}"${name}" is protected. Type its password to open it (it stays in this browser tab and is not saved in the settings file):`);
        if (typed === null) return null;
        password = typed;
      }
    }
  }

  /** `upright`: store a sideways photo already turned (for pictures placed on a page, which have no page to turn). */
  async function loadImage(bytes: Uint8Array, type: string, upright = false): Promise<Loaded> {
    const toPng = async (c: HTMLCanvasElement) => new Uint8Array(await (await canvasBlob(c, "image/png")).arrayBuffer());
    const canvasOf = (img: CanvasImageSource, w: number, h: number) => { const c = el("canvas", { width: w, height: h }); c.getContext("2d")!.drawImage(img, 0, 0); return c; };
    if (isTiff(bytes)) {
      const UTIF = await utif();
      const buf = bytes.slice().buffer;
      const ifd = UTIF.decode(buf).find((d: { [k: string]: unknown }) => d.t256 && d.t257) ?? UTIF.decode(buf)[0];
      if (!ifd) throw new Error("no image in TIFF");
      UTIF.decodeImage(buf, ifd);
      const rgba = UTIF.toRGBA8(ifd), w = ifd.width, h = ifd.height;
      const c = el("canvas", { width: w, height: h });
      c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, w * h * 4), w, h), 0, 0);
      return { data: { kind: "image", bytes: await toPng(c), type: "png" }, handle: { kind: "image", img: await createImageBitmap(c), width: w, height: h, turn: 0 }, usedPassword: false };
    }
    const { img, width, height } = await decodeImage(new Blob([bytes as BlobPart], { type }));
    if (isJpeg(bytes)) {
      const turn = orientationToRotation(jpegOrientation(bytes));
      // The JPEG goes into the PDF untouched (no quality loss); the page is turned to match the photo's orientation note.
      if (turn !== null && !(upright && turn !== 0)) return { data: { kind: "image", bytes, type: "jpeg", turn }, handle: { kind: "image", img, width, height, turn }, usedPassword: false };
    } else if (isPng(bytes)) {
      return { data: { kind: "image", bytes, type: "png" }, handle: { kind: "image", img, width, height, turn: 0 }, usedPassword: false };
    }
    // Other formats (and mirrored photos) are redrawn and stored as PNG, which keeps every pixel.
    return { data: { kind: "image", bytes: await toPng(canvasOf(img, width, height)), type: "png" }, handle: { kind: "image", img, width, height, turn: 0 }, usedPassword: false };
  }

  async function addFiles(files: File[]) {
    if (!files.length) return;
    clearResult();
    await work("Reading files…", async (progress) => {
      const notes: string[] = [];
      for (const f of files) {
        progress(`Reading ${f.name}…`);
        const bytes = new Uint8Array(await f.arrayBuffer());
        const sha = await sha256(bytes);
        if (loaded.has(sha)) { notes.push(`"${f.name}" is already added (to repeat pages, use Duplicate).`); continue; }
        let item: Loaded, pages = 1;
        try {
          if (isPdf(bytes) ? task.accept === "image" : task.accept === "pdf") {
            notes.push(`"${f.name}" was skipped: this page takes ${task.accept === "pdf" ? "PDF files" : "images"} only.`); continue;
          }
          if (isPdf(bytes)) {
            const r = await loadPdf(f.name, bytes);
            if (!r) { notes.push(`"${f.name}" was skipped (no password given).`); continue; }
            item = r; pages = r.pages;
            if (task.slug === "unlock" && !r.restricted && !r.usedPassword) notes.push(`"${f.name}" has no password or lock, so there is nothing to unlock.`);
            if (r.restricted) notes.push(`"${f.name}" is locked by its author against some changes, though it opens without a password. Files saved from it will not carry that lock.`);
            if (r.usedPassword) notes.push(`"${f.name}" was opened with its password. Files saved from it will not be password-protected.`);
          } else {
            item = await loadImage(bytes, f.type);
            if (isTiff(bytes)) notes.push(`"${f.name}": only the first image in a TIFF file is used.`);
          }
        } catch (e) {
          console.error(e);
          notes.push(`"${f.name}" couldn't be read. It may be damaged, or a kind of file this tool doesn't handle yet (it takes PDFs and images).`);
          continue;
        }
        const waiting = session.sources.find((s) => s.sha256 === sha);
        if (!waiting) {
          const stale = session.sources.find((s) => !loaded.has(s.sha256) && s.name === f.name);
          if (stale) notes.push(`"${f.name}" has the same name as a file the settings need, but its contents differ, so it was added as a new file.`);
        }
        loaded.set(sha, item);
        const r = addSource(session, { name: f.name, size: bytes.length, sha256: sha, pages, kind: item.data.kind });
        if (!r.matched) { remember(); if (!session.pages.length && session.output.name === "document") r.session.output.name = defaultName(f.name, task.suffix); }
        session = r.session;
      }
      render();
      say(notes.join(" "), notes.length ? "warn" : "info");
      if (task.slug === "edit" && editor && !editor.isOpen() && session.pages.length && has(session.pages[0])) editor.open(0);
    });
  }

  // ---------- page edits ----------
  function remember() { undo.push({ pages: session.pages, sel: [...sel] }); if (undo.length > 100) undo.shift(); }
  function apply(e: Edit) { remember(); session = { ...session, pages: e.pages }; sel = new Set(e.sel); render(); say(""); }
  const chosen = () => [...sel].sort((a, b) => a - b);
  const everyPage = () => session.pages.map((_, i) => i);
  function turn(by: number) {
    const keep = [...sel];
    apply(rotate(session.pages, sel.size || !task.turnAllIfNoneSelected ? chosen() : everyPage(), by));
    sel = new Set(keep); render();
  }
  const act: Record<string, () => void> = {
    earlier: () => apply(nudge(session.pages, chosen(), -1)),
    later: () => apply(nudge(session.pages, chosen(), 1)),
    left: () => turn(-90),
    right: () => turn(90),
    duplicate: () => apply(duplicate(session.pages, chosen())),
    remove: () => apply(remove(session.pages, chosen())),
    all: () => { sel = new Set(session.pages.map((_, i) => i)); render(); },
    none: () => { sel = new Set(); render(); },
    undo: () => { const u = undo.pop(); if (u) { session = { ...session, pages: u.pages.filter((p) => session.sources.some((s) => s.id === p.src)) }; sel = new Set(u.sel.filter((i) => i < session.pages.length)); render(); } },
    moveTo: () => {
      const n = Number($<HTMLInputElement>("movePos").value);
      if (!Number.isInteger(n) || n < 1 || n > session.pages.length + 1) return say(`Type a position from 1 to ${session.pages.length + 1}.`, "bad");
      apply(moveTo(session.pages, chosen(), n - 1));
    },
    selectRange: () => {
      const r = parsePageList($<HTMLInputElement>("selText").value, session.pages.length);
      if (!r.ok) return say(r.error, "bad");
      sel = new Set(r.pages); render(); say("");
    },
    scale: () => {
      const pct = Number($<HTMLInputElement>("scalePct").value);
      if (!(pct >= SCALE_MIN * 100 && pct <= SCALE_MAX * 100)) return say(`Type a size from ${SCALE_MIN * 100}% to ${SCALE_MAX * 100}%.`, "bad");
      apply(setScale(session.pages, sel.size ? chosen() : session.pages.map((_, i) => i), pct / 100));
    },
  };
  root.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-act]");
    if (b && !busy) act[b.dataset.act!]?.();
  });

  // ---------- drawing the page list ----------
  const grid = $("grid");
  const watcher = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { watcher.unobserve(en.target); queue.push(en.target as HTMLElement); pump(); }
  }, { rootMargin: "600px" });
  const queue: HTMLElement[] = [];
  let pumping = false;
  async function pump() {
    if (pumping) return;
    pumping = true;
    while (queue.length) {
      const tile = queue.shift()!;
      if (!tile.isConnected) continue;
      const p = session.pages[Number(tile.dataset.i)];
      const s = p && src(p.src), item = s && loaded.get(s.sha256);
      if (!p || !item) continue;
      const key = `${s.sha256}:${p.page}`;
      try {
        if (!thumbs.has(key)) {
          const size = await pageSize(item.handle, p.page, 72);
          const z = (THUMB * Math.min(2, window.devicePixelRatio || 1)) / Math.max(size.w, size.h);
          const c = await drawPage(item.handle, p.page, 0, { pxPerPoint: z, pxPerImagePx: z });
          thumbs.set(key, URL.createObjectURL(await canvasBlob(c, "image/png")));
        }
        const img = tile.querySelector("img");
        if (img) img.src = thumbs.get(key)!;
      } catch (e) { console.error(e); tile.querySelector(".thumb")!.textContent = "No preview"; }
    }
    pumping = false;
  }

  function render() {
    watcher.disconnect(); queue.length = 0;
    sel = new Set([...sel].filter((i) => i < session.pages.length));
    // files
    const files = $("files");
    files.replaceChildren(...session.sources.map((s) => {
      const ok = loaded.has(s.sha256);
      const n = usage(session, s.id);
      return el("li", { className: ok ? "" : "missing" },
        el("span", {}, `${s.name} `, el("span", { className: "muted small" }, `${s.kind === "pdf" ? `${s.pages} page${s.pages === 1 ? "" : "s"}` : "image"}, ${fmtSize(s.size)}; ${n} in use${ok ? "" : ""}`)),
        ok ? "" : el("strong", { className: "badge-missing" }, " Not added yet: add this file to carry on"),
        " ", Object.assign(el("button", { type: "button", className: "link small" }, "Remove"), { onclick: () => { if (busy) return; remember(); session = removeSource(session, s.id); render(); } }));
    }));
    $("filesBox").hidden = !session.sources.length;
    // tiles
    grid.replaceChildren(...session.pages.map((p, i) => {
      const s = src(p.src), ok = loaded.has(s.sha256);
      const box = el("input", { type: "checkbox", checked: sel.has(i) });
      box.setAttribute("aria-label", `Page ${i + 1}`);
      const img = el("img", { alt: "", draggable: false });
      img.style.transform = `rotate(${p.rotate}deg)`;
      const key = `${s.sha256}:${p.page}`;
      if (thumbs.has(key)) img.src = thumbs.get(key)!;
      const added = p.marks?.length ?? 0;
      const notes = [p.rotate ? `turned ${p.rotate}°` : "", p.scale !== 1 ? `${Math.round(p.scale * 1000) / 10}% size` : "", added ? `${added} addition${added === 1 ? "" : "s"} (not shown in this small preview)` : ""].filter(Boolean).join(", ");
      const tile = el("li", { className: `tile${sel.has(i) ? " on" : ""}`, draggable: true },
        el("label", {},
          el("span", { className: "thumb" }, ok ? img : el("span", { className: "small" }, "File not added yet")),
          el("span", { className: "cap" }, box, el("strong", {}, ` ${i + 1}`)),
          el("span", { className: "from small muted" }, `${s.name}${s.kind === "pdf" ? `, p. ${p.page + 1}` : ""}`),
          notes ? el("span", { className: "from small" }, notes) : ""));
      tile.dataset.i = String(i);
      if (ok && can("marks")) { const b = el("button", { type: "button", className: "small edit" }, added ? "Edit additions" : "Add text or picture"); b.dataset.edit = String(i); tile.append(b); }
      if (ok && !thumbs.has(key)) watcher.observe(tile);
      return tile;
    }));
    $("hero").hidden = !!session.sources.length; $("work").hidden = !session.sources.length;
    // outputs
    const o = session.output;
    $<HTMLInputElement>("outName").value = o.name; $<HTMLSelectElement>("format").value = o.format;
    const put = (id: string, v: string) => { const e = root.querySelector<HTMLInputElement>(`#${id}`); if (e) e.value = v; };
    put("split", o.split); put("every", String(o.every)); put("ranges", o.ranges); put("dpi", String(o.dpi));
    put("quality", String(Math.round(o.quality * 100))); put("imageDpi", String(o.imageDpi));
    put("cLevel", level); put("cDpi", String(o.compress.dpi)); put("cQuality", String(Math.round(o.compress.quality * 100)));
    if (o.compress.mode !== "none") put("cMode", o.compress.mode);
    const grey = root.querySelector<HTMLInputElement>("#cGrey"); if (grey) grey.checked = o.compress.grey;
    showOptions(); refreshButtons();
    if (editor?.isOpen()) editor.refresh();
  }
  const fmtSize = (n: number) => n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} kB` : `${(n / 1e6).toFixed(1)} MB`;

  function refreshButtons() {
    const n = sel.size, total = session.pages.length;
    $("selNote").textContent = total ? (n ? `${n} of ${total} selected (${formatRanges(chosen())})` : `${total} page${total === 1 ? "" : "s"}; none selected`) : "";
    root.querySelectorAll<HTMLButtonElement>("[data-needs-sel]").forEach((b) => (b.disabled = busy || (!n && !(task.turnAllIfNoneSelected && (b.dataset.act === "left" || b.dataset.act === "right")))));
    if (task.which === "selected") $<HTMLButtonElement>("saveAll").disabled = busy || !n;
    $<HTMLButtonElement>("undo").disabled = busy || !undo.length;
    const saveSel = root.querySelector<HTMLButtonElement>("#saveSel"); if (saveSel) saveSel.textContent = `Save the ${n || ""} selected page${n === 1 ? "" : "s"}`;
    const who = root.querySelector<HTMLElement>("#scaleWho"); if (who) who.textContent = n ? `the ${n} selected page${n === 1 ? "" : "s"}` : "all pages";
    const waiting = session.sources.filter((s) => !loaded.has(s.sha256));
    $("waiting").hidden = !waiting.length;
    $("waiting").textContent = waiting.length ? `These settings need ${waiting.length === 1 ? "a file that hasn't" : `${waiting.length} files that haven't`} been added yet: ${waiting.map((s) => s.name).join(", ")}. Add ${waiting.length === 1 ? "it" : "them"} above to carry on. Files are matched by their contents, so a renamed copy is fine.` : "";
  }

  // selection: click, shift-click for a range
  grid.addEventListener("click", (e) => {
    const editBtn = (e.target as Element).closest<HTMLElement>("[data-edit]");
    if (editBtn && !busy) return void editor?.open(Number(editBtn.dataset.edit));
    const tile = (e.target as Element).closest<HTMLElement>(".tile");
    if (!tile || !(e.target instanceof HTMLInputElement)) return;
    const i = Number(tile.dataset.i);
    if (e.shiftKey && anchor >= 0) { const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)]; for (let k = a; k <= b; k++) sel.add(k); }
    else if (e.target.checked) sel.add(i); else sel.delete(i);
    anchor = i;
    grid.querySelectorAll<HTMLElement>(".tile").forEach((t) => {
      const on = sel.has(Number(t.dataset.i)); t.classList.toggle("on", on); t.querySelector<HTMLInputElement>("input")!.checked = on;
    });
    refreshButtons();
  });
  // drag a page (or the whole selection, if the dragged page is in it) to a new place
  let dragging: number[] = [];
  grid.addEventListener("dragstart", (e) => {
    const tile = (e.target as Element).closest<HTMLElement>(".tile"); if (!tile || busy) return;
    const i = Number(tile.dataset.i);
    dragging = sel.has(i) ? chosen() : [i];
    e.dataTransfer!.effectAllowed = "move"; e.dataTransfer!.setData("text/plain", "pages");
  });
  const dropSpot = (e: DragEvent) => {
    const tile = (e.target as Element).closest<HTMLElement>(".tile"); if (!tile) return null;
    const r = tile.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
    return { tile, after, before: Number(tile.dataset.i) + (after ? 1 : 0) };
  };
  const clearMarks = () => grid.querySelectorAll(".drop-before, .drop-after").forEach((t) => t.classList.remove("drop-before", "drop-after"));
  grid.addEventListener("dragover", (e) => {
    if (!dragging.length) return;
    e.preventDefault(); clearMarks();
    const d = dropSpot(e); if (d) d.tile.classList.add(d.after ? "drop-after" : "drop-before");
  });
  grid.addEventListener("dragleave", clearMarks);
  grid.addEventListener("dragend", () => { dragging = []; clearMarks(); });
  grid.addEventListener("drop", (e) => {
    if (!dragging.length) return;
    e.preventDefault(); e.stopPropagation();
    const d = dropSpot(e), moving = dragging; dragging = []; clearMarks();
    if (d) apply(moveTo(session.pages, moving, d.before));
  });

  // ---------- adding: button, and dropping files anywhere on the tool ----------
  const picker = $<HTMLInputElement>("picker");
  picker.addEventListener("change", () => { const f = [...(picker.files ?? [])]; picker.value = ""; addFiles(f); });
  root.addEventListener("dragover", (e) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); $("drop").classList.add("over"); } });
  root.addEventListener("dragleave", () => $("drop").classList.remove("over"));
  root.addEventListener("drop", (e) => {
    $("drop").classList.remove("over");
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault(); addFiles([...e.dataTransfer.files]);
  });

  // ---------- pages with additions, and the editor ----------
  const dataMap = () => new Map(session.sources.filter((s) => loaded.has(s.sha256)).map((s) => [s.id, loaded.get(s.sha256)!.data]));
  const buildOne = (p: PageItem) => makeBuilder(dataMap(), { imageDpi: session.output.imageDpi })([{ ...p, scale: 1 }]);
  /** What to draw or read for a page. A page with additions is first built as it will be saved, so pictures and
   *  text made from it include them. Call `done` afterwards. */
  async function drawable(p: PageItem): Promise<{ handle: Handle; page: number; rotate: Rotation; done: () => void }> {
    if (!p.marks?.length) return { handle: loaded.get(src(p.src).sha256)!.handle, page: p.page, rotate: p.rotate, done: () => {} };
    const doc = await openPdf(await buildOne(p), vendor);
    return { handle: { kind: "pdf", doc }, page: 0, rotate: 0, done: () => closePdf(doc) };
  }
  let fonts: ReturnType<typeof fontSet> | null = null;
  PDFDocument.create().then((d) => { fonts = fontSet(d); });   // only used to measure text for the editor's handles
  const editor = can("marks") ? createEditor({
    root, say,
    page: (i) => session.pages[i], count: () => session.pages.length,
    baseSize: (p) => pageSize(loaded.get(src(p.src).sha256)!.handle, p.page, session.output.imageDpi),
    async draw(p, pxPerPoint) {
      const doc = await openPdf(await buildOne(p), vendor);
      try { return await drawPage({ kind: "pdf", doc }, 0, 0, { pxPerPoint, pxPerImagePx: pxPerPoint }); } finally { closePdf(doc); }
    },
    font: (m) => fonts!(m.font, m.bold),
    cantDraw: (m) => cantDraw(m.text, fonts!(m.font, m.bold)),
    setMarks(i, marks: Mark[], quiet) { if (!quiet) remember(); session = { ...session, pages: setMarks(session.pages, i, marks).pages }; render(); },
    async addPicture(file) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer()), sha = await sha256(bytes);
        if (isPdf(bytes)) { say("Choose a picture (PNG, JPEG, and so on), not a PDF.", "bad"); return null; }
        let item = loaded.get(sha);
        if (item && item.data.kind === "image" && item.data.turn) item = undefined;   // added earlier as a sideways photo page: needs an upright copy
        if (!item) item = await loadImage(bytes, file.type, true);
        if (item.handle.kind !== "image") return null;
        const known = session.sources.find((s) => s.sha256 === sha);
        if (known && loaded.get(sha) !== item) { say("That photo is already added as a page; to place it on a page too, save a copy of it under another name first.", "bad"); return null; }
        loaded.set(sha, item);
        const r = addSource(session, { name: file.name, size: bytes.length, sha256: sha, pages: 1, kind: "image" }, false);
        session = r.session;
        return { id: r.id, width: item.handle.width, height: item.handle.height };
      } catch (e) { console.error(e); say(`"${file.name}" couldn't be read as a picture.`, "bad"); return null; }
    },
    onClose: () => render(),
  }) : null;

  // ---------- output options ----------
  function readOptions() {
    const o = session.output;
    const fallback: Record<string, string> = { split: o.split, every: String(o.every), ranges: o.ranges, imageDpi: String(o.imageDpi) };
    const v = (id: string) => root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? fallback[id] ?? "";
    const clamp = (x: number, lo: number, hi: number, d: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
    let compress = o.compress;
    const lv = root.querySelector<HTMLSelectElement>("#cLevel");
    if (lv) {
      level = lv.value as Level;
      compress = level === "none" ? { ...NO_COMPRESSION } : level !== "custom" ? { ...PRESETS[level] } : {
        mode: v("cMode") as CompressOptions["mode"], dpi: clamp(Number(v("cDpi")), DPI_MIN, DPI_MAX, o.compress.dpi),
        quality: clamp(Number(v("cQuality")) / 100, 0.1, 1, o.compress.quality), grey: !!root.querySelector<HTMLInputElement>("#cGrey")?.checked,
      };
    }
    session = { ...session, output: {
      compress,
      name: safeName(v("outName")), format: v("format") as OutputFormat, split: v("split") as SplitMode,
      every: Math.max(1, Math.round(Number(v("every")) || 1)), ranges: v("ranges"),
      dpi: clamp(Number(v("dpi")), DPI_MIN, DPI_MAX, o.dpi), quality: clamp(Number(v("quality")) / 100, 0.1, 1, o.quality),
      imageDpi: clamp(Number(v("imageDpi")), DPI_MIN, DPI_MAX, o.imageDpi),
    } };
  }
  function showOptions() {
    const f = $<HTMLSelectElement>("format").value, s = session.output.split;
    const hide = (id: string, off: boolean) => { const e = root.querySelector<HTMLElement>(`#${id}`); if (e) e.hidden = off; };
    hide("optPdf", f !== "pdf"); hide("optEvery", f !== "pdf" || s !== "every"); hide("optRanges", f !== "pdf" || s !== "ranges");
    hide("optImage", f === "pdf" || f === "txt"); hide("optQuality", f !== "jpeg" && f !== "webp"); hide("optText", f !== "txt");
    const c = session.output.compress;
    hide("optCompress", f !== "pdf"); hide("cCustom", level !== "custom");
    hide("cDpiRow", c.mode === "tidy"); hide("cQualityRow", c.mode === "tidy"); hide("cGreyRow", c.mode === "tidy"); hide("cFlattenWarn", c.mode !== "flatten");
    const sum = root.querySelector<HTMLElement>("#cSummary");
    if (sum) sum.textContent = level === "none" ? "Pictures are kept exactly as they are." : level === "custom" ? "" :
      c.mode === "flatten" ? `Every page is redrawn as one picture at ${c.dpi} dots per inch and ${Math.round(c.quality * 100)}% quality. Text is lost. This can come out larger than the original for pages that are mostly text.` :
      `Pictures are kept at up to ${c.dpi} dots per inch, at ${Math.round(c.quality * 100)}% quality.${level === "extreme" ? " Expect visibly rough pictures." : ""} Text and line drawings are not changed.`;
    const dpiBox = root.querySelector<HTMLElement>("#optImageDpi"); if (dpiBox) dpiBox.hidden = f === "txt" || !session.sources.some((x) => x.kind === "image");
  }
  $("savePanel").addEventListener("change", () => { readOptions(); showOptions(); if (task.perFile) clearResult(); });

  // ---------- this page's task: show only its controls ----------
  root.querySelectorAll<HTMLElement>("[data-part]").forEach((e) => { if (!can(e.dataset.part as Part)) e.remove(); });
  if (task.slug === "compress") root.querySelector("#cLevel option[value=none]")?.remove();
  if (task.perFile) $("outName").closest("p")!.hidden = true;
  root.querySelector<HTMLInputElement>("#pwShow")?.addEventListener("change", (e) => { for (const id of ["pw1", "pw2"]) $<HTMLInputElement>(id).type = (e.target as HTMLInputElement).checked ? "text" : "password"; });
  const fmt = $<HTMLSelectElement>("format");
  [...fmt.options].forEach((o) => { if (!task.formats.includes(o.value as OutputFormat)) o.remove(); });
  $("formatField").hidden = task.formats.length < 2;
  $("saveAll").textContent = task.action;
  if (task.slug !== "workspace") $("saveSel").remove();
  const more = $("more"); if (!more.querySelector("[data-part]")) more.remove();

  // ---------- saving ----------
  function download(name: string, blob: Blob) {
    const a = el("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  }
  async function deliver(files: { name: string; bytes: Uint8Array }[], zipName: string) {
    if (files.length === 1) return download(files[0].name, new Blob([files[0].bytes as BlobPart]));
    // level 0 = store without compressing again: PDFs and images are already compressed
    const zip = zipSync(Object.fromEntries(files.map((f) => [f.name, f.bytes])), { level: 0 });
    download(`${zipName}.zip`, new Blob([zip as BlobPart], { type: "application/zip" }));
  }

  // ---------- never replace an original without being told to ----------
  // A web page can't look in the visitor's folders, so it can't know what is already there. What it can check is
  // whether a file it is about to hand over has the same name as one the visitor added: saved next to the
  // original, that could replace it. Default names carry a suffix so this only happens if the visitor chooses it.
  const ask = $("ask");
  function consent(names: string[]): Promise<boolean> {
    const hit = clashes(names, session.sources.map((s) => s.name));
    if (!hit.length) return Promise.resolve(true);
    return new Promise((done) => {
      const answer = (ok: boolean) => { ask.hidden = true; ask.replaceChildren(); done(ok); };
      const yes = el("button", { type: "button", className: "small" }, "Save with this name anyway");
      const no = el("button", { type: "button", className: "small primary" }, "Cancel, I'll change the name");
      yes.addEventListener("click", () => answer(true)); no.addEventListener("click", () => { answer(false); $<HTMLInputElement>("outName").closest("p")!.hidden = false; $<HTMLInputElement>("outName").focus(); });
      ask.replaceChildren(
        el("p", {}, el("strong", {}, `${hit.length === 1 ? `"${hit[0]}" has` : `${hit.map((h) => `"${h}"`).join(", ")} have`} the same name as ${hit.length === 1 ? "a file" : "files"} you added.`)),
        el("p", { className: "small" }, "If you save into the same folder as the original, the original could be replaced. Your browser may or may not warn you."),
        el("p", { className: "row" }, no, yes));
      ask.hidden = false; say(""); ask.scrollIntoView({ block: "nearest", behavior: "smooth" }); no.focus();
    });
  }
  /** Name for a file saved on its own (Compress PDF). There is no name box there, so steer clear of the names of added files. */
  function perFileName(s: SourceRef): string {
    let name = defaultName(s.name, task.suffix);
    while (clashes([`${name}.pdf`], session.sources.map((x) => x.name)).length) name += "-new";
    return `${name}.pdf`;
  }
  /** The names of the files a save would produce, including those inside a .zip. */
  function outputNames(pages: PageItem[]): string[] {
    const o = session.output;
    try {
      if (o.format === "pdf") return task.perFile ? session.sources.filter((s) => pages.some((p) => p.src === s.id)).map(perFileName) : planFiles(pages, o).map((f) => f.name);
      if (o.format === "txt") return [`${o.name}.txt`];
      const width = String(pages.length).length;
      return pages.map((_, i) => (pages.length === 1 ? `${o.name}.${ext(o.format)}` : `${o.name}-${String(i + 1).padStart(width, "0")}.${ext(o.format)}`));
    } catch { return []; }   // a bad split range etc.: the save itself reports it
  }

  async function save(which: "all" | "selected") {
    readOptions(); clearResult(); if (busy || !ask.hidden) return;
    const o = session.output;
    const pages = which === "all" ? session.pages : chosen().map((i) => session.pages[i]);
    let password = "";
    if (can("protect")) {
      password = $<HTMLInputElement>("pw1").value;
      if (!password) return say("Type a password first.", "bad");
      if (password !== $<HTMLInputElement>("pw2").value) return say("The two passwords don't match. Type them again.", "bad");
    }
    if (!(await consent(outputNames(pages)))) return say("Nothing was saved. Change the file name and try again.");
    await work("Working…", async (progress) => {
      if (!pages.length) throw new Error("There are no pages to save.");
      const missing = [...new Set(pages.filter((p) => !has(p)).map((p) => src(p.src).name))];
      if (missing.length) throw new Error(`Add ${missing.join(", ")} first: some of these pages come from ${missing.length === 1 ? "it" : "them"}.`);
      const width = String(pages.length).length, numbered = (i: number, ext: string) => `${o.name}-${String(i + 1).padStart(width, "0")}.${ext}`;
      let note = "";

      if (o.format === "pdf") {
        const data = new Map(session.sources.filter((s) => loaded.has(s.sha256)).map((s) => [s.id, loaded.get(s.sha256)!.data]));
        const build = makeBuilder(data, { imageDpi: o.imageDpi });
        const c = o.compress;
        const make = async (pp: PageItem[], label: string): Promise<{ bytes: Uint8Array; stats?: CompressStats }> => {
          if (c.mode === "flatten") return { bytes: await flatten(pp, c, (i) => progress(`${label}: drawing page ${i + 1} of ${pp.length}…`)) };
          let built = await build(pp);
          if (password) built = await protect(built, password);   // last step: nothing rewrites the file afterwards
          if (c.mode === "none") return { bytes: built };
          return recompressImages(built, c, (i, n) => progress(`${label}: picture ${i + 1} of ${n}…`));
        };
        if (task.perFile) {
          const done: Compressed[] = [];
          for (const s of session.sources) {
            const pp = pages.filter((x) => x.src === s.id);
            if (!pp.length) continue;
            const r = await make(pp, s.name);
            done.push({ source: s, name: perFileName(s), bytes: r.bytes, stats: r.stats, first: pp[0] });
          }
          if (task.slug === "compress") { progress("Preparing the preview…"); await showResult(done); note = ""; }
          else {
            await deliver(done.map((d) => ({ name: d.name, bytes: d.bytes })), task.suffix);
            note = `Saved ${done.length === 1 ? done[0].name : `${done.length} PDFs in ${task.suffix}.zip`}.` +
              (password ? " Check that it opens with your password before you delete the original." : "");
          }
        } else {
          const plan = planFiles(pages, o), files = [];
          for (const [i, f] of plan.entries()) { progress(`Writing file ${i + 1} of ${plan.length}…`); files.push({ name: f.name, bytes: (await make(f.pages, f.name)).bytes }); }
          await deliver(files, o.name);
          note = `Saved ${plan.length === 1 ? `${plan[0].name} (${fmtSize(files[0].bytes.length)})` : `${plan.length} PDFs in ${o.name}.zip`}.`;
        }
      } else if (o.format === "txt") {
        const texts: string[] = [];
        for (const [i, p] of pages.entries()) { progress(`Reading text: page ${i + 1} of ${pages.length}…`); const d = await drawable(p); try { texts.push(await pageText(d.handle, d.page)); } finally { d.done(); } }
        const { text, empty } = pagesToText(texts);
        if (empty === pages.length) throw new Error("No text was found. If these pages are scans or photos, the words are pictures, and this tool can't read text from pictures.");
        download(`${o.name}.txt`, new Blob([text], { type: "text/plain;charset=utf-8" }));
        note = `Saved ${o.name}.txt.${empty ? ` ${empty} of ${pages.length} pages had no text (scans or pictures).` : ""}`;
      } else {
        const files = [];
        for (const [i, p] of pages.entries()) {
          progress(`Drawing page ${i + 1} of ${pages.length}…`);
          const d = await drawable(p), pxPerPoint = (o.dpi / 72) * p.scale;
          let c: HTMLCanvasElement;
          try { c = await drawPage(d.handle, d.page, d.rotate, { pxPerPoint, pxPerImagePx: pxPerPoint * (72 / o.imageDpi) }); } finally { d.done(); }
          let bytes: Uint8Array;
          if (o.format === "bmp" || o.format === "tiff") {
            const px = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
            if (o.format === "bmp") bytes = encodeBmp(px, c.width, c.height, o.dpi);
            else { const UTIF = await utif(); bytes = new Uint8Array(UTIF.encodeImage(new Uint8Array(px.buffer), c.width, c.height)); }
          } else bytes = new Uint8Array(await (await canvasBlob(c, `image/${o.format}`, o.quality)).arrayBuffer());
          files.push({ name: pages.length === 1 ? `${o.name}.${ext(o.format)}` : numbered(i, ext(o.format)), bytes });
        }
        await deliver(files, o.name);
        note = `Saved ${files.length === 1 ? files[0].name : `${files.length} images in ${o.name}.zip`}.`;
      }
      say(note);
    });
  }
  /** Strongest compression: every page becomes one JPEG picture of itself. */
  async function flatten(pp: PageItem[], c: CompressOptions, step: (i: number) => void): Promise<Uint8Array> {
    const out = await PDFDocument.create();
    for (const [i, p] of pp.entries()) {
      step(i);
      const d = await drawable(p), pxPerPoint = c.dpi / 72;
      let canvas: HTMLCanvasElement;
      try { canvas = await drawPage(d.handle, d.page, d.rotate, { pxPerPoint, pxPerImagePx: pxPerPoint * (72 / session.output.imageDpi) }); } finally { d.done(); }
      if (c.grey) { const ctx = canvas.getContext("2d")!, d = ctx.getImageData(0, 0, canvas.width, canvas.height); greyInPlace(d.data); ctx.putImageData(d, 0, 0); }
      const img = await out.embedJpg(new Uint8Array(await (await canvasBlob(canvas, "image/jpeg", c.quality)).arrayBuffer()));
      const w = (canvas.width / pxPerPoint) * p.scale, ht = (canvas.height / pxPerPoint) * p.scale;
      out.addPage([w, ht]).drawImage(img, { x: 0, y: 0, width: w, height: ht });
    }
    return out.save({ useObjectStreams: true });
  }

  // ---------- Compress PDF: show the real result before anything is downloaded ----------
  type Compressed = { source: SourceRef; name: string; bytes: Uint8Array; stats?: CompressStats; first: PageItem };
  const result = $("result");
  function clearResult() { result.hidden = true; result.replaceChildren(); }
  async function showResult(done: Compressed[]) {
    const better = done.filter((d) => d.bytes.length < d.source.size);
    const before = done.reduce((n, d) => n + d.source.size, 0), after = done.reduce((n, d) => n + Math.min(d.bytes.length, d.source.size), 0);
    result.replaceChildren(); result.className = `result sans${better.length ? "" : " same"}`;
    if (!better.length) {
      result.append(el("p", {}, el("strong", {}, "These settings didn't make the file smaller, so there is nothing to download.")),
        el("p", { className: "small" }, "It may already be well compressed, or be mostly text and drawings, which this tool doesn't change. You could try a stronger setting."));
    } else {
      result.append(el("p", { className: "big-number" }, `${saving(before, after)}% smaller`),
        el("p", {}, `${fmtSize(before)} → ${fmtSize(after)}`));
      if (done.length > 1) result.append(el("table", {}, el("tbody", {}, ...done.map((d) => el("tr", {},
        el("td", {}, d.source.name), el("td", { className: "num" }, fmtSize(d.source.size)), el("td", { className: "num" }, d.bytes.length < d.source.size ? `${fmtSize(d.bytes.length)} (−${saving(d.source.size, d.bytes.length)}%)` : "not smaller: left out"))))));
    }
    const st = done.map((d) => d.stats).filter((x): x is CompressStats => !!x);
    if (session.output.compress.mode === "images" && st.length && !st.some((x) => x.images)) {
      result.append(el("p", { className: "small" }, "There are no pictures in this PDF to shrink."));
    } else if (session.output.compress.mode === "images" && st.length) {
      const changed = st.reduce((n, x) => n + x.changed, 0), total = st.reduce((n, x) => n + x.images, 0);
      const why = new Map<string, number>(); for (const x of st) for (const [k, n] of Object.entries(x.skipped)) why.set(k, (why.get(k) ?? 0) + n);
      result.append(el("p", { className: "small" }, `${changed} of ${total} picture${total === 1 ? "" : "s"} made smaller.` +
        (why.size ? ` Left as they were: ${[...why].map(([k, n]) => `${n} that ${k}`).join("; ")}.` : "")));
    }
    if (better.length) {
      try {
        const d = better[0], zoom = { pxPerPoint: 1.5, pxPerImagePx: 1.5 };
        const was = await drawPage(loaded.get(d.source.sha256)!.handle, d.first.page, d.first.rotate, zoom);
        const now = await drawPage({ kind: "pdf", doc: await openPdf(d.bytes, vendor) }, 0, 0, zoom);
        const pair = el("div", { className: "pair" }, el("figure", {}, was, el("figcaption", {}, "Before")), el("figure", {}, now, el("figcaption", {}, "After")));
        pair.title = "Click to enlarge";
        pair.addEventListener("click", () => pair.classList.toggle("zoom"));
        result.append(el("p", { className: "small" }, `First page of ${d.source.name}. Click the pictures to enlarge them, and check the quality is good enough before you download.`), pair);
      } catch (e) { console.error(e); }
      const go = el("button", { type: "button", className: "primary big" }, better.length === 1 ? `Download ${fmtSize(better[0].bytes.length)} PDF` : `Download ${better.length} PDFs (.zip)`);
      go.addEventListener("click", () => deliver(better.map((d) => ({ name: d.name, bytes: d.bytes })), "compressed"));
      result.append(el("div", { className: "go-result" }, go));
    }
    result.hidden = false; result.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const ext = (f: OutputFormat) => (f === "jpeg" ? "jpg" : f === "tiff" ? "tif" : f);
  $("saveAll").addEventListener("click", () => save(task.which));
  root.querySelector("#saveSel")?.addEventListener("click", () => save("selected"));

  // ---------- settings file ----------
  $("saveSettings").addEventListener("click", () => {
    readOptions();
    if (!session.sources.length) return say("Add a file first: there are no settings to save yet.", "bad");
    download(`${session.output.name}.pdf-tools-settings.json`, new Blob([serialise(session)], { type: "application/json" }));
    say("Saved the settings file. It lists your files by name and fingerprint, and your edits; it holds none of their contents. Keep the original files: you will need to add them again.");
  });
  const settingsPicker = $<HTMLInputElement>("settingsPicker");
  settingsPicker.addEventListener("change", async () => {
    const f = settingsPicker.files?.[0]; settingsPicker.value = "";
    if (!f || busy) return;
    try {
      const next = parseSettings(await f.text());
      // Keep files already added when the settings use them; forget the rest.
      const wanted = new Set(next.sources.map((s: SourceRef) => s.sha256));
      for (const k of [...loaded.keys()]) if (!wanted.has(k)) loaded.delete(k);
      if (!task.formats.includes(next.output.format)) next.output.format = task.formats[0];
      if (!can("split")) next.output.split = "none";
      if (!can("compress")) next.output.compress = { ...NO_COMPRESSION };
      else if (task.slug === "compress" && next.output.compress.mode === "none") next.output.compress = { ...PRESETS.recommended };
      level = levelOf(next.output.compress);
      session = next; sel = new Set(); undo.length = 0;
      render();
      say(session.sources.every((s) => loaded.has(s.sha256)) ? "Settings loaded." : "Settings loaded. Now add the files they refer to.");
    } catch (e) { say(e instanceof Error ? e.message : String(e), "bad"); }
  });
  $("startOver").addEventListener("click", () => {
    if (busy) return;
    editor?.close();
    for (const u of thumbs.values()) URL.revokeObjectURL(u);
    thumbs.clear(); loaded.clear(); undo.length = 0; sel = new Set(); session = fresh(); level = levelOf(session.output.compress); clearResult(); render(); say("");
  });

  render();
}
