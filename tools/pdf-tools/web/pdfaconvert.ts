// PDF to PDF/A-2b, keeping the pages' text and drawings. Every change answers a rule of PDF/A-2 as veraPDF states it
// ("PDF/A Parts 2 and 3 rules", archived; rule numbers below). Where something can't be changed without altering
// how the document looks, or isn't handled here, the conversion stops and says why; the visitor can then rebuild the
// pages as pictures instead (pdfa.ts is used either way). Whether the result passes was measured with veraPDF on test
// files (VERIFICATION.md); it can't be run in the browser.
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFRef, PDFStream, PDFRawStream, PDFString, PDFHexString, PDFNumber, PDFBool, type PDFObject } from "@cantoo/pdf-lib";
import { Encodings, Font } from "@cantoo/pdf-lib/standard-fonts";
import fontkit from "@cantoo/fontkit";
import { scanDocument, streamBytes, inherited, type FontUse } from "./pdfascan.ts";
import { checkFonts } from "./pdfafonts.ts";
import { checkObjects } from "./pdfachecks.ts";
import { markPdfA, infoOf } from "./pdfa.ts";
import { woffToSfnt } from "./woff.ts";
import { addTextLayer } from "./ocr.ts";
import { addGlyphlessFont } from "./glyphless.ts";
import type { RedactedPage } from "./redact.ts";

/** Font families embedded in place of the standard Latin fonts when a file uses them without embedding them: Arimo,
 *  Tinos and Cousine (OFL 1.1), drawn to the same widths as Helvetica, Times and Courier. As served by Fontsource, each
 *  style is split into a "latin" and a "latin-ext" file. */
export type SubFamily = "arimo" | "tinos" | "cousine";
export type SubStyle = "400-normal" | "700-normal" | "400-italic" | "700-italic";
export type FontFiles = (family: SubFamily, style: SubStyle, subset: "latin" | "latin-ext") => Promise<Uint8Array>;

export type Converted = { bytes: Uint8Array | null; changes: string[]; blockers: string[] };
export const PRODUCER = "Half Baked Tools PDF tools (halfbakedtools.com)";

const N = (s: string) => PDFName.of(s);
/** Actions PDF/A-2 allows (6.5.1-1 forbids Launch, Sound, Movie, ResetForm, ImportData, Hide, SetOCGState, Rendition,
 *  Trans, GoTo3DView and JavaScript, and veraPDF also refuses action types ISO 32000-1 doesn't define). */
const ALLOWED_ACTIONS = new Set(["GoTo", "GoToR", "GoToE", "Thread", "URI", "Named", "SubmitForm"]);
const ALLOWED_NAMED = new Set(["NextPage", "PrevPage", "FirstPage", "LastPage"]);   // 6.5.1-2
const FORBIDDEN_ANNOTS = new Set(["3D", "Sound", "Screen", "Movie", "FileAttachment", "RichMedia"]);   // 6.3.1-1; attachments: 6.8-5
const KNOWN_ANNOTS = new Set(["Text", "Link", "FreeText", "Line", "Square", "Circle", "Polygon", "PolyLine", "Highlight", "Underline", "Squiggly", "StrikeOut", "Stamp", "Caret", "Ink", "Popup", "Widget", "PrinterMark", "TrapNet", "Watermark", "Redact"]);
const BLEND = new Set(["Normal", "Compatible", "Multiply", "Screen", "Overlay", "Darken", "Lighten", "ColorDodge", "ColorBurn", "HardLight", "SoftLight", "Difference", "Exclusion", "Hue", "Saturation", "Color", "Luminosity"]);   // 6.2.10-1
const INTENTS = new Set(["RelativeColorimetric", "AbsoluteColorimetric", "Perceptual", "Saturation"]);   // 6.2.6-1

