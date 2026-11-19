/**
 * A "face" is what added text is measured and drawn with. Two kinds:
 *  - the PDF format's built-in fonts (Helvetica, Times, Courier), which every viewer has; Western European only;
 *  - a font file the visitor chose from their own device ("your own font"). It is read inside the browser, never
 *    uploaded, and only the letters used are embedded in the saved PDF.
 *
 * Text in the visitor's font is put in display order by the Unicode Bidirectional Algorithm (bidi-js), so mixed
 * right-to-left and left-to-right text reads correctly, then each run is shaped by HarfBuzz (shaper.ts: letters joined
 * and reordered as the script needs, for Arabic, Indic, Thai and so on), and each glyph is placed where the font's
 * positioning data puts it. (fontkit, which the PDF library uses to embed fonts, also shapes text, but in testing it
 * put accents in the wrong place, for example the accent of "ó" after "ü"; HarfBuzz is what web browsers use.) Each drawn
 * string is tagged with the text it stands for (PDF "ActualText"), so copying and searching give the words as typed.
 */
import bidiFactory from "bidi-js";
import { PDFFont, PDFHexString, PDFName, PDFOperator, PDFPage, rgb, degrees, beginText, endText, setFontAndSize, setTextMatrix, showText, setFillingColor, pushGraphicsState, popGraphicsState, setGraphicsState } from "@cantoo/pdf-lib";
import { unsupported } from "./marks.ts";

export type Rgb = { r: number; g: number; b: number };
export type DrawOptions = { x: number; y: number; size: number; color: Rgb; rotate: number; opacity: number };   // rotate: degrees anticlockwise, as the PDF library uses
export interface Face {
  widthOfTextAtSize(text: string, size: number): number;
  heightAtSize(size: number, options?: { descender?: boolean }): number;
  /** Characters of `text` this face cannot draw (each listed once). */
  missing(text: string): string[];
  draw(page: PDFPage, text: string, o: DrawOptions): void;
}

/** One of the built-in fonts. */
export function standardFace(font: PDFFont): Face {
  const has = new Set(font.getCharacterSet());
  return {
    widthOfTextAtSize: (t, s) => font.widthOfTextAtSize(t, s),
    heightAtSize: (s, o) => font.heightAtSize(s, o),
    missing: (t) => unsupported(t, has),
    draw: (page, text, o) => page.drawText(text, { x: o.x, y: o.y, size: o.size, font, color: rgb(o.color.r, o.color.g, o.color.b), rotate: degrees(o.rotate), opacity: o.opacity }),
  };
}

// ---------- fontkit types (only what is used) ----------
export type FkGlyph = { id: number; codePoints: number[]; advanceWidth: number };
export type FkFont = {
  unitsPerEm: number; ascent: number; descent: number; postscriptName: string; familyName: string; fullName?: string;
  numGlyphs: number; "OS/2"?: { fsType?: Partial<Record<"noEmbedding" | "viewOnly" | "editable" | "noSubsetting" | "bitmapOnly", boolean>> };
  hasGlyphForCodePoint(cp: number): boolean;
  getGlyph(id: number, codePoints?: number[]): FkGlyph;
};

/** One glyph from shaping a run: its id in the font, the characters it stands for (the first glyph of a cluster
 *  carries them, the rest none), its advance and its offsets, all in font units. */
export type ShapedGlyph = { id: number; chars: string; ax: number; dx: number; dy: number };
/** Shapes one run of one direction; returns glyphs in display order (left to right). */
export type Shaper = (text: string, rtl: boolean) => ShapedGlyph[];
/** A shaped glyph, in display order, with its pen position along the baseline (font units). */
export type Placed = ShapedGlyph & { x: number };

const bidi = bidiFactory();

/** Splits `text` into runs of one direction, shapes each, and puts the runs in display order (left to right). */
export function shapeLine(shape: Shaper, text: string): { glyphs: Placed[]; width: number } {
  if (!text) return { glyphs: [], width: 0 };
  const levels = bidi.getEmbeddingLevels(text).levels;
  // logical runs of equal level (index ranges in the string; code units, as bidi-js uses)
  const runs: { start: number; end: number; level: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.level === levels[i] && last.end === i) last.end = i + 1; else runs.push({ start: i, end: i + 1, level: levels[i] });
  }
  // Rule L2 of the bidi algorithm, applied to whole runs: from the highest level down to the lowest odd level,
  // reverse every stretch of runs at that level or higher.
  const max = Math.max(...runs.map((r) => r.level)), minOdd = Math.min(...runs.map((r) => r.level).filter((l) => l % 2 === 1), Infinity);
  for (let k = max; k >= minOdd && k > 0; k--) {
    for (let i = 0; i < runs.length; ) {
      if (runs[i].level < k) { i++; continue; }
      let j = i; while (j + 1 < runs.length && runs[j + 1].level >= k) j++;
      runs.splice(i, j - i + 1, ...runs.slice(i, j + 1).reverse()); i = j + 1;
    }
  }
  const glyphs: Placed[] = []; let pen = 0;
  for (const r of runs) {
    const rtl = r.level % 2 === 1;
    // The shaper mirrors brackets in right-to-left runs itself (HarfBuzz does), so ( still opens towards the text.
    for (const g of shape(text.slice(r.start, r.end), rtl)) { glyphs.push({ ...g, x: pen }); pen += g.ax; }
  }
  return { glyphs, width: pen };
}

/** The glyph-id encoder of a font embedded by the PDF library with subsetting: adds a glyph to the subset and
 *  returns its id in the subset. Uses the library's own subset object, so the saved font's widths and its
 *  character map (ToUnicode) include every glyph drawn. Checked by the tests against the library version in use. */
