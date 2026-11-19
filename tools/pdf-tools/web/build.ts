// Writes the output PDF(s) from the session's page list. No DOM, so it runs in tests as well as in the browser.
// Pages are copied from the source files as they are (text stays text, images are not re-compressed);
// only the page order, rotation and size change.
import { imageLayout, NO_IMAGE_LAYOUT, type ImageLayout } from "./layout.ts";
import { cropBoxFor, isCropped, appliesTo, type CropOptions } from "./crop.ts";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import { standardFace, type Face } from "./face.ts";
import { embedOwnFont, type OwnFont } from "./ownfont.ts";
import { notoFace, notoLibrary, type NotoLoader, type HanStyle, type ArabicStyle } from "./noto.ts";
import { placeText, placeImage, placeBox, shapePath, parseColor, unsupported, visibleSize, type FontKey, type Mark, type Quarter } from "./marks.ts";
import { numberMark, watermarkMarks, type NumberOptions, type WatermarkOptions } from "./stamps.ts";
import type { PageItem, Rotation } from "./session.ts";

export type SourceData =
  | { kind: "pdf"; bytes: Uint8Array; password?: string }
  /** `turn`: degrees clockwise the stored pixels must be turned to look right (a photo's orientation note). */
  | { kind: "image"; bytes: Uint8Array; type: "png" | "jpeg"; turn?: Rotation };

export type BuildOptions = { imageDpi: number; images?: ImageLayout; crop?: CropOptions; numbers?: NumberOptions; watermark?: WatermarkOptions; ownFont?: OwnFont; ownBold?: OwnFont; noto?: NotoLoader; han?: HanStyle; arabic?: ArabicStyle };   // ownBold: an optional bold file for the own font
/** For building one page out of a longer document (a preview): its position, and the document's length. */
export type Place = { index: number; total: number };

const FONT_NAMES: Record<Exclude<FontKey, "own" | "noto">, [StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold],
};
/** The fonts added text can use: the PDF format's built-in ones, which every PDF viewer has, so nothing needs
 *  embedding. They cover Western European characters only. Fonts are created on first use. */
export function fontSet(doc: PDFDocument) {
  const made = new Map<string, PDFFont>();
  return (font: FontKey, bold: boolean): PDFFont => {
    const name = FONT_NAMES[font === "own" || font === "noto" ? "sans" : font][bold ? 1 : 0];
    let f = made.get(name);
    if (!f) made.set(name, (f = doc.embedStandardFont(name)));
    return f;
  };
}
export const OWN_FONT_MISSING = "Text is set in your own font, but no font file is chosen. Font files are not kept in settings files or between visits: choose it again under \u201cYour own font\u201d.";
/** Faces for added text in `doc`: built-in fonts, or the visitor's own font (embedded on first use, so a file
 *  that doesn't use it doesn't carry it). Bold has no effect on the visitor's own font. */
const libraries = new WeakMap<NotoLoader, ReturnType<typeof notoLibrary>>();
/** Faces for added text in `doc`: built-in fonts, the shipped Noto fonts (regular or bold), or the visitor's own font
 *  (embedded on first use, so a file that doesn't use it doesn't carry it). Bold in the visitor's own font uses the bold
 *  file they added, or else a simulated bold (the letters outlined to thicken them). */
export function faceSet(doc: PDFDocument, own?: OwnFont, noto?: NotoLoader, han: HanStyle = "auto", ownBold?: OwnFont, arabic: ArabicStyle = "auto") {
  const fonts = fontSet(doc), made = new Map<string, Promise<Face> | Face>();
  return async (font: FontKey, bold: boolean): Promise<Face> => {
    if (font === "noto") {
      if (!noto) throw new Error("The shipped Noto fonts aren't available here.");
      let lib = libraries.get(noto); if (!lib) libraries.set(noto, (lib = notoLibrary(noto)));
      const key = `noto${bold}`; let f = made.get(key); if (!f) made.set(key, (f = notoFace(doc, lib, han, bold, arabic))); return f;
    }
    if (font !== "own") return standardFace(fonts(font, bold));
    if (!own) throw new Error(OWN_FONT_MISSING);
    const key = `own${bold}`; let f = made.get(key);
    if (!f) made.set(key, (f = bold && ownBold ? embedOwnFont(doc, ownBold) : embedOwnFont(doc, own, bold)));
    return f;
  };
}
/** Characters of `text` the built-in fonts can't draw. */
export const cantDraw = (text: string, font: PDFFont) => unsupported(text, new Set(font.getCharacterSet()));

