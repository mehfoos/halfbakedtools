// Redact PDF: the parts that need no browser. Pure apart from reading PDFs with pdf-lib.
//
// How removal works (DECISIONS.md, 2026-11-20): a page with areas to remove is not edited. It is drawn as a picture
// (by PDF.js, in the browser: redactui.ts), the areas are painted solid on that picture, and the saved file gets a new
// page holding only the picture (plus, if asked, an invisible text layer read back from the picture by text
// recognition). Nothing of the old page is copied into the saved file, so no text, image or drawing under an area
// can survive in it. Other pages are copied as they are; their comments, form fields and links can be dropped too.
// The saved file starts empty, so the original's bookmarks, metadata, attachments and scripts are not carried over.
import { PDFDocument, PDFName, PDFRawStream, PDFString, PDFHexString, PDFDict, PDFArray, PDFRef, type PDFObject } from "@cantoo/pdf-lib";
import { unzlibSync, inflateSync } from "fflate";
import type { OcrWord } from "./ocr.ts";
import type { RedactMark } from "./marks.ts";

/** A page rebuilt from its picture: `width` x `height` points (the page as the file shows it); the picture is
 *  `scale` pixels per point. `lines`: words read back from the picture by text recognition, if asked. */
export type RedactedPage = { image: Uint8Array; png: boolean; width: number; height: number; scale: number; lines?: OcrWord[][] };

/** Page-level entries dropped from the other pages when asked: annotations (comments, highlights, links, form
 *  fields), the page's own metadata, thumbnail, private application data, article beads and page actions. */
export const OTHER_PAGE_KEYS = ["Annots", "Metadata", "Thumb", "PieceInfo", "B", "AA"] as const;

// ---------- finding text ----------

/** A piece of text as PDF.js gives it (getTextContent): `transform` places its start in the PDF's own coordinates;
 *  `width` runs along the text, in the same units. */
export type TextItem = { str: string; transform: number[]; width: number; height: number; dir?: string; fontName?: string; hasEOL?: boolean };
export type FontStyle = { ascent?: number; descent?: number; vertical?: boolean };
/** A found piece: its corners in the PDF's own coordinates (start-bottom, end-bottom, end-top, start-top). */
export type Quad = [number, number][];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The search for one term: letter case ignored, any run of spaces in the term matches any run of spaces or none
 *  (PDF text often has no space where a line breaks or words sit apart), whole words only if asked. */
export function termPattern(term: string, wholeWords: boolean): RegExp | null {
  const parts = term.trim().split(/\s+/).filter(Boolean); if (!parts.length) return null;
  const body = parts.map(escape).join("\\s*");
  return new RegExp(wholeWords ? `(?<![\\p{L}\\p{N}\\p{M}])${body}(?![\\p{L}\\p{N}\\p{M}])` : body, "giu");
}

/**
 * Where `terms` occur on a page, as quads in the PDF's own coordinates. Items are joined in file order (a line end
 * counts as a space), so a term split across pieces is found. Inside a piece, where a match starts and ends is
 * estimated from `measure` (relative widths of its characters; PDF.js gives no position for single letters), so a
 * boundary inside a piece is widened by `slack` font sizes on that side; a boundary at the edge of a piece is exact.
 * Right-to-left and vertical pieces are covered whole. Heights run from the font's descent to its ascent (PDF.js's
 * measures, or 0.25 and 0.95 of the size), widened by `pad` font sizes.
 */
export function findQuads(items: TextItem[], styles: Record<string, FontStyle>, terms: string[], wholeWords: boolean,
  measure: (text: string, item: TextItem) => number, slack = 0.35, pad = 0.12): { term: string; quads: Quad[] }[] {
  let full = ""; const at: { item: number; from: number }[] = [];
  items.forEach((it, k) => { at.push({ item: k, from: full.length }); full += it.str + (it.hasEOL ? " " : ""); });
  const owner = (pos: number) => { let lo = 0, hi = at.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (at[mid].from <= pos) lo = mid; else hi = mid - 1; } return at[lo]; };
  const out: { term: string; quads: Quad[] }[] = [];
  for (const term of terms) {
    const re = termPattern(term, wholeWords); if (!re) continue;
    for (const m of full.matchAll(re)) {
      if (!m[0].length) continue;
      const start = m.index!, end = start + m[0].length, quads: Quad[] = [];
      for (let k = owner(start).item; k < items.length && at[k].from < end; k++) {
        const it = items[k]; if (!it.str.length) continue;
        const a = Math.max(0, start - at[k].from), b = Math.min(it.str.length, end - at[k].from); if (b <= a) continue;
        quads.push(pieceQuad(it, styles[it.fontName ?? ""] ?? {}, a, b, measure, slack, pad));
      }
      if (quads.length) out.push({ term, quads });
    }
  }
  return out;
}

