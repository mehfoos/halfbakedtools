import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, degrees } from "@cantoo/pdf-lib";
import { parseRanges, parsePageList, formatRanges } from "./ranges.ts";
import {
  emptySession, addSource, removeSource, nudge, moveTo, duplicate, remove, rotate, setScale, planFiles, safeName,
  serialise, parseSettings, FORMAT, type PageItem,
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
import { TASKS, WORKSPACE, ALL_TASKS, NOT_BUILT, taskBySlug } from "./tasks.ts";
import { existsSync, readFileSync } from "node:fs";
test("tasks: each has a page, a tool.json entry, a sensible default, and nothing overlaps the not-built list", () => {
  const dir = new URL("..", import.meta.url);
  const meta = JSON.parse(readFileSync(new URL("tool.json", dir), "utf8")) as { pages: { page: string; nav?: boolean }[] };
  assert.equal(new Set(ALL_TASKS.map((t) => t.slug)).size, ALL_TASKS.length);
  for (const t of ALL_TASKS) {
    assert.ok(existsSync(new URL(`pages/${t.slug}.astro`, dir)), `missing page for ${t.slug}`);
    assert.match(readFileSync(new URL(`pages/${t.slug}.astro`, dir), "utf8"), new RegExp(`<Task task="${t.slug}" />`));
    assert.equal(meta.pages.find((p) => p.page === t.slug)?.nav, false, `${t.slug} must be listed in tool.json with nav: false`);
    assert.ok(t.formats.length && t.action && t.pick && t.blurb);
    if (t.split) assert.ok(t.parts.includes("split"));
    if (t.which === "selected") assert.ok(t.parts.includes("select"), "a task that saves the selection must let pages be selected");
    assert.equal(taskBySlug(t.slug), t);
  }
  assert.ok(TASKS.every((t) => !NOT_BUILT.some((n) => n.name === t.name)));
  assert.deepEqual(WORKSPACE.formats.length, 7);
  for (const t of ALL_TASKS) if (t.perFile) assert.ok(t.parts.includes("compress") && t.formats.length === 1 && t.formats[0] === "pdf");
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
test("compress: only plain 8-bit colour or grey pictures are rewritten", () => {
  const base: ImageInfo = { width: 1000, height: 1000, bits: 8, filters: ["DCTDecode"], colour: "rgb", hasMask: false, bytes: 100_000, predictor: 1, colours: 3 };
  assert.deepEqual(canRecompress(base), { ok: true, kind: "jpeg" });
  assert.deepEqual(canRecompress({ ...base, filters: ["FlateDecode"], predictor: 15 }), { ok: true, kind: "flate" });
  assert.deepEqual(canRecompress({ ...base, filters: ["FlateDecode"], colour: "grey", colours: 1 }), { ok: true, kind: "flate" });
  for (const bad of [{ colour: "other" as const }, { bits: 1 }, { hasMask: true }, { filters: ["JPXDecode"] }, { filters: ["FlateDecode", "DCTDecode"] }, { filters: [] },
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
  assert.equal(saving(1000, 250), 75); assert.equal(saving(1000, 1000), 0); assert.equal(saving(1000, 1200), 0); assert.equal(saving(0, 0), 0);
  assert.ok(PRESETS.light.dpi > PRESETS.recommended.dpi && PRESETS.recommended.dpi > PRESETS.strong.dpi);
  assert.equal(NO_COMPRESSION.mode, "none");
});
test("settings: compression options are kept, and older files without them still load", () => {
  let s = addSource(emptySession(), { name: "a.pdf", size: 10, sha256: SHA("a"), pages: 1, kind: "pdf" }).session;
  s = { ...s, output: { ...s.output, compress: { mode: "images", dpi: 120, quality: 0.5, grey: true } } };
  assert.deepEqual(parseSettings(serialise(s)).output.compress, { mode: "images", dpi: 120, quality: 0.5, grey: true });
  const old = JSON.parse(serialise(s)); delete old.output.compress;
  assert.deepEqual(parseSettings(JSON.stringify(old)).output.compress, NO_COMPRESSION);
  old.output.compress = { mode: "explode", dpi: 5, quality: 9, grey: "yes" };
  assert.deepEqual(parseSettings(JSON.stringify(old)).output.compress, NO_COMPRESSION);
});
