// The working session: which files were added, and the list of pages to produce. Pure; no DOM.
//
// A session never holds document content. It records each source file by name, size and SHA-256
// checksum (a fingerprint of the file), plus the list of edits. That is what the downloadable
// settings file contains, so a visitor can add the same files again later and carry on.
import { parseRanges } from "./ranges.ts";
import { NO_COMPRESSION, type CompressOptions } from "./compress-core.ts";
import { cleanMark, type Mark } from "./marks.ts";
import { NO_IMAGE_LAYOUT, cleanImageLayout, type ImageLayout } from "./layout.ts";
import { NO_CROP, cleanCrop, type CropOptions } from "./crop.ts";
import { NO_NUMBERS, cleanNumbers, NO_WATERMARK, cleanWatermark, type NumberOptions, type WatermarkOptions } from "./stamps.ts";

export const FORMAT = "halfbakedtools.pdf-tools.settings";
export const VERSION = 1;

export type Rotation = 0 | 90 | 180 | 270;
export type SourceRef = { id: string; name: string; size: number; sha256: string; pages: number; kind: "pdf" | "image" };
/** One output page: page `page` (from 0) of source `src`, turned by `rotate` degrees clockwise on top of
 *  any rotation already in the file, and resized with its contents by `scale` (1 = unchanged). */
export type PageItem = { src: string; page: number; rotate: Rotation; scale: number; marks?: Mark[] };
export type OutputFormat = "pdf" | "png" | "jpeg" | "webp" | "bmp" | "tiff" | "txt";
export type SplitMode = "none" | "every" | "ranges" | "each";
export type Output = {
  name: string;          // file name without extension
  format: OutputFormat;
  split: SplitMode;      // PDF only
  every: number;         // pages per file when split = "every"
  ranges: string;        // e.g. "1-3, 4-10" when split = "ranges": one file per comma-separated group
  dpi: number;           // dots per inch when saving pages as images
  quality: number;       // 0.1-1 for JPEG and WebP
  imageDpi: number;      // dots per inch assumed when placing an added image on a page
  images: ImageLayout;       // how pictures sit on their pages (absent in older settings files)
  crop: CropOptions;         // PDF only: margins hidden when saving (absent in older settings files)
  numbers: NumberOptions;    // PDF only: page numbers added when saving (absent in older settings files)
  watermark: WatermarkOptions; // PDF only: text drawn across every page when saving (absent in older settings files)
  compress: CompressOptions; // PDF only: shrink the pictures inside the saved PDF (added later; absent in older settings files)
};
export type Session = { sources: SourceRef[]; pages: PageItem[]; output: Output };

export const DEFAULT_OUTPUT: Output = {
  name: "document", format: "pdf", split: "none", every: 1, ranges: "", dpi: 150, quality: 0.85, imageDpi: 96, compress: { ...NO_COMPRESSION }, crop: { ...NO_CROP }, images: { ...NO_IMAGE_LAYOUT }, numbers: { ...NO_NUMBERS }, watermark: { ...NO_WATERMARK },
};
export const SCALE_MIN = 0.1, SCALE_MAX = 10;
export const DPI_MIN = 36, DPI_MAX = 600;

export const emptySession = (): Session => ({ sources: [], pages: [], output: { ...DEFAULT_OUTPUT, compress: { ...NO_COMPRESSION }, crop: { ...NO_CROP }, images: { ...NO_IMAGE_LAYOUT }, numbers: { ...NO_NUMBERS }, watermark: { ...NO_WATERMARK } } });

/** Adds a source and appends all its pages. If the session is already waiting for this file
 *  (same checksum, from a loaded settings file), it is matched instead and no pages are added. */
