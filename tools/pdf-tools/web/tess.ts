// The text-recognition engine (Tesseract, compiled to WebAssembly), loaded only when OCR is used. Every file it needs
// (its background worker, the engine and the language data for each language offered) is served by this site from vendor/tesseract/;
// the library's own defaults point at another site, so each one is set here. The worker is started from code held
// inside the page, so the page's security policy applies to it too. Nothing is stored in the browser (cacheMethod "none").
import type { OcrWord } from "./ocr.ts";

export type Recogniser = { read: (image: HTMLCanvasElement) => Promise<OcrWord[][]>; stop: () => Promise<void> };

export async function startRecogniser(base: string, langs: string[], progress: (share: number) => void): Promise<Recogniser> {
  const { createWorker, OEM } = await import("tesseract.js");
  const worker = await createWorker(langs, OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`, corePath: `${base}core/`, langPath: `${base}lang/`,
    cacheMethod: "none", gzip: true, workerBlobURL: true,
    logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") progress(m.progress); },
  });
  return {
    async read(image) {
      const { data } = await worker.recognize(image, {}, { blocks: true, text: false });
      // Each word takes its line's top and bottom, so all words of a line share one baseline (readers then keep
      // them on one line); its left and right edges are its own.
      const lines: OcrWord[][] = [];
      for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines)
        lines.push(l.words.filter((w) => w.text.trim()).map((w) => ({ text: w.text, box: { x0: w.bbox.x0, x1: w.bbox.x1, y0: l.bbox.y0, y1: l.bbox.y1 }, confidence: w.confidence })));
      return lines;
    },
    stop: async () => { await worker.terminate(); },
  };
}
