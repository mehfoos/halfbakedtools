// Marking a PDF as PDF/A-2b (ISO 19005-2, conformance level B): the parts every such file needs whatever its pages
// hold. Whether the pages themselves meet the standard is checked elsewhere (pdfacheck.ts); this only adds what is
// missing at the document level. The rules followed are as veraPDF states them (its "PDF/A Parts 2 and 3 rules",
// archived), cited by number below.
import { PDFDocument, PDFName, PDFHexString, PDFHeader, PDFString, PDFDict } from "@cantoo/pdf-lib";
import { srgbProfile } from "./icc.ts";

/** What the file says about itself. Kept the same in the document information dictionary and in the XMP. */
export type PdfAInfo = { title?: string; author?: string; subject?: string; keywords?: string; creator?: string; producer: string; created: Date; modified: Date };

/** The text values already in a document's information dictionary, to carry over. */
export function infoOf(doc: PDFDocument): Omit<PdfAInfo, "producer" | "created" | "modified"> & { created?: Date } {
  const get = (f: () => string | undefined) => { try { const v = f()?.trim(); return v || undefined; } catch { return undefined; } };
  let created: Date | undefined; try { created = doc.getCreationDate(); } catch { created = undefined; }
  return { title: get(() => doc.getTitle()), author: get(() => doc.getAuthor()), subject: get(() => doc.getSubject()), keywords: get(() => doc.getKeywords()), creator: get(() => doc.getCreator()), ...(created && !isNaN(created.getTime()) ? { created } : {}) };
}

const xml = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** XMP dates (XMP Specification Part 1, 8.2.1.2): YYYY-MM-DDThh:mm:ssTZD, here in UTC ("Z"). */
const xmpDate = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * The XMP packet (XMP Specification Part 1, 7.3.2: wrapper with the fixed id, padding, writable trailer), UTF-8
 * (rule 6.6.2.1-5), with the PDF/A identification schema (6.6.4: pdfaid:part 2, pdfaid:conformance B) and only
 * properties of the predefined schemas (6.6.2.3.1): Dublin Core (dc), XMP basic (xmp) and Adobe PDF (pdf).
 */
export function xmpPacket(info: PdfAInfo): string {
  const li = (v: string) => `<rdf:li xml:lang="x-default">${xml(v)}</rdf:li>`;
  const props = [
    `<pdfaid:part>2</pdfaid:part>`, `<pdfaid:conformance>B</pdfaid:conformance>`,
    `<dc:format>application/pdf</dc:format>`,
    info.title ? `<dc:title><rdf:Alt>${li(info.title)}</rdf:Alt></dc:title>` : "",
    info.author ? `<dc:creator><rdf:Seq><rdf:li>${xml(info.author)}</rdf:li></rdf:Seq></dc:creator>` : "",
    info.subject ? `<dc:description><rdf:Alt>${li(info.subject)}</rdf:Alt></dc:description>` : "",
    info.keywords ? `<pdf:Keywords>${xml(info.keywords)}</pdf:Keywords>` : "",
    `<pdf:Producer>${xml(info.producer)}</pdf:Producer>`,
    info.creator ? `<xmp:CreatorTool>${xml(info.creator)}</xmp:CreatorTool>` : "",
    `<xmp:CreateDate>${xmpDate(info.created)}</xmp:CreateDate>`, `<xmp:ModifyDate>${xmpDate(info.modified)}</xmp:ModifyDate>`, `<xmp:MetadataDate>${xmpDate(info.modified)}</xmp:MetadataDate>`,
  ].filter(Boolean).map((p) => `   ${p}`).join("\n");
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
${props}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
${(" ".repeat(99) + "\n").repeat(20)}<?xpacket end="w"?>`;
}

/** The output intent's identifier: the registered name of the sRGB condition. */
export const OUTPUT_CONDITION = "sRGB IEC61966-2.1";

/**
 * Adds to `doc` what PDF/A-2b asks of every file: the XMP metadata stream (6.6.2.1-1, unfiltered), one output intent
 * with the sRGB profile (6.2.3; lets plain RGB and grey be used, 6.2.4.3-2 and -4), a file identifier in the trailer
 * (6.1.3-1), and a PDF 1.7 header (6.1.2-1: version 1.0 to 1.7). The information dictionary gets the same values as
 * the XMP, and its other entries are removed. Any earlier output intents and catalog version are replaced.
 * `id`: the 16 bytes of the file identifier.
 */
export function markPdfA(doc: PDFDocument, info: PdfAInfo, id: Uint8Array): void {
  const ctx = doc.context;
  ctx.header = PDFHeader.forVersion(1, 7);
  doc.catalog.delete(PDFName.of("Version"));
  // information dictionary: exactly the values in the XMP
  const old = ctx.lookup(ctx.trailerInfo.Info);
  if (old instanceof PDFDict) for (const k of old.keys()) old.delete(k);
  doc.setProducer(info.producer); doc.setCreationDate(info.created); doc.setModificationDate(info.modified);
  if (info.title) doc.setTitle(info.title); if (info.author) doc.setAuthor(info.author); if (info.subject) doc.setSubject(info.subject);
  if (info.creator) doc.setCreator(info.creator);
  if (info.keywords) (ctx.lookup(ctx.trailerInfo.Info) as PDFDict).set(PDFName.of("Keywords"), PDFHexString.fromText(info.keywords));
  // XMP, stored as plain UTF-8 bytes (no compression filter)
  const xmp = ctx.stream(new TextEncoder().encode(xmpPacket(info)), { Type: "Metadata", Subtype: "XML" });
  doc.catalog.set(PDFName.of("Metadata"), ctx.register(xmp));
  // output intent with the sRGB profile
  const profile = ctx.flateStream(srgbProfile(), { N: 3 });
  const intent = ctx.obj({ Type: "OutputIntent", S: "GTS_PDFA1", OutputConditionIdentifier: PDFString.of(OUTPUT_CONDITION), Info: PDFString.of(OUTPUT_CONDITION), RegistryName: PDFString.of("http://www.color.org"), DestOutputProfile: ctx.register(profile) });
  doc.catalog.set(PDFName.of("OutputIntents"), ctx.obj([intent]));
  // file identifier: the same 16 bytes twice for a new file
  const hex = [...id].map((b) => b.toString(16).padStart(2, "0")).join("");
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(hex), PDFHexString.of(hex)]);
}