export async function convertToPdfA(bytes: Uint8Array, password: string | undefined, fonts: FontFiles, now = new Date()): Promise<Converted> {
  // A file locked only against changes (no password needed to open it) is read with the empty password.
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ...(password !== undefined ? { password } : {}) })
    .catch((e) => { if (password === undefined && /encrypted/i.test(String(e))) return PDFDocument.load(bytes, { updateMetadata: false, password: "" }); throw e; });
  const ctx = doc.context, changes = new Set<string>(), blockers: string[] = [];
  const look = <T extends PDFObject>(o: PDFObject | undefined): T | undefined => (o instanceof PDFRef ? (ctx.lookup(o) as T) : (o as T));
  const dictOf = (o: PDFObject | undefined) => { const x = look<PDFObject>(o); return x instanceof PDFStream ? x.dict : x instanceof PDFDict ? x : undefined; };
  const name = (o: PDFObject | undefined) => { const x = look<PDFObject>(o); return x instanceof PDFName ? x.decodeText() : undefined; };
  const drop = (d: PDFDict, key: string, why: string) => { if (d.has(N(key))) { d.delete(N(key)); changes.add(why); } };
  const pages = doc.getPages().map((p) => p.node as unknown as PDFDict);

  // ---- encryption (6.1.3-2): the library reads the file with its password; the saved copy is not encrypted
  if (ctx.trailerInfo.Encrypt) { delete (ctx.trailerInfo as { Encrypt?: unknown }).Encrypt; changes.add("Removed the password protection (PDF/A files can't be encrypted)."); }

  // ---- actions (6.5), scripts, attachments (6.8-5), document-level extras
  const cleanAction = (holder: PDFDict, key: string) => {
    let a = dictOf(holder.get(N(key))); const seen = new Set<PDFDict>();
    while (a && !seen.has(a)) {
      seen.add(a);
      const s = name(a.get(N("S")));
      if (!s || !ALLOWED_ACTIONS.has(s) || (s === "Named" && !ALLOWED_NAMED.has(name(a.get(N("N"))) ?? ""))) {
        holder.delete(N(key)); changes.add(`Removed actions PDF/A doesn't allow (such as scripts and launching programs).`); return;
      }
      a = dictOf(a.get(N("Next")));
    }
  };
  const cat = doc.catalog;
  drop(cat, "AA", "Removed actions PDF/A doesn't allow (such as scripts and launching programs).");   // 6.5.2-1
  cleanAction(cat, "OpenAction");
  for (const k of ["NeedsRendering", "Collection", "AF", "Threads", "SpiderInfo", "Requirements"]) drop(cat, k, k === "AF" || k === "Collection" ? "Removed attached files (PDF/A-2 allows only attachments that are PDF/A themselves)." : "Removed document settings PDF/A doesn't allow.");
  const names = dictOf(cat.get(N("Names")));
  if (names) { drop(names, "JavaScript", "Removed scripts."); drop(names, "EmbeddedFiles", "Removed attached files (PDF/A-2 allows only attachments that are PDF/A themselves)."); }
  // signatures: converting rewrites the file, so a signature over it would no longer match (6.4.3-1 requires it to
  // cover the whole file). A signed file is refused; usage rights (UR3), which only unlock features in some viewers,
  // are removed; other permission entries PDF/A doesn't allow (6.1.12-1) are removed.
  const perms = dictOf(cat.get(N("Perms")));
  if (perms) {
    if (perms.has(N("DocMDP"))) blockers.push("The file is certified with a digital signature; converting it would change the file and break the signature.");
    for (const k of perms.keys()) if (k.decodeText() !== "DocMDP") { perms.delete(k); changes.add(k.decodeText() === "UR3" ? "Removed the usage-rights signature (it unlocks features in some viewers and would no longer match after conversion)." : "Removed permission settings PDF/A doesn't allow."); }
    if (!perms.keys().length) cat.delete(N("Perms"));
  }
  // bookmarks: their actions
  const outlines = dictOf(cat.get(N("Outlines"))), seenItems = new Set<PDFDict>();
  const walk = (item: PDFDict | undefined) => { while (item && !seenItems.has(item)) { seenItems.add(item); cleanAction(item, "A"); walk(dictOf(item.get(N("First")))); item = dictOf(item.get(N("Next"))); } };
  walk(dictOf(outlines?.get(N("First"))));

  // ---- forms (6.4)
  const acro = dictOf(cat.get(N("AcroForm")));
  if (acro) {
    drop(acro, "XFA", "Removed the XFA form data (PDF/A-2 doesn't allow it); the ordinary form fields remain.");
    const na = look<PDFObject>(acro.get(N("NeedAppearances")));
    if (na) { acro.delete(N("NeedAppearances")); if (na.toString() === "true") changes.add("Turned off the request for viewers to redraw form fields."); }
    const seenFields = new Set<PDFDict>();
    const fields = (arr: PDFObject | undefined) => { const a = look<PDFArray>(arr); if (!(a instanceof PDFArray)) return;
      for (const f of a.asArray()) { const d = dictOf(f); if (!d || seenFields.has(d)) continue; seenFields.add(d);
        drop(d, "A", "Removed actions from form fields (PDF/A doesn't allow them)."); drop(d, "AA", "Removed actions from form fields (PDF/A doesn't allow them).");
        if (name(d.get(N("FT"))) === "Sig" && d.has(N("V"))) blockers.push("The file is digitally signed; converting it would change the file and break the signature.");
        fields(d.get(N("Kids"))); } };
    fields(acro.get(N("Fields")));
  }

  // ---- pages: actions, sizes (6.1.13-11), annotations (6.3)
  let removedAnnots = 0, noLook = 0, drawn = 0;
  for (const [i, page] of pages.entries()) {
    drop(page, "AA", "Removed actions PDF/A doesn't allow (such as scripts and launching programs).");   // 6.5.2-2
    // resources a page takes from the page tree are written on the page itself (veraPDF reads 6.2.2-2 as requiring it)
    if (!page.has(N("Resources"))) {
      let node = dictOf(page.get(N("Parent")));
      for (let k = 0; node && k < 50 && !node.has(N("Resources")); k++) node = dictOf(node.get(N("Parent")));
      const v = node?.get(N("Resources"));
      if (node && v) { const ref = v instanceof PDFRef ? v : ctx.register(v); node.set(N("Resources"), ref); page.set(N("Resources"), ref); changes.add("Wrote each page's list of fonts and pictures on the page itself, as PDF/A requires."); }
    }
    for (const box of ["MediaBox", "CropBox", "BleedBox", "TrimBox", "ArtBox"]) {
      const b = look<PDFArray>(box === "MediaBox" || box === "CropBox" ? inheritedValue(page, box) : page.get(N(box)));
      if (!(b instanceof PDFArray) || b.size() < 4) continue;
      const v = b.asArray().map((x) => (look<PDFNumber>(x) as PDFNumber)?.asNumber?.() ?? 0), w = Math.abs(v[2] - v[0]), h = Math.abs(v[3] - v[1]);
      if (w < 3 || h < 3 || w > 14400 || h > 14400) blockers.push(`Page ${i + 1} is ${Math.round(w)} × ${Math.round(h)} points; PDF/A allows 3 to 14,400 (about 5 metres).`);
    }
    const annots = look<PDFArray>(page.get(N("Annots")));
    if (!(annots instanceof PDFArray)) continue;
    const keep: PDFObject[] = [];
    for (const ref of annots.asArray()) {
      const a = dictOf(ref); if (!a) continue;
      const sub = name(a.get(N("Subtype"))) ?? "";
      if (FORBIDDEN_ANNOTS.has(sub) || !KNOWN_ANNOTS.has(sub)) { removedAnnots++; continue; }
      if (sub !== "Popup") {
        // F: printable, not hidden (6.3.2)
        const f = (look<PDFNumber>(a.get(N("F"))) as PDFNumber | undefined)?.asNumber?.() ?? 0, fixed = (f | 4) & ~(1 | 2 | 32 | 256);
        if (fixed !== f || !a.has(N("F"))) { a.set(N("F"), PDFNumber.of(fixed)); changes.add("Made comments and fields printable and visible, as PDF/A requires."); }
      }
      drop(a, "AA", "Removed actions from comments and fields (PDF/A doesn't allow them).");
      if (sub === "Widget") drop(a, "A", "Removed actions from comments and fields (PDF/A doesn't allow them).");   // 6.4.1-1
      else cleanAction(a, "A");
      // appearance: only N (6.3.3-2); required except for popups, links and zero-size annotations (6.3.3-1)
      const ap = dictOf(a.get(N("AP")));
      if (ap) for (const k of ["D", "R"]) if (ap.has(N(k))) { ap.delete(N(k)); changes.add("Kept only the normal appearance of comments and fields (PDF/A allows no rollover or pressed look)."); }
      const rect = look<PDFArray>(a.get(N("Rect"))), r = rect instanceof PDFArray ? rect.asArray().map((x) => (look<PDFNumber>(x) as PDFNumber)?.asNumber?.() ?? 0) : [];
      const zero = r.length === 4 && r[0] === r[2] && r[1] === r[3];
      const n = look<PDFObject>(ap?.get(N("N")));
      if (sub === "Text" && !n && !zero && r.length === 4) { noteIcon(a, r); drawn++; }
      else if (sub !== "Popup" && sub !== "Link" && !zero) {
        const isBtn = sub === "Widget" && fieldType(a) === "Btn";
        if (isBtn && n instanceof PDFStream && ap) {
          // 6.3.3-3: a button's normal appearance must be a set of states. A push button has only one look, so its
          // drawing becomes the single state, selected by AS; it looks the same. Check boxes and radio buttons drawn
          // as one stream have lost their states, so they aren't guessed at.
          if (((fieldFlags(a) >> 16) & 1) === 1) { ap.set(N("N"), ctx.obj({ On: ap.get(N("N"))! })); a.set(N("AS"), N("On")); changes.add("Stored push buttons' appearance as a single state, as PDF/A requires (they look the same)."); }
          else blockers.push("A check box or radio button has one drawing instead of one per state, which PDF/A doesn't allow.");
        } else {
          const ok = n && (isBtn ? n instanceof PDFDict && [...n.entries()].some(([, v]) => look<PDFObject>(v) instanceof PDFStream) : n instanceof PDFStream);   // 6.3.3-3, -4
          if (!ok) { noLook++; continue; }
        }
      }
      keep.push(ref);
    }
    // a popup belongs to the annotation it opens from (its Parent): it goes when that one goes, or it would keep it
    const gone = new Set(annots.asArray().filter((x) => !keep.includes(x)).map((x) => String(x)));
    const kept = keep.filter((x) => { const p = dictOf(x)?.get(N("Parent")); return !(name(dictOf(x)?.get(N("Subtype"))) === "Popup" && p && gone.has(String(p))); });
    if (kept.length !== annots.size()) page.set(N("Annots"), ctx.obj(kept));
  }
  if (removedAnnots) changes.add(`Removed ${removedAnnots} ${removedAnnots === 1 ? "item" : "items"} PDF/A doesn't allow (attached files, sound, video or 3D).`);
  if (drawn) changes.add(`Drew a note icon for ${drawn} ${drawn === 1 ? "note" : "notes"} that had no drawn appearance (PDF/A requires one; viewers used to draw their own).`);
  if (noLook) changes.add(`Removed ${noLook} ${noLook === 1 ? "comment or field" : "comments or fields"} with no drawn appearance (PDF/A requires one).`);

  // ---- every object: streams, graphics states, images, form XObjects, fonts' optional lists, layers
  let objectMetadata = 0;
  /** 6.2.5-6: a halftone's TransferFunction only for spot colourants (where it is required); for the process ones
   *  and the default it adjusts printing only, like the transfer functions removed above. */
  const halftone = (h: PDFObject, colorant: string | undefined, depth: number): void => {
    const hd = h instanceof PDFStream ? h.dict : h instanceof PDFDict ? h : undefined; if (!hd || depth > 3) return;
    if ((look<PDFNumber>(hd.get(N("HalftoneType"))) as PDFNumber | undefined)?.asNumber?.() === 5) {
      for (const [k, v] of hd.entries()) { const key = k.decodeText(); if (!["Type", "HalftoneType", "HalftoneName"].includes(key)) { const x = look<PDFObject>(v); if (x) halftone(x, key, depth + 1); } }
      return;
    }
    if (colorant === "Default") return;
    if (colorant === undefined || ["Cyan", "Magenta", "Yellow", "Black"].includes(colorant)) drop(hd, "TransferFunction", "Removed transfer functions (PDF/A doesn't allow them; they adjust printing).");
    else if (!hd.has(N("TransferFunction"))) blockers.push(`The halftone for the spot colour “${colorant}” has no transfer function, which PDF/A requires.`);
  };
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    const d = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : undefined;
    if (!d) continue;
    // metadata of single parts (pages, pictures, fonts): its schemas would need checking (6.6.2.3), so it goes
    if (d !== cat && d.has(N("Metadata")) && name(d.get(N("Type"))) !== "Catalog") { d.delete(N("Metadata")); objectMetadata++; }
    // streams kept in other files (6.1.7.1-3)
    if (obj instanceof PDFStream) {
      if (d.has(N("F"))) blockers.push("Part of the file is stored in another file (an external stream), which PDF/A doesn't allow.");
      else for (const k of ["FFilter", "FDecodeParms"]) drop(d, k, "Removed settings for external files that weren't used.");
    }
    // filters (6.1.7.2-1): LZW is decompressed and stored with Flate instead; Crypt (except Identity) can't be kept
    if (obj instanceof PDFRawStream) {
      const filters = filterNames(d);
      if (filters.some((f) => f === "LZWDecode" || f === "LZW")) {
        const data = streamBytes(obj);
        if (data && filters.every((f) => ["LZWDecode", "LZW", "FlateDecode", "Fl", "ASCIIHexDecode", "AHx", "ASCII85Decode", "A85", "RunLengthDecode", "RL"].includes(f))) {
          const fresh = ctx.flateStream(data); for (const [k, v] of d.entries()) if (!["Filter", "DecodeParms", "Length"].includes(k.decodeText())) fresh.dict.set(k, v);
          ctx.assign(ref, fresh); changes.add("Recompressed parts stored with LZW (not allowed in PDF/A) using Flate."); continue;
        }
        blockers.push("Part of the file is compressed with LZW together with another method this tool can't redo.");
      }
      if (filters.includes("Crypt")) blockers.push("Part of the file uses its own encryption filter, which PDF/A doesn't allow.");
    }
    const type = name(d.get(N("Type"))), sub = name(d.get(N("Subtype")));
    if (type === "ExtGState" || d.has(N("TR")) || d.has(N("HTP")) || d.has(N("BM"))) {   // 6.2.5, 6.2.10-1
      drop(d, "TR", "Removed transfer functions (PDF/A doesn't allow them; they adjust printing).");
      const tr2 = look<PDFObject>(d.get(N("TR2"))); if (tr2 && name(tr2) !== "Default") { d.delete(N("TR2")); changes.add("Removed transfer functions (PDF/A doesn't allow them; they adjust printing)."); }
      drop(d, "HTP", "Removed halftone settings PDF/A doesn't allow.");
      const ht = look<PDFObject>(d.get(N("HT"))); if (ht && !(ht instanceof PDFName)) halftone(ht, undefined, 0);
      const bm = look<PDFObject>(d.get(N("BM")));
      const bad = bm instanceof PDFName ? !BLEND.has(bm.decodeText()) : bm instanceof PDFArray ? bm.asArray().some((x) => !BLEND.has(name(x) ?? "")) : false;
      if (bad) { d.set(N("BM"), N("Normal")); changes.add("Replaced a blend mode PDF/A doesn't know with Normal."); }
    }
    if (d.has(N("HalftoneType"))) {   // 6.2.5-4, -5
      const ht = (look<PDFNumber>(d.get(N("HalftoneType"))) as PDFNumber)?.asNumber?.();
      if (ht !== 1 && ht !== 5) blockers.push("The file uses a halftone screen type PDF/A doesn't allow.");
      drop(d, "HalftoneName", "Removed halftone settings PDF/A doesn't allow.");
    }
    const ri = name(d.get(N("Intent"))); if (ri && type !== "OutputIntent" && !INTENTS.has(ri) && (sub === "Image" || type === "ExtGState")) { d.delete(N("Intent")); changes.add("Removed a rendering intent PDF/A doesn't know."); }
    if (type === "ExtGState") { const r = name(d.get(N("RI"))); if (r && !INTENTS.has(r)) { d.delete(N("RI")); changes.add("Removed a rendering intent PDF/A doesn't know."); } }
    if (sub === "Image") {   // 6.2.8
      drop(d, "Alternates", "Removed alternative versions of pictures (PDF/A doesn't allow them).");
      drop(d, "OPI", "Removed links to high-resolution picture replacements (OPI).");
      if (look<PDFObject>(d.get(N("Interpolate")))?.toString() === "true") { d.set(N("Interpolate"), PDFBool.False); changes.add("Turned off picture smoothing requests (Interpolate), as PDF/A requires; viewers may still smooth pictures."); }
      const bpc = (look<PDFNumber>(d.get(N("BitsPerComponent"))) as PDFNumber)?.asNumber?.();
      if (bpc !== undefined && ![1, 2, 4, 8, 16].includes(bpc)) blockers.push(`A picture has ${bpc} bits per colour, which PDF/A doesn't allow.`);
    }
    if (sub === "Form") { for (const k of ["OPI", "PS"]) drop(d, k, "Removed PostScript and OPI data from drawings."); if (name(d.get(N("Subtype2"))) === "PS") { d.delete(N("Subtype2")); changes.add("Removed PostScript and OPI data from drawings."); }
      if (d.has(N("Ref"))) blockers.push("The file draws content from another file (a reference XObject), which PDF/A doesn't allow."); }
    if (sub === "PS") blockers.push("The file contains PostScript code (a PostScript XObject), which PDF/A doesn't allow.");
    if (type === "FontDescriptor") { drop(d, "CharSet", "Removed optional font glyph lists that must otherwise be complete."); drop(d, "CIDSet", "Removed optional font glyph lists that must otherwise be complete."); }   // 6.2.11.4.2
  }
  if (objectMetadata) changes.add(`Removed metadata attached to ${objectMetadata} ${objectMetadata === 1 ? "part" : "parts"} of the file (pages, pictures or fonts); PDF/A requires its schemas to be described, which this tool doesn't check.`);

  // ---- layers (6.9): configurations named, no AS, Order listing every layer; layer names as text
  const oc = dictOf(cat.get(N("OCProperties")));
  if (oc) {
    const groups = look<PDFArray>(oc.get(N("OCGs")));
    const all = groups instanceof PDFArray ? groups.asArray() : [];
    for (const g of all) { const gd = dictOf(g); const nm = look<PDFObject>(gd?.get(N("Name"))); if (gd && !(nm instanceof PDFString || nm instanceof PDFHexString)) { gd.set(N("Name"), PDFHexString.fromText(nm instanceof PDFName ? nm.decodeText() : "Layer")); changes.add("Gave layers and layer settings the names PDF/A requires."); } }
    const configs = [dictOf(oc.get(N("D"))), ...(look<PDFArray>(oc.get(N("Configs")))?.asArray?.() ?? []).map((c) => dictOf(c))].filter((c): c is PDFDict => !!c);
    const used = new Set<string>();
    configs.forEach((c, k) => {
      let nm = (look<PDFObject>(c.get(N("Name"))) as PDFString | undefined)?.decodeText?.();
      if (!nm || used.has(nm)) { nm = k === 0 ? "Default" : `Settings ${k + 1}`; while (used.has(nm)) nm += "+"; c.set(N("Name"), PDFHexString.fromText(nm)); changes.add("Gave layers and layer settings the names PDF/A requires."); }
      used.add(nm);
      drop(c, "AS", "Removed automatic layer switching (PDF/A doesn't allow it).");
      const order = look<PDFArray>(c.get(N("Order")));
      if (order instanceof PDFArray) {
        const listed = new Set<string>(); const visit = (a: PDFArray) => a.asArray().forEach((x) => { const y = look<PDFObject>(x); if (y instanceof PDFArray) visit(y); else listed.add(String(x)); });
        visit(order);
        const missing = all.filter((g) => !listed.has(String(g)));
        if (missing.length) { missing.forEach((g) => order.push(g)); changes.add("Listed every layer in the layer settings, as PDF/A requires."); }
      }
    });
  }

  // ---- what the pages draw: fonts, colours, inline images, nesting
  const scan = scanDocument(ctx, pages);
  if (scan.unreadable) blockers.push(`${scan.unreadable === 1 ? "A content stream" : `${scan.unreadable} content streams`} couldn't be read, so the file can't be checked.`);
  if (scan.deepestNesting > 28) blockers.push(`Drawing states are nested ${scan.deepestNesting} deep; PDF/A allows 28.`);   // 6.1.13-8
  for (const p of new Set([...scan.inlineProblems, ...scan.problems])) blockers.push(`The file has ${p}, which PDF/A doesn't allow and this tool can't change.`);
  // forms, patterns and Type 3 fonts drawn with resources they don't have themselves get those (6.2.2-2)
  for (const [holder, parents] of scan.borrowed) {
    const list = [...parents];
    if (list.length === 1 && list[0]) { holder.set(N("Resources"), list[0]); changes.add("Gave drawings the list of fonts and pictures they use, which they had borrowed from their page (PDF/A requires their own)."); }
    else if (list.length > 1) blockers.push("A drawing without its own list of fonts and pictures is used in places with different lists, so it can't be given one.");
  }

  // colour (6.2.4.3): plain RGB and grey need the sRGB output intent; plain CMYK needs a CMYK one
  const cmyk = scan.device.has("cmyk"), rgb = scan.device.has("rgb");
  let cmykProfile: PDFRef | undefined;
  if (cmyk) {
    const intents = look<PDFArray>(cat.get(N("OutputIntents")));
    for (const it of intents instanceof PDFArray ? intents.asArray() : []) {
      const p = look<PDFStream>(dictOf(it)?.get(N("DestOutputProfile")) as PDFObject);
      if (p instanceof PDFStream && (look<PDFNumber>(p.dict.get(N("N"))) as PDFNumber)?.asNumber?.() === 4) { cmykProfile = dictOf(it)?.get(N("DestOutputProfile")) as PDFRef; break; }
    }
    if (rgb) blockers.push("The file mixes plain RGB and plain CMYK colour; PDF/A allows only one kind without colour profiles.");
    else if (!cmykProfile) blockers.push("The file uses plain CMYK (print) colour and has no CMYK colour profile to say what it means; this tool has no CMYK profile to add.");
  }

  // fonts (6.2.11): every font used for visible text must be embedded; standard Latin fonts can be replaced
  for (const [font, use] of scan.fonts) {
    if (!use.shown || isEmbedded(font, look)) continue;
    const r = await substitute(doc, font, use, fonts);
    if (typeof r === "string") blockers.push(r);
    else changes.add(`Embedded ${r.family} in place of ${r.label}, which the file used without embedding: the widths are the same, so the text stays where it was; the letters' shapes differ slightly.`);
  }
  // embedded fonts: glyphs, widths, encodings, CMaps (6.2.11), including the replacements just embedded
  const fc = checkFonts(ctx, scan.fonts);
  blockers.push(...fc.problems); fc.fixes.forEach((f) => changes.add(f));

  if (blockers.length) return { bytes: null, changes: [...changes], blockers: [...new Set(blockers)] };

  // ---- document level (pdfa.ts), with the CMYK profile kept if that's what the file uses
  const info = infoOf(doc);
  markPdfA(doc, { ...info, producer: PRODUCER, created: info.created ?? now, modified: now }, crypto.getRandomValues(new Uint8Array(16)));
  if (cmykProfile) {
    const intent = ctx.obj({ Type: "OutputIntent", S: "GTS_PDFA1", OutputConditionIdentifier: PDFString.of("Custom"), Info: PDFString.of("The CMYK profile the original file named"), DestOutputProfile: cmykProfile });
    cat.set(N("OutputIntents"), ctx.obj([intent]));
  }
  const pruned = prune(doc);
  if (pruned) changes.add(`Left out ${pruned} unused ${pruned === 1 ? "object" : "objects"} (earlier versions, removed items).`);
  // what is left, object by object: sizes, names, spot colours, overprinting, JPEG 2000 (pdfachecks.ts)
  const objs = checkObjects(ctx);
  if (objs.fixed) changes.add("Completed hexadecimal text that was missing its final digit (it reads the same).");
  if (objs.problems.length) return { bytes: null, changes: [...changes], blockers: objs.problems.map((p) => `The file has ${p}, which PDF/A doesn't allow and this tool can't change.`) };
  return { bytes: await doc.save({ updateFieldAppearances: false }), changes: [...changes], blockers: [] };

  // ---- helpers that need the document
  /** A plain note icon for a note (Text annotation) without an appearance: a pale yellow page with three lines and
   *  a dark outline, filling the annotation's rectangle. */
  function noteIcon(a: PDFDict, r: number[]) {
    const w = Math.abs(r[2] - r[0]), h = Math.abs(r[3] - r[1]), f = (x: number) => Math.round(x * 100) / 100;
    const lines = [0.3, 0.5, 0.7].map((y) => `${f(w * 0.2)} ${f(h * y)} m ${f(w * 0.8)} ${f(h * y)} l S`).join("\n");
    const ops = `q 1 0.93 0.55 rg 0.25 0.25 0.25 RG 1 w 0.5 0.5 ${f(w - 1)} ${f(h - 1)} re B 0.25 0.25 0.25 RG 0.8 w\n${lines}\nQ`;
    const s = ctx.flateStream(new TextEncoder().encode(ops), { Type: "XObject", Subtype: "Form", BBox: [0, 0, f(w), f(h)], Resources: {} });
    a.set(N("AP"), ctx.obj({ N: ctx.register(s) }));
  }
  function inheritedValue(page: PDFDict, key: string): PDFObject | undefined {
    let node: PDFDict | undefined = page;
    for (let i = 0; node && i < 50; i++) { const v = node.get(N(key)); if (v) return v; node = dictOf(node.get(N("Parent"))); }
    return undefined;
  }
  function fieldFlags(a: PDFDict): number {
    let node: PDFDict | undefined = a;
    for (let i = 0; node && i < 50; i++) { const f = look<PDFNumber>(node.get(N("Ff"))); if (f instanceof PDFNumber) return f.asNumber(); node = dictOf(node.get(N("Parent"))); }
    return 0;
  }
  function fieldType(a: PDFDict): string | undefined {
    let node: PDFDict | undefined = a;
    for (let i = 0; node && i < 50; i++) { const t = name(node.get(N("FT"))); if (t) return t; node = dictOf(node.get(N("Parent"))); }
    return undefined;
  }
}

