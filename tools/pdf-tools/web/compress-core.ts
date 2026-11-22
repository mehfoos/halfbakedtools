// The arithmetic behind "Compress PDF". Pure; no DOM, so it is tested in Node.
// Compressing means: find the pictures stored inside the PDF, shrink the ones holding more detail than asked
// for, and store them again as JPEG. Text and line drawings are left exactly as they are. Every mode also tidies
// without loss (page thumbnails, uncompressed streams, unused objects: see compress.ts).

export type CompressMode = "none" | "tidy" | "images" | "flatten" | "target";
/** `dpi`: most dots per inch a picture may keep. `quality`: JPEG quality 0.1-1. `grey`: drop colour. `target`: for
 *  mode "target", the size in bytes each file should end up at or under (0: not chosen yet). */
export type CompressOptions = { mode: CompressMode; dpi: number; quality: number; grey: boolean; target?: number };
export const NO_COMPRESSION: CompressOptions = { mode: "none", dpi: 150, quality: 0.65, grey: false };

/** Ready-made settings. These are this tool's own choices, not taken from a standard. */
export const PRESETS: Record<"light" | "recommended" | "strong" | "extreme" | "maximum", CompressOptions> = {
  light: { mode: "images", dpi: 200, quality: 0.8, grey: false },
  recommended: { mode: "images", dpi: 150, quality: 0.65, grey: false },
  strong: { mode: "images", dpi: 100, quality: 0.5, grey: false },
  extreme: { mode: "images", dpi: 72, quality: 0.3, grey: false },      // pictures get visibly rough; text is untouched
  maximum: { mode: "flatten", dpi: 72, quality: 0.3, grey: false },     // whole pages become rough pictures; text is lost
};

/**
 * Settings at a strength from 0 (mildest) to 1 (strongest), for compressing to a chosen size: dots per inch fall
 * evenly on a log scale from 400 to 50, and quality evenly from 92% to 25%. This tool's own choice, like the presets;
 * the mild end keeps print quality, so a limit near the file's own size is met with little loss, and the strong end
 * sits beyond "Extreme".
 */
export function ladder(t: number): { dpi: number; quality: number } {
  const s = Math.min(1, Math.max(0, t));
  return { dpi: Math.round(400 * (50 / 400) ** s), quality: Math.round((0.92 - 0.67 * s) * 100) / 100 };
}

/** The size offered before the visitor chooses one: about half the file, rounded down to two significant figures
 *  in kB or MB (1 kB = 1,000 bytes, 1 MB = 1,000,000), and at least 10 kB. */
export function defaultTarget(bytes: number): number {
  const half = bytes / 2, unit = half >= 1e6 ? 1e6 : 1e3, v = half / unit;
  if (!(v > 0)) return 10_000;
  const step = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Math.max(10_000, Math.round(Math.floor(v / step + 1e-9) * step * unit));
}

/**
 * Compressing to a size: tries settings and keeps the mildest one found whose file is at or under `target`. First
 * without touching the pictures (`"lossless"`); then the strongest setting (1), to know whether the size can be
 * reached at all; then the mildest (0); then in between, guessing the next strength from the sizes on either side
 * (on a log scale, as picture sizes shrink roughly in proportion). It stops when a result is within 5% under the
 * target, when the strengths on either side are closer than 1/50, or after `maxTries`. Results whose size didn't
 * shrink with strength (it can happen) are still compared: the largest one that fits wins.
 */
