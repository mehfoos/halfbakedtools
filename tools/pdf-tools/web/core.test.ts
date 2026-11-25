import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, StandardFonts, degrees, PDFOperator, PDFOperatorNames, PDFNumber, PDFArray as PArr } from "@cantoo/pdf-lib";
import { parseRanges, parsePageList, formatRanges } from "./ranges.ts";
import {
  emptySession, addSource, removeSource, nudge, moveTo, duplicate, remove, rotate, setScale, planFiles, safeName,
  serialise, parseSettings, FORMAT, defaultName, clashes, type PageItem,
} from "./session.ts";
import { makeBuilder, inspectPdf, type SourceData } from "./build.ts";
import { encodeBmp } from "./bmp.ts";
import { piecesToText, pagesToText } from "./text.ts";
import { jpegOrientation, orientationToRotation } from "./exif.ts";

const SHA = (c: string) => c.repeat(64);
const P = (src: string, page: number): PageItem => ({ src, page, rotate: 0, scale: 1 });
const ids = (pages: PageItem[]) => pages.map((p) => `${p.src}:${p.page}`).join(" ");

// ---- ranges ----
test("ranges: pages, ranges, open ranges and reverse ranges", () => {
  assert.deepEqual(parseRanges("1-3, 5, 8-", 10), { ok: true, groups: [[0, 1, 2], [4], [7, 8, 9]] });
  assert.deepEqual(parseRanges("-2; 4 to 3", 5), { ok: true, groups: [[0, 1], [3, 2]] });
  assert.deepEqual(parsePageList("2,2", 3), { ok: true, pages: [1, 1] });
});
test("ranges: rejects nonsense and out-of-range pages", () => {
  for (const bad of ["", "abc", "0", "4", "1-9", "-", "1.5", "1-2-3"]) assert.equal(parseRanges(bad, 3).ok, false, bad);
});
test("ranges: formats back to text", () => {
  assert.equal(formatRanges([0, 1, 2, 4, 6, 7]), "1-3, 5, 7-8");
  assert.equal(formatRanges([]), "");
});

// ---- session edits ----
const five = [P("a", 0), P("a", 1), P("a", 2), P("a", 3), P("a", 4)];
test("session: adding a source appends its pages; removing it removes them", () => {
  let s = emptySession();
  const a = addSource(s, { name: "a.pdf", size: 10, sha256: SHA("a"), pages: 2, kind: "pdf" });
  const b = addSource(a.session, { name: "b.pdf", size: 20, sha256: SHA("b"), pages: 1, kind: "pdf" });
  s = b.session;
  assert.equal(ids(s.pages), "f1:0 f1:1 f2:0");
  const again = addSource(s, { name: "renamed.pdf", size: 10, sha256: SHA("a"), pages: 2, kind: "pdf" });
  assert.equal(again.matched, true); assert.equal(again.id, "f1"); assert.equal(again.session.pages.length, 3);
  assert.equal(ids(removeSource(s, "f1").pages), "f2:0");
});
test("session: nudge moves a selection one place and stops at the ends", () => {
  let e = nudge(five, [1, 2], -1);
  assert.equal(ids(e.pages), "a:1 a:2 a:0 a:3 a:4"); assert.deepEqual(e.sel, [0, 1]);
  e = nudge(e.pages, e.sel, -1);
  assert.equal(ids(e.pages), "a:1 a:2 a:0 a:3 a:4"); assert.deepEqual(e.sel, [0, 1]);
  e = nudge(five, [0, 3], 1);
  assert.equal(ids(e.pages), "a:1 a:0 a:2 a:4 a:3"); assert.deepEqual(e.sel, [1, 4]);
});
test("session: moveTo places the selection before a given page", () => {
  let e = moveTo(five, [0, 1], 4);
  assert.equal(ids(e.pages), "a:2 a:3 a:0 a:1 a:4"); assert.deepEqual(e.sel, [2, 3]);
  e = moveTo(five, [3, 4], 0);
  assert.equal(ids(e.pages), "a:3 a:4 a:0 a:1 a:2"); assert.deepEqual(e.sel, [0, 1]);
  e = moveTo(five, [1], 5);
  assert.equal(ids(e.pages), "a:0 a:2 a:3 a:4 a:1"); assert.deepEqual(e.sel, [4]);
});
test("session: duplicate, remove, rotate and resize", () => {
  const d = duplicate(five, [0, 4]);
  assert.equal(ids(d.pages), "a:0 a:0 a:1 a:2 a:3 a:4 a:4"); assert.deepEqual(d.sel, [1, 6]);
  assert.equal(ids(remove(five, [0, 2]).pages), "a:1 a:3 a:4");
  assert.deepEqual(rotate(five, [0], -90).pages[0].rotate, 270);
  assert.deepEqual(rotate(rotate(five, [0], 270).pages, [0], 180).pages[0].rotate, 90);
  assert.equal(setScale(five, [1], 0.5).pages[1].scale, 0.5);
  assert.equal(setScale(five, [1], 0.5).pages[0].scale, 1);
  assert.throws(() => setScale(five, [1], 0));
  assert.equal(five[0].rotate, 0, "edits don't change the original list");
});
test("session: planFiles for each split mode", () => {
  const o = { name: "out", every: 2, ranges: "1-2, 5, 3-4" };
  assert.deepEqual(planFiles(five, { ...o, split: "none" }).map((f) => [f.name, f.pages.length]), [["out.pdf", 5]]);
  assert.deepEqual(planFiles(five, { ...o, split: "every" }).map((f) => [f.name, f.pages.length]), [["out-1.pdf", 2], ["out-2.pdf", 2], ["out-3.pdf", 1]]);
  assert.equal(planFiles(five, { ...o, split: "each" }).length, 5);
  assert.deepEqual(planFiles(five, { ...o, split: "ranges" }).map((f) => ids(f.pages)), ["a:0 a:1", "a:4", "a:2 a:3"]);
  assert.throws(() => planFiles(five, { ...o, split: "ranges", ranges: "9" }));
  assert.throws(() => planFiles([], { ...o, split: "none" }));
  assert.equal(planFiles(Array.from({ length: 12 }, (_, i) => P("a", i)), { ...o, split: "each" })[0].name, "out-01.pdf");
});
test("session: safeName strips characters file systems reject", () => {
  assert.equal(safeName(' a/b:c*?"<>| '), "a b c");
  assert.equal(safeName("..."), "document");
});

// ---- settings file ----
test("settings: round trip keeps everything and holds no content", () => {
  let s = addSource(emptySession(), { name: "a.pdf", size: 10, sha256: SHA("a"), pages: 3, kind: "pdf" }).session;
  s = { ...s, pages: setScale(rotate(s.pages, [1], 90).pages, [2], 2).pages, output: { ...s.output, name: "x", split: "every", every: 2, format: "jpeg" } };
  const text = serialise(s);
  assert.deepEqual(parseSettings(text), s);
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ["format", "note", "output", "pages", "sources", "version"]);
});
test("settings: rejects other files, damaged entries and newer versions", () => {
  const good = JSON.parse(serialise(addSource(emptySession(), { name: "a.pdf", size: 10, sha256: SHA("a"), pages: 3, kind: "pdf" }).session));
  const bad = (change: (j: any) => void) => { const j = structuredClone(good); change(j); return JSON.stringify(j); };
  assert.throws(() => parseSettings("not json"), /JSON/);
  assert.throws(() => parseSettings("{}"), /isn't a settings file/);
  assert.throws(() => parseSettings(bad((j) => { j.version = 99; })), /newer version/);
  assert.throws(() => parseSettings(bad((j) => { j.pages[0].page = 3; })), /page 1 is damaged/);
  assert.throws(() => parseSettings(bad((j) => { j.pages[0].src = "nope"; })), /damaged/);
  assert.throws(() => parseSettings(bad((j) => { j.pages[0].rotate = 45; })), /damaged/);
  assert.throws(() => parseSettings(bad((j) => { j.pages[0].scale = 1000; })), /damaged/);
  assert.throws(() => parseSettings(bad((j) => { j.sources[0].sha256 = "xyz"; })), /source 1 is damaged/);
  assert.throws(() => parseSettings(bad((j) => { j.sources.push(j.sources[0]); })), /twice/);
  const loose = parseSettings(bad((j) => { j.output = { dpi: 99999, format: "exe" }; }));
  assert.equal(loose.output.dpi, 150); assert.equal(loose.output.format, "pdf");
  assert.equal(good.format, FORMAT);
});

// ---- building PDFs ----
/** A PDF whose page n (from 0) is (100+n) x 200 points, so pages can be told apart by width. */
async function sample(pages: number, rotated = false): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) { const p = doc.addPage([100 + i, 200]); p.drawText(`p${i}`, { x: 10, y: 100, size: 12 }); if (rotated) p.setRotation(degrees(90)); }
  return doc.save();
}
// 1x1 red PNG
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth() * 100) / 100);

test("build: merges, reorders, repeats and drops pages", async () => {
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: await sample(3) }], ["b", { kind: "pdf", bytes: await sample(2) }]]);
  const build = makeBuilder(data, { imageDpi: 96 });
  const b2 = { ...P("b", 1) };   // b's second page (width 101)
  const out = await build([P("a", 2), b2, P("a", 0), P("a", 2), P("a", 2)]);
  assert.deepEqual(await widths(out), [102, 101, 100, 102, 102]);
  assert.equal((await inspectPdf(out)).pages, 5);
});
test("build: repeated pages are independent copies", async () => {
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: await sample(1) }]]);
  const out = await makeBuilder(data, { imageDpi: 96 })([P("a", 0), { ...P("a", 0), rotate: 90 }, { ...P("a", 0), scale: 2 }]);
  const pages = (await PDFDocument.load(out)).getPages();
  assert.deepEqual(pages.map((p) => p.getRotation().angle), [0, 90, 0]);
  assert.deepEqual(pages.map((p) => p.getWidth()), [100, 100, 200]);
  assert.deepEqual(pages.map((p) => p.getHeight()), [200, 200, 400]);
});
test("build: rotation adds to the rotation already in the file", async () => {
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: await sample(1, true) }]]);
  const out = await makeBuilder(data, { imageDpi: 96 })([{ ...P("a", 0), rotate: 270 }, { ...P("a", 0), rotate: 180 }]);
  assert.deepEqual((await PDFDocument.load(out)).getPages().map((p) => p.getRotation().angle), [0, 270]);
});
test("build: an image becomes a page sized from its pixels and the chosen dots per inch", async () => {
  const data = new Map<string, SourceData>([["i", { kind: "image", bytes: PNG, type: "png" }]]);
  const at96 = await makeBuilder(data, { imageDpi: 96 })([P("i", 0)]);
  const at72 = await makeBuilder(data, { imageDpi: 72 })([P("i", 0), { ...P("i", 0), scale: 3 }]);
  assert.deepEqual(await widths(at96), [0.75]);
  assert.deepEqual(await widths(at72), [1, 3]);
});
test("build: one builder can write several files; missing sources are reported", async () => {
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: await sample(4) }]]);
  const build = makeBuilder(data, { imageDpi: 96 });
  const pages = [0, 1, 2, 3].map((i) => P("a", i));
  const files = await Promise.all(planFiles(pages, { name: "s", split: "every", every: 3, ranges: "" }).map((f) => build(f.pages)));
  assert.deepEqual(await Promise.all(files.map(widths)), [[100, 101, 102], [103]]);
  await assert.rejects(build([P("zzz", 0)]), /hasn't been added/);
  await assert.rejects(build([]), /no pages/);
});
test("build: text survives copying (pages are not turned into pictures)", async () => {
  const src = await sample(1);
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: src }]]);
  const out = await makeBuilder(data, { imageDpi: 96 })([P("a", 0)]);
  const doc = await PDFDocument.load(out);
  const fonts = doc.getPage(0).node.Resources()?.lookup(PDFName.of("Font"));
  assert.ok(fonts, "the copied page still has its font resources");
});

// ---- BMP ----
test("bmp: header, row padding, bottom-up rows and blending onto white", () => {
  // 3x2: top row red, green, blue; bottom row black, white, half-transparent black
  const px = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 128]);
  const bmp = encodeBmp(px, 3, 2);
  const v = new DataView(bmp.buffer);
  assert.equal(String.fromCharCode(bmp[0], bmp[1]), "BM");
  assert.equal(bmp.length, 54 + 12 * 2); assert.equal(v.getUint32(2, true), bmp.length);
  assert.equal(v.getInt32(18, true), 3); assert.equal(v.getInt32(22, true), 2); assert.equal(v.getUint16(28, true), 24);
  assert.deepEqual([...bmp.slice(54, 63)], [0, 0, 0, 255, 255, 255, 127, 127, 127]);   // bottom row first, as B G R
  assert.deepEqual([...bmp.slice(66, 75)], [0, 0, 255, 0, 255, 0, 255, 0, 0]);         // top row
  assert.throws(() => encodeBmp(px, 2, 2));
});

// ---- text ----
test("text: joins pieces into lines and tidies blank lines", () => {
  assert.equal(piecesToText([{ str: "Hello" }, { str: " " }, { str: "world  ", hasEOL: true }, { str: "", hasEOL: true }, { str: "", hasEOL: true }, { str: "", hasEOL: true }, { str: "Next" }]), "Hello world\n\nNext");
  assert.deepEqual(pagesToText(["a", ""]), { text: "--- Page 1 ---\na\n\n--- Page 2 ---\n\n", empty: 1 });
});

// ---- JPEG orientation ----
/** The start of a JPEG holding only an EXIF orientation note. */
function jpegWithOrientation(value: number, littleEndian: boolean): Uint8Array {
  const tiff = new Uint8Array(8 + 2 + 12 + 4), v = new DataView(tiff.buffer);
  tiff.set(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]); v.setUint16(2, 42, littleEndian); v.setUint32(4, 8, littleEndian);
  v.setUint16(8, 1, littleEndian); v.setUint16(10, 0x0112, littleEndian); v.setUint16(12, 3, littleEndian); v.setUint32(14, 1, littleEndian); v.setUint16(18, value, littleEndian);
  const len = 2 + 6 + tiff.length;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xe1, len >> 8, len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff, 0xff, 0xda, 0, 2]);
}
test("exif: reads the orientation in either byte order, and defaults to 1", () => {
  assert.equal(jpegOrientation(jpegWithOrientation(6, true)), 6);
  assert.equal(jpegOrientation(jpegWithOrientation(8, false)), 8);
  assert.equal(jpegOrientation(jpegWithOrientation(99, true)), 1);
  assert.equal(jpegOrientation(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2])), 1);
  assert.equal(jpegOrientation(PNG), 1);
  assert.equal(jpegOrientation(jpegWithOrientation(6, true).subarray(0, 20)), 1);
  assert.deepEqual([1, 3, 6, 8, 2, 5].map(orientationToRotation), [0, 180, 90, 270, null, null]);
});

// ---- tasks ----
import { TASKS, WORKSPACE, ALL_TASKS, NOT_BUILT, NOT_POSSIBLE_LOCALLY, GROUPS, taskBySlug } from "./tasks.ts";
import { existsSync, readFileSync } from "node:fs";
test("tasks: each has a page, a tool.json entry, a sensible default, and nothing overlaps the not-built list", () => {
  const dir = new URL("..", import.meta.url);
  const meta = JSON.parse(readFileSync(new URL("tool.json", dir), "utf8")) as { pages: { page: string; nav?: boolean }[] };
  assert.equal(new Set(ALL_TASKS.map((t) => t.slug)).size, ALL_TASKS.length);
  for (const t of ALL_TASKS) {
    assert.ok(existsSync(new URL(`pages/${t.slug}.astro`, dir)), `missing page for ${t.slug}`);
    assert.match(readFileSync(new URL(`pages/${t.slug}.astro`, dir), "utf8"), t.slug === "text-to-pdf" ? /<TextTask \/>/ : new RegExp(`<Task task="${t.slug}" />`));   // the text page has its own component (it has no PDF pages to arrange)
    assert.equal(meta.pages.find((p) => p.page === t.slug)?.nav, false, `${t.slug} must be listed in tool.json with nav: false`);
    assert.ok(t.formats.length && t.action && t.pick && t.blurb);
    if (t.split) assert.ok(t.parts.includes("split"));
    if (t.which === "selected") assert.ok(t.parts.includes("select"), "a task that saves the selection must let pages be selected");
    assert.equal(taskBySlug(t.slug), t);
  }
  assert.ok(TASKS.every((t) => !NOT_BUILT.some((n) => n.name === t.name)));
  for (const t of [...TASKS, ...NOT_BUILT]) assert.ok((GROUPS as readonly string[]).includes(t.group), `${t.name} is in an unknown group`);
  for (const g of GROUPS) assert.ok(TASKS.some((t) => t.group === g) || NOT_BUILT.some((t) => t.group === g), `${g} has nothing in it`);
  assert.ok(NOT_POSSIBLE_LOCALLY.every((x) => x.name && x.why));
  assert.deepEqual(WORKSPACE.formats.length, 7);
  for (const t of ALL_TASKS) if (t.perFile) assert.ok(t.formats.length === 1 && t.formats[0] === "pdf" && !t.parts.includes("split"), "a task that saves each file on its own makes PDFs and doesn't split");
  assert.throws(() => taskBySlug("nope"));
});

// ---- compression rules ----
import { estimateDpi, targetSize, canRecompress, unpredict, toRgba, greyInPlace, saving, PRESETS, NO_COMPRESSION, type ImageInfo } from "./compress-core.ts";
test("compress: detail is estimated against the page, and pictures are never enlarged", () => {
  // 2480 pixels across a page 595.28 points (595.28 / 72 = 8.27 inches) wide is 300 dots per inch.
  assert.equal(Math.round(estimateDpi(2480, 3508, 595.28, 841.89)), 300);
  assert.equal(Math.round(estimateDpi(3508, 2480, 595.28, 841.89)), 300, "a sideways picture gives the same answer");
  assert.deepEqual(targetSize(2480, 3508, 595.28, 841.89, 150), { width: 1240, height: 1754, scale: 150 / estimateDpi(2480, 3508, 595.28, 841.89) });
  assert.deepEqual(targetSize(600, 800, 595.28, 841.89, 150), { width: 600, height: 800, scale: 1 });
  assert.equal(targetSize(10, 4000, 72, 72, 36).width, 1);
});
test("compress: only plain 8-bit colour or grey pictures are rewritten, also when wrapped in ASCII85 or Flate", () => {
  const base: ImageInfo = { width: 1000, height: 1000, bits: 8, filters: ["DCTDecode"], colour: "rgb", hasMask: false, bytes: 100_000, predictor: 1, colours: 3 };
  assert.deepEqual(canRecompress(base), { ok: true, kind: "jpeg" });
  assert.deepEqual(canRecompress({ ...base, filters: ["FlateDecode"], predictor: 15 }), { ok: true, kind: "flate" });
  assert.deepEqual(canRecompress({ ...base, filters: ["FlateDecode"], colour: "grey", colours: 1 }), { ok: true, kind: "flate" });
  assert.deepEqual(canRecompress({ ...base, filters: ["ASCII85Decode", "DCTDecode"] }), { ok: true, kind: "jpeg" }, "a JPEG wrapped in ASCII85 text (ReportLab)");
  assert.deepEqual(canRecompress({ ...base, filters: ["ASCII85Decode", "FlateDecode"], colours: 3 }), { ok: true, kind: "pixels" });
  assert.equal(canRecompress({ ...base, filters: ["ASCII85Decode", "FlateDecode"], colours: 3, predictor: 15 }).ok, false);
  assert.equal(canRecompress({ ...base, filters: ["JBIG2Decode"] }).ok, false);
  for (const bad of [{ colour: "other" as const }, { bits: 1 }, { hasMask: true }, { filters: ["JPXDecode"] }, { filters: ["DCTDecode", "FlateDecode"] },
    { filters: ["FlateDecode"], predictor: 2 }, { filters: ["FlateDecode"], colours: 4 }, { width: 20, height: 20 }, { bytes: 500 }, { width: 10_000, height: 10_000 }]) {
    assert.equal(canRecompress({ ...base, ...bad }).ok, false, JSON.stringify(bad));
  }
});
test("compress: row prediction is undone for every row type", () => {
  // One colour channel, 3 columns. Rows: none, left (sub), above (up), average, Paeth.
  const packed = Uint8Array.from([0, 10, 20, 30,  1, 5, 5, 5,  2, 1, 1, 1,  3, 1, 1, 1,  4, 1, 1, 1]);
  assert.deepEqual([...unpredict(packed, 3, 1)], [10, 20, 30,  5, 10, 15,  6, 11, 16,  4, 8, 13,  5, 9, 14]);
  // Three channels: "left" means the same channel of the pixel to the left.
  assert.deepEqual([...unpredict(Uint8Array.from([1, 1, 2, 3, 1, 1, 1]), 2, 3)], [1, 2, 3, 2, 3, 4]);
  assert.throws(() => unpredict(Uint8Array.from([9, 0]), 1, 1));
});
test("compress: pixel conversion, greying and the stated saving", () => {
  assert.deepEqual([...toRgba(Uint8Array.from([7, 9]), 2, 1, 1)], [7, 7, 7, 255, 9, 9, 9, 255]);
  assert.deepEqual([...toRgba(Uint8Array.from([1, 2, 3]), 1, 1, 3)], [1, 2, 3, 255]);
  assert.throws(() => toRgba(Uint8Array.from([1]), 2, 2, 1));
  const px = Uint8ClampedArray.from([255, 0, 0, 255, 255, 255, 255, 200]); greyInPlace(px);
  assert.deepEqual([...px], [76, 76, 76, 255, 255, 255, 255, 200]);
  assert.equal(saving(1000, 250), 75); assert.equal(saving(1000, 1000), 0); assert.equal(saving(1000, 1200), 0); assert.equal(saving(0, 0), 0); assert.equal(saving(1000, 2), 99, "rounded down, never 100%");
  assert.ok(PRESETS.light.dpi > PRESETS.recommended.dpi && PRESETS.recommended.dpi > PRESETS.strong.dpi && PRESETS.strong.dpi > PRESETS.extreme.dpi);
  assert.ok(PRESETS.strong.quality > PRESETS.extreme.quality);
  assert.equal(PRESETS.extreme.mode, "images"); assert.equal(PRESETS.maximum.mode, "flatten", "only the level that says so turns pages into pictures");
  assert.equal(NO_COMPRESSION.mode, "none");
});
test("settings: compression options are kept, and older files without them still load", () => {
  let s = addSource(emptySession(), { name: "a.pdf", size: 10, sha256: SHA("a"), pages: 1, kind: "pdf" }).session;
  s = { ...s, output: { ...s.output, compress: { mode: "images", dpi: 120, quality: 0.5, grey: true } } };
  assert.deepEqual(parseSettings(serialise(s)).output.compress, { mode: "images", dpi: 120, quality: 0.5, grey: true });
  const t = { ...s, output: { ...s.output, compress: { mode: "target" as const, dpi: 150, quality: 0.65, grey: false, target: 2_000_000 } } };
  assert.deepEqual(parseSettings(serialise(t)).output.compress, t.output.compress, "a size target is kept");
  const old = JSON.parse(serialise(s)); delete old.output.compress;
  assert.deepEqual(parseSettings(JSON.stringify(old)).output.compress, NO_COMPRESSION);
  old.output.compress = { mode: "explode", dpi: 5, quality: 9, grey: "yes" };
  assert.deepEqual(parseSettings(JSON.stringify(old)).output.compress, NO_COMPRESSION);
});