const filterNames = (d: PDFDict) => { const f = d.get(N("Filter")); return f instanceof PDFArray ? f.asArray().map((x) => (x instanceof PDFName ? x.decodeText() : "")) : f instanceof PDFName ? [f.decodeText()] : []; };

function isEmbedded(font: PDFDict, look: <T extends PDFObject>(o: PDFObject | undefined) => T | undefined): boolean {
  const sub = look<PDFName>(font.get(N("Subtype")))?.decodeText?.();
  if (sub === "Type3") return true;   // glyphs drawn by content streams
  let d: PDFDict | undefined = font;
  if (sub === "Type0") { const kids = look<PDFArray>(font.get(N("DescendantFonts"))); d = kids instanceof PDFArray ? look<PDFDict>(kids.get(0)) : undefined; }
  const fd = look<PDFDict>(d?.get(N("FontDescriptor")));
  return !!fd && ["FontFile", "FontFile2", "FontFile3"].some((k) => look<PDFObject>(fd.get(N(k))) instanceof PDFStream);
}

// ---------- replacing a standard Latin font ----------
/** WinAnsi: code -> glyph name, and glyph name -> Unicode (PDF library's standard-fonts tables). */
const WINANSI = (() => { const byCode = new Map<number, string>(), uni = new Map<string, number>();
  for (const [u, m] of Object.entries((Encodings.WinAnsi as unknown as { unicodeMappings: Record<string, [number, string]> }).unicodeMappings)) { byCode.set(m[0], m[1]); uni.set(m[1], Number(u)); }
  return { byCode, uni }; })();
