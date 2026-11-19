// The text-recognition engine (Tesseract, compiled to WebAssembly), loaded only when OCR is used. Every file it needs
// (its background worker, the engine and the English language data) is served by this site from vendor/tesseract/;
// the library's own defaults point at another site, so each one is set here. The worker is started from code held
// inside the page, so the page's security policy applies to it too. Nothing is stored in the browser (cacheMethod "none").
import type { OcrWord } from "./ocr.ts";

export type Recogniser = { read: (image: HTMLCanvasElement) => Promise<OcrWord[]>; stop: () => Promise<void> };

export async function startRecogniser(base: string, progress: (share: number) => void): Promise<Recogniser> {
  const { createWorker, OEM } = await import("tesseract.js");
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`, corePath: `${base}core/`, langPath: `${base}lang/`,
    cacheMethod: "none", gzip: true, workerBlobURL: true,
    logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") progress(m.progress); },
  });
  return {
    async read(image) {
      const { data } = await worker.recognize(image, {}, { blocks: true, text: false });
      const words: OcrWord[] = [];
      for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) if (w.text.trim()) words.push({ text: w.text, box: w.bbox, confidence: w.confidence });
      return words;
    },
    stop: async () => { await worker.terminate(); },
  };
}
