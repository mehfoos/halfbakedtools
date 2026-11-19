/**
 * OCR PDF: adds an invisible text layer over each page so the words in a scan can be searched, selected and copied.
 * The page itself is not changed: its picture stays exactly as it was, and the recognised words are drawn on top
 * in "invisible" text (PDF text rendering mode 3), each word stretched to cover the box where the engine found it.
 * The font is our own glyph-less one (glyphless.ts), so every script works and no typeface is copied.
 * The recognition itself (Tesseract, in ui.ts) can make mistakes; nothing here checks the words.
 */
import { PDFHexString, PDFPage, PDFRef, beginText, endText, setFontAndSize, setTextRenderingMode, setTextMatrix, showText, TextRenderingMode, pushGraphicsState, popGraphicsState } from "@cantoo/pdf-lib";
import { GLYPHLESS, encodeWord } from "./glyphless.ts";

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

export const isRtl = (text: string): boolean => /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u.test(text);
/** Scripts written without spaces between words: the engine reports their characters as separate "words". */
const NO_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}ー々〆]/u;

/**
 * Prepares one line of recognised words for the text layer, so PDF readers extract it as it reads:
 *  - neighbouring words in scripts written without spaces (Chinese, Japanese, Thai, ...) are joined when the gap
 *    between them is under a line's height, so copied text has no stray spaces and searches find whole phrases;
 *  - a line containing right-to-left text (Arabic, Urdu, Persian, Hebrew) is stored in visual order, left to right,
 *    with the characters of right-to-left words reversed. This is how word processors store such text, and what PDF
 *    readers expect: they reverse it back into reading order when the text is extracted.
 */
export function arrangeLine(line: OcrWord[]): OcrWord[] {
  const out: OcrWord[] = [];
  for (const w of line) {
    const prev = out[out.length - 1], t = w.text.trim(); if (!t) continue;
    const h = Math.max(1, w.box.y1 - w.box.y0);
    if (prev && NO_SPACES.test([...prev.text].pop()!) && NO_SPACES.test([...t][0]) && Math.abs(w.box.x0 - prev.box.x1) < h) {
      prev.text += t; prev.box = { x0: Math.min(prev.box.x0, w.box.x0), y0: Math.min(prev.box.y0, w.box.y0), x1: Math.max(prev.box.x1, w.box.x1), y1: Math.max(prev.box.y1, w.box.y1) };
      if (prev.confidence !== undefined && w.confidence !== undefined) prev.confidence = Math.min(prev.confidence, w.confidence);
    } else out.push({ ...w, text: t, box: { ...w.box } });
  }
  if (!out.some((w) => isRtl(w.text))) return out;
  return out.sort((a, b) => a.box.x0 - b.box.x0).map((w) => (isRtl(w.text) ? { ...w, text: [...w.text].reverse().join("") } : w));
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

/** Draws the recognised lines invisibly in the glyph-less font `font` (added once per document with addGlyphlessFont).
 *  Returns how many words were drawn and how many characters had to be left out. */
export function addTextLayer(page: PDFPage, font: PDFRef, lines: OcrWord[][], toPdf: (x: number, y: number) => Pt): { words: number; dropped: number } {
  const words = lines.flatMap(arrangeLine);
  const key = page.node.newFontDictionary("HBTOcr", font);
  const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible), setFontAndSize(key, 1)];
  let n = 0, dropped = 0;
  for (const w of words) {
    const t = encodeWord(w.text.trim()); dropped += t.dropped;
    if (!t.count || w.box.x1 <= w.box.x0 || w.box.y1 <= w.box.y0) continue;
    ops.push(setTextMatrix(...wordMatrix(w.box, t.count * GLYPHLESS.advance, GLYPHLESS.ascent, GLYPHLESS.descent, toPdf)), showText(PDFHexString.of(t.hex)));
    n++;
  }
  ops.push(endText(), popGraphicsState());
  if (n) page.pushOperators(...ops);
  return { words: n, dropped };
}
