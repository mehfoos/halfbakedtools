// Text to PDF page: reads text, lays it out (textpdf.ts) and saves a PDF. Nothing leaves the browser.
import { PDFDocument } from "@cantoo/pdf-lib";
import { fontSet } from "./build.ts";
import { standardFace } from "./face.ts";
import { fontFaces, prepareOwnFont, embedOwnFont, type OwnFont } from "./ownfont.ts";
import { notoFace, notoLibrary, type HanStyle, type ArabicStyle } from "./noto.ts";
import { loadNoto } from "./notoload.ts";
import { POINTS_PER, type CropUnit } from "./crop.ts";
import { PAGE_MIN, PAGE_MAX } from "./layout.ts";
import { TEXT_DEFAULTS, FONT_SIZE_MIN, FONT_SIZE_MAX, wrapText, paginate } from "./textpdf.ts";
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

  const notoLib = notoLibrary(loadNoto);
  // your own font: a font file from this device, kept only while the page is open
  let own: OwnFont | null = null, ownBytes: Uint8Array | null = null;
  const ownOption = () => document.querySelector<HTMLOptionElement>('#txFont option[value="own"]')!;
  async function useFace(name?: string) {
    const r = await prepareOwnFont(ownBytes!, name);
    if ("reason" in r) { own = null; ownOption().textContent = "Your own font…"; $<HTMLSelectElement>("txFont").value = "mono"; return say(`This font can't be used: ${r.reason}.`, "bad"); }
    own = r; ownOption().textContent = `Your font: ${r.name}`; $<HTMLSelectElement>("txFont").value = "own";
    say(`Using “${r.name}”.${r.note ? ` Note: ${r.note}.` : ""}`, r.note ? "warn" : "info");
  }
  $("txFont").addEventListener("change", () => { if ($<HTMLSelectElement>("txFont").value === "own" && !own) $<HTMLInputElement>("txOwnFile").click(); });
  $("txOwnFile").addEventListener("change", async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = "";
    if (!f) { if (!own) $<HTMLSelectElement>("txFont").value = "mono"; return; }
    try {
      ownBytes = new Uint8Array(await f.arrayBuffer()); const faces = await fontFaces(ownBytes);
      $<HTMLSelectElement>("txOwnFace").replaceChildren(...faces.map((x) => Object.assign(document.createElement("option"), { value: x.postscriptName, textContent: x.name })));
      $("txOwnFaceRow").hidden = faces.length < 2;
      await useFace(faces.length > 1 ? faces[0].postscriptName : undefined);
    } catch (err) { if (!own) $<HTMLSelectElement>("txFont").value = "mono"; say(err instanceof Error ? err.message : "Couldn't read this font file.", "bad"); }
  });
  $("txOwnFace").addEventListener("change", () => { void useFace($<HTMLSelectElement>("txOwnFace").value); });

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
      const doc = await PDFDocument.create(), choice = $<HTMLSelectElement>("txFont").value;
      if (choice === "own" && !own) return say("Choose a font file first (Font: “Your own font…”).", "bad");
      const face = choice === "own" ? await embedOwnFont(doc, own!) : choice === "noto" ? notoFace(doc, notoLib, ($<HTMLSelectElement>("txHan").value as HanStyle) || "auto", false, ($<HTMLSelectElement>("txArabic").value as ArabicStyle) || "auto") : standardFace(fontSet(doc)(choice as "mono" | "sans" | "serif", false));
      if (face.prepare) { say("Loading the fonts this text needs…"); await face.prepare(raw); }
      const gaps = new Set(face.missing(raw.replace(/[\t\r\n]/g, ""))), miss = { chars: [...gaps], count: [...raw].filter((c) => gaps.has(c)).length };
      const text = miss.count ? [...raw].map((c) => (gaps.has(c) ? "?" : c)).join("") : raw;
      const lines = wrapText(text, (s) => face.widthOfTextAtSize(s, size), width - 2 * margin, TEXT_DEFAULTS.tab);
      // line spacing: the usual 1.3 times the size, or more for a font that is taller than that (Nastaliq is)
      const step = Math.max(size * layout.lineGap, face.heightAtSize(size) * 1.05), pages = paginate(lines, Math.max(1, Math.floor((height - 2 * margin) / step)));
      for (const pl of pages) {
        const page = doc.addPage([width, height]);
        pl.forEach((l, i) => {
          if (!l.trim()) return;
          // a line that starts right-to-left (Arabic, Hebrew, Urdu, ...) is set against the right margin
          const rtl = /^[^\p{L}]*[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u.test(l), w = face.widthOfTextAtSize(l, size);
          face.draw(page, l, { x: rtl ? width - margin - w : margin, y: height - margin - size - i * step, size, color: { r: 0, g: 0, b: 0 }, rotate: 0, opacity: 1 });
        });
      }
      const bytes = await doc.save(), name = `${safeName($<HTMLInputElement>("txName").value) || "text"}.pdf`;
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })), download: name });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      say(`Saved ${name}: ${pages.length} ${pages.length === 1 ? "page" : "pages"}.${miss.count ? ` ${miss.count} ${miss.count === 1 ? "character" : "characters"} the font can't draw (${miss.chars.slice(0, 8).join(" ")}${miss.chars.length > 8 ? " …" : ""}) became "?".` : ""}`, miss.count ? "warn" : "info");
    } catch (e) { console.error(e); say("Couldn't make the PDF. Try a smaller text or a different page size.", "bad"); }
  });
}
