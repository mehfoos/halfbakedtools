// Checks the fonts a file draws text with against PDF/A-2's font rules, as veraPDF states them ("PDF/A Parts 2 and 3
// rules", archived): every glyph drawn is in the embedded font program (6.2.11.4.1-2), none is the .notdef glyph
// (6.2.11.8-1), the widths in the font dictionary match the font program's within 1/1000 of the text size
// (6.2.11.5-1; for Type 3 fonts, against each glyph's d0 or d1), TrueType encodings and cmaps are the allowed kinds (6.2.11.6), and composite fonts' CMaps and
// character collections fit (6.2.11.3). Font programs are read here: Type 1 (FontFile), CFF (FontFile3) and TrueType
// or OpenType (FontFile2, FontFile3) with fontkit. Nothing is changed except one thing that can't alter how text
// looks: a missing CIDToGIDMap is written as Identity, the meaning it has when left out. Where a font can't be read
// or its codes can't be followed, it is reported as not checkable, so the conversion stops rather than guess.
import { PDFDict, PDFName, PDFArray, PDFRef, PDFStream, PDFNumber, PDFString, PDFHexString, type PDFContext, type PDFObject } from "@cantoo/pdf-lib";
import { Encodings } from "@cantoo/pdf-lib/standard-fonts";
import fontkit from "@cantoo/fontkit";
import { streamBytes, tokens, type FontUse } from "./pdfascan.ts";

const N = (s: string) => PDFName.of(s);

// ---------- glyph names ----------
const WINANSI = (() => { const byCode = new Map<number, string>(), uni = new Map<string, number>();
  for (const [u, m] of Object.entries((Encodings.WinAnsi as unknown as { unicodeMappings: Record<string, [number, string]> }).unicodeMappings)) { byCode.set(m[0], m[1]); uni.set(m[1], Number(u)); }
  return { byCode, uni }; })();
export const winAnsiName = (code: number) => WINANSI.byCode.get(code);
/** The Unicode value of a glyph name, for the names WinAnsi uses and the uniXXXX / uXXXX[XX] forms; undefined for
 *  others (they are reported as not checkable rather than guessed). */
export function unicodeOf(name: string): number | undefined {
  const w = WINANSI.uni.get(name); if (w !== undefined) return w;
  let m = name.match(/^uni([0-9A-F]{4})$/); if (m) return parseInt(m[1], 16);
  m = name.match(/^u([0-9A-F]{4,6})$/); if (m) return parseInt(m[1], 16);
  return undefined;
}
/** The glyph name a code has in Adobe's Standard encoding, for codes 32 to 126: as WinAnsi's except 39 (quoteright)
 *  and 96 (quoteleft) (Adobe's Core 14 AFM files, e.g. Helvetica.afm: "C 39 ; ... N quoteright", "C 96 ; ... N
 *  quoteleft"). Other codes are not known here. */
export function standardName(code: number): string | undefined {
  if (code === 39) return "quoteright"; if (code === 96) return "quoteleft";
  return code >= 32 && code <= 126 ? WINANSI.byCode.get(code) : undefined;
}
/** The name a code has in a named base encoding: undefined if the encoding has none there, null when this tool
 *  doesn't know the encoding at that code. */
function baseName(enc: string, code: number): string | undefined | null {
  if (enc === "WinAnsiEncoding") return WINANSI.byCode.get(code);   // undefined: no glyph at that code
  if (enc === "StandardEncoding") return code >= 32 && code <= 126 ? standardName(code) : null;
  if (enc === "MacRomanEncoding") return code >= 32 && code <= 126 ? WINANSI.byCode.get(code) : null;   // ASCII range: same names
  return null;
}

// ---------- font programs ----------
type Program = {
  kind: "type1" | "cff" | "sfnt";
  /** glyph width in thousandths of the text size, by glyph name (Type 1, CFF) or glyph id */
  widthByName?: (name: string) => number | undefined;
  widthByGid?: (gid: number) => number | undefined;
  builtin?: Map<number, string> | null;          // built-in encoding (Type 1, CFF); null if unreadable
  builtinPartial?: boolean;                      // codes missing from `builtin` are unknown, not empty
  gidOfCid?: (cid: number) => number | undefined; // CID-keyed CFF
  numGlyphs?: number;
  sfnt?: Sfnt;
};
type Sfnt = { cmaps: { platformID: number; encodingID: number; lookup(c: number): number }[]; post: (gid: number) => string | undefined; byPostName: Map<string, number> };

const decrypt = (b: Uint8Array, r: number, skip: number) => { const out = new Uint8Array(Math.max(0, b.length - skip)); for (let i = 0; i < b.length; i++) { const c = b[i]; const p = c ^ (r >> 8); r = ((c + r) * 52845 + 22719) & 0xffff; if (i >= skip) out[i - skip] = p; } return out; };
const latin1 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s; };

