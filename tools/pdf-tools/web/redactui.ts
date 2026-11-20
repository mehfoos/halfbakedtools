// Redact PDF: the browser side. Reads a page's text with positions (to find words), draws a page with its areas
// painted, turns that drawing into the picture saved in place of the page, and checks the saved file afterwards.
// The rules for what reaches the file are in redact.ts and build.ts.
import { drawPage, openPdf, closePdf, canvasBlob, type PdfHandle } from "./render.ts";
import { findQuads, quadToMark, mergeMarks, termPattern, variantPattern, leftovers, covered, type TextItem, type FontStyle, type RedactedPage } from "./redact.ts";
import { baseToView, type RedactMark, type Quarter } from "./marks.ts";
import { ocrScale, type OcrWord } from "./ocr.ts";

/** A page's text pieces with positions, its fonts' measures, and the conversion from PDF coordinates to the base view. */
async function pageText(h: PdfHandle, page: number) {
  const p = await h.doc.getPage(page + 1), vp = p.getViewport({ scale: 1, rotation: p.rotate }), c = await p.getTextContent();
  const items: TextItem[] = c.items.flatMap((i) => ("str" in i ? [{ str: i.str, transform: i.transform, width: i.width, height: i.height, dir: i.dir, fontName: i.fontName, hasEOL: i.hasEOL }] : []));
  return { items, styles: c.styles as Record<string, FontStyle & { fontFamily?: string }>, toView: (x: number, y: number) => vp.convertToViewportPoint(x, y) as [number, number] };
}

/** Relative widths of a piece's letters, measured in the browser's version of the piece's font family (PDF.js
 *  gives sans-serif, serif or monospace). Only the proportions matter. */
function measurer(styles: Record<string, { fontFamily?: string }>) {
  const ctx = document.createElement("canvas").getContext("2d")!;
  return (t: string, it: TextItem) => { ctx.font = `100px ${styles[it.fontName ?? ""]?.fontFamily ?? "sans-serif"}`; return ctx.measureText(t).width; };
}

/** Areas over every place `terms` occur on a page; `text` is false for a page with no text (a scan, say). */
export async function findAreas(h: PdfHandle, page: number, terms: string[], wholeWords: boolean): Promise<{ marks: RedactMark[]; text: boolean }> {
  const t = await pageText(h, page);
  if (!t.items.some((i) => i.str.trim())) return { marks: [], text: false };
  const found = findQuads(t.items, t.styles, terms, wholeWords, measurer(t.styles));
  return { marks: mergeMarks(found.flatMap((f) => f.quads.map((q) => quadToMark(q, t.toView, f.term)))), text: true };
}

/**
 * Before saving: places on a page where a searched term (`exact`), or a close variant of one (the words joined by
 * punctuation, such as an e-mail address), is not under an area. On a rebuilt page it would stay visible in the
 * picture, where the check after saving can't read it.
 */
export async function notCovered(h: PdfHandle, page: number, areas: RedactMark[], terms: string[], wholeWords: boolean): Promise<{ term: string; seen: string; exact: boolean }[]> {
  const t = await pageText(h, page); if (!t.items.some((i) => i.str.trim())) return [];
  const m = measurer(t.styles), out: { term: string; seen: string; exact: boolean }[] = [];
  const open = (found: ReturnType<typeof findQuads>, exact: boolean) => {
    for (const f of found) if (f.quads.some((q) => !covered(quadToMark(q, t.toView), areas))) out.push({ term: f.term, seen: f.seen, exact });
  };
  open(findQuads(t.items, t.styles, terms, wholeWords, m), true);
  open(findQuads(t.items, t.styles, terms, wholeWords, m, 0.35, 0.12, variantPattern).filter((f) => { const re = termPattern(f.term, wholeWords); return !(re && re.test(f.seen)); }), false);
  return out;
}

/**
 * Draws a page as the file shows it, turned by `turn`, at `pxPerPoint`, with its areas painted: "solid" black for
 * saving, "white" (just as solid) for text recognition, which misreads the edges of black boxes as letters, and
 * "see-through" on screen so the visitor can check what each area covers. Each area is widened to whole pixels
 * outwards, so a pixel it touches is painted completely.
 */