// ---- output names never match an original by default ----
test("names: defaults carry a suffix, and clashes with added files are found whatever the capitals", () => {
  assert.equal(defaultName("Report 2026.pdf", "merged"), "Report 2026-merged");
  assert.equal(defaultName("archive.tar.gz", "pages"), "archive.tar-pages");
  assert.equal(defaultName("a/b:c.pdf", ""), "a b c");
  assert.deepEqual(clashes(["Report.PDF", "x.pdf", "report.pdf"], ["report.pdf", "other.pdf"]), ["Report.PDF", "report.pdf"]);
  assert.deepEqual(clashes(["report-merged.pdf"], ["report.pdf"]), []);
  for (const t of ALL_TASKS) {
    assert.ok(/^[a-z-]+$/.test(t.suffix), `${t.slug} needs a suffix`);
    assert.deepEqual(clashes([`${defaultName("scan.pdf", t.suffix)}.pdf`], ["scan.pdf"]), [], `${t.slug}: default name must differ from the original`);
  }
});

// ---- added text and pictures ----
import { toUser, turn, textBox, placeText, placeImage, parseColor, unsupported, cleanMark, baseToView, viewToBase, visibleSize, type TextMark, type ImageMark, type Mark } from "./marks.ts";
import { setMarks, withMarks, usage } from "./session.ts";
import { fontSet, cantDraw, protect } from "./build.ts";
const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} ${a} vs ${b}`);
const BOX = { x: 0, y: 0, width: 200, height: 300 };
test("marks: displayed points map to the PDF's coordinates for every page rotation", () => {
  // The displayed top-left corner is a different corner of the unrotated page for each rotation.
  assert.deepEqual(toUser(0, 0, BOX, 0), { x: 0, y: 300 });
  assert.deepEqual(toUser(0, 0, BOX, 90), { x: 0, y: 0 });
  assert.deepEqual(toUser(0, 0, BOX, 180), { x: 200, y: 0 });
  assert.deepEqual(toUser(0, 0, BOX, 270), { x: 200, y: 300 });
  // The displayed bottom-right corner is the opposite one.
  assert.deepEqual(toUser(200, 300, BOX, 0), { x: 200, y: 0 });
  assert.deepEqual(toUser(300, 200, BOX, 90), { x: 200, y: 300 });
  assert.deepEqual(toUser(10, 20, { x: 5, y: 7, width: 200, height: 300 }, 0), { x: 15, y: 287 }, "a crop box that doesn't start at zero is allowed for");
  assert.deepEqual(visibleSize(BOX, 90), { w: 300, h: 200 });
});
test("marks: turning an offset clockwise on screen", () => {
  const t = turn(0, 10, 90); near(t.dx, -10); near(t.dy, 0);        // down becomes left
  const u = turn(10, 0, 90); near(u.dx, 0); near(u.dy, 10);         // right becomes down
});
test("marks: base view and turned view convert both ways", () => {
  for (const q of [0, 90, 180, 270] as const) {
    const v = baseToView(30, 40, 200, 300, q), b = viewToBase(v.x, v.y, 200, 300, q);
    assert.deepEqual(b, { x: 30, y: 40 }, `turn ${q}`);
  }
  assert.deepEqual(baseToView(0, 0, 200, 300, 90), { x: 300, y: 0 }, "turned right, the old top-left is the new top-right");
  assert.deepEqual(baseToView(0, 0, 200, 300, 270), { x: 0, y: 200 });
});
const FONT = { widthOfTextAtSize: (t: string, s: number) => t.length * s * 0.5, heightAtSize: (s: number) => s * 0.7 };
const T: TextMark = { type: "text", x: 20, y: 30, rotate: 0, text: "ab\nabcd", size: 10, color: "#ff0000", font: "sans", bold: false };
test("marks: text is laid out line by line from its top-left corner", () => {
  assert.deepEqual(textBox(T, FONT), { w: 20, h: 24, ascent: 7, lines: ["ab", "abcd"], over: false });
  const p = placeText(T, FONT, BOX, 0);
  assert.equal(p.angle, 0);
  assert.deepEqual(p.lines, [{ text: "ab", x: 20, y: 300 - 37 }, { text: "abcd", x: 20, y: 300 - 49 }]);
  const r = placeText({ ...T, text: "ab" }, FONT, BOX, 90);          // page stored sideways: text must be turned to look upright
  assert.equal(r.angle, 90); near(r.lines[0].x, 37); near(r.lines[0].y, 20);
  const s = placeText({ ...T, text: "ab", rotate: 90 }, FONT, BOX, 0); // text turned clockwise on screen
  assert.equal(s.angle, -90); near(s.lines[0].x, 20 - 7); near(s.lines[0].y, 300 - 30);
});
test("marks: text in a box wraps to its width; a box of set height may be overrun, and says so", () => {
  const W: TextMark = { ...T, text: "one two three\nfour", w: 40 };   // 5 points a letter: 8 letters to a line
  const b = textBox(W, FONT);
  assert.deepEqual(b.lines, ["one two", "three", "four"]); assert.equal(b.w, 40); assert.equal(b.h, 36); assert.equal(b.over, false);
  assert.deepEqual(placeText(W, FONT, BOX, 0).lines.map((l) => [l.text, l.y]), [["one two", 263], ["three", 251], ["four", 239]]);
  assert.equal(textBox({ ...W, h: 50 }, FONT).h, 50, "a taller box keeps its height"); assert.equal(textBox({ ...W, h: 50 }, FONT).over, false);
  assert.equal(textBox({ ...W, h: 20 }, FONT).over, true, "three lines don't fit in 20 points");
  assert.deepEqual(textBox({ ...W, text: "abcdefghijkl" }, FONT).lines, ["abcdefgh", "ijkl"], "a word longer than the box is broken");
});
test("marks: saved settings keep a text's box and a stretched picture, and refuse damaged ones", () => {
  assert.deepEqual(cleanMark({ ...T, w: 40, h: 30 }, () => true), { ...T, w: 40, h: 30 });
  assert.deepEqual(cleanMark({ ...T, w: 40 }, () => true), { ...T, w: 40 });
  assert.equal(cleanMark({ ...T, h: 30 }, () => true), null, "a height without a width");
  assert.equal(cleanMark({ ...T, w: -5 }, () => true), null);
  const I = { type: "image", x: 1, y: 2, rotate: 0, w: 50, h: 40, src: "f2" };
  assert.deepEqual(cleanMark({ ...I, stretch: true }, () => true), { ...I, stretch: true });
  assert.deepEqual(cleanMark({ ...I, stretch: false }, () => true), I);
  assert.equal(cleanMark({ ...I, stretch: "yes" }, () => true), null);
});
test("marks: a picture is placed by its bottom-left corner", () => {
  const I: ImageMark = { type: "image", x: 10, y: 20, rotate: 0, w: 50, h: 40, src: "f2" };
  assert.deepEqual(placeImage(I, BOX, 0), { x: 10, y: 240, width: 50, height: 40, angle: 0 });
  const r = placeImage({ ...I, rotate: 90 }, BOX, 0); near(r.x, -30); near(r.y, 280); assert.equal(r.angle, -90);
});
test("marks: colours, unsupported characters and settings checks", () => {
  assert.deepEqual(parseColor("#ff0080"), { r: 1, g: 0, b: 128 / 255 }); assert.deepEqual(parseColor("red"), { r: 0, g: 0, b: 0 });
  assert.deepEqual(unsupported("a\nb€c", new Set([97, 98, 99])), ["€"]);
  const img = (id: string) => id === "f2";
  assert.deepEqual(cleanMark({ ...T, extra: 1 }, img), T);
  assert.deepEqual(cleanMark({ type: "image", x: 1, y: 2, rotate: 0, w: 3, h: 4, src: "f2" }, img), { type: "image", x: 1, y: 2, rotate: 0, w: 3, h: 4, src: "f2" });
  for (const bad of [null, {}, { ...T, size: 0 }, { ...T, color: "red" }, { ...T, font: "comic" }, { ...T, x: NaN }, { ...T, text: 5 }, { ...T, bold: "yes" },
    { type: "image", x: 1, y: 2, rotate: 0, w: 3, h: 4, src: "f1" }, { type: "image", x: 1, y: 2, rotate: 0, w: 0, h: 4, src: "f2" }, { type: "shape", x: 1, y: 2, rotate: 0 }]) {
    assert.equal(cleanMark(bad, img), null, JSON.stringify(bad));
  }
});
test("session: marks are set, counted, saved in settings, and removed with their picture", () => {
  let s = addSource(emptySession(), { name: "a.pdf", size: 10, sha256: SHA("a"), pages: 2, kind: "pdf" }).session;
  const stamp = addSource(s, { name: "logo.png", size: 5, sha256: SHA("b"), pages: 1, kind: "image" }, false);
  s = stamp.session;
  assert.equal(s.pages.length, 2, "a picture added to place on a page doesn't become a page");
  const marks: Mark[] = [T, { type: "image", x: 1, y: 2, rotate: 0, w: 30, h: 40, src: stamp.id }];
  s = { ...s, pages: setMarks(s.pages, 1, marks).pages };
  assert.equal(s.pages[0].marks, undefined); assert.equal(s.pages[1].marks?.length, 2);
  assert.equal(usage(s, stamp.id), 1); assert.equal(usage(s, "f1"), 2);
  assert.deepEqual(parseSettings(serialise(s)), s);
  assert.equal(duplicate(s.pages, [1]).pages[2].marks?.length, 2, "a duplicated page keeps its additions");
  const gone = removeSource(s, stamp.id);
  assert.deepEqual(gone.pages[1].marks, [T]);
  assert.equal("marks" in withMarks(s.pages[1], []), false);
  const j = JSON.parse(serialise(s)); j.pages[1].marks[1].src = "f1";
  assert.throws(() => parseSettings(JSON.stringify(j)), /damaged addition/);
  j.pages[1].marks = "x"; assert.throws(() => parseSettings(JSON.stringify(j)), /damaged/);
});
test("build: added text and pictures are written, on plain and rotated pages", async () => {
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: await sample(1) }], ["r", { kind: "pdf", bytes: await sample(1, true) }], ["i", { kind: "image", bytes: PNG, type: "png" }]]);
  const marks: Mark[] = [{ ...T, text: "Added words" }, { type: "image", x: 5, y: 5, rotate: 0, w: 20, h: 20, src: "i" }];
  const out = await makeBuilder(data, { imageDpi: 96 })([{ ...P("a", 0), marks }, { ...P("r", 0), marks, rotate: 90 }, P("a", 0)]);
  const doc = await PDFDocument.load(out), pages = doc.getPages();
  const fontsOf = (i: number) => (pages[i].node.Resources()?.lookup(PDFName.of("Font")) as any)?.keys().length ?? 0;
  const xobjects = (i: number) => (pages[i].node.Resources()?.lookup(PDFName.of("XObject")) as any)?.keys().length ?? 0;
  assert.equal(fontsOf(0), 2, "the page's own font plus the one for the added text");
  assert.equal(fontsOf(2), 1, "a page without additions is unchanged");
  assert.equal(xobjects(0), 1); assert.equal(xobjects(1), 1);
  assert.equal(pages[1].getRotation().angle, 180, "the turn made in the tool is applied after the additions are drawn");
  await assert.rejects(makeBuilder(data, { imageDpi: 96 })([{ ...P("a", 0), marks: [{ ...T, text: "日本語" }] }]), /built-in fonts can't write: 日 本 語/);
  await assert.rejects(makeBuilder(data, { imageDpi: 96 })([{ ...P("a", 0), marks: [{ type: "image", x: 0, y: 0, rotate: 0, w: 5, h: 5, src: "zz" }] }]), /picture placed on a page hasn't been added/);
});
test("build: the built-in fonts report which characters they can't draw", async () => {
  const doc = await PDFDocument.create(), f = fontSet(doc)("sans", false);
  assert.deepEqual(cantDraw("Café – “quoted” £5 €5", f), []);
  assert.deepEqual(cantDraw("Ω and 日", f), ["Ω", "日"]);
  assert.equal(fontSet(doc)("mono", true).name, "Courier-Bold");
});

// ---- password protection ----
test("protect: the saved PDF opens only with the password, and holds the same pages", async () => {
  const locked = await protect(await sample(2), "correct horse");
  await assert.rejects(PDFDocument.load(locked), "it must not open without a password");
  await assert.rejects(inspectPdf(locked, "wrong"));
  assert.equal((await inspectPdf(locked, "correct horse")).pages, 2);
  await assert.rejects(protect(await sample(1), ""), /password/);
  // unlocking = opening with the password and building a new file
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: locked, password: "correct horse" }]]);
  const open = await makeBuilder(data, { imageDpi: 96 })([P("a", 0), P("a", 1)]);
  assert.equal((await inspectPdf(open)).pages, 2, "the rebuilt copy needs no password");
});
test("settings: no password field exists anywhere in the settings file", () => {
  const s = addSource(emptySession(), { name: "a.pdf", size: 10, sha256: SHA("a"), pages: 1, kind: "pdf" }).session;
  assert.doesNotMatch(serialise(s), /passw/i);
});

// ---- page numbers ----
import { numberText, numberMark, cleanNumbers, NO_NUMBERS, type NumberOptions } from "./stamps.ts";
const NUM: NumberOptions = { ...NO_NUMBERS, on: true };
test("numbers: text for each style, start number and first numbered page", () => {
  assert.equal(numberText(NUM, 0, 5), "1"); assert.equal(numberText(NUM, 4, 5), "5");
  assert.equal(numberText({ ...NUM, style: "n-of-total" }, 1, 5), "2 / 5");
  assert.equal(numberText({ ...NUM, style: "page-n" }, 2, 5), "Page 3");
  assert.equal(numberText({ ...NUM, style: "page-n-of-total" }, 4, 5), "Page 5 of 5");
  // Skip a cover page: page 2 carries "1", and the total counts numbered pages only.
  const cover = { ...NUM, from: 2, style: "page-n-of-total" as const };
  assert.equal(numberText(cover, 0, 5), null); assert.equal(numberText(cover, 1, 5), "Page 1 of 4"); assert.equal(numberText(cover, 4, 5), "Page 4 of 4");
  // Start at another number (a document that continues from an earlier one).
  assert.equal(numberText({ ...NUM, start: 10, style: "n-of-total" }, 0, 3), "10 / 12");
});
test("numbers: placed by corner and margin on the page as seen", () => {
  const view = { w: 200, h: 300 }, o = { ...NUM, size: 10, margin: 20 };   // FONT: each character is 5 points wide at size 10; the line is 12 high
  const at = (position: NumberOptions["position"]) => { const m = numberMark({ ...o, position }, 0, 9, view, FONT)!; return [m.x, m.y]; };
  assert.deepEqual(at("bottom-center"), [97.5, 268]); assert.deepEqual(at("bottom-left"), [20, 268]); assert.deepEqual(at("bottom-right"), [175, 268]);
  assert.deepEqual(at("top-center"), [97.5, 20]); assert.deepEqual(at("top-left"), [20, 20]); assert.deepEqual(at("top-right"), [175, 20]);
  assert.equal(numberMark({ ...o, on: false }, 0, 9, view, FONT), null);
  assert.equal(numberMark({ ...o, from: 3 }, 1, 9, view, FONT), null);
});
test("numbers: settings are checked, and older files without them load with numbers off", () => {
  assert.deepEqual(cleanNumbers(undefined), NO_NUMBERS);
  assert.deepEqual(cleanNumbers({ on: true, position: "top-right", style: "page-n", start: 3, from: 2, size: 9, margin: 10, font: "serif", bold: true, color: "#112233" }),
    { on: true, position: "top-right", style: "page-n", start: 3, from: 2, size: 9, margin: 10, font: "serif", bold: true, color: "#112233" });
  assert.deepEqual(cleanNumbers({ on: "yes", position: "middle", style: "roman", start: -1, from: 0, size: 9999, margin: -5, font: "comic", bold: 1, color: "red" }), NO_NUMBERS);
  let s = addSource(emptySession(), { name: "a.pdf", size: 10, sha256: SHA("a"), pages: 1, kind: "pdf" }).session;
  s = { ...s, output: { ...s.output, numbers: { ...NUM, from: 2 } } };
  assert.deepEqual(parseSettings(serialise(s)).output.numbers, { ...NUM, from: 2 });
  const old = JSON.parse(serialise(s)); delete old.output.numbers;
  assert.deepEqual(parseSettings(JSON.stringify(old)).output.numbers, NO_NUMBERS);
});
test("build: numbers are written on the pages they should be, counting within the file or from a given place", async () => {
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: await sample(3) }]]);
  const fontCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((pg) => (pg.node.Resources()?.lookup(PDFName.of("Font")) as any)?.keys().length ?? 0);
  const all = await makeBuilder(data, { imageDpi: 96, numbers: NUM })([P("a", 0), P("a", 1), { ...P("a", 2), rotate: 90, scale: 2 }]);
  assert.deepEqual(await fontCount(all), [2, 2, 2], "each page gains the number's font");
  const skip = await makeBuilder(data, { imageDpi: 96, numbers: { ...NUM, from: 2 } })([P("a", 0), P("a", 1)]);
  assert.deepEqual(await fontCount(skip), [1, 2], "the page before the first numbered one is untouched");
  const off = await makeBuilder(data, { imageDpi: 96, numbers: { ...NUM, on: false } })([P("a", 0)]);
  assert.deepEqual(await fontCount(off), [1]);
  const preview = await makeBuilder(data, { imageDpi: 96, numbers: { ...NUM, from: 2 } })([P("a", 0)], { index: 0, total: 3 });
  assert.deepEqual(await fontCount(preview), [1], "a one-page preview knows where the page sits in the document");
});

// ---- watermark ----
import { watermarkMarks, cleanWatermark, NO_WATERMARK, TILES_MAX, type WatermarkOptions } from "./stamps.ts";
const WM: WatermarkOptions = { ...NO_WATERMARK, on: true, text: "DRAFT", size: 10 };   // FONT: 25 points wide, 12 high
test("watermark: one copy sits with its middle at the middle of the page, at any angle", () => {
  for (const angle of [0, -45, 45, 90, 30]) {
    const [m] = watermarkMarks({ ...WM, angle }, { w: 200, h: 300 }, FONT);
    const mid = turn(12.5, 6, angle);
    near(m.x + mid.dx, 100, `angle ${angle} x`); near(m.y + mid.dy, 150, `angle ${angle} y`);
    assert.equal(m.rotate, angle); assert.equal(m.opacity, 0.3); assert.equal(m.text, "DRAFT");
  }
  assert.deepEqual(watermarkMarks({ ...WM, on: false }, { w: 200, h: 300 }, FONT), []);
  assert.deepEqual(watermarkMarks({ ...WM, text: "  " }, { w: 200, h: 300 }, FONT), []);
  assert.equal(watermarkMarks({ ...WM, text: " two   words\n" }, { w: 200, h: 300 }, FONT)[0].text, "two words");
});
test("watermark: repeated copies cover the page in staggered rows, up to a limit", () => {
  const tiles = watermarkMarks({ ...WM, layout: "tile", angle: 0 }, { w: 200, h: 300 }, FONT);
  assert.ok(tiles.length > 10, `${tiles.length} copies`);
  const mids = tiles.map((m) => [m.x + 12.5, m.y + 6]);
  assert.ok(mids.some(([x, y]) => x < 40 && y < 40) && mids.some(([x, y]) => x > 160 && y > 260), "copies reach opposite corners");
  assert.notEqual(mids[0][0], mids.find(([, y]) => y !== mids[0][1])![0], "the next row is offset");
  assert.equal(watermarkMarks({ ...WM, layout: "tile", size: 4 }, { w: 5000, h: 5000 }, FONT).length, TILES_MAX);
});
test("watermark: settings are checked; older files load with it off; marks may carry an opacity", () => {
  assert.deepEqual(cleanWatermark(undefined), NO_WATERMARK);
  assert.deepEqual(cleanWatermark({ on: true, text: "x", layout: "tile", angle: 10, opacity: 0.5, size: 20, font: "mono", bold: false, color: "#abcdef" }),
    { on: true, text: "x", layout: "tile", angle: 10, opacity: 0.5, size: 20, font: "mono", bold: false, color: "#abcdef" });
  assert.deepEqual(cleanWatermark({ on: 1, text: 5, layout: "wave", angle: 999, opacity: 0, size: 0, font: "x", bold: "no", color: "blue" }), NO_WATERMARK);
  let s = addSource(emptySession(), { name: "a.pdf", size: 10, sha256: SHA("a"), pages: 1, kind: "pdf" }).session;
  s = { ...s, output: { ...s.output, watermark: WM } };
  assert.deepEqual(parseSettings(serialise(s)).output.watermark, WM);
  assert.deepEqual(cleanMark({ ...T, opacity: 0.4 }, () => false), { ...T, opacity: 0.4 });
  assert.deepEqual(cleanMark({ ...T, opacity: 1 }, () => false), T);
  assert.equal(cleanMark({ ...T, opacity: 0 }, () => false), null);
});
test("build: the watermark is written on every page, see-through, under the page number", async () => {
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: await sample(2) }]]);
  const out = await makeBuilder(data, { imageDpi: 96, watermark: WM, numbers: NUM })([P("a", 0), { ...P("a", 1), rotate: 90 }]);
  const doc = await PDFDocument.load(out);
  for (const pg of doc.getPages()) {
    const res = pg.node.Resources()!;
    assert.ok(((res.lookup(PDFName.of("ExtGState")) as any)?.keys().length ?? 0) >= 1, "a transparency setting is present");
    assert.equal((res.lookup(PDFName.of("Font")) as any).keys().length, 3, "page font, watermark font (bold) and number font");
  }
  const none = await makeBuilder(data, { imageDpi: 96, watermark: { ...WM, text: "" } })([P("a", 0)]);
  assert.equal(((await PDFDocument.load(none)).getPage(0).node.Resources()!.lookup(PDFName.of("Font")) as any).keys().length, 1);
  await assert.rejects(makeBuilder(data, { imageDpi: 96, watermark: { ...WM, text: "機密" } })([P("a", 0)]), /built-in fonts can't write: 機 密/);
});

// ---- paging: showing a long page list a screenful at a time ----
import { perScreen, screenCount, clampScreen, screenRange, screenOf, pagerItems, MIN_PER_SCREEN, MAX_PER_SCREEN } from "./paging.ts";
test("perScreen fits whole rows and stays within limits", () => {
  assert.equal(perScreen(1000, 900) % Math.floor(1000 / 140), 0);
  assert.ok(perScreen(300, 400) >= MIN_PER_SCREEN);
  assert.ok(perScreen(5000, 5000) <= MAX_PER_SCREEN);
  assert.ok(perScreen(1200, 1000) > perScreen(400, 1000), "wider screens show more");
});
test("screen arithmetic", () => {
  assert.equal(screenCount(0, 20), 1); assert.equal(screenCount(20, 20), 1); assert.equal(screenCount(21, 20), 2); assert.equal(screenCount(340, 20), 17);
  assert.deepEqual(screenRange(16, 340, 20), { start: 320, end: 340 });
  assert.deepEqual(screenRange(99, 45, 20), { start: 40, end: 45 }, "out-of-range screens are clamped");
  assert.equal(clampScreen(-3, 45, 20), 0); assert.equal(screenOf(39, 20), 1); assert.equal(screenOf(40, 20), 2);
});
test("pagerItems: short row for long files, never skips by one", () => {
  assert.deepEqual(pagerItems(0, 1), [0]);
  assert.deepEqual(pagerItems(0, 4), [0, 1, 2, 3]);
  assert.deepEqual(pagerItems(8, 17), [0, "gap", 7, 8, 9, "gap", 16]);
  assert.deepEqual(pagerItems(2, 17), [0, 1, 2, 3, "gap", 16]);
  assert.deepEqual(pagerItems(16, 17), [0, "gap", 15, 16]);
  assert.ok(pagerItems(250, 500).length <= 9);
});

// ---- crop ----
import { NO_CROP, cleanCrop, cropBoxFor, clampMargins, marginsFromRect, appliesTo, toPoints, fromPoints, MIN_VISIBLE } from "./crop.ts";
test("crop: units convert exactly (an inch is 72 points and 25.4 mm)", () => {
  assert.equal(toPoints(1, "in"), 72); assert.equal(toPoints(25.4, "mm"), 72); assert.equal(toPoints(5, "pt"), 5);
  assert.ok(Math.abs(fromPoints(72, "mm") - 25.4) < 1e-9);
});
test("crop: box for an upright page, and for a page the file shows turned", () => {
  const box = { x: 0, y: 0, width: 400, height: 600 };
  assert.deepEqual(cropBoxFor(box, 0, { top: 10, right: 20, bottom: 30, left: 40 }), { x: 40, y: 30, width: 340, height: 560 });
  // Shown turned 90° the page is 600 wide and 400 tall; "top" is then the page's own left edge, "left" its own bottom edge.
  assert.deepEqual(cropBoxFor(box, 90, { top: 10, right: 20, bottom: 30, left: 40 }), { x: 10, y: 40, width: 360, height: 540 });
  assert.deepEqual(cropBoxFor({ x: 5, y: 7, width: 400, height: 600 }, 0, { top: 0, right: 0, bottom: 0, left: 10 }), { x: 15, y: 7, width: 390, height: 600 });
});
test("crop: a mistyped margin can't leave less than a quarter inch", () => {
  const m = clampMargins({ w: 100, h: 100 }, { left: 90, right: 90, top: 5, bottom: 5 });
  assert.ok(Math.abs(100 - m.left - m.right - MIN_VISIBLE) < 1e-9); assert.equal(m.left, m.right); assert.deepEqual([m.top, m.bottom], [5, 5]);
  assert.deepEqual(clampMargins({ w: 100, h: 100 }, { left: -4, right: 0, top: 0, bottom: 0 }), { left: 0, right: 0, top: 0, bottom: 0 });
  assert.deepEqual(marginsFromRect({ w: 200, h: 100 }, { x: 20, y: 10, w: 150, h: 60 }), { left: 20, top: 10, right: 30, bottom: 30 });
});
test("crop: which pages", () => {
  assert.ok(appliesTo(NO_CROP, 3, 10));
  const o = { ...NO_CROP, pages: "2-3, 9-" };
  assert.deepEqual([0, 1, 2, 3, 8, 9].map((i) => appliesTo(o, i, 10)), [false, true, true, false, true, true]);
  assert.throws(() => appliesTo({ ...NO_CROP, pages: "x" }, 0, 10));
});
test("crop: settings are checked, and older files without them load with no crop", () => {
  assert.deepEqual(cleanCrop(undefined), NO_CROP);
  assert.deepEqual(cleanCrop({ top: 5, right: 6, bottom: 7, left: 8, unit: "in", pages: "1-2" }), { top: 5, right: 6, bottom: 7, left: 8, unit: "in", pages: "1-2" });
  assert.deepEqual(cleanCrop({ top: -1, right: "x", bottom: 1e9, left: NaN, unit: "furlong", pages: 7 }), NO_CROP);
  let s = addSource(emptySession(), { name: "a.pdf", size: 10, sha256: SHA("a"), pages: 1, kind: "pdf" }).session;
  s = { ...s, output: { ...s.output, crop: { ...NO_CROP, top: 12 } } };
  assert.equal(parseSettings(serialise(s)).output.crop.top, 12);
  const old = JSON.parse(serialise(s)); delete old.output.crop;
  assert.deepEqual(parseSettings(JSON.stringify(old)).output.crop, NO_CROP);
});
test("build: crop sets the visible area of chosen pages only, before any turn or resize", async () => {
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: await sample(3) }]]);   // pages 100,101,102 wide, 200 tall
  const crop = { ...NO_CROP, top: 20, left: 10, pages: "2-3" };
  const out = await makeBuilder(data, { imageDpi: 96, crop })([P("a", 0), P("a", 1), { ...P("a", 2), rotate: 90, scale: 2 }]);
  const pages = (await PDFDocument.load(out)).getPages();
  const box = (i: number) => { const b = pages[i].getCropBox(); return [b.x, b.y, b.width, b.height]; };
  assert.deepEqual(box(0), [0, 0, 100, 200], "page 1 is not in the range");
  assert.deepEqual(box(1), [10, 0, 91, 180]);
  assert.deepEqual(box(2).map((v) => Math.round(v * 100) / 100), [20, 0, 184, 360], "cropped 10 left and 20 top, then doubled; turning does not change the box");
  assert.equal(pages[2].getRotation().angle, 90);
});
test("build: resizing keeps an already-cropped page's visible area (the library's own scale loses it)", async () => {
  const doc = await PDFDocument.create(); const pg = doc.addPage([400, 600]); pg.setCropBox(50, 100, 200, 300); pg.drawText("x", { x: 60, y: 110 });
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: await doc.save() }]]);
  const out = (await PDFDocument.load(await makeBuilder(data, { imageDpi: 96 })([{ ...P("a", 0), scale: 0.5 }]))).getPage(0);
  const c = out.getCropBox(), m = out.getMediaBox();
  assert.deepEqual([c.x, c.y, c.width, c.height], [25, 50, 100, 150]);
  assert.deepEqual([m.x, m.y, m.width, m.height], [0, 0, 200, 300]);
  assert.equal(out.node.TrimBox(), undefined, "boxes the page never had are not invented");
});

// ---- signature pad geometry ----
import { inkBounds } from "./signpad.ts";
test("signature: ink bounds include pen thickness, padding, and nothing drawn gives null", () => {
  assert.equal(inkBounds([]), null); assert.equal(inkBounds([{ pts: [], width: 4 }]), null);
  assert.deepEqual(inkBounds([{ pts: [{ x: 10, y: 20 }, { x: 50, y: 30 }], width: 4 }, { pts: [{ x: 5, y: 60 }], width: 2 }]), { x: 4, y: 18, w: 48, h: 43 });
  assert.deepEqual(inkBounds([{ pts: [{ x: 10, y: 10 }], width: 2 }], 5), { x: 4, y: 4, w: 12, h: 12 });
});

// ---- shapes and freehand lines ----
import { shapePath, placeBox, cleanMark as cleanM } from "./marks.ts";
test("shapes: paths in the box's own coordinates", () => {
  const r = { type: "shape", shape: "rect", x: 0, y: 0, rotate: 0, w: 10, h: 20, color: "#000000", fill: "", width: 1 } as const;
  assert.equal(shapePath(r), "M 0 0 L 10 0 L 10 20 L 0 20 Z");
  assert.equal(shapePath({ ...r, shape: "line" }), "M 0 0 L 10 20");
  assert.equal(shapePath({ ...r, shape: "line", flip: true }), "M 0 20 L 10 0");
  assert.match(shapePath({ ...r, shape: "ellipse" }), /^M 0 10 C .* Z$/);
  const ink = { type: "ink", x: 0, y: 0, rotate: 0, w: 100, h: 50, strokes: [[0, 0, 0.5, 1], [0.2, 0.2]], color: "#000000", width: 2 } as const;
  assert.equal(shapePath(ink), "M 0 0 L 50 50 M 20 10 L 20.01 10");
});
test("shapes: position follows the page as shown, including turned pages", () => {
  const box = { x: 0, y: 0, width: 400, height: 600 };
  assert.deepEqual(placeBox({ x: 40, y: 30, rotate: 0 }, box, 0), { x: 40, y: 570, angle: 0 });
  assert.deepEqual(placeBox({ x: 40, y: 30, rotate: 15 }, box, 90), { x: 30, y: 40, angle: 75 });
});
test("shapes: marks from a settings file are checked", () => {
  const ok = { type: "shape", shape: "ellipse", x: 1, y: 2, rotate: 0, w: 30, h: 20, color: "#ff0000", fill: "#00ff00", width: 2, opacity: 0.5 };
  assert.deepEqual(cleanM(ok, () => false), ok);
  assert.equal(cleanM({ ...ok, shape: "star" }, () => false), null); assert.equal(cleanM({ ...ok, fill: "red" }, () => false), null); assert.equal(cleanM({ ...ok, width: -1 }, () => false), null);
  const ink = { type: "ink", x: 0, y: 0, rotate: 0, w: 10, h: 10, strokes: [[0, 0, 1, 1]], color: "#000000", width: 1 };
  assert.deepEqual(cleanM(ink, () => false), ink);
  assert.equal(cleanM({ ...ink, strokes: [[0, 0, 2, 1]] }, () => false), null); assert.equal(cleanM({ ...ink, strokes: [[0, 0, 1]] }, () => false), null);
  assert.equal(cleanM({ ...ink, strokes: Array(201).fill([0, 0]) }, () => false), null);
});
test("build: shapes and freehand lines are drawn into the saved page", async () => {
  const data = new Map<string, SourceData>([["a", { kind: "pdf", bytes: await sample(1) }]]);
  const marks = [
    { type: "shape", shape: "rect", x: 10, y: 10, rotate: 0, w: 30, h: 20, color: "#ff0000", fill: "#ffff00", width: 2, opacity: 0.5 },
    { type: "ink", x: 10, y: 50, rotate: 0, w: 40, h: 20, strokes: [[0, 0, 1, 1]], color: "#0000ff", width: 3 },
    { type: "shape", shape: "line", x: 10, y: 90, rotate: 30, w: 40, h: 10, color: "#000000", fill: "", width: 1 },
  ] as const;
  const out = await makeBuilder(data, { imageDpi: 96 })([{ ...P("a", 0), marks: [...marks] }]);
  const plain = await makeBuilder(data, { imageDpi: 96 })([P("a", 0)]);
  assert.equal((await inspectPdf(out)).pages, 1);
  assert.ok(out.length > plain.length + 100, "the page gained drawing instructions (their appearance is checked by rendering, in VERIFICATION.md)");
});

// ---- picture page layout ----
import { imageLayout, cleanImageLayout, NO_IMAGE_LAYOUT } from "./layout.ts";
test("layout: default is the picture itself; a margin adds to the page", () => {
  assert.deepEqual(imageLayout(300, 200, 0, NO_IMAGE_LAYOUT), { pageW: 300, pageH: 200, x: 0, y: 0, w: 300, h: 200 });
  assert.deepEqual(imageLayout(300, 200, 0, { ...NO_IMAGE_LAYOUT, margin: 10 }), { pageW: 320, pageH: 220, x: 10, y: 10, w: 300, h: 200 });
  const t = imageLayout(300, 200, 90, NO_IMAGE_LAYOUT);   // stored sideways, shown upright: page is turned afterwards
  assert.deepEqual([t.pageW, t.pageH, t.w, t.h], [300, 200, 300, 200]);
});
test("layout: custom page, direction, shrink-to-fit and never enlarging", () => {
  const c = { ...NO_IMAGE_LAYOUT, size: "custom" as const, width: 400, height: 600, margin: 20 };
  let L = imageLayout(1000, 500, 0, c);                    // wide picture: auto picks a sideways page 600 x 400
  assert.deepEqual([L.pageW, L.pageH], [600, 400]); near(L.w, 560); near(L.h, 280); near(L.x, 20); near(L.y, 60);
  L = imageLayout(1000, 500, 0, { ...c, orientation: "portrait" });
  assert.deepEqual([L.pageW, L.pageH], [400, 600]); near(L.w, 360); near(L.h, 180);
  L = imageLayout(100, 50, 0, c);                          // small picture stays small, centred
  assert.deepEqual([L.w, L.h], [100, 50]); near(L.x, 250); near(L.y, 175);   // wide picture: auto makes the page sideways (600 x 400)
  L = imageLayout(500, 1000, 90, { ...c, orientation: "landscape" });   // stored 500x1000 shown 1000x500; page stored turned
  assert.deepEqual([L.pageW, L.pageH], [400, 600]); near(L.w, 280); near(L.h, 560);   // shown 560 x 280 inside a 600 x 400 sideways page
});
test("layout: absurd margins and sizes are held to sane limits; settings are checked", () => {
  const L = imageLayout(100, 100, 0, { ...NO_IMAGE_LAYOUT, size: "custom", width: 100, height: 100, margin: 1000 });
  assert.ok(L.w > 0 && L.h > 0 && L.x >= 0);
  assert.deepEqual(cleanImageLayout(undefined), NO_IMAGE_LAYOUT);
  assert.deepEqual(cleanImageLayout({ size: "custom", width: 1, height: 1e9, orientation: "x", margin: -3, unit: "yd" }), { ...NO_IMAGE_LAYOUT, size: "custom" });
  assert.deepEqual(cleanImageLayout({ size: "custom", width: 500, height: 700, orientation: "landscape", margin: 20, unit: "in" }), { size: "custom", width: 500, height: 700, orientation: "landscape", margin: 20, unit: "in" });
});
test("build: pictures follow the page size and margin chosen", async () => {
  const data = new Map<string, SourceData>([["i", { kind: "image", bytes: PNG, type: "png" }]]);   // 1x1 pixel; at 1 dpi it is 72 points
  const out = await makeBuilder(data, { imageDpi: 1, images: { ...NO_IMAGE_LAYOUT, size: "custom", width: 400, height: 600, margin: 30 } })([{ src: "i", page: 0, rotate: 0, scale: 1 }]);
  const pg = (await PDFDocument.load(out)).getPage(0);
  assert.deepEqual([pg.getWidth(), pg.getHeight()], [400, 600]);
});

// ---- extracting stored pictures ----
import { extractPictures, encodePng } from "./extract.ts";
import { unzlibSync, zlibSync } from "fflate";
import { PDFName as N, PDFHexString } from "@cantoo/pdf-lib";
const rawPicture = (doc: PDFDocument, dict: Record<string, unknown>, data: Uint8Array) => doc.context.register(doc.context.stream(data, doc.context.obj({ Type: "XObject", Subtype: "Image", ...dict }) as never));
const withPictures = async (pics: Record<string, ReturnType<typeof rawPicture>>) => {
  const doc = await PDFDocument.create(), page = doc.addPage([100, 100]);   // (callers build pictures first with their own doc, so this helper takes a ready doc below)
  void pics; return { doc, page };
};
void withPictures;
const savedWith = async (build: (doc: PDFDocument) => Record<string, ReturnType<typeof rawPicture>>) => {
  const doc = await PDFDocument.create(), page = doc.addPage([100, 100]), pics = build(doc);
  page.node.Resources()!.set(N.of("XObject"), doc.context.obj(pics as never)); return doc.save();
};
const pngPixels = (png: Uint8Array) => {   // [width, height, colour type, raw pixel rows without their filter bytes]
  const dv = new DataView(png.buffer, png.byteOffset); let at = 8; const idat: Uint8Array[] = [];
  while (at < png.length) { const len = dv.getUint32(at), t = String.fromCharCode(...png.subarray(at + 4, at + 8)); if (t === "IDAT") idat.push(png.subarray(at + 8, at + 8 + len)); at += 12 + len; }
  const w = dv.getUint32(16), h = dv.getUint32(20), ct = png[25], ch = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[ct], raw = unzlibSync(idat[0]), out = new Uint8Array(w * h * ch);
  for (let y = 0; y < h; y++) out.set(raw.subarray(y * (w * ch + 1) + 1, (y + 1) * (w * ch + 1)), y * w * ch);
  return { w, h, ct, out };
};
test("extract: a PNG-style picture comes out with every pixel and its transparency, once even if used on two pages", async () => {
  const doc = await PDFDocument.create();
  const px = new Uint8Array(40 * 40 * 4); for (let i = 0; i < 1600; i++) px.set([i % 256, (i * 3) % 256, 200, i % 2 ? 255 : 128], i * 4);
  const img = await doc.embedPng(encodePng(40, 40, 4, px));
  doc.addPage([200, 200]).drawImage(img, { x: 0, y: 0, width: 50, height: 50 });
  doc.addPage([200, 200]).drawImage(img, { x: 10, y: 10, width: 50, height: 50 });
  const r = await extractPictures(await doc.save(), undefined, 32);
  assert.equal(r.pictures.length, 1); assert.deepEqual(r.pictures[0].pages, [1, 2]);
  const got = pngPixels(r.pictures[0].bytes);
  assert.deepEqual([got.w, got.h, got.ct], [40, 40, 6]); assert.deepEqual([...got.out], [...px]);
});
test("extract: JPEGs are copied byte for byte; tiny pictures are counted, not saved", async () => {
  const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9]);
  const out = await extractPictures(await savedWith((d) => ({
    J: rawPicture(d, { Width: 64, Height: 48, BitsPerComponent: 8, ColorSpace: N.of("DeviceRGB"), Filter: N.of("DCTDecode") }, jpegBytes),
    T: rawPicture(d, { Width: 8, Height: 8, BitsPerComponent: 8, ColorSpace: N.of("DeviceGray") }, new Uint8Array(64)),
  })), undefined, 32);
  assert.equal(out.pictures.length, 1); assert.equal(out.pictures[0].kind, "jpeg"); assert.deepEqual([...out.pictures[0].bytes], [...jpegBytes]); assert.equal(out.tiny, 1);
});
test("extract: 1-bit gray and palette pictures are expanded; unsupported kinds are reported by name", async () => {
  const out = await extractPictures(await savedWith((d) => ({
    G: rawPicture(d, { Width: 40, Height: 40, BitsPerComponent: 1, ColorSpace: N.of("DeviceGray") }, new Uint8Array(200).fill(0b10100000)),   // the picture's first pixels: 1 0 1 0 0 0 ...
    P: rawPicture(d, { Width: 40, Height: 40, BitsPerComponent: 8, ColorSpace: d.context.obj([N.of("Indexed"), N.of("DeviceRGB"), 1, PDFHexString.of("ff000000ff00")]) }, new Uint8Array(1600).map((_, i) => i % 2)),
    C: rawPicture(d, { Width: 40, Height: 40, BitsPerComponent: 8, ColorSpace: N.of("DeviceCMYK") }, new Uint8Array(6400)),
    F: rawPicture(d, { Width: 40, Height: 40, BitsPerComponent: 1, ColorSpace: N.of("DeviceGray"), Filter: N.of("CCITTFaxDecode") }, new Uint8Array(10)),
  })), undefined, 32);
  const png = out.pictures.map((p) => pngPixels(p.bytes));
  assert.equal(png.length, 2);
  const gray = png.find((p) => p.ct === 0)!, pal = png.find((p) => p.ct === 2)!;
  assert.deepEqual([...gray.out.subarray(0, 6)], [255, 0, 255, 0, 0, 0]);
  assert.deepEqual([...pal.out.subarray(0, 6)], [255, 0, 0, 0, 255, 0], "palette entries 0 and 1 became red and green");
  assert.deepEqual(out.skipped.map((s) => s.reason).sort(), ["pictures in CMYK colour", "pictures stored as CCITTFaxDecode"]);
});

// ---- repair ----
import { endsProperly, hasHeader, looksLikePdfBody, withHeader, repairNote, listPages, rewrite } from "./repair.ts";
test("repair: a missing start marker is found and put back; other files are untouched", async () => {
  const doc = await PDFDocument.create(); doc.addPage([100, 100]); doc.addPage([100, 100]);
  const good = await doc.save({ useObjectStreams: false });
  assert.equal(hasHeader(good), true); assert.equal(withHeader(good).added, false); assert.equal(withHeader(good).bytes, good);
  const headless = good.slice(8); assert.equal(hasHeader(headless), false); assert.equal(looksLikePdfBody(headless), true);
  assert.equal(looksLikePdfBody(new TextEncoder().encode("just some text")), false);
  const fixed = withHeader(headless); assert.equal(fixed.added, true);
  assert.equal((await PDFDocument.load(fixed.bytes)).getPageCount(), 2, "the library opens it once the marker is back");
});
test("repair: damaged files that the library reads still save as a clean copy; the note says what was and wasn't found", async () => {
  const doc = await PDFDocument.create(); for (let i = 0; i < 3; i++) doc.addPage([100, 100]);
  const good = new TextDecoder("latin1").decode(await doc.save({ useObjectStreams: false }));
  const bad = new TextEncoder().encode(good.replace(/startxref\n\d+/, "startxref\n99999"));   // the index points nowhere
  const again = await (await PDFDocument.load(bad)).save();
  assert.equal((await PDFDocument.load(again)).getPageCount(), 3);
  assert.match(repairNote("a.pdf", 3, false, []), /no problems were detected \(3 pages, all readable\)/);
  assert.match(repairNote("a.pdf", 5, true, [2, 3, 4, 9]), /start marker.*pages 2 to 4 and 9 could not be read.*cannot be recovered/);
  assert.equal(listPages([1, 2, 3, 5]), "1 to 3 and 5"); assert.equal(listPages([4]), "4"); assert.equal(listPages([2, 3]), "2, 3");
});
test("repair: rewrite reports the page count the file claims against the pages it could find", async () => {
  const doc = await PDFDocument.create(); for (let i = 0; i < 4; i++) doc.addPage([100, 100]).drawRectangle({ x: 5, y: 5, width: 50, height: 50 });
  const good = await doc.save({ useObjectStreams: false });
  const r = await rewrite(good); assert.deepEqual([r.found, r.declared, r.added], [4, 4, false]);
  assert.deepEqual(r.lost, []); assert.equal(r.cutShort, false); assert.equal(endsProperly(good), true);
  const cut = await rewrite(good.slice(0, Math.floor(good.length * 0.8)));
  assert.equal(cut.cutShort, true); assert.ok(cut.lost.length > 0, "pages whose content was cut off are named");
  assert.match(repairNote("a.pdf", 4, false, [3, 4], 4, true), /ends without the usual end marker.*pages 3, 4 could not be read/);
  assert.match(repairNote("a.pdf", 3, false, [], 4), /says it has 4 pages but only 3 could be found, so 1 page is missing/);
  await assert.rejects(rewrite(new TextEncoder().encode("not a pdf at all")));
});

// ---- compare ----
import { diffWords, comparePages, diffReport, words } from "./diff.ts";
test("compare: word differences are found and located", () => {
  const r = diffWords(words("the quick brown fox jumps"), words("the slow brown fox leaps high"));
  assert.deepEqual(r.ops.map((o) => `${o.t}:${o.text}`), ["same:the", "del:quick", "add:slow", "same:brown fox", "del:jumps", "add:leaps high"]);
  assert.equal(diffWords([], ["a"]).ops[0].t, "add"); assert.deepEqual(diffWords(["a"], ["a"]).ops, [{ t: "same", text: "a" }]);
});
test("compare: pages match by position; missing pages and long pages are reported honestly", () => {
  const d = comparePages(["same  text", "one two three", "extra page"], ["same text", "one 2 three"]);
  assert.deepEqual(d.map((x) => x.state), ["same", "changed", "onlyA"]);
  assert.deepEqual([d[1].removed, d[1].added, d[2].removed], [1, 1, 2]);
  const big = Array.from({ length: 2500 }, (_, i) => "a" + i), other = Array.from({ length: 2500 }, (_, i) => "b" + i);
  assert.equal(diffWords(big, other).coarse, true);
  const rep = diffReport("A.pdf", "B.pdf", d); assert.match(rep, /Page 2: 1 words removed, 1 added/); assert.match(rep, /Page 3 \(only in A.pdf\)/);
  assert.match(diffReport("A", "B", comparePages(["x"], ["x"])), /No differences in the text/);
});

// ---- text to PDF ----
import { wrapText, paginate, linesPerPage, missingChars, replaceMissing, TEXT_DEFAULTS } from "./textpdf.ts";
test("text to pdf: lines wrap at spaces, long words break, blank lines and indents stay", () => {
  const m = (s: string) => s.length;   // one unit per character
  assert.deepEqual(wrapText("aaa bbb ccc ddd", m, 8), ["aaa bbb", "ccc ddd"]);
  assert.deepEqual(wrapText("abcdefghij", m, 4), ["abcd", "efgh", "ij"]);
  assert.deepEqual(wrapText("a\r\n\r\n  b\n", m, 10), ["a", "", "  b"]);
  assert.deepEqual(wrapText("x\ty", m, 20, 4), ["x    y"]);
  assert.deepEqual(wrapText("", m, 10), [""]);
});
test("text to pdf: pages hold the right number of lines; unsupported characters are counted and replaced", () => {
  const per = linesPerPage(TEXT_DEFAULTS); assert.ok(per > 40 && per < 60);
  assert.deepEqual(paginate(["a", "b", "c"], 2), [["a", "b"], ["c"]]); assert.deepEqual(paginate([], 5), [[]]);
  const has = new Set([..."abc"].map((c) => c.codePointAt(0)!));
  assert.deepEqual(missingChars("abc\nそう€€", has), { chars: ["そ", "う", "€"], count: 4 });
  assert.equal(replaceMissing("ab\nそc", has), "ab\n?c");
});

// ---- PDF to Markdown / HTML ----
import { toLines, toBlocks, toMarkdown, toHtml, bodySize } from "./structure.ts";
const it = (str: string, y: number, size: number, eol = true) => ({ str, x: 72, y, size, eol });
test("structure: headings by size, paragraphs by line gaps, bullets as lists", () => {
  const page = toLines([it("Annual Report", 780, 24), it("Overview", 740, 16), it("This is the first line of a paragraph", 710, 11), it("and it carries on here.", 696, 11),
    it("A new paragraph after a gap.", 650, 11), it("• first point", 620, 11), it("• second point", 606, 11), it("Closing words.", 560, 11)]);
  assert.equal(bodySize([page]), 11);
  const [b] = toBlocks([page]);
  assert.deepEqual(b.map((x) => x.kind + ("level" in x ? x.level : "")), ["h1", "h2", "p", "p", "li", "li", "p"]);
  assert.equal((b[2] as { text: string }).text, "This is the first line of a paragraph and it carries on here.");
  const md = toMarkdown([b]); assert.match(md, /^<!-- page 1 -->\n\n# Annual Report\n\n## Overview\n\nThis is the first/); assert.match(md, /\n- first point\n- second point\n/);
  const html = toHtml([b], "Report <1>"); assert.match(html, /<title>Report &lt;1&gt;<\/title>/); assert.match(html, /<ul>\n<li>first point<\/li>\n<li>second point<\/li>\n<\/ul>/); assert.match(html, /<h1>Annual Report<\/h1>/);
});
test("structure: text that looks like markdown or html is escaped; items on one baseline join into one line", () => {
  const lines = toLines([it("a <b> & *c*", 700, 11, false), { str: " tail", x: 200, y: 700.5, size: 11, eol: true }]);
  assert.equal(lines.length, 1); assert.equal(lines[0].text, "a <b> & *c* tail");
  const [b] = toBlocks([lines]); assert.match(toHtml([b], "t"), /<p>a &lt;b&gt; &amp; \*c\* tail<\/p>/); assert.match(toMarkdown([b]), /a \\<b\\> & \\\*c\\\* tail/);
  assert.deepEqual(toBlocks([[]]), [[]]); assert.equal(toMarkdown([[]]).trim(), "<!-- page 1 -->");
});

// ---- forms ----
import { listFields, fillForm } from "./forms.ts";
import { faceSet } from "./build.ts";
import { TextAlignment } from "@cantoo/pdf-lib";
test("forms: fields are listed with their kinds and filled values come out; flattening removes the fields", async () => {
  const doc = await PDFDocument.create(), page = doc.addPage([300, 300]), form = doc.getForm();
  form.createTextField("name").addToPage(page, { x: 10, y: 250, width: 150, height: 20 });
  form.createCheckBox("agree").addToPage(page, { x: 10, y: 220, width: 15, height: 15 });
  const dd = form.createDropdown("size"); dd.addOptions(["S", "M", "L"]); dd.addToPage(page, { x: 10, y: 190, width: 80, height: 20 });
  const rg = form.createRadioGroup("mode"); rg.addOptionToPage("a", page, { x: 10, y: 160, width: 15, height: 15 }); rg.addOptionToPage("b", page, { x: 40, y: 160, width: 15, height: 15 });
  const bytes = await doc.save();
  const f = await listFields(bytes); assert.deepEqual(f.map((x) => `${x.name}:${x.kind}`).sort(), ["agree:check", "mode:radio", "name:text", "size:choice"]);
  const r = await fillForm(bytes, undefined, { name: "Ada", agree: true, size: "M", mode: "b" }, false);
  assert.equal(r.changed, 4); assert.deepEqual(r.problems, []);
  const back = Object.fromEntries((await listFields(r.bytes)).map((x) => [x.name, x.value])); assert.deepEqual(back, { name: "Ada", agree: true, size: "M", mode: "b" });
  const flat = await fillForm(bytes, undefined, { name: "Ada" }, true); assert.equal((await listFields(flat.bytes)).length, 0);
  const bad = await fillForm(bytes, undefined, { name: "日本" }, false); assert.equal(bad.changed, 0); assert.match(bad.problems[0], /"name".*character/);
  assert.equal((await fillForm(bytes, undefined, { name: "" }, false)).changed, 0, "an unchanged field is not counted");
});

import { toView } from "./marks.ts";
test("forms: field boxes are placed on the page as shown, whatever its turn, and listed in reading order with their descriptions", async () => {
  const box = { x: 10, y: 20, width: 300, height: 500 };
  for (const r of [0, 90, 180, 270] as const) for (const [vx, vy] of [[0, 0], [37, 11], [120, 260]]) {
    const u = toUser(vx, vy, box, r), v = toView(u.x, u.y, box, r);
    assert.ok(Math.abs(v.x - vx) < 1e-9 && Math.abs(v.y - vy) < 1e-9, `turn ${r}`);
  }
  const doc = await PDFDocument.create(), form = doc.getForm(), p1 = doc.addPage([300, 400]), p2 = doc.addPage([300, 400]);
  p2.setRotation(degrees(90));
  form.createTextField("z_last").addToPage(p2, { x: 10, y: 10, width: 50, height: 20 });
  form.createTextField("b_right").addToPage(p1, { x: 200, y: 350, width: 50, height: 20 });
  const tf = form.createTextField("c_lower"); tf.addToPage(p1, { x: 10, y: 100, width: 50, height: 20 });
  tf.acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText("Your  postcode"));
  form.createTextField("a_left").addToPage(p1, { x: 10, y: 351, width: 50, height: 20 });
  const info = await listFields(await doc.save());
  assert.deepEqual(info.map((f) => f.name), ["a_left", "b_right", "c_lower", "z_last"], "top to bottom, left to right, page by page");
  assert.equal(info[2].label, "Your postcode"); assert.equal(info[0].label, undefined);
  assert.deepEqual(info[1].spots, [{ page: 0, x: 199.5, y: 29.5, w: 51, h: 21 }], "(the library adds half the border width around the box)");
  assert.deepEqual(info[3].spots, [{ page: 1, x: 9.5, y: 9.5, w: 21, h: 51 }], "on a page turned a quarter, the box is turned too");
});
import { addMarksInPlace } from "./build.ts";
import { today } from "./editor.ts";
test("edit: additions drawn onto the PDF itself keep its form fields, and a page's own drawing can't move them", async () => {
  const doc = await PDFDocument.create(), page = doc.addPage([300, 300]), form = doc.getForm();
  form.createTextField("name").addToPage(page, { x: 10, y: 250, width: 150, height: 20 });
  const p2 = doc.addPage([200, 400]);
  p2.pushOperators(PDFOperator.of(PDFOperatorNames.ConcatTransformationMatrix, [0.5, 0, 0, 0.5, 0, 0].map((n) => PDFNumber.of(n))));   // left in force, as some files do
  const filled = (await fillForm(await doc.save(), undefined, { name: "Ada" }, false)).bytes;
  const tick: Mark = { type: "ink", x: 20, y: 40, rotate: 0, w: 12, h: 12, strokes: [[0, 0.55, 0.36, 1, 1, 0]], color: "#000000", width: 1.5 };
  const text: Mark = { type: "text", x: 30, y: 60, rotate: 0, text: "Signed in York", size: 12, color: "#000000", font: "sans", bold: false };
  const contents = (d: PDFDocument, i: number) => { const c = d.getPages()[i].node.Contents(); return c instanceof PArr ? c.asArray().map((r) => new TextDecoder().decode(decodePDFRawStream(d.context.lookup(r) as PDFRawStream).decode()).trim()) : c ? ["(one stream)"] : []; };
  const before = await PDFDocument.load(filled);
  const out = await addMarksInPlace(filled, undefined, new Map([[1, [tick, text]]]), new Map(), {});
  const after = await PDFDocument.load(out);
  assert.deepEqual(Object.fromEntries((await listFields(out)).map((x) => [x.name, x.value])), { name: "Ada" }, "the field and its value are kept");
  assert.equal(after.getPageCount(), 2);
  assert.deepEqual(contents(after, 0), contents(before, 0), "a page with nothing added is left alone");
  const c1 = contents(after, 1);
  assert.equal(c1[0], "q", "the page's own drawing is wrapped, so a transform it leaves in force doesn't apply to the additions");
  assert.ok(c1.indexOf("Q") > 0 && c1.indexOf("Q") < c1.length - 1 && /TJ|Tj/.test(c1[c1.length - 1]), "the additions come after it");
  await assert.rejects(addMarksInPlace(filled, undefined, new Map([[0, [{ type: "image", x: 0, y: 0, rotate: 0, w: 10, h: 10, src: "missing" }]]]), new Map(), {}), /picture/);
});
test("forms: today's date is written with the digits every font here has", () => {
  const d = new Date(2026, 10, 25);
  assert.equal(today(d, "en-GB"), "25/11/2026");
  assert.equal(today(d, "en-US"), "11/25/2026");
  for (const l of ["ar-EG", "fa-IR", "he-IL", "hi-IN"]) assert.match(today(d, l), /^[0-9\/.\- ]+$/, l);
});

// ---- OCR text layer ----
import { wordMatrix, isRtl, arrangeLine, modernMalayalam, ocrScale, addTextLayer, meanConfidence, OCR_MAX_PIXELS } from "./ocr.ts";
import { addGlyphlessFont, glyphlessTtf, identityToUnicode, encodeWord } from "./glyphless.ts";
test("ocr: a word's matrix spans its box exactly, on upright and turned pages", () => {
  // upright: 2 px per point, page 300 pt tall; pixel (x, y) -> point (x/2, 300 - y/2)
  const up = (x: number, y: number): [number, number] => [x / 2, 300 - y / 2];
  const [a, b, c, d, e, f] = wordMatrix({ x0: 100, y0: 100, x1: 300, y1: 140 }, 4, 0.75, 0.25, up);
  assert.deepEqual([a * 4, b, c, d], [100, 0, 0, 20]);                     // 4 units of text cover 100 pt; 1 em = the 20 pt box height
  assert.deepEqual([e, f], [50, 300 - 130 / 2]);                             // baseline is a quarter of the box above its bottom
  // a page stored turned 90°: pixel x runs down the stored page, pixel y runs right-to-left
  const turned = (x: number, y: number): [number, number] => [y / 2, x / 2];
  const m = wordMatrix({ x0: 0, y0: 0, x1: 200, y1: 40 }, 2, 0.75, 0.25, turned);
  assert.deepEqual([m[0] * 2, m[1] * 2], [0, 100]); assert.deepEqual([m[2], m[3]], [-20, 0]);
});
test("ocr: huge pages are drawn smaller; words go in the glyph-less font, right-to-left words from the right", async () => {
  assert.equal(ocrScale(612, 792, 300), 300 / 72);
  const s = ocrScale(5000, 5000, 300); assert.ok(Math.abs(5000 * s * 5000 * s - OCR_MAX_PIXELS) < 1);
  const b = { x0: 0, y0: 0, x1: 1, y1: 1 }; assert.equal(meanConfidence([{ text: "a", box: b, confidence: 90 }, { text: "b", box: b, confidence: 30 }, { text: "c", box: b }]), 60); assert.equal(meanConfidence([]), null);
  assert.equal(isRtl("مرحبا"), true); assert.equal(isRtl("שלום"), true); assert.equal(isRtl("hello"), false); assert.equal(isRtl("2024"), false);
  const up = (x: number, y: number): [number, number] => [x, 300 - y];
  const box = (x0: number, x1: number) => ({ x0, x1, y0: 10, y1: 40 });
  assert.deepEqual(arrangeLine([{ text: "我", box: box(0, 30) }, { text: "们", box: box(35, 65) }, { text: "在", box: box(80, 110) }]).map((w) => w.text), ["我们在"], "no-space scripts are joined");
  assert.deepEqual(arrangeLine([{ text: "图", box: box(0, 30) }, { text: "书", box: box(200, 230) }]).map((w) => w.text), ["图", "书"], "but not across a wide gap");
  assert.deepEqual(arrangeLine([{ text: "one", box: box(0, 30) }, { text: "two", box: box(35, 65) }]).map((w) => w.text), ["one", "two"]);
  // right-to-left: the engine gives reading order (rightmost word first); stored left to right, letters reversed
  assert.deepEqual(arrangeLine([{ text: "مرحبا", box: box(200, 300) }, { text: "بكم", box: box(100, 180) }, { text: "2024", box: box(0, 80) }]).map((w) => w.text), ["2024", "مكب", "ابحرم"]);
  const doc = await PDFDocument.create(), page = doc.addPage([300, 300]), font = addGlyphlessFont(doc);
  const res = addTextLayer(page, font, [[{ text: "Привет", box: { x0: 10, y0: 10, x1: 110, y1: 40 } }], [{ text: "😀", box: { x0: 0, y0: 0, x1: 5, y1: 5 } }]], up);
  assert.deepEqual(res, { words: 1, dropped: 1 });
  const out = await PDFDocument.load(await doc.save()); const stream = out.getPage(0).node.Contents()!;
  const decode = (x: unknown) => { const st = out.context.lookup(x as never) as unknown as { getContents(): Uint8Array; dict: { get(n: PDFName): unknown } }; const raw = st.getContents(); return st.dict.get(PDFName.of("Filter")) ? new TextDecoder("latin1").decode(unzlibSync(raw)) : new TextDecoder("latin1").decode(raw); };
  const all = ("asArray" in stream ? (stream as unknown as { asArray(): unknown[] }).asArray() : [stream]).map(decode).join("\n");
  assert.match(all, /3 Tr/); assert.match(all, /<041F04400438043204350442> Tj/);
});
test("glyph-less font: a valid font file, a full ToUnicode map, and 2-byte codes for every basic character", () => {
  const ttf = glyphlessTtf(), dv = new DataView(ttf.buffer);
  assert.equal(dv.getUint32(0), 0x00010000); assert.equal(dv.getUint16(4), 10);
  let sum = 0; for (let i = 0; i < ttf.length; i += 4) sum = (sum + dv.getUint32(i)) >>> 0; assert.equal(sum, 0xb1b0afba, "whole-font checksum");
  const cmap = identityToUnicode(); assert.equal((cmap.match(/<[0-9A-F]{2}00> <[0-9A-F]{2}FF> <[0-9A-F]{2}00>/g) ?? []).length, 248); assert.doesNotMatch(cmap, /<D800>/);
  assert.deepEqual(encodeWord("Aé中"), { hex: "004100E94E2D", count: 3, dropped: 0 }); assert.deepEqual(encodeWord("a𠀀\u0001"), { hex: "0061", count: 1, dropped: 2 });
});

// ---- OCR languages ----
import { OCR_LANGS, chosenLangs } from "./ocrlangs.ts";
test("ocr languages: each one is served by the site from an installed package; choices are cleaned", () => {
  const meta = JSON.parse(readFileSync(new URL("../tool.json", import.meta.url), "utf8")) as { vendor: Record<string, string> };
  assert.equal(new Set(OCR_LANGS.map((l) => l.code)).size, OCR_LANGS.length);
  for (const l of OCR_LANGS) {
    const from = meta.vendor[`tesseract/lang/${l.code}.traineddata.gz`];
    assert.equal(from, `@tesseract.js-data/${l.code}/4.0.0_best_int/${l.code}.traineddata.gz`, `${l.code} must be listed in tool.json vendor`);
    assert.ok(existsSync(new URL(`../../../node_modules/${from}`, import.meta.url)), `${l.code}: package not installed`);
  }
  assert.deepEqual(chosenLangs("urd", "eng"), ["urd", "eng"]); assert.deepEqual(chosenLangs("fra", "fra"), ["fra"]);
  assert.deepEqual(chosenLangs("xx", ""), ["eng"]); assert.deepEqual(chosenLangs("deu", "zzz"), ["deu"]);
});

// ---- your own font: shaping order, embedding permission, drawing ----
import { shapeLine, checkEmbedding, fsTypeOf, ownFace, type FkFont } from "./face.ts";
import { harfBuzzShaper } from "./shaper.ts";
import { plainFont } from "./ownfont.ts";
import fontkit from "@cantoo/fontkit";
// a stand-in shaper: one glyph per character (id = its code point), reversed for right-to-left runs, as HarfBuzz returns them
const fakeShaper = (t: string, rtl: boolean) => { const g = [...t].map((c) => ({ id: c.codePointAt(0)!, chars: c, ax: 500, dx: 0, dy: 0 })); return rtl ? g.reverse() : g; };
const shown = (t: string) => shapeLine(fakeShaper, t).glyphs.map((p) => String.fromCodePoint(p.id)).join("");
test("own font: mixed right-to-left and left-to-right text is put in display order", () => {
  assert.equal(shown("abc"), "abc");
  assert.equal(shown("שלום"), "םולש", "a right-to-left word is drawn from its last letter on the left");
  assert.equal(shown("מחיר 25 ש"), "ש 25 ריחמ", "numbers inside right-to-left text keep their own order");
  assert.equal(shown("see שלום now"), "see םולש now");
  assert.equal(shown("(שלום)"), ")םולש(", "brackets are passed to the shaper as typed (HarfBuzz mirrors them; checked in the browser test)");
  const r = shapeLine(fakeShaper, "ab"); assert.deepEqual(r.glyphs.map((g) => g.x), [0, 500]); assert.equal(r.width, 1000);
});
test("own font: the maker's embedding permission is respected", () => {
  assert.deepEqual(checkEmbedding(0), { ok: true, subset: true });
  assert.equal(checkEmbedding(0x2).ok, false);
  assert.equal(checkEmbedding(0x200).ok, false);
  assert.equal(checkEmbedding(0x2 | 0x8).ok, false, "several permission bits (not allowed by the spec): the most restrictive applies");
  const v = checkEmbedding(0x4); assert.ok(v.ok && /viewed and printed/.test(v.note ?? ""));
  const n = checkEmbedding(0x100); assert.ok(n.ok && !n.subset);
  assert.equal(fsTypeOf({ "OS/2": { fsType: { noEmbedding: true, noSubsetting: true } } }), 0x102);
});
test("own font: text is embedded as a subset, tagged with its real text, and measured by the shaped glyphs", async () => {
  const bytes = readFileSync(new URL("../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf", import.meta.url));
  const fk = fontkit.create(bytes) as unknown as FkFont;
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit as never);
  const font = await doc.embedFont(bytes, { subset: true }), face = ownFace(fk, font, await harfBuzzShaper(new Uint8Array(bytes))), page = doc.addPage([300, 300]);
  assert.deepEqual(face.missing("Abc Жα אב"), ["א", "ב"]);
  assert.ok(Math.abs(face.widthOfTextAtSize("Hello", 20) - font.widthOfTextAtSize("Hello", 20)) < 0.01);
  face.draw(page, "Hello Жα", { x: 10, y: 100, size: 20, color: { r: 0, g: 0, b: 0 }, rotate: 0, opacity: 0.5 });
  const saved = await doc.save({ useObjectStreams: false }), back = await PDFDocument.load(saved);
  const stream = back.getPage(0).node.Contents()!;
  const decode = (x: unknown) => { const st = back.context.lookup(x as never) as unknown as { getContents(): Uint8Array; dict: { get(n: PDFName): unknown } }; const raw = st.getContents(); return new TextDecoder("latin1").decode(st.dict.get(PDFName.of("Filter")) ? unzlibSync(raw) : raw); };
  const ops = ("asArray" in stream ? (stream as unknown as { asArray(): unknown[] }).asArray() : [stream]).map(decode).join("\n");
  assert.match(ops, /\/Span <<\s*\/ActualText <FEFF00480065006C006C006F0020041603B1>\s*>> BDC/); assert.match(ops, /EMC/); assert.match(ops, /\/GS-\d+ gs/);
  assert.equal((ops.match(/<[0-9A-F]{4}>/g) ?? []).length, 8, "one glyph per character, space included");
  assert.match(ops, /\] TJ/, "written as a run with adjustments, not glyph by glyph");
  assert.ok(saved.length < bytes.length / 4, "only the letters used are embedded");
});
test("build: text in the visitor's own font is embedded once, only when used; a missing font file is reported", async () => {
  const fontBytes = readFileSync(new URL("../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf", import.meta.url));
  const own = { bytes: new Uint8Array(fontBytes), subset: true, name: "Liberation Sans" };
  const src = await PDFDocument.create(); src.addPage([300, 300]); const data = new Map([["a", { kind: "pdf" as const, bytes: await src.save() }]]);
  const T = { type: "text" as const, x: 20, y: 20, rotate: 0, text: "Привет", size: 20, color: "#000000", font: "own" as const, bold: false };
  const withText = await makeBuilder(data, { imageDpi: 96, ownFont: own })([{ src: "a", page: 0, rotate: 0, scale: 1, marks: [T] }]);
  const fontsIn = async (b: Uint8Array) => { const d = await PDFDocument.load(b); return d.context.enumerateIndirectObjects().filter(([, o]) => (o as { get?: (n: PDFName) => unknown }).get?.(PDFName.of("Subtype"))?.toString() === "/Type0").length; };
  assert.equal(await fontsIn(withText), 1);
  const without = await makeBuilder(data, { imageDpi: 96, ownFont: own })([{ src: "a", page: 0, rotate: 0, scale: 1 }]);
  assert.equal(await fontsIn(without), 0, "a file that doesn't use the font doesn't carry it");
  await assert.rejects(makeBuilder(data, { imageDpi: 96 })([{ src: "a", page: 0, rotate: 0, scale: 1, marks: [T] }]), /no font file is chosen/);
  await assert.rejects(makeBuilder(data, { imageDpi: 96, ownFont: own })([{ src: "a", page: 0, rotate: 0, scale: 1, marks: [{ ...T, text: "日本" }] }]), /Your font has no letters for: 日 本/);
});
test("own font: HarfBuzz places accents where the font says (fontkit put the accent of ó after ü in the wrong place)", async () => {
  const bytes = new Uint8Array(readFileSync(new URL("../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf", import.meta.url)));
  const shape = await harfBuzzShaper(bytes), r = shapeLine(shape, "Hello");
  assert.equal(r.glyphs.length, 5); assert.equal(r.glyphs.map((g) => g.chars).join(""), "Hello");
  const fk = fontkit.create(bytes) as unknown as FkFont & { layout(t: string): { positions: { xAdvance: number }[] } };
  assert.equal(r.width, fk.layout("Hello").positions.reduce((n, p) => n + p.xAdvance, 0), "same advances as the font's own metrics");
  const comb = shapeLine(shape, "u\u0308o\u0301");   // u + combining diaeresis, o + combining acute
  const acute = comb.glyphs[comb.glyphs.length - 1], o = comb.glyphs[comb.glyphs.length - 2];
  assert.ok(acute.x + acute.dx >= o.x - 1, "the acute sits on the o, not back over the u");
});
test("ocr: old-style Malayalam chillu sequences at the end of a word become the modern letters (Unicode 18, Table 12-43)", () => {
  assert.equal(modernMalayalam("അവന\u0D4D\u200D"), "അവൻ");
  assert.equal(modernMalayalam("രാമന\u0D4D\u200D,"), "രാമൻ,");
  assert.equal(modernMalayalam("ണ\u0D4D\u200D ര\u0D4D\u200D ല\u0D4D\u200D ള\u0D4D\u200D"), "ൺ ർ ൽ ൾ");
  assert.equal(modernMalayalam("ന\u0D4D\u200Dറ"), "ന\u0D4D\u200Dറ", "before another letter it is ambiguous, so left alone");
  assert.equal(modernMalayalam("ക\u0D4D\u200D"), "ക\u0D4D\u200D", "only the five chillus the standard lists");
  assert.equal(modernMalayalam("ഭാഷയാണ\u0D4D\u200C"), "ഭാഷയാണ\u0D4D", "a non-joiner after a final virama is dropped");
  assert.equal(modernMalayalam("hello"), "hello");
  assert.deepEqual(arrangeLine([{ text: "അവന\u0D4D\u200D", box: { x0: 0, x1: 50, y0: 0, y1: 20 } }]).map((w) => w.text), ["അവൻ"]);
});
test("own font: a WOFF file is unpacked to the plain font; WOFF 2 is refused with a reason", async () => {
  const ttf = new Uint8Array(readFileSync(new URL("../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf", import.meta.url)));
  // build a WOFF from the TrueType file: same tables, each zlib-compressed
  const dv = new DataView(ttf.buffer, ttf.byteOffset), n = dv.getUint16(4), recs = [...Array(n)].map((_, i) => ({ tag: dv.getUint32(12 + 16 * i), sum: dv.getUint32(16 + 16 * i), data: ttf.subarray(dv.getUint32(20 + 16 * i), dv.getUint32(20 + 16 * i) + dv.getUint32(24 + 16 * i)) }));
  const comp = recs.map((r) => { const z = zlibSync(r.data); return z.length < r.data.length ? z : r.data; }), size = 44 + 20 * n + comp.reduce((s, c) => s + ((c.length + 3) & ~3), 0), woff = new Uint8Array(size), w = new DataView(woff.buffer);
  w.setUint32(0, 0x774f4646); w.setUint32(4, dv.getUint32(0)); w.setUint32(8, size); w.setUint16(12, n); w.setUint32(16, ttf.length);
  let at = 44 + 20 * n; recs.forEach((r, i) => { const e = 44 + 20 * i; w.setUint32(e, r.tag); w.setUint32(e + 4, at); w.setUint32(e + 8, comp[i].length); w.setUint32(e + 12, r.data.length); w.setUint32(e + 16, r.sum); woff.set(comp[i], at); at += (comp[i].length + 3) & ~3; });
  const back = plainFont(woff), shape = await harfBuzzShaper(back);
  assert.equal(shapeLine(shape, "Hello").width, shapeLine(await harfBuzzShaper(ttf), "Hello").width);
  assert.equal((fontkit.create(back) as unknown as FkFont).postscriptName, "LiberationSans");
  assert.throws(() => plainFont(Uint8Array.from([0x77, 0x4f, 0x46, 0x32, ...new Array(60).fill(0)])), /WOFF 2/);
  assert.equal(plainFont(ttf), ttf);
});

// ---- shipped Noto fonts ----
import { NOTO_FILES, notoId } from "./notofiles.ts";
import { notoFilesFor, notoMissing, notoFace, notoLibrary, loadCjkIndex, hanStyleFor, notoOrder, arabicStyleFor } from "./noto.ts";
import { CJK_FILES } from "./cjkfiles.ts";
const fsNoto = async (id: string, weight: 400 | 700 = 400) => { const fam = id.match(/^(noto-nastaliq-urdu|noto-sans(?:-(?:sc|tc|jp|kr|malayalam|arabic|hebrew|devanagari|bengali|gurmukhi|tamil|telugu|kannada|thai))?)-/)![1]; return new Uint8Array(readFileSync(new URL(`../../../node_modules/@fontsource/${fam}/files/${id}-${weight}-normal.woff`, import.meta.url))); };
test("noto: the list of shipped files matches the installed packages' coverage", () => {
  for (const f of NOTO_FILES) {
    const u = JSON.parse(readFileSync(new URL(`../../../node_modules/@fontsource/${f.family}/unicode.json`, import.meta.url), "utf8")) as Record<string, string>;
    const ranges = u[f.subset].split(",").map((r) => r.trim().replace("U+", "")).map((r) => r.includes("-") ? r.split("-").map((x) => parseInt(x, 16)) : [parseInt(r, 16), parseInt(r, 16)]);
    assert.deepEqual(f.ranges, ranges, notoId(f));
    assert.ok(existsSync(new URL(`../../../node_modules/@fontsource/${f.family}/files/${notoId(f)}-400-normal.woff`, import.meta.url)));
  }
  const meta = JSON.parse(readFileSync(new URL("../tool.json", import.meta.url), "utf8")) as { vendor: Record<string, string> };
  for (const fam of new Set(NOTO_FILES.map((f) => f.family))) assert.equal(meta.vendor[`licenses/${fam}-LICENSE.txt`], `@fontsource/${fam}/LICENSE`, `${fam}: its licence must be served`);
});
test("noto: only the files a text needs are chosen; uncovered characters are reported", () => {
  assert.deepEqual(notoFilesFor("Hello").map(notoId), ["noto-sans-latin"]);
  assert.deepEqual(notoFilesFor("שלום עולם").map(notoId), ["noto-sans-hebrew-hebrew"], "spaces need no file of their own");
  assert.deepEqual(notoFilesFor("അവൻ 25 വയസ്സ്").map(notoId), ["noto-sans-latin", "noto-sans-malayalam-malayalam"]);
  assert.deepEqual(notoFilesFor("Привет मराठी").map(notoId), ["noto-sans-cyrillic", "noto-sans-devanagari-devanagari"]);
  assert.deepEqual(notoMissing("abc 😀"), ["😀"]);
});
test("noto: mixed Malayalam, Hindi and English text is drawn with each script's font, embedded only as needed", async () => {
  const doc = await PDFDocument.create(), face = notoFace(doc, notoLibrary(fsNoto)), page = doc.addPage([400, 200]);
  const text = "മലയാളം and हिन्दी 2026";
  await face.prepare!(text);
  assert.deepEqual(face.missing(text), []);
  assert.ok(face.widthOfTextAtSize(text, 20) > 100);
  face.draw(page, text, { x: 10, y: 100, size: 20, color: { r: 0, g: 0, b: 0 }, rotate: 0, opacity: 1 });
  const saved = await doc.save(), back = await PDFDocument.load(saved);
  const fams = back.context.enumerateIndirectObjects().map(([, o]) => (o as { get?: (n: PDFName) => unknown }).get?.(PDFName.of("BaseFont"))?.toString() ?? "").filter((n) => /Noto/.test(n));
  assert.ok(fams.some((n) => /Malayalam/.test(n)) && fams.some((n) => /Devanagari/.test(n)) && fams.some((n) => /NotoSans-/.test(n)), fams.join(" "));
  assert.ok(!fams.some((n) => /Arabic|Thai|Tamil|Bengali/.test(n)), "fonts not needed are not embedded");
});
test("noto CJK: the index matches the packages; the style follows the text or the choice; Han characters are drawn in the chosen style", async () => {
  for (const k of ["sc", "tc", "jp", "kr"] as const) {
    const fam = CJK_FILES[k].family, u = JSON.parse(readFileSync(new URL(`../../../node_modules/@fontsource/${fam}/unicode.json`, import.meta.url), "utf8")) as Record<string, string>;
    const numbered = Object.keys(u).filter((x) => /^\[\d+\]$/.test(x));
    assert.equal(CJK_FILES[k].files.length, numbered.length, fam);
    for (const [sub, r] of CJK_FILES[k].files) {
      const want = u[`[${sub}]`].split(",").map((p) => p.trim().replace("U+", "")).map((p) => { const [a, b] = p.split("-"); return [parseInt(a, 16), parseInt(b ?? a, 16)]; });
      const got = r.split(",").map((p) => { const [a, b] = p.split("-"); return [parseInt(a, 16), parseInt(b ?? a, 16)]; });
      assert.deepEqual(got, want, `${fam} ${sub}`);
    }
    const meta = JSON.parse(readFileSync(new URL("../tool.json", import.meta.url), "utf8")) as { vendor: Record<string, string> };
    assert.equal(meta.vendor[`licenses/${fam}-LICENSE.txt`], `@fontsource/${fam}/LICENSE`, `${fam}: its licence must be served`);
  }
  assert.equal(hanStyleFor("直す", "auto"), "jp"); assert.equal(hanStyleFor("한국 直", "auto"), "kr"); assert.equal(hanStyleFor("直接", "auto"), "sc"); assert.equal(hanStyleFor("直接", "tc"), "tc");
  await loadCjkIndex();
  assert.deepEqual(notoMissing("abc 日本 😀"), ["😀"], "after loading the index, Han characters are covered");
  assert.ok(notoFilesFor("日本語の文章", "auto").every((f) => f.family === "noto-sans-jp"));
  assert.ok(notoFilesFor("我们学习中文", "auto").every((f) => f.family === "noto-sans-sc"));
  assert.ok(notoFilesFor("我們學習中文", "tc").every((f) => f.family === "noto-sans-tc"));
  assert.ok(notoFilesFor("한국어 문장", "auto").every((f) => f.family === "noto-sans-kr" || f.family === "noto-sans"));
  assert.equal(notoOrder("x", "jp").findIndex((f) => f.family === "noto-sans-jp") < notoOrder("x", "jp").findIndex((f) => f.family === "noto-sans-sc"), true);
  // 直 is drawn differently in Chinese and Japanese: the two files' outlines for it differ
  const lib = notoLibrary(fsNoto), outline = async (style: "sc" | "jp") => { const f = notoFilesFor("直", style)[0], r = await lib(f); return (r.fk as unknown as { glyphForCodePoint(c: number): { path: { toSVG(): string } } }).glyphForCodePoint(0x76f4).path.toSVG(); };
  assert.notEqual(await outline("sc"), await outline("jp"));
  const doc = await PDFDocument.create(), face = notoFace(doc, lib, "auto"), page = doc.addPage([400, 200]);
  const lines = ["我们在图书馆学习中文", "日本語の文章を読みます", "한국어 문장을 읽습니다"];
  await face.prepare!(lines.join("\n"));   // prepared together, as Text to PDF does; each line drawn in its own style
  for (const t of lines) { assert.deepEqual(face.missing(t), []); face.draw(page, t, { x: 10, y: 100, size: 20, color: { r: 0, g: 0, b: 0 }, rotate: 0, opacity: 1 }); }
  const back = await PDFDocument.load(await doc.save());
  // every embedded font holds at least one glyph besides .notdef (none was loaded for nothing), and every character
  // drawn is in the fonts' character maps
  const maps = back.context.enumerateIndirectObjects().filter(([, o]) => (o as { get?: (n: PDFName) => unknown }).get?.(PDFName.of("ToUnicode"))).map(([, o]) => {
    const st = back.context.lookup((o as unknown as { get(n: PDFName): unknown }).get(PDFName.of("ToUnicode")) as never) as unknown as { getContents(): Uint8Array; dict: { get(n: PDFName): unknown } };
    const raw = st.getContents(); return new TextDecoder("latin1").decode(st.dict.get(PDFName.of("Filter")) ? unzlibSync(raw) : raw);
  });
  for (const m of maps) assert.match(m, /beginbfchar\s*<0001>/, "an embedded font with no glyphs");
  const mapped = new Set(maps.flatMap((m) => [...m.matchAll(/<[0-9A-F]{4}> <([0-9A-F]{4})>/g)].map((x) => String.fromCodePoint(parseInt(x[1], 16)))));
  for (const ch of lines.join("").replace(/\s/g, "")) assert.ok(mapped.has(ch), `${ch} is not in any embedded font`);
  const fams = back.context.enumerateIndirectObjects().map(([, o]) => (o as { get?: (n: PDFName) => unknown }).get?.(PDFName.of("BaseFont"))?.toString() ?? "").filter((n) => /Noto/.test(n));
  assert.ok(fams.some((n) => /SC/.test(n)) && fams.some((n) => /JP/.test(n)) && fams.some((n) => /KR/.test(n)) && !fams.some((n) => /TC/.test(n)), fams.join(" "));
});
test("noto: a line in one alphabet stays one piece, spaces included, so readers keep right-to-left words in order", async () => {
  const lib = notoLibrary(fsNoto), doc = await PDFDocument.create(), face = notoFace(doc, lib), page = doc.addPage([400, 100]);
  await face.prepare!("שלום עולם וברוכים");
  face.draw(page, "שלום עולם וברוכים", { x: 10, y: 50, size: 20, color: { r: 0, g: 0, b: 0 }, rotate: 0, opacity: 1 });
  const back = await PDFDocument.load(await doc.save());
  const fonts = back.context.enumerateIndirectObjects().map(([, o]) => (o as { get?: (n: PDFName) => unknown }).get?.(PDFName.of("BaseFont"))?.toString() ?? "").filter((n) => /Noto/.test(n));
  assert.ok(fonts.length > 0 && fonts.every((n) => /Hebrew/.test(n)), `only the Hebrew font: ${fonts.join(" ")}`);
  const blank = notoFace(await PDFDocument.create(), lib); await blank.prepare!("   "); assert.ok(blank.widthOfTextAtSize("   ", 10) > 0, "a line of spaces still has a width");
});
test("bold: Noto uses its own bold files; the visitor's font uses their bold file, or a simulated bold that outlines the letters", async () => {
  const src = await PDFDocument.create(); src.addPage([300, 300]); const data = new Map([["a", { kind: "pdf" as const, bytes: await src.save() }]]);
  const T = { type: "text" as const, x: 20, y: 20, rotate: 0, text: "മലയാളം Bold", size: 20, color: "#000000", font: "noto" as const, bold: true };
  const pdfFonts = async (b: Uint8Array) => { const d = await PDFDocument.load(b); return d.context.enumerateIndirectObjects().map(([, o]) => (o as { get?: (n: PDFName) => unknown }).get?.(PDFName.of("BaseFont"))?.toString() ?? "").filter((n) => n && !/^\/[A-Z]{6}\+/.test(n) || /Noto|Liberation/.test(n)); };
  const noto = await pdfFonts(await makeBuilder(data, { imageDpi: 96, noto: fsNoto })([{ src: "a", page: 0, rotate: 0, scale: 1, marks: [T] }]));
  assert.ok(noto.some((n) => /NotoSansMalayalam-Bold/.test(n)) && noto.some((n) => /NotoSans-Bold/.test(n)) && !noto.some((n) => /Regular/.test(n)), noto.join(" "));
  const reg = new Uint8Array(readFileSync(new URL("../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf", import.meta.url)));
  const boldFile = new Uint8Array(readFileSync(new URL("../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf", import.meta.url)));
  const own = { bytes: reg, subset: true, name: "Liberation Sans" }, ownBold = { bytes: boldFile, subset: true, name: "Liberation Sans Bold" };
  const O = { ...T, text: "Bold text", font: "own" as const };
  const ops = async (b: Uint8Array) => { const d = await PDFDocument.load(b), c = d.getPage(0).node.Contents()!; const dec = (x: unknown) => { const st = d.context.lookup(x as never) as unknown as { getContents(): Uint8Array; dict: { get(n: PDFName): unknown } }; const raw = st.getContents(); return new TextDecoder("latin1").decode(st.dict.get(PDFName.of("Filter")) ? unzlibSync(raw) : raw); }; return ("asArray" in c ? (c as unknown as { asArray(): unknown[] }).asArray() : [c]).map(dec).join("\n"); };
  const simulated = await makeBuilder(data, { imageDpi: 96, ownFont: own })([{ src: "a", page: 0, rotate: 0, scale: 1, marks: [O] }]);
  assert.match(await ops(simulated), /2 Tr/); assert.match(await ops(simulated), /0\.6 w/, "outline 3% of the 20-point size");
  const withFile = await makeBuilder(data, { imageDpi: 96, ownFont: own, ownBold })([{ src: "a", page: 0, rotate: 0, scale: 1, marks: [O] }]);
  assert.doesNotMatch(await ops(withFile), /2 Tr/); assert.ok((await pdfFonts(withFile)).some((n) => /LiberationSans-Bold/.test(n)));
  const regular = await makeBuilder(data, { imageDpi: 96, ownFont: own })([{ src: "a", page: 0, rotate: 0, scale: 1, marks: [{ ...O, bold: false }] }]);
  assert.doesNotMatch(await ops(regular), /2 Tr/);
});
test("noto: Urdu is drawn in Nastaliq by default, Arabic and Persian in Naskh; the choice can be fixed", async () => {
  const urdu = "پاکستان ایک خوبصورت ملک ہے", arabic = "مرحبا بكم في المكتبة", persian = "کتاب‌خانه بزرگ است";
  assert.equal(arabicStyleFor(urdu, "auto"), "nastaliq"); assert.equal(arabicStyleFor(arabic, "auto"), "naskh"); assert.equal(arabicStyleFor(persian, "auto"), "naskh");
  assert.equal(arabicStyleFor(arabic, "nastaliq"), "nastaliq"); assert.equal(arabicStyleFor(urdu, "naskh"), "naskh");
  assert.deepEqual(notoFilesFor(urdu).map((f) => f.family), ["noto-nastaliq-urdu"]);
  assert.deepEqual(notoFilesFor(arabic).map((f) => f.family), ["noto-sans-arabic"]);
  assert.deepEqual(notoFilesFor(urdu, "auto", "naskh").map((f) => f.family), ["noto-sans-arabic"]);
  const meta = JSON.parse(readFileSync(new URL("../tool.json", import.meta.url), "utf8")) as { vendor: Record<string, string> };
  assert.equal(meta.vendor["licenses/noto-nastaliq-urdu-LICENSE.txt"], "@fontsource/noto-nastaliq-urdu/LICENSE");
  const doc = await PDFDocument.create(), face = notoFace(doc, notoLibrary(fsNoto)), page = doc.addPage([400, 200]);
  await face.prepare!(`${urdu}\n${arabic}`);
  for (const [i, t] of [urdu, arabic].entries()) { assert.deepEqual(face.missing(t), []); face.draw(page, t, { x: 10, y: 150 - i * 60, size: 20, color: { r: 0, g: 0, b: 0 }, rotate: 0, opacity: 1 }); }
  assert.ok(face.heightAtSize(20) > 30, "Nastaliq is taller than 1.5 times its size, so its lines need more room");
  const fonts = (await PDFDocument.load(await doc.save())).context.enumerateIndirectObjects().map(([, o]) => (o as { get?: (n: PDFName) => unknown }).get?.(PDFName.of("BaseFont"))?.toString() ?? "").filter((n) => /Noto/.test(n));
  assert.ok(fonts.some((n) => /NastaliqUrdu/.test(n)) && fonts.some((n) => /NotoSansArabic/.test(n)), fonts.join(" "));
});
test("noto: letters that share a glyph keep their own text; glyphs standing for no letter give WORD JOINER; every line carries its real text", async () => {
  // Arabic-script fonts draw ب ت ث (and ح خ) on one dotless base glyph and add the dots as separate glyphs.
  const lines = ["بيت ثابت", "شکریہ اور خدا حافظ", "किताब और पुस्तक"];
  const doc = await PDFDocument.create(), face = notoFace(doc, notoLibrary(fsNoto)), page = doc.addPage([400, 300]);
  for (const [i, t] of lines.entries()) { await face.prepare!(t); face.draw(page, t, { x: 10, y: 250 - i * 80, size: 20, color: { r: 0, g: 0, b: 0 }, rotate: 0, opacity: 1 }); }
  const back = await PDFDocument.load(await doc.save()), pg = back.getPage(0);
  const dec = (ref: unknown) => { const st = back.context.lookup(ref as never) as unknown as { getContents(): Uint8Array; dict: { get(n: PDFName): unknown } }; const raw = st.getContents(); return new TextDecoder("latin1").decode(st.dict.get(PDFName.of("Filter")) ? unzlibSync(raw) : raw); };
  const c = pg.node.Contents()!, ops = ("asArray" in c ? (c as unknown as { asArray(): unknown[] }).asArray() : [c]).map(dec).join("\n");
  const fontDict = pg.node.Resources()!.lookup(PDFName.of("Font")) as unknown as { get(n: PDFName): unknown };
  const maps = new Map<string, Map<number, string>>();
  const mapOf = (name: string) => {
    let m = maps.get(name); if (m) return m; m = new Map();
    const f = back.context.lookup(fontDict.get(PDFName.of(name)) as never) as unknown as { get(n: PDFName): unknown };
    for (const [, cid, u] of dec(f.get(PDFName.of("ToUnicode"))).matchAll(/^<([0-9a-fA-F]{4})> <([0-9a-fA-F]*)>$/gm)) m.set(parseInt(cid, 16), String.fromCodePoint(...(u.match(/.{4}/g) ?? []).map((h) => parseInt(h, 16))));
    maps.set(name, m); return m;
  };
  // the text each line's glyphs give through the character maps, in drawing order
  const drawn: string[] = [];
  for (const block of ops.split(/BDC/).slice(1)) {
    let font = "", text = "";
    for (const m of block.matchAll(/\/(\S+) [\d.]+ Tf|\[((?:.|\n)*?)\] TJ/g)) {
      if (m[1]) { font = m[1]; continue; }
      for (const [, h] of m[2].matchAll(/<([0-9A-Fa-f]{4})>/g)) { const u = mapOf(font).get(parseInt(h, 16)); assert.ok(u !== undefined, `glyph ${h} of ${font} has a character-map entry`); text += u; }
    }
    drawn.push(text);
  }
  assert.equal(drawn.length, lines.length);
  const letters = (s: string) => [...s.replace(/[\s⁠]/g, "")].sort().join("");
  for (const [i, t] of lines.entries()) assert.equal(letters(drawn[i]), letters(t), `every letter of “${t}” comes back from its own glyph`);
  assert.ok(drawn.slice(0, 2).every((d) => d.includes("⁠")), "the dot glyphs give WORD JOINER");
  for (const t of lines) assert.ok(ops.includes(`/ActualText <${[...PDFHexString.fromText(t).asBytes()].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}>`), `“${t}” is tagged with its real text`);
});
test("build: the Arabic-script style chosen for Noto reaches added text (Urdu in Nastaliq by default, Naskh when chosen)", async () => {
  const src = await PDFDocument.create(); src.addPage([300, 300]); const data = new Map([["a", { kind: "pdf" as const, bytes: await src.save() }]]);
  const T = { type: "text" as const, x: 20, y: 20, rotate: 0, text: "میں اردو پڑھتا ہوں", size: 20, color: "#000000", font: "noto" as const, bold: false };
  const fontsOf = async (arabic?: "naskh") => { const d = await PDFDocument.load(await makeBuilder(data, { imageDpi: 96, noto: fsNoto, ...(arabic ? { arabic } : {}) })([{ src: "a", page: 0, rotate: 0, scale: 1, marks: [T] }])); return d.context.enumerateIndirectObjects().map(([, o]) => (o as { get?: (n: PDFName) => unknown }).get?.(PDFName.of("BaseFont"))?.toString() ?? "").filter((n) => /Noto/.test(n)); };
  const auto = await fontsOf(), naskh = await fontsOf("naskh");
  assert.ok(auto.length > 0 && auto.every((n) => /NastaliqUrdu/.test(n)), auto.join(" "));
  assert.ok(naskh.length > 0 && naskh.every((n) => /NotoSansArabic/.test(n)), naskh.join(" "));
});
test("forms: text in other alphabets is drawn with Noto Sans or the visitor's font, laid out as the library lays out fields", async () => {
  const doc = await PDFDocument.create(), page = doc.addPage([400, 400]), form = doc.getForm();
  form.createTextField("ml").addToPage(page, { x: 10, y: 350, width: 200, height: 24 });
  const multi = form.createTextField("notes"); multi.enableMultiline(); multi.addToPage(page, { x: 10, y: 250, width: 120, height: 80 });
  const right = form.createTextField("right"); right.setAlignment(TextAlignment.Right); right.addToPage(page, { x: 220, y: 350, width: 150, height: 24 });
  form.createTextField("turned").addToPage(page, { x: 330, y: 150, width: 150, height: 24, rotate: degrees(90) });
  const dd = form.createDropdown("city"); dd.addOptions(["York", "കൊച്ചി"]); dd.enableEditing(); dd.addToPage(page, { x: 10, y: 200, width: 150, height: 24 });
  const ls = form.createOptionList("langs"); ls.addOptions(["English", "മലയാളം", "اردو"]); ls.enableMultiselect(); ls.addToPage(page, { x: 10, y: 100, width: 150, height: 60 });
  form.createTextField("plain").addToPage(page, { x: 220, y: 300, width: 150, height: 24 });
  const auto = form.createTextField("auto"); auto.enableMultiline(); auto.addToPage(page, { x: 200, y: 200, width: 150, height: 60 });
  await doc.save(); auto.acroField.setDefaultAppearance("/Helv 0 Tf 0 g");   // automatic size, kept as forms made elsewhere keep it
  const bytes = await doc.save({ updateFieldAppearances: false });
  const fonts = { choice: "auto" as const, faces: (d: PDFDocument) => { const fs = faceSet(d, undefined, fsNoto); return (k: "noto" | "own") => fs(k, false); } };
  const values: Record<string, string | string[]> = { ml: "അവൻ പുസ്തകം വായിക്കുന്നു", notes: "مرحبا بكم في المكتبة العامة\nनमस्ते", right: "שלום", turned: "हिन्दी", city: "കൊച്ചി", langs: ["മലയാളം", "اردو"], plain: "Ada" };
  const r = await fillForm(bytes, undefined, values, false, fonts);
  assert.deepEqual(r.problems, []); assert.equal(r.changed, 7); assert.equal(r.drawn, 6, "all but the English field are drawn with Noto");
  const back = Object.fromEntries((await listFields(r.bytes)).map((x) => [x.name, x.value])); assert.deepEqual(Object.fromEntries(Object.entries(back).filter(([k]) => k in values)), values, "values are stored as typed");
  const out = await PDFDocument.load(r.bytes), of = out.getForm();
  assert.equal(of.acroForm.dict.get(PDFName.of("NeedAppearances"))?.toString(), "false", "viewers are told not to redraw the fields in the form's own font");
  const apText = (name: string) => { const w = of.getField(name).acroField.getWidgets()[0], ap = w.getNormalAppearance() as unknown as { getContents(): Uint8Array; dict: { get(n: PDFName): unknown; lookup(n: PDFName): unknown } }; const st = (out.context.lookup(ap as never) ?? ap) as typeof ap; const raw = st.getContents(); return { ops: new TextDecoder("latin1").decode(st.dict.get(PDFName.of("Filter")) ? unzlibSync(raw) : raw), fonts: String(st.dict.lookup(PDFName.of("Resources"))) }; };
  const ml = apText("ml"); assert.match(ml.fonts, /NotoSansMalayalam/); assert.match(ml.ops, /\/Tx BMC/); assert.match(ml.ops, /ActualText/);
  assert.match(apText("langs").ops, /0\.6 0\.75\d* 0\.85\d* rg/, "chosen options are highlighted in the library's blue");
  // rotation, background, border and clip are the library's own: compare with its appearance of the same fields in English
  const lib = await PDFDocument.load((await fillForm(bytes, undefined, { turned: "Hindi", ml: "Malayalam", langs: ["English"] }, false)).bytes);
  for (const name of ["turned", "ml", "langs"]) {
    const w = lib.getForm().getField(name).acroField.getWidgets()[0], st = lib.context.lookup(w.getNormalAppearance() as never) as unknown as { getContents(): Uint8Array; dict: { get(n: PDFName): unknown } };
    const raw = st.getContents(), theirs = new TextDecoder("latin1").decode(st.dict.get(PDFName.of("Filter")) ? unzlibSync(raw) : raw);
    const frame = (t: string) => t.slice(0, t.indexOf("/Tx BMC")).replace(/q\n[^qQ]*0\.6 0\.75\d* 0\.85\d* rg[^qQ]*Q\n/g, "");   // highlights differ with the chosen options
    assert.equal(frame(apText(name).ops), frame(theirs), `${name}: same frame as the library draws`);
  }
  assert.doesNotMatch(apText("plain").ops, /ActualText/, "English is left to the library (Helvetica)");
  // automatic size in a multi-line field: each line is spaced by its own fonts, and the last line's descenders stay inside the box
  const a2 = await fillForm(bytes, undefined, { auto: "مرحبا بكم\nनमस्ते" }, false, fonts), back2 = await PDFDocument.load(a2.bytes);
  const st2 = back2.context.lookup(back2.getForm().getField("auto").acroField.getWidgets()[0].getNormalAppearance() as never) as unknown as { getContents(): Uint8Array; dict: { get(n: PDFName): unknown } };
  const ops2 = new TextDecoder("latin1").decode(st2.dict.get(PDFName.of("Filter")) ? unzlibSync(st2.getContents()) : st2.getContents());
  const ys = [...ops2.matchAll(/ ([\d.-]+) Tm/g)].map((m) => Number(m[1])), size2 = Number(ops2.match(/ ([\d.]+) Tf/)![1]);
  const m2 = await faceSet(await PDFDocument.create(), undefined, fsNoto)("noto", false); await m2.prepare!("مرحبا بكم\nनमस्ते");
  const full = (t: string) => m2.heightAtSize(size2, { text: t }), down = (t: string) => full(t) - m2.heightAtSize(size2, { text: t, descender: false });
  assert.equal(ys.length, 2); assert.ok(size2 > 4);
  assert.ok(Math.abs(ys[0] - ys[1] - 1.2 * full("नमस्ते")) < 1e-6, "the Hindi line is spaced by the Devanagari font, not the Arabic one");
  assert.ok(ys[1] - down("नमस्ते") >= 2 - 1e-6, `last line's descenders inside the box (baseline ${ys[1]} at ${size2} pt)`);
  assert.ok(full("مرحبا بكم") > full("नमस्ते") * 1.3, "(the Arabic font does ask for more room)");
  // the visitor's own font, and a character it lacks
  const reg = new Uint8Array(readFileSync(new URL("../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf", import.meta.url)));
  const own = { choice: "own" as const, faces: (d: PDFDocument) => { const fs = faceSet(d, { bytes: reg, subset: true, name: "Liberation Sans" }, fsNoto); return (k: "noto" | "own") => fs(k, false); } };
  const o = await fillForm(bytes, undefined, { plain: "Ада", ml: "അ" }, false, own);
  assert.equal(o.changed, 1); assert.match(o.problems.join(" "), /"ml": contains a character the chosen font cannot show \(അ\)/);
  // without fonts given (as before), other alphabets are refused with a reason
  assert.match((await fillForm(bytes, undefined, { ml: "അ" }, false)).problems[0], /"ml".*character/);
  // flattening keeps the drawn text on the page
  const flat = await fillForm(bytes, undefined, values, true, fonts); assert.equal((await listFields(flat.bytes)).length, 0); assert.deepEqual(flat.problems, []);
});

