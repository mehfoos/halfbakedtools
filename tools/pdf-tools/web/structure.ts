/**
 * PDF to Markdown and HTML: a rough guess at headings, paragraphs and bullet lists from where text sits and how
 * big it is. A PDF stores positioned text, not structure, so this is a heuristic and the pages say so.
 * Not recovered: tables, columns (text is read in the file's own order), pictures, links, bold and italic.
 */
export type Item = { str: string; x: number; y: number; size: number; eol?: boolean };
export type Line = { text: string; y: number; size: number };
export type Block = { kind: "h"; level: 1 | 2 | 3; text: string } | { kind: "p"; text: string } | { kind: "li"; text: string };

const BULLET_ONLY = /^\s*[•◦▪▫●○■□‣⁃·]\s*$/;
/** Items (in file order) to lines: a new line starts at an end-of-line mark or when the baseline moves. */
export function toLines(items: Item[]): Line[] {
  const lines: Line[] = []; let cur: { parts: string[]; y: number; size: number } | null = null;
  const flush = () => { if (cur) { const text = cur.parts.join("").replace(/\s+/g, " ").trim(); if (text) lines.push({ text, y: cur.y, size: cur.size }); cur = null; } };
  for (const it of items) {
    if (cur && Math.abs(it.y - cur.y) > Math.max(it.size, cur.size) * 0.5) flush();
    if (!cur) cur = { parts: [], y: it.y, size: 0 };
    cur.parts.push(it.str); if (it.str.trim() && !BULLET_ONLY.test(it.str)) cur.size = Math.max(cur.size, it.size);   // a bullet is often drawn larger
    if (it.eol) flush();
  }
  flush(); return lines;
}

/** The size most of the text is set in (by number of characters), rounded to half a point. */
export function bodySize(pages: Line[][]): number {
  const tally = new Map<number, number>();
  for (const l of pages.flat()) { const k = Math.round(l.size * 2) / 2; tally.set(k, (tally.get(k) ?? 0) + l.text.length); }
  let best = 0, n = -1; for (const [k, v] of tally) if (v > n) { best = k; n = v; }
  return best;
}
const BULLET = /^([•◦▪▫●○■□‣⁃·–—*-]|\d{1,3}[.)])\s+(.*)$/;

/** Lines of every page to blocks. Heading sizes are the distinct sizes at least 15% above the body size, largest first (up to three). */
export function toBlocks(pages: Line[][]): Block[][] {
  const body = bodySize(pages);
  const big = [...new Set(pages.flat().filter((l) => l.size >= body * 1.15 && l.text.length <= 120).map((l) => Math.round(l.size * 2) / 2))].sort((a, b) => b - a);
  const level = (size: number): 1 | 2 | 3 | 0 => { const i = big.indexOf(Math.round(size * 2) / 2); return i < 0 ? 0 : (Math.min(i, 2) + 1) as 1 | 2 | 3; };
  return pages.map((lines) => {
    const out: Block[] = []; let prev: Line | null = null;
    for (const l of lines) {
      const lv = l.size >= body * 1.15 && l.text.length <= 120 ? level(l.size) : 0, bullet = BULLET.exec(l.text), last = out[out.length - 1];
      const gap = prev ? prev.y - l.y : Infinity, near = prev !== null && gap > 0 && gap <= Math.max(l.size, prev.size) * 1.7;
      if (lv) { if (last?.kind === "h" && near && last.level === lv) last.text += ` ${l.text}`; else out.push({ kind: "h", level: lv, text: l.text }); }
      else if (bullet && body && l.size <= body * 1.15) out.push({ kind: "li", text: bullet[2] });
      else if (last && (last.kind === "p" || last.kind === "li") && near) last.text += ` ${l.text}`;
      else out.push({ kind: "p", text: l.text });
      prev = l;
    }
    return out;
  });
}

const mdEscape = (s: string) => s.replace(/([\\`*_{}[\]<>#|])/g, "\\$1").replace(/^(\d+)\./, "$1\\.").replace(/^([-+])\s/, "\\$1 ");
export function toMarkdown(pages: Block[][]): string {
  const out: string[] = [];
  pages.forEach((blocks, i) => {
    out.push(`<!-- page ${i + 1} -->`);
    let inList = false;
    for (const b of blocks) {
      if (b.kind === "li") { out.push(`${inList ? "" : "\n"}- ${mdEscape(b.text)}`); inList = true; continue; }
      inList = false; out.push(""); out.push(b.kind === "h" ? `${"#".repeat(b.level)} ${mdEscape(b.text)}` : mdEscape(b.text));
    }
    out.push("");
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function toHtml(pages: Block[][], title: string): string {
  const out: string[] = [];
  pages.forEach((blocks, i) => {
    out.push(`<section data-page="${i + 1}">`);
    let list = false;
    for (const b of blocks) {
      if (b.kind === "li") { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${esc(b.text)}</li>`); continue; }
      if (list) { out.push("</ul>"); list = false; }
      out.push(b.kind === "h" ? `<h${b.level}>${esc(b.text)}</h${b.level}>` : `<p>${esc(b.text)}</p>`);
    }
    if (list) out.push("</ul>");
    out.push("</section>");
  });
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${esc(title)}</title>\n</head>\n<body>\n${out.join("\n")}\n</body>\n</html>\n`;
}
