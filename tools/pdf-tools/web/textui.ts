// Text to PDF page: reads text, lays it out (textpdf.ts) and saves a PDF. Nothing leaves the browser.
import { PDFDocument, rgb } from "@cantoo/pdf-lib";
import { fontSet } from "./build.ts";
import { POINTS_PER, type CropUnit } from "./crop.ts";
import { PAGE_MIN, PAGE_MAX } from "./layout.ts";
import { TEXT_DEFAULTS, FONT_SIZE_MIN, FONT_SIZE_MAX, wrapText, linesPerPage, paginate, missingChars, replaceMissing } from "./textpdf.ts";
import { safeName } from "./session.ts";

export function startText() {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const unit = () => $<HTMLSelectElement>("txUnit").value as CropUnit;
  const fmt = (pt: number, u: CropUnit) => String(Math.round((pt / POINTS_PER[u]) * 100) / 100);
  let shown: CropUnit = "mm";
  const fill = (u: CropUnit) => { $<HTMLInputElement>("txW").value = fmt(TEXT_DEFAULTS.width, u); $<HTMLInputElement>("txH").value = fmt(TEXT_DEFAULTS.height, u); $<HTMLInputElement>("txMargin").value = fmt(TEXT_DEFAULTS.margin, u); };
  fill("mm");
  $("txUnit").addEventListener("change", () => {   // convert what is typed, so a changed unit never changes the page
    const u = unit();
    for (const id of ["txW", "txH", "txMargin"]) { const e = $<HTMLInputElement>(id), v = Number(e.value); if (Number.isFinite(v)) e.value = String(Math.round(((v * POINTS_PER[shown]) / POINTS_PER[u]) * 100) / 100); }
    shown = u;
  });
  const say = (t: string, kind: "info" | "bad" | "warn" = "info") => { const s = $("txStatus"); s.textContent = t; s.className = `notice ${kind} small`; s.hidden = !t; };

  $("txFile").addEventListener("change", async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    const text = new TextDecoder("utf-8").decode(new Uint8Array(await f.arrayBuffer())).replace(/^﻿/, "");
    $<HTMLTextAreaElement>("txText").value = text; $<HTMLInputElement>("txName").value = safeName(f.name.replace(/\.[^.]+$/, "")) || "text";
    say(text.includes("�") ? `"${f.name}" is not entirely UTF-8 text; the unreadable characters show as �.` : `Opened ${f.name}.`, text.includes("�") ? "warn" : "info");
  });

  $("txSave").addEventListener("click", async () => {
    try {
      const raw = $<HTMLTextAreaElement>("txText").value;
      if (!raw.trim()) return say("Type or paste some text first, or open a text file.", "bad");
      const u = unit(), num = (id: string) => Number($<HTMLInputElement>(id).value) * POINTS_PER[u];
      const width = num("txW"), height = num("txH"), margin = num("txMargin"), size = Number($<HTMLInputElement>("txSize").value);
      if (![width, height].every((v) => Number.isFinite(v) && v >= PAGE_MIN && v <= PAGE_MAX)) return say("The page must be between half an inch and 200 inches on each side.", "bad");
      if (!(size >= FONT_SIZE_MIN && size <= FONT_SIZE_MAX)) return say(`Type a font size from ${FONT_SIZE_MIN} to ${FONT_SIZE_MAX} points.`, "bad");
      if (!Number.isFinite(margin) || margin < 0 || margin * 2 >= Math.min(width, height) - size) return say("The margin is too big for this page.", "bad");
      const layout = { ...TEXT_DEFAULTS, width, height, margin, fontSize: size };
      const doc = await PDFDocument.create(), font = fontSet(doc)($<HTMLSelectElement>("txFont").value as "mono" | "sans" | "serif", false);
      const has = new Set(font.getCharacterSet()), miss = missingChars(raw, has), text = miss.count ? replaceMissing(raw, has) : raw;
      const lines = wrapText(text, (s) => font.widthOfTextAtSize(s, size), width - 2 * margin, TEXT_DEFAULTS.tab);
      const pages = paginate(lines, linesPerPage(layout)), step = size * layout.lineGap;
      for (const pl of pages) {
        const page = doc.addPage([width, height]);
        pl.forEach((l, i) => { if (l) page.drawText(l, { x: margin, y: height - margin - size - i * step, size, font, color: rgb(0, 0, 0) }); });
      }
      const bytes = await doc.save(), name = `${safeName($<HTMLInputElement>("txName").value) || "text"}.pdf`;
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })), download: name });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      say(`Saved ${name}: ${pages.length} ${pages.length === 1 ? "page" : "pages"}.${miss.count ? ` ${miss.count} ${miss.count === 1 ? "character" : "characters"} the font can't draw (${miss.chars.slice(0, 8).join(" ")}${miss.chars.length > 8 ? " …" : ""}) became "?".` : ""}`, miss.count ? "warn" : "info");
    } catch (e) { console.error(e); say("Couldn't make the PDF. Try a smaller text or a different page size.", "bad"); }
  });
}