function pieceQuad(it: TextItem, st: FontStyle, a: number, b: number, measure: (t: string, i: TextItem) => number, slack: number, pad: number): Quad {
  const [m0, m1, m2, m3, e, f] = it.transform, size = Math.hypot(m2, m3) || it.height || 1;
  const along = Math.hypot(m0, m1) || 1, ux = m0 / along, uy = m1 / along;      // direction of the text
  const up = Math.hypot(m2, m3) || 1, vx = m2 / up, vy = m3 / up;               // "up" for the letters
  const whole = it.dir === "rtl" || st.vertical || !(it.width > 0);
  const total = whole ? 1 : measure(it.str, it) || 1;
  let s0 = whole ? 0 : (it.width * measure(it.str.slice(0, a), it)) / total;
  let s1 = whole ? Math.max(it.width, size * 0.5) : (it.width * measure(it.str.slice(0, b), it)) / total;
  if (!whole && a > 0) s0 -= slack * size; else s0 -= pad * size;
  if (!whole && b < it.str.length) s1 += slack * size; else s1 += pad * size;
  s0 = Math.max(s0, -pad * size); s1 = Math.min(s1, (whole ? Math.max(it.width, size * 0.5) : it.width) + pad * size);
  const asc = (st.ascent && st.ascent > 0 ? st.ascent : 0.95) + pad, desc = (st.descent && st.descent < 0 ? -st.descent : 0.25) + pad;
  if (st.vertical) {   // vertical text: cover the whole column the piece occupies
    const w = size * 0.6 + pad * size, len = Math.max(it.height, it.width, size);
    return [[e - w, f + size * 0.2], [e + w, f + size * 0.2], [e + w, f - len - size * 0.2], [e - w, f - len - size * 0.2]];
  }
  const pt = (s: number, t: number): [number, number] => [e + ux * s + vx * t * size, f + uy * s + vy * t * size];
  return [pt(s0, -desc), pt(s1, -desc), pt(s1, asc), pt(s0, asc)];
}

/** A quad turned into a box in the base view, given the page's PDF-to-view conversion (PDF.js viewport at scale 1). */
export function quadToMark(q: Quad, toView: (x: number, y: number) => [number, number], term?: string): RedactMark {
  const pts = q.map(([x, y]) => toView(x, y)), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { type: "redact", x, y, rotate: 0, w: Math.max(0.5, Math.max(...xs) - x), h: Math.max(0.5, Math.max(...ys) - y), ...(term ? { term } : {}) };
}

/** Joins boxes that overlap or nearly touch on the same line (a term found in several pieces), so the page carries
 *  one box per area rather than a stack of slivers. Boxes are joined only when they overlap vertically by most of
 *  their height and are within `gap` points horizontally. */
export function mergeMarks(marks: RedactMark[], gap = 2): RedactMark[] {
  const out: RedactMark[] = [];
  for (const m of [...marks].sort((p, q) => p.y - q.y || p.x - q.x)) {
    const hit = out.find((o) => {
      const v = Math.min(o.y + o.h, m.y + m.h) - Math.max(o.y, m.y);
      return v > 0.6 * Math.min(o.h, m.h) && m.x <= o.x + o.w + gap && o.x <= m.x + m.w + gap;
    });
    if (!hit) { out.push({ ...m }); continue; }
    const x = Math.min(hit.x, m.x), y = Math.min(hit.y, m.y);
    hit.w = Math.max(hit.x + hit.w, m.x + m.w) - x; hit.h = Math.max(hit.y + hit.h, m.y + m.h) - y; hit.x = x; hit.y = y;
    if (hit.term !== m.term) delete hit.term;
  }
  return out;
}

// ---------- checking the saved file ----------

/**
 * Looks through every object of a saved PDF for the searched terms, as a second check after reading its text: in
 * text strings (metadata, bookmarks, field values, comments) and in the decompressed bytes of every stream that
 * isn't a picture (page contents, XMP metadata, attachments), read as single-byte text and as UTF-16. Returns where
 * each term was found ("object 12: stream", say); empty when none was.
 * This cannot see text written in a font's own glyph numbers (most embedded fonts); reading the text with PDF.js
 * (redactui.ts) covers that.
 */