// ---------- Redact PDF ----------
import { leftovers, findQuads, quadToMark, mergeMarks, termPattern, type TextItem } from "./redact.ts";
import { PDFString } from "@cantoo/pdf-lib";

async function secretPdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle("Report on Jane Doe"); doc.setSubject("Jane Doe"); doc.setKeywords(["Jane Doe"]);
  const p1 = doc.addPage([300, 200]); p1.drawText("Patient: Jane Doe", { x: 20, y: 150, size: 14, font }); p1.drawText("Diagnosis follows", { x: 20, y: 120, size: 12, font });
  const p2 = doc.addPage([300, 200]); p2.drawText("Public appendix", { x: 20, y: 150, size: 14, font });
  // a comment on page 2 that names her, and an attachment that does
  const note = doc.context.obj({ Type: "Annot", Subtype: "Text", Rect: [10, 10, 30, 30], Contents: PDFString.of("Call Jane Doe back") });
  p2.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(note)]));
  await doc.attach(new TextEncoder().encode("Jane Doe, 1 High Street"), "notes.txt", { mimeType: "text/plain" });
  return doc.save();
}
const fakePicture = async () => ({ image: PNG, png: true, width: 300, height: 200, scale: 1 });

test("redact: a page with areas to remove is rebuilt from its picture and nothing of it is copied; other pages lose comments when asked", async () => {
  const bytes = await secretPdf();
  assert.ok((await leftovers(bytes, ["Jane Doe"])).length >= 4, "the check finds her in the original: title, page text, comment, attachment");
  const data = new Map([["a", { kind: "pdf" as const, bytes }]]);
  const pages = [{ src: "a", page: 0, rotate: 0 as const, scale: 1, marks: [{ type: "redact" as const, x: 70, y: 35, rotate: 0 as const, w: 80, h: 20 }] }, { src: "a", page: 1, rotate: 0 as const, scale: 1 }];
  let asked = 0;
  const out = await makeBuilder(data, { imageDpi: 96, stripOthers: true, redact: async (p) => { asked++; assert.equal(p.page, 0); return fakePicture(); } })(pages);
  assert.equal(asked, 1, "only the page with areas is drawn as a picture");
  assert.deepEqual(await leftovers(out, ["Jane Doe", "Diagnosis", "notes.txt", "Call"]), [], "no trace of the redacted page, the comment, the attachment or the title");
  assert.ok((await leftovers(out, ["Public appendix"])).length > 0, "the other page's text is still there");
  const back = await PDFDocument.load(out);
  assert.equal(back.getPageCount(), 2);
  assert.equal(back.getPage(1).node.get(PDFName.of("Annots")), undefined, "comments, links and fields dropped from the other pages");
  const xo = back.getPage(0).node.Resources()!.lookup(PDFName.of("XObject")) as unknown as { keys(): PDFName[] };
  assert.equal(xo.keys().length, 1, "the rebuilt page holds just its picture");
  const f0 = back.getPage(0).node.Resources()!.lookup(PDFName.of("Font")) as unknown as { keys(): PDFName[] } | undefined;
  assert.equal(f0?.keys().length ?? 0, 0, "and no fonts");
  assert.equal(back.getTitle(), undefined, "the original's metadata is not carried over");
  // kept when not asked to strip; the check then finds the comment
  const kept = await makeBuilder(data, { imageDpi: 96, redact: fakePicture })(pages);
  const k2 = await leftovers(kept, ["Jane Doe"]);   // the comment, seen directly and inside the compressed object stream that holds it
  assert.ok(k2.length >= 1 && k2.every((x) => /object \d+/.test(x.where)), "the comment on page 2 stays (and is reported)");
  // a page with areas can't be saved without the picture step
  await assert.rejects(makeBuilder(data, { imageDpi: 96 })(pages), /Redact PDF/);
});