export function addSource(s: Session, ref: Omit<SourceRef, "id">, appendPages = true): { session: Session; id: string; matched: boolean } {
  const known = s.sources.find((x) => x.sha256 === ref.sha256);
  if (known) return { session: s, id: known.id, matched: true };
  let n = s.sources.length + 1;
  while (s.sources.some((x) => x.id === `f${n}`)) n++;
  const id = `f${n}`;
  // appendPages = false: a picture added to be placed on a page, not to become a page itself
  const pages = appendPages ? Array.from({ length: ref.pages }, (_, page): PageItem => ({ src: id, page, rotate: 0, scale: 1 })) : [];
  return { session: { ...s, sources: [...s.sources, { ...ref, id }], pages: [...s.pages, ...pages] }, id, matched: false };
}

/** Removes a source, every page that came from it, and every picture placed from it. */
export const removeSource = (s: Session, id: string): Session => ({
  ...s, sources: s.sources.filter((x) => x.id !== id),
  pages: s.pages.filter((p) => p.src !== id).map((p) => (p.marks?.some((m) => m.type === "image" && m.src === id) ? withMarks(p, p.marks.filter((m) => !(m.type === "image" && m.src === id))) : p)),
});

/** A copy of the page with these marks (none = the field is left out, keeping settings files tidy). */
export const withMarks = (p: PageItem, marks: Mark[]): PageItem => {
  const { marks: _old, ...rest } = p;
  return marks.length ? { ...rest, marks } : rest;
};
/** Replaces the marks on the page at `index`. */
export function setMarks(pages: PageItem[], index: number, marks: Mark[], sel: number[] = []): Edit {
  return { pages: pages.map((p, i) => (i === index ? withMarks(p, marks) : p)), sel };
}
/** How many times a source is used: as pages, and as pictures placed on pages. */
export const usage = (s: Session, id: string) => s.pages.reduce((n, p) => n + (p.src === id ? 1 : 0) + (p.marks?.filter((m) => m.type === "image" && m.src === id).length ?? 0), 0);

// --- Page list edits. `sel` is a list of positions in `pages`; each returns the new list and new selection. ---
export type Edit = { pages: PageItem[]; sel: number[] };
const uniq = (sel: number[], len: number) => [...new Set(sel)].filter((i) => i >= 0 && i < len).sort((a, b) => a - b);

/** Moves the selected pages one place earlier (dir -1) or later (dir +1), keeping their order. */
export function nudge(pages: PageItem[], selIn: number[], dir: -1 | 1): Edit {
  const sel = uniq(selIn, pages.length), out = [...pages], chosen = new Set(sel);
  const order = dir < 0 ? sel : [...sel].reverse();
  const moved: number[] = [];
  for (const i of order) {
    const j = i + dir;
    if (j < 0 || j >= out.length || chosen.has(j)) { moved.push(i); continue; }
    [out[i], out[j]] = [out[j], out[i]];
    chosen.delete(i); chosen.add(j); moved.push(j);
  }
  return { pages: out, sel: moved.sort((a, b) => a - b) };
}

/** Moves the selected pages, in order, so that they sit just before the page currently at `before`
 *  (`before` = pages.length puts them at the end). */
export function moveTo(pages: PageItem[], selIn: number[], before: number): Edit {
  const sel = uniq(selIn, pages.length), chosen = new Set(sel);
  const picked = sel.map((i) => pages[i]);
  const rest = pages.filter((_, i) => !chosen.has(i));
  const at = Math.max(0, Math.min(pages.length, before)) - sel.filter((i) => i < before).length;
  return { pages: [...rest.slice(0, at), ...picked, ...rest.slice(at)], sel: picked.map((_, k) => at + k) };
}

/** Copies each selected page; the copy goes straight after the original and becomes the selection. */
export function duplicate(pages: PageItem[], selIn: number[]): Edit {
  const chosen = new Set(uniq(selIn, pages.length)), out: PageItem[] = [], sel: number[] = [];
  pages.forEach((p, i) => { out.push(p); if (chosen.has(i)) { out.push({ ...p }); sel.push(out.length - 1); } });
  return { pages: out, sel };
}

