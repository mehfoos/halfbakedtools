/**
 * The invisible font used for OCR text. It is written here, byte by byte, and contains no letter shapes at all:
 * every character is drawn as the same empty glyph. A PDF viewer still knows which character each one is (from the
 * font's ToUnicode table), so the text can be searched, selected and copied in any script, but nothing is ever drawn.
 *
 * Because it holds no outlines from any typeface, it carries no third-party design or licence. It follows the same idea
 * as the "glyphless font" Tesseract uses in its own PDF output; no code or data was taken from it.
 *
 * Characters are stored as their UTF-16 code (one 2-byte code each). Characters outside that basic range (some rare
 * Chinese characters, emoji) are left out and counted.
 */
import { PDFDocument, PDFRef, PDFString } from "@cantoo/pdf-lib";

const UNITS = 1000, ADVANCE = 500, ASCENT = 800, DESCENT = 200;
/** Font geometry as shares of the font size, for placing words. */
export const GLYPHLESS = { advance: ADVANCE / UNITS, ascent: ASCENT / UNITS, descent: DESCENT / UNITS };
export const FONT_NAME = "HBTGlyphless";

/** A complete TrueType font file with two empty glyphs (.notdef and one blank). */
export function glyphlessTtf(): Uint8Array {
  const tables: [string, Uint8Array][] = [];
  const w = (n: number) => { const b = new Uint8Array(n); return { b, v: new DataView(b.buffer) }; };

  const head = w(54);
  head.v.setUint32(0, 0x00010000); head.v.setUint32(4, 0x00010000); /* checkSumAdjustment at 8, set last */ head.v.setUint32(12, 0x5f0f3cf5);
  head.v.setUint16(16, 0x000b); head.v.setUint16(18, UNITS);
  head.v.setUint32(24, 3877891200); head.v.setUint32(32, 3877891200);   // created and modified: 19 Nov 2026, in seconds since 1904
  head.v.setInt16(36, 0); head.v.setInt16(38, -DESCENT); head.v.setInt16(40, ADVANCE); head.v.setInt16(42, ASCENT);
  head.v.setUint16(44, 0); head.v.setUint16(46, 8); head.v.setInt16(48, 2); head.v.setInt16(50, 0); head.v.setInt16(52, 0);
  tables.push(["head", head.b]);

  const hhea = w(36);
  hhea.v.setUint32(0, 0x00010000); hhea.v.setInt16(4, ASCENT); hhea.v.setInt16(6, -DESCENT); hhea.v.setInt16(8, 0);
  hhea.v.setUint16(10, ADVANCE); hhea.v.setInt16(18, 1); /* caretSlopeRise */ hhea.v.setUint16(34, 2); /* numberOfHMetrics */
  tables.push(["hhea", hhea.b]);

  const maxp = w(32);
  maxp.v.setUint32(0, 0x00010000); maxp.v.setUint16(4, 2); maxp.v.setUint16(14, 2); /* maxZones */
  tables.push(["maxp", maxp.b]);

  const hmtx = w(8); hmtx.v.setUint16(0, ADVANCE); hmtx.v.setUint16(4, ADVANCE);
  tables.push(["hmtx", hmtx.b]);
  // glyph 0 (.notdef) has no data; glyph 1 is a header with no outlines (a glyph table may not be empty)
  const loca = w(6); loca.v.setUint16(4, 6); tables.push(["loca", loca.b]);   // short offsets, in 2-byte units
  tables.push(["glyf", new Uint8Array(12)]);

  // cmap: one Windows Unicode subtable that maps nothing (PDF text reaches glyphs through the CID-to-glyph map).
  const cmap = w(4 + 8 + 24);
  cmap.v.setUint16(2, 1); cmap.v.setUint16(4, 3); cmap.v.setUint16(6, 1); cmap.v.setUint32(8, 12);
  const f4 = 12; cmap.v.setUint16(f4, 4); cmap.v.setUint16(f4 + 2, 24); cmap.v.setUint16(f4 + 6, 2); cmap.v.setUint16(f4 + 8, 2);
  cmap.v.setUint16(f4 + 14, 0xffff); cmap.v.setUint16(f4 + 18, 0xffff); cmap.v.setInt16(f4 + 20, 1);
  tables.push(["cmap", cmap.b]);

  const names: [number, string][] = [[0, "Made for Half Baked Tools. Contains no glyph outlines."], [1, FONT_NAME], [2, "Regular"], [3, `${FONT_NAME}-1.0`], [4, FONT_NAME], [5, "Version 1.0"], [6, FONT_NAME]];
  const strs = names.map(([, s]) => { const b = new Uint8Array(s.length * 2); [...s].forEach((c, i) => { b[i * 2] = c.charCodeAt(0) >> 8; b[i * 2 + 1] = c.charCodeAt(0) & 255; }); return b; });
  const nameT = w(6 + 12 * names.length + strs.reduce((n, s) => n + s.length, 0));
  nameT.v.setUint16(2, names.length); nameT.v.setUint16(4, 6 + 12 * names.length);
  let off = 0;
  names.forEach(([id], i) => { const r = 6 + 12 * i; nameT.v.setUint16(r, 3); nameT.v.setUint16(r + 2, 1); nameT.v.setUint16(r + 4, 0x409); nameT.v.setUint16(r + 6, id); nameT.v.setUint16(r + 8, strs[i].length); nameT.v.setUint16(r + 10, off); nameT.b.set(strs[i], 6 + 12 * names.length + off); off += strs[i].length; });
  tables.push(["name", nameT.b]);

  const post = w(32); post.v.setUint32(0, 0x00030000); post.v.setInt16(8, -100); post.v.setInt16(10, 50); post.v.setUint32(12, 1);
  tables.push(["post", post.b]);

  const os2 = w(96);
  os2.v.setUint16(0, 4); os2.v.setInt16(2, ADVANCE); os2.v.setUint16(4, 400); os2.v.setUint16(6, 5); os2.v.setUint16(8, 0);   // fsType 0: installable
  for (const [o, val] of [[10, 650], [12, 600], [16, 75], [18, 650], [20, 600], [24, 350], [26, 50], [28, 250]] as const) os2.v.setInt16(o, val);
  os2.b.set([32, 32, 32, 32], 58); os2.v.setUint16(62, 0x40); os2.v.setUint16(64, 0x20); os2.v.setUint16(66, 0xffff);
  os2.v.setInt16(68, ASCENT); os2.v.setInt16(70, -DESCENT); os2.v.setInt16(72, 0); os2.v.setUint16(74, ASCENT); os2.v.setUint16(76, DESCENT);
  os2.v.setUint16(92, 32);
  tables.push(["OS/2", os2.b]);

  tables.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const n = tables.length, dirLen = 12 + 16 * n, pad = (x: number) => (x + 3) & ~3;
  const total = dirLen + tables.reduce((s, [, t]) => s + pad(t.length), 0);
  const out = new Uint8Array(total), v = new DataView(out.buffer);
  const sum = (b: Uint8Array) => { const p = new Uint8Array(pad(b.length)); p.set(b); const d = new DataView(p.buffer); let s = 0; for (let i = 0; i < p.length; i += 4) s = (s + d.getUint32(i)) >>> 0; return s; };
  const es = Math.floor(Math.log2(n));
  v.setUint32(0, 0x00010000); v.setUint16(4, n); v.setUint16(6, 16 * 2 ** es); v.setUint16(8, es); v.setUint16(10, n * 16 - 16 * 2 ** es);
  let at = dirLen;
  tables.forEach(([tag, t], i) => {
    const r = 12 + 16 * i; for (let k = 0; k < 4; k++) out[r + k] = tag.charCodeAt(k);
    v.setUint32(r + 4, sum(t)); v.setUint32(r + 8, at); v.setUint32(r + 12, t.length); out.set(t, at); at += pad(t.length);
  });
  const headAt = v.getUint32(12 + 16 * tables.findIndex(([t]) => t === "head") + 8);
  v.setUint32(headAt + 8, (0xb1b0afba - sum(out)) >>> 0);
  return out;
}

