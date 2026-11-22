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

/**
 * Stores each repeated stream once: pictures, fonts and drawings saved more than once with exactly the same
 * settings and bytes (common in merged files) are pointed at one copy, and the others are left unused (the
 * caller prunes them). Streams are compared by their dictionary (apart from Length) and every byte. Returns how
 * many copies were dropped.
 */
export function mergeDuplicates(doc: PDFDocument): number {
  const ctx = doc.context, buckets = new Map<string, PDFRef[]>(), same = new Map<string, PDFRef>();
  const dictKey = (d: PDFDict) => [...d.entries()].filter(([k]) => k.decodeText() !== "Length").map(([k, v]) => `${k.toString()} ${v.toString()}`).sort().join("\n");
  const fnv = (b: Uint8Array) => { let h = 0x811c9dc5; for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
  for (const [ref, o] of ctx.enumerateIndirectObjects()) {
    if (!(o instanceof PDFRawStream) || o.contents.length < 64) continue;
    const key = `${o.contents.length}:${fnv(o.contents)}:${dictKey(o.dict)}`;
    const list = buckets.get(key) ?? [];
    const twin = list.find((r) => { const a = (ctx.lookup(r) as PDFRawStream).contents; return a.length === o.contents.length && a.every((x, i) => x === o.contents[i]); });
    if (twin) same.set(ref.toString(), twin); else { list.push(ref); buckets.set(key, list); }
  }
  if (!same.size) return 0;
  const swap = (v: PDFObject): PDFObject => (v instanceof PDFRef ? same.get(v.toString()) ?? v : v);
  const fix = (o: PDFObject | undefined, depth = 0): void => {
    if (depth > 64) return;
    if (o instanceof PDFDict) for (const [k, v] of o.entries()) { const w = swap(v); if (w !== v) o.set(k, w); else fix(v instanceof PDFRef ? undefined : v, depth + 1); }
    else if (o instanceof PDFArray) o.asArray().forEach((v, i) => { const w = swap(v); if (w !== v) o.set(i, w); else fix(v instanceof PDFRef ? undefined : v, depth + 1); });
    else if (o instanceof PDFStream) fix(o.dict, depth + 1);
  };
  for (const [, o] of ctx.enumerateIndirectObjects()) fix(o);
  return same.size;
}
