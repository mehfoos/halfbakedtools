/**
 * Repair PDF: what can honestly be done on the visitor's device.
 *
 * The writer library reads a PDF object by object from the start of the file and does not trust the file's
 * index (the "cross-reference table"), so a wrong or missing index, a missing end, or junk in front of the
 * header does not stop it. Saving the pages again writes a fresh, correct index. That fixes damage to the
 * file's structure. It cannot bring back content that is no longer in the file (a cut-off download, zeroed
 * data), so after opening, every page is checked and the ones that cannot be read are named.
 */
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFStream } from "@cantoo/pdf-lib";

const find = (b: Uint8Array, word: string, from = 0, to = b.length): number => {
  const w = [...word].map((c) => c.charCodeAt(0));
  for (let i = from; i <= Math.min(to, b.length) - w.length; i++) { let k = 0; while (k < w.length && b[i + k] === w[k]) k++; if (k === w.length) return i; }
  return -1;
};

/** True when the bytes carry the %PDF- start marker near the beginning. */
export const hasHeader = (b: Uint8Array): boolean => find(b, "%PDF-", 0, 1024 + 5) >= 0;

/** A file that lost its header but still holds PDF objects (so it is worth a repair attempt). */
export const looksLikePdfBody = (b: Uint8Array): boolean => !hasHeader(b) && find(b, "endobj") >= 0 && find(b, "/Type") >= 0;

/** The same bytes with a PDF start marker put in front, if one is missing. */
export function withHeader(b: Uint8Array): { bytes: Uint8Array; added: boolean } {
  if (hasHeader(b)) return { bytes: b, added: false };
  const head = new TextEncoder().encode("%PDF-1.7\n");
  const out = new Uint8Array(head.length + b.length); out.set(head); out.set(b, head.length);
  return { bytes: out, added: true };
}

/**
 * Reads the file leniently and writes it out again with a fresh index. `declared` is the page count the file
 * itself claims (null if it can't be read); `found` is how many pages could actually be reached.
 */
export async function rewrite(bytes: Uint8Array, password?: string): Promise<{ bytes: Uint8Array; found: number; declared: number | null; added: boolean; lost: number[]; cutShort: boolean }> {
  const fixed = withHeader(bytes);
  const doc = await PDFDocument.load(fixed.bytes, password === undefined ? { throwOnInvalidObject: false } : { throwOnInvalidObject: false, password });
  let declared: number | null = null;
  try {
    const root = doc.catalog.Pages();
    const c = root.get(PDFName.of("Count")), v = c ? doc.context.lookup(c) : undefined;
    if (v instanceof PDFNumber) declared = v.asNumber();
  } catch { declared = null; }
  // A page whose drawing instructions point at nothing lost its content (a cut-off file, damaged data).
  const lost: number[] = [];
  doc.getPages().forEach((pg, i) => {
    const c = pg.node.get(PDFName.of("Contents")); if (!c) return;   // no Contents key at all: a blank page by design
    const v = doc.context.lookup(c), parts = v instanceof PDFArray ? v.asArray().map((r) => doc.context.lookup(r)) : [v];
    if (!parts.length || parts.some((x) => !(x instanceof PDFStream))) lost.push(i + 1);
  });
  return { bytes: await doc.save(), found: doc.getPageCount(), declared, added: fixed.added, lost, cutShort: !endsProperly(bytes) };
}

/** A PDF normally ends with %%EOF; a file that does not may have been cut short (a stopped download). */
export function endsProperly(b: Uint8Array): boolean { return find(b, "%%EOF", Math.max(0, b.length - 1100)) >= 0; }

/** Plain-words summary of what was found when a page-by-page check ran. `bad` are 1-based page numbers. */
export function repairNote(name: string, pages: number, added: boolean, bad: number[], declared: number | null = null, cutShort = false): string {
  const parts: string[] = [];
  if (added) parts.push("it had lost its PDF start marker, which was put back");
  if (cutShort) parts.push("it ends without the usual end marker, so it may have been cut short (for example by a stopped download)");
  if (declared !== null && declared > pages) parts.push(`the file says it has ${declared} pages but only ${pages} could be found, so ${declared - pages} ${declared - pages === 1 ? "page is" : "pages are"} missing from what is left`);
  if (bad.length) parts.push(`${bad.length === 1 ? "page" : "pages"} ${listPages(bad)} could not be read completely, so ${bad.length === 1 ? "it" : "they"} may be blank or partly missing in the saved file; lost content cannot be recovered by this tool`);
  if (!parts.length) return `"${name}" no problems were detected (${pages} ${pages === 1 ? "page" : "pages"}, all readable). The saved copy has a fresh index. A problem this tool cannot detect would not be reported.`;
  return `"${name}": ${parts.join("; ")}. ${pages} ${pages === 1 ? "page was" : "pages were"} found. The saved copy has a fresh index.`;
}

/** "3", "3 and 5", "3, 5 and 9", "3 to 6 and 9" style list. */
export function listPages(n: number[]): string {
  const runs: string[] = [];
  for (let i = 0; i < n.length; ) { let j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++; runs.push(j - i >= 2 ? `${n[i]} to ${n[j]}` : n.slice(i, j + 1).join(", ")); i = j + 1; }
  return runs.length > 1 ? `${runs.slice(0, -1).join(", ")} and ${runs[runs.length - 1]}` : runs[0] ?? "";
}