/** A Type 1 font program: its encoding, FontMatrix and each glyph's width (from hsbw or sbw). */
export function readType1(data: Uint8Array): Program | null {
  const text = latin1(data), e = text.indexOf("eexec");
  if (e < 0) return null;
  const clear = text.slice(0, e);
  const scale = (() => { const m = clear.match(/\/FontMatrix\s*\[\s*([-\d.eE]+)/); return m ? Number(m[1]) * 1000 : 1; })();
  let builtin: Map<number, string> | null = new Map(), builtinPartial = false;
  if (/\/Encoding\s+StandardEncoding\s+def/.test(clear)) { for (let c = 32; c <= 126; c++) builtin.set(c, standardName(c)!); builtinPartial = true; }
  else { const re = /dup\s+(\d+)\s*\/([^\s/\[\]{}()<>]+)\s+put/g; let m; while ((m = re.exec(clear))) builtin.set(Number(m[1]), m[2]); if (!builtin.size) builtin = null; }
  // the encrypted part: binary, or hexadecimal
  let p = e + 5; while (p < data.length && [9, 10, 13, 32].includes(data[p])) p++;
  let enc = data.subarray(p);
  if (/^[0-9a-fA-F]{4}$/.test(latin1(enc.subarray(0, 4)))) { const h = latin1(enc).replace(/[^0-9a-fA-F]/g, ""); enc = Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16)); }
  const priv = decrypt(enc, 55665, 4), ptext = latin1(priv);
  const lenIV = Number(ptext.match(/\/lenIV\s+(-?\d+)/)?.[1] ?? 4);
  const charstring = (s: number, len: number) => (lenIV < 0 ? priv.subarray(s, s + len) : decrypt(priv.subarray(s, s + len), 4330, lenIV));
  // Subrs (for widths set inside a subroutine) and CharStrings
  const subrs: Uint8Array[] = [];
  const subrsAt = ptext.search(/\/Subrs\s+\d+/);
  const csAt = ptext.search(/\/CharStrings\s+\d+/);
  if (subrsAt >= 0) { const re = /dup\s+(\d+)\s+(\d+)\s+(\S+)\s/y; let i = subrsAt; const end = csAt > subrsAt ? csAt : ptext.length;
    for (;;) { const at = ptext.indexOf("dup", i); if (at < 0 || at > end) break; re.lastIndex = at; const m = re.exec(ptext); if (!m) { i = at + 3; continue; } const s = re.lastIndex, len = Number(m[2]); subrs[Number(m[1])] = charstring(s, len); i = s + len; } }
  if (csAt < 0) return null;
  const widths = new Map<string, number>();
  const re = /\/([^\s/\[\]{}()<>]+)\s+(\d+)\s+(\S+)\s/y; let i = ptext.indexOf("begin", csAt); if (i < 0) return null;
  for (;;) {
    const at = ptext.indexOf("/", i); if (at < 0) break;
    re.lastIndex = at; const m = re.exec(ptext);
    if (!m) { if (/^\s*end/.test(ptext.slice(i, at))) break; i = at + 1; continue; }
    const s = re.lastIndex, len = Number(m[2]); if (s + len > priv.length) break;
    const w = type1Width(charstring(s, len), subrs); if (w !== undefined) widths.set(m[1], w * scale); else widths.set(m[1], NaN);
    i = s + len;
  }
  if (!widths.size) return null;
  return { kind: "type1", widthByName: (n) => widths.get(n), builtin, builtinPartial };
}
/** The advance width in a Type 1 charstring: hsbw (sbx wx) or sbw (sbx sby wx wy), followed into subroutines. */
function type1Width(cs: Uint8Array, subrs: Uint8Array[], depth = 0, stack: number[] = []): number | undefined {
  for (let i = 0; i < cs.length; ) {
    const v = cs[i++];
    if (v >= 32) { if (v <= 246) stack.push(v - 139); else if (v <= 250) stack.push((v - 247) * 256 + cs[i++] + 108); else if (v <= 254) stack.push(-(v - 251) * 256 - cs[i++] - 108); else { stack.push(new DataView(cs.buffer, cs.byteOffset + i, 4).getInt32(0)); i += 4; } continue; }
    if (v === 13) return stack.length >= 2 ? stack[stack.length - 1] : undefined;          // hsbw
    if (v === 12) { const w = cs[i++]; if (w === 7) return stack.length >= 4 ? stack[stack.length - 2] : undefined; if (w === 12) { const b = stack.pop()!, a = stack.pop()!; stack.push(a / b); continue; } return undefined; }   // sbw; div
    if (v === 10 && depth < 10) { const n = stack.pop(); const s = n !== undefined ? subrs[n] : undefined; if (!s) return undefined; const r = type1Width(s, subrs, depth + 1, stack); if (r !== undefined) return r; continue; }   // callsubr
    if (v === 11) return undefined;   // return without a width
    return undefined;                 // any other operator before hsbw: no width
  }
  return undefined;
}

type FkCff = { isCIDFont: boolean; topDict: { CharStrings: { offset: number; length: number }[]; Encoding?: unknown; charset?: unknown; FontMatrix?: number[]; FDArray?: { FontMatrix?: number[] }[] }; stream: { buffer: Uint8Array }; globalSubrIndex?: { offset: number; length: number }[]; getGlyphName(g: number): string | null; privateDictForGlyph(g: number): { Subrs?: { offset: number; length: number }[] | null; defaultWidthX?: number; nominalWidthX?: number } | null; fdForGlyph(g: number): number | null };
type FkFont = { numGlyphs: number; unitsPerEm: number; "CFF "?: FkCff; cmap?: { tables: { platformID: number; encodingID: number; table: unknown }[] }; getGlyph(id: number): { advanceWidth: number; name?: string }; _cmapProcessor?: object; post?: unknown };

/** A bare CFF font program, read with fontkit by placing it in a minimal OpenType wrapper (fontkit reads only the
 *  tables it is asked for). */
