// Browser-only: rewrites the pictures inside a PDF at lower detail (see compress-core.ts for the rules).
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFArray, PDFDict, PDFRef, decodePDFRawStream } from "@cantoo/pdf-lib";
import { unzlibSync } from "fflate";
import { canRecompress, estimateDpi, drawnDpi, sizeAt, unpredict, toRgba, greyInPlace, type CompressOptions, type CompressStats, type ImageInfo } from "./compress-core.ts";
import { tokens, streamBytes } from "./pdfascan.ts";
import { tidyStreams, prune } from "./tidy.ts";

const N = (s: string) => PDFName.of(s);
const num = (d: PDFDict, key: string, fallback: number) => { const v = d.lookup(N(key)); return v instanceof PDFNumber ? v.asNumber() : fallback; };
const nameOf = (v: unknown) => (v instanceof PDFName ? v.decodeText() : "");

function describe(doc: PDFDocument, s: PDFRawStream): ImageInfo {
  const d = s.dict, f = d.lookup(N("Filter"));
  const filters = f instanceof PDFArray ? f.asArray().map((x) => nameOf(doc.context.lookup(x))) : f ? [nameOf(f)] : [];
  let cs = d.lookup(N("ColorSpace")), colour: ImageInfo["colour"] = "other";
  if (cs instanceof PDFArray && nameOf(cs.lookup(0)) === "ICCBased") {            // a colour profile: go by its channel count
    const profile = cs.lookup(1);
    const n = profile instanceof PDFRawStream ? num(profile.dict, "N", 0) : 0;
    colour = n === 3 ? "rgb" : n === 1 ? "grey" : "other";
  } else {
    if (cs instanceof PDFArray) cs = cs.lookup(0);
    const n = nameOf(cs);
    colour = n === "DeviceRGB" || n === "CalRGB" ? "rgb" : n === "DeviceGray" || n === "CalGray" ? "grey" : "other";
  }
  // one DecodeParms per filter when there are several: a predictor in any of them counts
  const parms = d.lookup(N("DecodeParms"));
  const p = parms instanceof PDFDict ? parms : parms instanceof PDFArray ? parms.asArray().map((x) => doc.context.lookup(x)).find((x): x is PDFDict => x instanceof PDFDict && num(x, "Predictor", 1) !== 1) : undefined;
  return {
    width: num(d, "Width", 0), height: num(d, "Height", 0), bits: num(d, "BitsPerComponent", 0), filters, colour,
    hasMask: d.has(N("Mask")) || d.has(N("Decode")) || d.lookup(N("ImageMask"))?.toString() === "true",
    bytes: s.contents.length,
    predictor: p ? num(p, "Predictor", 1) : 1, colours: p ? num(p, "Colors", 1) : colour === "rgb" ? 3 : 1,
  };
}

/** The longest side, in points, of the largest page each picture appears on (directly, not inside nested drawings). */
function pageSizes(doc: PDFDocument): { byImage: Map<PDFRef, { w: number; h: number }>; largest: { w: number; h: number } } {
  const byImage = new Map<PDFRef, { w: number; h: number }>();
  let largest = { w: 1, h: 1 };
  for (const page of doc.getPages()) {
    const size = { w: page.getWidth(), h: page.getHeight() };
    if (Math.max(size.w, size.h) > Math.max(largest.w, largest.h)) largest = size;
    const x = page.node.Resources()?.lookup(N("XObject"));
    if (!(x instanceof PDFDict)) continue;
    for (const [, ref] of x.entries()) {
      if (!(ref instanceof PDFRef)) continue;
      const seen = byImage.get(ref);
      if (!seen || Math.max(size.w, size.h) > Math.max(seen.w, seen.h)) byImage.set(ref, size);
    }
  }
  return { byImage, largest };
}

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
/**
 * The detail each picture is drawn at, in dots per inch, found by following the drawing instructions of every page
 * (and the drawings they place) to where each picture is placed and at what size. A picture drawn more than once
 * keeps the most detail any of its uses needs. Pictures not found this way (inside patterns, comments or soft masks)
 * are left out; their detail is then estimated against the page.
 */
