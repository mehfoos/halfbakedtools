// The tool's browser interface. Calculations and file handling live in the other modules; this file wires
// them to the page. Nothing here sends data anywhere: files are read with the browser's File API, kept in
// memory, and results are handed back as downloads created inside the page.
import { zipSync } from "fflate";
import {
  emptySession, addSource, removeSource, nudge, moveTo, duplicate, remove, rotate, setScale, planFiles, safeName,
  serialise, parseSettings, SCALE_MIN, SCALE_MAX, DPI_MIN, DPI_MAX,
  type Session, type PageItem, type Edit, type OutputFormat, type SplitMode, type Rotation, type SourceRef,
} from "./session.ts";
import { parsePageList, formatRanges } from "./ranges.ts";
import { makeBuilder, inspectPdf, type SourceData } from "./build.ts";
import { encodeBmp } from "./bmp.ts";
import { pagesToText } from "./text.ts";
import { jpegOrientation, orientationToRotation } from "./exif.ts";
import { openPdf, drawPage, pageText, pageSize, decodeImage, canvasBlob, NeedsPassword, type Handle } from "./render.ts";

// The TIFF library is only fetched (from this site) when a TIFF is read or written.
const utif = async () => { const m = await import("utif2"); return ((m as { default?: typeof m }).default ?? m); };
type Loaded = { data: SourceData; handle: Handle; usedPassword: boolean; restricted?: boolean };
const THUMB = 150; // longest side of a preview, in CSS pixels

