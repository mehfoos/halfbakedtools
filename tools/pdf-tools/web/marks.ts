// Things the visitor adds on top of a page: text and pictures ("marks"). Pure; no DOM.
//
// A mark's position is stored in points (1/72 inch) from the top-left corner of the page as the file shows it
// (the "base" view: the page's own rotation applied, but not any turn or resizing made in this tool). So a mark
// turns and resizes with its page. Two conversions are needed: base view <-> the PDF's own coordinates, which
// start at the bottom-left of the unrotated page (for saving), and base view <-> the turned view on screen.

export type FontKey = "sans" | "serif" | "mono";
/** x, y: top-left corner. rotate: degrees clockwise about that corner. */
export type TextMark = { type: "text"; x: number; y: number; rotate: number; text: string; size: number; color: string; font: FontKey; bold: boolean; opacity?: number };
/** src: id of an image source in the session. w, h: size on the page in points. */
export type ImageMark = { type: "image"; x: number; y: number; rotate: number; w: number; h: number; src: string; opacity?: number };
/** `opacity`: 1 or absent = solid; lower lets the page show through. */
export type Mark = TextMark | ImageMark;

/** The two font measurements needed to lay text out (pdf-lib's fonts provide them). */
export type Measurer = { widthOfTextAtSize(text: string, size: number): number; heightAtSize(size: number, options?: { descender?: boolean }): number };
/** The part of the page that is displayed (its crop box), in the PDF's own coordinates. */
export type Box = { x: number; y: number; width: number; height: number };
export type Quarter = 0 | 90 | 180 | 270;

export const LINE_HEIGHT = 1.2;   // line spacing as a multiple of the text size (this tool's choice)
export const SIZE_MIN = 4, SIZE_MAX = 400;

/** Size of the page as displayed, given its box and total clockwise rotation. */
export const visibleSize = (box: Box, rotation: Quarter) => (rotation % 180 ? { w: box.height, h: box.width } : { w: box.width, h: box.height });

/** A point as displayed (from the top-left, y downwards) -> the PDF's own coordinates. */
export function toUser(vx: number, vy: number, box: Box, rotation: Quarter): { x: number; y: number } {
  const W = box.width, H = box.height;
  const p = rotation === 0 ? { x: vx, y: H - vy } : rotation === 90 ? { x: vy, y: vx } : rotation === 180 ? { x: W - vx, y: vy } : { x: W - vy, y: H - vx };
  return { x: box.x + p.x, y: box.y + p.y };
}

/** A point in the base view -> the same point after the page is turned clockwise by `turned` (base size w x h). */
export function baseToView(x: number, y: number, w: number, h: number, turned: Quarter): { x: number; y: number } {
  return turned === 0 ? { x, y } : turned === 90 ? { x: h - y, y: x } : turned === 180 ? { x: w - x, y: h - y } : { x: y, y: w - x };
}
/** The reverse of baseToView. */
export function viewToBase(x: number, y: number, w: number, h: number, turned: Quarter): { x: number; y: number } {
  return turned === 0 ? { x, y } : turned === 90 ? { x: y, y: h - x } : turned === 180 ? { x: w - x, y: h - y } : { x: w - y, y: x };
}

/** Turns an offset clockwise as displayed (y downwards) by `deg` degrees. */
export function turn(dx: number, dy: number, deg: number): { dx: number; dy: number } {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { dx: dx * c - dy * s, dy: dx * s + dy * c };
}

/** Width and height of a text mark's box, its lines, and how far below the top of a line its baseline sits. */
export function textBox(m: TextMark, font: Measurer): { w: number; h: number; ascent: number; lines: string[] } {
  const lines = m.text.split("\n");
  return {
    w: Math.max(1, ...lines.map((l) => font.widthOfTextAtSize(l, m.size))),
    h: lines.length * m.size * LINE_HEIGHT, ascent: font.heightAtSize(m.size, { descender: false }), lines,
  };
}

/** Where to draw each line of a text mark in the PDF's own coordinates. `rotation` is the page's own rotation;
 *  `angle` is anticlockwise degrees. */
export function placeText(m: TextMark, font: Measurer, box: Box, rotation: Quarter): { lines: { text: string; x: number; y: number }[]; angle: number } {
  const t = textBox(m, font);
  return {
    angle: rotation - m.rotate,
    lines: t.lines.map((text, i) => {
      const o = turn(0, t.ascent + i * m.size * LINE_HEIGHT, m.rotate);   // start of this line's baseline, as displayed
      return { text, ...toUser(m.x + o.dx, m.y + o.dy, box, rotation) };
    }),
  };
}

/** Where to draw a picture mark: PDF pictures are placed by their bottom-left corner. */
export function placeImage(m: ImageMark, box: Box, rotation: Quarter): { x: number; y: number; width: number; height: number; angle: number } {
  const o = turn(0, m.h, m.rotate);
  return { ...toUser(m.x + o.dx, m.y + o.dy, box, rotation), width: m.w, height: m.h, angle: rotation - m.rotate };
}

/** "#rrggbb" -> red, green, blue from 0 to 1. Anything else is black. */
export function parseColor(hex: string): { r: number; g: number; b: number } {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 } : { r: 0, g: 0, b: 0 };
}

/** Characters in `text` that a font can't draw (`charset` = the code points it has). Line breaks are fine. */
export function unsupported(text: string, charset: Set<number>): string[] {
  return [...new Set([...text].filter((ch) => ch !== "\n" && !charset.has(ch.codePointAt(0)!)))];
}

const finite = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const FAR = 20000;   // generous bounds for positions and sizes, in points

/** Checks a mark read from a settings file; returns a clean copy, or null if it is damaged. */
export function cleanMark(v: unknown, isImageSource: (id: string) => boolean): Mark | null {
  if (typeof v !== "object" || v === null) return null;
  const m = v as Record<string, unknown>;
  if (!finite(m.x, -FAR, FAR) || !finite(m.y, -FAR, FAR) || !finite(m.rotate, -360, 360)) return null;
  if (m.opacity !== undefined && !finite(m.opacity, 0.01, 1)) return null;
  const see = m.opacity === undefined || m.opacity === 1 ? {} : { opacity: m.opacity };
  if (m.type === "text") {
    if (typeof m.text !== "string" || m.text.length > 20000 || !finite(m.size, SIZE_MIN, SIZE_MAX) || typeof m.color !== "string" || !/^#[0-9a-f]{6}$/i.test(m.color)
      || (m.font !== "sans" && m.font !== "serif" && m.font !== "mono") || typeof m.bold !== "boolean") return null;
    return { type: "text", x: m.x, y: m.y, rotate: m.rotate, text: m.text, size: m.size, color: m.color, font: m.font, bold: m.bold, ...see };
  }
  if (m.type === "image") {
    if (!finite(m.w, 1, FAR) || !finite(m.h, 1, FAR) || typeof m.src !== "string" || !isImageSource(m.src)) return null;
    return { type: "image", x: m.x, y: m.y, rotate: m.rotate, w: m.w, h: m.h, src: m.src, ...see };
  }
  return null;
}