function drawnDetail(doc: PDFDocument): Map<string, number> {
  const ctx = doc.context, out = new Map<string, number>(), look = (o: unknown) => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const run = (data: Uint8Array | null, resources: PDFDict | undefined, base: M, depth: number, seen: Set<string>) => {
    if (!data) return;
    let m = base, nums: number[] = [], name = "";
    const stack: M[] = [];
    for (const t of tokens(data)) {
      if (t.k === "num") { nums.push(t.v); continue; }
      if (t.k === "name") { name = t.v; nums = []; continue; }
      if (t.k !== "op") { nums = []; continue; }
      if (t.v === "q") stack.push(m);
      else if (t.v === "Q") m = stack.pop() ?? base;
      else if (t.v === "cm" && nums.length >= 6) m = mul(nums.slice(-6) as M, m);
      else if (t.v === "Do") {
        const xo = look(resources?.lookup(N("XObject"))), ref = xo instanceof PDFDict ? xo.get(N(name)) : undefined, s = look(ref);
        if (ref instanceof PDFRef && s instanceof PDFRawStream) {
          const sub = s.dict.get(N("Subtype"));
          if (sub === N("Image")) {
            const w = Math.hypot(m[0], m[1]), h = Math.hypot(m[2], m[3]);
            if (w >= 0.5 && h >= 0.5) { const dpi = drawnDpi(num(s.dict, "Width", 0), num(s.dict, "Height", 0), w, h), k = ref.toString(); if (dpi > 0) out.set(k, Math.min(out.get(k) ?? Infinity, dpi)); }
          } else if (sub === N("Form") && depth < 12 && !seen.has(ref.toString())) {
            const mx = look(s.dict.get(N("Matrix"))), fm = mx instanceof PDFArray && mx.size() === 6 ? mx.asArray().map((x) => (look(x) instanceof PDFNumber ? (look(x) as PDFNumber).asNumber() : 0)) as M : [1, 0, 0, 1, 0, 0] as M;
            const own = look(s.dict.get(N("Resources")));
            seen.add(ref.toString()); run(streamBytes(s), own instanceof PDFDict ? own : resources, mul(fm, m), depth + 1, seen); seen.delete(ref.toString());
          }
        }
      }
      nums = [];
    }
  };
  for (const page of doc.getPages()) {
    try {
      const c = look(page.node.get(N("Contents"))), parts = c instanceof PDFArray ? c.asArray().map((x) => streamBytes(look(x) as PDFRawStream)) : [streamBytes(c as PDFRawStream)];
      const joined = parts.filter((p): p is Uint8Array => !!p);
      const all = new Uint8Array(joined.reduce((n, p) => n + p.length + 1, 0)); let o = 0; for (const p of joined) { all.set(p, o); o += p.length; all[o++] = 10; }
      run(all, page.node.Resources(), [1, 0, 0, 1, 0, 0], 0, new Set());
    } catch (e) { console.error(e); }
  }
  return out;
}

/** The bytes under the picture's own coding: wrappers (ASCII85 and the like) undone, the last `keep` filters not. */
function unwrap(s: PDFRawStream, info: ImageInfo, keep: number): Uint8Array {
  const strip = info.filters.slice(0, info.filters.length - keep);
  if (!strip.length) return s.contents;
  const dict = s.dict.clone(); dict.delete(N("DecodeParms"));
  dict.set(N("Filter"), s.dict.context.obj(strip));
  return decodePDFRawStream(PDFRawStream.of(dict, s.contents)).decode();
}