export function start(root: HTMLElement, vendor: string) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  let session: Session = emptySession();
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

  async function loadImage(bytes: Uint8Array, type: string): Promise<Loaded> {
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
      if (turn !== null) return { data: { kind: "image", bytes, type: "jpeg", turn }, handle: { kind: "image", img, width, height, turn }, usedPassword: false };
    } else if (isPng(bytes)) {
      return { data: { kind: "image", bytes, type: "png" }, handle: { kind: "image", img, width, height, turn: 0 }, usedPassword: false };
    }
    // Other formats (and mirrored photos) are redrawn and stored as PNG, which keeps every pixel.
    return { data: { kind: "image", bytes: await toPng(canvasOf(img, width, height)), type: "png" }, handle: { kind: "image", img, width, height, turn: 0 }, usedPassword: false };
  }

  async function addFiles(files: File[]) {
    if (!files.length) return;
    await work("Reading files…", async (progress) => {
      const notes: string[] = [];
      for (const f of files) {
        progress(`Reading ${f.name}…`);
        const bytes = new Uint8Array(await f.arrayBuffer());
        const sha = await sha256(bytes);
        if (loaded.has(sha)) { notes.push(`"${f.name}" is already added (to repeat pages, use Duplicate).`); continue; }
        let item: Loaded, pages = 1;
        try {
          if (isPdf(bytes)) {
            const r = await loadPdf(f.name, bytes);
            if (!r) { notes.push(`"${f.name}" was skipped (no password given).`); continue; }
            item = r; pages = r.pages;
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
        if (!r.matched) { remember(); if (!session.pages.length && session.output.name === "document") r.session.output.name = safeName(f.name.replace(/\.[^.]+$/, "")); }
        session = r.session;
      }
      render();
      say(notes.join(" "), notes.length ? "warn" : "info");
    });
  }

  // ---------- page edits ----------
  function remember() { undo.push({ pages: session.pages, sel: [...sel] }); if (undo.length > 100) undo.shift(); }
  function apply(e: Edit) { remember(); session = { ...session, pages: e.pages }; sel = new Set(e.sel); render(); say(""); }
  const chosen = () => [...sel].sort((a, b) => a - b);
  const act: Record<string, () => void> = {
    earlier: () => apply(nudge(session.pages, chosen(), -1)),
    later: () => apply(nudge(session.pages, chosen(), 1)),
    left: () => apply(rotate(session.pages, chosen(), -90)),
    right: () => apply(rotate(session.pages, chosen(), 90)),
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
      const n = session.pages.filter((p) => p.src === s.id).length;
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
      const notes = [p.rotate ? `turned ${p.rotate}°` : "", p.scale !== 1 ? `${Math.round(p.scale * 1000) / 10}% size` : ""].filter(Boolean).join(", ");
      const tile = el("li", { className: `tile${sel.has(i) ? " on" : ""}`, draggable: true },
        el("label", {},
          el("span", { className: "thumb" }, ok ? img : el("span", { className: "small" }, "File not added yet")),
          el("span", { className: "cap" }, box, el("strong", {}, ` ${i + 1}`)),
          el("span", { className: "from small muted" }, `${s.name}${s.kind === "pdf" ? `, p. ${p.page + 1}` : ""}`),
          notes ? el("span", { className: "from small" }, notes) : ""));
      tile.dataset.i = String(i);
      if (ok && !thumbs.has(key)) watcher.observe(tile);
      return tile;
    }));
    $("pagesPanel").hidden = $("savePanel").hidden = !session.pages.length;
    $("empty").hidden = !!session.sources.length;
    // outputs
    const o = session.output;
    $<HTMLInputElement>("outName").value = o.name; $<HTMLSelectElement>("format").value = o.format;
    $<HTMLSelectElement>("split").value = o.split; $<HTMLInputElement>("every").value = String(o.every);
    $<HTMLInputElement>("ranges").value = o.ranges; $<HTMLInputElement>("dpi").value = String(o.dpi);
    $<HTMLInputElement>("quality").value = String(Math.round(o.quality * 100)); $<HTMLInputElement>("imageDpi").value = String(o.imageDpi);
    showOptions(); refreshButtons();
  }
  const fmtSize = (n: number) => n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} kB` : `${(n / 1e6).toFixed(1)} MB`;

  function refreshButtons() {
    const n = sel.size, total = session.pages.length;
    $("selNote").textContent = total ? (n ? `${n} of ${total} selected (${formatRanges(chosen())})` : `${total} page${total === 1 ? "" : "s"}; none selected`) : "";
    root.querySelectorAll<HTMLButtonElement>("[data-needs-sel]").forEach((b) => (b.disabled = busy || !n));
    $<HTMLButtonElement>("undo").disabled = busy || !undo.length;
    $<HTMLButtonElement>("saveSel").textContent = `Save the ${n || ""} selected page${n === 1 ? "" : "s"}`;
    $("scaleWho").textContent = n ? `the ${n} selected page${n === 1 ? "" : "s"}` : "all pages";
    const waiting = session.sources.filter((s) => !loaded.has(s.sha256));
    $("waiting").hidden = !waiting.length;
    $("waiting").textContent = waiting.length ? `These settings need ${waiting.length === 1 ? "a file that hasn't" : `${waiting.length} files that haven't`} been added yet: ${waiting.map((s) => s.name).join(", ")}. Add ${waiting.length === 1 ? "it" : "them"} above to carry on. Files are matched by their contents, so a renamed copy is fine.` : "";
  }

  // selection: click, shift-click for a range
  grid.addEventListener("click", (e) => {
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

  // ---------- output options ----------
  function readOptions() {
    const o = session.output, v = (id: string) => $<HTMLInputElement>(id).value;
    const clamp = (x: number, lo: number, hi: number, d: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
    session = { ...session, output: {
      name: safeName(v("outName")), format: v("format") as OutputFormat, split: v("split") as SplitMode,
      every: Math.max(1, Math.round(Number(v("every")) || 1)), ranges: v("ranges"),
      dpi: clamp(Number(v("dpi")), DPI_MIN, DPI_MAX, o.dpi), quality: clamp(Number(v("quality")) / 100, 0.1, 1, o.quality),
      imageDpi: clamp(Number(v("imageDpi")), DPI_MIN, DPI_MAX, o.imageDpi),
    } };
  }
  function showOptions() {
    const f = $<HTMLSelectElement>("format").value, s = $<HTMLSelectElement>("split").value;
    $("optPdf").hidden = f !== "pdf"; $("optEvery").hidden = f !== "pdf" || s !== "every"; $("optRanges").hidden = f !== "pdf" || s !== "ranges";
    $("optImage").hidden = f === "pdf" || f === "txt"; $("optQuality").hidden = f !== "jpeg" && f !== "webp";
    $("optText").hidden = f !== "txt";
    $("optImageDpi").hidden = f === "txt" || !session.sources.some((x) => x.kind === "image");
  }
  $("savePanel").addEventListener("change", () => { readOptions(); showOptions(); });

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

  async function save(which: "all" | "selected") {
    readOptions();
    const o = session.output;
    const pages = which === "all" ? session.pages : chosen().map((i) => session.pages[i]);
    await work("Working…", async (progress) => {
      if (!pages.length) throw new Error("There are no pages to save.");
      const missing = [...new Set(pages.filter((p) => !has(p)).map((p) => src(p.src).name))];
      if (missing.length) throw new Error(`Add ${missing.join(", ")} first: some of these pages come from ${missing.length === 1 ? "it" : "them"}.`);
      const width = String(pages.length).length, numbered = (i: number, ext: string) => `${o.name}-${String(i + 1).padStart(width, "0")}.${ext}`;
      let note = "";

      if (o.format === "pdf") {
        const data = new Map(session.sources.filter((s) => loaded.has(s.sha256)).map((s) => [s.id, loaded.get(s.sha256)!.data]));
        const build = makeBuilder(data, { imageDpi: o.imageDpi });
        const plan = planFiles(pages, o), files = [];
        for (const [i, f] of plan.entries()) { progress(`Writing file ${i + 1} of ${plan.length}…`); files.push({ name: f.name, bytes: await build(f.pages) }); }
        await deliver(files, o.name);
        note = `Saved ${plan.length === 1 ? `${plan[0].name} (${fmtSize(files[0].bytes.length)})` : `${plan.length} PDFs in ${o.name}.zip`}.`;
      } else if (o.format === "txt") {
        const texts: string[] = [];
        for (const [i, p] of pages.entries()) { progress(`Reading text: page ${i + 1} of ${pages.length}…`); texts.push(await pageText(loaded.get(src(p.src).sha256)!.handle, p.page)); }
        const { text, empty } = pagesToText(texts);
        if (empty === pages.length) throw new Error("No text was found. If these pages are scans or photos, the words are pictures, and this tool can't read text from pictures.");
        download(`${o.name}.txt`, new Blob([text], { type: "text/plain;charset=utf-8" }));
        note = `Saved ${o.name}.txt.${empty ? ` ${empty} of ${pages.length} pages had no text (scans or pictures).` : ""}`;
      } else {
        const files = [];
        for (const [i, p] of pages.entries()) {
          progress(`Drawing page ${i + 1} of ${pages.length}…`);
          const h = loaded.get(src(p.src).sha256)!.handle;
          const pxPerPoint = (o.dpi / 72) * p.scale;
          const c = await drawPage(h, p.page, p.rotate, { pxPerPoint, pxPerImagePx: pxPerPoint * (72 / o.imageDpi) });
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
  const ext = (f: OutputFormat) => (f === "jpeg" ? "jpg" : f === "tiff" ? "tif" : f);
  $("saveAll").addEventListener("click", () => save("all"));
  $("saveSel").addEventListener("click", () => save("selected"));

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
      session = next; sel = new Set(); undo.length = 0;
      render();
      say(session.sources.every((s) => loaded.has(s.sha256)) ? "Settings loaded." : "Settings loaded. Now add the files they refer to.");
    } catch (e) { say(e instanceof Error ? e.message : String(e), "bad"); }
  });
  $("startOver").addEventListener("click", () => {
    if (busy) return;
    for (const u of thumbs.values()) URL.revokeObjectURL(u);
    thumbs.clear(); loaded.clear(); undo.length = 0; sel = new Set(); session = emptySession(); render(); say("");
  });

  render();
}
