// "Noto Sans (many alphabets)": the Noto Sans fonts shipped with this site (notofiles.ts, and cjkfiles.ts for Chinese,
// Japanese and Korean), used together. Only the files a piece of text needs are loaded, and each is embedded in a saved
// PDF only when used, cut down to the letters used (embedding in documents is allowed by the SIL Open Font License;
// see THIRD-PARTY.md).
import type { PDFDocument } from "@cantoo/pdf-lib";
import { multiFace, type Face, type FacePart, type FkFont } from "./face.ts";
import { NOTO_FILES, notoId, type NotoFile } from "./notofiles.ts";
import type { CjkStyle } from "./cjkfiles.ts";
import { fontkit } from "./ownfont.ts";
import { harfBuzzShaper } from "./shaper.ts";
import { woffToSfnt } from "./woff.ts";

/** Gets the WOFF bytes of a shipped file by its id (family-subset) and weight (400 regular, 700 bold). In the browser:
 *  loadNoto in notoload.ts. */
export type NotoWeight = 400 | 700;
export type NotoLoader = (id: string, weight: NotoWeight) => Promise<Uint8Array>;
/** How Han characters (shared by Chinese, Japanese and Korean, but drawn differently in each) are drawn. "auto": in the
 *  Japanese style if the text has kana, the Korean style if it has Hangul, otherwise Simplified Chinese. */
export type HanStyle = "auto" | CjkStyle;
export const HAN_STYLES: HanStyle[] = ["auto", "sc", "tc", "jp", "kr"];

// ---------- Chinese, Japanese and Korean files: their index is loaded only when needed ----------
/** Characters that may need a Chinese, Japanese or Korean file: CJK punctuation, kana, Hangul, Han, compatibility and
 *  full-width forms. Used before the index is loaded, so these are never wrongly reported as missing. */
const CJK_LIKE = /[ᄀ-ᇿ⺀-⿟　-〿぀-ヿ㄀-㆏ㆠ-ㇿ㈀-䶿一-鿿ꥠ-꥿가-퟿豈-﫿︰-﹏＀-￯]|[\u{20000}-\u{3134f}]/u;
type CjkIndex = Record<CjkStyle, NotoFile[]>;
let cjk: CjkIndex | null = null, cjkLoading: Promise<CjkIndex> | null = null;
/** Loads the index of the Chinese, Japanese and Korean files (a separate part of the site, about 60 kB). */
export function loadCjkIndex(): Promise<CjkIndex> {
  return (cjkLoading ??= import("./cjkfiles.ts").then(({ CJK_FILES }) => {
    const parse = (r: string): [number, number][] => r.split(",").map((p) => { const [a, b] = p.split("-"); return [parseInt(a, 16), parseInt(b ?? a, 16)]; });
    const idx = Object.fromEntries((Object.keys(CJK_FILES) as CjkStyle[]).map((k) => [k, CJK_FILES[k].files.map(([subset, r]) => ({ family: CJK_FILES[k].family, subset, ranges: parse(r) }))])) as CjkIndex;
    return (cjk = idx);
  }));
}
export const needsCjk = (text: string) => CJK_LIKE.test(text);
/** The Chinese/Japanese/Korean style used for `text`. */
export function hanStyleFor(text: string, style: HanStyle): CjkStyle {
  if (style !== "auto") return style;
  return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) ? "jp" : /\p{Script=Hangul}/u.test(text) ? "kr" : "sc";
}
/** All shipped files in the order they are tried for `text`: the alphabets, then the chosen CJK style, then the others. */
export function notoOrder(text: string, style: HanStyle): NotoFile[] {
  if (!cjk) return NOTO_FILES;
  const first = hanStyleFor(text, style);
  return [...NOTO_FILES, ...cjk[first], ...(["sc", "tc", "jp", "kr"] as CjkStyle[]).filter((s) => s !== first).flatMap((s) => cjk![s])];
}

const covers = (f: NotoFile, cp: number) => f.ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
const ignorable = (c: string) => /[\p{Cc}\p{Zs}]/u.test(c);
/** The files needed for `text`: for each character, the first file in order that covers it. */
export function notoFilesFor(text: string, style: HanStyle = "auto"): NotoFile[] {
  const order = notoOrder(text, style), need = new Set<NotoFile>();
  // spaces are drawn in the font of the text around them (every shipped file has a space), so they need no file of their own
  for (const c of text) { if (ignorable(c)) continue; const f = order.find((x) => covers(x, c.codePointAt(0)!)); if (f) need.add(f); }
  return order.filter((f) => need.has(f));   // keep the order
}
/** Characters of `text` that no shipped Noto file covers. Before the CJK index is loaded, CJK-like characters are not reported. */
export const notoMissing = (text: string): string[] => [...new Set([...text].filter((c) => !ignorable(c) && !/\p{Cf}/u.test(c)
  && !(cjk === null && CJK_LIKE.test(c)) && !notoOrder("", "sc").some((f) => covers(f, c.codePointAt(0)!))))];

type Ready = { id: string; bytes: Uint8Array; fk: FkFont; shape: FacePart["shape"] };
/** Loads, unpacks and readies shipped files once per page visit, whatever document they go into. */
export function notoLibrary(load: NotoLoader) {
  const cache = new Map<string, Promise<Ready>>();
  return (f: NotoFile, weight: NotoWeight = 400): Promise<Ready> => {
    const id = notoId(f), key = `${id}@${weight}`; let r = cache.get(key);
    if (!r) cache.set(key, (r = (async () => {
      const bytes = woffToSfnt(await load(id, weight)), fk = (await fontkit()).create(bytes) as FkFont;
      return { id, bytes, fk, shape: await harfBuzzShaper(bytes) };
    })()));
    return r;
  };
}

/** A face for `doc` using the shipped Noto files, regular or bold (the fonts' own bold design). Call prepare(text)
 *  before measuring or drawing `text`. */
export function notoFace(doc: PDFDocument, library: ReturnType<typeof notoLibrary>, style: HanStyle = "auto", bold = false): Face {
  const parts = new Map<string, FacePart>(), embedding = new Map<string, Promise<void>>();
  const ordered = (text: string) => notoOrder(text, style).map((f) => parts.get(notoId(f))).filter((p): p is FacePart => !!p);
  const face = multiFace(ordered);
  face.prepare = async (text: string) => {
    if (needsCjk(text)) await loadCjkIndex();
    // each line separately: the automatic Chinese/Japanese/Korean style is chosen per line, as when it is drawn
    const files = new Set(text.split("\n").flatMap((line) => notoFilesFor(line, style)));
    await Promise.all([...files].map((f) => {
      const id = notoId(f); let e = embedding.get(id);
      if (!e) embedding.set(id, (e = (async () => {
        const r = await library(f, bold ? 700 : 400);
        doc.registerFontkit((await fontkit()) as never);
        parts.set(id, { fk: r.fk, shape: r.shape, font: await doc.embedFont(r.bytes, { subset: true }) });
      })()));
      return e;
    }));
    // a line of nothing but spaces still needs a font with a space in it
    if (/\p{Zs}/u.test(text) && ![...parts.values()].some((p) => p.fk.hasGlyphForCodePoint(32))) await face.prepare!("a");
  };
  // Missing: characters no shipped file covers, and characters a loaded file was expected to have but doesn't.
  const missing = face.missing;
  face.missing = (t) => [...new Set([...notoMissing(t), ...missing(t).filter((c) => { const fs = notoFilesFor(c, style); return fs.length > 0 && fs.every((f) => parts.has(notoId(f))); })])];
  return face;
}
