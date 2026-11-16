// Browser-only: rewrites the pictures inside a PDF at lower detail (see compress-core.ts for the rules).
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFArray, PDFDict, PDFRef } from "@cantoo/pdf-lib";
import { unzlibSync } from "fflate";
import { canRecompress, targetSize, unpredict, toRgba, greyInPlace, type CompressOptions, type CompressStats, type ImageInfo } from "./compress-core.ts";

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
  const parms = d.lookup(N("DecodeParms"));
  const p = parms instanceof PDFDict ? parms : undefined;
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

async function decode(s: PDFRawStream, info: ImageInfo, kind: "jpeg" | "flate"): Promise<CanvasImageSource> {
  if (kind === "jpeg") {
    // "none": ignore any camera orientation note, as PDF viewers do, so the pixels keep their stored layout.
    return createImageBitmap(new Blob([s.contents as BlobPart], { type: "image/jpeg" }), { imageOrientation: "none" });
  }
  const colours = info.colour === "rgb" ? 3 : 1;
  let px = unzlibSync(s.contents);
  if (info.predictor >= 10) px = unpredict(px, info.width, colours);
  const c = document.createElement("canvas"); c.width = info.width; c.height = info.height;
  c.getContext("2d")!.putImageData(new ImageData(toRgba(px, info.width, info.height, colours) as Uint8ClampedArray<ArrayBuffer>, info.width, info.height), 0, 0);
  return c;
}

/**
 * Rewrites eligible pictures at most `opts.dpi` dots per inch as JPEG of `opts.quality`, keeping a rewritten
 * picture only when it is smaller than the original. Page sizes, text and drawings are untouched.
 */
export async function recompressImages(bytes: Uint8Array, opts: CompressOptions, progress?: (done: number, total: number) => void): Promise<{ bytes: Uint8Array; stats: CompressStats }> {
  const doc = await PDFDocument.load(bytes);
  const stats: CompressStats = { images: 0, changed: 0, skipped: {}, before: bytes.length, after: 0 };
  const skip = (why: string) => { stats.skipped[why] = (stats.skipped[why] ?? 0) + 1; };
  if (opts.mode === "images") {
    const { byImage, largest } = pageSizes(doc);
    const images = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.lookup(N("Subtype")) === N("Image")) as [PDFRef, PDFRawStream][];
    stats.images = images.length;
    for (const [i, [ref, stream]] of images.entries()) {
      progress?.(i, images.length);
      const info = describe(doc, stream), check = canRecompress(info);
      if (!check.ok) { skip(check.why); continue; }
      try {
        const page = byImage.get(ref) ?? largest;
        const t = targetSize(info.width, info.height, page.w, page.h, opts.dpi);
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
  const out = await doc.save({ useObjectStreams: true });
  stats.after = out.length;
  return { bytes: out, stats };
}
