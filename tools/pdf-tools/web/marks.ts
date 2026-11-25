// Things the visitor adds on top of a page: text and pictures ("marks"). Pure; no DOM.
//
// A mark's position is stored in points (1/72 inch) from the top-left corner of the page as the file shows it
// (the "base" view: the page's own rotation applied, but not any turn or resizing made in this tool). So a mark
// turns and resizes with its page. Two conversions are needed: base view <-> the PDF's own coordinates, which
// start at the bottom-left of the unrotated page (for saving), and base view <-> the turned view on screen.

import { wrapText } from "./textpdf.ts";

export type FontKey = "sans" | "serif" | "mono" | "noto" | "own";   // "noto": the shipped Noto Sans fonts (noto.ts); "own": a font file the visitor chose (ownfont.ts)
export const FONT_KEYS: FontKey[] = ["sans", "serif", "mono", "noto", "own"];
/** x, y: top-left corner. rotate: degrees clockwise about that corner. */
/** Added text. With `w` it sits in a box that wide and wraps to it; `h` is the box's height (the text may run below it).
 *  Without `w` it has no box: lines break only where the text has line breaks. */
export type TextMark = { type: "text"; x: number; y: number; rotate: number; text: string; size: number; color: string; font: FontKey; bold: boolean; opacity?: number; w?: number; h?: number; align?: Align };
/** How lines sit across a text's box (or, without a box, across its widest line). Absent means left. */
export type Align = "left" | "center" | "right";
/** src: id of an image source in the session. w, h: size on the page in points. */
/** An added picture. `stretch`: its corner square changes width and height separately (otherwise it keeps the shape). */
export type ImageMark = { type: "image"; x: number; y: number; rotate: number; w: number; h: number; src: string; opacity?: number; stretch?: boolean };
/** A rectangle, ellipse or straight line in the box x, y, w, h. `fill` is "" for none; `width` is the outline's thickness in
 *  points (0 = no outline). A line runs from the box's top-left to bottom-right corner, or from bottom-left to top-right when `flip`. */
export type ShapeMark = { type: "shape"; shape: "rect" | "ellipse" | "line"; x: number; y: number; rotate: number; w: number; h: number; color: string; fill: string; width: number; flip?: boolean; opacity?: number };
/** A freehand line: each stroke is a flat list u1, v1, u2, v2, ... with every number from 0 to 1, as a share of the box x, y, w, h. */
export type InkMark = { type: "ink"; x: number; y: number; rotate: number; w: number; h: number; strokes: number[][]; color: string; width: number; opacity?: number };
/** An area to remove (Redact PDF): x, y, w, h in the base view, never turned (`rotate` is always 0). `term`: the
 *  searched text that placed it, if any. A page with any of these is rebuilt from a picture of itself (redact.ts). */
export type RedactMark = { type: "redact"; x: number; y: number; rotate: 0; w: number; h: number; term?: string };
/** `opacity`: 1 or absent = solid; lower lets the page show through. */
export type Mark = TextMark | ImageMark | ShapeMark | InkMark | RedactMark;
export const WIDTH_MAX = 100;
export const STROKES_MAX = 200, STROKE_NUMBERS_MAX = 20000;

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

