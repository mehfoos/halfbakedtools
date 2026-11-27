// Pull the pictures stored inside a PDF out as files. Pure (no DOM), so it is tested with PDFs built in the tests.
// JPEG and JPEG 2000 pictures are copied out exactly as stored. Other pictures are stored as raw pixels and are
// re-wrapped as PNG, which keeps every pixel. Kinds this does not handle yet are counted and reported, not hidden.
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFNumber, PDFRef, PDFRawStream, PDFStream, PDFBool, PDFHexString, PDFString, decodePDFRawStream } from "@cantoo/pdf-lib";
import { zlibSync } from "fflate";

export type Picture = { page: number; pages: number[]; width: number; height: number; kind: "jpeg" | "png" | "jp2"; bytes: Uint8Array; note?: string };
export type Extracted = { pictures: Picture[]; skipped: { reason: string; count: number }[]; tiny: number };

// ---------- PNG writer ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const be32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length), t = new TextEncoder().encode(type);
  out.set(be32(data.length), 0); out.set(t, 4); out.set(data, 8); out.set(be32(crc32(out.subarray(4, 8 + data.length))), 8 + data.length);
  return out;
}
/** 8-bit pixels (1 = gray, 2 = gray+alpha, 3 = RGB, 4 = RGBA) as a PNG file. */
export function encodePng(width: number, height: number, channels: 1 | 2 | 3 | 4, pixels: Uint8Array): Uint8Array {
  const type = ({ 1: 0, 2: 4, 3: 2, 4: 6 } as const)[channels], row = width * channels, raw = new Uint8Array((row + 1) * height);
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);   // filter type 0 (none) at each row start
  const ihdr = new Uint8Array(13); ihdr.set(be32(width), 0); ihdr.set(be32(height), 4); ihdr[8] = 8; ihdr[9] = type;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlibSync(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// ---------- reading a picture ----------
const num = (v: unknown): number | undefined => (v instanceof PDFNumber ? v.asNumber() : undefined);
const name = (v: unknown): string | undefined => (v instanceof PDFName ? v.decodeText() : undefined);
function filters(dict: PDFDict): string[] {
  const f = dict.lookup(PDFName.of("Filter"));
  if (f instanceof PDFName) return [f.decodeText()];
  if (f instanceof PDFArray) return f.asArray().map((x) => name(dict.context.lookup(x)) ?? "?");
  return [];
}
type Space = { channels: 1 | 3; palette?: Uint8Array; bits: number };
/** The colour space as a count of channels (plus a palette for indexed pictures), or why it isn't handled. */
function space(dict: PDFDict, bits: number): Space | string {
  const ctx = dict.context;
  let cs = dict.lookup(PDFName.of("ColorSpace"));
  const nm = name(cs);
  if (nm === "DeviceGray" || nm === "CalGray" || nm === "G") return { channels: 1, bits };
  if (nm === "DeviceRGB" || nm === "CalRGB" || nm === "RGB") return { channels: 3, bits };
  if (nm === "DeviceCMYK" || nm === "CMYK") return "CMYK colour";
  if (!(cs instanceof PDFArray)) return "an unusual colour setup";
  const kind = name(cs.lookup(0)), arr = cs;
  if (kind === "ICCBased") {
    const prof = arr.lookup(1);
    const n = prof instanceof PDFStream ? num(prof.dict.lookup(PDFName.of("N"))) : undefined;
    return n === 1 ? { channels: 1, bits } : n === 3 ? { channels: 3, bits } : n === 4 ? "CMYK colour" : "an unusual colour setup";
  }
  if (kind === "Indexed" || kind === "I") {
    const base = arr.lookup(1), hival = num(arr.lookup(2)), table = arr.lookup(3);
    const baseName = name(base) ?? (base instanceof PDFArray ? name(base.lookup(0)) : undefined);
    const baseChannels = baseName === "DeviceRGB" || baseName === "CalRGB" || baseName === "RGB" ? 3 : baseName === "DeviceGray" || baseName === "CalGray" || baseName === "G" ? 1 : baseName === "ICCBased" ? 3 : 0;
    if (!baseChannels || hival === undefined) return "an unusual colour setup";
    let lookup: Uint8Array | undefined;
    if (table instanceof PDFHexString || table instanceof PDFString) lookup = table.asBytes();
    else if (table instanceof PDFRawStream) lookup = decodePDFRawStream(table).decode();
    if (!lookup) return "an unusual colour setup";
    const pal = new Uint8Array((hival + 1) * 3);
    for (let i = 0; i <= hival; i++) for (let c = 0; c < 3; c++) pal[i * 3 + c] = lookup[i * baseChannels + (baseChannels === 3 ? c : 0)] ?? 0;
    void ctx; return { channels: 1, palette: pal, bits };
  }
  return "an unusual colour setup";
}
/** Pixels as 8-bit, one byte per channel (indexed pictures become RGB). */
function unpack(data: Uint8Array, w: number, h: number, sp: Space, invert: boolean): { px: Uint8Array; channels: 1 | 3 } | string {
  const { channels, bits, palette } = sp;
  const rowBytes = Math.ceil((w * channels * bits) / 8);
  if (data.length < rowBytes * h) return "damaged picture data";
  if (channels === 3 && bits !== 8) return "an unusual bit depth";
  if (![1, 2, 4, 8].includes(bits)) return "an unusual bit depth";
  const out = new Uint8Array(w * h * (palette ? 3 : channels));
  const max = (1 << bits) - 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (channels === 3) { const s = y * rowBytes + x * 3, d = (y * w + x) * 3; out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; if (invert) { out[d] = 255 - out[d]; out[d + 1] = 255 - out[d + 1]; out[d + 2] = 255 - out[d + 2]; } continue; }
    const bit = x * bits, v = (data[y * rowBytes + (bit >> 3)] >> (8 - bits - (bit & 7))) & max;
    if (palette) { const d = (y * w + x) * 3, i = Math.min(v, palette.length / 3 - 1) * 3; out[d] = palette[i]; out[d + 1] = palette[i + 1]; out[d + 2] = palette[i + 2]; }
    else { const g = bits === 8 ? v : Math.round((v * 255) / max); out[y * w + x] = invert ? 255 - g : g; }
  }
  return { px: out, channels: palette ? 3 : (channels as 1 | 3) };
}