export function remove(pages: PageItem[], selIn: number[]): Edit {
  const chosen = new Set(selIn);
  return { pages: pages.filter((_, i) => !chosen.has(i)), sel: [] };
}

/** Turns the selected pages by `by` degrees clockwise (a multiple of 90; negative = anticlockwise). */
export function rotate(pages: PageItem[], selIn: number[], by: number): Edit {
  const chosen = new Set(selIn);
  return { pages: pages.map((p, i) => chosen.has(i) ? { ...p, rotate: ((((p.rotate + by) % 360) + 360) % 360) as Rotation } : p), sel: uniq(selIn, pages.length) };
}

/** Sets the size of the selected pages, with their contents, to `scale` times the original. */
export function setScale(pages: PageItem[], selIn: number[], scale: number): Edit {
  if (!(scale >= SCALE_MIN && scale <= SCALE_MAX)) throw new Error(`Size must be between ${SCALE_MIN * 100}% and ${SCALE_MAX * 100}%.`);
  const chosen = new Set(selIn);
  return { pages: pages.map((p, i) => chosen.has(i) ? { ...p, scale } : p), sel: uniq(selIn, pages.length) };
}

// --- Output plan ---
export type PlannedFile = { name: string; pages: PageItem[] };

/** Which PDF files to write, and which pages go in each. */
export function planFiles(pages: PageItem[], out: Pick<Output, "name" | "split" | "every" | "ranges">): PlannedFile[] {
  const base = safeName(out.name);
  if (!pages.length) throw new Error("There are no pages to save.");
  let groups: PageItem[][];
  if (out.split === "none") groups = [pages];
  else if (out.split === "each") groups = pages.map((p) => [p]);
  else if (out.split === "every") {
    if (!Number.isInteger(out.every) || out.every < 1) throw new Error("Pages per file must be a whole number, 1 or more.");
    groups = [];
    for (let i = 0; i < pages.length; i += out.every) groups.push(pages.slice(i, i + out.every));
  } else {
    const r = parseRanges(out.ranges, pages.length);
    if (!r.ok) throw new Error(r.error);
    groups = r.groups.map((g) => g.map((i) => pages[i]));
  }
  if (groups.length === 1) return [{ name: `${base}.pdf`, pages: groups[0] }];
  const width = String(groups.length).length;
  return groups.map((g, i) => ({ name: `${base}-${String(i + 1).padStart(width, "0")}.pdf`, pages: g }));
}

/** The default output name for work started from `fileName`: its name without the extension, plus a suffix
 *  ("report.pdf" + "merged" -> "report-merged"), so the result can't be mistaken for, or saved over, the original. */
export function defaultName(fileName: string, suffix: string): string {
  const base = safeName(fileName.replace(/\.[^.]+$/, ""));
  return suffix ? `${base}-${suffix}` : base;
}

/** Output file names that match the name of a file the visitor added (ignoring capitals). Saving one of these
 *  into the same folder as the original could replace it, so the tool asks first. */
export function clashes(outputs: string[], sourceNames: string[]): string[] {
  const taken = new Set(sourceNames.map((n) => n.trim().toLowerCase()));
  return [...new Set(outputs.filter((n) => taken.has(n.trim().toLowerCase())))];
}

/** A file name without characters that file systems reject. */
export function safeName(name: string): string {
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/\.+$/, "");
  return s || "document";
}

