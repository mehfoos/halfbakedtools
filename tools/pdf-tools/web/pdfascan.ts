// Reads a PDF's content streams (pages, form XObjects, tiling patterns, Type 3 glyphs, annotation appearances) for
// what PDF/A conversion needs to know: which fonts draw text and with which character codes, which colour spaces are
// used, operators and values PDF/A doesn't allow, resources a stream names but doesn't have, inline images that break
// the rules, and how deeply graphics states nest. It changes nothing. Rule numbers are veraPDF's ("PDF/A Parts 2 and
// 3 rules", archived).
import { PDFDict, PDFName, PDFArray, PDFRef, PDFRawStream, PDFStream, PDFNumber, decodePDFRawStream, type PDFContext, type PDFObject } from "@cantoo/pdf-lib";

// ---------- a small content-stream lexer (PDF syntax: white space, delimiters, objects) ----------
export type Tok = { k: "num"; v: number; int: boolean } | { k: "name"; v: string; raw: number } | { k: "str"; v: Uint8Array; bad?: "odd" | "char" } | { k: "op"; v: string } | { k: "inline"; v: string } | { k: "open" | "close" | "dopen" | "dclose" };
const WS = new Set([0, 9, 10, 12, 13, 32]), DELIM = new Set("()<>[]{}/%".split("").map((c) => c.charCodeAt(0)));
const regular = (b: number) => !WS.has(b) && !DELIM.has(b);
const HEX = /^[0-9a-fA-F]$/;

/** Splits content bytes into tokens. An inline image (BI dictionary ID data EI) is one "inline" token holding its
 *  dictionary's text; its data is skipped. true, false and null are operands, not operators. A hex string with an odd
 *  number of digits or a character that isn't a hex digit is marked (6.1.6-1, -2). */
export function* tokens(b: Uint8Array): Generator<Tok> {
  let i = 0;
  const n = b.length, ascii = (s: number, e: number) => String.fromCharCode(...b.subarray(s, e));
  while (i < n) {
    const c = b[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; }          // % comment
    if (c === 47) {                                                                       // /Name, with #xx escapes
      let j = i + 1; while (j < n && regular(b[j])) j++;
      const v = ascii(i + 1, j).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      yield { k: "name", v, raw: v.length }; i = j; continue;
    }
    if (c === 40) {                                                                       // (literal string)
      const out: number[] = []; let depth = 1, j = i + 1;
      while (j < n && depth) {
        const d = b[j];
        if (d === 92) { const e = b[j + 1]; j += 2;
          if (e >= 48 && e <= 55) { let o = e - 48, k = 1; while (k < 3 && b[j] >= 48 && b[j] <= 55) { o = o * 8 + b[j] - 48; j++; k++; } out.push(o & 255); }
          else if (e === 13) { if (b[j] === 10) j++; } else if (e === 10) { /* line continuation */ }
          else out.push(({ 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 } as Record<number, number>)[e] ?? e);
          continue; }
        if (d === 40) depth++; else if (d === 41 && --depth === 0) { j++; break; }
        out.push(d); j++;
      }
      yield { k: "str", v: Uint8Array.from(out) }; i = j; continue;
    }
    if (c === 60 && b[i + 1] === 60) { yield { k: "dopen" }; i += 2; continue; }
    if (c === 62 && b[i + 1] === 62) { yield { k: "dclose" }; i += 2; continue; }
    if (c === 60) {                                                                       // <hex string>
      let j = i + 1, h = "", bad: "odd" | "char" | undefined;
      while (j < n && b[j] !== 62) { if (!WS.has(b[j])) { const ch = String.fromCharCode(b[j]); if (HEX.test(ch)) h += ch; else bad = "char"; } j++; }
      if (h.length % 2) { h += "0"; bad ??= "odd"; }
      yield { k: "str", v: Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16)), ...(bad ? { bad } : {}) }; i = j + 1; continue;
    }
    if (c === 91) { yield { k: "open" }; i++; continue; }
    if (c === 93) { yield { k: "close" }; i++; continue; }
    if (c === 123 || c === 125 || c === 41 || c === 62) { i++; continue; }               // stray delimiters
    let j = i; while (j < n && regular(b[j])) j++;
    const word = ascii(i, j); i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) { yield { k: "num", v: Number(word), int: /^[+-]?\d+$/.test(word) }; continue; }
    if (word === "BI") {
      let j = i;   // the dictionary runs to an ID keyword standing alone
      while (j + 1 < n && !(b[j] === 73 && b[j + 1] === 68 && WS.has(b[j - 1]) && (j + 2 >= n || WS.has(b[j + 2])))) j++;
      const dict = ascii(i, j); i = j + 3;   // past "ID" and the single white-space character after it
      while (i < n && !(WS.has(b[i - 1]) && b[i] === 69 && b[i + 1] === 73 && (i + 2 >= n || WS.has(b[i + 2]) || DELIM.has(b[i + 2])))) i++;
      i += 2; yield { k: "inline", v: dict }; continue;
    }
    if (word === "true" || word === "false" || word === "null") { yield { k: "num", v: word === "true" ? 1 : 0, int: false }; continue; }
    yield { k: "op", v: word };
  }
}