function openCff(cff: Uint8Array): FkCff | null {
  const out = new Uint8Array(28 + cff.length), dv = new DataView(out.buffer);
  out.set([0x4f, 0x54, 0x54, 0x4f]); dv.setUint16(4, 1); dv.setUint16(6, 16); out.set([0x43, 0x46, 0x46, 0x20], 12); dv.setUint32(20, 28); dv.setUint32(24, cff.length); out.set(cff, 28);
  try { const f = (fontkit as unknown as { create(b: Uint8Array): FkFont }).create(out); const c = f["CFF "]; void c?.topDict.CharStrings.length; return c ?? null; } catch { return null; }
}
export function readCff(data: Uint8Array): Program | null {
  const c = openCff(data); if (!c) return null;
  return cffProgram(c, data);
}
function cffProgram(c: FkCff, raw: Uint8Array): Program {
  const buf = c.stream.buffer, cs = c.topDict.CharStrings, g = c.globalSubrIndex ?? [];
  const top = (c.topDict.FontMatrix?.[0] ?? 0.001) * 1000;
  const scale = (gid: number) => { const fd = c.isCIDFont ? c.fdForGlyph(gid) : null; const m = fd !== null && fd !== undefined ? c.topDict.FDArray?.[fd]?.FontMatrix : undefined; return top * (m ? m[0] / 0.001 : 1); };
  const slice = (e: { offset: number; length: number }) => buf.subarray(e.offset, e.offset + e.length);
  const widthByGid = (gid: number) => {
    const e = cs[gid]; if (!e) return undefined;
    const p = c.privateDictForGlyph(gid) ?? {}, subrs = (p.Subrs ?? []).filter(Boolean);
    const w = type2Width(slice(e), subrs.map(slice), g.map(slice), p.nominalWidthX ?? 0, p.defaultWidthX ?? 0);
    return w === undefined ? undefined : w * scale(gid);
  };
  const byName = new Map<string, number>();
  if (!c.isCIDFont) for (let gid = 0; gid < cs.length; gid++) { const n = c.getGlyphName(gid); if (n) byName.set(n, gid); }
  let builtin: Map<number, string> | null = null;
  if (!c.isCIDFont) {
    const at = raw.length ? topDictEntry(raw, 16) ?? 0 : -1;   // -1: inside an OpenType file, not read here
    if (at === 0) { const enc = c.topDict.Encoding; if (Array.isArray(enc)) { builtin = new Map(); enc.forEach((n, code) => { if (n) builtin!.set(code, n as string); }); } }   // Standard
    else if (at > 1) builtin = cffEncoding(raw, at, cs.length, (gid) => c.getGlyphName(gid), sidOfGid(c.topDict.charset, cs.length));
  }
  let gidOfCid: ((cid: number) => number | undefined) | undefined;
  if (c.isCIDFont) {
    // the charset gives each glyph's CID: a list (format 0) or ranges (formats 1 and 2), from glyph 1 on
    const cs0 = c.topDict.charset as { glyphs?: number[]; ranges?: { first: number; nLeft: number }[] } | undefined, m = new Map<number, number>([[0, 0]]);
    let gid = 1;
    if (cs0?.glyphs) for (const cid of cs0.glyphs) m.set(cid, gid++);
    else if (cs0?.ranges) for (const r of cs0.ranges) for (let k = 0; k <= r.nLeft; k++) m.set(r.first + k, gid++);
    else gidOfCid = undefined;
    gidOfCid = cs0?.glyphs || cs0?.ranges ? (cid) => { const g = m.get(cid); return g !== undefined && g < cs.length ? g : undefined; } : undefined;
  }
  else gidOfCid = (cid) => (cid < cs.length ? cid : undefined);
  return { kind: "cff", widthByGid, widthByName: (n) => { const gid = byName.get(n); return gid === undefined ? undefined : widthByGid(gid); }, builtin, gidOfCid, numGlyphs: cs.length };
}
// The CFF parts read here directly (fontkit reads format 1 encodings' ranges with the wrong field sizes): the Top
// DICT's entries and a custom encoding.
/** An INDEX at `at`: its items' [start, end) and where it ends. */
function cffIndex(b: Uint8Array, at: number): { items: [number, number][]; end: number } {
  const count = b[at] << 8 | b[at + 1]; if (!count) return { items: [], end: at + 2 };
  const size = b[at + 2], off = (k: number) => { let v = 0; for (let j = 0; j < size; j++) v = v * 256 + b[at + 3 + k * size + j]; return v; };
  const base = at + 2 + (count + 1) * size, items: [number, number][] = [];
  for (let k = 0; k < count; k++) items.push([base + off(k), base + off(k + 1)]);
  return { items, end: base + off(count) };
}
/** The first operand of a Top DICT operator (one-byte operators only). */
function topDictEntry(b: Uint8Array, op: number): number | undefined {
  try {
    const names = cffIndex(b, b[2]), top = cffIndex(b, names.end).items[0]; if (!top) return undefined;
    const ops: number[] = [];
    for (let i = top[0]; i < top[1]; ) {
      const v = b[i++];
      if (v === 28) { ops.push((b[i] << 24 >> 16) | b[i + 1]); i += 2; }
      else if (v === 29) { ops.push(b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]); i += 4; }
      else if (v === 30) { while (i < top[1] && (b[i] & 15) !== 15 && (b[i] >> 4) !== 15) i++; i++; ops.push(NaN); }
      else if (v >= 32 && v <= 246) ops.push(v - 139);
      else if (v >= 247 && v <= 250) ops.push((v - 247) * 256 + b[i++] + 108);
      else if (v >= 251 && v <= 254) ops.push(-(v - 251) * 256 - b[i++] - 108);
      else { if (v === 12) i++; else if (v === op) return ops[0]; ops.length = 0; }
    }
  } catch { /* fall through */ }
  return undefined;
}
/** The SID of each glyph, from fontkit's reading of the charset (format 0 list, formats 1 and 2 ranges; 0: ISOAdobe). */
function sidOfGid(charset: unknown, n: number): (gid: number) => number | undefined {
  const cs0 = charset as { glyphs?: number[]; ranges?: { first: number; nLeft: number }[] } | number | undefined;
  if (typeof cs0 === "number" || cs0 === undefined) return cs0 === 0 || cs0 === undefined ? (g) => g : () => undefined;
  const list = [0]; if (cs0.glyphs) list.push(...cs0.glyphs); else for (const r of cs0.ranges ?? []) for (let k = 0; k <= r.nLeft && list.length < n; k++) list.push(r.first + k);
  return (g) => list[g];
}
/** A custom CFF encoding: format 0 (a code per glyph) or 1 (ranges of codes), with optional supplements naming
 *  more codes by SID. Returns code -> glyph name, or null if it can't be read. */