export async function leftovers(bytes: Uint8Array, terms: string[], wholeWords = false): Promise<{ term: string; where: string }[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false }), found: { term: string; where: string }[] = [];
  const res = terms.map((t) => ({ term: t, re: termPattern(t, wholeWords) })).filter((x): x is { term: string; re: RegExp } => !!x.re);
  const look = (text: string, where: string) => { for (const { term, re } of res) { re.lastIndex = 0; if (re.test(text)) found.push({ term, where }); } };
  const strings = (o: PDFObject | undefined, where: string, depth = 0): void => {
    if (!o || depth > 50) return;
    if (o instanceof PDFString || o instanceof PDFHexString) { look(o.decodeText(), where); return; }
    if (o instanceof PDFArray) { for (let i = 0; i < o.size(); i++) strings(o.get(i), where, depth + 1); return; }
    if (o instanceof PDFDict) for (const [, v] of o.entries()) if (!(v instanceof PDFRef)) strings(v, where, depth + 1);
  };
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    const where = `object ${ref.objectNumber}`;
    if (obj instanceof PDFRawStream) {
      strings(obj.dict, `${where} (its dictionary)`);
      if (obj.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") continue;
      const data = decoded(obj); if (!data) continue;
      const latin = new TextDecoder("latin1").decode(data);
      look(latin, `${where}: stream`);
      const shown = stringsIn(latin); if (shown) { look(shown.bytes, `${where}: text in the stream`); look(shown.utf16, `${where}: text in the stream (UTF-16)`); }
      if (data.length >= 2) { look(new TextDecoder("utf-16be").decode(data), `${where}: stream (UTF-16)`); look(new TextDecoder("utf-16le").decode(data), `${where}: stream (UTF-16)`); }
    } else strings(obj, where);
  }
  return found;
}

/** The strings in a content stream ((literal) and <hex>), decoded and joined in order: as single bytes, and as UTF-16. */
function stringsIn(t: string): { bytes: string; utf16: string } | null {
  const parts: number[][] = [];
  for (const m of t.matchAll(/\((?:\\[\s\S]|[^\\()]|\((?:\\[\s\S]|[^\\()])*\))*\)|<([0-9A-Fa-f\s]*)>(?!>)/g)) {
    if (m[0][0] === "<") { if (m[0].startsWith("<<")) continue; const h = m[1].replace(/\s/g, ""); const b: number[] = []; for (let i = 0; i < h.length; i += 2) b.push(parseInt((h.slice(i, i + 2) + "0").slice(0, 2), 16)); parts.push(b); continue; }
    const body = m[0].slice(1, -1), b: number[] = [];
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c !== "\\") { b.push(c.charCodeAt(0) & 255); continue; }
      const n = body[++i] ?? "";
      if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(body[i + 1] ?? "")) o += body[++i]; b.push(parseInt(o, 8) & 255); }
      else if (n === "\r" || n === "\n") { if (n === "\r" && body[i + 1] === "\n") i++; }   // a line continuation
      else b.push(({ n: 10, r: 13, t: 9, b: 8, f: 12 } as Record<string, number>)[n] ?? (n.charCodeAt(0) & 255));
    }
    parts.push(b);
  }
  if (!parts.length) return null;
  const all = Uint8Array.from(parts.flat()), utf16 = parts.map((b) => new TextDecoder("utf-16be").decode(Uint8Array.from(b))).join("");
  return { bytes: new TextDecoder("latin1").decode(all), utf16 };
}

/** A stream's bytes with Flate compression undone (the usual case); other compressions are left as they are, and
 *  null is given for pictures' compressions, which hold no text. */
function decoded(s: PDFRawStream): Uint8Array | null {
  const f = s.dict.get(PDFName.of("Filter")), names = f instanceof PDFArray ? f.asArray().map(String) : f ? [String(f)] : [];
  if (names.some((n) => ["/DCTDecode", "/JPXDecode", "/JBIG2Decode", "/CCITTFaxDecode"].includes(n))) return null;
  let data = s.getContents();
  if (names[0] === "/FlateDecode" || names[0] === "/Fl") { try { data = unzlibSync(data); } catch { try { data = inflateSync(data); } catch { return data; } } }
  return data;
}