test("redact: text read back from the picture becomes an invisible layer on the rebuilt page", async () => {
  const data = new Map([["a", { kind: "pdf" as const, bytes: await secretPdf() }]]);
  const lines = [[{ text: "Patient:", box: { x0: 20, y0: 35, x1: 80, y1: 50 } }, { text: "[gone]", box: { x0: 90, y0: 35, x1: 150, y1: 50 } }]];
  const out = await makeBuilder(data, { imageDpi: 96, redact: async () => ({ ...(await fakePicture()), lines }) })([{ src: "a", page: 0, rotate: 0, scale: 1, marks: [{ type: "redact", x: 0, y: 0, rotate: 0, w: 10, h: 10 }] }]);
  assert.ok((await leftovers(out, ["Jane"])).length === 0);
  const back = await PDFDocument.load(out), fonts = back.getPage(0).node.Resources()!.lookup(PDFName.of("Font")) as unknown as { keys(): PDFName[] };
  assert.equal(fonts.keys().length, 1, "the glyph-less font of the text layer");
});

test("redact: finding text gives boxes over the matches, joined across pieces, widened where a piece is split", () => {
  const measure = (t: string) => t.length;   // stand-in: every letter the same width
  const items: TextItem[] = [
    { str: "Patient: Ja", transform: [10, 0, 0, 10, 100, 500], width: 55, height: 10, fontName: "f" },
    { str: "ne Doe", transform: [10, 0, 0, 10, 155, 500], width: 30, height: 10, fontName: "f", hasEOL: true },
    { str: "JANE DOE again", transform: [10, 0, 0, 10, 100, 480], width: 70, height: 10, fontName: "f" },
    { str: "Janet", transform: [10, 0, 0, 10, 100, 460], width: 25, height: 10, fontName: "f" },
  ];
  const styles = { f: { ascent: 0.8, descent: -0.2 } };
  const found = findQuads(items, styles, ["jane   doe"], false, measure);
  assert.equal(found.length, 2, "case and spacing ignored; split across two pieces still found once");
  assert.equal(found[0].quads.length, 2);
  const [q1, q2] = found[0].quads;
  // starts at "Ja": 9 of 11 letters into the first piece, widened by 0.35 of the size; ends at the piece's edge (exact, plus padding)
  assert.ok(Math.abs(q1[0][0] - (100 + 45 - 3.5)) < 1e-9 && Math.abs(q1[1][0] - (155 + 1.2)) < 1e-9);
  assert.ok(Math.abs(q2[0][0] - (155 - 1.2)) < 1e-9 && Math.abs(q2[1][0] - (185 + 1.2)) < 1e-9);
  assert.ok(Math.abs(q1[0][1] - (500 - 3.2)) < 1e-9 && Math.abs(q1[2][1] - (500 + 9.2)) < 1e-9, "descent to ascent, padded");
  assert.equal(findQuads(items, styles, ["Jane"], false, measure).length, 3, "inside “Janet” too");
  assert.equal(findQuads(items, styles, ["Jane"], true, measure).length, 2, "whole words only: not “Janet”");
  // a right-to-left piece is covered whole; a turned piece gives a turned quad
  const rtl = findQuads([{ str: "שלום עולם", transform: [10, 0, 0, 10, 50, 50], width: 60, height: 10, dir: "rtl" }], {}, ["עולם"], false, measure)[0].quads[0];
  assert.ok(rtl[0][0] <= 50 && rtl[1][0] >= 110);
  const up = findQuads([{ str: "abc", transform: [0, 10, -10, 0, 50, 50], width: 30, height: 10 }], {}, ["abc"], false, measure)[0].quads[0];
  const m = quadToMark(up, (x, y) => [x, 200 - y]);
  assert.ok(m.w < 15 && m.h > 30, "text running upwards gives a tall, narrow box");
  assert.equal(termPattern("  ", false), null);
});

