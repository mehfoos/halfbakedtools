// "Your own font": a font file the visitor picks from their device. It is read here, in the browser; it is never
// uploaded and never kept after the page is closed (it is not written into settings files either).
import type { PDFDocument } from "@cantoo/pdf-lib";
import { checkEmbedding, fsTypeOf, ownFace, type Face, type FkFont } from "./face.ts";
import { harfBuzzShaper } from "./shaper.ts";

export type OwnFont = { bytes: Uint8Array; postscriptName?: string; index?: number; subset: boolean; name: string; note?: string };   // index: face number in a collection
export type FontFace = { postscriptName: string; name: string };
type Fontkit = { create(b: Uint8Array, postscriptName?: string): unknown };

export const FONT_FILE_MAX = 64 * 1024 * 1024;   // bytes; bigger files are refused (the largest common CJK fonts are about 20 MB)
export const FONT_ACCEPT = ".ttf,.otf,.ttc,.otc,.woff,.woff2,font/ttf,font/otf,font/collection,font/woff,font/woff2";

let loading: Promise<Fontkit> | null = null;
/** The font reader (fontkit), loaded on first use. */
export const fontkit = (): Promise<Fontkit> => (loading ??= import("@cantoo/fontkit").then((m) => ((m as { default?: Fontkit }).default ?? m) as Fontkit));

const label = (f: FkFont) => f.fullName || [f.familyName, f.postscriptName].filter(Boolean).join(" ") || "Unnamed font";

/** The faces in a font file (one, or several for a collection). Throws if the file is not a font fontkit can read. */
export async function fontFaces(bytes: Uint8Array): Promise<FontFace[]> {
  if (bytes.length > FONT_FILE_MAX) throw new Error("This font file is too big (over 64 MB).");
  let f: unknown;
  try { f = (await fontkit()).create(bytes); } catch { throw new Error("This file isn't a font this tool can read. TrueType (.ttf), OpenType (.otf), collections (.ttc) and web fonts (.woff, .woff2) work."); }
  const list = (f as { fonts?: FkFont[] }).fonts ?? [f as FkFont];
  return list.map((x) => ({ postscriptName: x.postscriptName, name: label(x) }));
}

/** Checks one face of a font file and gets it ready to use. Returns a reason in words if it can't be used. */
export async function prepareOwnFont(bytes: Uint8Array, postscriptName?: string): Promise<OwnFont | { reason: string }> {
  let fk: FkFont;
  try { fk = (await fontkit()).create(bytes, postscriptName) as FkFont; } catch { return { reason: "this file isn't a font this tool can read" }; }
  if (!fk || typeof fk.getGlyph !== "function") return { reason: "this file isn't a font this tool can read" };
  const check = checkEmbedding(fsTypeOf(fk));
  if (!check.ok) return { reason: check.reason };
  // the face name is only passed on for collections: for a single font, fontkit reads a second argument as a variation name
  const index = postscriptName ? (await fontFaces(bytes)).findIndex((f) => f.postscriptName === postscriptName) : 0;
  return { bytes, ...(postscriptName ? { postscriptName, index: Math.max(0, index) } : {}), subset: check.subset, name: label(fk), ...(check.note ? { note: check.note } : {}) };
}

/** Embeds the font in `doc` (only the letters drawn, unless its maker forbids cutting it down) and returns a face to draw with. */
export async function embedOwnFont(doc: PDFDocument, own: OwnFont): Promise<Face> {
  const fk = await fontkit();
  doc.registerFontkit(fk as never);
  const font = await doc.embedFont(own.bytes, { subset: own.subset, ...(own.postscriptName ? { postscriptName: own.postscriptName } : {}) } as never);
  return ownFace(fk.create(own.bytes, own.postscriptName) as FkFont, font, await harfBuzzShaper(own.bytes, own.index ?? 0));
}
