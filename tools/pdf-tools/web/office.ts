/**
 * PDF to Word, PowerPoint and Excel: writes Office Open XML files (.docx, .pptx, .xlsx), the format of ECMA-376,
 * with this site's own small writer (a zip of XML parts; fflate makes the zip). Pure: no DOM.
 *
 * What each holds, and why it is rough (a PDF stores positioned text and drawings, not documents, slides or tables):
 * - Word: the headings, paragraphs and bullet lists that PDF to Markdown guesses (structure.ts), a page break
 *   where each PDF page ends. No pictures, tables, columns, fonts, bold or italic.
 * - PowerPoint: one slide per page, the page as a picture filling the slide. It looks the same and can't be edited
 *   as text.
 * - Excel: one sheet per page; the page's text in rows and columns, guessed from where the words sit (rows from
 *   their baselines, columns from the gaps that run down the page). Only plain numbers (like 1234 or -5.25)
 *   become numbers; everything else, including 1,234 and 12%, stays text, because their meaning depends on the
 *   writer's conventions.
 */
import { zipSync, strToU8 } from "fflate";
import type { Block } from "./structure.ts";

// ---------- shared ----------
/** Text for XML: escaped, and without the characters XML 1.0 can't hold (most control characters, unpaired surrogates). */
export function xmlText(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const rels = (list: [id: string, type: string, target: string][]) =>
  `${XML}<Relationships xmlns="${RELS}">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type.startsWith("http") ? type : `${R}/${type}`}" Target="${target}"/>`).join("")}</Relationships>`;
const types = (defaults: [string, string][], overrides: [string, string][]) =>
  `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  defaults.map(([e, t]) => `<Default Extension="${e}" ContentType="${t}"/>`).join("") +
  overrides.map(([p, t]) => `<Override PartName="${p}" ContentType="${t}"/>`).join("") + "</Types>";
const CT = "application/vnd.openxmlformats-officedocument.";
const BASE_DEFAULTS: [string, string][] = [["rels", "application/vnd.openxmlformats-package.relationships+xml"], ["xml", "application/xml"]];
/** Document properties: title and the program that wrote it; no author or dates (none are known for the new file). */
const core = (title: string) => `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlText(title)}</dc:title></cp:coreProperties>`;
const app = () => `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Half Baked Tools PDF tools</Application></Properties>`;
const pack = (parts: Record<string, string | Uint8Array>) =>
  zipSync(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v])), { level: 6 });
const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
/** Right to left when the first letter is in a right-to-left script (the scripts ocr.ts lists). */
export const isRtl = (s: string) => { const m = s.match(/\p{L}/u); return !!m && RTL.test(m[0]); };