test("redact: boxes on one line are joined; settings files keep only well-formed areas", () => {
  const joined = mergeMarks([{ type: "redact", x: 10, y: 10, rotate: 0, w: 20, h: 10, term: "a" }, { type: "redact", x: 31, y: 11, rotate: 0, w: 20, h: 9, term: "a" }, { type: "redact", x: 10, y: 40, rotate: 0, w: 5, h: 5 }]);
  assert.equal(joined.length, 2); assert.deepEqual({ ...joined[0] }, { type: "redact", x: 10, y: 10, rotate: 0, w: 41, h: 10, term: "a" });
  assert.deepEqual(cleanM({ type: "redact", x: 1, y: 2, rotate: 0, w: 3, h: 4, term: "x" }, () => false), { type: "redact", x: 1, y: 2, rotate: 0, w: 3, h: 4, term: "x" });
  assert.equal(cleanM({ type: "redact", x: 1, y: 2, rotate: 90, w: 3, h: 4 }, () => false), null, "areas are never turned");
  assert.equal(cleanM({ type: "redact", x: 1, y: 2, rotate: 0, w: 0, h: 4 }, () => false), null);
});
test("redact: the looser search for warnings joins the words with any punctuation", async () => {
  const { variantPattern } = await import("./redact.ts");
  const v = variantPattern("Jane Doe")!;
  for (const t of ["jane.doe@example.com", "JANE_DOE", "Jane-Doe", "jane doe"]) { v.lastIndex = 0; assert.ok(v.test(t), t); }
  v.lastIndex = 0; assert.ok(!v.test("Janet Doe"));
});