/** ToUnicode map: every 2-byte code means the UTF-16 character with that number (surrogate halves excluded). */
export function identityToUnicode(): string {
  const ranges: string[] = [];
  for (let hi = 0; hi < 256; hi++) { if (hi >= 0xd8 && hi <= 0xdf) continue; const h = hi.toString(16).padStart(2, "0").toUpperCase(); ranges.push(`<${h}00> <${h}FF> <${h}00>`); }
  const blocks: string[] = [];
  for (let i = 0; i < ranges.length; i += 100) blocks.push(`${Math.min(100, ranges.length - i)} beginbfrange\n${ranges.slice(i, i + 100).join("\n")}\nendbfrange`);
  return ["/CIDInit /ProcSet findresource begin", "12 dict begin", "begincmap", "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def", "/CMapType 2 def", "1 begincodespacerange", "<0000> <FFFF>", "endcodespacerange", ...blocks,
    "endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end"].join("\n");
}

/** Adds the font to a document and returns its reference (a Type 0 font, so each character is a 2-byte code). */
export function addGlyphlessFont(doc: PDFDocument): PDFRef {
  const ctx = doc.context, ttf = glyphlessTtf();
  const file = ctx.register(ctx.flateStream(ttf, { Length1: ttf.length }));
  const map = new Uint8Array(0x20000); for (let i = 1; i < map.length; i += 2) map[i] = 1;   // every code -> glyph 1 (blank)
  const cidToGid = ctx.register(ctx.flateStream(map));
  const toUnicode = ctx.register(ctx.flateStream(new TextEncoder().encode(identityToUnicode())));
  const descriptor = ctx.register(ctx.obj({ Type: "FontDescriptor", FontName: FONT_NAME, Flags: 5, FontBBox: [0, -DESCENT, ADVANCE, ASCENT], ItalicAngle: 0, Ascent: ASCENT, Descent: -DESCENT, CapHeight: ASCENT, StemV: 80, FontFile2: file }));
  const info = ctx.obj({ Registry: PDFString.of("Adobe"), Ordering: PDFString.of("Identity"), Supplement: 0 });
  const cid = ctx.register(ctx.obj({ Type: "Font", Subtype: "CIDFontType2", BaseFont: FONT_NAME, CIDSystemInfo: info, FontDescriptor: descriptor, DW: ADVANCE, CIDToGIDMap: cidToGid }));
  return ctx.register(ctx.obj({ Type: "Font", Subtype: "Type0", BaseFont: FONT_NAME, Encoding: "Identity-H", DescendantFonts: [cid], ToUnicode: toUnicode }));
}

/** A word as 2-byte codes, and how many characters had to be left out. */
export function encodeWord(text: string): { hex: string; count: number; dropped: number } {
  let hex = "", count = 0, dropped = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0xffff || cp < 0x20 || (cp >= 0xd800 && cp <= 0xdfff)) { dropped++; continue; }
    hex += cp.toString(16).padStart(4, "0").toUpperCase(); count++;
  }
  return { hex, count, dropped };
}
