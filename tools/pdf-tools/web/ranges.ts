// Page-range text such as "1-3, 5, 8-" -> page indices. Pure; no DOM.
// Page numbers typed by visitors start at 1; the indices returned start at 0.

export type RangeResult = { ok: true; groups: number[][] } | { ok: false; error: string };

/**
 * Parses comma-separated groups. Each group is a page ("5"), a range ("2-6", or "6-2" for reverse order),
 * an open range ("8-" = page 8 to the end, "-3" = start to page 3). Returns one list of indices per group,
 * in the order written; pages may repeat.
 */
export function parseRanges(text: string, pageCount: number): RangeResult {
  const parts = text.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { ok: false, error: "Type some page numbers, for example 1-3, 5." };
  const groups: number[][] = [];
  for (const part of parts) {
    const m = /^(\d*)\s*(?:(-|–|to)\s*(\d*))?$/i.exec(part);
    if (!m || (m[1] === "" && (m[3] ?? "") === "")) return { ok: false, error: `"${part}" isn't a page number or range.` };
    const single = m[2] === undefined;
    const a = m[1] === "" ? 1 : Number(m[1]);
    const b = single ? a : m[3] === "" || m[3] === undefined ? pageCount : Number(m[3]);
    for (const n of [a, b]) {
      if (!Number.isInteger(n) || n < 1 || n > pageCount) {
        return { ok: false, error: `"${part}" is outside pages 1 to ${pageCount}.` };
      }
    }
    const g: number[] = [];
    if (a <= b) for (let i = a; i <= b; i++) g.push(i - 1);
    else for (let i = a; i >= b; i--) g.push(i - 1);
    groups.push(g);
  }
  return { ok: true, groups };
}

/** All the pages named, as one list. */
export function parsePageList(text: string, pageCount: number): { ok: true; pages: number[] } | { ok: false; error: string } {
  const r = parseRanges(text, pageCount);
  return r.ok ? { ok: true, pages: r.groups.flat() } : r;
}

/** Writes indices back as compact range text: [0,1,2,4] -> "1-3, 5". */
export function formatRanges(pages: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < pages.length; ) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    out.push(j > i ? `${pages[i] + 1}-${pages[j] + 1}` : `${pages[i] + 1}`);
    i = j + 1;
  }
  return out.join(", ");
}
