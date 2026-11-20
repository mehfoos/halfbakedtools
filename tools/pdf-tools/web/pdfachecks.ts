// Whole-file checks for PDF/A-2 rules that the conversion can't fix without changing how the document looks, run on
// every object the converted file keeps. Each answers a rule as veraPDF states it ("PDF/A Parts 2 and 3 rules",
// archived; rule numbers below). Problems come back in words; the conversion stops if there are any. The one repair
// made here changes nothing a reader sees: a hexadecimal string with an odd number of digits gets the final 0 that
// PDF readers assume anyway (6.1.6-1).
import { PDFDict, PDFName, PDFArray, PDFRef, PDFStream, PDFRawStream, PDFNumber, PDFString, PDFHexString, type PDFContext, type PDFObject } from "@cantoo/pdf-lib";

const N = (s: string) => PDFName.of(s);
const INT_MAX = 2147483647, INT_MIN = -2147483648;
const PROCESS = new Set(["Cyan", "Magenta", "Yellow", "Black", "None"]);

export function checkObjects(ctx: PDFContext): { problems: string[]; fixed: number } {
  const look = <T extends PDFObject>(o: PDFObject | undefined): T | undefined => (o instanceof PDFRef ? (ctx.lookup(o) as T) : (o as T));
  const problems: string[] = [];
  const say = (p: string) => { if (!problems.includes(p)) problems.push(p); };
  let fixed = 0, count = 0;
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  const validUtf8 = (n: PDFName) => { try { utf8.decode(Uint8Array.from(n.decodeText(), (ch) => ch.charCodeAt(0))); return true; } catch { return false; } };
  const separations = new Map<string, string>();
  let overprint1 = false, iccCmyk = false;

  /** A comparable text form of an object, following references (6.2.4.4-2 compares the objects themselves). */
  const fingerprint = (o: PDFObject | undefined, depth = 0): string => {
    const x = look<PDFObject>(o);
    if (depth > 12 || x === undefined) return "?";
    if (x instanceof PDFStream) return `stream{${fingerprint(x.dict, depth + 1)}}${x instanceof PDFRawStream ? [...x.contents].join(",") : String(x.getContents?.())}`;
    if (x instanceof PDFDict) return `<<${[...x.entries()].filter(([k]) => k.decodeText() !== "Length").map(([k, v]) => `${k.toString()} ${fingerprint(v, depth + 1)}`).sort().join(" ")}>>`;
    if (x instanceof PDFArray) return `[${x.asArray().map((v) => fingerprint(v, depth + 1)).join(" ")}]`;
    return x.toString();
  };

  const colourArray = (a: PDFArray) => {
    const kind = look<PDFObject>(a.get(0));
    if (!(kind instanceof PDFName)) return;
    const k = kind.decodeText();
    if (k === "Separation" && a.size() >= 4) {
      const n = look<PDFObject>(a.get(1));
      if (n instanceof PDFName) {
        if (!validUtf8(n)) say("a colour name that isn't valid UTF-8 text (6.1.8-1)");
        const fp = fingerprint(a.get(2)) + "|" + fingerprint(a.get(3)), had = separations.get(n.decodeText());
        if (had === undefined) separations.set(n.decodeText(), fp);
        else if (had !== fp) say(`two definitions of the spot colour “${n.decodeText()}” that differ (6.2.4.4-2)`);
      }
    }
    if (k === "DeviceN" && a.size() >= 4) {
      const names = look<PDFArray>(a.get(1));
      const list = names instanceof PDFArray ? names.asArray().map((x) => look<PDFObject>(x)).filter((x): x is PDFName => x instanceof PDFName) : [];
      if (list.length > 32) say("a colour space with more than 32 colourants (6.1.13-9)");
      if (list.some((x) => !validUtf8(x))) say("a colour name that isn't valid UTF-8 text (6.1.8-1)");
      const attrs = look<PDFDict>(a.get(4)), colorants = look<PDFDict>(attrs?.get(N("Colorants")));
      const spots = list.map((x) => x.decodeText()).filter((x) => !PROCESS.has(x));
      if (spots.some((s) => !(colorants instanceof PDFDict) || !colorants.has(N(s)))) say("a spot colour that isn't described in its colour space's Colorants list (6.2.4.4-1)");
    }
    if (k === "ICCBased") { const s = look<PDFObject>(a.get(1)); if (s instanceof PDFStream && (look<PDFNumber>(s.dict.get(N("N"))) as PDFNumber | undefined)?.asNumber?.() === 4) iccCmyk = true; }
  };

  const walk = (o: PDFObject, holder: PDFDict | PDFArray | undefined, key: PDFName | number | undefined, depth: number): void => {
    if (depth > 64) return;
    if (o instanceof PDFNumber) { const v = o.asNumber(); if (Number.isInteger(v) && (v > INT_MAX || v < INT_MIN)) say("a number too large for PDF/A (integers are limited to ±2,147,483,647) (6.1.13-1)"); return; }
    if (o instanceof PDFHexString) {
      const raw = o.asString(), digits = raw.replace(/[\0\t\n\f\r ]/g, "");
      if (/[^0-9a-fA-F]/.test(digits)) { say("badly written hexadecimal text (6.1.6-2)"); return; }
      if (digits.length / 2 > 32767) say("text longer than PDF/A allows (32,767 bytes) (6.1.13-3)");
      if (digits.length % 2 && holder) { const fixedHex = PDFHexString.of(digits + "0"); if (holder instanceof PDFDict) holder.set(key as PDFName, fixedHex); else holder.set(key as number, fixedHex); fixed++; }
      return;
    }
    if (o instanceof PDFString) { if (o.asBytes().length > 32767) say("text longer than PDF/A allows (32,767 bytes) (6.1.13-3)"); return; }
    if (o instanceof PDFName) { if (o.decodeText().length > 127) say("a name longer than PDF/A allows (127 bytes) (6.1.13-4)"); return; }
    if (o instanceof PDFArray) { colourArray(o); o.asArray().forEach((x, i) => walk(x, o, i, depth + 1)); return; }
    const d = o instanceof PDFStream ? o.dict : o instanceof PDFDict ? o : undefined;
    if (!d) return;
    for (const [k, v] of d.entries()) { if (k.decodeText().length > 127) say("a name longer than PDF/A allows (127 bytes) (6.1.13-4)"); walk(v, d, k, depth + 1); }
    const type = look<PDFObject>(d.get(N("Type")))?.toString();
    // 6.1.8-1: font names and structure types as UTF-8
    for (const k of type === "/Font" ? ["BaseFont"] : type === "/FontDescriptor" ? ["FontName"] : type === "/StructElem" ? ["S"] : []) { const n = look<PDFObject>(d.get(N(k))); if (n instanceof PDFName && !validUtf8(n)) say(`a ${k === "S" ? "structure type" : "font name"} that isn't valid UTF-8 text (6.1.8-1)`); }
    if (type === "/StructTreeRoot") { const rm = look<PDFDict>(d.get(N("RoleMap"))); if (rm instanceof PDFDict) for (const [k, v] of rm.entries()) { const vv = look<PDFObject>(v); if (!validUtf8(k) || (vv instanceof PDFName && !validUtf8(vv))) say("a structure type that isn't valid UTF-8 text (6.1.8-1)"); } }
    // 6.2.4.2-2: overprint mode 1 with overprinting on
    if (type === "/ExtGState" || d.has(N("OPM"))) {
      const opm = (look<PDFNumber>(d.get(N("OPM"))) as PDFNumber | undefined)?.asNumber?.();
      const on = (k: string) => look<PDFObject>(d.get(N(k)))?.toString() === "true";
      if (opm === 1 && (on("OP") || on("op"))) overprint1 = true;
    }
    // 6.2.8.3: JPEG 2000 pictures
    if (o instanceof PDFStream && look<PDFObject>(d.get(N("Subtype")))?.toString() === "/Image") {
      const f = look<PDFObject>(d.get(N("Filter"))), names = f instanceof PDFArray ? f.asArray().map((x) => look<PDFObject>(x)?.toString()) : [f?.toString()];
      if (names.includes("/JPXDecode")) {
        if (names.length !== 1 || !(o instanceof PDFRawStream)) say("a JPEG 2000 picture stored in a way this tool can't check");
        else for (const p of jpxProblems(o.contents)) say(p);
      }
    }
  };
  for (const [, obj] of ctx.enumerateIndirectObjects()) { count++; walk(obj, undefined, undefined, 0); }
  if (count > 8388607) say("more objects than PDF/A allows (8,388,607) (6.1.13-7)");
  if (overprint1 && iccCmyk) say("overprinting in overprint mode 1 together with ICC-based CMYK colour (6.2.4.2-2)");
  return { problems, fixed };
}

