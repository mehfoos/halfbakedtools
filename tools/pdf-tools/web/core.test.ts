import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, StandardFonts, degrees } from "@cantoo/pdf-lib";
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
  assert.ok(PRESETS.light.dpi > PRESETS.recommended.dpi && PRESETS.recommended.dpi > PRESETS.strong.dpi && PRESETS.strong.dpi > PRESETS.extreme.dpi);
  assert.ok(PRESETS.strong.quality > PRESETS.extreme.quality);
  assert.equal(PRESETS.extreme.mode, "images"); assert.equal(PRESETS.maximum.mode, "flatten", "only the level that says so turns pages into pictures");
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
  assert.deepEqual(textBox(T, FONT), { w: 20, h: 24, ascent: 7, lines: ["ab", "abcd"] });
  const p = placeText(T, FONT, BOX, 0);
  assert.equal(p.angle, 0);
  assert.deepEqual(p.lines, [{ text: "ab", x: 20, y: 300 - 37 }, { text: "abcd", x: 20, y: 300 - 49 }]);
  const r = placeText({ ...T, text: "ab" }, FONT, BOX, 90);          // page stored sideways: text must be turned to look upright
  assert.equal(r.angle, 90); near(r.lines[0].x, 37); near(r.lines[0].y, 20);
  const s = placeText({ ...T, text: "ab", rotate: 90 }, FONT, BOX, 0); // text turned clockwise on screen
  assert.equal(s.angle, -90); near(s.lines[0].x, 20 - 7); near(s.lines[0].y, 300 - 30);
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
import { unzlibSync } from "fflate";
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

// ---- OCR text layer ----
import { wordMatrix, isRtl, arrangeLine, ocrScale, addTextLayer, meanConfidence, OCR_MAX_PIXELS } from "./ocr.ts";
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
  assert.equal(checkEmbedding(0x2 | 0x8).ok, true, "older fonts with several bits: the least restrictive applies");
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
  assert.equal((ops.match(/> Tj/g) ?? []).length, 8, "one glyph per character, space included");
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