/** The glyph name a code has in Adobe's Standard encoding, for codes 32 to 126: as WinAnsi's except 39 (quoteright)
 *  and 96 (quoteleft) (Adobe's Core 14 AFM files, e.g. Helvetica.afm: "C 39 ; ... N quoteright", "C 96 ; ... N
 *  quoteleft"). Other codes are not taken from Standard here: a file must name them in its own Differences. */
export function standardName(code: number): string | undefined {
  if (code === 39) return "quoteright"; if (code === 96) return "quoteleft";
  return code >= 32 && code <= 126 ? WINANSI.byCode.get(code) : undefined;
}

const STANDARD_FONTS: Record<string, [SubFamily, string]> = {};
for (const [fam, sub, base] of [["Helvetica", "arimo", "Helvetica"], ["Arial", "arimo", "Helvetica"], ["ArialMT", "arimo", "Helvetica"], ["Times", "tinos", "Times"], ["TimesNewRoman", "tinos", "Times"], ["TimesNewRomanPS", "tinos", "Times"], ["TimesNewRomanPSMT", "tinos", "Times"], ["Courier", "cousine", "Courier"], ["CourierNew", "cousine", "Courier"], ["CourierNewPSMT", "cousine", "Courier"]] as const) STANDARD_FONTS[fam] = [sub, base];

