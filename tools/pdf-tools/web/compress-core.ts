// The arithmetic behind "Compress PDF". Pure; no DOM, so it is tested in Node.
// Compressing means: find the pictures stored inside the PDF, shrink the ones holding more detail than asked
// for, and store them again as JPEG. Text and line drawings are left exactly as they are.

export type CompressMode = "none" | "tidy" | "images" | "flatten";
/** `dpi`: most dots per inch a picture may keep. `quality`: JPEG quality 0.1-1. `grey`: drop colour. */
export type CompressOptions = { mode: CompressMode; dpi: number; quality: number; grey: boolean };
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
 * A picture's detail, in dots per inch, estimated as if it filled the page: its longer side in pixels over the
 * page's longer side in inches (a PDF point is 1/72 inch). A picture drawn smaller than the page really has more
 * dots per inch than this, so the estimate errs towards shrinking too little, never too much.
 */
export function estimateDpi(width: number, height: number, pageW: number, pageH: number): number {
  return Math.max(width, height) / (Math.max(pageW, pageH) / 72);
}

/** The pixel size to store a picture at so it keeps at most `maxDpi`. Never enlarges. */
export function targetSize(width: number, height: number, pageW: number, pageH: number, maxDpi: number): { width: number; height: number; scale: number } {
  const scale = Math.min(1, maxDpi / estimateDpi(width, height, pageW, pageH));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
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

/** Whether this tool can safely rewrite the picture, and if not, why. Anything unusual is left untouched. */
export function canRecompress(i: ImageInfo): { ok: true; kind: "jpeg" | "flate" } | { ok: false; why: string } {
  if (i.hasMask) return { ok: false, why: "has a mask or special colour mapping" };
  if (i.colour === "other") return { ok: false, why: "uses a colour system other than plain colour or grey" };
  if (i.bits !== 8) return { ok: false, why: `uses ${i.bits} bits per colour` };
  if (i.width * i.height < 64 * 64 || i.bytes < 8_000) return { ok: false, why: "is too small to be worth it" };
  if (i.width * i.height > 50_000_000) return { ok: false, why: "is too large for the browser to redraw" };
  if (i.filters.length === 1 && i.filters[0] === "DCTDecode") return { ok: true, kind: "jpeg" };
  if (i.filters.length === 1 && i.filters[0] === "FlateDecode") {
    if (i.predictor !== 1 && i.predictor < 10) return { ok: false, why: "uses an unsupported packing method" };
    if (i.colours !== (i.colour === "rgb" ? 3 : 1)) return { ok: false, why: "has an unexpected number of colour channels" };
    return { ok: true, kind: "flate" };
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

export type CompressStats = { images: number; changed: number; skipped: Record<string, number>; before: number; after: number };

/** "1.2 MB -> 300 kB (75% smaller)" style percentage, never claiming a saving that isn't there. */
export function saving(before: number, after: number): number {
  return before > 0 && after < before ? Math.round((1 - after / before) * 100) : 0;
}