test("build: a document's layer settings are copied with its pages, so hidden layers stay hidden (pages used twice too)", async () => {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), page = doc.addPage([300, 200]);
  page.drawText("Visible text", { x: 20, y: 150, size: 16, font });
  const ocg = doc.context.register(doc.context.obj({ Type: "OCG", Name: PDFString.of("Hidden notes") }));
  doc.catalog.set(PDFName.of("OCProperties"), doc.context.obj({ OCGs: [ocg], D: { OFF: [ocg], Order: [ocg] } }));
  page.node.Resources()!.set(PDFName.of("Properties"), doc.context.obj({ oc1: ocg }));
  const fontKey = (page.node.Resources()!.lookup(PDFName.of("Font")) as unknown as { keys(): PDFName[] }).keys()[0].asString();
  page.node.addContentStream(doc.context.register(doc.context.flateStream(`/OC /oc1 BDC BT ${fontKey} 16 Tf 20 100 Td (HIDDEN LAYER TEXT) Tj ET EMC`)));
  const bytes = await doc.save(), data = new Map([["a", { kind: "pdf" as const, bytes }]]);
  for (const pages of [[0], [0, 0]]) {
    const out = await PDFDocument.load(await makeBuilder(data, { imageDpi: 96 })(pages.map((i) => ({ src: "a", page: i, rotate: 0 as const, scale: 1 }))));
    const oc = out.catalog.lookup(PDFName.of("OCProperties")) as unknown as { lookup(n: PDFName): unknown };
    assert.ok(oc, "the settings are copied");
    const off = (oc.lookup(PDFName.of("D")) as unknown as { lookup(n: PDFName): { asArray(): unknown[] } }).lookup(PDFName.of("OFF")).asArray().map(String);
    for (const pg of out.getPages()) {
      const used = String((pg.node.Resources()!.lookup(PDFName.of("Properties")) as unknown as { get(n: PDFName): unknown }).get(PDFName.of("oc1")));
      assert.ok(off.includes(used), `page ${pages.length}: its layer is listed as hidden`);
    }
  }
});
test("redact: a found piece counts as covered when its middle is under an area; the looser search reports what it saw", async () => {
  const { covered, variantPattern } = await import("./redact.ts");
  const area = { type: "redact" as const, x: 0, y: 0, rotate: 0 as const, w: 50, h: 20 };
  assert.ok(covered({ ...area, x: 10, y: 5, w: 20, h: 10 }, [area]));
  assert.ok(!covered({ ...area, x: 45, y: 5, w: 20, h: 10 }, [area]), "middle outside");
  const items: TextItem[] = [{ str: "mail jane.doe@example.com now", transform: [10, 0, 0, 10, 0, 0], width: 145, height: 10 }];
  const f = findQuads(items, {}, ["Jane Doe"], false, (t) => t.length, 0.35, 0.12, variantPattern);
  assert.equal(f.length, 1); assert.equal(f[0].seen, "jane.doe");
  assert.equal(findQuads(items, {}, ["Jane Doe"], false, (t) => t.length).length, 0, "the exact search doesn't see it");
});