/** The standard font (for its widths) and the replacement family and style for a font's name, if it is one of the
 *  twelve standard Latin fonts or a common name for them. */
export function replacementFor(baseFont: string): { std: string; family: SubFamily; style: SubStyle } | null {
  const raw = baseFont.replace(/^[A-Z]{6}\+/, ""), m = raw.match(/^([A-Za-z]+?)(?:[-,](.*))?$/);
  if (!m) return null;
  const hit = STANDARD_FONTS[m[1]] ?? (m[1] === "TimesRoman" ? STANDARD_FONTS.Times : undefined); if (!hit) return null;
  const rest = (m[2] ?? "") + (raw.match(/(Bold|Italic|Oblique)+$/)?.[0] ?? "");
  const bold = /bold/i.test(rest), italic = /italic|oblique/i.test(rest);
  if (m[2] && !/^(Roman|Regular|Bold|Italic|Oblique|BoldItalic|BoldOblique|Bold,?Italic|PSMT|MT)?$/i.test(m[2].replace(/,/g, ""))) return null;
  const [family, base] = hit;
  const std = base === "Times" ? (bold && italic ? "Times-BoldItalic" : bold ? "Times-Bold" : italic ? "Times-Italic" : "Times-Roman") : `${base}${bold || italic ? "-" : ""}${bold ? "Bold" : ""}${italic ? "Oblique" : ""}`;
  return { std, family, style: `${bold ? 700 : 400}-${italic ? "italic" : "normal"}` as SubStyle };
}

