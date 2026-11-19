/**
 * Text file to PDF: plain text laid out in lines on pages. No styling: every character is drawn in one built-in
 * font, line breaks are kept, long lines are wrapped at spaces (or inside a word too long for the line).
 */
export type TextLayout = { width: number; height: number; margin: number; fontSize: number; lineGap: number; tab: number };
export const TEXT_DEFAULTS: TextLayout = { width: 595.28, height: 841.89, margin: 56.7, fontSize: 11, lineGap: 1.3, tab: 4 };
export const FONT_SIZE_MIN = 4, FONT_SIZE_MAX = 72;

/** Wraps each line of `text` to `maxWidth` (as measured by `measure`). Blank lines are kept. */
export function wrapText(text: string, measure: (s: string) => number, maxWidth: number, tab = 4): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").replace(/\t/g, " ".repeat(tab)).split("\n")) {
    // leading spaces are kept: they are often the layout
    let line = "";
    for (const piece of raw.split(/(?<= )/)) {
      if (measure((line + piece).trimEnd()) <= maxWidth) { line += piece; continue; }
      if (line) { out.push(line.trimEnd()); line = ""; }
      let rest = piece;
      while (measure(rest.trimEnd()) > maxWidth && rest.length > 1) {   // a single word longer than the line
        let n = rest.length - 1; while (n > 1 && measure(rest.slice(0, n)) > maxWidth) n--;
        out.push(rest.slice(0, n)); rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line.trimEnd());
  }
  while (out.length > 1 && out[out.length - 1] === "") out.pop();   // a final newline is not an extra blank line
  return out;
}

export const linesPerPage = (l: TextLayout): number => Math.max(1, Math.floor((l.height - 2 * l.margin) / (l.fontSize * l.lineGap)));
export function paginate(lines: string[], per: number): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per));
  return pages.length ? pages : [[]];
}
/** Characters (as code points) not in `has`, each listed once, ignoring line breaks. */
export function missingChars(text: string, has: Set<number>): { chars: string[]; count: number } {
  const seen = new Set<string>(); let count = 0;
  for (const ch of text) { const cp = ch.codePointAt(0)!; if (cp === 10 || cp === 13 || cp === 9 || has.has(cp)) continue; count++; seen.add(ch); }
  return { chars: [...seen], count };
}
/** `text` with every character not in `has` replaced by "?" (tabs and line breaks stay). */
export const replaceMissing = (text: string, has: Set<number>): string => [...text].map((ch) => { const cp = ch.codePointAt(0)!; return cp === 10 || cp === 13 || cp === 9 || has.has(cp) ? ch : "?"; }).join("");