export async function paintedPage(h: PdfHandle, page: number, marks: RedactMark[], pxPerPoint: number, turn: Quarter, paint: "solid" | "white" | "see-through"): Promise<HTMLCanvasElement> {
  const canvas = await drawPage(h, page, turn, { pxPerPoint, pxPerImagePx: pxPerPoint });
  const p = await h.doc.getPage(page + 1), base = p.getViewport({ scale: 1, rotation: p.rotate });
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = paint === "solid" ? "#000" : paint === "white" ? "#fff" : "rgba(0, 0, 0, 0.55)";
  for (const m of marks) {
    const a = baseToView(m.x, m.y, base.width, base.height, turn), b = baseToView(m.x + m.w, m.y + m.h, base.width, base.height, turn);
    const x0 = Math.floor(Math.min(a.x, b.x) * pxPerPoint), y0 = Math.floor(Math.min(a.y, b.y) * pxPerPoint);
    const x1 = Math.ceil(Math.max(a.x, b.x) * pxPerPoint), y1 = Math.ceil(Math.max(a.y, b.y) * pxPerPoint);
    ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  }
  return canvas;
}

/**
 * The picture that replaces a page: drawn at `dpi` (less for a very large page), areas painted solid, stored as
 * PNG or JPEG (quality 0.9), whichever is smaller. `read`, if given, recognises the words on a separate drawing with
 * the areas painted white, at 300 dots per inch at least (as OCR PDF reads by default; fewer dots, or black boxes,
 * gave more misread words in our tests).
 */
export async function redactedPage(h: PdfHandle, page: number, marks: RedactMark[], dpi: number, read?: (c: HTMLCanvasElement) => Promise<OcrWord[][]>): Promise<RedactedPage> {
  const p = await h.doc.getPage(page + 1), base = p.getViewport({ scale: 1, rotation: p.rotate });
  const canvas = await paintedPage(h, page, marks, ocrScale(base.width, base.height, dpi), 0, "solid");
  try {
    let lines: OcrWord[][] | undefined, scale = canvas.width / base.width;
    if (read) {
      const plain = await paintedPage(h, page, marks, ocrScale(base.width, base.height, Math.max(dpi, 300)), 0, "white");
      try { lines = await read(plain); scale = plain.width / base.width; } finally { plain.width = plain.height = 0; }
    }
    const [png, jpg] = await Promise.all([canvasBlob(canvas, "image/png"), canvasBlob(canvas, "image/jpeg", 0.9)]);
    const pick = png.size <= jpg.size ? png : jpg;
    // the page keeps the size it had; `scale` is that of the drawing the words were read from (their pixel positions)
    return { image: new Uint8Array(await pick.arrayBuffer()), png: pick === png, width: base.width, height: base.height, scale, ...(lines ? { lines } : {}) };
  } finally { canvas.width = canvas.height = 0; }
}

/**
 * Checks a saved file for the searched terms: its text read by PDF.js page by page, and every object scanned
 * (redact.ts leftovers). Returns the pages where the text still contains a term, where else a term was found, and
 * close variants still in the text (the words joined by punctuation: "jane.doe" for "jane doe"), with what was seen.
 */
export async function checkSaved(bytes: Uint8Array, vendor: string, terms: string[], wholeWords: boolean): Promise<{ pages: { term: string; page: number }[]; objects: { term: string; where: string }[]; variants: { term: string; page: number; seen: string }[] }> {
  const pages: { term: string; page: number }[] = [], variants: { term: string; page: number; seen: string }[] = [];
  if (terms.length) {
    const doc = await openPdf(bytes, vendor);
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const c = await (await doc.getPage(i)).getTextContent();
        const text = c.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? " " : "") : "")).join("");
        for (const term of terms) {
          const re = termPattern(term, wholeWords); if (re && re.test(text)) { pages.push({ term, page: i }); continue; }
          const loose = variantPattern(term), seen = loose ? text.match(loose) : null;
          if (seen) variants.push({ term, page: i, seen: seen[0] });
        }
      }
    } finally { closePdf(doc); }
  }
  return { pages, objects: terms.length ? await leftovers(bytes, terms, wholeWords) : [], variants };
}