// ---------- PDF/A ----------
import { srgbProfile, srgbColorants, PCS_D50, CURVE_POINTS } from "./icc.ts";
import { markPdfA, xmpPacket, OUTPUT_CONDITION } from "./pdfa.ts";

test("icc: the sRGB profile has the ICC version 2.4 header, the nine tags of an RGB display profile, and sRGB's numbers", () => {
  const p = srgbProfile(), dv = new DataView(p.buffer, p.byteOffset, p.byteLength), sig = (o: number) => String.fromCharCode(...p.subarray(o, o + 4));
  assert.equal(dv.getUint32(0), p.length, "size");
  assert.equal(dv.getUint32(8), 0x02400000); assert.equal(sig(12), "mntr"); assert.equal(sig(16), "RGB "); assert.equal(sig(20), "XYZ "); assert.equal(sig(36), "acsp");
  const s15 = (o: number) => dv.getInt32(o) / 65536;
  assert.deepEqual([s15(68), s15(72), s15(76)].map((x) => Math.round(x * 1e4) / 1e4), PCS_D50, "PCS illuminant D50");
  const n = dv.getUint32(128), tags = new Map<string, [number, number]>();
  for (let i = 0; i < n; i++) { const o = 132 + i * 12; tags.set(sig(o), [dv.getUint32(o + 4), dv.getUint32(o + 8)]); }
  assert.deepEqual([...tags.keys()].sort(), ["bTRC", "bXYZ", "cprt", "desc", "gTRC", "gXYZ", "rTRC", "rXYZ", "wtpt"]);
  for (const [, [o, len]] of tags) { assert.equal(o % 4, 0, "tags start on 4-byte boundaries"); assert.ok(o + len <= p.length); }
  assert.deepEqual(tags.get("rTRC"), tags.get("gTRC"), "one curve shared by the three channels");
  const [co] = tags.get("rTRC")!; assert.equal(sig(co), "curv"); assert.equal(dv.getUint32(co + 8), CURVE_POINTS);
  const curve = Array.from({ length: CURVE_POINTS }, (_, i) => dv.getUint16(co + 12 + i * 2));
  assert.equal(curve[0], 0); assert.equal(curve.at(-1), 65535); assert.ok(curve.every((v, i) => i === 0 || v >= curve[i - 1]), "rising");
  assert.ok(Math.abs(curve[512] / 65535 - Math.pow((512 / 1023 + 0.055) / 1.055, 2.4)) < 1 / 65535, "the sRGB curve");
  // the three colorants add up to the adapted white: CSS Color 4's D50 (from its chromaticity, 0.3457, 0.3585)
  // exactly, and the ICC's rounded D50 (0.9642, 1, 0.8249) to within 3e-4 (Z: 0.82510 against 0.8249)
  const sum = [0, 1, 2].map((k) => srgbColorants().reduce((s, c) => s + c[k], 0)), cssD50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
  sum.forEach((v, k) => { assert.ok(Math.abs(v - cssD50[k]) < 1e-9, `white ${k}: ${v}`); assert.ok(Math.abs(v - PCS_D50[k]) < 3e-4); });
  for (const t of ["rXYZ", "gXYZ", "bXYZ"]) { const [o] = tags.get(t)!; assert.equal(sig(o), "XYZ "); }
  const [wo] = tags.get("wtpt")!; assert.deepEqual([s15(wo + 8), s15(wo + 12), s15(wo + 16)].map((x) => Math.round(x * 1e4) / 1e4), PCS_D50);
  assert.deepEqual(srgbProfile(), p, "the same bytes every time");
});

