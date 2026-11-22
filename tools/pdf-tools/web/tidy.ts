// Lossless tidying of a PDF before it is saved: nothing a reader sees changes. Used by Compress PDF (every mode) and,
// for `prune`, by PDF to PDF/A.
import { PDFDocument, PDFDict, PDFArray, PDFRef, PDFStream, PDFRawStream, PDFName, type PDFObject } from "@cantoo/pdf-lib";
import { zlibSync } from "fflate";

/** Deletes every object the saved file would not reach from its trailer (earlier versions of changed objects, removed
 *  attachments and scripts), so nothing removed stays in the file. Returns how many were deleted. */
export function prune(doc: PDFDocument): number {
  const ctx = doc.context, reached = new Set<string>();
  const visit = (o: PDFObject | undefined): void => {
    const stack: (PDFObject | undefined)[] = [o];
    while (stack.length) {
      const x = stack.pop();
      if (x instanceof PDFRef) { const k = x.toString(); if (reached.has(k)) continue; reached.add(k); stack.push(ctx.lookup(x)); }
      else if (x instanceof PDFDict) for (const [, v] of x.entries()) stack.push(v);
      else if (x instanceof PDFArray) stack.push(...x.asArray());
      else if (x instanceof PDFStream) stack.push(x.dict);
    }
  };
  const t = ctx.trailerInfo; visit(t.Root); visit(t.Info as PDFObject); visit(t.ID as PDFObject); visit(t.Encrypt as PDFObject);
  let n = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!reached.has(ref.toString())) { ctx.delete(ref); n++; }
  return n;
}

/**
 * Removes page thumbnails (small previews some programs store; viewers draw their own) and compresses, with Flate,
 * streams stored without any compression (when that saves at least a tenth). Returns how many of each.
 */
export function tidyStreams(doc: PDFDocument): { thumbnails: number; streams: number } {
  const N = (s: string) => PDFName.of(s);
  let thumbnails = 0, streams = 0;
  for (const p of doc.getPages()) if (p.node.has(N("Thumb"))) { p.node.delete(N("Thumb")); thumbnails++; }
  for (const [ref, o] of doc.context.enumerateIndirectObjects()) {
    if (!(o instanceof PDFRawStream) || o.contents.length < 256) continue;
    const d = o.dict;
    if (d.has(N("Filter")) || d.has(N("DecodeParms")) || d.has(N("F"))) continue;
    const type = d.get(N("Type"))?.toString();
    if (type === "/XRef" || type === "/ObjStm" || type === "/Metadata") continue;   // metadata is left readable
    const packed = zlibSync(o.contents, { level: 9 });
    if (packed.length > o.contents.length * 0.9) continue;
    const dict = d.clone(doc.context); dict.set(N("Filter"), N("FlateDecode"));
    doc.context.assign(ref, PDFRawStream.of(dict, packed));
    streams++;
  }
  return { thumbnails, streams };
}