function cffEncoding(b: Uint8Array, at: number, nGlyphs: number, nameOf: (gid: number) => string | null, sid: (gid: number) => number | undefined): Map<number, string> | null {
  if (at >= b.length) return null;
  const out = new Map<number, string>(), fmt = b[at] & 0x7f;
  let i = at + 1, gid = 1;
  const put = (code: number, g: number) => { const n = g < nGlyphs ? nameOf(g) : null; if (n) out.set(code, n); };
  if (fmt === 0) { const n = b[i++]; for (let k = 0; k < n; k++) put(b[i++], gid++); }
  else if (fmt === 1) { const n = b[i++]; for (let k = 0; k < n; k++) { const first = b[i++], left = b[i++]; for (let c = first; c <= first + left; c++) put(c, gid++); } }
  else return null;
  if (b[at] & 0x80) {   // supplements: code, SID
    const n = b[i++];
    for (let k = 0; k < n; k++) { const code = b[i], s = b[i + 1] << 8 | b[i + 2]; i += 3; for (let g = 0; g < nGlyphs; g++) if (sid(g) === s) { put(code, g); break; } }
  }
  return out;
}

/** The advance width in a Type 2 charstring: an extra first operand of the first stack-clearing operator, plus
 *  nominalWidthX; defaultWidthX when there is none. Subroutine calls before it are followed. */
export function type2Width(cs: Uint8Array, subrs: Uint8Array[], gsubrs: Uint8Array[], nominal: number, dflt: number): number | undefined {
  const bias = (n: number) => (n < 1240 ? 107 : n < 33900 ? 1131 : 32768);
  const stack: number[] = [];
  const run = (b: Uint8Array, depth: number): number | null | undefined => {   // a number: the width; null: no width given
    for (let i = 0; i < b.length; ) {
      const v = b[i++];
      if (v === 28) { stack.push(new DataView(b.buffer, b.byteOffset + i, 2).getInt16(0)); i += 2; continue; }
      if (v >= 32) { if (v <= 246) stack.push(v - 139); else if (v <= 250) stack.push((v - 247) * 256 + b[i++] + 108); else if (v <= 254) stack.push(-(v - 251) * 256 - b[i++] - 108); else { stack.push(new DataView(b.buffer, b.byteOffset + i, 4).getInt32(0) / 65536); i += 4; } continue; }
      if (v === 10 || v === 29) { if (depth > 10) return undefined; const list = v === 10 ? subrs : gsubrs; const n = stack.pop(); const s = n !== undefined ? list[n + bias(list.length)] : undefined; if (!s) return undefined; const r = run(s, depth + 1); if (r !== 0.5) return r; continue; }
      if (v === 11) return 0.5;   // return from a subroutine
      const odd = stack.length % 2 === 1;
      switch (v) {
        case 1: case 3: case 18: case 23: case 19: case 20: return odd ? stack[0] + nominal : null;   // stems, hintmask, cntrmask
        case 21: return stack.length > 2 ? stack[0] + nominal : null;                                   // rmoveto
        case 4: case 22: return stack.length > 1 ? stack[0] + nominal : null;                           // vmoveto, hmoveto
        case 14: return stack.length === 1 || stack.length === 5 ? stack[0] + nominal : null;           // endchar
        default: return undefined;   // a drawing operator before any of these: malformed
      }
    }
    return 0.5;
  };
  const r = run(cs, 0);
  if (r === null) return dflt;
  if (r === undefined || r === 0.5) return undefined;
  return r;
}

/** A TrueType or OpenType font program, with fontkit: glyph widths (hmtx), its cmap subtables and glyph names. */
export function readSfnt(data: Uint8Array): Program | null {
  let f: FkFont;
  try { f = (fontkit as unknown as { create(b: Uint8Array): FkFont }).create(data); void f.numGlyphs; } catch { return null; }
  if (!f || typeof f.getGlyph !== "function") return null;
  const k = 1000 / f.unitsPerEm;
  const cmaps: Sfnt["cmaps"] = [];
  try {
    const proto = f.cmap ? Object.getPrototypeOf(f._cmapProcessor) : null;
    for (const t of f.cmap?.tables ?? []) {
      if (!proto) break;
      const p = Object.create(proto) as { cmap: unknown; encoding: null; lookup(c: number): number }; p.cmap = t.table; p.encoding = null;
      cmaps.push({ platformID: t.platformID, encodingID: t.encodingID, lookup: (c) => { try { return p.lookup(c) || 0; } catch { return 0; } } });
    }
  } catch { return null; }
  const byPostName = new Map<string, number>();
  const post = (gid: number) => { try { return f.getGlyph(gid).name; } catch { return undefined; } };
  const cff = f["CFF "];
  const widthByGid = (gid: number) => { if (gid < 0 || gid >= f.numGlyphs) return undefined; try { return f.getGlyph(gid).advanceWidth * k; } catch { return undefined; } };
  const prog: Program = { kind: "sfnt", widthByGid, numGlyphs: f.numGlyphs, sfnt: { cmaps, post, byPostName } };
  if (cff) { const c = cffProgram(cff, new Uint8Array(0)); prog.builtin = c.builtin; prog.gidOfCid = c.gidOfCid; prog.widthByName = (n) => { for (let g = 0; g < f.numGlyphs; g++) if (cff.getGlyphName(g) === n) return widthByGid(g); return undefined; }; }
  return prog;
}

