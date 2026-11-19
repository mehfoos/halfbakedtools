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
import { PDFFont, PDFHexString, PDFName, PDFOperator, PDFPage, rgb, degrees, setTextRise, setTextRenderingMode, TextRenderingMode, setStrokingColor, setLineWidth, setLineJoin, LineJoinStyle, beginText, endText, setFontAndSize, setTextMatrix, showText, setFillingColor, pushGraphicsState, popGraphicsState, setGraphicsState } from "@cantoo/pdf-lib";
import { unsupported } from "./marks.ts";

export type Rgb = { r: number; g: number; b: number };
export type DrawOptions = { x: number; y: number; size: number; color: Rgb; rotate: number; opacity: number };   // rotate: degrees anticlockwise, as the PDF library uses
export interface Face {
  /** Loads whatever this face needs to draw `text` (fonts loaded on demand); not every face needs it. */
  prepare?(text: string): Promise<void>;
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

/** A font that a line can be shaped with: its shaper, whether it has a character, and its units per em. */
export type ShapeFont = { shape: Shaper; has(cp: number): boolean; upem: number };
/** A shaped glyph from one of several fonts: `font` is its index; `x`, `dx`, `dy` and `ax` are in ems. */
export type PlacedIn = ShapedGlyph & { x: number; font: number };

/** Characters that belong with the one before them (marks, joiners, variation selectors), so they stay in its font. */
const CLINGS = /[\p{M}\u200C\u200D\uFE00-\uFE0F]/u;

/**
 * Splits `text` into runs of one direction (Unicode Bidirectional Algorithm), puts the runs in display order, splits each
 * run by font (each character goes to the first font that has it, marks and joiners to their letter's font), shapes
 * each piece, and returns the glyphs left to right.
 */
export function shapeRuns(text: string, fonts: ShapeFont[]): { glyphs: PlacedIn[]; width: number } {
  if (!text || !fonts.length) return { glyphs: [], width: 0 };
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
  const glyphs: PlacedIn[] = []; let pen = 0;
  for (const r of runs) {
    const rtl = r.level % 2 === 1, part = text.slice(r.start, r.end);
    // pieces of one font, in reading order
    const pieces: { font: number; text: string }[] = []; let spaces = "";
    const add = (font: number, t: string) => { const last = pieces[pieces.length - 1]; if (last && last.font === font) last.text += t; else pieces.push({ font, text: t }); };
    for (const ch of part) {
      const cp = ch.codePointAt(0)!, last = pieces[pieces.length - 1];
      // Spaces stay in the font of the text around them (the font before, or else the one after), so a line in one
      // alphabet stays one piece: readers such as PDF.js put right-to-left words in order only within a piece.
      if (/\p{Zs}/u.test(ch)) { if (last && fonts[last.font].has(cp)) last.text += ch; else spaces += ch; continue; }
      // Marks and joiners stay with their letter; any other character goes to the first font that has it, the same rule
      // used to decide which fonts to load (noto.ts), so nothing is drawn from a font that was not loaded for it.
      const font = last && CLINGS.test(ch) ? last.font : Math.max(0, fonts.findIndex((f) => f.has(cp)));
      if (spaces) { const sf = fonts[font].has(32) ? font : Math.max(0, fonts.findIndex((f) => f.has(32))); add(sf, spaces); spaces = ""; }
      add(font, ch);
    }
    if (spaces) add(pieces.length ? pieces[pieces.length - 1].font : Math.max(0, fonts.findIndex((f) => f.has(32))), spaces);
    if (rtl) pieces.reverse();   // right-to-left: the last piece in reading order is leftmost
    // The shaper mirrors brackets in right-to-left runs itself (HarfBuzz does), so ( still opens towards the text.
    for (const p of pieces) {
      const f = fonts[p.font];
      for (const g of f.shape(p.text, rtl)) {
        glyphs.push({ ...g, ax: g.ax / f.upem, dx: g.dx / f.upem, dy: g.dy / f.upem, x: pen, font: p.font }); pen += g.ax / f.upem;
      }
    }
  }
  return { glyphs, width: pen };
}

/** One font: positions in the font's own units (as HarfBuzz gives them). */
export function shapeLine(shape: Shaper, text: string): { glyphs: Placed[]; width: number } {
  const r = shapeRuns(text, [{ shape, has: () => true, upem: 1 }]);
  return { glyphs: r.glyphs, width: r.width };
}

/**
 * The glyph encoder of a font embedded by the PDF library with subsetting: adds a glyph to the subset and returns its
 * id there. The saved font's widths and its character map (ToUnicode, which copying and searching use) are built
 * from records kept here: the subset id, the glyph's width, and the characters it was drawn for.
 *
 * One glyph of a font can be drawn for different characters: Arabic-script fonts draw the bases of ب and ت (or of
 * ح and خ) with one dotless glyph and add the dots as separate glyphs, so the first glyph of each letter is shared.
 * A character map can give only one text per glyph id, so when a glyph is drawn again for different characters it
 * is added to the subset a second time (a copy of the same outline, under a new id) and that copy carries the second
 * text. (The font library caches one glyph object per glyph, holding the characters of its first use; it is not
 * used for this.) Glyphs that carry no characters (the second and later glyphs of a cluster, such as the dots of an
 * Arabic letter) are given LETTERLESS (they get their own copy if the same glyph also carries characters).
 * Uses the library's own subset objects; checked by the tests against the library version in use.
 */
/**
 * What a glyph that stands for no characters gives in the character map: U+2060 WORD JOINER, an invisible format
 * character. Leaving such glyphs out of the map, or mapping them to nothing, made PDF.js, PDFium and MuPDF give back
 * control characters for them (they fall back to the glyph's number); PDF.js skips format characters, and in pasted
 * Arabic-script text a word joiner does not break the joining of letters (format characters are transparent to
 * joining). Readers that use the lines' real text (ActualText, below) do not see it at all.
 */
const LETTERLESS = 0x2060;
type GlyphRecord = { id: number; codePoints: number[]; advanceWidth: number };
type SubsetEmbedder = {
  subset: { includeGlyph(g: number): number; glyphs: number[]; mapping: Record<number, number> };
  glyphs: (GlyphRecord | FkGlyph)[]; glyphIdMap: Map<number, number>; glyphCache: { invalidate(): void };
  glyphId(g?: GlyphRecord | FkGlyph): number; embedUnicodeCmap(context: unknown): unknown;
};
function glyphEncoder(font: PDFFont): (g: FkGlyph, chars: string) => number {
  const e = (font as unknown as { embedder: Partial<SubsetEmbedder> }).embedder;
  if (!e?.subset || typeof e.subset.includeGlyph !== "function" || !Array.isArray(e.subset.glyphs) || !e.subset.mapping || !Array.isArray(e.glyphs) || !(e.glyphIdMap instanceof Map) || !e.glyphCache || typeof e.glyphId !== "function" || typeof e.embedUnicodeCmap !== "function") {
    return (g) => g.id;   // embedded whole (the font forbids subsetting): glyph ids are the font's own
  }
  const s = e as SubsetEmbedder, mine = new WeakSet<object>(), byText = new Map<string, number>(), used = new Set<number>();
  const libraryId = s.glyphId.bind(s), libraryCmap = s.embedUnicodeCmap.bind(s);
  s.glyphId = (g) => (g && (mine.has(g) || (g as { copy?: boolean }).copy) ? g.id : libraryId(g));
  // glyphs that stand for no characters are given WORD JOINER in the character map (see LETTERLESS)
  s.embedUnicodeCmap = (context) => {
    const all = s.glyphs;
    s.glyphs = all.map((g) => (g && !g.codePoints.length ? { ...g, codePoints: [LETTERLESS], copy: true } : g)); s.glyphCache.invalidate();
    try { return libraryCmap(context); } finally { s.glyphs = all; s.glyphCache.invalidate(); }
  };
  const record = (sid: number, g: FkGlyph, chars: string) => {
    const r: GlyphRecord = { id: sid, codePoints: [...chars].map((c) => c.codePointAt(0)!), advanceWidth: g.advanceWidth };
    mine.add(r); s.glyphs[sid - 1] = r; s.glyphCache.invalidate();
  };
  return (g, chars) => {
    const key = g.id + "|" + chars, known = byText.get(key); if (known !== undefined) return known;
    let sid: number;
    if (!used.has(g.id)) { sid = s.subset.includeGlyph(g.id); used.add(g.id); }
    else { s.subset.glyphs.push(g.id); sid = s.subset.glyphs.length - 1; }   // already drawn for other characters: a copy
    if (sid > 0) record(sid, g, chars);   // 0 is the font's "missing letter" glyph, never drawn here
    byText.set(g.id + "|" + chars, sid); return sid;
  };
}

const utf16Hex = (t: string) => PDFHexString.fromText(t);

/** One font of a face: the font file read by fontkit, the same file embedded by the PDF library, and its shaper. */
export type FacePart = { fk: FkFont; font: PDFFont; shape: Shaper };

/** A face for a font file embedded in `font` (embedded with the PDF library from the same bytes as `fk`); `shape`
 *  shapes text with the same font. */
export const ownFace = (fk: FkFont, font: PDFFont, shape: Shaper, simulatedBold = false): Face => multiFace(() => [{ fk, font, shape }], simulatedBold);
/** Simulated bold: the letters are filled and also outlined with a line this share of the text size wide. */
export const SIMULATED_BOLD = 0.03;

/**
 * A face made of several fonts, tried in order for each character (see shapeRuns). `parts(text)` gives the fonts in
 * the order to try for that text; it is read each time, so fonts added later (loaded on demand) are used from then on.
 */
export function multiFace(parts: (text: string) => FacePart[], simulatedBold = false): Face {
  const encoders = new WeakMap<PDFFont, (g: FkGlyph, chars: string) => number>();
  const fontsOf = (ps: FacePart[]): ShapeFont[] => ps.map((p) => ({ shape: p.shape, has: (cp) => p.fk.hasGlyphForCodePoint(cp), upem: p.fk.unitsPerEm }));
  return {
    widthOfTextAtSize: (t, s) => shapeRuns(t, fontsOf(parts(t))).width * s,
    heightAtSize(s, o) {
      const ps = parts(""); if (!ps.length) return s;
      const up = Math.max(...ps.map((p) => p.fk.ascent / p.fk.unitsPerEm)), down = Math.max(...ps.map((p) => -p.fk.descent / p.fk.unitsPerEm));
      return (up + (o?.descender === false ? 0 : down)) * s;
    },
    missing: (t) => { const ps = parts(t); return [...new Set([...t].filter((c) => { const cp = c.codePointAt(0)!; return cp > 0x20 && !/\p{Cf}|\p{Zs}/u.test(c) && !ps.some((p) => p.fk.hasGlyphForCodePoint(cp)); }))]; },
    draw(page, text, o) {
      const ps = parts(text), { glyphs } = shapeRuns(text, fontsOf(ps)); if (!glyphs.length) return;
      const keys = new Map<number, ReturnType<typeof page.node.newFontDictionary>>();   // only the fonts this line uses go into the page
      const keyOf = (i: number) => { let k = keys.get(i); if (!k) keys.set(i, (k = page.node.newFontDictionary(ps[i].font.name, ps[i].font.ref))); return k; };
      const encoderFor = (p: FacePart) => { let e = encoders.get(p.font); if (!e) encoders.set(p.font, (e = glyphEncoder(p.font))); return e; };
      const a = (o.rotate * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), k = o.size;
      const ops: PDFOperator[] = [pushGraphicsState()];
      if (o.opacity < 1) ops.push(setGraphicsState(page.node.newExtGState("GS", page.doc.context.obj({ Type: "ExtGState", ca: o.opacity, CA: o.opacity }))));
      // The line's real text goes with its glyphs ("ActualText", PDF 1.5 marked content), so readers that use it give
      // back the words as typed even where shaping reordered or split letters (Hindi, Bengali, Tamil, Arabic dots, ...).
      // ActualText is the text in reading order (logical order), also for right-to-left lines. Tested readers differ
      // (methods page): PDFium (Chrome, Edge) uses it correctly; poppler and MuPDF reverse it on right-to-left lines;
      // PDF.js ignores it and reads the glyphs' own character map.
      ops.push(PDFOperator.of("BDC" as never, [PDFName.of("Span"), page.doc.context.obj({ ActualText: utf16Hex(text) }) as never]));
      ops.push(beginText(), setFillingColor(rgb(o.color.r, o.color.g, o.color.b)));
      // simulated bold: fill each letter and draw its outline in the same colour, which thickens it evenly
      if (simulatedBold) ops.push(setTextRenderingMode(TextRenderingMode.FillAndOutline), setStrokingColor(rgb(o.color.r, o.color.g, o.color.b)), setLineWidth(o.size * SIMULATED_BOLD), setLineJoin(LineJoinStyle.Round));
      // The line is written as runs of glyphs with small spacing adjustments (the TJ operator), the way PDF writers
      // usually do it, rather than placing each glyph on its own: readers then see continuous words. Each adjustment
      // moves the pen from where the font's own width of the previous glyph leaves it to where shaping put the next
      // glyph; a glyph raised or lowered by shaping (a mark) uses the text rise.
      ops.push(setTextMatrix(cos, sin, -sin, cos, o.x, o.y));
      let current = -1, pen = 0, rise = 0, run: (PDFHexString | number)[] = [];
      const flush = () => { if (run.length) ops.push(PDFOperator.of("TJ" as never, [page.doc.context.obj(run as never) as never])); run = []; };
      for (const g of glyphs) {
        if (g.font !== current) { flush(); ops.push(setFontAndSize(keyOf(g.font), o.size)); current = g.font; }
        if (Math.abs(g.dy - rise) > 1e-9) { flush(); rise = g.dy; ops.push(setTextRise(rise * k)); }
        const p = ps[g.font], glyph = p.fk.getGlyph(g.id, [...g.chars].map((c) => c.codePointAt(0)!));
        const id = encoderFor(p)(glyph, g.chars);   // the characters go into the font's character map, for search
        const shift = g.x + g.dx - pen;
        if (Math.abs(shift) > 1e-6) run.push(Math.round(-shift * 1000 * 1000) / 1000);
        run.push(PDFHexString.of(id.toString(16).padStart(4, "0")));
        pen = g.x + g.dx + glyph.advanceWidth / p.fk.unitsPerEm;   // where the font's own width leaves the pen
      }
      flush();
      ops.push(endText(), PDFOperator.of("EMC" as never)); ops.push(popGraphicsState());
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