/** Opens each source once, so several output files (a split) can share it. */
/** Scales a page and everything on it. The library's own `scale` resets the crop box (and the other boxes) to the full
 *  page size, which shows the wrong part of a page that was already cropped, so every box is scaled here instead. */
export function scalePage(page: PDFPage, s: number): void {
  const names = ["Media", "Crop", "Bleed", "Trim", "Art"] as const;
  const had = { Crop: !!page.node.CropBox(), Bleed: !!page.node.BleedBox(), Trim: !!page.node.TrimBox(), Art: !!page.node.ArtBox() };
  const before = { Media: page.getMediaBox(), Crop: page.getCropBox(), Bleed: page.getBleedBox(), Trim: page.getTrimBox(), Art: page.getArtBox() };
  page.scaleContent(s, s);
  page.scaleAnnotations(s, s);
  for (const n of names) {
    if (n !== "Media" && !had[n]) continue;                      // a box the page never had stays absent (it follows the page size)
    const b = before[n];
    page[`set${n}Box`](b.x * s, b.y * s, b.width * s, b.height * s);
  }
}

export function makeBuilder(data: Map<string, SourceData>, opts: BuildOptions) {
  const open = new Map<string, Promise<PDFDocument>>();
  const source = (id: string) => {
    const d = data.get(id);
    if (!d || d.kind !== "pdf") throw new Error(`Source ${id} isn't loaded.`);
    let doc = open.get(id);
    if (!doc) open.set(id, (doc = PDFDocument.load(d.bytes, d.password === undefined ? {} : { password: d.password })));
    return doc;
  };

  return async function build(pages: PageItem[], place?: Place): Promise<Uint8Array> {
    if (!pages.length) throw new Error("There are no pages to save.");
    const out = await PDFDocument.create();

    // Copy each source's pages in as few batches as possible so shared fonts and images are stored once.
    // A page used twice goes in a second batch: one batch returns the same copy for a repeated page.
    const copies = new Map<PageItem, Awaited<ReturnType<PDFDocument["copyPages"]>>[number]>();
    const bySource = new Map<string, PageItem[]>();
    for (const p of pages) {
      const d = data.get(p.src);
      if (!d) throw new Error("A source file for some pages hasn't been added yet.");
      if (d.kind === "pdf") bySource.set(p.src, [...(bySource.get(p.src) ?? []), p]);
    }
    for (const [id, items] of bySource) {
      const doc = await source(id);
      let rest = items;
      while (rest.length) {
        const batch: PageItem[] = [], later: PageItem[] = [], seen = new Set<number>();
        for (const p of rest) (seen.has(p.page) ? later : (seen.add(p.page), batch)).push(p);
        const copied = await out.copyPages(doc, batch.map((p) => p.page));
        batch.forEach((p, i) => copies.set(p, copied[i]));
        rest = later;
      }
    }

    const embedded = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
    const picture = async (id: string) => {
      const d = data.get(id);
      if (!d || d.kind !== "image") throw new Error("A picture placed on a page hasn't been added yet.");
      let img = embedded.get(id);
      if (!img) embedded.set(id, (img = d.type === "png" ? await out.embedPng(d.bytes) : await out.embedJpg(d.bytes)));
      return img;
    };
    const faces = faceSet(out, opts.ownFont, opts.noto, opts.han, opts.ownBold, opts.arabic);
    const prepared = async (font: FontKey, bold: boolean, text: string) => { const f = await faces(font, bold); await f.prepare?.(text); return f; };
    async function drawMarks(page: PDFPage, marks: Mark[]) {
      const box = page.getCropBox(), rotation = ((((page.getRotation().angle % 360) + 360) % 360) as Quarter);
      for (const m of marks) {
        if (m.type === "text") {
          const face = await faces(m.font, m.bold); await face.prepare?.(m.text);
          const bad = face.missing(m.text.replace(/\n/g, ""));
          if (bad.length) throw new Error(m.font === "own"
            ? `Your font has no letters for: ${bad.slice(0, 12).join(" ")}. Choose a font that covers them.`
            : m.font === "noto" ? `The Noto fonts on this site have no letters for: ${bad.slice(0, 12).join(" ")}. For these, choose \u201cYour own font\u201d.`
            : `Added text contains characters the built-in fonts can't write: ${bad.slice(0, 12).join(" ")}. They cover Western European letters, digits and common punctuation; for other alphabets choose \u201cYour own font\u201d.`);
          const placed = placeText(m, face, box, rotation), c = parseColor(m.color);
          for (const l of placed.lines) if (l.text) face.draw(page, l.text, { x: l.x, y: l.y, size: m.size, color: c, rotate: placed.angle, opacity: m.opacity ?? 1 });
        } else if (m.type === "shape" || m.type === "ink") {
          const at = placeBox(m, box, rotation), c = parseColor(m.color), f = m.type === "shape" && m.fill ? parseColor(m.fill) : null;
          const line = m.type === "ink" || m.shape === "line", op = m.opacity ?? 1;
          if (m.type === "shape" && !m.width && !f) continue;
          page.drawSvgPath(shapePath(m), {
            x: at.x, y: at.y, rotate: degrees(at.angle),
            ...(f && !line ? { color: rgb(f.r, f.g, f.b), opacity: op } : {}),
            ...(m.width > 0 ? { borderColor: rgb(c.r, c.g, c.b), borderWidth: m.width, borderOpacity: op, borderLineCap: 1 /* round */ } : {}),
          });
        } else {
          const at = placeImage(m, box, rotation);
          page.drawImage(await picture(m.src), { x: at.x, y: at.y, width: at.width, height: at.height, rotate: degrees(at.angle), opacity: m.opacity ?? 1 });
        }
      }
    }
    for (const [i, p] of pages.entries()) {
      const d = data.get(p.src)!;
      let page;
      if (d.kind === "pdf") page = out.addPage(copies.get(p)!);
      else {
        const img = await picture(p.src);
        const w = (img.width * 72) / opts.imageDpi, h = (img.height * 72) / opts.imageDpi; // PDF units are 1/72 inch
        const L = imageLayout(w, h, d.turn ?? 0, opts.images ?? NO_IMAGE_LAYOUT);
        page = out.addPage([L.pageW, L.pageH]);
        page.drawImage(img, { x: L.x, y: L.y, width: L.w, height: L.h });
      }
      // Marks are positioned on the page as the file shows it (a photo's orientation note included), before any
      // turn made in this tool, so they are drawn first and then turn with the page.
      const own = d.kind === "image" ? d.turn ?? 0 : 0;
      if (own) page.setRotation(degrees((page.getRotation().angle + own) % 360));
      if (p.marks?.length) await drawMarks(page, p.marks);
      // Cropping hides the margins (the page's crop box); it works in the page as the file shows it, so it comes before the turn.
      if (opts.crop && isCropped(opts.crop) && appliesTo(opts.crop, (place?.index ?? 0) + i, place?.total ?? pages.length)) {
        const rotation = ((((page.getRotation().angle % 360) + 360) % 360) as Quarter), b = cropBoxFor(page.getCropBox(), rotation, opts.crop);
        page.setCropBox(b.x, b.y, b.width, b.height);
      }
      if (p.rotate) page.setRotation(degrees((page.getRotation().angle + p.rotate) % 360));
      if (p.scale !== 1) scalePage(page, p.scale);
      // Stamps go on last, placed on the page as it will finally be seen, so they are the same size on every page.
      if (opts.watermark?.on && opts.watermark.text.trim()) {
        const rotation = ((((page.getRotation().angle % 360) + 360) % 360) as Quarter);
        await drawMarks(page, watermarkMarks(opts.watermark, visibleSize(page.getCropBox(), rotation), await prepared(opts.watermark.font, opts.watermark.bold, opts.watermark.text)));
      }
      if (opts.numbers?.on) {
        const rotation = ((((page.getRotation().angle % 360) + 360) % 360) as Quarter);
        const n = numberMark(opts.numbers, (place?.index ?? 0) + i, place?.total ?? pages.length, visibleSize(page.getCropBox(), rotation), await prepared(opts.numbers.font, opts.numbers.bold, "Page 0123456789 of /"));
        if (n) await drawMarks(page, [n]);
      }
    }
    return out.save();
  };
}

/** A copy of the PDF that can only be opened with `password` (AES-256, the library's default and strongest
 *  cipher). The same password gives full access; there is no separate "owner" password. */
export async function protect(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (!password) throw new Error("Type a password first.");
  const doc = await PDFDocument.load(bytes);
  doc.encrypt({
    userPassword: password, ownerPassword: password,
    // No restrictions: whoever has the password can print, copy and change the document.
    permissions: { printing: "highResolution", modifying: true, copying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true },
  });
  return doc.save();
}

/** Page count of a PDF; throws if it can't be opened. `needsPassword` errors are reported by name. */
export async function inspectPdf(bytes: Uint8Array, password?: string): Promise<{ pages: number }> {
  const doc = await PDFDocument.load(bytes, password === undefined ? {} : { password });
  return { pages: doc.getPageCount() };
}
