// Browser-only: opens PDFs and images for display, and draws pages onto a canvas.
// Uses PDF.js (Mozilla's PDF reader, the one built into Firefox), bundled with this site.
import * as pdfjs from "pdfjs-dist";
import workerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";
import type { Rotation } from "./session.ts";
import { piecesToText, type TextPiece } from "./text.ts";

// PDF.js reads files in a background worker. A worker started from a web address is NOT bound by the page's
// security policy (csp.ts), but one started from code held inside the page is. So the worker's code is bundled
// as text and started from memory: the browser then applies the page's policy to it, and it cannot contact
// another site. privacy.test.ts fails if this is changed back.
const worker = new Worker(URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" })), { type: "module" });
pdfjs.GlobalWorkerOptions.workerPort = worker;

export type PdfHandle = { kind: "pdf"; doc: pdfjs.PDFDocumentProxy };
/** `turn` = degrees the stored pixels are turned in the PDF because of a photo's orientation note. `img` is already upright. */
export type ImageHandle = { kind: "image"; img: ImageBitmap | HTMLImageElement; width: number; height: number; turn: Rotation };
export type Handle = PdfHandle | ImageHandle;

export class NeedsPassword extends Error { wrong: boolean; constructor(wrong: boolean) { super("password"); this.wrong = wrong; } }

/** `vendor` is the address of the PDF.js support files served by this site (fonts, character maps, decoders). */
export async function openPdf(bytes: Uint8Array, vendorPath: string, password?: string): Promise<pdfjs.PDFDocumentProxy> {
  const vendor = new URL(vendorPath, location.href).href;   // full address: the in-memory worker has no folder of its own
  try {
    return await pdfjs.getDocument({
      data: bytes.slice(),                    // PDF.js takes ownership of the bytes it is given, so hand it a copy
      password,
      cMapUrl: `${vendor}cmaps/`, cMapPacked: true,
      standardFontDataUrl: `${vendor}standard_fonts/`,
      wasmUrl: `${vendor}wasm/`, iccUrl: `${vendor}iccs/`,
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    if (e instanceof Error && e.name === "PasswordException") throw new NeedsPassword(password !== undefined);
    throw e;
  }
}

/** Size of a page in PDF points (1/72 inch) as it will be seen, including the file's own rotation, before the visitor's edits. */
export async function pageSize(h: Handle, page: number, imageDpi: number): Promise<{ w: number; h: number }> {
  if (h.kind === "image") return { w: (h.width * 72) / imageDpi, h: (h.height * 72) / imageDpi };
  const vp = (await h.doc.getPage(page + 1)).getViewport({ scale: 1 });
  return { w: vp.width, h: vp.height };
}

export const MAX_PIXELS = 50_000_000;

/**
 * Draws a page. `pxPerPoint` is the zoom for PDF pages; for images `pxPerImagePx` is used instead.
 * `rotate` is the visitor's extra clockwise rotation.
 */
export async function drawPage(h: Handle, page: number, rotate: Rotation, zoom: { pxPerPoint: number; pxPerImagePx: number }): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  if (h.kind === "pdf") {
    const p = await h.doc.getPage(page + 1);
    const viewport = p.getViewport({ scale: zoom.pxPerPoint, rotation: (p.rotate + rotate) % 360 });
    canvas.width = Math.max(1, Math.round(viewport.width)); canvas.height = Math.max(1, Math.round(viewport.height));
    if (canvas.width * canvas.height > MAX_PIXELS) throw new Error("That would make an image too large for the browser. Choose fewer dots per inch.");
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvas, canvasContext: ctx, viewport }).promise;
    return canvas;
  }
  const w = Math.max(1, Math.round(h.width * zoom.pxPerImagePx)), ht = Math.max(1, Math.round(h.height * zoom.pxPerImagePx));
  const side = rotate === 90 || rotate === 270;
  canvas.width = side ? ht : w; canvas.height = side ? w : ht;
  if (canvas.width * canvas.height > MAX_PIXELS) throw new Error("That would make an image too large for the browser. Choose fewer dots per inch.");
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(h.img, -w / 2, -ht / 2, w, ht);
  return canvas;
}

/** The text of a page, or "" if it has none (an image, or a scan that hasn't been through text recognition). */
export async function pageText(h: Handle, page: number): Promise<string> {
  if (h.kind === "image") return "";
  const content = await (await h.doc.getPage(page + 1)).getTextContent();
  return piecesToText(content.items.filter((i): i is typeof i & TextPiece => "str" in i));
}

/** Opens an image file the browser can decode itself (PNG, JPEG, WebP, GIF, BMP, SVG...). */
export async function decodeImage(blob: Blob): Promise<{ img: HTMLImageElement; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("no size");
    return { img, width: img.naturalWidth, height: img.naturalHeight };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}

export const canvasBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((ok, fail) => c.toBlob((b) => (b && b.type === type ? ok(b) : fail(new Error(`This browser can't write ${type.replace("image/", "").toUpperCase()} images.`))), type, quality));