/** What PDF/A-2 doesn't allow in a JPEG 2000 picture (6.2.8.3): channels other than 1, 3 or 4; several colour
 *  specifications without exactly one marked as the approximation to use; a colour specification method other than
 *  1, 2 or 3; the CIEJab colour space (19); bit depths outside 1 to 38 or differing between channels. */
export function jpxProblems(b: Uint8Array): string[] {
  const out: string[] = [];
  const u32 = (i: number) => (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0, u16 = (i: number) => b[i] << 8 | b[i + 1];
  const tag = (i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  const depths = (list: number[]) => { if (list.some((d) => ((d & 0x7f) + 1) < 1 || ((d & 0x7f) + 1) > 38)) out.push("a JPEG 2000 picture with a bit depth outside 1 to 38 (6.2.8.3-5)"); if (new Set(list.map((d) => d & 0x7f)).size > 1) out.push("a JPEG 2000 picture whose channels have different bit depths (6.2.8.3-5)"); };
  const channels = (n: number) => { if (![1, 3, 4].includes(n)) out.push(`a JPEG 2000 picture with ${n} colour channels (PDF/A allows 1, 3 or 4) (6.2.8.3-1)`); };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0x4f) {   // a bare codestream: SOC, then SIZ
    if (u16(2) !== 0xff51) return ["a JPEG 2000 picture this tool can't read"];
    const c = u16(40); channels(c); depths(Array.from({ length: c }, (_, k) => b[42 + 3 * k])); return out;
  }
  if (tag(4) !== "jP  ") return ["a JPEG 2000 picture this tool can't read"];
  let ihdr: { nc: number; bpc: number } | undefined, bpcc: number[] | undefined; const colr: { meth: number; approx: number; enumcs?: number }[] = [];
  const boxes = (s: number, e: number, depth: number) => {
    for (let i = s; i + 8 <= e; ) {
      let len = u32(i), hdr = 8; const t = tag(i + 4);
      if (len === 1) { len = u32(i + 8) * 2 ** 32 + u32(i + 12); hdr = 16; } else if (len === 0) len = e - i;
      if (len < hdr || i + len > e) break;
      const d = i + hdr;
      if (t === "jp2h" && depth === 0) boxes(d, i + len, 1);
      if (t === "ihdr") ihdr = { nc: u16(d + 8), bpc: b[d + 10] };
      if (t === "bpcc") bpcc = [...b.subarray(d, i + len)];
      if (t === "colr") colr.push({ meth: b[d], approx: b[d + 2], ...(b[d] === 1 ? { enumcs: u32(d + 3) } : {}) });
      if (t === "jp2c") break;
      i += len;
    }
  };
  boxes(0, b.length, 0);
  if (!ihdr) return ["a JPEG 2000 picture this tool can't read"];
  channels(ihdr.nc);
  depths(ihdr.bpc === 255 ? bpcc ?? [-1] : Array(ihdr.nc).fill(ihdr.bpc));
  if (colr.length > 1 && colr.filter((c) => c.approx === 1).length !== 1) out.push("a JPEG 2000 picture with several colour specifications, none or more than one marked as the one to use (6.2.8.3-2)");
  const used = colr.length > 1 ? colr.find((c) => c.approx === 1) : colr[0];
  if (used && ![1, 2, 3].includes(used.meth)) out.push("a JPEG 2000 picture with a colour specification method PDF/A doesn't allow (6.2.8.3-3)");
  if (colr.some((c) => c.enumcs === 19)) out.push("a JPEG 2000 picture in the CIEJab colour space (6.2.8.3-4)");
  return out;
}