type SubsetEmbedder = { subset: { includeGlyph(g: FkGlyph): number }; glyphs: FkGlyph[]; glyphIdMap: Map<number, number>; glyphCache: { invalidate(): void } };
function glyphEncoder(font: PDFFont): (g: FkGlyph) => number {
  const e = (font as unknown as { embedder: Partial<SubsetEmbedder> }).embedder;
  if (!e?.subset || typeof e.subset.includeGlyph !== "function" || !Array.isArray(e.glyphs) || !(e.glyphIdMap instanceof Map) || !e.glyphCache) {
    return (g) => g.id;   // embedded whole (the font forbids subsetting): glyph ids are the font's own
  }
  const s = e as SubsetEmbedder;
  return (g) => { const id = s.subset.includeGlyph(g); s.glyphs[id - 1] = g; s.glyphIdMap.set(g.id, id); s.glyphCache.invalidate(); return id; };
}

const utf16Hex = (t: string) => PDFHexString.fromText(t);
const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;

/** A face for a font file embedded in `font` (embedded with the PDF library from the same bytes as `fk`); `shape`
 *  shapes text with the same font. */
export function ownFace(fk: FkFont, font: PDFFont, shape: Shaper): Face {
  const encode = glyphEncoder(font);
  return {
    widthOfTextAtSize: (t, s) => (shapeLine(shape, t).width * s) / fk.unitsPerEm,
    heightAtSize: (s, o) => ((fk.ascent - (o?.descender === false ? 0 : fk.descent)) * s) / fk.unitsPerEm,
    missing: (t) => [...new Set([...t].filter((c) => { const cp = c.codePointAt(0)!; return cp > 0x20 && !/\p{Cf}|\p{Zs}/u.test(c) && !fk.hasGlyphForCodePoint(cp); }))],
    draw(page, text, o) {
      const { glyphs } = shapeLine(shape, text); if (!glyphs.length) return;
      const key = page.node.newFontDictionary(font.name, font.ref), k = o.size / fk.unitsPerEm;
      const a = (o.rotate * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
      const ops: PDFOperator[] = [pushGraphicsState()];
      if (o.opacity < 1) ops.push(setGraphicsState(page.node.newExtGState("GS", page.doc.context.obj({ Type: "ExtGState", ca: o.opacity, CA: o.opacity }))));
      // The real text goes with the glyphs ("ActualText"), so readers that use it (Acrobat, Chrome, poppler) give back
      // the words as typed even where shaping reordered letters (Hindi, Bengali, Tamil, ...). Not for lines with
      // right-to-left text: readers put those in reading order from the glyphs themselves, and would reverse the
      // ActualText again (seen with poppler).
      const tag = !RTL.test(text);
      if (tag) ops.push(PDFOperator.of("BDC" as never, [PDFName.of("Span"), page.doc.context.obj({ ActualText: utf16Hex(text) }) as never]));
      ops.push(beginText(), setFillingColor(rgb(o.color.r, o.color.g, o.color.b)), setFontAndSize(key, o.size));
      for (const p of glyphs) {
        const u = (p.x + p.dx) * k, v = p.dy * k;
        const id = encode(fk.getGlyph(p.id, [...p.chars].map((c) => c.codePointAt(0)!)));   // the characters go into the font's character map, for search
        ops.push(setTextMatrix(cos, sin, -sin, cos, o.x + u * cos - v * sin, o.y + u * sin + v * cos), showText(PDFHexString.of(id.toString(16).padStart(4, "0"))));
      }
      ops.push(endText()); if (tag) ops.push(PDFOperator.of("EMC" as never)); ops.push(popGraphicsState());
      page.pushOperators(...ops);
    },
  };
}

// ---------- checking a font file the visitor chose ----------
/** The font's fsType flags as the number the OpenType specification describes (fontkit gives them by name). */
export function fsTypeOf(fk: Pick<FkFont, "OS/2">): number {
  const f = fk["OS/2"]?.fsType ?? {};
  return (f.noEmbedding ? 0x2 : 0) | (f.viewOnly ? 0x4 : 0) | (f.editable ? 0x8 : 0) | (f.noSubsetting ? 0x100 : 0) | (f.bitmapOnly ? 0x200 : 0);
}
export type FontCheck = { ok: true; subset: boolean; note?: string } | { ok: false; reason: string };
/**
 * Reads the font's own embedding permission (the "fsType" field of its OS/2 table, set by the font's maker):
 *  - bit 1 ("restricted licence"): may not be embedded, so the font is refused, even if another permission bit is
 *    also set (the specification says these bits should never be combined, and that some programs then assume the
 *    least restrictive; this tool assumes the most restrictive);
 *  - bit 9 ("bitmap embedding only"): refused, because only outlines are embedded here;
 *  - bit 8 ("no subsetting"): allowed, but the whole font is embedded;
 *  - bit 2 ("preview and print"): allowed, and the visitor is told what that means.
 * Following the OpenType specification's OS/2 table description (archived: pdftools_opentype-spec_os2.pdf). This is the maker's technical flag, not the
 * licence itself, and the page says so.
 */
export function checkEmbedding(fsType: number | undefined): FontCheck {
  const t = fsType ?? 0, kind = t & 0x000f;
  if (t & 0x0200) return { ok: false, reason: "its maker allows only bitmap copies of it to be embedded, which this tool does not make" };
  if (kind & 0x0002) return { ok: false, reason: "its maker does not allow it to be embedded in documents (it is marked “restricted licence”)" };
  const subset = !(t & 0x0100);
  const notes = [kind & 0x0004 ? "its maker allows documents using it to be viewed and printed, not edited" : "", subset ? "" : "its maker does not allow cutting it down, so the whole font goes into the saved file"].filter(Boolean);
  return { ok: true, subset, ...(notes.length ? { note: notes.join("; ") } : {}) };
}