// ---------- CMaps ----------
type CMap = { ranges: { lo: number[]; hi: number[] }[]; cid(code: Uint8Array): number | undefined; wmode?: number; maxCid: number; uses?: string; info?: PDFDict };
/** Reads an embedded CMap stream: codespace ranges, CID ranges and single CIDs, notdef ranges, WMode and usecmap. */
export function readCMap(data: Uint8Array): CMap {
  const toks = [...tokens(data)];
  const ranges: CMap["ranges"] = [], single = new Map<string, number>(), spans: { lo: Uint8Array; hi: Uint8Array; cid: number }[] = [], notdef: { lo: Uint8Array; hi: Uint8Array; cid: number }[] = [];
  let wmode: number | undefined, uses: string | undefined, maxCid = 0;
  const hexKey = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.k === "name" && t.v === "WMode" && toks[i + 1]?.k === "num") wmode = (toks[i + 1] as { v: number }).v;
    if (t.k === "op" && t.v === "usecmap") { const p = toks[i - 1]; if (p?.k === "name") uses = p.v; }
    if (t.k !== "op") continue;
    const block = (end: string, width: number, f: (a: Tok2[]) => void) => { let j = i + 1; const buf: Tok2[] = []; while (j < toks.length && !(toks[j].k === "op" && (toks[j] as { v: string }).v === end)) { buf.push(toks[j] as Tok2); if (buf.length === width) { f(buf.splice(0)); } j++; } i = j; };
    if (t.v === "begincodespacerange") block("endcodespacerange", 2, ([a, b]) => { if (a.k === "str" && b.k === "str") ranges.push({ lo: [...a.v], hi: [...b.v] }); });
    if (t.v === "begincidrange") block("endcidrange", 3, ([a, b, c]) => { if (a.k === "str" && b.k === "str" && c.k === "num") { spans.push({ lo: a.v, hi: b.v, cid: c.v }); maxCid = Math.max(maxCid, c.v + (toInt(b.v) - toInt(a.v))); } });
    if (t.v === "begincidchar") block("endcidchar", 2, ([a, c]) => { if (a.k === "str" && c.k === "num") { single.set(hexKey(a.v), c.v); maxCid = Math.max(maxCid, c.v); } });
    if (t.v === "beginnotdefrange") block("endnotdefrange", 3, ([a, b, c]) => { if (a.k === "str" && b.k === "str" && c.k === "num") notdef.push({ lo: a.v, hi: b.v, cid: c.v }); });
  }
  const within = (code: Uint8Array, lo: Uint8Array, hi: Uint8Array) => code.length === lo.length && toInt(code) >= toInt(lo) && toInt(code) <= toInt(hi);
  return {
    ranges, wmode, uses, maxCid,
    cid(code) {
      const s = single.get(hexKey(code)); if (s !== undefined) return s;
      for (const r of spans) if (within(code, r.lo, r.hi)) return r.cid + toInt(code) - toInt(r.lo);
      for (const r of notdef) if (within(code, r.lo, r.hi)) return r.cid;
      return undefined;
    },
  };
}
type Tok2 = { k: "str"; v: Uint8Array } | { k: "num"; v: number } | { k: "name"; v: string } | { k: "op"; v: string };
const toInt = (b: Uint8Array) => b.reduce((a, x) => a * 256 + x, 0);
const IDENTITY: CMap = { ranges: [{ lo: [0, 0], hi: [255, 255] }], cid: (c) => (c.length === 2 ? c[0] * 256 + c[1] : undefined), maxCid: 65535 };
/** Splits a string into codes by a CMap's codespace ranges (the shortest code that fits a range is taken). */
export function splitCodes(b: Uint8Array, cmap: CMap): Uint8Array[] | null {
  const out: Uint8Array[] = [];
  for (let i = 0; i < b.length; ) {
    let len = 0;
    for (let n = 1; n <= 4 && !len; n++) if (i + n <= b.length && cmap.ranges.some((r) => r.lo.length === n && r.lo.every((lo, k) => b[i + k] >= lo && b[i + k] <= r.hi[k]))) len = n;
    if (!len) return null;
    out.push(b.subarray(i, i + len)); i += len;
  }
  return out;
}
/** CMaps a PDF/A file may use without embedding them (ISO 32000-1 Table 118, as listed in veraPDF's rule 6.2.11.3.3-1). */
export const PREDEFINED_CMAPS = new Set("Identity-H Identity-V GB-EUC-H GB-EUC-V GBpc-EUC-H GBpc-EUC-V GBK-EUC-H GBK-EUC-V GBKp-EUC-H GBKp-EUC-V GBK2K-H GBK2K-V UniGB-UCS2-H UniGB-UCS2-V UniGB-UTF16-H UniGB-UTF16-V B5pc-H B5pc-V HKscs-B5-H HKscs-B5-V ETen-B5-H ETen-B5-V ETenms-B5-H ETenms-B5-V CNS-EUC-H CNS-EUC-V UniCNS-UCS2-H UniCNS-UCS2-V UniCNS-UTF16-H UniCNS-UTF16-V 83pv-RKSJ-H 90ms-RKSJ-H 90ms-RKSJ-V 90msp-RKSJ-H 90msp-RKSJ-V 90pv-RKSJ-H Add-RKSJ-H Add-RKSJ-V EUC-H EUC-V Ext-RKSJ-H Ext-RKSJ-V H V UniJIS-UCS2-H UniJIS-UCS2-V UniJIS-UCS2-HW-H UniJIS-UCS2-HW-V UniJIS-UTF16-H UniJIS-UTF16-V KSC-EUC-H KSC-EUC-V KSCms-UHC-H KSCms-UHC-V KSCms-UHC-HW-H KSCms-UHC-HW-V KSCpc-EUC-H UniKS-UCS2-H UniKS-UCS2-V UniKS-UTF16-H UniKS-UTF16-V".split(" "));

// ---------- the check ----------
export type FontCheck = { problems: string[]; fixes: string[] };