export async function fitToSize<R extends { size: number }>(target: number, tryAt: (t: number | "lossless") => Promise<R>, maxTries = 8):
    Promise<{ best?: R; bestT?: number | "lossless"; smallest: R; tries: number }> {
  let tries = 0, best: R | undefined, bestT: number | "lossless" | undefined, smallest: R | undefined;
  const run = async (t: number | "lossless") => {
    const r = await tryAt(t); tries++;
    if (!smallest || r.size < smallest.size) smallest = r;
    if (r.size <= target && (!best || r.size > best.size)) { best = r; bestT = t; }
    return r;
  };
  if ((await run("lossless")).size <= target) return { best, bestT, smallest: smallest!, tries };
  const hard = await run(1);
  if (hard.size > target) return { best, bestT, smallest: smallest!, tries };
  const soft = await run(0);
  if (soft.size <= target) return { best, bestT, smallest: smallest!, tries };
  let lo = { t: 0, size: soft.size }, hi = { t: 1, size: hard.size };   // lo too big, hi fits
  while (tries < maxTries && hi.t - lo.t > 0.02 && best!.size < target * 0.95) {
    const k = (Math.log(lo.size) - Math.log(target * 0.975)) / (Math.log(lo.size) - Math.log(hi.size));
    const t = lo.t + (hi.t - lo.t) * Math.min(0.85, Math.max(0.15, Number.isFinite(k) ? k : 0.5));
    const r = await run(t);
    if (r.size <= target) hi = { t, size: r.size }; else lo = { t, size: r.size };
  }
  return { best, bestT, smallest: smallest!, tries };
}

/**
 * A picture's detail, in dots per inch, from the size it is drawn at on the page (in points, 1/72 inch): the lower
 * of its detail across and down, so a squashed picture keeps enough detail in both directions.
 */
export function drawnDpi(width: number, height: number, drawnW: number, drawnH: number): number {
  return Math.min(width / (drawnW / 72), height / (drawnH / 72));
}

/**
 * A picture's detail, in dots per inch, estimated as if it filled the page (used when where it is drawn isn't
 * known, as for pictures inside patterns or comments): its longer side in pixels over the
 * page's longer side in inches (a PDF point is 1/72 inch). A picture drawn smaller than the page really has more
 * dots per inch than this, so the estimate errs towards shrinking too little, never too much.
 */
export function estimateDpi(width: number, height: number, pageW: number, pageH: number): number {
  return Math.max(width, height) / (Math.max(pageW, pageH) / 72);
}

/** The pixel size to store a picture at so it keeps at most `maxDpi`, given its detail now. Never enlarges. */
export function sizeAt(width: number, height: number, dpi: number, maxDpi: number): { width: number; height: number; scale: number } {
  const scale = Math.min(1, maxDpi / dpi);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}
/** As `sizeAt`, with the detail estimated against the page. */
export function targetSize(width: number, height: number, pageW: number, pageH: number, maxDpi: number): { width: number; height: number; scale: number } {
  return sizeAt(width, height, estimateDpi(width, height, pageW, pageH), maxDpi);
}

/** What the PDF says about a stored picture. */
export type ImageInfo = {
  width: number; height: number; bits: number;
  filters: string[];                 // e.g. ["DCTDecode"] for JPEG, ["FlateDecode"] for losslessly packed pixels
  colour: "rgb" | "grey" | "other";  // "other" = CMYK, indexed palettes, spot colours...
  hasMask: boolean;                  // a colour-key mask, a stencil, or a Decode array
  bytes: number;                     // stored size
  predictor: number; colours: number;
};

/** Filters that only pack bytes (text encodings and general compression), which can be undone before the picture's
 *  own coding. Some programs (ReportLab, for one) wrap JPEG pictures in ASCII85 text this way. */
export const WRAPPERS = new Set(["ASCII85Decode", "ASCIIHexDecode", "FlateDecode", "LZWDecode", "RunLengthDecode"]);

/** Whether this tool can safely rewrite the picture, and if not, why. Anything unusual is left untouched.
 *  `jpeg`: a JPEG, possibly wrapped; `flate`: pixels packed with Flate, possibly with row prediction; `pixels`:
 *  pixels stored plainly or packed with other wrappers, without prediction. */