// --- Settings file ---
export function serialise(s: Session): string {
  return JSON.stringify({
    format: FORMAT, version: VERSION,
    note: "Settings for the PDF tools at halfbakedtools.com. This file holds no document content: add the files listed under 'sources' again, then load this file, to carry on.",
    sources: s.sources, pages: s.pages, output: s.output,
  }, null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function parseCompress(c: unknown): CompressOptions {
  if (!isObj(c)) return { ...NO_COMPRESSION };
  return {
    mode: (["none", "tidy", "images", "flatten"] as const).find((m) => m === c.mode) ?? "none",
    dpi: num(c.dpi, DPI_MIN, DPI_MAX) ? (c.dpi as number) : NO_COMPRESSION.dpi,
    quality: num(c.quality, 0.1, 1) ? (c.quality as number) : NO_COMPRESSION.quality,
    grey: c.grey === true,
  };
}

/** Reads a settings file, checking every field. Throws an Error with a plain-English message if it isn't valid. */
export function parseSettings(text: string): Session {
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new Error("That file isn't a settings file from this tool (it isn't valid JSON)."); }
  if (!isObj(j) || j.format !== FORMAT) throw new Error("That file isn't a settings file from this tool.");
  if (!int(j.version, 1)) throw new Error("The settings file has no version number.");
  if ((j.version as number) > VERSION) throw new Error("The settings file was made by a newer version of this tool. Reload the page and try again.");
  if (!Array.isArray(j.sources) || !Array.isArray(j.pages)) throw new Error("The settings file is incomplete.");

  const sources: SourceRef[] = j.sources.map((x: unknown, i: number) => {
    if (!isObj(x) || typeof x.id !== "string" || !x.id || typeof x.name !== "string" || !int(x.size, 0) || !int(x.pages, 1)
      || typeof x.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(x.sha256) || (x.kind !== "pdf" && x.kind !== "image")) {
      throw new Error(`The settings file's source ${i + 1} is damaged.`);
    }
    return { id: x.id, name: x.name, size: x.size as number, sha256: x.sha256, pages: x.pages as number, kind: x.kind };
  });
  if (new Set(sources.map((x) => x.id)).size !== sources.length) throw new Error("The settings file lists the same source twice.");
  const byId = new Map(sources.map((x) => [x.id, x]));

  const pages: PageItem[] = j.pages.map((x: unknown, i: number) => {
    const src = isObj(x) && typeof x.src === "string" ? byId.get(x.src) : undefined;
    if (!isObj(x) || !src || !int(x.page, 0, src.pages - 1) || ![0, 90, 180, 270].includes(x.rotate as number) || !num(x.scale, SCALE_MIN, SCALE_MAX)) {
      throw new Error(`The settings file's page ${i + 1} is damaged.`);
    }
    const item: PageItem = { src: src.id, page: x.page as number, rotate: x.rotate as Rotation, scale: x.scale as number };
    if (x.marks === undefined) return item;
    if (!Array.isArray(x.marks) || x.marks.length > 2000) throw new Error(`The settings file's page ${i + 1} is damaged.`);
    const marks = x.marks.map((m: unknown) => cleanMark(m, (id) => byId.get(id)?.kind === "image"));
    if (marks.some((m) => m === null)) throw new Error(`The settings file's page ${i + 1} has a damaged addition.`);
    return withMarks(item, marks as Mark[]);
  });

  const o = isObj(j.output) ? j.output : {};
  const d = DEFAULT_OUTPUT;
  const output: Output = {
    name: typeof o.name === "string" ? safeName(o.name) : d.name,
    format: (["pdf", "png", "jpeg", "webp", "bmp", "tiff", "txt"] as const).find((f) => f === o.format) ?? d.format,
    split: (["none", "every", "ranges", "each"] as const).find((f) => f === o.split) ?? d.split,
    every: int(o.every, 1) ? (o.every as number) : d.every,
    ranges: typeof o.ranges === "string" ? o.ranges : d.ranges,
    dpi: num(o.dpi, DPI_MIN, DPI_MAX) ? (o.dpi as number) : d.dpi,
    quality: num(o.quality, 0.1, 1) ? (o.quality as number) : d.quality,
    imageDpi: num(o.imageDpi, DPI_MIN, DPI_MAX) ? (o.imageDpi as number) : d.imageDpi,
    compress: parseCompress(o.compress),
    crop: cleanCrop(o.crop),
    images: cleanImageLayout(o.images),
    numbers: cleanNumbers(o.numbers),
    watermark: cleanWatermark(o.watermark),
  };
  return { sources, pages, output };
}
