/**
 * OCR PDF: adds an invisible text layer over each page so the words in a scan can be searched, selected and copied.
 * The page itself is not changed: its picture stays exactly as it was, and the recognised words are drawn on top
 * in "invisible" text (PDF text rendering mode 3), each word stretched to cover the box where the engine found it.
 * The recognition itself (Tesseract, in ui.ts) can make mistakes; nothing here checks the words.
 */
import { PDFPage, PDFFont, PDFName, beginText, endText, setFontAndSize, setTextRenderingMode, setTextMatrix, showText, TextRenderingMode, pushGraphicsState, popGraphicsState } from "@cantoo/pdf-lib";

export type Box = { x0: number; y0: number; x1: number; y1: number };   // pixels on the drawn page, top-left origin
export type OcrWord = { text: string; box: Box; confidence?: number };   // confidence: the engine's own 0-100 score
export type Pt = [number, number];
export const OCR_DPIS = [200, 300, 400] as const;
export const OCR_MAX_PIXELS = 30_000_000;   // a page drawn bigger than this is drawn at a lower resolution instead

/** Resolution to draw a page at: the chosen one, lowered if the page would otherwise be too many pixels. */
export function ocrScale(widthPt: number, heightPt: number, dpi: number): number {
  const s = dpi / 72, px = widthPt * s * heightPt * s;
  return px > OCR_MAX_PIXELS ? s * Math.sqrt(OCR_MAX_PIXELS / px) : s;
}

/** Keeps the characters the font can draw; others are tried in their compatibility form (ﬁ → fi), else dropped. */
export function drawableText(text: string, has: Set<number>): { text: string; dropped: number } {
  let out = "", dropped = 0;
  for (const ch of text) {
    if (has.has(ch.codePointAt(0)!)) { out += ch; continue; }
    const alt = ch.normalize("NFKC");
    if (alt !== ch && [...alt].every((c) => has.has(c.codePointAt(0)!))) out += alt; else dropped++;
  }
  return { text: out, dropped };
}

/**
 * The text matrix that makes `widthAt1` units of text (its width at font size 1) fill `box`, with the font's
 * full height (ascent to descent) spanning the box's height. `toPdf` turns page pixels into PDF points, and
 * handles turned and cropped pages, so the result is right whatever way the page is stored.
 */
export function wordMatrix(box: Box, widthAt1: number, ascentAt1: number, descentAt1: number, toPdf: (x: number, y: number) => Pt): [number, number, number, number, number, number] {
  const em = (box.y1 - box.y0) / (ascentAt1 + descentAt1);   // font size, in pixels
  const yb = box.y1 - descentAt1 * em;                          // baseline
  const B = toPdf(box.x0, yb), R = toPdf(box.x1, yb), U = toPdf(box.x0, yb - em);
  return [(R[0] - B[0]) / widthAt1, (R[1] - B[1]) / widthAt1, U[0] - B[0], U[1] - B[1], B[0], B[1]];
}

/** Below this average of the engine's own word scores (0 to 100), a page is reported as doubtful. In tests, clear
 *  upright scans scored 95 and more; the same page shown sideways scored 37. */
export const LOW_CONFIDENCE = 50;
export const meanConfidence = (words: OcrWord[]): number | null => {
  const s = words.filter((w) => typeof w.confidence === "number"); return s.length ? s.reduce((n, w) => n + w.confidence!, 0) / s.length : null;
};

/** Draws the words invisibly on the page. Returns how many were drawn and how many characters were dropped. */
export function addTextLayer(page: PDFPage, font: PDFFont, words: OcrWord[], toPdf: (x: number, y: number) => Pt): { words: number; dropped: number } {
  const has = new Set(font.getCharacterSet()), key: PDFName = page.node.newFontDictionary(font.name, font.ref);
  const ascent = font.heightAtSize(1, { descender: false }), descent = font.heightAtSize(1, { descender: true }) - ascent;
  const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible), setFontAndSize(key, 1)];
  let n = 0, dropped = 0;
  for (const w of words) {
    const t = drawableText(w.text.trim(), has); dropped += t.dropped;
    const width = t.text ? font.widthOfTextAtSize(t.text, 1) : 0;
    if (!width || w.box.x1 <= w.box.x0 || w.box.y1 <= w.box.y0) continue;
    ops.push(setTextMatrix(...wordMatrix(w.box, width, ascent, descent, toPdf)), showText(font.encodeText(t.text)));
    n++;
  }
  ops.push(endText(), popGraphicsState());
  if (n) page.pushOperators(...ops);
  return { words: n, dropped };
}
