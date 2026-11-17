// Writes the output PDF(s) from the session's page list. No DOM, so it runs in tests as well as in the browser.
// Pages are copied from the source files as they are (text stays text, images are not re-compressed);
// only the page order, rotation and size change.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import { placeText, placeImage, parseColor, unsupported, visibleSize, type FontKey, type Mark, type Quarter } from "./marks.ts";
import { numberMark, type NumberOptions } from "./stamps.ts";
import type { PageItem, Rotation } from "./session.ts";

export type SourceData =
  | { kind: "pdf"; bytes: Uint8Array; password?: string }
  /** `turn`: degrees clockwise the stored pixels must be turned to look right (a photo's orientation note). */
  | { kind: "image"; bytes: Uint8Array; type: "png" | "jpeg"; turn?: Rotation };

export type BuildOptions = { imageDpi: number; numbers?: NumberOptions };
/** For building one page out of a longer document (a preview): its position, and the document's length. */
export type Place = { index: number; total: number };

const FONT_NAMES: Record<FontKey, [StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold],
};
/** The fonts added text can use: the PDF format's built-in ones, which every PDF viewer has, so nothing needs
 *  embedding. They cover Western European characters only. Fonts are created on first use. */
export function fontSet(doc: PDFDocument) {
  const made = new Map<string, PDFFont>();
  return (font: FontKey, bold: boolean): PDFFont => {
    const name = FONT_NAMES[font][bold ? 1 : 0];
    let f = made.get(name);
    if (!f) made.set(name, (f = doc.embedStandardFont(name)));
    return f;
  };
}
/** Characters of `text` the built-in fonts can't draw. */
export const cantDraw = (text: string, font: PDFFont) => unsupported(text, new Set(font.getCharacterSet()));

/** Opens each source once, so several output files (a split) can share it. */
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
    const fonts = fontSet(out);
    async function drawMarks(page: PDFPage, marks: Mark[]) {
      const box = page.getCropBox(), rotation = ((((page.getRotation().angle % 360) + 360) % 360) as Quarter);
      for (const m of marks) {
        if (m.type === "text") {
          const font = fonts(m.font, m.bold), bad = cantDraw(m.text, font);
          if (bad.length) throw new Error(`Added text contains characters this tool can't write yet: ${bad.slice(0, 12).join(" ")}. It can write Western European letters, digits and common punctuation.`);
          const placed = placeText(m, font, box, rotation), c = parseColor(m.color);
          for (const l of placed.lines) if (l.text) page.drawText(l.text, { x: l.x, y: l.y, size: m.size, font, color: rgb(c.r, c.g, c.b), rotate: degrees(placed.angle) });
        } else {
          const at = placeImage(m, box, rotation);
          page.drawImage(await picture(m.src), { x: at.x, y: at.y, width: at.width, height: at.height, rotate: degrees(at.angle) });
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
        page = out.addPage([w, h]);
        page.drawImage(img, { x: 0, y: 0, width: w, height: h });
      }
      // Marks are positioned on the page as the file shows it (a photo's orientation note included), before any
      // turn made in this tool, so they are drawn first and then turn with the page.
      const own = d.kind === "image" ? d.turn ?? 0 : 0;
      if (own) page.setRotation(degrees((page.getRotation().angle + own) % 360));
      if (p.marks?.length) await drawMarks(page, p.marks);
      if (p.rotate) page.setRotation(degrees((page.getRotation().angle + p.rotate) % 360));
      if (p.scale !== 1) page.scale(p.scale, p.scale);
      // Stamps go on last, placed on the page as it will finally be seen, so they are the same size on every page.
      if (opts.numbers?.on) {
        const rotation = ((((page.getRotation().angle % 360) + 360) % 360) as Quarter);
        const n = numberMark(opts.numbers, (place?.index ?? 0) + i, place?.total ?? pages.length, visibleSize(page.getCropBox(), rotation), fonts(opts.numbers.font, opts.numbers.bold));
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
