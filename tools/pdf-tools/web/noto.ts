// "Noto Sans (many alphabets)": the Noto Sans fonts shipped with this site (notofiles.ts), used together. Only the
// files a piece of text needs are loaded, and each is embedded in a saved PDF only when used, cut down to the letters
// used (embedding in documents is allowed by the SIL Open Font License; see THIRD-PARTY.md).
import type { PDFDocument } from "@cantoo/pdf-lib";
import { multiFace, type Face, type FacePart, type FkFont } from "./face.ts";
import { NOTO_FILES, notoId, type NotoFile } from "./notofiles.ts";
import { fontkit } from "./ownfont.ts";
import { harfBuzzShaper } from "./shaper.ts";
import { woffToSfnt } from "./woff.ts";

/** Gets the WOFF bytes of a shipped file by its id (family-subset). In the browser: loadNoto in notoload.ts. */
export type NotoLoader = (id: string) => Promise<Uint8Array>;

const covers = (f: NotoFile, cp: number) => f.ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
const ignorable = (c: string) => /[\p{Cc}\p{Zs}]/u.test(c);
/** The files needed for `text`: for each character, the first file in order that covers it. */
export function notoFilesFor(text: string): NotoFile[] {
  const need = new Set<NotoFile>();
  for (const c of text) { if (ignorable(c) && c !== " ") continue; const f = NOTO_FILES.find((x) => covers(x, c.codePointAt(0)!)); if (f) need.add(f); }
  return NOTO_FILES.filter((f) => need.has(f));   // keep the order of NOTO_FILES
}
/** Characters of `text` that no shipped Noto file covers. */
export const notoMissing = (text: string): string[] => [...new Set([...text].filter((c) => !ignorable(c) && !/\p{Cf}/u.test(c) && !NOTO_FILES.some((f) => covers(f, c.codePointAt(0)!))))];

type Ready = { id: string; bytes: Uint8Array; fk: FkFont; shape: FacePart["shape"] };
/** Loads, unpacks and readies shipped files once per page visit, whatever document they go into. */
export function notoLibrary(load: NotoLoader) {
  const cache = new Map<string, Promise<Ready>>();
  return (f: NotoFile): Promise<Ready> => {
    const id = notoId(f); let r = cache.get(id);
    if (!r) cache.set(id, (r = (async () => {
      const bytes = woffToSfnt(await load(id)), fk = (await fontkit()).create(bytes) as FkFont;
      return { id, bytes, fk, shape: await harfBuzzShaper(bytes) };
    })()));
    return r;
  };
}

/** A face for `doc` using the shipped Noto files. Call prepare(text) before measuring or drawing `text`. */
export function notoFace(doc: PDFDocument, library: ReturnType<typeof notoLibrary>): Face {
  const parts = new Map<string, FacePart>(), embedding = new Map<string, Promise<void>>();
  const ordered = () => NOTO_FILES.map((f) => parts.get(notoId(f))).filter((p): p is FacePart => !!p);
  const face = multiFace(ordered);
  face.prepare = async (text: string) => {
    await Promise.all(notoFilesFor(text).map((f) => {
      const id = notoId(f); let e = embedding.get(id);
      if (!e) embedding.set(id, (e = (async () => {
        const r = await library(f);
        doc.registerFontkit((await fontkit()) as never);
        parts.set(id, { fk: r.fk, shape: r.shape, font: await doc.embedFont(r.bytes, { subset: true }) });
      })()));
      return e;
    }));
  };
  // Missing: characters no shipped file covers, and characters a loaded file was expected to have but doesn't.
  const missing = face.missing;
  face.missing = (t) => [...new Set([...notoMissing(t), ...missing(t).filter((c) => notoFilesFor(c).every((f) => parts.has(notoId(f))))])];
  return face;
}