/** Checks every embedded font the file draws with (fonts that aren't embedded are handled by the conversion). */
export function checkFonts(ctx: PDFContext, fonts: Map<PDFDict, FontUse>): FontCheck {
  const look = <T extends PDFObject>(o: PDFObject | undefined): T | undefined => (o instanceof PDFRef ? (ctx.lookup(o) as T) : (o as T));
  const nm = (o: PDFObject | undefined) => { const x = look<PDFObject>(o); return x instanceof PDFName ? x.decodeText() : undefined; };
  const nb = (o: PDFObject | undefined) => { const x = look<PDFObject>(o); return x instanceof PDFNumber ? x.asNumber() : undefined; };
  const out: FontCheck = { problems: [], fixes: [] };
  const programs = new Map<PDFObject, Program | null>(), said = new Map<string, Set<string>>();
  for (const [font, use] of fonts) {
    const sub = nm(font.get(N("Subtype"))), label = (nm(font.get(N("BaseFont"))) ?? "(unnamed)").replace(/^[A-Z]{6}\+/, "");
    /** A problem with this font; a template with {} collects the items (codes, glyphs, widths) into one sentence. */
    const say = (s: string, item?: string) => { const key = `The font ${label} ${s}`; const e = said.get(key) ?? new Set<string>(); if (item !== undefined) e.add(item); said.set(key, e); };
    if (sub === "Type3") { type3Font(font, use, say); continue; }
    const cidFont = sub === "Type0" ? look<PDFDict>(look<PDFArray>(font.get(N("DescendantFonts")))?.get(0)) : undefined;
    const holder = sub === "Type0" ? cidFont : font;
    const fd = look<PDFDict>(holder?.get(N("FontDescriptor")));
    if (!(fd instanceof PDFDict)) continue;   // not embedded: the conversion deals with it
    const fileKey = ["FontFile", "FontFile2", "FontFile3"].find((k) => look<PDFObject>(fd.get(N(k))) instanceof PDFStream);
    if (!fileKey) continue;
    const file = look<PDFStream>(fd.get(N(fileKey)))!;
    const fileSub = nm(file.dict.get(N("Subtype")));
    let prog = programs.get(file);
    if (prog === undefined) {
      const bytes = streamBytes(file);
      prog = !bytes ? null : fileKey === "FontFile" ? readType1(bytes) : fileKey === "FontFile2" || fileSub === "OpenType" ? readSfnt(bytes) : readCff(bytes);
      programs.set(file, prog);
    }
    if (!prog) { say("is embedded in a form this tool can't read, so its glyphs and widths can't be checked."); continue; }
    const flags = nb(fd.get(N("Flags"))) ?? 0, symbolic = (flags & 4) !== 0;

    if (sub === "Type0") { compositeFont(font, cidFont!, prog, use, say); continue; }

    // ---- simple fonts: each code -> glyph, then width
    const enc = look<PDFObject>(font.get(N("Encoding")));
    let base: string | undefined; const diffs = new Map<number, string>();
    if (enc instanceof PDFName) base = enc.decodeText();
    else if (enc instanceof PDFDict) { base = nm(enc.get(N("BaseEncoding"))); const d = look<PDFArray>(enc.get(N("Differences"))); let code = 0;
      if (d instanceof PDFArray) for (const x of d.asArray()) { const y = look<PDFObject>(x); if (y instanceof PDFNumber) code = y.asNumber(); else if (y instanceof PDFName) diffs.set(code++, y.decodeText()); } }
    const widths = look<PDFArray>(font.get(N("Widths"))), first = nb(font.get(N("FirstChar"))) ?? 0, missingW = nb(fd.get(N("MissingWidth")));
    const dictWidth = (c: number) => { if (widths instanceof PDFArray && c >= first && c - first < widths.size()) return nb(widths.get(c - first)); return missingW; };
    const isTT = sub === "TrueType";
    if (isTT) {
      // 6.2.11.6: encodings and cmaps of TrueType fonts
      if (symbolic) {
        if (enc) say("is a symbolic TrueType font with an Encoding entry, which PDF/A doesn't allow (6.2.11.6-3).");
        const cm = prog.sfnt?.cmaps ?? [];
        if (!(cm.length === 1 || cm.some((t) => t.platformID === 3 && t.encodingID === 0))) say("is a symbolic TrueType font whose character map PDF/A doesn't allow (6.2.11.6-4).");
      } else {
        if (base !== "WinAnsiEncoding" && base !== "MacRomanEncoding") say("is a TrueType font without the standard encoding PDF/A requires for it (6.2.11.6-2).");
        if (diffs.size && ![...diffs.values()].every((n) => unicodeOf(n) !== undefined)) say("names glyphs this tool can't check against the Adobe Glyph List (6.2.11.6-2).");
        const cm = prog.sfnt?.cmaps ?? [], has30 = cm.some((t) => t.platformID === 3 && t.encodingID === 0);
        if (!(has30 ? cm.length > 1 : cm.length > 0)) say("has no character map PDF/A accepts for it (6.2.11.6-1).");
        if (diffs.size && !cm.some((t) => t.platformID === 3 && t.encodingID === 1)) say("changes its encoding but has no Unicode character map (6.2.11.6-2).");
      }
    }
    for (const c of use.any) {
      // the glyph name: Differences, then the named base encoding, then (no base named) the program's own encoding
      let name: string | undefined, known = true;
      if (diffs.has(c)) name = diffs.get(c);
      else if (base) { const b = baseName(base, c); if (b === null) known = false; else name = b; }
      else if (!isTT) { if (!prog.builtin || (prog.builtinPartial && !prog.builtin.has(c))) known = false; else name = prog.builtin.get(c); }
      let width: number | undefined, notdef = false;
      if (known && isTT) {
        const r = trueTypeGlyph(prog, c, symbolic, name);
        if (r === undefined) known = false; else if (r === 0) notdef = true; else width = prog.widthByGid?.(r);
      } else if (known) {
        if (name === undefined || name === ".notdef") notdef = true;
        else { width = prog.widthByName?.(name); if (width === undefined) { if (!use.visible.has(c)) continue; say("is missing glyphs the file draws ({}) (6.2.11.4.1-2).", `“${name}”`); continue; } }
      }
      if (!known) { say("uses character codes this tool can't follow to a glyph ({}), so it can't be checked.", String(c)); continue; }
      if (notdef) { say("draws the .notdef glyph (an empty or placeholder glyph), which PDF/A doesn't allow (6.2.11.8-1)."); continue; }
      if (!use.visible.has(c)) continue;
      const dw = dictWidth(c);
      if (width === undefined || Number.isNaN(width)) { say("has a glyph whose width this tool can't read, so the widths can't be checked."); continue; }
      if (dw !== undefined && Math.abs(dw - width) > 1) say("gives widths that differ from its font program's ({}; thousandths of the text size) (6.2.11.5-1).", `${Math.round(dw)} instead of ${Math.round(width)}`);
    }
  }
  for (const [key, items] of said) { const list = [...items]; out.problems.push(key.replace("{}", list.slice(0, 6).join(", ") + (list.length > 6 ? ", …" : ""))); }
  return out;

  /** A Type 3 font: each drawn code names a glyph procedure (6.2.11.4.1-2) whose width, set by d0 or d1, matches the
   *  Widths entry (6.2.11.5-1); both are in the font's own glyph units. */
  function type3Font(font: PDFDict, use: FontUse, say: (s: string, item?: string) => void) {
    const enc = look<PDFDict>(font.get(N("Encoding"))), procs = look<PDFDict>(font.get(N("CharProcs")));
    const diffs = new Map<number, string>(); const d = look<PDFArray>(enc?.get?.(N("Differences"))); let code = 0;
    if (d instanceof PDFArray) for (const x of d.asArray()) { const y = look<PDFObject>(x); if (y instanceof PDFNumber) code = y.asNumber(); else if (y instanceof PDFName) diffs.set(code++, y.decodeText()); }
    const widths = look<PDFArray>(font.get(N("Widths"))), first = nb(font.get(N("FirstChar"))) ?? 0;
    for (const c of use.any) {
      const name = diffs.get(c);
      if (name === ".notdef") { say("draws the .notdef glyph (an empty or placeholder glyph), which PDF/A doesn't allow (6.2.11.8-1)."); continue; }
      if (!use.visible.has(c) || name === undefined) continue;
      const proc = look<PDFObject>(procs?.get(N(name)));
      if (!(proc instanceof PDFStream)) { say("is missing glyphs the file draws ({}) (6.2.11.4.1-2).", `“${name}”`); continue; }
      const bytes = streamBytes(proc); if (!bytes) { say("has a glyph that can't be read."); continue; }
      const nums: number[] = []; let w: number | undefined;
      for (const t of tokens(bytes)) { if (t.k === "num") nums.push(t.v); else if (t.k === "op") { if ((t.v === "d0" && nums.length === 2) || (t.v === "d1" && nums.length === 6)) w = nums[0]; break; } }
      if (w === undefined) { say("has a glyph without the width setting it must start with, so the widths can't be checked."); continue; }
      const dw = widths instanceof PDFArray && c >= first && c - first < widths.size() ? nb(widths.get(c - first)) : undefined;
      if (dw !== undefined && Math.abs(dw - w) > 1) say("gives widths that differ from its glyphs' ({}) (6.2.11.5-1).", `${Math.round(dw)} instead of ${Math.round(w)}`);
    }
  }

  /** A composite (Type 0) font: CMap, character collection, CID to glyph, glyphs and widths. */
  function compositeFont(font: PDFDict, cid: PDFDict, prog: Program, use: FontUse, say: (s: string, item?: string) => void) {
    const enc = look<PDFObject>(font.get(N("Encoding")));
    let cmap: CMap | undefined;
    const csi = look<PDFDict>(cid.get(N("CIDSystemInfo")));
    if (enc instanceof PDFName) {
      const n = enc.decodeText();
      if (n === "Identity-H" || n === "Identity-V") cmap = IDENTITY;
      else if (!PREDEFINED_CMAPS.has(n)) { say(`uses a character map (${n}) that isn't embedded (6.2.11.3.3-1).`); return; }
      else { say(`uses a predefined character map (${n}) this tool can't read, so its glyphs and widths can't be checked.`); return; }
    } else if (enc instanceof PDFStream) {
      const data = streamBytes(enc); if (!data) { say("has a character map that can't be read."); return; }
      cmap = readCMap(data);
      const dictW = nb(enc.dict.get(N("WMode"))) ?? 0;
      if ((cmap.wmode ?? 0) !== dictW) say("has a character map whose writing direction (WMode) differs from its dictionary's (6.2.11.3.3-2).");
      const usesName = cmap.uses ?? nm(enc.dict.get(N("UseCMap")));
      if (usesName && !PREDEFINED_CMAPS.has(usesName)) say("has a character map built on another one PDF/A doesn't allow (6.2.11.3.3-3).");
      else if (usesName && usesName !== "Identity-H" && usesName !== "Identity-V") { say(`has a character map built on a predefined one (${usesName}) this tool can't read.`); return; }
      else if (usesName) { const own = cmap; cmap = { ...own, ranges: [...own.ranges, ...IDENTITY.ranges], cid: (c) => own.cid(c) ?? IDENTITY.cid(c) }; }
      if (look<PDFObject>(enc.dict.get(N("UseCMap"))) instanceof PDFStream) say("has a character map built on another one PDF/A doesn't allow (6.2.11.3.3-3).");
      if (cmap.maxCid > 65535) say("has a character map with CIDs above 65,535 (6.1.13-10).");
      // 6.2.11.3.1-1: same character collection
      const ci = look<PDFDict>(enc.dict.get(N("CIDSystemInfo")));
      const text = (d: PDFDict | undefined, k: string) => { const v = look<PDFObject>(d?.get(N(k))); return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : undefined; };
      if (!ci || !csi || text(ci, "Registry") !== text(csi, "Registry") || text(ci, "Ordering") !== text(csi, "Ordering") || (nb(csi.get(N("Supplement"))) ?? 0) > (nb(ci.get(N("Supplement"))) ?? 0))
        say("has a character map and font for different character collections (6.2.11.3.1-1).");
    } else { say("has no character map."); return; }

    // CID -> glyph id
    const cidSub = nm(cid.get(N("Subtype")));
    let gidOf: (c: number) => number | undefined;
    if (cidSub === "CIDFontType2") {
      const m = look<PDFObject>(cid.get(N("CIDToGIDMap")));
      if (!m) { cid.set(N("CIDToGIDMap"), N("Identity")); out.fixes.push("Wrote the font setting CIDToGIDMap as Identity, the meaning it has when left out (PDF/A requires it to be written)."); gidOf = (c) => c; }
      else if (m instanceof PDFName && m.decodeText() === "Identity") gidOf = (c) => c;
      else if (m instanceof PDFStream) { const b = streamBytes(m); if (!b) { say("has a glyph map that can't be read."); return; } gidOf = (c) => (2 * c + 1 < b.length ? b[2 * c] * 256 + b[2 * c + 1] : 0); }
      else { say("has a glyph map PDF/A doesn't allow (6.2.11.3.2-1)."); return; }
    } else { if (!prog.gidOfCid) { say("has a glyph list (charset) this tool can't read, so its glyphs can't be checked."); return; } gidOf = prog.gidOfCid; }
    // widths: W and DW
    const dw = nb(cid.get(N("DW"))) ?? 1000, wmap = new Map<number, number>();
    const W = look<PDFArray>(cid.get(N("W")));
    if (W instanceof PDFArray) { const a = W.asArray().map((x) => look<PDFObject>(x)); for (let i = 0; i < a.length; ) { const c1 = a[i] instanceof PDFNumber ? (a[i] as PDFNumber).asNumber() : NaN, nx = a[i + 1];
      if (nx instanceof PDFArray) { nx.asArray().forEach((w, k) => { const v = nb(w); if (v !== undefined) wmap.set(c1 + k, v); }); i += 2; }
      else { const c2 = nb(nx), w = nb(a[i + 2]); if (c2 !== undefined && w !== undefined) for (let c = c1; c <= c2 && c - c1 < 70000; c++) wmap.set(c, w); i += 3; } } }
    for (const { bytes, shown } of use.strings.values()) {
      const codes = splitCodes(bytes, cmap);
      if (!codes) { say("draws bytes that don't fit its character map, so it can't be checked."); return; }
      for (const code of codes) {
        const c = cmap.cid(code);
        if (c === undefined || c === 0) { say("draws the .notdef glyph (an empty or placeholder glyph), which PDF/A doesn't allow (6.2.11.8-1)."); continue; }
        const gid = gidOf(c);
        if (gid === undefined || (prog.numGlyphs !== undefined && gid >= prog.numGlyphs)) { if (!shown) continue; say("is missing glyphs the file draws ({}) (6.2.11.4.1-2).", `CID ${c}`); continue; }
        if (gid === 0) { say("draws the .notdef glyph (an empty or placeholder glyph), which PDF/A doesn't allow (6.2.11.8-1)."); continue; }
        if (!shown) continue;
        const w = prog.widthByGid?.(gid);
        if (w === undefined || Number.isNaN(w)) { say("has a glyph whose width this tool can't read, so the widths can't be checked."); continue; }
        const d = wmap.get(c) ?? dw;
        if (Math.abs(d - w) > 1) say("gives widths that differ from its font program's ({}; thousandths of the text size) (6.2.11.5-1).", `${Math.round(d)} instead of ${Math.round(w)}`);
      }
    }
  }
}

