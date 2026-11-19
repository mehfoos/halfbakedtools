// Crop: hide the margins of pages. Pure; no DOM.
// Margins are measured in points (1/72 inch) inward from each edge of the page as the file shows it, before any
// turn or resize made in this tool. Cropping sets the page's visible area (its "crop box"); what lies outside it
// stays in the file, hidden, so this is not a way to remove content (that would be redaction).
import { toUser, visibleSize, type Box, type Quarter } from "./marks.ts";
import { parsePageList } from "./ranges.ts";

export type Margins = { top: number; right: number; bottom: number; left: number };
export type CropUnit = "mm" | "in" | "pt";
export const CROP_UNITS: CropUnit[] = ["mm", "in", "pt"];
export type CropOptions = Margins & {
  unit: CropUnit;        // only how the numbers are shown and typed; margins are stored in points
  pages: string;         // which pages, as page-range text ("1-3, 8-"); empty = every page
};
export const NO_CROP: CropOptions = { top: 0, right: 0, bottom: 0, left: 0, unit: "mm", pages: "" };

/** Points in one unit. An inch is exactly 25.4 mm and 72 points. */
export const POINTS_PER: Record<CropUnit, number> = { mm: 72 / 25.4, in: 72, pt: 1 };
export const toPoints = (value: number, unit: CropUnit): number => value * POINTS_PER[unit];
export const fromPoints = (points: number, unit: CropUnit): number => points / POINTS_PER[unit];

/** The least page width and height left visible (a quarter of an inch), so a mistyped margin can't make a blank page. */
export const MIN_VISIBLE = 18;
export const MARGIN_LIMIT = 20000;

export const isCropped = (o: Margins): boolean => o.top > 0 || o.right > 0 || o.bottom > 0 || o.left > 0;

/** Margins shrunk (both sides of an axis together, keeping their proportion) so that at least MIN_VISIBLE is left. */
export function clampMargins(size: { w: number; h: number }, m: Margins): Margins {
  const fit = (a: number, b: number, whole: number): [number, number] => {
    a = Math.max(0, a); b = Math.max(0, b);
    const room = Math.max(0, whole - MIN_VISIBLE);
    return a + b > room ? (a + b ? [(a * room) / (a + b), (b * room) / (a + b)] : [0, 0]) : [a, b];
  };
  const [left, right] = fit(m.left, m.right, size.w), [top, bottom] = fit(m.top, m.bottom, size.h);
  return { top, right, bottom, left };
}

/** The crop box (in the PDF's own coordinates) that leaves the page, as displayed at `rotation`, with these margins cut off. */
export function cropBoxFor(box: Box, rotation: Quarter, margins: Margins): Box {
  const size = visibleSize(box, rotation), m = clampMargins(size, margins);
  const a = toUser(m.left, m.top, box, rotation), b = toUser(size.w - m.right, size.h - m.bottom, box, rotation);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** Margins from a rectangle (displayed coordinates, from the top-left) kept on a page of this size. */
export function marginsFromRect(size: { w: number; h: number }, r: { x: number; y: number; w: number; h: number }): Margins {
  return clampMargins(size, { left: r.x, top: r.y, right: size.w - (r.x + r.w), bottom: size.h - (r.y + r.h) });
}

/** Whether the page at `position` (0-based) of `total` is cropped. Throws if the page list can't be read. */
export function appliesTo(o: CropOptions, position: number, total: number): boolean {
  if (!o.pages.trim()) return true;
  const r = parsePageList(o.pages, total);
  if (!r.ok) throw new Error(r.error);
  return r.pages.includes(position);
}

const real = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
/** Crop options read from a settings file; anything missing or out of range falls back to the default. */
export function cleanCrop(v: unknown): CropOptions {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>, d = NO_CROP;
  return {
    top: real(o.top, 0, MARGIN_LIMIT) ? o.top : d.top, right: real(o.right, 0, MARGIN_LIMIT) ? o.right : d.right,
    bottom: real(o.bottom, 0, MARGIN_LIMIT) ? o.bottom : d.bottom, left: real(o.left, 0, MARGIN_LIMIT) ? o.left : d.left,
    unit: CROP_UNITS.find((u) => u === o.unit) ?? d.unit,
    pages: typeof o.pages === "string" && o.pages.length <= 500 ? o.pages : d.pages,
  };
}
