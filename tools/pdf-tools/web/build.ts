// Writes the output PDF(s) from the session's page list. No DOM, so it runs in tests as well as in the browser.
// Pages are copied from the source files as they are (text stays text, images are not re-compressed);
// only the page order, rotation and size change.
import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import type { PageItem, Rotation } from "./session.ts";

export type SourceData =
  | { kind: "pdf"; bytes: Uint8Array; password?: string }
  /** `turn`: degrees clockwise the stored pixels must be turned to look right (a photo's orientation note). */
  | { kind: "image"; bytes: Uint8Array; type: "png" | "jpeg"; turn?: Rotation };

export type BuildOptions = { imageDpi: number };

/** Opens each source once, so several output files (a split) can share it. */
export function makeBuilder(data: Map<string, SourceData>, opts: BuildOptions) {
  const open = new Map<string, Promise<PDFDocument>>();
  const source = (id: string) => {
    const d = data.get(id);
    if (!d || d.kind !== "pdf") throw new Error(`Source ${id} isn't loaded.`);
    let doc = open.get(id);
    if (!doc) open.set(id, (doc = PDFDocument.load(d.bytes, d.password === undefined ? {} : { password: d.password })));
    return doc;
  };

  return async function build(pages: PageItem[]): Promise<Uint8Array> {
    if (!pages.length) throw new Error("There are no pages to save.");
    const out = await PDFDocument.create();

    // Copy each source's pages in as few batches as possible so shared fonts and images are stored once.
    // A page used twice goes in a second batch: one batch returns the same copy for a repeated page.
    const copies = new Map<PageItem, Awaited<ReturnType<PDFDocument["copyPages"]>>[number]>();
    const bySource = new Map<string, PageItem[]>();
    for (const p of pages) {
      const d = data.get(p.src);
      if (!d) throw new Error("A source file for some pages hasn't been added yet.");
      if (d.kind === "pdf") bySource.set(p.src, [...(bySource.get(p.src) ?? []), p]);
    }
    for (const [id, items] of bySource) {
      const doc = await source(id);
      let rest = items;
      while (rest.length) {
        const batch: PageItem[] = [], later: PageItem[] = [], seen = new Set<number>();
        for (const p of rest) (seen.has(p.page) ? later : (seen.add(p.page), batch)).push(p);
        const copied = await out.copyPages(doc, batch.map((p) => p.page));
        batch.forEach((p, i) => copies.set(p, copied[i]));
        rest = later;
      }
    }

    const embedded = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
    for (const p of pages) {
      const d = data.get(p.src)!;
      let page;
      if (d.kind === "pdf") page = out.addPage(copies.get(p)!);
      else {
        let img = embedded.get(p.src);
        if (!img) embedded.set(p.src, (img = d.type === "png" ? await out.embedPng(d.bytes) : await out.embedJpg(d.bytes)));
        const w = (img.width * 72) / opts.imageDpi, h = (img.height * 72) / opts.imageDpi; // PDF units are 1/72 inch
        page = out.addPage([w, h]);
        page.drawImage(img, { x: 0, y: 0, width: w, height: h });
      }
      const turn = p.rotate + (d.kind === "image" ? d.turn ?? 0 : 0);
      if (turn) page.setRotation(degrees((page.getRotation().angle + turn) % 360));
      if (p.scale !== 1) page.scale(p.scale, p.scale);
    }
    return out.save();
  };
}

/** Page count of a PDF; throws if it can't be opened. `needsPassword` errors are reported by name. */
export async function inspectPdf(bytes: Uint8Array, password?: string): Promise<{ pages: number }> {
  const doc = await PDFDocument.load(bytes, password === undefined ? {} : { password });
  return { pages: doc.getPageCount() };
}