/** The glyph a simple TrueType font draws for a code: symbolic fonts through the (3,0) cmap (code, or code plus
 *  F000, F100 or F200) or the (1,0) one or a single cmap; others from the glyph name, through the (3,1) cmap by its
 *  Unicode value, the (1,0) cmap by its Mac code (ASCII range), or the glyph names in the font. 0 means the code
 *  reaches no glyph; undefined that this tool can't tell. */
function trueTypeGlyph(prog: Program, code: number, symbolic: boolean, name: string | undefined): number | undefined {
  const cm = prog.sfnt?.cmaps ?? [];
  const t = (p: number, e: number) => cm.find((x) => x.platformID === p && x.encodingID === e);
  if (symbolic) {
    const s = t(3, 0); if (s) { for (const off of [0, 0xf000, 0xf100, 0xf200]) { const g = s.lookup(code + off); if (g) return g; } return 0; }
    const m = t(1, 0) ?? (cm.length === 1 ? cm[0] : undefined); if (m) return m.lookup(code);
    return undefined;
  }
  if (!name) return 0;
  const u = unicodeOf(name), w = t(3, 1);
  if (w && u !== undefined) { const g = w.lookup(u); if (g) return g; }
  const m = t(1, 0);
  if (m && code >= 32 && code <= 126 && WINANSI.byCode.get(code) === name) { const g = m.lookup(code); if (g) return g; }
  if (w && u === undefined) return undefined;
  for (let g = 1; g < (prog.numGlyphs ?? 0); g++) if (prog.sfnt?.post(g) === name) return g;
  return 0;
}
