// How a picture is placed on its page when pictures are turned into a PDF. Pure; no DOM.
// A picture is never enlarged (it would only get blurrier); it is shrunk if it doesn't fit inside the margins.
import { CROP_UNITS, type CropUnit } from "./crop.ts";

export type ImageLayout = {
  size: "picture" | "custom";            // "picture": the page is the picture plus its margin; "custom": a page size you give
  width: number; height: number;         // custom page size in points (as typed: the shorter or longer side may go either way, see orientation)
  orientation: "auto" | "portrait" | "landscape";   // custom size only: auto follows the picture's own shape
  margin: number;                        // points, on every side
  unit: CropUnit;                        // only how the numbers are shown
};
export const NO_IMAGE_LAYOUT: ImageLayout = { size: "picture", width: 595, height: 842, orientation: "auto", margin: 0, unit: "mm" };
export const PAGE_MIN = 36, PAGE_MAX = 14400;   // custom page sides: half an inch to 200 inches (the usual limit of PDF viewers)
export const MARGIN_MAX = 2000;
const MIN_BOX = 10;

/** `iw`, `ih`: the picture's size in points as stored; `turn`: degrees the page is turned to show it upright (0/90/180/270).
 *  Returns the page and the picture in the page's own (unturned) coordinates, picture centred. */
export function imageLayout(iw: number, ih: number, turn: number, o: ImageLayout): { pageW: number; pageH: number; x: number; y: number; w: number; h: number } {
  const sideways = turn % 180 !== 0, vw = sideways ? ih : iw, vh = sideways ? iw : ih;
  let m = Math.max(0, o.margin), PW: number, PH: number;
  if (o.size === "picture") { PW = vw + 2 * m; PH = vh + 2 * m; }
  else {
    PW = Math.min(PAGE_MAX, Math.max(PAGE_MIN, o.width)); PH = Math.min(PAGE_MAX, Math.max(PAGE_MIN, o.height));
    const landscape = o.orientation === "auto" ? vw > vh : o.orientation === "landscape";
    if (landscape !== PW > PH && PW !== PH) [PW, PH] = [PH, PW];
    m = Math.min(m, Math.max(0, (Math.min(PW, PH) - MIN_BOX) / 2));
  }
  const s = Math.min(1, (PW - 2 * m) / vw, (PH - 2 * m) / vh);
  const dw = iw * s, dh = ih * s, pageW = sideways ? PH : PW, pageH = sideways ? PW : PH;
  return { pageW, pageH, x: (pageW - dw) / 2, y: (pageH - dh) / 2, w: dw, h: dh };
}

const real = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
export function cleanImageLayout(v: unknown): ImageLayout {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>, d = NO_IMAGE_LAYOUT;
  return {
    size: o.size === "custom" ? "custom" : "picture",
    width: real(o.width, PAGE_MIN, PAGE_MAX) ? o.width : d.width, height: real(o.height, PAGE_MIN, PAGE_MAX) ? o.height : d.height,
    orientation: (["auto", "portrait", "landscape"] as const).find((x) => x === o.orientation) ?? d.orientation,
    margin: real(o.margin, 0, MARGIN_MAX) ? o.margin : d.margin,
    unit: CROP_UNITS.find((u) => u === o.unit) ?? d.unit,
  };
}