async function decode(s: PDFRawStream, info: ImageInfo, kind: "jpeg" | "flate" | "pixels"): Promise<CanvasImageSource> {
  if (kind === "jpeg") {
    // "none": ignore any camera orientation note, as PDF viewers do, so the pixels keep their stored layout.
    return createImageBitmap(new Blob([unwrap(s, info, 1) as BlobPart], { type: "image/jpeg" }), { imageOrientation: "none" });
  }
  const colours = info.colour === "rgb" ? 3 : 1;
  let px = kind === "pixels" ? unwrap(s, info, 0) : unzlibSync(s.contents);
  if (kind === "flate" && info.predictor >= 10) px = unpredict(px, info.width, colours);
  const c = document.createElement("canvas"); c.width = info.width; c.height = info.height;
  c.getContext("2d")!.putImageData(new ImageData(toRgba(px, info.width, info.height, colours) as Uint8ClampedArray<ArrayBuffer>, info.width, info.height), 0, 0);
  return c;
}

/**
 * Rewrites eligible pictures at most `opts.dpi` dots per inch (as drawn on the page) as JPEG of `opts.quality`,
 * keeping a rewritten picture only when it is smaller than the original, then tidies without loss. Page sizes, text
 * and drawings are untouched.
 */
export async function recompressImages(bytes: Uint8Array, opts: CompressOptions, progress?: (done: number, total: number) => void): Promise<{ bytes: Uint8Array; stats: CompressStats }> {
  const doc = await PDFDocument.load(bytes);
  const stats: CompressStats = { images: 0, changed: 0, skipped: {}, before: bytes.length, after: 0 };
  const skip = (why: string) => { stats.skipped[why] = (stats.skipped[why] ?? 0) + 1; };
  if (opts.mode === "images") {
    const { byImage, largest } = pageSizes(doc), drawn = drawnDetail(doc);
    const images = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.lookup(N("Subtype")) === N("Image")) as [PDFRef, PDFRawStream][];
    stats.images = images.length;
    for (const [i, [ref, stream]] of images.entries()) {
      progress?.(i, images.length);
      const info = describe(doc, stream), check = canRecompress(info);
      if (!check.ok) { skip(check.why); continue; }
      try {
        const page = byImage.get(ref) ?? largest;
        const t = sizeAt(info.width, info.height, drawn.get(ref.toString()) ?? estimateDpi(info.width, info.height, page.w, page.h), opts.dpi);
        const src = await decode(stream, info, check.kind);
        const c = document.createElement("canvas"); c.width = t.width; c.height = t.height;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, t.width, t.height);
        ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, t.width, t.height);
        if (opts.grey) { const d = ctx.getImageData(0, 0, t.width, t.height); greyInPlace(d.data); ctx.putImageData(d, 0, 0); }
        const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", opts.quality));
        if (!blob || blob.type !== "image/jpeg") { skip("couldn't be re-encoded by this browser"); continue; }
        const jpeg = new Uint8Array(await blob.arrayBuffer());
        if (jpeg.length >= stream.contents.length * 0.95) { skip("was already as small"); continue; }
        const fresh = doc.context.stream(jpeg, { Type: "XObject", Subtype: "Image", Width: t.width, Height: t.height, ColorSpace: "DeviceRGB", BitsPerComponent: 8, Filter: "DCTDecode" });
        const soft = stream.dict.get(N("SMask")); if (soft) fresh.dict.set(N("SMask"), soft);   // keep see-through areas
        doc.context.assign(ref, fresh);
        stats.changed++;
      } catch (e) { console.error(e); skip("couldn't be read"); }
    }
  }
  // lossless tidying, in every mode (an encrypted file is left as it is: its streams can't be read here)
  if (opts.mode !== "none" && !doc.context.trailerInfo.Encrypt) {
    const t = tidyStreams(doc), unused = prune(doc);
    stats.tidied = { ...t, unused };
  }
  const out = await doc.save({ useObjectStreams: true });
  stats.after = out.length;
  return { bytes: out, stats };
}