/** Every content-stream operator ISO 32000-1 defines (its Annex A operator summary), for 6.2.2-1. */
export const OPERATORS = new Set("b B b* B* BDC BI BMC BT BX c cm CS cs d d0 d1 Do DP EI EMC ET EX f F f* G g gs h i ID j J K k l m M MP n q Q re RG rg ri s S SC sc SCN scn sh T* Tc Td TD Tf Tj TJ TL Tm Tr Ts Tw Tz v w W W* y ' \"".split(" "));
const INTENTS = new Set(["RelativeColorimetric", "AbsoluteColorimetric", "Perceptual", "Saturation"]);   // 6.2.6-1

// ---------- what is collected ----------
/** How a font is used. Simple fonts: single-byte codes. Composite (Type 0) fonts: whole strings, split into codes by
 *  their CMap later. `visible` holds what is drawn in a render mode other than 3 (invisible); `any` everything. */
export type FontUse = { shown: boolean; visible: Set<number>; any: Set<number>; strings: Map<string, { bytes: Uint8Array; shown: boolean }> };
export type ScanResult = {
  fonts: Map<PDFDict, FontUse>;                 // font dictionaries used by text-showing operators
  device: Set<"gray" | "rgb" | "cmyk">;         // device colour spaces used where no Default colour space applies
  inlineProblems: string[];                     // inline images with LZW, Crypt, interpolation or an unknown intent
  problems: string[];                           // other things PDF/A doesn't allow, in words
  deepestNesting: number;                       // q/Q levels
  unreadable: number;                           // content streams that could not be decoded
  /** Forms, patterns and Type 3 fonts without their own Resources, with the resources they were drawn with (6.2.2-2):
   *  they can be given those, if it is always the same dictionary and has everything they name. */
  borrowed: Map<PDFDict, Set<PDFDict | undefined>>;
};

const DEVICE: Record<string, "gray" | "rgb" | "cmyk"> = { DeviceGray: "gray", G: "gray", DeviceRGB: "rgb", RGB: "rgb", DeviceCMYK: "cmyk", CMYK: "cmyk" };
const INT_MAX = 2147483647, INT_MIN = -2147483648;

/** The bytes of a stream, decoded (null if they can't be). */
export function streamBytes(s: PDFObject | undefined): Uint8Array | null {
  try {
    if (s instanceof PDFRawStream) return decodePDFRawStream(s).decode();
    if (s instanceof PDFStream) return s.getContents();
  } catch { /* fall through */ }
  return null;
}