test("pdfa: a document is given XMP with the PDF/A-2b identification, the sRGB output intent, an identifier and a 1.7 header", async () => {
  const doc = await PDFDocument.create(); doc.addPage([100, 100]);
  const when = new Date(Date.UTC(2026, 10, 20, 7, 0, 0));
  markPdfA(doc, { title: "Notes & <plans>", author: "Ada", keywords: "a, b", producer: "Half Baked Tools", created: when, modified: when }, new Uint8Array(16).fill(171));
  const back = await PDFDocument.load(await doc.save(), { updateMetadata: false });
  assert.match(new TextDecoder().decode((await doc.save()).subarray(0, 9)), /^%PDF-1\.7/);
  const md = back.catalog.lookup(PDFName.of("Metadata")) as unknown as { dict: { get(n: PDFName): unknown }; getContents(): Uint8Array };
  assert.equal(String(md.dict.get(PDFName.of("Type"))), "/Metadata"); assert.equal(String(md.dict.get(PDFName.of("Subtype"))), "/XML");
  assert.equal(md.dict.get(PDFName.of("Filter")), undefined, "not compressed");
  const xmp = new TextDecoder().decode(md.getContents());
  assert.match(xmp, /<pdfaid:part>2<\/pdfaid:part>/); assert.match(xmp, /<pdfaid:conformance>B<\/pdfaid:conformance>/);
  assert.match(xmp, /<rdf:li xml:lang="x-default">Notes &amp; &lt;plans&gt;<\/rdf:li>/, "escaped");
  assert.match(xmp, /<xmp:CreateDate>2026-11-20T07:00:00Z<\/xmp:CreateDate>/);
  assert.match(xmp, /^<\?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"\?>/); assert.match(xmp, /<\?xpacket end="w"\?>$/);
  assert.equal(back.getTitle(), "Notes & <plans>"); assert.equal(back.getKeywords(), "a, b"); assert.equal(back.getProducer(), "Half Baked Tools");
  const oi = (back.catalog.lookup(PDFName.of("OutputIntents")) as unknown as { asArray(): unknown[] }).asArray();
  assert.equal(oi.length, 1);
  const intent = back.context.lookup(oi[0] as never) as unknown as { get(n: PDFName): unknown; lookup(n: PDFName): { dict: { get(n: PDFName): unknown } } };
  assert.equal(String(intent.get(PDFName.of("S"))), "/GTS_PDFA1"); assert.equal((intent.get(PDFName.of("OutputConditionIdentifier")) as PDFString).decodeText(), OUTPUT_CONDITION);
  assert.equal(String(intent.lookup(PDFName.of("DestOutputProfile")).dict.get(PDFName.of("N"))), "3");
  const id = back.context.trailerInfo.ID as unknown as { asArray(): { asString(): string }[] };
  assert.equal(id.asArray().length, 2); assert.equal(id.asArray()[0].asString(), "ab".repeat(16)); assert.equal(id.asArray()[1].asString(), "ab".repeat(16));
  assert.ok(!xmpPacket({ producer: "x", created: when, modified: when }).includes("dc:title"), "no empty title");
});

// ---------- PDF to PDF/A: reading content, fonts, whole-file checks, conversion ----------
import { tokens, scanDocument, OPERATORS } from "./pdfascan.ts";
import { type2Width, readCMap, splitCodes, standardName, unicodeOf, PREDEFINED_CMAPS } from "./pdfafonts.ts";
import { checkObjects, jpxProblems } from "./pdfachecks.ts";
import { convertToPdfA, replacementFor, type FontFiles } from "./pdfaconvert.ts";
import { PDFArray, PDFDict, PDFRef } from "@cantoo/pdf-lib";

const enc = (s: string) => new TextEncoder().encode(s);
test("pdfa scan: the lexer marks badly written hex strings, tells integers from reals and skips inline image data", () => {
  const t = [...tokens(enc("<41 4> <4G> 12 1.5 -3 /A#20B BI /W 1 /H 1 ID \x00\xff EI Tj"))];
  assert.deepEqual(t[0], { k: "str", v: Uint8Array.of(0x41, 0x40), bad: "odd" });
  assert.equal((t[1] as { bad?: string }).bad, "char");
  assert.deepEqual(t.slice(2, 5).map((x) => (x as { int: boolean }).int), [true, false, true]);
  assert.equal((t[5] as { v: string }).v, "A B");
  assert.equal(t[6].k, "inline"); assert.deepEqual(t[7], { k: "op", v: "Tj" });
  assert.equal(OPERATORS.size, 73, "ISO 32000-1 Annex A lists 73 operators");
});
test("pdfa scan: unknown operators, unknown rendering intents and missing resources are reported; borrowed resources noted", async () => {
  const doc = await PDFDocument.create(), page = doc.addPage([100, 100]);
  const form = doc.context.register(doc.context.flateStream(enc("0 0 1 1 re f"), { Type: "XObject", Subtype: "Form", BBox: [0, 0, 1, 1] }));
  page.node.set(PDFName.of("Resources"), doc.context.obj({ XObject: { F0: form } }));
  page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.flateStream(enc("/F0 Do /Odd ri 1 2 zz /X9 Do"))));
  const r = scanDocument(doc.context, [page.node as unknown as PDFDict]);
  assert.ok(r.problems.some((p) => p.includes("(zz)"))); assert.ok(r.problems.some((p) => p.includes("(Odd)"))); assert.ok(r.problems.some((p) => p.includes("X9")));
  assert.equal(r.borrowed.size, 1, "the form has no Resources of its own");
});
test("pdfa fonts: Type 2 charstring widths, CMaps split codes by their codespace, glyph names", () => {
  // 100 0 hmoveto: width 100 + nominalWidthX; endchar alone: defaultWidthX
  assert.equal(type2Width(Uint8Array.of(239, 139, 139, 22), [], [], 500, 0), 600);
  assert.equal(type2Width(Uint8Array.of(14), [], [], 500, 321), 321);
  assert.equal(type2Width(Uint8Array.of(139, 139, 5), [], [], 0, 0), undefined, "a drawing operator first: malformed");
  const cm = readCMap(enc("/WMode 0 def 2 begincodespacerange <00> <80> <8140> <9FFC> endcodespacerange 1 begincidrange <8140> <8142> 633 endcidrange 1 begincidchar <41> 34 endcidchar"));
  const codes = splitCodes(Uint8Array.of(0x41, 0x81, 0x41, 0x81, 0x42), cm)!;
  assert.deepEqual(codes.map((c) => [...c]), [[0x41], [0x81, 0x41], [0x81, 0x42]]);
  assert.deepEqual(codes.map((c) => cm.cid(c)), [34, 634, 635]); assert.equal(cm.wmode, 0); assert.equal(cm.maxCid, 635);
  assert.equal(splitCodes(Uint8Array.of(0xa0), cm), null, "outside every range");
  assert.equal(standardName(39), "quoteright"); assert.equal(standardName(96), "quoteleft"); assert.equal(standardName(65), "A"); assert.equal(standardName(200), undefined);
  assert.equal(unicodeOf("Euro"), 0x20ac); assert.equal(unicodeOf("uni0915"), 0x915); assert.equal(unicodeOf("u1F600"), 0x1f600); assert.equal(unicodeOf("madeup"), undefined);
  assert.ok(PREDEFINED_CMAPS.has("UniJIS-UCS2-H") && PREDEFINED_CMAPS.size === 61, "the 61 veraPDF lists");
});
test("pdfa checks: JPEG 2000 headers, odd hex strings completed, long names, differing spot colours", async () => {
  const box = (t: string, body: number[]) => { const n = 8 + body.length; return [n >> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255, ...enc(t), ...body]; };
  const ihdr = (nc: number, bpc: number) => box("ihdr", [0, 0, 0, 1, 0, 0, 0, 1, 0, nc, bpc, 7, 0, 0]);
  const jp2 = (...b: number[][]) => Uint8Array.from([...box("jP  ", [13, 10, 135, 10]), ...box("jp2h", b.flat())]);
  assert.deepEqual(jpxProblems(jp2(ihdr(3, 7), box("colr", [1, 0, 0, 0, 0, 0, 16]))), []);
  assert.equal(jpxProblems(jp2(ihdr(2, 7))).length, 1, "two channels");
  assert.ok(jpxProblems(jp2(ihdr(3, 7), box("colr", [4, 0, 0]))).some((p) => p.includes("6.2.8.3-3")));
  assert.ok(jpxProblems(jp2(ihdr(3, 7), box("colr", [1, 0, 0, 0, 0, 0, 19]))).some((p) => p.includes("CIEJab")));
  assert.ok(jpxProblems(jp2(ihdr(3, 7), box("colr", [1, 0, 0, 0, 0, 0, 16]), box("colr", [2, 0, 0]))).some((p) => p.includes("6.2.8.3-2")));
  const doc = await PDFDocument.create(), ctx = doc.context;
  const holder = ctx.obj({ A: PDFHexString.of("414") }); ctx.register(holder);
  assert.deepEqual(checkObjects(ctx), { problems: [], fixed: 1 });
  assert.equal((holder.get(PDFName.of("A")) as PDFHexString).asString(), "4140");
  ctx.register(ctx.obj({ ["N".repeat(128)]: 1 }));
  const fn = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0], C1: [1], N: 1 })), fn2 = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0], C1: [0.5], N: 1 }));
  ctx.register(ctx.obj(["Separation", "Gold", "DeviceGray", fn])); ctx.register(ctx.obj(["Separation", "Gold", "DeviceGray", fn2]));
  const p = checkObjects(ctx).problems;
  assert.ok(p.some((x) => x.includes("6.1.13-4"))); assert.ok(p.some((x) => x.includes("Gold") && x.includes("6.2.4.4-2")));
});

const fsFonts: FontFiles = async (fam, style, subset) => new Uint8Array(readFileSync(new URL(`../../../node_modules/@fontsource/${fam}/files/${fam}-${subset}-${style}.woff`, import.meta.url)));
test("pdfa convert: Helvetica used without embedding gets Arimo; scripts go; the result is marked PDF/A-2b", async () => {
  const doc = await PDFDocument.create(), page = doc.addPage([200, 100]);
  page.drawText("Hello, world - 1€", { font: await doc.embedFont(StandardFonts.Helvetica), size: 12, x: 10, y: 50 });
  doc.catalog.set(PDFName.of("OpenAction"), doc.context.obj({ S: "JavaScript", JS: PDFString.of("app.alert(1)") }));
  const r = await convertToPdfA(await doc.save(), undefined, fsFonts, new Date(Date.UTC(2026, 10, 20)));
  assert.deepEqual(r.blockers, []); assert.ok(r.bytes);
  assert.ok(r.changes.some((c) => c.startsWith("Embedded Arimo in place of Helvetica"))); assert.ok(r.changes.some((c) => c.includes("actions")));
  const back = await PDFDocument.load(r.bytes!, { updateMetadata: false });
  assert.equal(back.catalog.get(PDFName.of("OpenAction")), undefined);
  const font = back.getPages()[0].node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
  const f = back.context.lookup(font.values()[0]) as PDFDict, fd = f.lookup(PDFName.of("FontDescriptor"), PDFDict);
  assert.equal(String(f.get(PDFName.of("Subtype"))), "/TrueType"); assert.ok(fd.get(PDFName.of("FontFile2")) instanceof PDFRef);
  assert.match(new TextDecoder().decode(r.bytes!.subarray(0, 9)), /^%PDF-1\.7/);
  assert.equal(replacementFor("Times-BoldItalic")?.style, "700-italic"); assert.equal(replacementFor("ABCDEF+Arial,Bold")?.std, "Helvetica-Bold"); assert.equal(replacementFor("Futura"), null);
});
test("pdfa convert: a signed file is refused; resources inherited from the page tree are written on the page", async () => {
  const doc = await PDFDocument.create(); doc.addPage([100, 100]);
  const sig = doc.context.register(doc.context.obj({ FT: "Sig", T: PDFString.of("s"), V: doc.context.obj({ Type: "Sig" }) }));
  doc.catalog.set(PDFName.of("AcroForm"), doc.context.obj({ Fields: [sig] }));
  assert.ok((await convertToPdfA(await doc.save(), undefined, fsFonts)).blockers.some((b) => b.includes("signed")));
  const d2 = await PDFDocument.create(), pg = d2.addPage([100, 100]);
  d2.catalog.Pages().set(PDFName.of("Resources"), d2.context.obj({ ProcSet: ["PDF"] })); pg.node.delete(PDFName.of("Resources"));
  const r = await convertToPdfA(await d2.save(), undefined, fsFonts);
  const back = await PDFDocument.load(r.bytes!, { updateMetadata: false });
  assert.ok(back.getPages()[0].node.get(PDFName.of("Resources")) instanceof PDFRef);
  void PDFArray;
});

// ---------- PDF to Word, PowerPoint and Excel ----------
import { xmlText, isRtl as officeRtl, cellValue, toRows, toDocx, toXlsx, toPptx, type Placed } from "./office.ts";
import { unzipSync, strFromU8 } from "fflate";
test("office: XML text drops characters XML can't hold; plain numbers only become numbers; right-to-left detection", () => {
  assert.equal(xmlText("a<b & \u0001c\uD800"), "a&lt;b &amp; c");
  assert.deepEqual(["12", "-5.25", "−3", "0.5", "007", "1,234.50", "12%", "1e5", "1234567890123456"].map(cellValue), [12, -5.25, -3, 0.5, "007", "1,234.50", "12%", "1e5", "1234567890123456"]);
  assert.equal(officeRtl("שלום world"), true); assert.equal(officeRtl("Total: مرحبا"), false); assert.equal(officeRtl("25 دينار"), true);
});
test("office: toRows finds columns from gaps that run down the page, keeps phrases together, leaves a row for a big gap", () => {
  const w = (s: string) => s.length * 5;   // 10 pt text, about 5 pt a character
  const at = (str: string, x: number, y: number, right = false): Placed => ({ str, x: right ? x - w(str) : x, y, w: w(str), size: 10 });
  const items = [at("Sales by month", 60, 40),
    at("Month", 50, 60), at("Rent", 180, 60, true), at("Food", 260, 60, true),
    ...["January", "February", "March"].flatMap((m, k) => [at(m, 50, 74 + 14 * k), at("950", 180, 74 + 14 * k, true), at(["226.87", "1,352.75", "99"][k], 260, 74 + 14 * k, true)]),
    at("Figures are rounded and may not add up.", 50, 160)];
  const rows = toRows(items);
  assert.deepEqual(rows[1], ["Month", "Rent", "Food"]);
  assert.deepEqual(rows[2], ["January", 950, 226.87]); assert.deepEqual(rows[3], ["February", 950, "1,352.75"]);
  assert.deepEqual(rows[5], [], "a gap of more than two lines");
  assert.deepEqual(rows[6], ["Figures are rounded and may not add up."]);
  assert.equal(rows[0].filter(Boolean).length, 1, "the title stays one cell");
  // right-to-left words, read left to right, are put back in reading order
  // (seen: "25" at the left, "دينار" a space to its right; read right to left: "دينار 25")
  assert.deepEqual(toRows([at("دينار", 100, 50), at("25", 86, 50)]), [["دينار 25"]]);
});
test("office: Word, Excel and PowerPoint files have the parts Office needs", () => {
  const docx = unzipSync(toDocx([[{ kind: "h", level: 1, text: "Title" }, { kind: "p", text: "A & B" }], [{ kind: "li", text: "שלום" }]], "t", { width: 842, height: 595 }));
  for (const k of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/_rels/document.xml.rels"]) assert.ok(docx[k], k);
  const doc = strFromU8(docx["word/document.xml"]);
  assert.match(doc, /Heading1/); assert.match(doc, /A &amp; B/); assert.match(doc, /<w:pageBreakBefore\/><w:bidi\/>/); assert.match(doc, /w:orient="landscape"/);
  const xlsx = unzipSync(toXlsx([[["a", 1]], []], "t"));
  assert.match(strFromU8(xlsx["xl/worksheets/sheet1.xml"]), /<c r="A1" t="inlineStr"><is><t>a<\/t><\/is><\/c><c r="B1"><v>1<\/v><\/c>/);
  assert.match(strFromU8(xlsx["xl/workbook.xml"]), /name="Page 2"/);
  const pptx = unzipSync(toPptx([{ bytes: Uint8Array.of(1), png: false, width: 6000, height: 300 }], "t"));
  assert.ok(pptx["ppt/media/image1.jpeg"] && pptx["ppt/theme/theme1.xml"] && pptx["ppt/slides/slide1.xml"]);
  const size = strFromU8(pptx["ppt/presentation.xml"]).match(/<p:sldSz cx="(\d+)" cy="(\d+)"/)!;
  assert.equal(Number(size[1]), 4032 * 12700, "slides are at most 56 inches wide"); assert.equal(Number(size[2]), Math.round(300 * (4032 / 6000) * 12700));
});
test("structure: a bullet drawn larger than its text doesn't make the line a heading", () => {
  const lines = toLines([{ str: "•", x: 50, y: 700, size: 15 }, { str: " Costs fell.", x: 60, y: 700, size: 10, eol: true }, { str: "Body text here.", x: 50, y: 680, size: 10 }]);
  assert.deepEqual(toBlocks([lines])[0].map((b) => b.kind), ["li", "p"]);
});

// ---------- Compress PDF: to a size, detail as drawn, lossless tidying ----------
import { ladder, defaultTarget, fitToSize, drawnDpi, sizeAt } from "./compress-core.ts";
import { tidyStreams, mergeDuplicates, prune as pruneObjects } from "./tidy.ts";
import { PDFRawStream, decodePDFRawStream } from "@cantoo/pdf-lib";
test("compress to a size: the ladder, the size offered first, and detail as drawn", () => {
  assert.deepEqual(ladder(0), { dpi: 600, quality: 0.95 }); assert.deepEqual(ladder(1), { dpi: 50, quality: 0.25 }); assert.deepEqual(ladder(0.5), { dpi: 173, quality: 0.6 });
  assert.equal(defaultTarget(4_730_000), 2_300_000); assert.equal(defaultTarget(860_000), 430_000); assert.equal(defaultTarget(25_100_000), 12_000_000);
  assert.equal(defaultTarget(9_000), 10_000, "at least 10 kB"); assert.equal(defaultTarget(2_000_000), 1_000_000);
  // a 3000-pixel-wide picture drawn 2 inches wide has 1500 dots per inch; kept at 150 it becomes 300 pixels
  assert.equal(drawnDpi(3000, 1500, 144, 72), 1500); assert.deepEqual(sizeAt(3000, 1500, 1500, 150), { width: 300, height: 150, scale: 0.1 });
  assert.equal(drawnDpi(1000, 1000, 72, 144), 500, "squashed: the lower detail counts");
});
test("compress to a size: keeps the mildest result that fits, close under the limit", async () => {
  const sizeAtT = (t: number | "lossless") => (t === "lossless" ? 10_000_000 : Math.round(9_000_000 * Math.exp(-3 * t)));   // shrinks with strength
  const tried: (number | "lossless")[] = [];
  const r = await fitToSize(2_000_000, async (t) => { tried.push(t); return { size: sizeAtT(t), t }; });
  assert.ok(r.best && r.best.size <= 2_000_000 && r.best.size >= 1_900_000, `got ${r.best?.size}`);
  assert.deepEqual(tried.slice(0, 3), ["lossless", 1, 0]); assert.ok(r.tries <= 10);
  // already small enough without loss: one try
  assert.equal((await fitToSize(20_000_000, async (t) => ({ size: sizeAtT(t) }))).tries, 1);
  // can't be reached: no best, the smallest is reported
  const no = await fitToSize(100_000, async (t) => ({ size: sizeAtT(t) }));
  assert.equal(no.best, undefined); assert.equal(no.smallest.size, sizeAtT(1)); assert.equal(no.tries, 2);
});
test("compress: lossless tidying removes thumbnails, packs uncompressed streams, and leaves the look alone", async () => {
  const doc = await PDFDocument.create(), page = doc.addPage([100, 100]);
  const raw = doc.context.register(PDFRawStream.of(doc.context.obj({}), new TextEncoder().encode("0 0 m 100 100 l S\n".repeat(50))));
  page.node.set(PDFName.of("Contents"), raw); page.node.set(PDFName.of("Thumb"), raw);
  assert.deepEqual(tidyStreams(doc), { thumbnails: 1, streams: 1 });
  const s = doc.context.lookup(raw) as PDFRawStream;
  assert.equal(String(s.dict.get(PDFName.of("Filter"))), "/FlateDecode"); assert.ok(s.contents.length < 200);
  assert.equal(new TextDecoder().decode(decodePDFRawStream(s).decode()), "0 0 m 100 100 l S\n".repeat(50));
});
test("compress: pictures the browser can't decode go to the PDF reader when one is given; masks and black and white never", () => {
  const base: ImageInfo = { width: 1000, height: 1000, bits: 8, filters: ["DCTDecode"], colour: "other", hasMask: false, bytes: 100_000, predictor: 1, colours: 4 };
  assert.equal(canRecompress(base).ok, false, "no reader: CMYK is left alone");
  assert.deepEqual(canRecompress(base, true), { ok: true, kind: "reader" }, "CMYK JPEG");
  assert.deepEqual(canRecompress({ ...base, colour: "rgb", filters: ["JPXDecode"], bits: 0 }, true), { ok: true, kind: "reader" }, "JPEG 2000");
  assert.deepEqual(canRecompress({ ...base, filters: ["FlateDecode"], bits: 8, colours: 1 }, true), { ok: true, kind: "reader" }, "a palette");
  assert.deepEqual(canRecompress({ ...base, colour: "rgb", hasDecode: true }, true), { ok: true, kind: "reader" }, "remapped values");
  assert.deepEqual(canRecompress({ ...base, colour: "rgb", colours: 3 }, true), { ok: true, kind: "jpeg" }, "plain colour still goes direct");
  for (const bad of [{ hasMask: true }, { bits: 1, filters: ["FlateDecode"] }, { filters: ["JBIG2Decode"] }, { filters: ["CCITTFaxDecode"] }, { bits: 3, filters: ["FlateDecode"] }, { filters: ["Crypt"] }])
    assert.equal(canRecompress({ ...base, ...bad }, true).ok, false, JSON.stringify(bad));
});

test("compress: a picture stored twice with the same settings and bytes is stored once; a different one is kept", async () => {
  const doc = await PDFDocument.create(), ctx = doc.context, px = new Uint8Array(3000).map((_, i) => (i * 7) % 251);
  const img = () => ctx.register(ctx.flateStream(px, { Type: "XObject", Subtype: "Image", Width: 10, Height: 100, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }));
  const a = img(), b = img(), c = ctx.register(ctx.flateStream(px, { Type: "XObject", Subtype: "Image", Width: 10, Height: 100, ColorSpace: "DeviceGray", BitsPerComponent: 8 }));
  for (const r of [a, b, c]) doc.addPage([100, 100]).node.set(PDFName.of("Resources"), ctx.obj({ XObject: { Im: r } }));
  const saved = await PDFDocument.load(await doc.save({ useObjectStreams: false }));   // as read from a file: raw streams
  assert.equal(mergeDuplicates(saved), 1);
  const refs = saved.getPages().map((p) => String((p.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict)).get(PDFName.of("Im"))));
  assert.equal(refs[0], refs[1]); assert.notEqual(refs[0], refs[2]);
  assert.equal(pruneObjects(saved), 1, "the dropped copy is no longer reached");
});
test("compress to a size from a sample: corrects a biased estimate and lands just under the limit in a few full tries", async () => {
  const { fitBySample } = await import("./compress-core.ts");
  const fixed = 500_000, real = (t: number) => fixed + Math.round(30_000_000 * Math.exp(-4 * t));   // pictures shrink with strength
  const est = (t: number) => fixed + 30_000_000 * Math.exp(-4 * t) * 0.8;                              // the sample guesses 20% low
  let fulls = 0;
  const r = await fitBySample(3_000_000, fixed, async () => ({ size: 30_500_000 }), async (t) => { fulls++; return { size: real(t) }; }, async (t) => est(t));
  assert.ok(r.best && r.best.size <= 3_000_000 && r.best.size >= 0.93 * 3_000_000, `got ${r.best?.size}`);
  assert.ok(fulls <= 4 && r.tries === fulls + 1, `${fulls} full tries`);
  // a limit no strength reaches: the strongest is made, and nothing "fits"
  const no = await fitBySample(100_000, fixed, async () => ({ size: 30_500_000 }), async (t) => ({ size: real(t) }), async (t) => est(t));
  assert.equal(no.best, undefined); assert.equal(no.smallest.size, real(1));
});