function decodeFlate(s: PDFRawStream): Uint8Array | string { try { return decodePDFRawStream(s).decode(); } catch { return "damaged picture data"; } }
/** Filters that only pack or spell out the bytes, which pdf-lib can undo. */
const WRAPPERS = ["FlateDecode", "Fl", "ASCIIHexDecode", "AHx", "ASCII85Decode", "A85", "LZWDecode", "LZW"];
/** The bytes after undoing a stream's first `n` filters (all of them wrappers), leaving the last one in place. */
function unwrap(s: PDFRawStream, n: number): Uint8Array | string {
  const d = s.dict.clone(s.dict.context), f = s.dict.lookup(PDFName.of("Filter")), p = s.dict.lookup(PDFName.of("DecodeParms"));
  d.set(PDFName.of("Filter"), s.dict.context.obj((f as PDFArray).asArray().slice(0, n)));
  if (p instanceof PDFArray) d.set(PDFName.of("DecodeParms"), s.dict.context.obj(p.asArray().slice(0, n))); else d.delete(PDFName.of("DecodeParms"));
  return decodeFlate(PDFRawStream.of(d, s.getContents()));
}

/** Every picture stored on the pages of this PDF. `minSide`: pictures smaller than this (in either direction) are counted, not saved. */
export async function extractPictures(bytes: Uint8Array, password: string | undefined, minSide = 32): Promise<Extracted> {
  const doc = await PDFDocument.load(bytes, password === undefined ? {} : { password });
  const seen = new Map<string, Picture>(), skipped = new Map<string, number>(), tinyRefs = new Set<string>();
  const skip = (reason: string, key: string) => { const k = `${reason}\u0000${key}`; if (!skipped.has(k)) skipped.set(k, 1); };
  doc.getPages().forEach((page, pi) => {
    const res = page.node.Resources(), xo = res?.lookup(PDFName.of("XObject"));
    if (!(xo instanceof PDFDict)) return;
    for (const [, ref] of xo.entries()) {
      const key = ref instanceof PDFRef ? ref.toString() : "";
      const have = seen.get(key); if (have) { if (!have.pages.includes(pi + 1)) have.pages.push(pi + 1); continue; }
      const obj = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
      if (!(obj instanceof PDFRawStream) || name(obj.dict.lookup(PDFName.of("Subtype"))) !== "Image") continue;
      const d = obj.dict, w = num(d.lookup(PDFName.of("Width"))) ?? 0, h = num(d.lookup(PDFName.of("Height"))) ?? 0;
      if (!w || !h) continue;
      if (w < minSide || h < minSide) { tinyRefs.add(key); continue; }
      const mask = d.lookup(PDFName.of("ImageMask")); if (mask instanceof PDFBool && mask.asBoolean()) { skip("black-and-white stencil masks", key); continue; }
      const f = filters(d), last = f[f.length - 1];
      const done = (kind: Picture["kind"], data: Uint8Array, note?: string) => seen.set(key, { page: pi + 1, pages: [pi + 1], width: w, height: h, kind, bytes: data, note });
      // A JPEG (or JPEG 2000) can be wrapped in text or packing filters, as ReportLab does with ASCII85: those are
      // undone so the picture inside is still copied out as stored.
      const jpeg = last === "DCTDecode" || last === "DCT", jp2 = last === "JPXDecode";
      if ((jpeg || jp2) && f.slice(0, -1).every((x) => WRAPPERS.includes(x))) {
        const inner = f.length === 1 ? obj.getContents() : unwrap(obj, f.length - 1);
        if (typeof inner === "string") { skip(inner, key); continue; }
        if (jp2) { done("jp2", inner, "JPEG 2000 file: many programs can open it, most web browsers cannot"); continue; }
        const cs = space(d, 8);
        if (typeof cs === "string") { skip(`JPEG pictures in ${cs}`, key); continue; }
        done("jpeg", inner); continue;
      }
      if (f.length && f.some((x) => !WRAPPERS.includes(x))) { skip(`pictures stored as ${f.join("+")}`, key); continue; }
      const bits = num(d.lookup(PDFName.of("BitsPerComponent"))) ?? 8, sp = space(d, bits);
      if (typeof sp === "string") { skip(`pictures in ${sp}`, key); continue; }
      const raw = f.length ? decodeFlate(obj) : obj.getContents();
      if (typeof raw === "string") { skip(raw, key); continue; }
      const dec = d.lookup(PDFName.of("Decode")), invert = dec instanceof PDFArray && num(dec.lookup(0)) === 1 && !sp.palette;
      const px = unpack(raw, w, h, sp, invert);
      if (typeof px === "string") { skip(px, key); continue; }
      // transparency from a soft mask, when it is a plain 8-bit gray picture of the same size
      let soft: Uint8Array | null = null, note: string | undefined;
      const sm = d.lookup(PDFName.of("SMask"));
      if (sm instanceof PDFRawStream) {
        const sw = num(sm.dict.lookup(PDFName.of("Width"))), sh = num(sm.dict.lookup(PDFName.of("Height"))), sb = num(sm.dict.lookup(PDFName.of("BitsPerComponent"))) ?? 8;
        const sraw = filters(sm.dict).length ? decodeFlate(sm) : sm.getContents();
        if (sw === w && sh === h && sb === 8 && typeof sraw !== "string" && sraw.length >= w * h) soft = sraw.subarray(0, w * h); else note = "this picture has transparency that could not be kept";
      }
      let out = px.px, ch: 1 | 2 | 3 | 4 = px.channels;
      if (soft) { const n = w * h, c = px.channels, merged = new Uint8Array(n * (c + 1)); for (let i = 0; i < n; i++) { for (let k = 0; k < c; k++) merged[i * (c + 1) + k] = px.px[i * c + k]; merged[i * (c + 1) + c] = soft[i]; } out = merged; ch = (c + 1) as 2 | 4; }
      done("png", encodePng(w, h, ch, out), note);
    }
  });
  const reasons = new Map<string, number>();
  for (const k of skipped.keys()) { const r = k.split("\u0000")[0]; reasons.set(r, (reasons.get(r) ?? 0) + 1); }
  return { pictures: [...seen.values()].sort((a, b) => a.page - b.page), skipped: [...reasons].map(([reason, count]) => ({ reason, count })), tiny: tinyRefs.size };
}