export function scanDocument(ctx: PDFContext, pages: PDFDict[]): ScanResult {
  const r: ScanResult = { fonts: new Map(), device: new Set(), inlineProblems: [], problems: [], deepestNesting: 0, unreadable: 0, borrowed: new Map() };
  const seen = new Set<PDFObject>();
  const look = <T extends PDFObject>(o: PDFObject | undefined): T | undefined => (o instanceof PDFRef ? (ctx.lookup(o) as T) : (o as T));
  const res = (d: PDFDict | undefined, key: string, name: string) => look<PDFObject>(look<PDFDict>(d?.get(PDFName.of(key)))?.get(PDFName.of(name)));
  const problem = (p: string) => { if (!r.problems.includes(p)) r.problems.push(p); };
  const missing = (cat: string, n: string) => problem(`a drawing names a resource it doesn't have (${cat} ${n})`);   // 6.2.2-2

  /** Device colour families a colour space (or its base, alternate or pattern space) uses, unless a Default space
   *  in `resources` gives it a device-independent meaning. */
  const colourSpace = (cs: PDFObject | undefined, resources: PDFDict | undefined, depth = 0): void => {
    cs = look(cs); if (!cs || depth > 8) return;
    if (cs instanceof PDFName) {
      const n = cs.decodeText(), fam = DEVICE[n];
      if (fam) { const dflt = { gray: "DefaultGray", rgb: "DefaultRGB", cmyk: "DefaultCMYK" }[fam]; if (!res(resources, "ColorSpace", dflt)) r.device.add(fam); return; }
      if (n === "Pattern") return;
      const named = res(resources, "ColorSpace", n);
      if (!named) { if (depth === 0) missing("colour space", n); return; }
      return colourSpace(named, resources, depth + 1);
    }
    if (cs instanceof PDFArray) {
      const kind = look<PDFName>(cs.get(0))?.decodeText();
      if (kind === "Indexed" || kind === "I") colourSpace(cs.get(1), resources, depth + 1);
      else if (kind === "Separation" || kind === "DeviceN") colourSpace(cs.get(2), resources, depth + 1);
      else if (kind === "Pattern" && cs.size() > 1) colourSpace(cs.get(1), resources, depth + 1);
    }
  };

  const image = (img: PDFDict, resources: PDFDict | undefined) => {
    if (!img.get(PDFName.of("ImageMask"))?.toString().includes("true")) colourSpace(img.get(PDFName.of("ColorSpace")), resources, 1);
    const sm = look<PDFStream>(img.get(PDFName.of("SMask"))); if (sm instanceof PDFStream) colourSpace(sm.dict.get(PDFName.of("ColorSpace")), resources, 1);
  };

  /** Reads one content stream with its resources. */
  const content = (data: Uint8Array | null, resources: PDFDict | undefined, nesting: number): void => {
    if (!data) { r.unreadable++; return; }
    const stack: (Tok | unknown[])[] = [];
    let font: PDFDict | undefined, mode = 0, depth = nesting, arr: unknown[] | null = null, dict = 0;
    for (const t of tokens(data)) {
      if (t.k === "num" && t.int && (t.v > INT_MAX || t.v < INT_MIN)) problem("a number too large for PDF/A (integers are limited to ±2,147,483,647)");   // 6.1.13-1
      if (t.k === "str") { if (t.v.length > 32767) problem("text longer than PDF/A allows (32,767 bytes)"); if (t.bad) problem("badly written hexadecimal text"); }   // 6.1.13-3, 6.1.6
      if (t.k === "name" && t.raw > 127) problem("a name longer than PDF/A allows (127 bytes)");   // 6.1.13-4
      if (t.k === "dopen") { dict++; continue; }    // property lists of marked content: read past
      if (t.k === "dclose") { dict = Math.max(0, dict - 1); continue; }
      if (dict) continue;
      if (t.k === "open") { arr = []; continue; }
      if (t.k === "close") { stack.push(arr ?? []); arr = null; continue; }
      if (t.k === "inline") { inline(t.v, resources); stack.length = 0; continue; }
      if (t.k !== "op") { if (arr) arr.push(t); else stack.push(t); continue; }
      const op = t.v, args = stack.splice(0) as (Tok | unknown[])[];
      if (!OPERATORS.has(op)) { problem(`an operator ISO 32000-1 doesn't define (${op.slice(0, 20)})`); continue; }   // 6.2.2-1
      const nameArg = (k: number) => { const a = args[k] as Tok | undefined; return a && !Array.isArray(a) && a.k === "name" ? a.v : undefined; };
      switch (op) {
        case "q": depth++; r.deepestNesting = Math.max(r.deepestNesting, depth); break;
        case "Q": depth = Math.max(0, depth - 1); break;
        case "Tf": { const n = nameArg(0) ?? "", f = look<PDFObject>(res(resources, "Font", n)); font = f instanceof PDFDict ? f : undefined; if (!f) missing("font", n); break; }
        case "Tr": { const a = args[0] as Tok; if (a && !Array.isArray(a) && a.k === "num") mode = a.v; break; }
        case "ri": { const n = nameArg(0); if (n && !INTENTS.has(n)) problem(`a rendering intent PDF/A doesn't know (${n})`); break; }   // 6.2.6-1
        case "gs": { const n = nameArg(0) ?? ""; if (!res(resources, "ExtGState", n)) missing("graphics state", n); break; }
        case "Tj": case "'": case '"': case "TJ": {
          if (!font) break;
          const use = r.fonts.get(font) ?? { shown: false, visible: new Set<number>(), any: new Set<number>(), strings: new Map() }; r.fonts.set(font, use);
          const vis = mode !== 3; if (vis) use.shown = true;
          const strs = op === "TJ" ? ((args[0] as unknown[]) ?? []).filter((x) => (x as Tok).k === "str") as Tok[] : [args[op === '"' ? 2 : 0] as Tok];
          const composite = look<PDFName>(font.get(PDFName.of("Subtype")))?.toString() === "/Type0";
          for (const s of strs) {
            if (!s || s.k !== "str") continue;
            if (composite) { const key = [...s.v].map((x) => x.toString(16).padStart(2, "0")).join(""); const e = use.strings.get(key); if (e) e.shown ||= vis; else use.strings.set(key, { bytes: s.v, shown: vis }); }
            else for (const byte of s.v) { use.any.add(byte); if (vis) use.visible.add(byte); }
          }
          if (look<PDFObject>(font.get(PDFName.of("Subtype")))?.toString() === "/Type3") type3(font, resources);
          break;
        }
        case "g": case "G": if (!res(resources, "ColorSpace", "DefaultGray")) r.device.add("gray"); break;
        case "rg": case "RG": if (!res(resources, "ColorSpace", "DefaultRGB")) r.device.add("rgb"); break;
        case "k": case "K": if (!res(resources, "ColorSpace", "DefaultCMYK")) r.device.add("cmyk"); break;
        case "cs": case "CS": { const n = nameArg(0); if (n) colourSpace(PDFName.of(n), resources); break; }
        case "sh": { const n = nameArg(0) ?? "", sh = look<PDFObject>(res(resources, "Shading", n)); const d = sh instanceof PDFStream ? sh.dict : sh; if (d instanceof PDFDict) colourSpace(d.get(PDFName.of("ColorSpace")), resources, 1); else missing("shading", n); break; }
        case "scn": case "SCN": { const n = nameArg(args.length - 1); if (n) { const p = res(resources, "Pattern", n); if (!p) missing("pattern", n); else pattern(p, resources, depth); } break; }
        case "BDC": case "DP": { const n = nameArg(1); if (n && !res(resources, "Properties", n)) missing("property list", n); break; }
        case "Do": {
          const n = nameArg(0) ?? "", xo = look<PDFObject>(res(resources, "XObject", n));
          if (!(xo instanceof PDFStream)) { missing("picture or drawing", n); break; }
          const sub = xo.dict.get(PDFName.of("Subtype"))?.toString();
          if (sub === "/Image") image(xo.dict, resources);
          else if (sub === "/Form" && !seen.has(xo)) { seen.add(xo); form(xo, resources, depth); seen.delete(xo); }
          break;
        }
      }
    }
  };
  /** An inline image's dictionary (abbreviated keys allowed). */
  const inline = (dict: string, resources: PDFDict | undefined) => {
    const cs = dict.match(/\/(?:CS|ColorSpace)\s*\/([^\s/\[\]<>()]+)/), mask = /\/(?:IM|ImageMask)\s+true/.test(dict);
    if (cs && !mask) colourSpace(PDFName.of(cs[1].replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))), resources);
    const f = dict.match(/\/(?:F|Filter)\s*(\[[^\]]*\]|\/[^\s/\[\]<>()]+)/);
    if (f && /\/(LZW|LZWDecode|Crypt)\b/.test(f[1])) r.inlineProblems.push(`an inline image compressed with ${f[1].match(/LZW\w*|Crypt/)![0]}`);
    if (/\/(?:I|Interpolate)\s+true/.test(dict)) r.inlineProblems.push("an inline image asking to be smoothed (Interpolate)");
    const it = dict.match(/\/Intent\s*\/([^\s/\[\]<>()]+)/); if (it && !INTENTS.has(it[1])) r.inlineProblems.push(`an inline image with a rendering intent PDF/A doesn't know (${it[1]})`);   // 6.2.6-1
  };
  const groupSpace = (d: PDFDict, resources: PDFDict | undefined) => { const g = look<PDFDict>(d.get(PDFName.of("Group"))); if (g instanceof PDFDict) colourSpace(g.get(PDFName.of("CS")), resources, 1); };
  /** Resources of a form, pattern or Type 3 font: its own, or (noted as borrowed) the ones it's drawn with. */
  const ownOr = (holder: PDFDict, parent: PDFDict | undefined) => {
    const own = look<PDFObject>(holder.get(PDFName.of("Resources")));
    if (own instanceof PDFDict) return own;
    const s = r.borrowed.get(holder) ?? new Set(); s.add(parent); r.borrowed.set(holder, s);
    return parent;
  };
  const form = (xo: PDFStream, parent: PDFDict | undefined, depth: number) => {
    const own = ownOr(xo.dict, parent);
    groupSpace(xo.dict, own); content(streamBytes(xo), own, depth);
  };
  const pattern = (p: PDFObject | undefined, resources: PDFDict | undefined, depth: number) => {
    const pat = look<PDFStream | PDFDict>(p);
    if (pat instanceof PDFStream && !seen.has(pat)) { seen.add(pat); form(pat, resources, depth); }
    else if (pat instanceof PDFDict) { const sh = look<PDFDict | PDFStream>(pat.get(PDFName.of("Shading"))); const d = sh instanceof PDFStream ? sh.dict : sh; if (d instanceof PDFDict) colourSpace(d.get(PDFName.of("ColorSpace")), resources, 1); }
  };
  const type3 = (f: PDFDict, parent: PDFDict | undefined) => {
    if (seen.has(f)) return; seen.add(f);
    const procs = look<PDFDict>(f.get(PDFName.of("CharProcs"))), own = ownOr(f, parent);
    if (procs) for (const [, p] of procs.entries()) content(streamBytes(look(p)), own, 0);
  };

  for (const page of pages) {
    const resources = inherited(ctx, page, "Resources");
    groupSpace(page, resources);
    const c = look(page.get(PDFName.of("Contents")));
    if (c) {   // a page without Contents is blank
      const parts = c instanceof PDFArray ? c.asArray().map((x) => streamBytes(look(x))) : [streamBytes(c)];
      if (parts.some((p) => !p)) r.unreadable++;
      const joined = concat(parts.filter((p): p is Uint8Array => !!p).flatMap((p) => [p, Uint8Array.of(10)]));
      content(joined, resources, 0);
    }
    // annotation appearances
    const annots = look<PDFArray>(page.get(PDFName.of("Annots")));
    if (annots instanceof PDFArray) for (const a of annots.asArray()) {
      const ap = look<PDFDict>(look<PDFDict>(a)?.get(PDFName.of("AP")));
      if (!(ap instanceof PDFDict)) continue;
      for (const [, v] of ap.entries()) {
        const s = look<PDFObject>(v), streams = s instanceof PDFStream ? [s] : s instanceof PDFDict ? [...s.entries()].map(([, x]) => look<PDFObject>(x)).filter((x): x is PDFStream => x instanceof PDFStream) : [];
        for (const st of streams) if (!seen.has(st)) { seen.add(st); form(st, undefined, 0); }
      }
    }
  }
  return r;
}

/** A page entry, looked up through its parents when not on the page itself. */
export function inherited(ctx: PDFContext, page: PDFDict, key: string): PDFDict | undefined {
  let node: PDFDict | undefined = page;
  for (let i = 0; node && i < 50; i++) {
    const v = node.get(PDFName.of(key));
    if (v) { const o = v instanceof PDFRef ? ctx.lookup(v) : v; return o instanceof PDFDict ? o : undefined; }
    const p = node.get(PDFName.of("Parent")); node = p instanceof PDFRef ? (ctx.lookup(p) as PDFDict) : undefined;
  }
  return undefined;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const num = (o: PDFObject | undefined) => (o instanceof PDFNumber ? o.asNumber() : undefined);