type Fk = { unitsPerEm: number; ascent: number; descent: number; capHeight: number; italicAngle: number; bbox: { minX: number; minY: number; maxX: number; maxY: number }; postscriptName: string; glyphForCodePoint(c: number): { id: number; advanceWidth: number } | null; hasGlyphForCodePoint(c: number): boolean };

/** Embeds a replacement for a non-embedded standard Latin font, changing the font dictionary in place, if for every
 *  code the file draws with it: the code means the same character as in WinAnsi (6.2.11.6-2: no Differences), the
 *  replacement has that character, and its width is the one the file uses within 1/1000 of the text size. Returns
 *  why not, or the replacement's name. */
async function substitute(doc: PDFDocument, font: PDFDict, use: FontUse, files: FontFiles): Promise<string | { family: string; label: string }> {
  const ctx = doc.context, look = <T extends PDFObject>(o: PDFObject | undefined) => (o instanceof PDFRef ? (ctx.lookup(o) as T) : (o as T));
  const base = (look<PDFName>(font.get(N("BaseFont"))) as PDFName | undefined)?.decodeText?.() ?? "(unnamed)";
  const sub = (look<PDFName>(font.get(N("Subtype"))) as PDFName | undefined)?.decodeText?.();
  const label = base.replace(/^[A-Z]{6}\+/, "");
  if (sub !== "Type1" && sub !== "TrueType" && sub !== "MMType1") return `The font ${label} isn't embedded in the file, and only simple fonts can be replaced.`;
  const rep = replacementFor(base);
  if (!rep) return `The font ${label} isn't embedded in the file, and there is no free font with the same widths to embed in its place (this tool can replace Helvetica, Times and Courier).`;
  // the glyph name of each code the file draws, from the font's encoding
  const enc = look<PDFObject>(font.get(N("Encoding")));
  const diffs = new Map<number, string>();
  let baseEnc = enc instanceof PDFName ? enc.decodeText() : "StandardEncoding";
  if (enc instanceof PDFDict) {
    const be = look<PDFName>(enc.get(N("BaseEncoding"))); baseEnc = be instanceof PDFName ? be.decodeText() : "StandardEncoding";
    const d = look<PDFArray>(enc.get(N("Differences"))); let code = 0;
    if (d instanceof PDFArray) for (const x of d.asArray()) { const y = look<PDFObject>(x); if (y instanceof PDFNumber) code = y.asNumber(); else if (y instanceof PDFName) diffs.set(code++, y.decodeText()); }
  }
  const nameOf = (c: number) => diffs.get(c) ?? (baseEnc === "WinAnsiEncoding" ? WINANSI.byCode.get(c) : baseEnc === "StandardEncoding" ? standardName(c) : baseEnc === "MacRomanEncoding" && c >= 32 && c <= 126 ? WINANSI.byCode.get(c) : undefined);
  const codes = [...use.any].sort((a, b) => a - b), wanted: { code: number; uni: number; width: number }[] = [];
  const own = ownWidths(font, look);
  const metrics = Font.load(rep.std as never);
  for (const c of codes) {
    const n = nameOf(c);
    if (!n || WINANSI.byCode.get(c) !== n) return `The font ${label} isn't embedded, and the file uses a character code (${c}) in a way a replacement font can't keep (PDF/A allows only standard encodings for it).`;
    const width = own?.(c) ?? (metrics.getWidthOfGlyph(n) as number | undefined) ?? NaN;
    wanted.push({ code: c, uni: WINANSI.uni.get(n)!, width });
  }
  // the replacement file: Fontsource's "latin" part, or its "latin-ext" part, holding every character used
  let fk: Fk | undefined, bytes: Uint8Array | undefined;
  for (const subset of ["latin", "latin-ext"] as const) {
    const sfnt = woffToSfnt(await files(rep.family, rep.style, subset));
    const f = (fontkit as unknown as { create(b: Uint8Array): Fk }).create(sfnt);
    if (wanted.every((w) => f.hasGlyphForCodePoint(w.uni))) { fk = f; bytes = sfnt; break; }
  }
  if (!fk || !bytes) return `The font ${label} isn't embedded, and the replacement (${rep.family}) doesn't have all the characters the file uses in it in one file.`;
  const k = 1000 / fk.unitsPerEm;
  for (const w of wanted) { const g = fk.glyphForCodePoint(w.uni)!, rw = g.advanceWidth * k; if (Math.abs(rw - w.width) > 1) return `The font ${label} isn't embedded, and the free replacement draws “${String.fromCodePoint(w.uni)}” ${Math.round(rw)} wide instead of ${Math.round(w.width)} (thousandths of the text size), which would move the text.`; }
  // rewrite the font dictionary: a TrueType font with WinAnsi encoding and the replacement's own widths (6.2.11.5)
  const first = 32, last = 255, widths: number[] = [];
  for (let c = first; c <= last; c++) { const u = WINANSI.uni.get(WINANSI.byCode.get(c) ?? ""); const g = u !== undefined && fk.hasGlyphForCodePoint(u) ? fk.glyphForCodePoint(u) : null; widths.push(g ? Math.round(g.advanceWidth * k) : 0); }
  const file = ctx.flateStream(bytes, { Length1: bytes.length });
  const flags = 32 | (rep.family === "cousine" ? 1 : 0) | (rep.family === "tinos" ? 2 : 0) | (rep.style.endsWith("italic") ? 64 : 0);
  const descriptor = ctx.obj({ Type: "FontDescriptor", FontName: N(fk.postscriptName), Flags: flags, FontBBox: [fk.bbox.minX * k, fk.bbox.minY * k, fk.bbox.maxX * k, fk.bbox.maxY * k].map(Math.round), ItalicAngle: fk.italicAngle, Ascent: Math.round(fk.ascent * k), Descent: Math.round(fk.descent * k), CapHeight: Math.round((fk.capHeight || fk.ascent) * k), StemV: rep.style.startsWith("700") ? 120 : 80, FontFile2: ctx.register(file) });
  for (const key of font.keys()) if (!["Type", "ToUnicode"].includes(key.decodeText())) font.delete(key);
  font.set(N("Subtype"), N("TrueType")); font.set(N("BaseFont"), N(fk.postscriptName)); font.set(N("Encoding"), N("WinAnsiEncoding"));
  font.set(N("FirstChar"), PDFNumber.of(first)); font.set(N("LastChar"), PDFNumber.of(last)); font.set(N("Widths"), ctx.obj(widths)); font.set(N("FontDescriptor"), ctx.register(descriptor));
  return { family: fk.postscriptName.replace(/-Regular$/, ""), label };
}

