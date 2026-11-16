// Turns the text pieces a PDF page reports into plain text. Pure; no DOM.
// A PDF stores positioned fragments, not paragraphs. The PDF reader library marks where a line ends;
// the order is the order in the file, which is usually, but not always, reading order.
export type TextPiece = { str: string; hasEOL?: boolean };

export function piecesToText(pieces: TextPiece[]): string {
  let out = "";
  for (const p of pieces) out += p.str + (p.hasEOL ? "\n" : "");
  return out.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Joins the pages' text, each under a "Page N" line, and counts pages with no text (likely scans). */
export function pagesToText(pages: string[]): { text: string; empty: number } {
  const empty = pages.filter((t) => !t).length;
  const text = pages.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join("\n\n") + "\n";
  return { text, empty };
}