/** The reverse of toUser: a point in PDF user space -> the page as shown (y downwards from its top-left). */
export function toView(ux: number, uy: number, box: Box, rotation: Quarter): { x: number; y: number } {
  const W = box.width, H = box.height, x = ux - box.x, y = uy - box.y;
  return rotation === 0 ? { x, y: H - y } : rotation === 90 ? { x: y, y: x } : rotation === 180 ? { x: W - x, y } : { x: H - y, y: W - x };
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

/** Width and height of a text mark's box, its lines (wrapped to the box's width if it has one), how far below the
 *  top of a line its baseline sits, and whether the lines run below a box of set height. */
export function textBox(m: TextMark, font: Measurer): { w: number; h: number; ascent: number; lines: string[]; over: boolean } {
  const lines = m.w ? wrapText(m.text, (s) => font.widthOfTextAtSize(s, m.size), m.w) : m.text.split("\n");
  const tall = lines.length * m.size * LINE_HEIGHT;
  return {
    w: m.w ?? Math.max(1, ...lines.map((l) => font.widthOfTextAtSize(l, m.size))),
    h: m.h ?? tall, ascent: font.heightAtSize(m.size, { descender: false }), lines, over: m.h !== undefined && tall > m.h + 0.01,
  };
}

/** Where to draw each line of a text mark in the PDF's own coordinates. `rotation` is the page's own rotation;
 *  `angle` is anticlockwise degrees. */
export function placeText(m: TextMark, font: Measurer, box: Box, rotation: Quarter): { lines: { text: string; x: number; y: number }[]; angle: number } {
  const t = textBox(m, font);
  return {
    angle: rotation - m.rotate,
    lines: t.lines.map((text, i) => {
      const k = m.align === "center" ? 0.5 : m.align === "right" ? 1 : 0, dx = k ? (t.w - font.widthOfTextAtSize(text, m.size)) * k : 0;
      const o = turn(dx, t.ascent + i * m.size * LINE_HEIGHT, m.rotate);   // start of this line's baseline, as displayed
      return { text, ...toUser(m.x + o.dx, m.y + o.dy, box, rotation) };
    }),
  };
}

/** Where to draw a picture mark: PDF pictures are placed by their bottom-left corner. */
export function placeImage(m: ImageMark, box: Box, rotation: Quarter): { x: number; y: number; width: number; height: number; angle: number } {
  const o = turn(0, m.h, m.rotate);
  return { ...toUser(m.x + o.dx, m.y + o.dy, box, rotation), width: m.w, height: m.h, angle: rotation - m.rotate };
}

/** Where to draw a shape or freehand line: the box's top-left corner in the PDF's own coordinates (the origin for an
 *  SVG-style path, drawn downwards) and the anticlockwise angle. */
export function placeBox(m: { x: number; y: number; rotate: number }, box: Box, rotation: Quarter): { x: number; y: number; angle: number } {
  return { ...toUser(m.x, m.y, box, rotation), angle: rotation - m.rotate };
}

const KAPPA = 0.5522847498;   // control-point distance that makes four cubic curves a circle
const n2 = (v: number) => String(Math.round(v * 1000) / 1000);
/** The shape as an SVG path in the box's own coordinates (from its top-left corner, y downwards, in points). */
export function shapePath(m: ShapeMark | InkMark): string {
  const { w, h } = m;
  if (m.type === "ink") {
    return m.strokes.map((st) => {
      const pts: string[] = [];
      for (let i = 0; i + 1 < st.length; i += 2) pts.push(`${n2(st[i] * w)} ${n2(st[i + 1] * h)}`);
      if (pts.length === 1) pts.push(`${n2(st[0] * w + 0.01)} ${n2(st[1] * h)}`);   // a tap: a dot, drawn with round caps
      return pts.length ? `M ${pts.join(" L ")}` : "";
    }).join(" ");
  }
  if (m.shape === "rect") return `M 0 0 L ${n2(w)} 0 L ${n2(w)} ${n2(h)} L 0 ${n2(h)} Z`;
  if (m.shape === "line") return m.flip ? `M 0 ${n2(h)} L ${n2(w)} 0` : `M 0 0 L ${n2(w)} ${n2(h)}`;
  const cx = w / 2, cy = h / 2, kx = cx * KAPPA, ky = cy * KAPPA;
  return `M 0 ${n2(cy)} C 0 ${n2(cy - ky)} ${n2(cx - kx)} 0 ${n2(cx)} 0 C ${n2(cx + kx)} 0 ${n2(w)} ${n2(cy - ky)} ${n2(w)} ${n2(cy)} C ${n2(w)} ${n2(cy + ky)} ${n2(cx + kx)} ${n2(h)} ${n2(cx)} ${n2(h)} C ${n2(cx - kx)} ${n2(h)} 0 ${n2(cy + ky)} 0 ${n2(cy)} Z`;
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
      || !FONT_KEYS.includes(m.font as FontKey) || typeof m.bold !== "boolean") return null;
    if (m.w !== undefined && !finite(m.w, 1, FAR)) return null;
    if (m.h !== undefined && (m.w === undefined || !finite(m.h, 1, FAR))) return null;
    const box = m.w === undefined ? {} : { w: m.w as number, ...(m.h === undefined ? {} : { h: m.h as number }) };
    if (m.align !== undefined && m.align !== "left" && m.align !== "center" && m.align !== "right") return null;
    if (m.align === "center" || m.align === "right") Object.assign(box, { align: m.align });
    return { type: "text", x: m.x, y: m.y, rotate: m.rotate, text: m.text, size: m.size, color: m.color, font: m.font as FontKey, bold: m.bold, ...see, ...box };
  }
  if (m.type === "image") {
    if (!finite(m.w, 1, FAR) || !finite(m.h, 1, FAR) || typeof m.src !== "string" || !isImageSource(m.src) || (m.stretch !== undefined && typeof m.stretch !== "boolean")) return null;
    return { type: "image", x: m.x, y: m.y, rotate: m.rotate, w: m.w, h: m.h, src: m.src, ...see, ...(m.stretch ? { stretch: true } : {}) };
  }
  const hex = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
  if (m.type === "shape") {
    if ((m.shape !== "rect" && m.shape !== "ellipse" && m.shape !== "line") || !finite(m.w, 0, FAR) || !finite(m.h, 0, FAR) || !hex(m.color)
      || !(m.fill === "" || hex(m.fill)) || !finite(m.width, 0, WIDTH_MAX) || (m.flip !== undefined && typeof m.flip !== "boolean")) return null;
    return { type: "shape", shape: m.shape, x: m.x, y: m.y, rotate: m.rotate, w: m.w, h: m.h, color: m.color, fill: m.fill as string, width: m.width, ...(m.flip ? { flip: true } : {}), ...see };
  }
  if (m.type === "redact") {
    if (m.rotate !== 0 || !finite(m.w, 0.5, FAR) || !finite(m.h, 0.5, FAR) || (m.term !== undefined && (typeof m.term !== "string" || m.term.length > 500))) return null;
    return { type: "redact", x: m.x, y: m.y, rotate: 0, w: m.w, h: m.h, ...(m.term ? { term: m.term } : {}) };
  }
  if (m.type === "ink") {
    if (!finite(m.w, 0, FAR) || !finite(m.h, 0, FAR) || !hex(m.color) || !finite(m.width, 0.1, WIDTH_MAX)) return null;
    if (!Array.isArray(m.strokes) || m.strokes.length > STROKES_MAX) return null;
    const strokes: number[][] = [];
    for (const st of m.strokes) {
      if (!Array.isArray(st) || st.length % 2 || st.length > STROKE_NUMBERS_MAX || !st.every((n) => finite(n, 0, 1))) return null;
      strokes.push(st as number[]);
    }
    return { type: "ink", x: m.x, y: m.y, rotate: m.rotate, w: m.w, h: m.h, strokes, color: m.color, width: m.width, ...see };
  }
  return null;
}