export function canRecompress(i: ImageInfo): { ok: true; kind: "jpeg" | "flate" | "pixels" } | { ok: false; why: string } {
  if (i.hasMask) return { ok: false, why: "has a mask or special colour mapping" };
  if (i.colour === "other") return { ok: false, why: "uses a colour system other than plain colour or grey" };
  if (i.bits !== 8) return { ok: false, why: `uses ${i.bits} bits per colour` };
  if (i.width * i.height < 64 * 64 || i.bytes < 8_000) return { ok: false, why: "is too small to be worth it" };
  if (i.width * i.height > 50_000_000) return { ok: false, why: "is too large for the browser to redraw" };
  const last = i.filters[i.filters.length - 1];
  if (last === "DCTDecode" && i.filters.slice(0, -1).every((f) => WRAPPERS.has(f))) {
    if (i.filters.length > 1 && i.predictor !== 1) return { ok: false, why: "uses an unsupported packing method" };
    return { ok: true, kind: "jpeg" };
  }
  if (i.filters.length === 1 && i.filters[0] === "FlateDecode") {
    if (i.predictor !== 1 && i.predictor < 10) return { ok: false, why: "uses an unsupported packing method" };
    if (i.colours !== (i.colour === "rgb" ? 3 : 1)) return { ok: false, why: "has an unexpected number of colour channels" };
    return { ok: true, kind: "flate" };
  }
  if (i.filters.every((f) => WRAPPERS.has(f))) {   // plain, or several wrappers
    if (i.predictor !== 1) return { ok: false, why: "uses an unsupported packing method" };
    if (i.colours !== (i.colour === "rgb" ? 3 : 1)) return { ok: false, why: "has an unexpected number of colour channels" };
    return { ok: true, kind: "pixels" };
  }
  return { ok: false, why: `is stored as ${i.filters.join("+") || "raw data"}, which is left alone` };
}

/**
 * Undoes PNG-style row prediction (PDF predictors 10-15) on 8-bit data: each row starts with a byte saying how
 * its values were stored relative to their neighbours. Returns the plain pixel bytes.
 */
export function unpredict(data: Uint8Array, columns: number, colours: number): Uint8Array {
  const stride = columns * colours, rows = Math.floor(data.length / (stride + 1));
  const out = new Uint8Array(rows * stride);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (stride + 1)], src = r * (stride + 1) + 1, dst = r * stride;
    for (let x = 0; x < stride; x++) {
      const raw = data[src + x];
      const a = x >= colours ? out[dst + x - colours] : 0;            // left
      const b = r > 0 ? out[dst + x - stride] : 0;                    // above
      const c = r > 0 && x >= colours ? out[dst + x - stride - colours] : 0; // above-left
      let v: number;
      if (type === 0) v = raw;
      else if (type === 1) v = raw + a;
      else if (type === 2) v = raw + b;
      else if (type === 3) v = raw + ((a + b) >> 1);
      else if (type === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      else throw new Error(`Unknown row filter ${type}`);
      out[dst + x] = v & 255;
    }
  }
  return out;
}

/** Plain 8-bit grey or RGB pixel bytes -> RGBA, as a canvas wants them. */
export function toRgba(pixels: Uint8Array, width: number, height: number, colours: 1 | 3): Uint8ClampedArray {
  if (pixels.length < width * height * colours) throw new Error("Picture data is shorter than its stated size.");
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, o = 0, n = width * height; i < n; i++, o += 4) {
    if (colours === 1) out[o] = out[o + 1] = out[o + 2] = pixels[i];
    else { out[o] = pixels[i * 3]; out[o + 1] = pixels[i * 3 + 1]; out[o + 2] = pixels[i * 3 + 2]; }
    out[o + 3] = 255;
  }
  return out;
}

/** Turns RGBA pixels grey in place, weighting green most and blue least (weights 0.299, 0.587, 0.114: a widely
 *  used set; their source is not yet archived, see VERIFICATION.md). */
export function greyInPlace(rgba: Uint8ClampedArray): void {
  for (let o = 0; o < rgba.length; o += 4) rgba[o] = rgba[o + 1] = rgba[o + 2] = Math.round(0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]);
}

export type CompressStats = { images: number; changed: number; skipped: Record<string, number>; before: number; after: number;
  tidied?: { thumbnails: number; streams: number; unused: number } };

/** "1.2 MB -> 300 kB (75% smaller)" style percentage, never claiming a saving that isn't there. */
export function saving(before: number, after: number): number {
  return before > 0 && after < before ? Math.floor((1 - after / before) * 100) : 0;   // rounded down: never overstated
}