/** A font dictionary's own widths, if it has them (they override the standard metrics). */
function ownWidths(font: PDFDict, look: <T extends PDFObject>(o: PDFObject | undefined) => T | undefined): ((code: number) => number | undefined) | undefined {
  const w = look<PDFArray>(font.get(N("Widths"))), fc = look<PDFNumber>(font.get(N("FirstChar")));
  if (!(w instanceof PDFArray) || !(fc instanceof PDFNumber)) return undefined;
  const first = fc.asNumber(), arr = w.asArray().map((x) => (look<PDFNumber>(x) as PDFNumber)?.asNumber?.());
  return (c) => arr[c - first];
}

/**
 * PDF/A-2b with every page rebuilt as a picture (drawn in the browser, as Redact PDF draws its pages), for files whose
 * content can't be kept as it is. Each page keeps its size; recognised words, if any, go on top as invisible text in
 * the site's glyph-less font. The title, author and other details are carried over from the original where it can be
 * read. Nothing else is: text, links, bookmarks, form fields, comments and attachments are not copied. The result is
 * read back through the same checks as a converted file, and an error is raised if any fails (it shouldn't: pictures
 * in RGB or grey, one font this site wrote).
 */
export async function picturesToPdfA(original: Uint8Array, password: string | undefined, count: number, page: (i: number) => Promise<RedactedPage>, now = new Date()): Promise<Uint8Array> {
  let info: ReturnType<typeof infoOf> = {};
  try { info = infoOf(await PDFDocument.load(original, { updateMetadata: false, ignoreEncryption: false, ...(password !== undefined ? { password } : {}) })); } catch { /* details left out */ }
  const out = await PDFDocument.create({ updateMetadata: false });
  let glyphless: PDFRef | undefined;
  for (let i = 0; i < count; i++) {
    const r = await page(i);
    const pg = out.addPage([r.width, r.height]);
    pg.drawImage(r.png ? await out.embedPng(r.image) : await out.embedJpg(r.image), { x: 0, y: 0, width: r.width, height: r.height });
    if (r.lines?.length) addTextLayer(pg, (glyphless ??= addGlyphlessFont(out)), r.lines, (x, y) => [x / r.scale, r.height - y / r.scale]);
  }
  markPdfA(out, { ...info, producer: PRODUCER, created: info.created ?? now, modified: now }, crypto.getRandomValues(new Uint8Array(16)));
  const bytes = await out.save({ useObjectStreams: true });
  // the same checks as for a converted file
  const back = await PDFDocument.load(bytes, { updateMetadata: false });
  const scan = scanDocument(back.context, back.getPages().map((p) => p.node as unknown as PDFDict));
  const problems = [...scan.problems, ...scan.inlineProblems, ...checkFonts(back.context, scan.fonts).problems, ...checkObjects(back.context).problems];
  if (scan.device.has("cmyk")) problems.push("CMYK pictures");
  if (problems.length) throw new Error(`The rebuilt file didn't pass this tool's own PDF/A checks (${problems.join("; ")}). Please report this.`);
  return bytes;
}

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
  const t = ctx.trailerInfo; visit(t.Root); visit(t.Info as PDFObject); visit(t.ID as PDFObject);
  let n = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!reached.has(ref.toString())) { ctx.delete(ref); n++; }
  return n;
}