// ---------- Word ----------
/** A .docx from the guessed blocks of each page. `page` is the first page's size in points (for the Word page size). */
export function toDocx(pages: Block[][], title: string, page: { width: number; height: number }): Uint8Array {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const body: string[] = [];
  pages.forEach((blocks, i) => blocks.forEach((b, k) => {
    const rtl = isRtl(b.text), props: string[] = [];
    props.push(`<w:pStyle w:val="${b.kind === "h" ? `Heading${b.level}` : b.kind === "li" ? "ListBullet" : "Normal"}"/>`);
    if (i > 0 && k === 0) props.push("<w:pageBreakBefore/>");
    if (rtl) props.push("<w:bidi/>");
    body.push(`<w:p><w:pPr>${props.join("")}</w:pPr><w:r>${rtl ? "<w:rPr><w:rtl/></w:rPr>" : ""}<w:t xml:space="preserve">${xmlText(b.text)}</w:t></w:r></w:p>`);
  }));
  // Word's page size limits: 1 to 22 inches a side (in twentieths of a point)
  const tw = (pt: number) => Math.round(Math.min(Math.max(pt, 72), 1584) * 20);
  const w = tw(page.width), h = tw(page.height), margin = Math.min(1440, Math.round(Math.min(w, h) / 8));
  const document = `${XML}<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body.join("")}` +
    `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${w > h ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const heading = (n: 1 | 2 | 3, size: number) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="${360 - n * 60}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  const styles = `${XML}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    heading(1, 32) + heading(2, 28) + heading(3, 24) +
    `<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr><w:spacing w:after="60"/></w:pPr></w:style></w:styles>`;
  const numbering = `${XML}<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  return pack({
    "[Content_Types].xml": types(BASE_DEFAULTS, [["/word/document.xml", `${CT}wordprocessingml.document.main+xml`], ["/word/styles.xml", `${CT}wordprocessingml.styles+xml`], ["/word/numbering.xml", `${CT}wordprocessingml.numbering+xml`], ["/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"], ["/docProps/app.xml", `${CT}extended-properties+xml`]]),
    "_rels/.rels": rels([["rId1", "officeDocument", "word/document.xml"], ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"], ["rId3", "extended-properties", "docProps/app.xml"]]),
    "word/document.xml": document, "word/styles.xml": styles, "word/numbering.xml": numbering,
    "word/_rels/document.xml.rels": rels([["rId1", "styles", "styles.xml"], ["rId2", "numbering", "numbering.xml"]]),
    "docProps/core.xml": core(title), "docProps/app.xml": app(),
  });
}

// ---------- Excel ----------
/** A text piece with where it sits on the page as seen: x to the right and y (its baseline) downwards, in points. */
export type Placed = { str: string; x: number; y: number; w: number; size: number };
/** A cell value: plain numbers as numbers, everything else as text. */
export type Cell = string | number;
const PLAIN_NUMBER = /^[-\u2212]?(0|[1-9]\d{0,14})(\.\d{1,15})?$/;
export const cellValue = (s: string): Cell => (PLAIN_NUMBER.test(s) && s.replace(/[^\d]/g, "").length <= 15 ? Number(s.replace("\u2212", "-")) : s);

/**
 * A page's text as rows and columns. Pieces on the same baseline (within half their size) form a line, lines top to
 * bottom. Within a line, pieces further apart than a quarter of the text size (about a space) are separate words.
 * Column edges are gaps at least half the usual text size wide that run down the whole page between words, through
 * at least two lines with gaps; with four or more such lines, about one in seven may cross a gap (a heading over two
 * columns or over right-aligned numbers). Ordinary text has no such gaps, because its word spaces don't line up from
 * line to line. Words a normal space apart (up to 0.6 of the text size) stay together as one phrase, in the column
 * where it starts (one or two words over one edge: where their middle is, as with a heading over right-aligned
 * numbers); words between the same edges share a cell. Right-to-left text is put back in reading order. A vertical
 * gap of more than two lines leaves an empty row.
 */
export function toRows(items: Placed[]): Cell[][] {
  const pieces = items.filter((i) => i.str.trim() && i.size > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  // lines
  const lines: { y: number; size: number; items: Placed[] }[] = [];
  for (const it of pieces) {
    const l = lines.find((x) => Math.abs(x.y - it.y) <= Math.max(x.size, it.size) * 0.5);
    if (l) { l.items.push(it); l.size = Math.max(l.size, it.size); } else lines.push({ y: it.y, size: it.size, items: [it] });
  }
  lines.sort((a, b) => a.y - b.y);
  // cells
  type C = { text: string; x0: number; x1: number };
  const cellLines = lines.map((l) => {
    const groups: { parts: string[]; x0: number; x1: number }[] = [];
    for (const it of l.items.sort((a, b) => a.x - b.x)) {
      const last = groups[groups.length - 1], x1 = it.x + Math.max(it.w, 0);
      if (last && it.x - last.x1 <= l.size * 0.25) { if (it.x - last.x1 > l.size * 0.15) last.parts.push(" "); last.parts.push(it.str); last.x1 = Math.max(last.x1, x1); }
      else groups.push({ parts: [it.str], x0: it.x, x1 });
    }
    // pieces were read left to right; right-to-left text is put back in reading order
    const cells: C[] = groups.map((g) => ({ text: (isRtl(g.parts.join("")) ? [...g.parts].reverse() : g.parts).join("").replace(/\s+/g, " ").trim(), x0: g.x0, x1: g.x1 }));
    return { y: l.y, cells: cells.filter((c) => c.text) };
  });
  // column edges: x where few multi-cell lines have text
  const multi = cellLines.filter((l) => l.cells.length > 1);
  const edges: number[] = [];
  const sizes = pieces.map((p) => p.size).sort((a, b) => a - b), gapMin = Math.max(2, (sizes[sizes.length >> 1] ?? 10) * 0.5);
  if (multi.length >= 2) {
    const lo = Math.floor(Math.min(...multi.flatMap((l) => l.cells.map((c) => c.x0)))), hi = Math.ceil(Math.max(...multi.flatMap((l) => l.cells.map((c) => c.x1))));
    const cover = new Uint32Array(Math.max(1, hi - lo + 1)), allow = multi.length >= 4 ? Math.max(1, Math.floor(multi.length * 0.15)) : 0;
    for (const l of multi) for (const c of l.cells) for (let x = Math.max(lo, Math.floor(c.x0)); x < Math.min(hi, Math.ceil(c.x1)); x++) cover[x - lo]++;
    let run = -1;
    for (let k = 0; k <= cover.length; k++) {
      const open = k < cover.length && cover[k] <= allow;
      if (open && run < 0) run = k;
      if (!open && run >= 0) { if (k - run >= gapMin && run > 0 && k < cover.length) edges.push(lo + (run + k) / 2); run = -1; }
    }
  }
  const column = (x: number) => { let n = 0; while (n < edges.length && edges[n] < x) n++; return Math.min(n, 199); };
  // rows
  const rows: Cell[][] = [];
  let prev: { y: number; size: number } | undefined;
  cellLines.forEach((l, i) => {
    if (!l.cells.length) return;
    const size = lines[i].size;
    if (prev && l.y - prev.y > Math.max(size, prev.size) * 2.4) rows.push([]);
    // words a normal space apart stay together as a phrase, even across an edge (a sentence over a table's columns);
    // a phrase goes in the column of its middle, or of its start if it crosses an edge
    const phrases: { words: string[]; x0: number; x1: number }[] = [];
    for (const c of l.cells) { const last = phrases[phrases.length - 1]; if (last && c.x0 - last.x1 <= size * 0.6) { last.words.push(c.text); last.x1 = c.x1; } else phrases.push({ words: [c.text], x0: c.x0, x1: c.x1 }); }
    const row: string[] = [];
    for (const c of phrases) {
      // a short heading over one edge (often over right-aligned numbers) goes by its middle; a sentence by its start
      const a = column(c.x0), crossed = column(c.x1) - a, short = c.words.join(" ").split(" ").length <= 2;
      const col = crossed === 1 && short ? column((c.x0 + c.x1) / 2) : a;
      const text = (isRtl(c.words.join(" ")) ? [...c.words].reverse() : c.words).join(" ");   // right-to-left words were read left to right
      row[col] = row[col] ? `${row[col]} ${text}` : text;
    }
    rows.push(Array.from(row, (v) => (v === undefined ? "" : cellValue(v))));
    prev = { y: l.y, size };
  });
  return rows;
}

const colName = (n: number) => { let s = ""; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
/** A .xlsx with one sheet per page ("Page 1", "Page 2", ...). Column widths follow the longest text in each. */
export function toXlsx(sheets: Cell[][][], title: string): Uint8Array {
  const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const parts: Record<string, string> = {};
  sheets.forEach((rows, i) => {
    const widths: number[] = [];
    rows.forEach((r) => r.forEach((v, c) => { widths[c] = Math.max(widths[c] ?? 0, String(v).length); }));
    const cols = widths.length ? `<cols>${widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${Math.min(80, Math.max(8, Math.ceil((w ?? 0) * 1.1) + 2))}" customWidth="1"/>`).join("")}</cols>` : "";
    const data = rows.map((r, k) => {
      const cells = r.map((v, c) => v === "" ? "" : typeof v === "number" ? `<c r="${colName(c)}${k + 1}"><v>${v}</v></c>` : `<c r="${colName(c)}${k + 1}" t="inlineStr"><is><t>${xmlText(v.slice(0, 32767))}</t></is></c>`).join("");
      return cells ? `<row r="${k + 1}">${cells}</row>` : "";
    }).join("");
    parts[`xl/worksheets/sheet${i + 1}.xml`] = `${XML}<worksheet xmlns="${S}" xmlns:r="${R}">${cols}<sheetData>${data}</sheetData></worksheet>`;
  });
  const n = sheets.length;
  parts["xl/workbook.xml"] = `${XML}<workbook xmlns="${S}" xmlns:r="${R}"><sheets>${sheets.map((_, i) => `<sheet name="Page ${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  parts["xl/styles.xml"] = `${XML}<styleSheet xmlns="${S}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  parts["xl/_rels/workbook.xml.rels"] = rels([...sheets.map((_, i) => [`rId${i + 1}`, "worksheet", `worksheets/sheet${i + 1}.xml`] as [string, string, string]), [`rId${n + 1}`, "styles", "styles.xml"]]);
  parts["_rels/.rels"] = rels([["rId1", "officeDocument", "xl/workbook.xml"], ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"], ["rId3", "extended-properties", "docProps/app.xml"]]);
  parts["docProps/core.xml"] = core(title); parts["docProps/app.xml"] = app();
  parts["[Content_Types].xml"] = types(BASE_DEFAULTS, [["/xl/workbook.xml", `${CT}spreadsheetml.sheet.main+xml`], ["/xl/styles.xml", `${CT}spreadsheetml.styles+xml`],
    ...sheets.map((_, i) => [`/xl/worksheets/sheet${i + 1}.xml`, `${CT}spreadsheetml.worksheet+xml`] as [string, string]),
    ["/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"], ["/docProps/app.xml", `${CT}extended-properties+xml`]]);
  return pack(parts);
}

// ---------- PowerPoint ----------
const P = "http://schemas.openxmlformats.org/presentationml/2006/main", A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const EMU = 12700;   // per point
/** One slide per picture. The slide size is the first page's (scaled to PowerPoint's limits of 1 to 56 inches a side);
 *  each picture is fitted inside it, centred. */
export function toPptx(pictures: { bytes: Uint8Array; png: boolean; width: number; height: number }[], title: string): Uint8Array {
  const first = pictures[0] ?? { width: 720, height: 540 };
  let k = Math.min(1, 4032 / Math.max(first.width, first.height));
  if (Math.min(first.width, first.height) * k < 72) k = 72 / Math.min(first.width, first.height);
  const cx = Math.round(first.width * k * EMU), cy = Math.round(first.height * k * EMU);
  const parts: Record<string, string | Uint8Array> = {};
  pictures.forEach((p, i) => {
    const n = i + 1, f = Math.min(cx / (p.width * EMU), cy / (p.height * EMU)), w = Math.round(p.width * EMU * f), h = Math.round(p.height * EMU * f);
    const media = `image${n}.${p.png ? "png" : "jpeg"}`;
    parts[`ppt/media/${media}`] = p.bytes;
    parts[`ppt/slides/slide${n}.xml`] = `${XML}<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
      `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ${n}" descr="Page ${n} of the PDF"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round((cx - w) / 2)}" y="${Math.round((cy - h) / 2)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` +
      `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    parts[`ppt/slides/_rels/slide${n}.xml.rels`] = rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "image", `../media/${media}`]]);
  });
  const emptyTree = `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree>`;
  parts["ppt/slideMasters/slideMaster1.xml"] = `${XML}<p:sldMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${emptyTree}</p:cSld>` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
    `<p:txStyles>${["titleStyle", "bodyStyle", "otherStyle"].map((t, i) => `<p:${t}><a:lvl1pPr><a:defRPr sz="${i ? 1800 : 4400}"/></a:lvl1pPr></p:${t}>`).join("")}</p:txStyles></p:sldMaster>`;
  parts["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "theme", "../theme/theme1.xml"]]);
  parts["ppt/slideLayouts/slideLayout1.xml"] = `${XML}<p:sldLayout xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" type="blank" preserve="1"><p:cSld name="Blank">${emptyTree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  parts["ppt/slideLayouts/_rels/slideLayout1.xml.rels"] = rels([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]]);
  parts["ppt/theme/theme1.xml"] = THEME;
  const n = pictures.length;
  parts["ppt/presentation.xml"] = `${XML}<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${pictures.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  parts["ppt/_rels/presentation.xml.rels"] = rels([["rId1", "slideMaster", "slideMasters/slideMaster1.xml"], ...pictures.map((_, i) => [`rId${i + 2}`, "slide", `slides/slide${i + 1}.xml`] as [string, string, string]),
    [`rId${n + 2}`, "presProps", "presProps.xml"], [`rId${n + 3}`, "viewProps", "viewProps.xml"], [`rId${n + 4}`, "theme", "theme/theme1.xml"], [`rId${n + 5}`, "tableStyles", "tableStyles.xml"]]);
  parts["ppt/presProps.xml"] = `${XML}<p:presentationPr xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"/>`;
  parts["ppt/viewProps.xml"] = `${XML}<p:viewPr xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"/>`;
  parts["ppt/tableStyles.xml"] = `${XML}<a:tblStyleLst xmlns:a="${A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`;
  parts["_rels/.rels"] = rels([["rId1", "officeDocument", "ppt/presentation.xml"], ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"], ["rId3", "extended-properties", "docProps/app.xml"]]);
  parts["docProps/core.xml"] = core(title); parts["docProps/app.xml"] = app();
  parts["[Content_Types].xml"] = types([...BASE_DEFAULTS, ["png", "image/png"], ["jpeg", "image/jpeg"]], [
    ["/ppt/presentation.xml", `${CT}presentationml.presentation.main+xml`], ["/ppt/slideMasters/slideMaster1.xml", `${CT}presentationml.slideMaster+xml`],
    ["/ppt/slideLayouts/slideLayout1.xml", `${CT}presentationml.slideLayout+xml`], ["/ppt/theme/theme1.xml", `${CT}theme+xml`],
    ["/ppt/presProps.xml", `${CT}presentationml.presProps+xml`], ["/ppt/viewProps.xml", `${CT}presentationml.viewProps+xml`], ["/ppt/tableStyles.xml", `${CT}presentationml.tableStyles+xml`],
    ...pictures.map((_, i) => [`/ppt/slides/slide${i + 1}.xml`, `${CT}presentationml.slide+xml`] as [string, string]),
    ["/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"], ["/docProps/app.xml", `${CT}extended-properties+xml`]]);
  return pack(parts);
}

/** The smallest complete theme PowerPoint accepts: twelve colours, two font roles, three of each formatting style. */
const solid = (c: string) => `<a:solidFill><a:schemeClr val="${c}"/></a:solidFill>`;
const THEME = `${XML}<a:theme xmlns:a="${A}" name="Plain"><a:themeElements>` +
  `<a:clrScheme name="Plain"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2>` +
  ["1F4E79", "C55A11", "548235", "7030A0", "BF9000", "2E75B6"].map((c, i) => `<a:accent${i + 1}><a:srgbClr val="${c}"/></a:accent${i + 1}>`).join("") +
  `<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>` +
  `<a:fontScheme name="Plain"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
  `<a:fmtScheme name="Plain"><a:fillStyleLst>${solid("phClr").repeat(3)}</a:fillStyleLst>` +
  `<a:lnStyleLst>${[6350, 12700, 19050].map((w) => `<a:ln w="${w}">${solid("phClr")}</a:ln>`).join("")}</a:lnStyleLst>` +
  `<a:effectStyleLst>${"<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3)}</a:effectStyleLst>` +
  `<a:bgFillStyleLst>${solid("phClr").repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
