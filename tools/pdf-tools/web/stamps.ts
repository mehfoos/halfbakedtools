// Things applied to every page when saving: page numbers (and, later, a watermark). Pure; no DOM.
// A stamp is worked out for each page as that page will finally be seen (turned and resized), and is then
// drawn like any other added text (marks.ts).
import { LINE_HEIGHT, SIZE_MIN, SIZE_MAX, type FontKey, type Measurer, type TextMark } from "./marks.ts";

export type Corner = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
export const CORNERS: Corner[] = ["bottom-center", "bottom-right", "bottom-left", "top-center", "top-right", "top-left"];
export type NumberStyle = "n" | "n-of-total" | "page-n" | "page-n-of-total";
export const NUMBER_STYLES: NumberStyle[] = ["n", "n-of-total", "page-n", "page-n-of-total"];

export type NumberOptions = {
  on: boolean;
  position: Corner;
  style: NumberStyle;
  start: number;     // the number printed on the first numbered page
  from: number;      // the first page to carry a number (1 = the first page; 2 skips a cover page)
  size: number;      // text size in points
  margin: number;    // distance from the page edges in points
  font: FontKey; bold: boolean; color: string;
};
export const NO_NUMBERS: NumberOptions = { on: false, position: "bottom-center", style: "n", start: 1, from: 1, size: 11, margin: 28, font: "sans", bold: false, color: "#000000" };
export const MARGIN_MAX = 400, COUNT_MAX = 1_000_000;

/** The text for the page at `index` (from 0) of `total` pages, or null if that page comes before the first numbered one. */
export function numberText(o: NumberOptions, index: number, total: number): string | null {
  if (index < o.from - 1) return null;
  const n = o.start + index - (o.from - 1), last = o.start + total - o.from;
  return o.style === "n" ? `${n}` : o.style === "n-of-total" ? `${n} / ${last}` : o.style === "page-n" ? `Page ${n}` : `Page ${n} of ${last}`;
}

/** The number as a piece of added text, placed on a page of size `view` (points, as finally seen). */
export function numberMark(o: NumberOptions, index: number, total: number, view: { w: number; h: number }, font: Measurer): TextMark | null {
  const text = o.on ? numberText(o, index, total) : null;
  if (text === null) return null;
  const width = font.widthOfTextAtSize(text, o.size), height = o.size * LINE_HEIGHT;
  const [v, h] = o.position.split("-");
  const x = h === "left" ? o.margin : h === "right" ? view.w - o.margin - width : (view.w - width) / 2;
  const y = v === "top" ? o.margin : view.h - o.margin - height;
  return { type: "text", x, y, rotate: 0, text, size: o.size, color: o.color, font: o.font, bold: o.bold };
}

const whole = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const real = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/** Number options read from a settings file; anything missing or out of range falls back to the default. */
export function cleanNumbers(v: unknown): NumberOptions {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>, d = NO_NUMBERS;
  return {
    on: o.on === true,
    position: CORNERS.find((c) => c === o.position) ?? d.position,
    style: NUMBER_STYLES.find((s) => s === o.style) ?? d.style,
    start: whole(o.start, 0, COUNT_MAX) ? o.start : d.start,
    from: whole(o.from, 1, COUNT_MAX) ? o.from : d.from,
    size: real(o.size, SIZE_MIN, SIZE_MAX) ? o.size : d.size,
    margin: real(o.margin, 0, MARGIN_MAX) ? o.margin : d.margin,
    font: (["sans", "serif", "mono"] as const).find((f) => f === o.font) ?? d.font,
    bold: o.bold === true,
    color: typeof o.color === "string" && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : d.color,
  };
}
